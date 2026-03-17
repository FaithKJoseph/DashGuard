# 🚦 DashGuard

DashGuard is an AI-powered traffic monitoring and violation detection system.

## 🚀 How to Run the System (Standard Mode)

To get everything running (Frontend + Backend), follow these simple steps:

### ⚡ Automatic Startup (Windows Only)
Double-click the **`START_DASHGUARD.bat`** script in this folder. It will launch two terminal windows—one for the AI Backend and one for the Frontend Dashboard.

### 🛠️ Manual Startup

#### 1. Start the Backend (AI & API)
```powershell
# In a new terminal
cd Backend
py pi_sentinel.py
```
This starts the Flask server on **port 5000** and initializes the AI analyzer and camera recorder.

#### 2. Start the Frontend (Dashboard)
```powershell
# In a second terminal
cd Frontend
npm run dev
```
This starts the development server on **port 5173**. Open your browser to [http://localhost:5173/](http://localhost:5173/).

---

## 🛠️ Components & Setup

### AI Backend (`/Backend`)
The backend handles real-time vehicle detection, lane violation analysis, helmet classification, and license plate OCR. It communicates with **Firebase** for logs and **Cloudinary** for storing evidence images.

- **Requirements**: `py -m pip install -r Backend/requirements.txt`
- **Key Files**: 
  - `pi_sentinel.py`: Main backend script
  - `dashguard_v3.pth`: Trained AI model weight

### Web Frontend (`/Frontend`)
A sleek, modern dashboard built with **React** and **Vite**, featuring a real-time incident feed, a map-based heatmap of violations, and a forensic video upload tool.

- **Requirements**: `npm install` (inside `/Frontend`)
- **Key Files**: 
  - `src/App.jsx`: Main UI logic
  - `vite.config.js`: Proxy configuration to route API calls to the backend.

---

## 💡 Troubleshooting
- **Frontend already running**: If `npm run dev` fails, press `Q` in the terminal or close the previous terminal to free up port 5173.
- **Backend disconnected**: Ensure your Python backend is active and that your webcam is connected for the "Live Camera" mode.
