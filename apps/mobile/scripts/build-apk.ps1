param(
  [string]$ApiUrl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$MobileRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RepoRoot = (Resolve-Path (Join-Path $MobileRoot "..\..")).Path
$AndroidRoot = Join-Path $MobileRoot "android"
$ReleaseDirectory = Join-Path $MobileRoot "release"
$ProductionEnvFile = Join-Path $MobileRoot ".env.production"

function Assert-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "No se encontró '$Name' en PATH. Revisá los requisitos del README de apps/mobile."
  }
}

function Assert-ExitCode {
  param([string]$Step)

  if ($LASTEXITCODE -ne 0) {
    throw "$Step falló con código de salida $LASTEXITCODE."
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

Assert-Command "node"
Assert-Command "java"
Assert-Command "pnpm"

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
  throw "No se encontró Android SDK. Instalá Android Studio o configurá ANDROID_SDK_ROOT/ANDROID_HOME."
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
  throw "La APK release requiere una URL HTTPS. Valor actual: $ApiUrl"
}

$env:NODE_ENV = "production"
$env:EXPO_PUBLIC_API_URL = $ApiUrl

Write-Host ""
Write-Host "==============================================="
Write-Host "M&M Eventos Staff - Build APK local"
Write-Host "==============================================="
Write-Host "Backend: $ApiUrl"
Write-Host "Android SDK: $AndroidSdk"
Write-Host ""

Push-Location $RepoRoot
try {
  Write-Host "1/3 - Compilando paquete compartido..."
  & pnpm --filter "@mym/shared" build
  Assert-ExitCode "La compilación de @mym/shared"

  Write-Host ""
  Write-Host "2/3 - Generando proyecto Android nativo..."
  & pnpm --filter "@mym/mobile" exec expo prebuild --platform android --clean --no-install
  Assert-ExitCode "Expo Prebuild"
}
finally {
  Pop-Location
}

$GradleWrapper = Join-Path $AndroidRoot "gradlew.bat"

if (-not (Test-Path $GradleWrapper)) {
  throw "Expo no generó android/gradlew.bat. Revisá la salida de prebuild."
}

Push-Location $AndroidRoot
try {
  Write-Host ""
  Write-Host "3/3 - Compilando APK release..."
  & $GradleWrapper app:assembleRelease --no-daemon
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
  throw "Gradle terminó, pero no se encontró una APK firmada en android/app/build/outputs/apk."
}

New-Item -ItemType Directory -Path $ReleaseDirectory -Force | Out-Null
Get-ChildItem -Path $ReleaseDirectory -Filter "*.apk" -File -ErrorAction SilentlyContinue |
  Remove-Item -Force

$DestinationApk = Join-Path $ReleaseDirectory "mym-eventos-staff.apk"
Copy-Item -Path $GeneratedApk.FullName -Destination $DestinationApk -Force

$SizeMb = [Math]::Round((Get-Item $DestinationApk).Length / 1MB, 2)

Write-Host ""
Write-Host "==============================================="
Write-Host "APK GENERADA CORRECTAMENTE"
Write-Host "==============================================="
Write-Host "Archivo: $DestinationApk"
Write-Host "Tamaño:  $SizeMb MB"
Write-Host "Backend: $ApiUrl"
Write-Host "==============================================="
