import cv2
import time
import os
import threading
import queue
import torch
import datetime
import requests
import numpy as np
from ultralytics import YOLO
from torchvision import transforms, models
from PIL import Image
import firebase_admin
from firebase_admin import credentials, db
import cloudinary
import cloudinary.uploader
from google.cloud import vision
from collections import defaultdict
from flask import Flask, request, jsonify
from flask_cors import CORS
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv

# ==========================================
# ⚙️ SYSTEM CONFIGURATION
# ==========================================
load_dotenv()

app = Flask(__name__)
CORS(app)
CAMERA_ACTIVE = False
ACTIVE_USER_ID = None  # 🚀 Track which user activated the live camera

fps = 20
w, h = 640, 480
FRAGMENT_DURATION = 10
frames_per_fragment = FRAGMENT_DURATION * fps
TEMP_FOLDER = "temp_fragments"

if not os.path.exists(TEMP_FOLDER): os.makedirs(TEMP_FOLDER)
if not os.path.exists("evidence"): os.makedirs("evidence")

job_queue = queue.Queue()
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET")
)

if not firebase_admin._apps:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred, {
        'databaseURL': os.getenv("FIREBASE_DB_URL")
    })

os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = 'serviceAccountKey.json'
vision_client = vision.ImageAnnotatorClient()


# ==========================================
# 🛠️ HELPER CLASSES
# ==========================================
class RTCHandler:
    def __init__(self):
        print("🕒 RTC: Using Laptop System Time")
    def get_timestamp(self):
        return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

class GpsService:
    def __init__(self):
        self.data = {"latitude": 9.3160, "longitude": 76.6120, "speed_kmh": 0, "location_name": "Laptop Test Lab (Kerala)"}
    def start(self):
        print("🛰️ GPS: Fetching Location via IP...")
        try:
            response = requests.get('https://ipapi.co/json/').json()
            self.data["latitude"] = response.get("latitude", 9.3160)
            self.data["longitude"] = response.get("longitude", 76.6120)
            self.data["location_name"] = f"{response.get('city')}, {response.get('region')}"
            print(f"📍 Location Locked: {self.data['location_name']}")
        except:
            print("⚠️ GPS: API Unreachable, using default coordinates.")
    def get_data(self):
        return self.data

class LaneDetector:
    def detect_divider(self, frame):
        h, w = frame.shape[:2]
        roi_y = int(h * 0.4)
        roi = frame[roi_y:, :]

        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)
        edges = cv2.Canny(gray, 50, 150)

        mask = np.zeros_like(edges)
        polygon = np.array([[(int(w * 0.3), 0), (int(w * 0.7), 0), (int(w * 0.8), h - roi_y), (int(w * 0.2), h - roi_y)]], np.int32)
        cv2.fillPoly(mask, polygon, 255)
        edges = cv2.bitwise_and(edges, mask)

        min_len = int(h * 0.15)
        max_gap = int(h * 0.05)
        lines = cv2.HoughLinesP(edges, 1, np.pi/180, 30, minLineLength=min_len, maxLineGap=max_gap)

        best_line = None
        max_len = 0
        line_type = "broken"

        if lines is not None:
            for line in lines:
                x1, y1, x2, y2 = line[0]
                if x1 == x2: continue
                slope = (y2 - y1) / (x2 - x1)
                # 🚀 FIX 1: Tightened slope — filters zebra crossings and road shoulders
                if 0.5 < abs(slope) < 2.0:
                    length = np.sqrt((y2-y1)**2 + (x2-x1)**2)
                    if length > max_len:
                        max_len = length
                        best_line = [x1, y1 + roi_y, x2, y2 + roi_y]

            if max_len > (h * 0.15):
                line_type = "solid"

        # 🚀 FIX 3: Reject lines entirely in bottom 20% of frame (near-camera markings)
        if best_line is not None:
            if best_line[1] > int(h * 0.85) and best_line[3] > int(h * 0.85):
                best_line = None
                line_type = "broken"

        return best_line, line_type

    def check_crossing(self, vehicle_box, divider_line, line_type):
        if not divider_line or line_type != "solid":
            return False

        bx1, by1, bx2, by2 = map(int, vehicle_box)
        x1, y1, x2, y2 = divider_line
        if (y2-y1) == 0: return False

        line_x_bottom = x1 + (by2 - y1) * (x2 - x1) / (y2 - y1)
        line_x_top = x1 + (by1 - y1) * (x2 - x1) / (y2 - y1)

        car_w = bx2 - bx1
        # 🚀 FIX 2: Tightened buffer — must actually overlap the line
        buffer = car_w * 0.10

        crosses_bottom = (bx1 - buffer) < line_x_bottom < (bx2 + buffer)
        crosses_top = (bx1 - buffer) < line_x_top < (bx2 + buffer)

        return crosses_bottom or crosses_top

