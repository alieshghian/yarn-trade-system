@echo off
setlocal
cd /d "%~dp0"
set ASPNETCORE_ENVIRONMENT=Development
dotnet run --project src/YarnTrade.Api --no-launch-profile --urls http://localhost:5223
