import os
import cv2

# --- CONFIGURATION ---
# Change this to the folder where you extracted the Roboflow zip
INPUT_DIR = "raw_dataset2" 
OUTPUT_DIR = "cropped_dataset2"

# Map the YOLO class IDs to folder names. 
# Check the 'data.yaml' file in your downloaded zip to confirm which is 0 and 1.
CLASS_NAMES = {
    0: "With_Helmet",
    1: "Without_Helmet"
}

def process_split(split_name):
    print(f"🔄 Processing {split_name} split...")
    images_dir = os.path.join(INPUT_DIR, split_name, "images")
    labels_dir = os.path.join(INPUT_DIR, split_name, "labels")
    
    if not os.path.exists(images_dir):
        return

    # Create output directories
    for class_name in CLASS_NAMES.values():
        os.makedirs(os.path.join(OUTPUT_DIR, split_name, class_name), exist_ok=True)

    for img_name in os.listdir(images_dir):
        if not img_name.endswith(('.jpg', '.png', '.jpeg')):
            continue
            
        img_path = os.path.join(images_dir, img_name)
        label_path = os.path.join(labels_dir, img_name.rsplit('.', 1)[0] + '.txt')
        
        if not os.path.exists(label_path):
            continue

        img = cv2.imread(img_path)
        if img is None: continue
        img_h, img_w = img.shape[:2]

        with open(label_path, 'r') as f:
            lines = f.readlines()

        for idx, line in enumerate(lines):
            parts = line.strip().split()
            if len(parts) != 5: continue
            
            class_id = int(parts[0])
            if class_id not in CLASS_NAMES: continue

            # Convert YOLO normalized coordinates to pixel coordinates
            x_center, y_center, box_w, box_h = map(float, parts[1:])
            x1 = int((x_center - box_w / 2) * img_w)
            y1 = int((y_center - box_h / 2) * img_h)
            x2 = int((x_center + box_w / 2) * img_w)
            y2 = int((y_center + box_h / 2) * img_h)

            # Ensure coordinates are inside the image bounds
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(img_w, x2), min(img_h, y2)

            # Ignore tiny boxes
            if x2 - x1 < 10 or y2 - y1 < 10: continue

            # Crop the image
            # 1. Calculate original dimensions
            full_w = x2 - x1
            full_h = y2 - y1

            # 2. Increase the vertical region to 70% (instead of 50%)
            # This captures the head, neck, and upper chest/shoulders
            y2_extended = y1 + int(full_h * 0.70) 

            # 3. Add Horizontal Padding (15% of the width on each side)
            # This prevents the helmet from being cut off if the YOLO box was tight
            pad_w = int(full_w * 0.15)
            x1_padded = max(0, x1 - pad_w)
            x2_padded = min(img_w, x2 + pad_w)

            # 4. Final Safety Check
            y2_extended = min(img_h, y2_extended)
            if y2_extended <= y1: y2_extended = y1 + 10

            # 5. Apply the new crop
            crop_img = img[y1:y2_extended, x1_padded:x2_padded]
            
            # Save it to the proper folder
            class_folder = CLASS_NAMES[class_id]
            save_name = f"{img_name.rsplit('.', 1)[0]}_crop_{idx}.jpg"
            save_path = os.path.join(OUTPUT_DIR, split_name, class_folder, save_name)
            
            cv2.imwrite(save_path, crop_img)

# --- RUN SCRIPT ---
print("🚀 Starting Cropper...")
process_split("train")
process_split("valid")
process_split("test")
print("✅ Done! Your dataset is ready in the 'cropped_dataset' folder.")