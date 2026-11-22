@echo off
setlocal
cd /d "%~dp0"
cd /d "%~dp0frontend"
node tools/approved-form-gate.mjs startup
if errorlevel 1 exit /b %errorlevel%
npm run dev -- --host 127.1.0.1 --strictPort
