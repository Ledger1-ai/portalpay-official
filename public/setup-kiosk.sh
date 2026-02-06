#!/bin/bash
# ===================================================
#   Owner Mode Setup Script (All Device Types) - macOS/Linux
# ===================================================

echo "==================================================="
echo "  Owner Mode Setup Script (All Device Types)"
echo "==================================================="
echo ""
echo "This script sets up Android devices (Terminals, Tablets, Phones)"
echo "with Device Owner mode for full MDM lockdown."
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
if [[ ! "$CONTINUE" =~ ^[Yy]$ ]]; then
    echo "Please connect device and enable USB Debugging."
    exit 1
fi

# Step 1: Get Brand Key
echo ""
echo "==================================================="
echo "  Step 1: Enter Brand Key"
echo "==================================================="
echo ""
echo "Enter the brand key for this device (e.g., basaltsurge, xoinpay, etc.)"
echo "This determines which branded APK to install and how the app appears."
echo ""
read -p "Brand Key: " BRAND_KEY
if [ -z "$BRAND_KEY" ]; then
    echo "Brand key is required."
    exit 1
fi
echo ""
echo "Brand Key: $BRAND_KEY"

# Step 2: APK Download
echo ""
echo "==================================================="
echo "  Step 2: APK Download URL (Optional)"
echo "==================================================="
echo ""
echo "You can either:"
echo "  A) Provide a direct APK download URL (from Admin Panel)"
echo "  B) Skip this and use a local APK file"
echo ""
read -p "Enter APK URL (or press Enter to skip): " APK_URL

if [ -n "$APK_URL" ]; then
    # Download APK
    echo ""
    echo "Downloading APK from URL..."
    TEMP_APK="/tmp/${BRAND_KEY}-touchpoint.apk"
    
    if command -v curl &> /dev/null; then
        curl -L -o "$TEMP_APK" "$APK_URL"
    elif command -v wget &> /dev/null; then
        wget -O "$TEMP_APK" "$APK_URL"
    else
        echo "[ERROR] Neither curl nor wget found. Please install one."
        exit 1
    fi
    
    if [ ! -f "$TEMP_APK" ]; then
        echo "Failed to download APK. Please check the URL."
        exit 1
    fi
    
    echo "APK downloaded to: $TEMP_APK"
    APK_PATH="$TEMP_APK"
else
    # Local APK
    echo ""
    echo "==================================================="
    echo "  Step 2b: Local APK File"
    echo "==================================================="
    echo ""
    read -p "Do you have a local APK file to install? (y/n): " DO_LOCAL
    if [[ "$DO_LOCAL" =~ ^[Yy]$ ]]; then
        read -p "Enter full path to APK file: " APK_PATH
        # Remove quotes if present
        APK_PATH="${APK_PATH//\"/}"
        if [ ! -f "$APK_PATH" ]; then
            echo "File not found: $APK_PATH"
            exit 1
        fi
    else
        echo ""
        echo "WARNING: Skipping APK install. Make sure app is already installed."
        read -p "Press Enter to continue..."
        APK_PATH=""
    fi
fi

# Step 3: Install APK (if provided)
if [ -n "$APK_PATH" ]; then
    echo ""
    echo "==================================================="
    echo "  Step 3: Installing APK"
    echo "==================================================="
    echo ""
    echo "Installing $APK_PATH..."
    if ! adb install -r -g "$APK_PATH"; then
        echo ""
        echo "[ERROR] APK installation failed."
        echo "Try uninstalling the app first with: adb uninstall com.example.basaltsurgemobile"
        exit 1
    fi
    echo "[SUCCESS] APK installed!"
fi

# Step 4: Set Device Owner
echo ""
echo "==================================================="
echo "  Step 4: Setting Device Owner Mode"
echo "==================================================="
echo ""
echo "This enables full MDM lockdown (silent updates, exit protection)."
echo ""

# Check if app is installed
echo "Checking if app is installed..."
if ! adb shell pm list packages | grep -qi "com.example.basaltsurgemobile"; then
    echo ""
    echo "[ERROR] App is NOT installed on the device!"
    echo ""
    echo "The app must be installed before setting Device Owner."
    echo "Please go back and install the APK first."
    exit 1
fi
echo "[OK] App is installed."

