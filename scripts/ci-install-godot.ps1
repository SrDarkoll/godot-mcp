param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
$version = '4.6.3'
$archiveName = "Godot_v$version-stable_win64.exe.zip"
$expectedHash = 'e39986a178d585ce7ac198fb8de6ea436366dc0cc00e594810c2e3e104c04b90'
# Official godotengine/godot-builds release asset digest, verified 2026-09-05.
$target = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Destination)
New-Item -ItemType Directory -Path $target -Force | Out-Null
$archive = Join-Path $target $archiveName
Invoke-WebRequest -Uri "https://github.com/godotengine/godot-builds/releases/download/$version-stable/$archiveName" -OutFile $archive -TimeoutSec 180
$stream = [IO.File]::OpenRead($archive)
$hasher = [Security.Cryptography.SHA256]::Create()
try { $actualHash = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
finally { $stream.Dispose(); $hasher.Dispose() }
if ($actualHash -ne $expectedHash) { throw 'Godot archive checksum mismatch' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
try {
    foreach ($entry in $zip.Entries) {
        $output = [IO.Path]::GetFullPath((Join-Path $target $entry.FullName))
        if (-not $output.StartsWith($target.TrimEnd([char[]]'\/') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive path escapes the destination' }
        if ($entry.FullName.EndsWith('/')) { [IO.Directory]::CreateDirectory($output) | Out-Null }
        else {
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($output)) | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $output, $true)
        }
    }
} finally { $zip.Dispose() }
$executable = Join-Path $target "Godot_v$version-stable_win64.exe"
$reported = & $executable --version
if ($LASTEXITCODE -ne 0 -or $reported -notmatch '^4\.6\.3\.') { throw 'Unexpected Godot executable version' }
if ($env:GITHUB_ENV) { Add-Content -LiteralPath $env:GITHUB_ENV -Value "GODOT_BIN=$executable" -Encoding utf8 }
Write-Output "Verified Godot $reported at $executable"
