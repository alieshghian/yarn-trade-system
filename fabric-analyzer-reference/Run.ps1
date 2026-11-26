param([switch]$Sample, [switch]$Build, [switch]$SetupAdmin, [switch]$NoBrowser, [switch]$Stop)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$server = Join-Path $PSScriptRoot 'Server'
$client = Join-Path $PSScriptRoot 'Client'
$buildOutput = Join-Path $server 'bin/Debug/net10.0'
$dll = Join-Path $buildOutput 'FabricAnalyzer.dll'
$index = Join-Path $server 'wwwroot/index.html'
$run = Join-Path $PSScriptRoot '.run'
[void][IO.Directory]::CreateDirectory($run)
$port = if ($Sample) { 5089 } else { 5088 }
$label = if ($Sample) { 'sample' } else { 'operational' }
$url = "http://127.0.0.1:$port"
$pidPath = Join-Path $run "$label.pid"

function Stop-FabricAnalyzer {
    if (!(Test-Path -LiteralPath $pidPath)) { return }
    $serverId = [int](Get-Content -LiteralPath $pidPath)
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$serverId"
    if (!$owner) { return }
    if (!$owner.CommandLine -or !$owner.CommandLine.Contains($PSScriptRoot) -or
        $owner.CommandLine -notmatch "FabricAnalyzer[.]dll.*--FabricPort $port( |$)") {
        throw 'Cannot verify the Fabric Analyzer server process.'
    }
    Stop-Process -Id $serverId
    Wait-Process -Id $serverId -ErrorAction SilentlyContinue
}

if ($Stop) { Stop-FabricAnalyzer; return }

if ($Build -or !(Test-Path -LiteralPath $dll) -or !(Test-Path -LiteralPath $index)) {
    Push-Location -LiteralPath $client
    try {
        npm.cmd ci --prefer-offline --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    } finally { Pop-Location }
    dotnet restore "$server/FabricAnalyzer.csproj" --source "$env:USERPROFILE/.nuget/packages" -p:NuGetAudit=false
    if ($LASTEXITCODE -ne 0) { dotnet restore "$server/FabricAnalyzer.csproj" }
    if ($LASTEXITCODE -ne 0) { throw '.NET restore failed.' }
    dotnet build "$server/FabricAnalyzer.csproj" --no-restore
    if ($LASTEXITCODE -ne 0) { throw 'Backend build failed.' }
}

if ($SetupAdmin) {
    if ($Sample) { throw 'System administrator setup is for the operational database.' }
    $username = Read-Host 'Administrator username'
    $securePassword = Read-Host 'New password (12-200 characters)' -AsSecureString
    if ($securePassword.Length -lt 12 -or $securePassword.Length -gt 200) { throw 'Password must contain 12-200 characters.' }
    Push-Location -LiteralPath $server
    try {
        $credential = [PSCredential]::new($username, $securePassword)
        $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($credential.GetNetworkCredential().Password))
        @($username, $encoded) | dotnet $dll '--setup-admin'
        if ($LASTEXITCODE -ne 0) { throw 'Administrator setup failed.' }
    } finally { Pop-Location }
    return
}

function Test-FabricAnalyzer {
    try {
        $health = Invoke-RestMethod "$url/api/health" -TimeoutSec 3
        return ($null -ne $health.sample -and [bool]$health.sample -eq [bool]$Sample)
    } catch { return $false }
}

if ($Build -and (Test-FabricAnalyzer)) { Stop-FabricAnalyzer }

if (!(Test-FabricAnalyzer)) {
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
        throw "Port $port is occupied by another service."
    }
    $runtime = Join-Path $run "$label-runtime"
    [void][IO.Directory]::CreateDirectory($runtime)
    foreach ($file in Get-ChildItem -LiteralPath $buildOutput) {
        Copy-Item -LiteralPath $file.FullName -Destination $runtime -Recurse -Force
    }
    Copy-Item -LiteralPath (Join-Path $server 'wwwroot') -Destination $runtime -Recurse -Force
    $runtimeDll = Join-Path $runtime 'FabricAnalyzer.dll'
    $argsForServer = @('"' + $runtimeDll + '"', '--FabricPort', $port)
    if ($Sample) { $argsForServer += @('--Sample', 'true') }
    $process = Start-Process -FilePath 'dotnet' -ArgumentList $argsForServer -WorkingDirectory $runtime -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $run "$label.stdout.log") -RedirectStandardError (Join-Path $run "$label.stderr.log")
    Set-Content -LiteralPath $pidPath -Value $process.Id
    $started = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if (Test-FabricAnalyzer) { $started = $true; break }
        if ($process.HasExited) { break }
        Start-Sleep -Milliseconds 500
    }
    if (!$started) { throw "Fabric Analyzer did not start. See $run\$label.stderr.log and $label.stdout.log." }
}

Write-Host "Fabric Analyzer is running at $url"
if (!$NoBrowser) { Start-Process $url }