# Check for existing Device Owner
echo "Checking for existing Device Owner..."
# Look for actual device owner package (not just "Device Owner Type: -1" which means none)
EXISTING_OWNER=$(adb shell dumpsys device_policy 2>/dev/null | grep -E "Device Owner.*admin=ComponentInfo" | head -1)
if [ -n "$EXISTING_OWNER" ]; then
    echo ""
    echo "[WARNING] Device already has a Device Owner set!"
    echo ""
    echo "Current owner: $EXISTING_OWNER"
    echo ""
    echo "To proceed, you must first remove the existing Device Owner:"
    echo ""
    echo "OPTION 1 - If our app is the current owner:"
    echo "  Use Admin Panel > Touchpoints > [device] > Remove Device Owner"
    echo ""
    echo "OPTION 2 - If a different app is the owner:"
    echo "  Factory reset the device (Settings > System > Reset)"
    echo ""
    read -p "Try to remove our app as Device Owner now? (y/n): " REMOVE_OWNER
    if [[ "$REMOVE_OWNER" =~ ^[Yy]$ ]]; then
        echo ""
        echo "Attempting to remove Device Owner..."
        # Note: This usually won't work via ADB due to Android security
        # The app must remove itself programmatically
        if ! adb shell dpm remove-active-admin com.example.basaltsurgemobile/.AppDeviceAdminReceiver 2>&1; then
            echo ""
            echo "[INFO] ADB removal failed (expected - Android security restriction)."
            echo ""
            echo "Device Owner must be removed via:"
            echo "  1. Admin Panel remote command (if device has network)"
            echo "  2. Factory reset"
            echo ""
            read -p "Continue anyway? The device may need a factory reset. (y/n): " FORCE_CONTINUE
            if [[ ! "$FORCE_CONTINUE" =~ ^[Yy]$ ]]; then
                exit 1
            fi
        else
            echo "[OK] Device Owner removed. Continuing setup..."
        fi
    else
        echo ""
        echo "Please remove the Device Owner manually, then run this script again."
        exit 1
    fi
fi

# Check for accounts
echo "Checking for Google accounts..."
if adb shell dumpsys account 2>/dev/null | grep -qi "Account {"; then
    echo ""
    echo "[WARNING] Accounts detected on device!"
    echo ""
    echo "Device Owner cannot be set while accounts exist."
    echo "Please remove ALL accounts:"
    echo "  Settings > Accounts > [each account] > Remove"
    echo ""
    echo "After removing accounts, run this script again."
    exit 1
fi
echo "[OK] No accounts detected."

# Set Device Owner
echo ""
echo "Setting Device Owner..."
if ! adb shell dpm set-device-owner com.example.basaltsurgemobile/.AppDeviceAdminReceiver 2>&1; then
    echo ""
    echo "[ERROR] Failed to set Device Owner."
    echo ""
    echo "An unexpected error occurred. Please try:"
    echo "  1. Reboot the device and try again"
    echo "  2. Factory reset if problem persists"
    exit 1
fi

echo ""
echo "[SUCCESS] Device Owner mode set!"

# Step 5: Grant Permissions
echo ""
echo "==================================================="
echo "  Step 5: Granting Permissions"
echo "==================================================="
echo ""
echo "Granting overlay permission..."
adb shell appops set com.example.basaltsurgemobile SYSTEM_ALERT_WINDOW allow
echo "Permissions granted."

# Step 6: Start App
echo ""
echo "==================================================="
echo "  Step 6: Starting App with Brand Configuration"
echo "==================================================="
echo ""
echo "Starting app with brand key: $BRAND_KEY"
adb shell am start -n com.example.basaltsurgemobile/.MainActivity --es brandKey "$BRAND_KEY"

echo ""
echo "==================================================="
echo "  SETUP COMPLETE!"
echo "==================================================="
echo ""
echo "Device: Owner Mode enabled"
echo "Brand:  $BRAND_KEY"
echo ""
echo "The device will now load the setup page."
echo "Complete provisioning from the Admin Panel:"
echo "  1. Go to Admin > Touchpoints > Provision Device"
echo "  2. Enter the Installation ID shown on device"
echo "  3. Select mode (Terminal/Handheld/Kiosk)"
echo "  4. Choose 'Owner / Full Lockdown' mode"
echo "  5. Click Provision"
echo ""
echo "To test auto-boot: adb reboot"
echo ""
