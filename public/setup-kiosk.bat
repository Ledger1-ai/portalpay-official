@echo off
setlocal enabledelayedexpansion
echo ===================================================
echo   Owner Mode Setup Script (All Device Types)
echo ===================================================
echo.
echo This script sets up Android devices (Terminals, Tablets, Phones)
echo with Device Owner mode for full MDM lockdown.
echo.
echo PREREQUISITES:
echo 1. Android device connected via USB
echo 2. Developer Options + USB Debugging enabled
echo 3. NO Google Accounts on device (remove ALL accounts first)
echo 4. "adb" command available (or you can drag-drop the APK)
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

:GET_BRAND_KEY
echo.
echo ===================================================
echo   Step 1: Enter Brand Key
echo ===================================================
echo.
echo Enter the brand key for this device (e.g., basaltsurge, xoinpay, etc.)
echo This determines which branded APK to install and how the app appears.
echo.
set /p BRAND_KEY="Brand Key: "
if "%BRAND_KEY%"=="" (
    echo Brand key is required.
    goto :GET_BRAND_KEY
)
echo.
echo Brand Key: %BRAND_KEY%

:GET_APK_URL
echo.
echo ===================================================
echo   Step 2: APK Download URL (Optional)
echo ===================================================
echo.
echo You can either:
echo   A) Provide a direct APK download URL (from Admin Panel)
echo   B) Skip this and use a local APK file
echo.
set /p APK_URL="Enter APK URL (or press Enter to skip): "

if "%APK_URL%"=="" goto :LOCAL_APK

:DOWNLOAD_APK
echo.
echo Downloading APK from URL...
set "TEMP_APK=%TEMP%\%BRAND_KEY%-touchpoint.apk"

REM Try curl first, fall back to PowerShell
where curl >nul 2>nul
if %ERRORLEVEL%==0 (
    curl -L -o "%TEMP_APK%" "%APK_URL%"
) else (
    powershell -Command "Invoke-WebRequest -Uri '%APK_URL%' -OutFile '%TEMP_APK%'"
)

if not exist "%TEMP_APK%" (
    echo Failed to download APK. Please check the URL.
    pause
    goto :GET_APK_URL
)

echo APK downloaded to: %TEMP_APK%
set "APK_PATH=%TEMP_APK%"
goto :INSTALL_APK

:LOCAL_APK
echo.
echo ===================================================
echo   Step 2b: Local APK File
echo ===================================================
echo.
set /p DO_LOCAL="Do you have a local APK file to install? (y/n): "
if /i "%DO_LOCAL%"=="y" (
    set /p APK_PATH="Drag and drop APK file here (or enter full path): "
    REM Remove quotes if present
    set APK_PATH=!APK_PATH:"=!
    if not exist "!APK_PATH!" (
        echo File not found: !APK_PATH!
        goto :LOCAL_APK
    )
    goto :INSTALL_APK
) else (
    echo.
    echo WARNING: Skipping APK install. Make sure app is already installed.
    pause
    goto :SET_DEVICE_OWNER
)

:INSTALL_APK
echo.
echo ===================================================
echo   Step 3: Installing APK
echo ===================================================
echo.
echo Installing %APK_PATH%...
adb install -r -g "%APK_PATH%"
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] APK installation failed.
    echo Try uninstalling the app first with: adb uninstall com.example.basaltsurgemobile
    pause
    goto :EOF
)
echo [SUCCESS] APK installed!

:SET_DEVICE_OWNER
echo.
echo ===================================================
echo   Step 4: Setting Device Owner Mode
echo ===================================================
echo.
echo This enables full MDM lockdown (silent updates, exit protection).
echo.

REM First, check if app is installed
echo Checking if app is installed...
adb shell pm list packages | findstr /i "com.example.basaltsurgemobile" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] App is NOT installed on the device!
    echo.
    echo The app must be installed before setting Device Owner.
    echo Please go back and install the APK first.
    echo.
    pause
    goto :EOF
)
echo [OK] App is installed.