class FlowValidator:
    def __init__(self):
        self.prev_gray = None
    def get_motion_score(self, frame, bbox):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        if self.prev_gray is None:
            self.prev_gray = gray
            return 1.0
        flow = cv2.calcOpticalFlowFarneback(self.prev_gray, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0)
        self.prev_gray = gray
        x1, y1, x2, y2 = map(int, bbox)
        roi_flow = flow[y1:y2, x1:x2]
        if roi_flow.size == 0: return 0.0
        mag, _ = cv2.cartToPolar(roi_flow[..., 0], roi_flow[..., 1])
        return np.mean(mag)

class HelmetClassifier:
    def __init__(self, model_path):
        print(f"🪖 Loading MobileNetV3 Small on {DEVICE}...")
        self.model = models.mobilenet_v3_small(weights=None)
        num_features = self.model.classifier[3].in_features
        self.model.classifier[3] = torch.nn.Linear(num_features, 2)
        self.model.load_state_dict(torch.load(model_path, map_location=DEVICE))
        self.model.to(DEVICE).eval()
        self.transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])
        self.classes = ["With_Helmet", "Without_Helmet"]
        print("✅ Helmet Classifier Ready")

    def classify(self, cv2_image, threshold=0.80):
        pil_img = Image.fromarray(cv2.cvtColor(cv2_image, cv2.COLOR_BGR2RGB))
        inp = self.transform(pil_img).unsqueeze(0).to(DEVICE)
        with torch.no_grad():
            logits = self.model(inp)
            probs = torch.softmax(logits, dim=1)
            confidence = probs[0][1].item()
            if confidence < threshold:
                return "With_Helmet"
        return "Without_Helmet"

# --- INITIALIZE HANDLERS & MODELS ---
rtc = RTCHandler()
gps = GpsService()
gps.start()
lane_logic = LaneDetector()

print("🧠 DashGuard AI: Loading YOLOv8...")
yolo_model = YOLO('yolov8s.pt')
try:
    helmet_net = HelmetClassifier("dashguard_v3.pth")
except Exception as e:
    print(f"⚠️ DashGuard AI Error: Could not load helmet classifier - {e}")
    helmet_net = None


# ==========================================
# 🌐 FLASK API ROUTES
# ==========================================
@app.route('/api/toggle-camera', methods=['POST'])
def toggle_camera():
    global CAMERA_ACTIVE, ACTIVE_USER_ID
    data = request.json
    CAMERA_ACTIVE = data.get('active', False)
    # 🚀 Store which user activated the camera
    ACTIVE_USER_ID = data.get('userId', None)
    print(f"📷 Camera {'ON' if CAMERA_ACTIVE else 'OFF'} for user: {ACTIVE_USER_ID}")
    return jsonify({"status": "success", "camera_active": CAMERA_ACTIVE})

