<#
.SYNOPSIS
    Runs the comprehensive 10-gate validation suite for Godot MCP on Windows.

.DESCRIPTION
    Executes all tool contract checks, builds, typechecks, unit tests,
    and live Godot integration suites in a deterministic, logged manner.

.PARAMETER GodotBin
    Path to the Godot executable (e.g. Godot_v4.6.3-stable_win64.exe).
    Defaults to $env:GODOT_BIN if already set.
#>
param(
    [string]$GodotBin = $env:GODOT_BIN
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($GodotBin) {
    if (-not (Test-Path $GodotBin)) {
        throw "Specified Godot binary does not exist: $GodotBin"
    }
    $env:GODOT_BIN = (Resolve-Path $GodotBin).Path
    $env:REQUIRE_GODOT_INTEGRATION = '1'
    Write-Host "Configured GODOT_BIN: $env:GODOT_BIN"
} else {
    Write-Warning "GODOT_BIN is not configured. Live Godot integration gates will skip. Set -GodotBin or \$env:GODOT_BIN to enforce live testing."
}

$runStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logRoot = Join-Path $env:TEMP "godot-mcp-validation-$runStamp"
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
Write-Host "Validation log directory: $logRoot"

function Invoke-Gate {
    param(
        [Parameter(Mandatory=$true)][string]$Name,
        [Parameter(Mandatory=$true)][scriptblock]$Command
    )
    Write-Host "`n==================== $Name ===================="
    $log = Join-Path $logRoot ($Name -replace '[^A-Za-z0-9_.-]', '_')

    $previousErrorActionPreference = $ErrorActionPreference
    $exitCode = $null
    try {
        $ErrorActionPreference = 'Continue'
        & $Command 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath "$log.log"
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($null -eq $exitCode) {
        throw "$Name did not produce an exit code. Logs: $log.log"
    }
    if ($exitCode -ne 0) {
        throw "$Name failed with exit code $exitCode. Check logs: $log.log"
    }
    Write-Host "-> $Name: PASSED"
}

Invoke-Gate '01-contracts' { npm run check:tool-contracts }
Invoke-Gate '02-build' { npm run build }
Invoke-Gate '03-typecheck' { npm run typecheck }
Invoke-Gate '04-unit-tests' { npm test }
Invoke-Gate '05-check-godot' { npm run check:godot }
Invoke-Gate '06-general-integration' { npm run test:integration }

$env:GODOT_RUNTIME_INTEGRATION = '1'
Invoke-Gate '07-runtime-integration' { npm run test:integration:runtime }

$env:GODOT_VISUAL_INTEGRATION = '1'
Invoke-Gate '08-visual-integration' { npm run test:integration:visual }

Invoke-Gate '09-headless-manager' { node .\scripts\run-integration.mjs --headless }
Invoke-Gate '10-debugger-dap' { npm run test:integration:debugger }

Write-Host "`n==================== VALIDATION COMPLETE ===================="
Write-Host "All gates completed successfully with exit code 0."
Write-Host "Detailed logs preserved at: $logRoot"
