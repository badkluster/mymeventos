param(
  [string]$ApiUrl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$SourceMobileRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$SourceRepoRoot = (Resolve-Path (Join-Path $SourceMobileRoot "..\..")).Path
$ReleaseDirectory = Join-Path $SourceMobileRoot "release"
$ProductionEnvFile = Join-Path $SourceMobileRoot ".env.production"
$MappedDrive = $null

function Assert-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found in PATH."
  }
}

function Assert-ExitCode {
  param([string]$Step)

  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit code $LASTEXITCODE."
  }
}

function Read-ApiUrlFromEnvFile {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return $null
  }

  foreach ($Line in Get-Content $Path) {
    if ($Line -match '^\s*EXPO_PUBLIC_API_URL\s*=\s*(.+?)\s*$') {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }

  return $null
}

function Mount-ShortWorkspacePath {
  param([string]$TargetPath)

  # React Native + CMake + pnpm can exceed the Windows object-path limit when
  # the repository lives in a deeply nested directory. A temporary SUBST drive
  # keeps every native and Metro path short without copying the repository.
  foreach ($Letter in @('M', 'N', 'R', 'S', 'T', 'U', 'V')) {
    $Drive = "${Letter}:"
    if (Test-Path "${Drive}\") {
      continue
    }

    & subst.exe $Drive $TargetPath
    if ($LASTEXITCODE -eq 0 -and (Test-Path "${Drive}\")) {
      return $Drive
    }
  }

  return $null
}

Assert-Command "node"
Assert-Command "java"
Assert-Command "pnpm"
Assert-Command "subst.exe"

$SdkCandidates = @()

if ($env:ANDROID_SDK_ROOT) {
  $SdkCandidates += $env:ANDROID_SDK_ROOT
}

if ($env:ANDROID_HOME) {
  $SdkCandidates += $env:ANDROID_HOME
}

if ($env:LOCALAPPDATA) {
  $SdkCandidates += (Join-Path $env:LOCALAPPDATA "Android\Sdk")
}

$AndroidSdk = $SdkCandidates |
  Where-Object { $_ -and (Test-Path $_) } |
  Select-Object -First 1

if (-not $AndroidSdk) {
  throw "Android SDK was not found. Install Android Studio or configure ANDROID_SDK_ROOT/ANDROID_HOME."
}

$env:ANDROID_SDK_ROOT = $AndroidSdk
$env:ANDROID_HOME = $AndroidSdk

if ([string]::IsNullOrWhiteSpace($ApiUrl)) {
  $ApiUrl = Read-ApiUrlFromEnvFile -Path $ProductionEnvFile
}

if ([string]::IsNullOrWhiteSpace($ApiUrl)) {
  $ApiUrl = "https://www.mymsalones.com.ar/api"
}

$ApiUrl = $ApiUrl.Trim().TrimEnd('/')

if ($ApiUrl -notmatch '^https://') {
  throw "Release APK requires an HTTPS API URL. Current value: $ApiUrl"
}

$env:NODE_ENV = "production"
$env:CI = "1"
$env:EXPO_PUBLIC_API_URL = $ApiUrl

if ([string]::IsNullOrWhiteSpace($env:NODE_OPTIONS)) {
  $env:NODE_OPTIONS = "--max-old-space-size=4096"
}
elseif ($env:NODE_OPTIONS -notmatch 'max-old-space-size') {
  $env:NODE_OPTIONS = "$($env:NODE_OPTIONS) --max-old-space-size=4096"
}

try {
  $MappedDrive = Mount-ShortWorkspacePath -TargetPath $SourceRepoRoot

  if ($MappedDrive) {
    $BuildRepoRoot = "${MappedDrive}\"
    Write-Host "Using short Windows build path: $BuildRepoRoot"
  }
  else {
    $BuildRepoRoot = $SourceRepoRoot
    Write-Warning "No free drive letter was available for a short build path."
  }

  $BuildMobileRoot = Join-Path $BuildRepoRoot "apps\mobile"
  $AndroidRoot = Join-Path $BuildMobileRoot "android"

  Write-Host ""
  Write-Host "==============================================="
  Write-Host "M&M Eventos Staff - Local Android APK build"
  Write-Host "==============================================="
  Write-Host "Backend: $ApiUrl"
  Write-Host "Android SDK: $AndroidSdk"
  Write-Host "Build root: $BuildRepoRoot"
  Write-Host ""

  Push-Location $BuildRepoRoot
  try {
    Write-Host "1/4 - Installing hoisted PNPM dependencies..."
    & pnpm install --frozen-lockfile
    Assert-ExitCode "PNPM install"

    Write-Host ""
    Write-Host "2/4 - Building shared package..."
    & pnpm --filter "@mym/shared" build
    Assert-ExitCode "Shared package build"

    Write-Host ""
    Write-Host "3/4 - Generating clean Android native project..."
    & pnpm --filter "@mym/mobile" exec expo prebuild --platform android --clean --no-install
    Assert-ExitCode "Expo prebuild"
  }
  finally {
    Pop-Location
  }

  $GradleWrapper = Join-Path $AndroidRoot "gradlew.bat"

  if (-not (Test-Path $GradleWrapper)) {
    throw "Expo did not generate android/gradlew.bat."
  }

  Push-Location $AndroidRoot
  try {
    Write-Host ""
    Write-Host "4/4 - Compiling release APK..."
    & $GradleWrapper app:assembleRelease --no-daemon --console=plain --stacktrace
    Assert-ExitCode "Gradle assembleRelease"
  }
  finally {
    Pop-Location
  }

  $PreferredApk = Join-Path $AndroidRoot "app\build\outputs\apk\release\app-release.apk"

  if (Test-Path $PreferredApk) {
    $GeneratedApk = Get-Item $PreferredApk
  }
  else {
    $ApkOutputRoot = Join-Path $AndroidRoot "app\build\outputs\apk"
    $GeneratedApk = Get-ChildItem -Path $ApkOutputRoot -Filter "*.apk" -File -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -notmatch 'unaligned|unsigned' } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
  }

  if (-not $GeneratedApk) {
    throw "Gradle finished, but no signed APK was found."
  }

  New-Item -ItemType Directory -Path $ReleaseDirectory -Force | Out-Null
  Get-ChildItem -Path $ReleaseDirectory -Filter "*.apk" -File -ErrorAction SilentlyContinue |
    Remove-Item -Force

  $DestinationApk = Join-Path $ReleaseDirectory "mym-eventos-staff.apk"
  Copy-Item -Path $GeneratedApk.FullName -Destination $DestinationApk -Force

  $SizeMb = [Math]::Round((Get-Item $DestinationApk).Length / 1MB, 2)

  Write-Host ""
  Write-Host "==============================================="
  Write-Host "APK GENERATED SUCCESSFULLY"
  Write-Host "==============================================="
  Write-Host "File:    $DestinationApk"
  Write-Host "Size:    $SizeMb MB"
  Write-Host "Backend: $ApiUrl"
  Write-Host "==============================================="
}
finally {
  if ($MappedDrive) {
    & subst.exe $MappedDrive /D | Out-Null
  }
}
