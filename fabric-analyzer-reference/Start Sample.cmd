@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Run.ps1" -Sample
if errorlevel 1 pause
