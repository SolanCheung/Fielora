$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $repoRoot
$artifactRoot = Join-Path $repoRoot 'artifacts\phase02'
New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
Start-Transcript -LiteralPath (Join-Path $artifactRoot 'FULL_GATE.log') -Force | Out-Null

function Invoke-Gate([string]$name, [scriptblock]$command) {
    Write-Output "GATE_START $name"
    & $command
    if ($LASTEXITCODE -ne 0) { throw "$name failed with exit code $LASTEXITCODE" }
    Write-Output "GATE_PASS $name"
}

try {
    Invoke-Gate 'contracts' { pnpm contracts:check }
    Invoke-Gate 'typecheck' { pnpm typecheck }
    Invoke-Gate 'lint' { pnpm lint }
    Invoke-Gate 'rust-fmt' { cargo fmt --all -- --check }
    Invoke-Gate 'ts-unit' { pnpm test:ts }
    Invoke-Gate 'rust-unit' { cargo test --workspace --offline }
    Invoke-Gate 'rust-clippy' { cargo clippy --workspace --all-targets --offline -- -D warnings }
    Invoke-Gate 'rust-release' { cargo build --release -p fielora-core --offline }
    Invoke-Gate 'integration' { pnpm test:integration }
    Invoke-Gate 'desktop-e2e' { pnpm test:e2e }
    $electronZip = Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'electron\Cache') -Recurse -File -Filter 'electron-v43.4.0-win32-x64.zip' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($electronZip) { $env:FIELORA_ELECTRON_ZIP_DIR = $electronZip.Directory.FullName }
    Invoke-Gate 'package' { pnpm --filter '@fielora/desktop' package }
    Remove-Item Env:FIELORA_ELECTRON_ZIP_DIR -ErrorAction SilentlyContinue
    Invoke-Gate 'packaged-smoke' { pnpm test:packaged }
    Invoke-Gate 'portable' { pnpm make:portable }
    Invoke-Gate 'portable-smoke' { pnpm test:portable }
    Write-Output 'PHASE02_ENGINEERING_GATE=PASS'
}
finally {
    Remove-Item Env:FIELORA_ELECTRON_ZIP_DIR -ErrorAction SilentlyContinue
    Stop-Transcript | Out-Null
}
