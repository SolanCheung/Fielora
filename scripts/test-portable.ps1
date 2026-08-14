$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$zipPath = Join-Path $repoRoot 'artifacts\phase02\Fielora-V0.1-Phase02-win-x64.zip'
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("fielora-portable-smoke-" + [guid]::NewGuid().ToString('N'))

if (-not (Test-Path -LiteralPath $zipPath)) {
    throw 'Portable ZIP is missing.'
}

New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
try {
    Expand-Archive -LiteralPath $zipPath -DestinationPath $testRoot -Force
    $portableApp = Join-Path $testRoot 'Fielora.exe'
    if (-not (Test-Path -LiteralPath $portableApp)) {
        throw 'Extracted Portable ZIP does not contain Fielora.exe at its root.'
    }
    $env:FIELORA_PACKAGED_APP = $portableApp
    node tests/e2e/phase02-desktop-e2e.mjs portable
    if ($LASTEXITCODE -ne 0) {
        throw "Portable E2E failed with exit code $LASTEXITCODE"
    }
}
finally {
    Remove-Item Env:FIELORA_PACKAGED_APP -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
