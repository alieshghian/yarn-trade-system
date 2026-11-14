@echo off
setlocal
cd /d "%~dp0"
set ASPNETCORE_ENVIRONMENT=Development
set DOTNET_ROLL_FORWARD=Major
dotnet test tests/YarnTrade.Tests/YarnTrade.Tests.csproj --no-restore --filter FullyQualifiedName~FormDesignBackupTests -p:UseAppHost=false
if errorlevel 1 exit /b 1
dotnet run --project src/YarnTrade.Api --no-launch-profile --urls http://127.1.0.1:5223
