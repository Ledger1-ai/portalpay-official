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

        // Generate the script content
        const scriptContent = generateSetupScript(brandKey, apkUrl);

        // Return as downloadable .bat file
        return new Response(scriptContent, {
            headers: {
                "Content-Type": "application/x-bat",
                "Content-Disposition": `attachment; filename="setup-${brandKey}-owner-mode.bat"`,
                "Cache-Control": "no-store",
            },
        });
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
    curl -L -o "%TEMP_APK%" "${apkUrl}"
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
