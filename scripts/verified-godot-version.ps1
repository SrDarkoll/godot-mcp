function Get-VerifiedGodotVersion {
    param(
        [Parameter(Mandatory=$true)][string]$Executable,
        [string]$ExpectedVersion = '4.6.3',
        [int]$TimeoutMs = 10000,
        [string]$Arguments = '--version'
    )
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo.FileName = $Executable
    $process.StartInfo.Arguments = $Arguments
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.CreateNoWindow = $true
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.RedirectStandardError = $true
    try {
        if (-not $process.Start()) { throw 'Unable to start Godot version check' }
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutMs)) {
            $process.Kill()
            $process.WaitForExit()
            throw 'Godot version check timed out'
        }
        $reported = ($stdoutTask.GetAwaiter().GetResult() + $stderrTask.GetAwaiter().GetResult()).Trim()
        if ($process.ExitCode -ne 0 -or $reported -notmatch ('^' + [regex]::Escape($ExpectedVersion) + '\.')) {
            throw 'Unexpected Godot executable version'
        }
        return $reported
    } finally {
        $process.Dispose()
    }
}
