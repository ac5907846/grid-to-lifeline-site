@echo off
rem Serve the companion site locally. A browser will not read the
rem data folder over file://, so the app needs a local server.
cd /d "%~dp0"
echo Serving the companion site at http://localhost:8000
echo Press Ctrl+C to stop.
start "" http://localhost:8000
py -3 -m http.server 8000
