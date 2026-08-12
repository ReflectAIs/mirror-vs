# Mirror VS CLI Windows Installer (PowerShell)
# Usage: iwr -useb https://raw.githubusercontent.com/ReflectAIs/mirror-vs/main/apps/cli/install.ps1 | iex
#
# Environment variables:
#   MIRROR_INSTALL_DIR   - Installation directory (default: $env:USERPROFILE\.mirror\cli)
#   MIRROR_VERSION       - Specific version to install (default: latest)
#   MIRROR_LOCAL_ZIP     - Path to local zip file to install (skips download)

$ErrorActionPreference = "Stop"

$REPO = "ReflectAIs/mirror-vs"
$MIN_NODE_VERSION = 20
$INSTALL_DIR = if ($env:MIRROR_INSTALL_DIR) { $env:MIRROR_INSTALL_DIR } else { "$env:USERPROFILE\.mirror\cli" }
$BIN_DIR = "$env:USERPROFILE\.mirror\bin"

function Write-Info { param($Msg) Write-Host "==> $Msg" -ForegroundColor Green }
function Write-Warn { param($Msg) Write-Host "Warning: $Msg" -ForegroundColor Yellow }
function Write-Err {
    param($Msg)
    Write-Host "Error: $Msg" -ForegroundColor Red
    exit 1
}

function Show-Banner {
    Write-Host ""
    Write-Host "  ╭─────────────────────────────────╮" -ForegroundColor Cyan
    Write-Host "  │     Mirror VS CLI Installer      │" -ForegroundColor Cyan
    Write-Host "  ╰─────────────────────────────────╯" -ForegroundColor Cyan
    Write-Host ""
}

function Check-Node {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Err "Node.js is not installed. Please install Node.js $MIN_NODE_VERSION or higher.`nDownload from: https://nodejs.org/en/download"
    }
    $nodeVersion = (node -v).TrimStart('v').Split('.')[0]
    if ([int]$nodeVersion -lt $MIN_NODE_VERSION) {
        Write-Err "Node.js $MIN_NODE_VERSION+ required. Found: $(node -v)`nPlease upgrade: https://nodejs.org/en/download"
    }
    Write-Info "Found Node.js $(node -v)"
}

function Get-Platform {
    if (-not [System.Environment]::Is64BitOperatingSystem) {
        Write-Err "Only 64-bit Windows is supported."
    }
    return "win32-x64"
}

function Get-ReleaseVersion {
    if ($env:MIRROR_VERSION) {
        Write-Info "Using specified version: $env:MIRROR_VERSION"
        return $env:MIRROR_VERSION
    }
    Write-Info "Fetching latest version..."
    $releasesJson = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO/releases" -Headers @{ "User-Agent" = "mirror-vs-installer" }
    $latest = $null
    $latestParts = $null
    foreach ($release in $releasesJson) {
        if (-not $release.tag_name -or -not $release.tag_name.StartsWith("cli-v")) { continue }
        $candidate = $release.tag_name.Substring(5)
        try {
            $parts = $candidate.Split('.') | ForEach-Object { [int]$_ }
        } catch { continue }
        if ($null -eq $latestParts) {
            $latest = $candidate
            $latestParts = $parts
        } else {
            $maxLen = [Math]::Max($parts.Count, $latestParts.Count)
            for ($i = 0; $i -lt $maxLen; $i++) {
                $a = if ($i -lt $parts.Count) { $parts[$i] } else { 0 }
                $b = if ($i -lt $latestParts.Count) { $latestParts[$i] } else { 0 }
                if ($a -gt $b) { $latest = $candidate; $latestParts = $parts; break }
                if ($a -lt $b) { break }
            }
        }
    }
    if (-not $latest) { Write-Err "Could not find any CLI releases. The CLI may not have been released yet." }
    Write-Info "Latest version: $latest"
    return $latest
}