@app.route('/api/upload-video', methods=['POST'])
def upload_video():
    if 'video' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files['video']
    # 🚀 Get userId from form data
    user_id = request.form.get('userId', None)
    if not user_id:
        return jsonify({"error": "userId is required"}), 400

    temp_path = os.path.join(TEMP_FOLDER, f"upload_{int(time.time())}.mp4")
    file.save(temp_path)

    try:
        result = process_uploaded_video(temp_path, user_id)
        if os.path.exists(temp_path): os.remove(temp_path)
        if result: return jsonify(result)
        else: return jsonify({"error": "No major violations detected in the footage."}), 404
    except Exception as e:
        print(f"❌ Forensic Error: {e}")
        return jsonify({"error": str(e)}), 500


# ==========================================
# ⚙️ UTILITY FUNCTIONS
# ==========================================
def clean_plate_text(raw_text):
    return "".join(e for e in raw_text if e.isalnum()).upper()

def preprocess_for_ocr(crop):
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, None, fx=2.5, fy=2.5, interpolation=cv2.INTER_CUBIC)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh

def read_license_plate(image_path):
    try:
        with open(image_path, 'rb') as f: content = f.read()
        image = vision.Image(content=content)
        resp = vision_client.text_detection(image=image)
        if resp.text_annotations:
            full_text = resp.text_annotations[0].description
            confidences = [word.confidence for page in resp.full_text_annotation.pages for block in page.blocks for paragraph in block.paragraphs for word in paragraph.words]
            avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
            cleaned = clean_plate_text(full_text)
            if len(cleaned) >= 4: return cleaned, avg_conf
    except Exception as e: print(f"⚠️ OCR Error: {e}")
    return "Unknown", 0.0

def upload_evidence(image_path):
    try: return cloudinary.uploader.upload(image_path, folder="traffic_violations")['secure_url']
    except: return None

def update_firebase_async(data_packet):
    """🚀 Store violation under violations/{userId}/{violationId}"""
    try:
        user_id = data_packet.get('userId')
        if not user_id:
            print("⚠️ No userId — skipping Firebase push")
            return

        url = upload_evidence(data_packet['local_path'])
        if url:
            # 🚀 Push to per-user path
            ref = db.reference(f'violations/{user_id}')
            ref.push({
                "evidence_image_url": url,
                "license_plate": data_packet['plate'],
                "timestamp": data_packet['ts'],
                "violation": data_packet['type'],
                "location": data_packet['gps'].get('location_name', "Unknown"),
                "latitude": data_packet['gps'].get('latitude', 9.3160),
                "longitude": data_packet['gps'].get('longitude', 76.6120),
                "speed_kmh": data_packet['gps'].get('speed_kmh', 0),
                "source": "live",
                "userId": user_id
            })
            print(f"✅ Live Violation Logged for user {user_id}: {data_packet['type']}")
        if os.path.exists(data_packet['local_path']): os.remove(data_packet['local_path'])
    except Exception as e: print(f"❌ Async Firebase Error: {e}")


