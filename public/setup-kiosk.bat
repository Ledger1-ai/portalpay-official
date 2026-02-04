@echo off
setlocal
echo ===================================================
echo   Touchpoint Kiosk - Device Setup Script
echo ===================================================
echo.
echo This script will help you set up an Android device as a dedicated Kiosk.
echo.
echo PREREQUISITES:
echo 1. Android device connected via USB
echo 2. Developer Options enabled on device
echo 3. USB Debugging enabled on device
echo 4. "adb" command installed and in your PATH
echo 5. NO Google Accounts on the device (Settings > Accounts > Remove all)
echo.

:CHECK_ADB
echo Checking for connected config...
adb devices
echo.
set /p CONTINUE="Is your device listed above? (y/n): "
if /i "%CONTINUE%" neq "y" goto :EOF

:INSTALL_APK
echo.
echo Step 1: Install APK (Optional)
set /p DO_INSTALL="Do you want to install the APK now? (y/n): "
if /i "%DO_INSTALL%"=="y" (
    set /p APK_PATH="Enter full path to APK file (drag and drop here): "
    if defined APK_PATH (
        echo Installing...
        adb install -r -g %APK_PATH%
        if %ERRORLEVEL% neq 0 (
            echo Install failed. Please check the path and try again.
            pause
            goto :EOF
        )
        echo Install successful!
    )
)

:SET_DEVICE_OWNER
echo.
echo Step 2: Set Device Owner Mode
echo This allows the app to lock the screen and prevent exit.
echo.
echo Running: dpm set-device-owner ...
adb shell dpm set-device-owner com.example.basaltsurgemobile/.AppDeviceAdminReceiver

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Failed to set device owner.
    echo Common reason: There are accounts on the device.
    echo Please go to Settings > Accounts and remove ALL accounts (Google, WhatsApp, etc).
    echo Then run this script again.
    pause
    goto :EOF
)

echo.
echo [SUCCESS] Device owner set successfully!

:GRANT_PERMISSIONS
echo.
echo Step 3: Granting Overlay Permissions
echo This allows the app to auto-boot and show the unlock screen.
adb shell appops set com.example.basaltsurgemobile SYSTEM_ALERT_WINDOW allow
echo Permission granted.

:START_APP
echo.
echo Step 4: Starting App...
adb shell am start -n com.example.basaltsurgemobile/.MainActivity

echo.
echo ===================================================
echo   Setup Complete!
echo   Run "adb reboot" to test auto-boot.
echo ===================================================
pause
