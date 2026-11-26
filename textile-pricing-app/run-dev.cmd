@echo off
cd /d "%~dp0"
set ASPNETCORE_ENVIRONMENT=Development
"C:\Program Files\dotnet\dotnet.exe" "%~dp0bin\Debug\net8.0\TextilePricingApp.dll" --urls http://localhost:5087 > run.detached.log 2>&1
