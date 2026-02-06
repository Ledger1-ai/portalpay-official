import { NextRequest, NextResponse } from "next/server";
import { requireThirdwebAuth } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/touchpoint/setup-script?brandKey=xoinpay
 * 
 * Generates a pre-configured Owner Mode setup script with the APK URL embedded.
 * Returns a .bat file download.
 */
export async function GET(req: NextRequest) {
    try {
        // Auth: Admin or Superadmin only
        const caller = await requireThirdwebAuth(req).catch(() => null);
        const roles = Array.isArray(caller?.roles) ? caller.roles : [];
        if (!roles.includes("admin") && !roles.includes("superadmin")) {
            return NextResponse.json({ error: "forbidden" }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const brandKey = searchParams.get("brandKey")?.trim().toLowerCase();
        const os = searchParams.get("os")?.trim().toLowerCase();

        if (!brandKey) {
            return NextResponse.json({ error: "brandKey_required" }, { status: 400 });
        }

        // Build the APK download URL
        // This will be a public-ish URL that the script can download from
        const baseUrl = (
            process.env.NEXT_PUBLIC_APP_URL ||
            process.env.NEXT_PUBLIC_BASE_URL ||
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
            "https://portalpay.app"
        ).replace(/\/$/, "");

        const apkUrl = `${baseUrl}/api/touchpoint/apk-download?brandKey=${brandKey}`;

        // Generate the appropriate script based on OS
        if (os === "macos" || os === "linux" || os === "sh") {
            const scriptContent = generateMacOSSetupScript(brandKey, apkUrl);
            return new Response(scriptContent, {
                headers: {
                    "Content-Type": "application/x-sh",
                    "Content-Disposition": `attachment; filename="setup-${brandKey}-owner-mode.sh"`,
                    "Cache-Control": "no-store",
                },
            });
        } else {
            const scriptContent = generateSetupScript(brandKey, apkUrl);
            return new Response(scriptContent, {
                headers: {
                    "Content-Type": "application/x-bat",
                    "Content-Disposition": `attachment; filename="setup-${brandKey}-owner-mode.bat"`,
                    "Cache-Control": "no-store",
                },
            });
        }
    } catch (e: any) {
        console.error("[touchpoint/setup-script] Error:", e);
        return NextResponse.json({ error: "script_generation_failed" }, { status: 500 });
    }
}

function generateSetupScript(brandKey: string, apkUrl: string): string {
    return `@echo off
setlocal enabledelayedexpansion
echo ===================================================
echo   Owner Mode Setup Script
echo   Brand: ${brandKey.toUpperCase()}
echo ===================================================
echo.
echo This script sets up Android devices with Device Owner mode.
echo.
echo PREREQUISITES:
echo 1. Android device connected via USB
echo 2. Developer Options + USB Debugging enabled
echo 3. NO Google Accounts on device (remove ALL accounts first)
echo 4. "adb" command available in PATH
echo.

:CHECK_ADB
echo Checking for connected device...
adb devices
echo.
set /p CONTINUE="Is your device listed above? (y/n): "
if /i "%CONTINUE%" neq "y" (
    echo Please connect device and enable USB Debugging.
    pause
    goto :EOF
)

:DOWNLOAD_APK
echo.
echo ===================================================
echo   Step 1: Downloading APK
echo ===================================================
echo.
echo Brand: ${brandKey}
echo Downloading from server...
set "TEMP_APK=%TEMP%\\${brandKey}-touchpoint.apk"

REM Try curl first, fall back to PowerShell
where curl >nul 2>nul
if %ERRORLEVEL%==0 (
    curl -f -L -o "%TEMP_APK%" "${apkUrl}"
) else (
    powershell -Command "Invoke-WebRequest -Uri '${apkUrl}' -OutFile '%TEMP_APK%'"
)

if not exist "%TEMP_APK%" (
    echo [ERROR] Failed to download APK.
    echo Please check your internet connection or contact support.
    pause
    goto :EOF
)

echo [SUCCESS] APK downloaded!

:INSTALL_APK
echo.
echo ===================================================
echo   Step 2: Installing APK
echo ===================================================
echo.
echo Installing %TEMP_APK%...
adb install -r -g "%TEMP_APK%"
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] APK installation failed.
    echo Try: adb uninstall com.example.basaltsurgemobile
    echo Then run this script again.
    pause
    goto :EOF
)
echo [SUCCESS] APK installed!

:SET_DEVICE_OWNER
echo.
echo ===================================================
echo   Step 3: Setting Device Owner Mode
echo ===================================================
echo.
echo Running: dpm set-device-owner ...
adb shell dpm set-device-owner com.example.basaltsurgemobile/.AppDeviceAdminReceiver

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Failed to set device owner.
    echo.
    echo Common causes:
    echo   - Accounts on device (remove ALL accounts first)
    echo   - App not installed
    echo   - Device already has a device owner
    echo.
    echo To reset: Settings ^> Accounts ^> Remove all
    pause
    goto :EOF
)

echo [SUCCESS] Device Owner mode set!

:GRANT_PERMISSIONS
echo.
echo ===================================================
echo   Step 4: Granting Permissions
echo ===================================================
echo.
adb shell appops set com.example.basaltsurgemobile SYSTEM_ALERT_WINDOW allow
echo Permissions granted.

:START_APP
echo.
echo ===================================================
echo   Step 5: Starting App
echo ===================================================
echo.
adb shell am start -n com.example.basaltsurgemobile/.MainActivity

echo.
echo ===================================================
echo   SETUP COMPLETE!
echo ===================================================
echo.
echo Brand: ${brandKey}
echo Mode:  Device Owner (Full Lockdown)
echo.
echo Next steps:
echo   1. Open Admin Panel ^> Touchpoints
echo   2. Click "Provision Device"
echo   3. Enter Installation ID from device screen
echo   4. Select mode and lockdown settings
echo   5. Click Provision
echo.
echo For batch provisioning, run this script on each device.
echo.
pause
`;
}

function generateMacOSSetupScript(brandKey: string, apkUrl: string): string {
    return `#!/bin/bash
# ===================================================
#   Owner Mode Setup Script
#   Brand: ${brandKey.toUpperCase()}
# ===================================================

echo "==================================================="
echo "  Owner Mode Setup Script"
echo "  Brand: ${brandKey.toUpperCase()}"
echo "==================================================="
echo ""
echo "This script sets up Android devices with Device Owner mode."
echo ""
echo "PREREQUISITES:"
echo "1. Android device connected via USB"
echo "2. Developer Options + USB Debugging enabled"
echo "3. NO Google Accounts on device (remove ALL accounts first)"
echo "4. 'adb' command available in PATH"
echo ""

# Check for ADB
if ! command -v adb &> /dev/null; then
    echo "[ERROR] adb command not found!"
    echo "Please install Android SDK Platform Tools:"
    echo "  brew install android-platform-tools"
    echo "  or download from: https://developer.android.com/studio/releases/platform-tools"
    exit 1
fi

# Check for connected device
echo "Checking for connected device..."
adb devices
echo ""
read -p "Is your device listed above? (y/n): " CONTINUE
if [[ ! "\\$CONTINUE" =~ ^[Yy]$ ]]; then
    echo "Please connect device and enable USB Debugging."
    exit 1
fi

# Step 1: Download APK
echo ""
echo "==================================================="
echo "  Step 1: Downloading APK"
echo "==================================================="
echo ""
echo "Brand: ${brandKey}"
echo "Downloading from server..."
TEMP_APK="/tmp/${brandKey}-touchpoint.apk"

if command -v curl &> /dev/null; then
    curl -f -L -o "\\$TEMP_APK" "${apkUrl}"
elif command -v wget &> /dev/null; then
    wget -O "\\$TEMP_APK" "${apkUrl}"
else
    echo "[ERROR] Neither curl nor wget found. Please install one."
    exit 1
fi

if [ ! -f "\\$TEMP_APK" ]; then
    echo "[ERROR] Failed to download APK."
    echo "Please check your internet connection or contact support."
    exit 1
fi

echo "[SUCCESS] APK downloaded!"

# Step 2: Install APK
echo ""
echo "==================================================="
echo "  Step 2: Installing APK"
echo "==================================================="
echo ""
echo "Installing \\$TEMP_APK..."
if ! adb install -r -g "\\$TEMP_APK"; then
    echo ""
    echo "[ERROR] APK installation failed."
    echo "Try: adb uninstall com.example.basaltsurgemobile"
    echo "Then run this script again."
    exit 1
fi
echo "[SUCCESS] APK installed!"

# Step 3: Set Device Owner
echo ""
echo "==================================================="
echo "  Step 3: Setting Device Owner Mode"
echo "==================================================="
echo ""

# Check if app is installed
echo "Checking if app is installed..."
if ! adb shell pm list packages | grep -qi "com.example.basaltsurgemobile"; then
    echo ""
    echo "[ERROR] App is NOT installed on the device!"
    exit 1
fi
echo "[OK] App is installed."

# Check for existing Device Owner
echo "Checking for existing Device Owner..."
EXISTING_OWNER=\\$(adb shell dumpsys device_policy 2>/dev/null | grep -i "Device Owner")
if [ -n "\\$EXISTING_OWNER" ]; then
    echo ""
    echo "[WARNING] Device already has a Device Owner set!"
    echo "Current owner: \\$EXISTING_OWNER"
    echo ""
    echo "Please factory reset the device or remove the existing owner first."
    exit 1
fi

# Check for accounts
echo "Checking for Google accounts..."
if adb shell dumpsys account 2>/dev/null | grep -qi "Account {"; then
    echo ""
    echo "[WARNING] Accounts detected on device!"
    echo "Device Owner cannot be set while accounts exist."
    echo "Please remove ALL accounts first."
    exit 1
fi
echo "[OK] No accounts detected."

# Set Device Owner
echo ""
echo "Setting Device Owner..."
if ! adb shell dpm set-device-owner com.example.basaltsurgemobile/.AppDeviceAdminReceiver 2>&1; then
    echo ""
    echo "[ERROR] Failed to set Device Owner."
    echo "Please try factory reset if problem persists."
    exit 1
fi

echo ""
echo "[SUCCESS] Device Owner mode set!"

# Step 4: Grant Permissions
echo ""
echo "==================================================="
echo "  Step 4: Granting Permissions"
echo "==================================================="
echo ""
adb shell appops set com.example.basaltsurgemobile SYSTEM_ALERT_WINDOW allow
echo "Permissions granted."

# Step 5: Start App
echo ""
echo "==================================================="
echo "  Step 5: Starting App"
echo "==================================================="
echo ""
adb shell am start -n com.example.basaltsurgemobile/.MainActivity

echo ""
echo "==================================================="
echo "  SETUP COMPLETE!"
echo "==================================================="
echo ""
echo "Brand: ${brandKey}"
echo "Mode:  Device Owner (Full Lockdown)"
echo ""
echo "Next steps:"
echo "  1. Open Admin Panel > Touchpoints"
echo "  2. Click 'Provision Device'"
echo "  3. Enter Installation ID from device screen"
echo "  4. Select mode and lockdown settings"
echo "  5. Click Provision"
echo ""
echo "For batch provisioning, run this script on each device."
echo ""
`;
}
