$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$packageRoot = Join-Path $repoRoot 'apps\desktop\out\Fielora-win32-x64'
$artifactRoot = Join-Path $repoRoot 'artifacts\agent-v0.1'
$zipPath = Join-Path $artifactRoot 'Fielora-Complete-Agent-V0.1-win-x64.zip'

if (-not (Test-Path -LiteralPath (Join-Path $packageRoot 'Fielora.exe'))) {
    throw 'Packaged Fielora.exe is missing. Run pnpm build first.'
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
$stream = [System.IO.File]::OpenRead($zipPath)
try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hash = ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $sha256.Dispose()
    }
}
finally {
    $stream.Dispose()
}
Write-Output "portable=$($archive.FullName)"
Write-Output "bytes=$($archive.Length)"
Write-Output "sha256=$hash"
