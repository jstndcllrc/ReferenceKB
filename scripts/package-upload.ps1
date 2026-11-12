param(
  [string]$OutputPath = (Join-Path (Split-Path $PSScriptRoot -Parent) '..\tests-upload.zip')
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ('tests-upload-' + [guid]::NewGuid().ToString('N'))
$backupDir = Join-Path $root 'backups'

try {
  & node (Join-Path $PSScriptRoot 'backup.js')

  $appBackup = Get-ChildItem -LiteralPath $backupDir -Filter 'node-data-*.sqlite' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  $searchBackup = Get-ChildItem -LiteralPath $backupDir -Filter 'kb-search-*.sqlite' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  New-Item -ItemType Directory -Path $stage, (Join-Path $stage 'knowledge-base') | Out-Null

  foreach ($directory in @('deploy', 'public', 'scripts', 'src')) {
    Copy-Item -LiteralPath (Join-Path $root $directory) -Destination $stage -Recurse
  }

  foreach ($file in @('.htaccess', 'yourcompany.png', 'install.md', 'node-app.html', 'node-dashboard.html', 'node-change-password.html', 'node-login.html', 'package.json', 'server.js')) {
    Copy-Item -LiteralPath (Join-Path $root $file) -Destination $stage
  }

  Copy-Item -LiteralPath $appBackup.FullName -Destination (Join-Path $stage 'knowledge-base\node-data.sqlite')
  Copy-Item -LiteralPath $searchBackup.FullName -Destination (Join-Path $stage 'knowledge-base\kb-search.sqlite')

  $resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
  if (Test-Path -LiteralPath $resolvedOutput) {
    Remove-Item -LiteralPath $resolvedOutput -Force
  }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $resolvedOutput -CompressionLevel Optimal
  Write-Output $resolvedOutput
}
finally {
  if (Test-Path -LiteralPath $stage) {
    Remove-Item -LiteralPath $stage -Recurse -Force
  }
}
