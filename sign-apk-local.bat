@echo off
REM Local APK Signing Script
REM This bypasses the server-side signing entirely using local Java

setlocal

set "APK_PATH=%~1"
if "%APK_PATH%"=="" (
    echo Usage: sign-apk-local.bat "path\to\your.apk"
    echo.
    echo This will create a signed APK in the same directory.
    exit /b 1
)

set "SCRIPT_DIR=%~dp0"
set "SIGNER_JAR=%SCRIPT_DIR%tools\uber-apk-signer.jar"

if not exist "%SIGNER_JAR%" (
    echo ERROR: uber-apk-signer.jar not found at %SIGNER_JAR%
    exit /b 1
)

echo Signing APK: %APK_PATH%
echo.

java -jar "%SIGNER_JAR%" -a "%APK_PATH%" --allowResign

if %ERRORLEVEL% EQU 0 (
    echo.
    echo SUCCESS! Look for the signed APK file in the same directory.
    echo The signed file will have "-aligned-debugSigned" in the name.
) else (
    echo.
    echo FAILED! Check the error messages above.
)

pause
