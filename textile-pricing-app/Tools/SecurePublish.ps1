param(
    [string]$OutputPath = "",
    [string]$Runtime = "win-x64",
    [string]$IntegrityPrivateKeyPath = "C:\LicenseTools\Keys\textile-integrity-private.pem"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$projectPath = Join-Path $projectRoot "TextilePricingApp.csproj"
$signerProject = Join-Path $projectRoot "Tools\IntegritySigner\IntegritySigner.csproj"
$localDotnet = Join-Path $projectRoot ".dotnet\sdk8\dotnet.exe"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $projectRoot "release\TextilePricingApp-secure-$timestamp"
}
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$zipPath = "$OutputPath.zip"
$obfuscationWork = "$OutputPath-obfuscation"

if (-not (Test-Path -LiteralPath $localDotnet -PathType Leaf)) {
    throw "The local .NET 8 SDK was not found: $localDotnet"
}
if (-not (Test-Path -LiteralPath $IntegrityPrivateKeyPath -PathType Leaf)) {
    throw "The integrity private key was not found: $IntegrityPrivateKeyPath"
}
if (Test-Path -LiteralPath $OutputPath) {
    throw "The output directory already exists: $OutputPath"
}
if (Test-Path -LiteralPath $zipPath) {
    throw "The output archive already exists: $zipPath"
}
if (Test-Path -LiteralPath $obfuscationWork) {
    throw "The obfuscation work directory already exists: $obfuscationWork"
}

dotnet restore $projectPath -r $Runtime /p:NuGetAudit=false
if ($LASTEXITCODE -ne 0) { throw "Restore failed." }

dotnet publish $projectPath -c Release -r $Runtime --self-contained true --no-restore -o $OutputPath /p:LicenseFreeBuild=false
if ($LASTEXITCODE -ne 0) { throw "Release publish failed." }

$applicationDll = Join-Path $OutputPath "TextilePricingApp.dll"
$applicationExe = Join-Path $OutputPath "TextilePricingApp.exe"
if (-not (Test-Path -LiteralPath $applicationDll) -or -not (Test-Path -LiteralPath $applicationExe)) {
    throw "The published application files are incomplete."
}

New-Item -ItemType Directory -Path $obfuscationWork | Out-Null
$obfuscatedOutput = Join-Path $obfuscationWork "output"
$configPath = Join-Path $obfuscationWork "obfuscar.xml"
$mappingPath = Join-Path $obfuscatedOutput "Mapping.txt"

$xml = New-Object System.Xml.XmlDocument
$declaration = $xml.CreateXmlDeclaration("1.0", "utf-8", $null)
$xml.AppendChild($declaration) | Out-Null
$root = $xml.CreateElement("Obfuscator")
$xml.AppendChild($root) | Out-Null

function Add-Variable([string]$name, [string]$value) {
    $node = $xml.CreateElement("Var")
    $node.SetAttribute("name", $name)
    $node.SetAttribute("value", $value)
    $root.AppendChild($node) | Out-Null
}

Add-Variable "OutPath" $obfuscatedOutput
Add-Variable "KeepPublicApi" "false"
Add-Variable "HidePrivateApi" "true"
Add-Variable "HideStrings" "true"
Add-Variable "RenameProperties" "true"
Add-Variable "RenameEvents" "true"
Add-Variable "RenameFields" "true"
Add-Variable "OptimizeMethods" "true"
Add-Variable "SuppressIldasm" "true"
Add-Variable "ReuseNames" "true"

$searchPath = $xml.CreateElement("AssemblySearchPath")
$searchPath.SetAttribute("path", $OutputPath)
$root.AppendChild($searchPath) | Out-Null
$module = $xml.CreateElement("Module")
$module.SetAttribute("file", $applicationDll)
$root.AppendChild($module) | Out-Null
foreach ($namespace in @("TextilePricingApp.Pages*", "TextilePricingApp.Models*", "AspNetCoreGeneratedDocument*")) {
    $skip = $xml.CreateElement("SkipNamespace")
    $skip.SetAttribute("name", $namespace)
    $module.AppendChild($skip) | Out-Null
}
$xml.Save($configPath)

$beforeHash = (Get-FileHash -LiteralPath $applicationDll -Algorithm SHA256).Hash
& $localDotnet tool run obfuscar.console -- $configPath
if ($LASTEXITCODE -ne 0) { throw "Obfuscar failed." }

$obfuscatedDll = Join-Path $obfuscatedOutput "TextilePricingApp.dll"
if (-not (Test-Path -LiteralPath $obfuscatedDll -PathType Leaf)) {
    throw "Obfuscar did not produce the application DLL."
}
$afterHash = (Get-FileHash -LiteralPath $obfuscatedDll -Algorithm SHA256).Hash
if ($beforeHash -eq $afterHash) {
    throw "Obfuscation verification failed because the application DLL did not change."
}
if (-not (Test-Path -LiteralPath $mappingPath -PathType Leaf) -or (Get-Item $mappingPath).Length -eq 0) {
    throw "Obfuscation verification failed because the mapping file is missing."
}
Copy-Item -LiteralPath $obfuscatedDll -Destination $applicationDll -Force

Get-ChildItem -LiteralPath $OutputPath -Filter "*.pdb" -File -Recurse | Remove-Item -Force
if (Get-ChildItem -LiteralPath $OutputPath -Filter "*.pdb" -File -Recurse) {
    throw "PDB removal verification failed."
}

$settingsPath = Join-Path $OutputPath "appsettings.json"
$settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
$settings.Licensing.Enabled = $true
$settings.Integrity.Enabled = $true
$settings | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $settingsPath -Encoding UTF8

dotnet build $signerProject -c Release /p:NuGetAudit=false
if ($LASTEXITCODE -ne 0) { throw "Integrity signer build failed." }
$signerDll = Join-Path $projectRoot "Tools\IntegritySigner\bin\Release\net10.0\IntegritySigner.dll"
$manifestPath = Join-Path $OutputPath "integrity.manifest.json"
dotnet $signerDll sign --private $IntegrityPrivateKeyPath --root $OutputPath --output $manifestPath --files "TextilePricingApp.dll;TextilePricingApp.exe"
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $manifestPath)) {
    throw "Integrity manifest signing failed."
}

if (Get-ChildItem -LiteralPath $OutputPath -File -Recurse | Where-Object {
        $_.Name -match "IntegritySigner|LicenseIssuer" -or
        ($_.Extension -match "^\.(pem|key|pfx|snk)$" -and $_.BaseName -match "private")
    }) {
    throw "A private tool or key-like file was found in the customer package."
}

Compress-Archive -Path (Join-Path $OutputPath "*") -DestinationPath $zipPath -CompressionLevel Optimal
$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
Write-Output "OUTPUT=$OutputPath"
Write-Output "ZIP=$zipPath"
Write-Output "SHA256=$hash"
Write-Output "OBFUSCATOR=Obfuscar 2.2.50"
