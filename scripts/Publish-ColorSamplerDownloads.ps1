$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$project = Join-Path $repoRoot 'desktop/YarnTrade.ColorSampler/YarnTrade.ColorSampler.csproj'
$downloads = Join-Path $repoRoot 'frontend/public/downloads'
$buildRoot = Join-Path $repoRoot 'work/color-sampler-publish'
$publishProperties = @(
    '-p:PublishSingleFile=true',
    '-p:IncludeNativeLibrariesForSelfExtract=true',
    '-p:IncludeAllContentForSelfExtract=true',
    '-p:EnableCompressionInSingleFile=true'
)

foreach ($runtime in @('win-x64', 'win-x86')) {
    $output = Join-Path $buildRoot $runtime
    $downloadFolder = Join-Path $downloads $runtime
    New-Item -ItemType Directory -Force -Path $output, $downloadFolder | Out-Null
    & dotnet publish $project -c Release -r $runtime --self-contained true @publishProperties -o $output
    if ($LASTEXITCODE -ne 0) { throw "Could not publish Windows sampler for $runtime." }

    $sourceExecutable = Join-Path $output 'YarnTrade.ColorSampler.exe'
    if (-not (Test-Path -LiteralPath $sourceExecutable)) { throw "The $runtime publish did not produce its executable." }
    Copy-Item -LiteralPath $sourceExecutable -Destination (Join-Path $downloadFolder 'YarnTrade.ColorSampler.exe') -Force
}

Write-Host "Portable Windows sampler downloads are ready under $downloads"
