$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$runner = Join-Path $PSScriptRoot 'Run.ps1'
& $runner -Sample -NoBrowser
node Client/tests/acceptance-v2.mjs
if ($LASTEXITCODE -ne 0) { throw 'Sample acceptance tests failed.' }

& $runner -Sample -Stop
& $runner -Sample -NoBrowser
node Client/tests/acceptance-v2.mjs --restart
if ($LASTEXITCODE -ne 0) { throw 'Restart verification failed.' }
