@echo off
setlocal
cd /d "%~dp0"
cd /d "%~dp0frontend"
npm run dev -- --host 127.1.0.1 --strictPort