# ==========================================
# 📂 FORENSIC UPLOAD PROCESSOR
# ==========================================
def process_uploaded_video(video_path, user_id):
    cap = cv2.VideoCapture(video_path)
    print(f"🎬 Analyzing Forensic Footage for user {user_id}: {video_path}")

    h_orig = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    w_orig = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    scale = min(800.0 / w_orig, 800.0 / h_orig)
    fps_vid = cap.get(cv2.CAP_PROP_FPS)
    if fps_vid <= 0: fps_vid = 30

    helmet_frames_seen = 0
    triples_frames_seen = 0
    lane_frames_seen = 0
    frame_idx = 0
    violating_events = []

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        frame_idx += 1

        frame_ai = cv2.resize(frame, (int(w_orig * scale), int(h_orig * scale)))
        divider_line, line_type = lane_logic.detect_divider(frame_ai)

        results = yolo_model.predict(frame_ai, classes=[0, 1, 2, 3, 5, 7], verbose=False, conf=0.45, iou=0.35)

        if len(results[0].boxes) > 0:
            boxes = results[0].boxes.xyxy.cpu().numpy()
            class_ids = results[0].boxes.cls.int().cpu().tolist()

            all_vehicles = [(b, cid) for b, cid in zip(boxes, class_ids) if cid in [1, 2, 3, 5, 7]]
            persons = [b for b, cid in zip(boxes, class_ids) if cid == 0]

            temp_best_box = None
            max_violator_area_in_frame = 0
            current_frame_v_types = set()

            for vehicle_box, cid in all_vehicles:
                bx1, by1, bx2, by2 = map(int, vehicle_box)
                bike_area = (bx2 - bx1) * (by2 - by1)
                v_types_for_this_bike = set()

                vehicle_height = by2 - by1
                vehicle_center_x = (bx1 + bx2) / 2
                frame_w = frame_ai.shape[1]
                if (divider_line and vehicle_height > 80
                        and vehicle_center_x < frame_w * 0.55
                        and lane_logic.check_crossing(vehicle_box, divider_line, line_type)):
                    v_types_for_this_bike.add("Illegal Lane Change")

                if cid in [1, 3]:
                    riders_on_this_bike = 0
                    no_helmet_count = 0
                    comb_x1, comb_y1, comb_x2, comb_y2 = bx1, by1, bx2, by2

                    for p_box in persons:
                        px1, py1, px2, py2 = map(int, p_box)
                        person_area = (px2 - px1) * (py2 - py1)
                        ix1, iy1 = max(bx1, px1), max(by1, py1)
                        ix2, iy2 = min(bx2, px2), min(by2, py2)
                        inter_area = max(0, ix2 - ix1) * max(0, iy2 - iy1)
                        overlap_ratio = inter_area / person_area if person_area > 0 else 0
                        cx = (px1 + px2) / 2
                        is_centered = (bx1 < cx < bx2) and (py2 > by1)

                        if overlap_ratio > 0.25 or is_centered:
                            riders_on_this_bike += 1
                            comb_x1, comb_y1 = min(comb_x1, px1), min(comb_y1, py1)
                            comb_x2, comb_y2 = max(comb_x2, px2), max(comb_y2, py2)
                            ph = py2 - py1
                            pw = px2 - px1
                            if ph < 60 or pw < 30: continue
                            head_crop = frame_ai[py1:int(py1 + 0.40 * ph), px1:px2]
                            if head_crop.size > 0 and helmet_net:
                                if helmet_net.classify(head_crop) == "Without_Helmet":
                                    no_helmet_count += 1

                    if no_helmet_count > 0: v_types_for_this_bike.add("No Helmet")
                    if riders_on_this_bike >= 3: v_types_for_this_bike.add("Triple Riding")

                if len(v_types_for_this_bike) > 0:
                    current_frame_v_types.update(v_types_for_this_bike)
                    if bike_area > max_violator_area_in_frame:
                        max_violator_area_in_frame = bike_area
                        bx1, by1, bx2, by2 = map(int, vehicle_box)
                        temp_best_box = (bx1, by1, bx2, by2)

            if "No Helmet" in current_frame_v_types: helmet_frames_seen += 1
            if "Triple Riding" in current_frame_v_types: triples_frames_seen += 1
            if "Illegal Lane Change" in current_frame_v_types: lane_frames_seen += 1

            if frame_idx % 30 == 0:
                print(f"Frame {frame_idx} | Line: {divider_line is not None} ({line_type}) | "
                      f"Vehicles: {len(all_vehicles)} | Lane hits: {lane_frames_seen} | "
                      f"Helmet hits: {helmet_frames_seen} | Triple hits: {triples_frames_seen}")

            confirmed_types = set()
            if helmet_frames_seen >= 2: confirmed_types.add("No Helmet")
            if triples_frames_seen >= 2: confirmed_types.add("Triple Riding")
            if lane_frames_seen >= 3: confirmed_types.add("Illegal Lane Change")

            if len(confirmed_types) > 0 and temp_best_box is not None:
                violating_events.append({
                    'frame_idx': frame_idx,
                    'frame': frame.copy(),
                    'box': temp_best_box,
                    'area': max_violator_area_in_frame,
                    'v_types': confirmed_types,
                    'line': divider_line
                })

    cap.release()
    if not violating_events: return None

    violating_events.sort(key=lambda x: x['area'], reverse=True)
    selected_events = []
    min_frame_gap = int(fps_vid * 0.5)

    for ev in violating_events:
        is_distinct = all(abs(ev['frame_idx'] - sel['frame_idx']) >= min_frame_gap for sel in selected_events)
        if is_distinct: selected_events.append(ev)
        if len(selected_events) >= 4: break

    if len(selected_events) < 4:
        for ev in violating_events:
            if ev not in selected_events: selected_events.append(ev)
            if len(selected_events) >= 4: break

    final_plate = "Manual Review Required"
    max_plate_conf = 0.40
    final_v_types = set()
    ev_paths = []

    for i, ev in enumerate(selected_events):
        img = ev['frame']
        scale_inv = 1 / scale
        h_img, w_img = img.shape[:2]

        x1 = max(0, int(ev['box'][0] * scale_inv) - 20)
        y1 = max(0, int(ev['box'][1] * scale_inv) - 30)
        x2 = min(w_img, int(ev['box'][2] * scale_inv) + 20)
        y2 = min(h_img, int(ev['box'][3] * scale_inv) + 20)

        final_v_types.update(ev['v_types'])

        plate_crop = img[max(0, y1):min(h_img, y2), max(0, x1):min(w_img, x2)]
        if plate_crop.size > 0:
            processed_crop = preprocess_for_ocr(plate_crop)
            temp_ocr_path = f"temp_ocr_forensic_{i}_{int(time.time()*1000)}.jpg"
            cv2.imwrite(temp_ocr_path, processed_crop)
            res_text, res_conf = read_license_plate(temp_ocr_path)
            if res_conf > max_plate_conf and len(res_text) >= 6:
                final_plate = res_text
                max_plate_conf = res_conf
            try: os.remove(temp_ocr_path)
            except: pass

        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 0, 255), 5)
        if ev['line'] is not None:
            lx1, ly1, lx2, ly2 = map(int, ev['line'])
            cv2.line(img, (lx1, ly1), (lx2, ly2), (0, 0, 255), 3)
            cv2.putText(img, "SOLID: NO OVERTAKE", (lx1, ly1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

        ev_path = f"evidence/forensic_{int(time.time())}_{i}.jpg"
        cv2.imwrite(ev_path, img)
        ev_paths.append(ev_path)

    final_image_urls = [None] * len(ev_paths)
    with ThreadPoolExecutor(max_workers=4) as executor:
        future_to_idx = {executor.submit(upload_evidence, path): idx for idx, path in enumerate(ev_paths)}
        for future, idx in [(f, future_to_idx[f]) for f in future_to_idx]:
            result = future.result()
            final_image_urls[idx] = result if result else ev_paths[idx]

    for ev_path in ev_paths:
        try: os.remove(ev_path)
        except: pass

    return {
        "violation": " + ".join(list(final_v_types)),
        "evidence_images": final_image_urls,
        "license_plate": final_plate,
        "latitude": gps.get_data()["latitude"],
        "longitude": gps.get_data()["longitude"]
    }


# ==========================================
# 🎥 THREAD 1: LIVE RECORDER
# ==========================================
def recorder_thread():
    global CAMERA_ACTIVE
    cap = None
    while True:
        if not CAMERA_ACTIVE:
            if cap is not None: cap.release(); cap = None
            time.sleep(1)
            continue
        if cap is None:
            cap = cv2.VideoCapture(1)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, w)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)
            if not cap.isOpened():
                print("❌ Camera initialization failed. Retrying...")
                cap = None; time.sleep(2); continue

        fragment_ts = rtc.get_timestamp()
        ts_clean = fragment_ts.replace(":", "").replace(" ", "_").replace("-", "")
        filename = os.path.join(TEMP_FOLDER, f"fragment_{ts_clean}.mp4")
        out = cv2.VideoWriter(filename, cv2.VideoWriter_fourcc(*'mp4v'), fps, (w, h))
        count = 0
        while count < frames_per_fragment and CAMERA_ACTIVE:
            ret, frame = cap.read()
            if not ret: break
            out.write(frame); count += 1
        out.release()
        if count > 10:
            # 🚀 Pass ACTIVE_USER_ID with every fragment
            job_queue.put({"file": filename, "gps": gps.get_data(), "timestamp": fragment_ts, "userId": ACTIVE_USER_ID})
        else:
            try: os.remove(filename)
            except: pass


