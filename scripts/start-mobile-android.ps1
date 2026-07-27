[CmdletBinding()]
param(
  [string]$AvdName,
  [int]$TimeoutSeconds = 0
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($AvdName)) {
  if ($env:MYM_ANDROID_AVD) {
    $AvdName = $env:MYM_ANDROID_AVD
  } else {
    $AvdName = 'Medium_Phone_2'
  }
}
if ($TimeoutSeconds -le 0) {
  if ($env:MYM_ANDROID_EMULATOR_TIMEOUT_SECONDS) {
    $TimeoutSeconds = [int]$env:MYM_ANDROID_EMULATOR_TIMEOUT_SECONDS
  } else {
    $TimeoutSeconds = 240
  }
}
if ($TimeoutSeconds -le 0) {
  throw 'El tiempo máximo de arranque del emulador debe ser mayor a cero.'
}

function Find-AndroidSdkPath {
  $candidates = @(
    $env:ANDROID_SDK_ROOT,
    $env:ANDROID_HOME,
    (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
  ) | Where-Object { $_ }

  return $candidates | Where-Object { Test-Path (Join-Path $_ 'emulator\emulator.exe') } | Select-Object -First 1
}

function Get-RunningEmulatorSerial([string]$AdbPath) {
  $match = (& $AdbPath devices 2>$null | Select-String -Pattern '^(emulator-\d+)\s+device$' | Select-Object -First 1)
  if ($match) {
    return $match.Matches[0].Groups[1].Value
  }
  return $null
}

$sdkPath = Find-AndroidSdkPath
if (-not $sdkPath) {
  throw 'No se encontró el Android SDK. Configurá ANDROID_SDK_ROOT o instalá Android Studio con el emulador.'
}

$emulatorPath = Join-Path $sdkPath 'emulator\emulator.exe'
$adbPath = Join-Path $sdkPath 'platform-tools\adb.exe'
if (-not (Test-Path $adbPath)) {
  throw "No se encontró adb en $adbPath. Instalá Android SDK Platform-Tools desde Android Studio."
}

$serial = Get-RunningEmulatorSerial $adbPath
if (-not $serial) {
  Write-Host "Iniciando el emulador $AvdName..."
  # Deliberadamente visible: el emulador es la ventana con la que trabaja la persona.
  Start-Process -FilePath $emulatorPath -ArgumentList "@$AvdName"
}

$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
do {
  $serial = Get-RunningEmulatorSerial $adbPath
  if ($serial) {
    $bootCompleted = (& $adbPath -s $serial shell getprop sys.boot_completed 2>$null).Trim()
    if ($bootCompleted -eq '1') { break }
  }
  Start-Sleep -Seconds 2
} while ([DateTime]::UtcNow -lt $deadline)

if (-not $serial -or $bootCompleted -ne '1') {
  throw "El emulador '$AvdName' no terminó de iniciar en $TimeoutSeconds segundos. Abrilo desde Android Studio y revisá la virtualización (VT-x/AMD-V) o ejecutá: `"$emulatorPath`" @$AvdName"
}

Write-Host "Emulador listo ($serial). Abriendo Expo Go..."
$repositoryRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repositoryRoot
try {
  & pnpm --filter '@mym/mobile' run android
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
