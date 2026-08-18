$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$packageRoot = Join-Path $repoRoot 'apps\desktop\out\Fielora-win32-x64'
$artifactRoot = Join-Path $repoRoot 'artifacts\phase04'
$zipPath = Join-Path $artifactRoot 'Fielora-V0.1-Phase04-win-x64.zip'
if (-not (Test-Path -LiteralPath (Join-Path $packageRoot 'Fielora.exe'))) { throw 'Packaged Fielora.exe is missing.' }
if (-not (Test-Path -LiteralPath (Join-Path $packageRoot 'resources\fielora-core.exe'))) { throw 'Packaged release Core is missing.' }
New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -Path (Join-Path $packageRoot '*') -DestinationPath $zipPath -CompressionLevel Optimal
$archive = Get-Item -LiteralPath $zipPath
$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
$packagedApp = Join-Path $packageRoot 'Fielora.exe'
$packagedCore = Join-Path $packageRoot 'resources\fielora-core.exe'
$buildInfo = [ordered]@{
    phase = '04'
    generated_at = [DateTimeOffset]::UtcNow.ToString('o')
    git_commit = (git rev-parse HEAD).Trim()
    git_worktree_dirty = [bool](git status --short)
    platform = 'Windows 11 x64'
    schema_version = 5
    migration_0004_normalized_sha256 = '4d142745b3e9a5ccd8c27f422ecdc888163a575a91b0515f90a1ee6aa0f869ab'
    packaged_exe_sha256 = (Get-FileHash -LiteralPath $packagedApp -Algorithm SHA256).Hash.ToLowerInvariant()
    packaged_core_sha256 = (Get-FileHash -LiteralPath $packagedCore -Algorithm SHA256).Hash.ToLowerInvariant()
    portable = $archive.Name
    portable_bytes = $archive.Length
    portable_sha256 = $hash
    provider_external_requests = 0
    real_provider_acceptance = 'PENDING_NO_ELIGIBLE_AUTOMATION_CREDENTIALS'
}
$buildInfoJson = $buildInfo | ConvertTo-Json -Depth 4
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $artifactRoot 'BUILD_INFO.json'), $buildInfoJson + "`n", $utf8NoBom)
Write-Output "portable=$($archive.FullName)"
Write-Output "bytes=$($archive.Length)"
Write-Output "sha256=$hash"
