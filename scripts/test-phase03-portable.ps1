$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$zipPath = Join-Path $repoRoot 'artifacts\phase03\Fielora-V0.1-Phase03-win-x64.zip'
$evidenceRoot = Join-Path $repoRoot 'artifacts\phase03'
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("fielora-phase03-portable-smoke-" + [guid]::NewGuid().ToString('N'))

if (-not (Test-Path -LiteralPath $zipPath)) {
    throw 'Phase 03 Portable ZIP is missing.'
}

New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
try {
    Expand-Archive -LiteralPath $zipPath -DestinationPath $testRoot -Force
    $portableApp = Join-Path $testRoot 'Fielora.exe'
    if (-not (Test-Path -LiteralPath $portableApp)) {
        throw 'Extracted Phase 03 Portable ZIP does not contain Fielora.exe at its root.'
    }
    $env:FIELORA_PACKAGED_APP = $portableApp
    $env:FIELORA_E2E_EVIDENCE_DIR = $evidenceRoot
    node tests/e2e/phase02-desktop-e2e.mjs portable
    if ($LASTEXITCODE -ne 0) { throw "Phase 02 Portable regression failed with exit code $LASTEXITCODE" }
    node tests/e2e/browse-slice01-e2e.mjs portable
    if ($LASTEXITCODE -ne 0) { throw "Phase 03 Browse Portable E2E failed with exit code $LASTEXITCODE" }
}
finally {
    Remove-Item Env:FIELORA_PACKAGED_APP -ErrorAction SilentlyContinue
    Remove-Item Env:FIELORA_E2E_EVIDENCE_DIR -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
