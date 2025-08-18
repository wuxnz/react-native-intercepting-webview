# Patch any installed copies of react-native-intercepting-webview to remove
# erroneous Maven coordinates for react-native-webview that can force Gradle
# to try to download a non-existent artifact.
#
# Usage (from your project root, PowerShell):
#   .\scripts\patch-react-native-webview-gradle.ps1
#
# The script will:
# - Search node_modules for build.gradle files containing the problematic
#   coordinate "com.reactnativecommunity.webview:react-native-webview"
# - Make a .bak backup of each file it changes
# - Remove only lines that reference that exact Maven coordinate
# - Print files it modified
#
# This is a safe, local fix intended for development; ideally the library
# published package should not include the Maven dependency.

$pattern = 'com\.reactnativecommunity\.webview:react-native-webview'
$root = Join-Path -Path (Get-Location) -ChildPath "node_modules"

if (-not (Test-Path $root)) {
  Write-Host "node_modules directory not found at expected path: $root"
  Exit 1
}

$files = Get-ChildItem -Path $root -Recurse -Filter build.gradle -ErrorAction SilentlyContinue

if (!$files) {
  Write-Host "No build.gradle files found under node_modules."
  Exit 0
}

$modified = @()
foreach ($f in $files) {
  try {
    $match = Select-String -Path $f.FullName -Pattern $pattern -SimpleMatch -Quiet
    if ($match) {
      # backup
      $bak = "$($f.FullName).bak"
      Copy-Item -Path $f.FullName -Destination $bak -Force
      # remove offending lines only
      $lines = Get-Content -Path $f.FullName
      $new = $lines | Where-Object { $_ -notmatch $pattern }
      # Write back
      $new | Set-Content -Path $f.FullName -Encoding UTF8
      $modified += $f.FullName
      Write-Host "Patched: $($f.FullName) (backup: $bak)"
    }
  } catch {
    Write-Warning "Failed to process $($f.FullName): $_"
  }
}

if ($modified.Count -eq 0) {
  Write-Host "No files needed patching."
} else {
  Write-Host "Patched $($modified.Count) file(s)."
  Write-Host "Now run: cd android && .\gradlew.bat assembleDebug --refresh-dependencies"
}