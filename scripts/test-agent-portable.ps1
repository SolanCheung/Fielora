$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$artifactRoot = Join-Path $repoRoot 'artifacts\agent-v0.1'
$zipPath = Join-Path $artifactRoot 'Fielora-Complete-Agent-V0.1-win-x64.zip'
$temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$testRoot = Join-Path $temporaryRoot ("fielora-agent-portable-" + [guid]::NewGuid().ToString('N'))

if (-not (Test-Path -LiteralPath $zipPath)) {
    throw 'Complete Agent portable ZIP is missing.'
}

New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
try {
    Expand-Archive -LiteralPath $zipPath -DestinationPath $testRoot -Force
    $portableApp = Join-Path $testRoot 'Fielora.exe'
    if (-not (Test-Path -LiteralPath $portableApp)) {
        throw 'Extracted Portable ZIP does not contain Fielora.exe at its root.'
    }
    $env:FIELORA_PACKAGED_APP = $portableApp
    $env:FIELORA_E2E_EVIDENCE_DIR = $artifactRoot
    node tests/e2e/desktop-foundation-e2e.mjs portable
    if ($LASTEXITCODE -ne 0) {
        throw "Complete Agent Portable E2E failed with exit code $LASTEXITCODE"
    }
    node tests/e2e/browse-slice01-e2e.mjs portable
    if ($LASTEXITCODE -ne 0) {
        throw "Complete Agent Portable Browse E2E failed with exit code $LASTEXITCODE"
    }
}
finally {
    Remove-Item Env:FIELORA_PACKAGED_APP -ErrorAction SilentlyContinue
    Remove-Item Env:FIELORA_E2E_EVIDENCE_DIR -ErrorAction SilentlyContinue
    $resolvedTestRoot = [System.IO.Path]::GetFullPath($testRoot)
    if (-not $resolvedTestRoot.StartsWith($temporaryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove non-temporary portable test path: $resolvedTestRoot"
    }
    Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force -ErrorAction SilentlyContinue
}