REM Check if there's already a device owner
REM Look for actual device owner (ComponentInfo), not just "Device Owner Type: -1" which means none
echo Checking for existing Device Owner...
for /f "tokens=*" %%a in ('adb shell dumpsys device_policy 2^>nul ^| findstr /c:"admin=ComponentInfo"') do set EXISTING_OWNER=%%a
if defined EXISTING_OWNER (
    echo.
    echo [WARNING] Device already has a Device Owner set!
    echo.
    echo Current owner: !EXISTING_OWNER!
    echo.
    echo To proceed, you must first remove the existing Device Owner:
    echo.
    echo OPTION 1 - If our app is the current owner:
    echo   adb shell dpm remove-active-admin com.example.basaltsurgemobile/.AppDeviceAdminReceiver
    echo.
    echo OPTION 2 - If a different app is the owner:
    echo   Factory reset the device (Settings ^> System ^> Reset)
    echo.
    set /p REMOVE_OWNER="Try to remove our app as Device Owner now? (y/n): "
    if /i "!REMOVE_OWNER!"=="y" (
        echo.
        echo Attempting to remove Device Owner...
        adb shell dpm remove-active-admin com.example.basaltsurgemobile/.AppDeviceAdminReceiver
        if !ERRORLEVEL! neq 0 (
            echo [FAILED] Could not remove Device Owner.
            echo The device may have a different app as Owner, or needs a factory reset.
            pause
            goto :EOF
        )
        echo [OK] Device Owner removed. Continuing setup...
    ) else (
        echo.
        echo Please remove the Device Owner manually, then run this script again.
        pause
        goto :EOF
    )
)

REM Check for accounts (common blocker)
echo Checking for Google accounts...
for /f %%a in ('adb shell pm list users 2^>nul ^| find /c "UserInfo"') do set USER_COUNT=%%a
adb shell dumpsys account 2>nul | findstr /i "Account {" >nul
if %ERRORLEVEL%==0 (
    echo.
    echo [WARNING] Accounts detected on device!
    echo.
    echo Device Owner cannot be set while accounts exist.
    echo Please remove ALL accounts:
    echo   Settings ^> Accounts ^> [each account] ^> Remove
    echo.
    echo After removing accounts, run this script again.
    pause
    goto :EOF
)
echo [OK] No accounts detected.

REM Now attempt to set device owner
echo.
echo Setting Device Owner...
adb shell dpm set-device-owner com.example.basaltsurgemobile/.AppDeviceAdminReceiver 2>&1

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Failed to set Device Owner.
    echo.
    echo An unexpected error occurred. Please try:
    echo   1. Reboot the device and try again
    echo   2. Factory reset if problem persists
    echo.
    pause
    goto :EOF
)

echo.
echo [SUCCESS] Device Owner mode set!

:GRANT_PERMISSIONS
echo.
echo ===================================================
echo   Step 5: Granting Permissions
echo ===================================================
echo.
echo Granting overlay permission...
adb shell appops set com.example.basaltsurgemobile SYSTEM_ALERT_WINDOW allow
echo Permissions granted.

:START_APP
echo.
echo ===================================================
echo   Step 6: Starting App with Brand Configuration
echo ===================================================
echo.
echo Starting app with brand key: %BRAND_KEY%
adb shell am start -n com.example.basaltsurgemobile/.MainActivity --es brandKey "%BRAND_KEY%"

echo.
echo ===================================================
echo   SETUP COMPLETE!
echo ===================================================
echo.
echo Device: Owner Mode enabled
echo Brand:  %BRAND_KEY%
echo.
echo The device will now load the setup page.
echo Complete provisioning from the Admin Panel:
echo   1. Go to Admin ^> Touchpoints ^> Provision Device
echo   2. Enter the Installation ID shown on device
echo   3. Select mode (Terminal/Handheld/Kiosk)
echo   4. Choose "Owner / Full Lockdown" mode
echo   5. Click Provision
echo.
echo To test auto-boot: adb reboot
echo.
pause
