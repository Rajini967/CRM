@echo off
echo Starting CRM Application...
echo.

echo Starting Backend Server on port 3001...
start "Backend Server" cmd /k "cd server && set PORT=3001 && node index.js"

echo Waiting 5 seconds for backend to start...
timeout /t 5 /nobreak > nul

echo Starting Frontend on port 5000...
start "Frontend Client" cmd /k "cd client && set PORT=5000 && set HOST=0.0.0.0 && set DANGEROUSLY_DISABLE_HOST_CHECK=true && set WDS_SOCKET_PORT=0 && npm start"

echo.
echo Both servers are starting...
echo Backend: http://localhost:3001
echo Frontend: http://localhost:5000
echo.
echo Press any key to exit this window...
pause > nul
