$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $repoRoot
$artifactRoot = Join-Path $repoRoot 'artifacts\phase04'
New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
Start-Transcript -LiteralPath (Join-Path $artifactRoot 'FULL_GATE.log') -Force | Out-Null
function Invoke-Gate([string]$name, [scriptblock]$command) { Write-Output "GATE_START $name"; & $command; if ($LASTEXITCODE -ne 0) { throw "$name failed with exit code $LASTEXITCODE" }; Write-Output "GATE_PASS $name" }
try {
    Invoke-Gate 'context-manifest' { pnpm audit:context }
    Invoke-Gate 'contracts' { pnpm contracts:verify-current }
    Invoke-Gate 'typecheck' { pnpm typecheck }
    Invoke-Gate 'lint' { pnpm lint }
    Invoke-Gate 'rust-fmt' { cargo fmt --all -- --check }
    Invoke-Gate 'ts-unit' { pnpm test:ts }
    Invoke-Gate 'rust-unit' { cargo test --workspace --offline }
    Invoke-Gate 'rust-clippy' { cargo clippy --workspace --all-targets --offline -- -D warnings }
    Invoke-Gate 'rust-release' { cargo build --release -p fielora-core --offline }
    Invoke-Gate 'core-integration' { pnpm test:integration }
    $env:FIELORA_E2E_EVIDENCE_DIR = $artifactRoot
    Invoke-Gate 'phase02-desktop-regression-dev' { pnpm test:e2e }
    Invoke-Gate 'phase03-browse-regression-dev' { pnpm test:e2e:browse }
    Invoke-Gate 'phase04-desktop-e2e-dev' { node tests/e2e/phase04-desktop-e2e.mjs dev }
    $electronZip = Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'electron\Cache') -Recurse -File -Filter 'electron-v43.4.0-win32-x64.zip' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($electronZip) { $env:FIELORA_ELECTRON_ZIP_DIR = $electronZip.Directory.FullName }
    Invoke-Gate 'package' { pnpm --filter '@fielora/desktop' package }
    Remove-Item Env:FIELORA_ELECTRON_ZIP_DIR -ErrorAction SilentlyContinue
    $env:FIELORA_PACKAGED_APP = Join-Path $repoRoot 'apps\desktop\out\Fielora-win32-x64\Fielora.exe'
    Invoke-Gate 'phase02-packaged-regression' { pnpm test:packaged }
    Invoke-Gate 'phase03-packaged-regression' { pnpm test:e2e:browse:packaged }
    Invoke-Gate 'phase04-packaged-e2e' { pnpm test:e2e:phase04:packaged }
    Remove-Item Env:FIELORA_PACKAGED_APP -ErrorAction SilentlyContinue
    Invoke-Gate 'portable-build' { pnpm make:portable:phase04 }
    Invoke-Gate 'portable-regression-and-phase04' { pnpm test:portable:phase04 }
    Write-Output 'PHASE04_ENGINEERING_GATE=PASS'
}
finally {
    Remove-Item Env:FIELORA_ELECTRON_ZIP_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:FIELORA_PACKAGED_APP -ErrorAction SilentlyContinue
    Remove-Item Env:FIELORA_E2E_EVIDENCE_DIR -ErrorAction SilentlyContinue
    Stop-Transcript | Out-Null
}
