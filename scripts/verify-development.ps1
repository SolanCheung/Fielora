[CmdletBinding()]
param(
    [ValidateSet('Docs', 'Ui', 'Core', 'Cross', 'PreMerge')]
    [string]$Lane = 'PreMerge'
)

$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $repoRoot

function Invoke-Gate([string]$Name, [scriptblock]$Command) {
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    Write-Output "GATE_START $Name"
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE"
    }
    $timer.Stop()
    Write-Output "GATE_PASS $Name duration_ms=$($timer.ElapsedMilliseconds)"
}

function Invoke-DocsGate {
    Invoke-Gate 'context-manifest' { pnpm audit:context }
}

function Invoke-UiGate {
    Invoke-Gate 'typecheck' { pnpm typecheck }
    Invoke-Gate 'lint' { pnpm lint }
    Invoke-Gate 'ts-unit' { pnpm test:ts }
}

function Invoke-CoreGate {
    Invoke-Gate 'rust-fmt' { cargo fmt --all -- --check }
    Invoke-Gate 'rust-unit' { cargo test --workspace --offline }
    Invoke-Gate 'rust-clippy' { cargo clippy --workspace --all-targets --offline -- -D warnings }
}

Write-Output "DEVELOPMENT_GATE_START lane=$Lane"

switch ($Lane) {
    'Docs' {
        Invoke-DocsGate
    }
    'Ui' {
        Invoke-UiGate
    }
    'Core' {
        Invoke-CoreGate
    }
    'Cross' {
        Invoke-DocsGate
        Invoke-Gate 'contracts' { pnpm contracts:verify-current }
        Invoke-UiGate
        Invoke-CoreGate
        Invoke-Gate 'integration' { pnpm test:integration }
    }
    'PreMerge' {
        Invoke-DocsGate
        Invoke-Gate 'contracts' { pnpm contracts:verify-current }
        Invoke-UiGate
        Invoke-CoreGate
        Invoke-Gate 'integration' { pnpm test:integration }
        $temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
        $temporaryEvidence = Join-Path $temporaryRoot "fielora-premerge-evidence-$([System.Guid]::NewGuid().ToString('N'))"
        New-Item -ItemType Directory -Path $temporaryEvidence -ErrorAction Stop | Out-Null
        try {
            $env:FIELORA_E2E_EVIDENCE_DIR = $temporaryEvidence
            $env:FIELORA_E2E_TARGET_TIMEOUT_MS = '120000'
            Invoke-Gate 'desktop-e2e' { pnpm test:e2e }
            Invoke-Gate 'desktop-e2e-browse' { pnpm test:e2e:browse }
            Invoke-Gate 'desktop-e2e-foundation' { pnpm test:e2e:desktop-foundation }
        }
        finally {
            Remove-Item Env:FIELORA_E2E_EVIDENCE_DIR -ErrorAction SilentlyContinue
            Remove-Item Env:FIELORA_E2E_TARGET_TIMEOUT_MS -ErrorAction SilentlyContinue
            $resolvedEvidence = [System.IO.Path]::GetFullPath($temporaryEvidence)
            if (-not $resolvedEvidence.StartsWith($temporaryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "Refusing to remove non-temporary E2E evidence path: $resolvedEvidence"
            }
            Remove-Item -LiteralPath $resolvedEvidence -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

Write-Output "DEVELOPMENT_GATE=PASS lane=$Lane"
