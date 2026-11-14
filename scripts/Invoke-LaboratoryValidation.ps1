param([switch]$Force, [switch]$FingerprintOnly)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskFrontend = Join-Path $taskRoot 'frontend'
$taskArtifacts = Join-Path $taskRoot 'artifacts/shared-laboratory-validation'
New-Item -ItemType Directory -Path $taskArtifacts -Force | Out-Null
$taskLock = $null
try {
    # FileShare.None also releases the lock after a killed process; no stale lock cleanup.
    $taskLock = [IO.File]::Open((Join-Path $taskArtifacts 'validation.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
} catch { throw 'Laboratory validation is already running. Wait for that run instead of starting another.' }
function Get-ValidationFingerprint {
    $taskFiles = @(
        Get-ChildItem -LiteralPath (Join-Path $taskFrontend 'src'), (Join-Path $taskFrontend 'tests') -Recurse -File
        Get-ChildItem -LiteralPath $taskFrontend -File | Where-Object { $_.Name -match '^(package.*\.json|tsconfig.*\.json|vite\.config\..*|.*\.html)$' }
        Get-Item -LiteralPath $PSCommandPath
    ) | Sort-Object FullName -Unique
    $taskLines = foreach ($taskFile in $taskFiles) {
        $taskRelative = [IO.Path]::GetRelativePath($taskRoot, $taskFile.FullName).Replace('\', '/')
        $taskRelative + ':' + (Get-FileHash -LiteralPath $taskFile.FullName -Algorithm SHA256).Hash
    }
    $taskBrowser = @($env:FORM_TEST_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe') | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
    if (!$taskBrowser) { throw 'A supported browser is required; validation cannot be skipped.' }
    $taskLines += 'browser:' + $taskBrowser + ':' + (Get-Item -LiteralPath $taskBrowser).VersionInfo.FileVersion
    $taskBytes = [Text.Encoding]::UTF8.GetBytes(($taskLines -join "`n"))
    $taskHasher = [Security.Cryptography.SHA256]::Create()
    try { return [Convert]::ToHexString($taskHasher.ComputeHash($taskBytes)).ToLowerInvariant() }
    finally { $taskHasher.Dispose() }
}
try {
    $taskFingerprint = Get-ValidationFingerprint
    if ($FingerprintOnly) { Write-Output $taskFingerprint; exit 0 }
    $taskNode = (& node --version | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Node is unavailable.' }
    $taskResultPath = Join-Path $taskArtifacts 'result.json'
    if (!$Force -and (Test-Path -LiteralPath $taskResultPath)) {
        $taskPrior = Get-Content -LiteralPath $taskResultPath -Raw | ConvertFrom-Json
        $taskLogPath = Join-Path $taskArtifacts $taskPrior.log
        if ($taskPrior.status -eq 'PASS' -and $taskPrior.fingerprint -eq $taskFingerprint -and
            $taskPrior.node -eq $taskNode -and (Test-Path -LiteralPath $taskLogPath) -and
            (Get-FileHash -LiteralPath $taskLogPath -Algorithm SHA256).Hash -eq $taskPrior.logSha256) {
            Write-Output "PASS: unchanged Laboratory validation; evidence: $taskResultPath"
            exit 0
        }
    }
    $taskLogName = 'validation-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff') + '.log'
    $taskResult = [ordered]@{ version=1; status='RUNNING'; fingerprint=$taskFingerprint; node=$taskNode; command='npm run validate:form-designer'; log=$taskLogName; startedAt=[DateTime]::UtcNow.ToString('o') }
    $taskResult | ConvertTo-Json | Set-Content -LiteralPath $taskResultPath -Encoding utf8
    Push-Location $taskFrontend
    try { & npm.cmd run validate:form-designer *> (Join-Path $taskArtifacts $taskLogName); $taskExit = $LASTEXITCODE }
    finally { Pop-Location }
    $taskResult.finishedAt = [DateTime]::UtcNow.ToString('o')
    $taskResult.exitCode = $taskExit
    $taskResult.logSha256 = (Get-FileHash -LiteralPath (Join-Path $taskArtifacts $taskLogName) -Algorithm SHA256).Hash
    $taskResult.status = if ($taskExit -eq 0 -and (Get-ValidationFingerprint) -eq $taskFingerprint) { 'PASS' } else { 'FAIL' }
    $taskResult | ConvertTo-Json | Set-Content -LiteralPath $taskResultPath -Encoding utf8
    if ($taskResult.status -ne 'PASS') { throw "Validation failed or source changed during the run. See $taskResultPath" }
    Write-Output "PASS: $taskResultPath"
} finally { if ($taskLock) { $taskLock.Dispose() } }