function Install-CLI {
    param($Version, $Platform)
    $ARCHIVE = "mirror-cli-$Platform.zip"
    $TmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())
    New-Item -ItemType Directory -Path $TmpDir | Out-Null
    try {
        if ($env:MIRROR_LOCAL_ZIP) {
            if (-not (Test-Path $env:MIRROR_LOCAL_ZIP)) { Write-Err "Local zip not found: $env:MIRROR_LOCAL_ZIP" }
            Write-Info "Using local zip: $env:MIRROR_LOCAL_ZIP"
            Copy-Item $env:MIRROR_LOCAL_ZIP "$TmpDir\$ARCHIVE"
        } else {
            $URL = "https://github.com/$REPO/releases/download/cli-v$Version/$ARCHIVE"
            Write-Info "Downloading from $URL..."
            Invoke-WebRequest -Uri $URL -OutFile "$TmpDir\$ARCHIVE" -UseBasicParsing
        }
        if (Test-Path $INSTALL_DIR) {
            Write-Info "Removing previous installation..."
            Remove-Item -Recurse -Force $INSTALL_DIR
        }
        New-Item -ItemType Directory -Path $INSTALL_DIR | Out-Null
        Write-Info "Extracting to $INSTALL_DIR..."
        Expand-Archive -Path "$TmpDir\$ARCHIVE" -DestinationPath "$TmpDir\extracted" -Force
        $extractedDir = Get-ChildItem "$TmpDir\extracted" -Directory | Select-Object -First 1
        $srcDir = if ($extractedDir) { $extractedDir.FullName } else { "$TmpDir\extracted" }
        Get-ChildItem $srcDir | Copy-Item -Destination $INSTALL_DIR -Recurse -Force
        if (Test-Path "$INSTALL_DIR\package.json") {
            Write-Info "Installing dependencies..."
            Push-Location $INSTALL_DIR
            try { & npm install --production --silent 2>$null } catch {
                Write-Warn "npm install failed, trying with --legacy-peer-deps..."
                & npm install --production --legacy-peer-deps --silent 2>$null
            }
            Pop-Location
        }
    } finally {
        Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue
    }
}

function Setup-Path {
    New-Item -ItemType Directory -Path $BIN_DIR -Force | Out-Null
    $mirrorBat = "$BIN_DIR\mirror.cmd"
    $entryPoint = ""
    if (Test-Path "$INSTALL_DIR\dist\index.js") {
        $entryPoint = "$INSTALL_DIR\dist\index.js"
    } elseif (Test-Path "$INSTALL_DIR\bin\mirror") {
        $entryPoint = "$INSTALL_DIR\bin\mirror"
    }
    if ($entryPoint) {
        "@echo off`nnode `"$entryPoint`" %*" | Set-Content $mirrorBat -Encoding ASCII
        Write-Info "Created launcher: $mirrorBat"
    } else {
        Write-Warn "Could not find mirror entry point in $INSTALL_DIR"
    }
    $currentPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$BIN_DIR*") {
        [System.Environment]::SetEnvironmentVariable("Path", "$BIN_DIR;$currentPath", "User")
        Write-Info "Added $BIN_DIR to PATH (restart terminal to take effect)"
    } else {
        Write-Info "$BIN_DIR already in PATH"
    }
}

function Verify-Install {
    $mirrorCmd = "$BIN_DIR\mirror.cmd"
    if (Test-Path $mirrorCmd) {
        Write-Info "Verifying installation..."
        try { & cmd /c "`"$mirrorCmd`" --version" | Out-Null } catch {}
    }
}

function Print-Success {
    param($Version)
    Write-Host ""
    Write-Host "✓ Mirror VS CLI installed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Installation: $INSTALL_DIR"
    Write-Host "  Launcher:     $BIN_DIR\mirror.cmd"
    Write-Host "  Version:      $Version"
    Write-Host ""
    Write-Host "  Get started (after restarting your terminal):"
    Write-Host "    mirror --help"
    Write-Host ""
    Write-Host "  Example:"
    Write-Host '    $env:OPENROUTER_API_KEY="sk-or-v1-..."'
    Write-Host '    cd C:\my-project; mirror "What is this project?"'
    Write-Host ""
}

Show-Banner
Check-Node
$PLATFORM = Get-Platform
$VERSION = Get-ReleaseVersion
Install-CLI -Version $VERSION -Platform $PLATFORM
Setup-Path
Verify-Install
Print-Success -Version $VERSION
