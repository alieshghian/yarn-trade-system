[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ConfigPath,
    [switch]$ServicesOnly
)
$ErrorActionPreference = 'Stop'
$ConfigPath = (Resolve-Path -LiteralPath $ConfigPath).Path
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$startupDirectory = Split-Path -Parent $ConfigPath
$frontendRoot = (Resolve-Path -LiteralPath $config.FrontendRoot).Path
$apiRoot = (Resolve-Path -LiteralPath $config.ApiRoot).Path
$commit = [string]$config.Commit
$site = 'http://127.1.0.1:5173'
$api = 'http://127.1.0.1:5223'
$markerPath = Join-Path $frontendRoot 'frontend/public/global-trade-runtime.json'

function Get-LocalStatus([string]$Address) {
    try { Invoke-RestMethod -Uri $Address -TimeoutSec 3 -ErrorAction Stop }
    catch { $null }
}

function Test-Listening([int]$Port) {
    [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Start-LocalService([string]$Root, [string]$BatchFile, [string]$Name) {
    $prefix = Join-Path $startupDirectory ($Name + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
    Start-Process -FilePath $env:ComSpec -ArgumentList '/d', '/c', $BatchFile -WorkingDirectory $Root `
        -RedirectStandardOutput ($prefix + '.log') -RedirectStandardError ($prefix + '.error.log') `
        -WindowStyle Hidden -PassThru
}

function Wait-LocalService($Process, [string]$Address, [scriptblock]$Accept) {
    $stopwatch = [Diagnostics.Stopwatch]::StartNew()
    while ($stopwatch.Elapsed.TotalSeconds -lt 180) {
        $status = Get-LocalStatus $Address
        if ($status -and (& $Accept $status)) { return }
        if ($Process -and $Process.HasExited) { break }
        Start-Sleep -Seconds 1
    }
    throw "Global Trade service did not become ready at $Address. See the logs in $startupDirectory."
}

if ($commit -cnotmatch '^[0-9a-f]{40}$') { throw 'The startup configuration requires a full Git commit.' }
$head = & git -C $frontendRoot rev-parse --verify HEAD
if ($LASTEXITCODE -ne 0 -or $head -cne $commit) { throw "The verified frontend checkout must be at $commit." }
$changes = & git --no-optional-locks -C $frontendRoot status --porcelain --untracked-files=no
if ($LASTEXITCODE -ne 0 -or $changes) { throw 'The verified frontend checkout has tracked changes. Restore the reviewed checkout before launching.' }

$mutex = New-Object Threading.Mutex($false, 'Local\GlobalTradeVerifiedStartup')
$locked = $false
try {
    try { $locked = $mutex.WaitOne([TimeSpan]::FromMinutes(7)) }
    catch [Threading.AbandonedMutexException] { $locked = $true }
    if (!$locked) { throw 'Another Global Trade startup is still in progress.' }

    $identity = { param($value) $value.commit -ceq $commit -and $value.format -ceq 'global-trade.verified-runtime' }
    $frontendStatus = Get-LocalStatus "$site/global-trade-runtime.json"
    if ((Test-Listening 5173) -and (!$frontendStatus -or !(& $identity $frontendStatus))) {
        throw "Port 5173 is occupied by an unverified process. Stop that process before starting Global Trade."
    }

    $apiStatus = Get-LocalStatus "$api/health"
    if (!$apiStatus -or $apiStatus.status -ne 'healthy') {
        if (Test-Listening 5223) { throw 'Port 5223 is occupied by an unhealthy or unidentified service.' }
        $oldMigrate = $env:Database__AutoMigrate
        $oldSeed = $env:Seed__Enabled
        try {
            $env:Database__AutoMigrate = 'false'
            $env:Seed__Enabled = 'false'
            $apiProcess = Start-LocalService $apiRoot 'runapp1.bat' 'api'
        } finally {
            $env:Database__AutoMigrate = $oldMigrate
            $env:Seed__Enabled = $oldSeed
        }
        Wait-LocalService $apiProcess "$api/health" { param($value) $value.status -eq 'healthy' }
    }

    if (!$frontendStatus) {
        $existingMarker = if (Test-Path -LiteralPath $markerPath) {
            Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
        }
        if ($existingMarker -and !(& $identity $existingMarker)) { throw "Unexpected existing runtime marker at $markerPath." }
        @{format = 'global-trade.verified-runtime'; commit = $head} | ConvertTo-Json -Compress |
            Set-Content -LiteralPath $markerPath -Encoding ascii
        $frontendProcess = Start-LocalService $frontendRoot 'runapp2.bat' 'frontend'
        Wait-LocalService $frontendProcess "$site/global-trade-runtime.json" $identity
    }
    Wait-LocalService $null "$site/health" { param($value) $value.status -eq 'healthy' }
    Write-Output "Global Trade $head is ready at $site/."
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}

if (!$ServicesOnly) {
    Start-Process -FilePath $config.BrowserTarget -ArgumentList $config.BrowserArguments -WorkingDirectory $config.BrowserWorkingDirectory
}
