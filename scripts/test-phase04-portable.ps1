$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$zipPath = Join-Path $repoRoot 'artifacts\phase04\Fielora-V0.1-Phase04-win-x64.zip'
$evidenceRoot = Join-Path $repoRoot 'artifacts\phase04'
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("fielora-phase04-portable-" + [guid]::NewGuid().ToString('N'))
if (-not (Test-Path -LiteralPath $zipPath)) { throw 'Phase 04 Portable ZIP is missing.' }
$resolvedTestRoot = [System.IO.Path]::GetFullPath($testRoot)
$resolvedTempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
if (-not $resolvedTestRoot.StartsWith($resolvedTempRoot, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Portable test root escaped the temp directory.' }
New-Item -ItemType Directory -Path $resolvedTestRoot -Force | Out-Null
try {
    Expand-Archive -LiteralPath $zipPath -DestinationPath $resolvedTestRoot -Force
    $portableApp = Join-Path $resolvedTestRoot 'Fielora.exe'
    if (-not (Test-Path -LiteralPath $portableApp)) { throw 'Portable ZIP does not contain Fielora.exe.' }
    $env:FIELORA_PACKAGED_APP = $portableApp
    $env:FIELORA_E2E_EVIDENCE_DIR = $evidenceRoot
    node tests/e2e/phase02-desktop-e2e.mjs portable
    if ($LASTEXITCODE -ne 0) { throw "Phase 02 portable regression failed: $LASTEXITCODE" }
    node tests/e2e/browse-slice01-e2e.mjs portable
    if ($LASTEXITCODE -ne 0) { throw "Phase 03 portable regression failed: $LASTEXITCODE" }
    node tests/e2e/phase04-desktop-e2e.mjs portable
    if ($LASTEXITCODE -ne 0) { throw "Phase 04 portable E2E failed: $LASTEXITCODE" }
}
finally {
    Remove-Item Env:FIELORA_PACKAGED_APP -ErrorAction SilentlyContinue
    Remove-Item Env:FIELORA_E2E_EVIDENCE_DIR -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $resolvedTestRoot) { Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force }
}
