$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$healthUrl = "http://127.0.0.1:4173/api/health"
$studentUrl = "http://127.0.0.1:4173/"

function Test-OtsServer {
  try {
    $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    return $response.status -eq "ok"
  } catch {
    return $false
  }
}

if (-not (Test-OtsServer)) {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  $bundledNode = "C:\Users\savit\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

  if (Test-Path -LiteralPath $bundledNode) {
    $nodePath = $bundledNode
  } elseif ($nodeCommand) {
    $nodePath = $nodeCommand.Source
  } else {
    throw "Node.js 24 or newer was not found. Install Node.js and try again."
  }

  Start-Process `
    -FilePath $nodePath `
    -ArgumentList "server.mjs" `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden | Out-Null

  $ready = $false
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    Start-Sleep -Milliseconds 300
    if (Test-OtsServer) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    throw "The server did not become ready at $healthUrl."
  }
}

Start-Process $studentUrl
