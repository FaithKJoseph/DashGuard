@echo off
echo 🚀 Launching DashGuard System...

:: Start Backend in a new window
echo 🧠 Starting Backend (AI & API)...
start cmd /k "cd Backend && py pi_sentinel.py"

:: Start Frontend in a new window
echo 🎨 Starting Frontend (Dashboard)...
start cmd /k "cd Frontend && npm run dev"

echo.
echo ✅ System is booting up! 
echo 🌐 Dashboard will be available at: http://localhost:5173/
echo.
pause
