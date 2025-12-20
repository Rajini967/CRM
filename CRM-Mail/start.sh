#!/bin/bash

# Start the backend server on port 3001 in the background
cd server
PORT=3001 node index.js &
BACKEND_PID=$!

# Give backend time to start
sleep 3

# Start the frontend on port 5000
cd ../client
PORT=5000 HOST=0.0.0.0 DANGEROUSLY_DISABLE_HOST_CHECK=true WDS_SOCKET_PORT=0 npm start &
FRONTEND_PID=$!

# Function to handle cleanup
cleanup() {
  echo "Stopping servers..."
  kill $BACKEND_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Wait for processes
wait
