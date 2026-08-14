$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$packageRoot = Join-Path $repoRoot 'apps\desktop\out\Fielora-win32-x64'
$artifactRoot = Join-Path $repoRoot 'artifacts\phase02'
$zipPath = Join-Path $artifactRoot 'Fielora-V0.1-Phase02-win-x64.zip'

if (-not (Test-Path -LiteralPath (Join-Path $packageRoot 'Fielora.exe'))) {
    throw 'Packaged Fielora.exe is missing. Run the package gate first.'
}
if (-not (Test-Path -LiteralPath (Join-Path $packageRoot 'resources\fielora-core.exe'))) {
    throw 'Packaged release Core is missing.'
}

New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $packageRoot '*') -DestinationPath $zipPath -CompressionLevel Optimal

$archive = Get-Item -LiteralPath $zipPath
$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Output "portable=$($archive.FullName)"
Write-Output "bytes=$($archive.Length)"
Write-Output "sha256=$hash"