# ==========================================
# 🕵️ THREAD 2: LIVE ANALYZER
# ==========================================
def analyzer_thread():
    print("🧠 LIVE ANALYZER THREAD STARTING...")
    flow_tool = FlowValidator()
    VEHICLE_CLASSES = [2, 3, 5, 7]

    while True:
        packet = job_queue.get()
        if packet is None: break

        video_path = packet['file']
        recorded_gps = packet['gps']
        recorded_ts = packet['timestamp']
        recorded_user_id = packet.get('userId')  # 🚀 Per-fragment userId
        cap = cv2.VideoCapture(video_path)
        violation_data = {}
        violation_confidence = defaultdict(lambda: {"helmet": 0, "lane": 0, "triples": 0, "frames": 0})

        while True:
            ret, frame_hd = cap.read()
            if not ret: break

            frame_ai = cv2.resize(frame_hd, (640, 480))
            divider_line, line_type = lane_logic.detect_divider(frame_ai)

            if divider_line is not None:
                lx1, ly1, lx2, ly2 = map(int, divider_line)
                lane_color = (0, 0, 255) if line_type == "solid" else (0, 255, 0)
                lane_label = "SOLID: NO OVERTAKE" if line_type == "solid" else "BROKEN: SAFE"
                cv2.line(frame_ai, (lx1, ly1), (lx2, ly2), lane_color, 4)
                cv2.putText(frame_ai, lane_label, (lx1 - 20, ly1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, lane_color, 2)

            results = yolo_model.track(frame_ai, persist=True, verbose=False, conf=0.5, iou=0.45)

            if results[0].boxes.id is not None:
                boxes = results[0].boxes.xyxy.cpu().numpy()
                track_ids = results[0].boxes.id.int().cpu().tolist()
                class_ids = results[0].boxes.cls.int().cpu().tolist()

                for bbox, tid, cid in zip(boxes, track_ids, class_ids):
                    x1, y1, x2, y2 = map(int, bbox)
                    color = (0, 255, 255) if cid == 0 else (255, 0, 0) if cid in VEHICLE_CLASSES else (0, 255, 0)
                    label = f"P:{tid}" if cid == 0 else f"V:{tid}" if cid in VEHICLE_CLASSES else f"ID:{tid}"
                    if tid in violation_data and violation_data[tid]['detected']:
                        color, label = (0, 0, 255), f"ALERT:{violation_data[tid]['type']}"
                    cv2.rectangle(frame_ai, (x1, y1), (x2, y2), color, 2)
                    cv2.putText(frame_ai, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

                vehicles = [(b, tid, cid) for b, tid, cid in zip(boxes, track_ids, class_ids) if cid in VEHICLE_CLASSES]
                persons = [{'xyxy': b, 'tid': tid} for b, tid, cid in zip(boxes, track_ids, class_ids) if cid == 0]

                for (bbox, v_id, v_class) in vehicles:
                    motion = flow_tool.get_motion_score(frame_ai, bbox)
                    if motion < 0.5: continue

                    if v_id not in violation_data:
                        violation_data[v_id] = {'best_frame': {'size': 0, 'img': None}, 'type': "None", 'detected': False, 'ocr_candidates': []}

                    violation_confidence[v_id]["frames"] += 1
                    active_violations = []

                    bx1, by1, bx2, by2 = map(int, bbox)
                    vehicle_height = by2 - by1
                    vehicle_center_x = (bx1 + bx2) / 2
                    if (divider_line and vehicle_height > 80
                            and vehicle_center_x < 640 * 0.55
                            and lane_logic.check_crossing(bbox, divider_line, line_type)):
                        violation_confidence[v_id]["lane"] += 1

                    if v_class == 3:
                        riders_on_this_bike = 0
                        for p in persons:
                            px1, py1, px2, py2 = map(int, p['xyxy'])
                            if (bx1 - 50) < ((px1 + px2) // 2) < (bx2 + 50) and (by1 - 50) < py1 < by2:
                                riders_on_this_bike += 1
                                ph = py2 - py1
                                pw = px2 - px1
                                if ph < 60 or pw < 30: continue
                                head = frame_ai[py1:int(py1 + 0.40 * ph), px1:px2]
                                if head.size > 100 and helmet_net and helmet_net.classify(head) == "Without_Helmet":
                                    violation_confidence[v_id]["helmet"] += 1
                        if riders_on_this_bike >= 3:
                            violation_confidence[v_id]["triples"] += 1

                    if violation_confidence[v_id]["helmet"] > 15: active_violations.append("No Helmet")
                    if violation_confidence[v_id]["lane"] > 60: active_violations.append("Illegal Lane Change")
                    if violation_confidence[v_id]["triples"] > 10: active_violations.append("Triple Riding")

                    if active_violations:
                        v_type = " + ".join(list(set(active_violations)))
                        violation_data[v_id].update({'detected': True, 'type': v_type})
                        h_hd, w_hd = frame_hd.shape[:2]
                        scale_x, scale_y = w_hd / 640, h_hd / 480
                        hd_box = [int(bbox[0]*scale_x), int(bbox[1]*scale_y), int(bbox[2]*scale_x), int(bbox[3]*scale_y)]
                        if (hd_box[3] - hd_box[1]) > violation_data[v_id]['best_frame']['size']:
                            violation_data[v_id]['best_frame'] = {'size': hd_box[3]-hd_box[1], 'img': frame_hd.copy()}
                            plate_crop = frame_hd[hd_box[1]:hd_box[3], hd_box[0]:hd_box[2]]
                            violation_data[v_id]['ocr_candidates'].append((hd_box[3]-hd_box[1], plate_crop))

            cv2.imshow("DashGuard Live Feed", frame_ai)
            if cv2.waitKey(1) & 0xFF == ord('q'): break

        cap.release()

        for vid, data in violation_data.items():
            if data['detected'] and data['best_frame']['img'] is not None:
                final_plate = "Manual Review Required"
                max_conf = 0
                for _, crop in sorted(data['ocr_candidates'], key=lambda x: x[0], reverse=True)[:3]:
                    processed_crop = preprocess_for_ocr(crop)
                    ocr_path = f"temp_ocr_{vid}_{int(time.time()*1000)}.jpg"
                    cv2.imwrite(ocr_path, processed_crop)
                    res_text, res_conf = read_license_plate(ocr_path)
                    try: os.remove(ocr_path)
                    except: pass
                    if res_conf > 0.50 and len(res_text) >= 6:
                        if res_conf > max_conf:
                            final_plate = res_text
                            max_conf = res_conf

                packet_to_send = {
                    'local_path': f"evidence/v_{vid}_{int(time.time())}.jpg",
                    'plate': final_plate,
                    'ts': recorded_ts,
                    'type': data['type'],
                    'gps': recorded_gps,
                    'userId': recorded_user_id  # 🚀 Pass userId to Firebase writer
                }
                cv2.imwrite(packet_to_send['local_path'], data['best_frame']['img'])
                threading.Thread(target=update_firebase_async, args=(packet_to_send,), daemon=True).start()

        try: os.remove(video_path)
        except: pass


# ==========================================
# 🏁 EXECUTION
# ==========================================
if __name__ == "__main__":
    threading.Thread(target=recorder_thread, daemon=True).start()
    threading.Thread(target=analyzer_thread, daemon=True).start()
    print("\n🚀 DashGuard Backend is ONLINE.")
    print("Waiting for signals from React Frontend...")
    try:
        app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
    except KeyboardInterrupt:
        print("\n⏳ Finishing background uploads... Please wait.")
        time.sleep(5)
        print("🛑 Shutdown.")