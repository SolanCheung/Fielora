$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $repoRoot

function Invoke-Gate([string]$name, [scriptblock]$command) {
    Write-Output "GATE_START $name"
    & $command
    if ($LASTEXITCODE -ne 0) {
        throw "$name failed with exit code $LASTEXITCODE"
    }
    Write-Output "GATE_PASS $name"
}

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
Invoke-Gate 'package' { pnpm --filter '@fielora/desktop' package }
Invoke-Gate 'packaged-smoke' { pnpm test:packaged }
Invoke-Gate 'portable' { pnpm make:portable }
Invoke-Gate 'portable-smoke' { pnpm test:portable }

Write-Output 'PHASE01_ENGINEERING_GATE=PASS'
