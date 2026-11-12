$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root 'deploy\production.env'
if (-not (Test-Path -LiteralPath $envFile)) {
    throw 'Create deploy\production.env from deploy\production.env.example before starting production.'
}
foreach ($line in Get-Content -LiteralPath $envFile) {
    $value = $line.Trim()
    if (-not $value -or $value.StartsWith('#')) { continue }
    $parts = $value.Split('=', 2)
    if ($parts.Count -eq 2) { Set-Item -Path "Env:$($parts[0].Trim())" -Value $parts[1].Trim() }
}
Set-Location -LiteralPath $root
& node server.js
