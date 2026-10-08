param(
  [Parameter(Mandatory=$true)][string]$EvidenceDirectory,
  # Optional local rehearsal; downloaded files are still checked against the pinned release hashes.
  [string]$DownloadsDirectory
)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'This validation requires Windows and PowerShell 7.' }
$taskEvidence = [IO.Path]::GetFullPath($EvidenceDirectory)
if (Test-Path -LiteralPath $taskEvidence) { throw 'Use a new, empty evidence directory for each validation.' }
New-Item -ItemType Directory -Path $taskEvidence | Out-Null
$taskProject = Split-Path -Parent $PSScriptRoot
$taskGuid = '494ea2a2-321a-4b73-8d6d-dc67ec0e0490'
$taskCacheDir = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'warekeep-community-updater'))
$taskCacheFile = Join-Path $taskCacheDir 'installer.exe'
$taskRealDataDir = Join-Path $env:APPDATA 'WareKeep Community'
$taskLinks = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop','DoNotVerify')) 'WareKeep Community.lnk'),
  (Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory','DoNotVerify')) 'WareKeep Community.lnk'),
  (Join-Path ([Environment]::GetFolderPath('StartMenu','DoNotVerify')) 'Programs\WareKeep Community.lnk'),
  (Join-Path ([Environment]::GetFolderPath('CommonStartMenu','DoNotVerify')) 'Programs\WareKeep Community.lnk')
)
$taskPackages = @(
  @{Name='WareKeep-Community-Setup-1.0.10-x64.exe';Size=108916857;Sha256='c6179da1a16be4dd2cd9a7f884e0150d7f64fc4939c573b407afa72ec3556c14'},
  @{Name='WareKeep-Community-Portable-1.0.10-x64.exe';Size=108686864;Sha256='ed68ba12aaec76b72aac47bddd6fd6f52f558fae52ec4fd9c471a9b60e385492'}
)
if ($DownloadsDirectory) {
  $taskDownloads = [IO.Path]::GetFullPath($DownloadsDirectory)
} else {
  $taskDownloads = Join-Path $taskEvidence 'downloads'
  New-Item -ItemType Directory -Path $taskDownloads | Out-Null
}
foreach ($taskPackage in $taskPackages) {
  $taskPackage.Url = 'https://github.com/fazlafghan8-svg/warekeep-community/releases/download/v1.0.10/' + $taskPackage.Name
  $taskPackage.Path = Join-Path $taskDownloads $taskPackage.Name
  if (-not $DownloadsDirectory) {
    Invoke-WebRequest -Uri $taskPackage.Url -OutFile $taskPackage.Path -MaximumRetryCount 2 -RetryIntervalSec 5 -TimeoutSec 300
  }
  if ((Get-Item -LiteralPath $taskPackage.Path).Length -ne $taskPackage.Size) { throw "Release asset size mismatch: $($taskPackage.Name)" }
  if ((Get-FileHash -LiteralPath $taskPackage.Path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskPackage.Sha256) { throw "Release asset checksum mismatch: $($taskPackage.Name)" }
}
$taskPackages | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskEvidence 'PACKAGES.json') -Encoding utf8
$taskSetup = $taskPackages[0].Path
$taskPortable = $taskPackages[1].Path
function Get-TaskState {
  $taskKeys = @()
  foreach ($taskHive in @([Microsoft.Win32.RegistryHive]::CurrentUser,[Microsoft.Win32.RegistryHive]::LocalMachine)) {
    foreach ($taskView in @([Microsoft.Win32.RegistryView]::Registry32,[Microsoft.Win32.RegistryView]::Registry64)) {
      $taskBaseKey = [Microsoft.Win32.RegistryKey]::OpenBaseKey($taskHive,$taskView)
      try {
        foreach ($taskKeyName in @("Software\$taskGuid","Software\Microsoft\Windows\CurrentVersion\Uninstall\$taskGuid")) {
          $taskKey = $taskBaseKey.OpenSubKey($taskKeyName)
          if ($null -ne $taskKey) {
            try { $taskKeys += [PSCustomObject]@{Hive=$taskHive.ToString();View=$taskView.ToString();Key=$taskKeyName;InstallLocation=$taskKey.GetValue('InstallLocation');DisplayName=$taskKey.GetValue('DisplayName')} }
            finally { $taskKey.Dispose() }
          }
        }
      } finally { $taskBaseKey.Dispose() }
    }
  }
  return @{RegistryEntries=@($taskKeys);ExistingLinks=@($taskLinks | Where-Object {Test-Path -LiteralPath $_});CacheDirectoryExists=(Test-Path -LiteralPath $taskCacheDir);RealDataDirectoryExists=(Test-Path -LiteralPath $taskRealDataDir)}
}
function Invoke-TaskInstaller([string]$taskExecutable,[string]$taskArguments) {
  $taskProcess = Start-Process -FilePath $taskExecutable -ArgumentList $taskArguments -WindowStyle Hidden -PassThru
  if (-not $taskProcess.WaitForExit(180000)) {
    & taskkill.exe /PID $taskProcess.Id /T /F | Out-Null
    $null = $taskProcess.WaitForExit(5000)
    throw 'The test installer exceeded its three-minute deadline; its process tree was stopped.'
  }
  return $taskProcess.ExitCode
}
function Invoke-TaskNode([string]$taskScript,[string[]]$taskArguments,[string]$taskLogName) {
  $taskNodePath = (Get-Command node -CommandType Application | Select-Object -First 1).Source
  $taskStart = [Diagnostics.ProcessStartInfo]::new($taskNodePath)
  $taskStart.UseShellExecute = $false
  $taskStart.CreateNoWindow = $true
  $taskStart.RedirectStandardOutput = $true
  $taskStart.RedirectStandardError = $true
  $taskStart.ArgumentList.Add($taskScript)
  foreach ($taskArgument in $taskArguments) { $taskStart.ArgumentList.Add($taskArgument) }
  $taskProcess = [Diagnostics.Process]::Start($taskStart)
  $taskOutput = $taskProcess.StandardOutput.ReadToEndAsync()
  $taskError = $taskProcess.StandardError.ReadToEndAsync()
  $taskTimedOut = -not $taskProcess.WaitForExit(300000)
  if ($taskTimedOut) { $taskProcess.Kill($true); $taskProcess.WaitForExit() }
  $taskLog = $taskOutput.GetAwaiter().GetResult() + $taskError.GetAwaiter().GetResult()
  [IO.File]::WriteAllText((Join-Path $taskEvidence $taskLogName),$taskLog,[Text.UTF8Encoding]::new($false))
  Write-Host $taskLog
  if ($taskTimedOut) { throw 'The packaged application check exceeded five minutes; its process tree was stopped.' }
  if ($taskProcess.ExitCode -ne 0) { throw "Packaged application check failed with exit code $($taskProcess.ExitCode). See $taskLogName." }
}
$taskBefore = Get-TaskState
$taskBefore | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $taskEvidence 'SETUP_BEFORE.json') -Encoding utf8
if ($taskBefore.RegistryEntries.Count -gt 0 -or $taskBefore.ExistingLinks.Count -gt 0 -or $taskBefore.CacheDirectoryExists -or $taskBefore.RealDataDirectoryExists) { throw 'An existing Community installation, shortcut, updater cache or real data profile prevents this isolated test.' }
$taskInstallDir = [IO.Path]::GetFullPath((Join-Path $taskEvidence ('setup-test-install-' + [guid]::NewGuid().ToString('N'))))
$taskEvidencePrefix = $taskEvidence.TrimEnd('\') + '\'
if (-not $taskInstallDir.StartsWith($taskEvidencePrefix,[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $taskInstallDir)) { throw 'Unsafe or reused test installation directory.' }
$taskFailure = $null
$taskResult = @{
  SourceCommit='05dbd9449016c5beb61a3122e71ddcaa94e0e1dc';ReleaseTag='v1.0.10';
  GithubHostedRunner=($env:GITHUB_ACTIONS -eq 'true');RunnerOS=$env:RUNNER_OS;WindowsVersion=[Environment]::OSVersion.VersionString;
  DownloadedFromPublicRelease=(-not [bool]$DownloadsDirectory);PhysicalSecondComputerTest=$false;
  SyntheticDataOnly=$true;InstallDirectory=$taskInstallDir;Before=$taskBefore;Passed=$false
}
try {
  $taskInstallExit = Invoke-TaskInstaller $taskSetup "/S /currentuser --no-desktop-shortcut /D=$taskInstallDir"
  $taskResult.InstallExitCode = $taskInstallExit
  if ($taskInstallExit -ne 0) { throw "Setup failed with exit code $taskInstallExit" }
  $taskExe = Join-Path $taskInstallDir 'WareKeep Community.exe'
  foreach ($taskRelative in @('WareKeep Community.exe','resources\app.asar','resources\LICENSE','resources\THIRD_PARTY_NOTICES.md','resources\THIRD_PARTY_DEPENDENCIES.md')) {
    if (-not (Test-Path -LiteralPath (Join-Path $taskInstallDir $taskRelative))) { throw "Missing installed payload: $taskRelative" }
  }
  if ((Get-FileHash -LiteralPath $taskExe -Algorithm SHA256).Hash.ToLowerInvariant() -ne '4d6e6ae3208443812bb1628258a2bb276f9d60d1ff88a68118573d4da6e821b9') { throw 'Installed runtime differs from the tested published release.' }
  if ((Get-FileHash -LiteralPath (Join-Path $taskInstallDir 'resources\app.asar') -Algorithm SHA256).Hash.ToLowerInvariant() -ne '21fa2510b38da57e5a105ab7ef40d734eccf2b56698f46b03f25b3754b9bc6e2') { throw 'Installed application archive differs from the tested published release.' }
  if (-not (Select-String -LiteralPath (Join-Path $taskInstallDir 'resources\LICENSE') -Pattern 'Apache License' -Quiet)) { throw 'The bundled application license is missing.' }
  $taskDuring = Get-TaskState
  $taskResult.During = $taskDuring
  $taskLocations = @($taskDuring.RegistryEntries | Where-Object {$_.InstallLocation} | Select-Object -ExpandProperty InstallLocation -Unique)
  if ($taskLocations.Count -ne 1 -or [IO.Path]::GetFullPath($taskLocations[0]) -ne $taskInstallDir) { throw 'Installer registration did not match the isolated installation path.' }
  $taskResult.InstalledPayloadMatchesPublishedRelease = $true
  Invoke-TaskNode (Join-Path $PSScriptRoot 'verify-released-windows-ui.mjs') @($taskExe,'installed',$taskEvidence) 'installed-UI.log'
  $taskResult.InstalledApplicationUiPassed = $true
  Invoke-TaskNode (Join-Path $PSScriptRoot 'verify-released-windows-portable.mjs') @($taskPortable,$taskEvidence) 'portable.log'
  $taskResult.PortableWrapperPassed = $true
} catch { $taskFailure = $_; $taskResult.Failure = $_.Exception.Message }
finally {
  try {
    if (Test-Path -LiteralPath $taskInstallDir) {
      $taskUninstallers = @(Get-ChildItem -LiteralPath $taskInstallDir -File -Filter 'Uninstall*.exe')
      if ($taskUninstallers.Count -eq 1) {
        $taskCleanupState = Get-TaskState
        $taskCleanupLocations = @($taskCleanupState.RegistryEntries | Where-Object {$_.InstallLocation} | Select-Object -ExpandProperty InstallLocation -Unique)
        if ($taskCleanupLocations.Count -ne 1 -or [IO.Path]::GetFullPath($taskCleanupLocations[0]) -ne $taskInstallDir) { throw 'Refusing uninstall because registration does not match the safe test installation directory.' }
        $taskCopiedUninstaller = Join-Path $taskEvidence ('temporary-uninstaller-' + [guid]::NewGuid().ToString('N') + '.exe')
        Copy-Item -LiteralPath $taskUninstallers[0].FullName -Destination $taskCopiedUninstaller
        $taskResult.UninstallExitCode = Invoke-TaskInstaller $taskCopiedUninstaller "/S /currentuser _?=$taskInstallDir"
        Remove-Item -LiteralPath $taskCopiedUninstaller -Force
      }
    }
    if (-not $taskBefore.CacheDirectoryExists -and (Test-Path -LiteralPath $taskCacheFile)) {
      $taskExpectedCache = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'warekeep-community-updater'))
      if ($taskCacheDir -ne $taskExpectedCache -or [IO.Path]::GetFullPath($taskCacheFile) -ne (Join-Path $taskExpectedCache 'installer.exe')) { throw 'Unsafe cache cleanup path.' }
      if ((Get-FileHash -LiteralPath $taskCacheFile -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $taskSetup -Algorithm SHA256).Hash) { throw 'Cache is not the test installer; refusing cleanup.' }
      Remove-Item -LiteralPath $taskCacheFile -Force
    }
    if (-not $taskBefore.CacheDirectoryExists -and (Test-Path -LiteralPath $taskCacheDir) -and @(Get-ChildItem -LiteralPath $taskCacheDir -Force).Count -eq 0) { Remove-Item -LiteralPath $taskCacheDir -Force }
    if ((Test-Path -LiteralPath $taskInstallDir) -and @(Get-ChildItem -LiteralPath $taskInstallDir -Force).Count -eq 0) { Remove-Item -LiteralPath $taskInstallDir -Force }
  } catch {
    $taskResult.CleanupFailure = $_.Exception.Message
    if (-not $taskFailure) { $taskFailure = $_ }
  } finally {
    $taskAfter = Get-TaskState
    $taskResult.After = $taskAfter
    $taskResult.TestInstallationRemoved = -not (Test-Path -LiteralPath $taskInstallDir)
    $taskResult.RegistryAndShortcutsRemoved = ($taskAfter.RegistryEntries.Count -eq 0 -and $taskAfter.ExistingLinks.Count -eq 0)
    $taskResult.UpdaterCacheRemoved = -not $taskAfter.CacheDirectoryExists
    $taskResult.RealDataDirectoryStateUnchanged = ($taskBefore.RealDataDirectoryExists -eq $taskAfter.RealDataDirectoryExists)
    $taskResult | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $taskEvidence 'WINDOWS_RELEASE_RESULT.json') -Encoding utf8
  }
}
if ($taskFailure) { throw $taskFailure }
if (-not $taskResult.TestInstallationRemoved -or -not $taskResult.RegistryAndShortcutsRemoved -or -not $taskResult.UpdaterCacheRemoved -or -not $taskResult.RealDataDirectoryStateUnchanged) { throw 'Test cleanup did not restore the original installation state.' }
$taskResult.Passed = $true
$taskResult | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $taskEvidence 'WINDOWS_RELEASE_RESULT.json') -Encoding utf8
$taskResult | ConvertTo-Json -Depth 12
