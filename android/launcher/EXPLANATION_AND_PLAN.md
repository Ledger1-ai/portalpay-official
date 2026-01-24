# Status, Actions Taken, and Plan to Deliver paynex APK

Objective: Create a second Android build under `/android` that uses the same GeckoView launcher but points to `https://paynex.azurewebsites.net` and applies the paynex branding (brandKey=paynex). Then build and push to the device.

## What I found

- The repo contains an Android launcher module at `android/launcher`, but the typical Gradle wrapper and source build files are not present in the repo:
  - No `gradlew.bat`, `settings.gradle`, or `build.gradle` found under `android/launcher/`.
  - No `app/build/outputs/apk/...` release APKs present.
  - The path `android/launcher/app/src/main/java/com/valor/launcher` exists (per directory tree), but file listings do not return any Java/Kotlin source files. The tree shows only directories, not the actual `.java`/`.kt` files.
- Your previously working command `cd android\launcher && gradlew.bat assembleRelease` failed with:
  ```
  'gradlew.bat' is not recognized as an internal or external command
  ```
  which indicates the Gradle wrapper is missing under `android/launcher`.

- There are build intermediates under `android/launcher/app/build/intermediates/...`, including entries referencing `com.pos.valorpay.portalpay` in `java_res`, but not the source files or final outputs.

## I did not delete or remove any files

- I did not run any delete commands and did not remove files from `android/launcher`.
- The absence of the Gradle wrapper and build scripts seems to predate my steps, or the outputs were never checked in, or previously cleaned.

## Actions taken to recover baseline APK

- Verified device connectivity via `adb devices` (device `0123456789ABCDEF` connected).
- Queried the installed package path:
  ```
  adb shell pm path com.pos.valorpay.portalpay
  ```
  Result:
  ```
  package:/data/app/.../com.pos.valorpay.portalpay-.../base.apk
  ```
- Pulled the installed APK to the repo:
  ```
  android/launcher/recovered/portalpay-base.apk
  ```
  (Completed successfully: ~276 MB pulled at ~36 MB/s)

## Why I downloaded apktool

- Since the Gradle wrapper and some build files are missing in the repo, a practical way to create a paynex version is to decompile the working `portalpay` APK, locate the GeckoView launcher configuration (target URL), update it to `https://paynex.azurewebsites.net`, optionally swap icons to paynex branding, rebuild, sign, install, and verify on device.

- I attempted to fetch apktool and generate a helper `apktool.bat`. The jar download succeeded, but creating the `.bat` file failed due to a PowerShell quoting issue. No files were deleted; the bat simply wasn't created successfully.

## Plan to deliver paynex APK (two paths)

### Path A: Patch recovered APK (fastest given current repo state)
1. Create `tools/apktool.bat` (simple batch file wrapper around `apktool.jar`).
2. Decompile `android/launcher/recovered/portalpay-base.apk` to `android/launcher/recovered/portalpay-src/`.
3. Search decompiled manifest and smali for:
   - GeckoView session and URL handling (e.g., `GeckoRuntime`, `GeckoSession`, `loadUri`), or any constant/BuildConfig `BASE_URL`.
   - References to the current container URL or domain.
4. Update target URL to `https://paynex.azurewebsites.net` (brandKey=paynex), and adjust icons to paynex (`public/brands/paynex/*`) if they are embedded as resources.
5. Rebuild APK with apktool.
6. Sign APK (debug keystore or your release keystore) using `apksigner` from the Android SDK.
7. Install APK via `adb install -r`, force-stop and start the activity, then capture a screenshot to confirm the paynex URL loads.

### Path B: Restore Gradle build and duplicate launcher (preferred long-term)
1. Restore or provide the missing Gradle files:
   - `android/launcher/gradlew.bat`
   - `android/launcher/settings.gradle`
   - `android/launcher/app/build.gradle`
   - `android/launcher/app/src/main/AndroidManifest.xml`
   - `android/launcher/app/src/main/java/com/valor/launcher/*` source (GeckoView launcher)
2. Create a new product flavor `paynex`:
   - Set `applicationIdSuffix ".paynex"` (or a distinct `applicationId`)
   - Introduce a `buildConfigField` or resource `string` for `BASE_URL = "https://paynex.azurewebsites.net"`
   - Point icon/mipmap resources to paynex branding
3. Build with `gradlew.bat assembleRelease`.
4. Install and verify on device.

Given the repo currently lacks Gradle wrapper and some build files, Path A (APK patching) is the quickest to meet the immediate requirement.

## Next immediate steps I will perform

- Create `tools/apktool.bat` directly (avoid PowerShell quoting pitfalls).
- Decompile `portalpay-base.apk` to source.
- Find and update the target URL to `https://paynex.azurewebsites.net`.
- Rebuild, sign, install, and verify.

If you prefer the Gradle approach, please provide or restore the missing build scripts/wrapper so I can duplicate the launcher properly as a new flavor/module.

## Verification

After building and installing the paynex APK, I will:
- Run `adb shell am start -n ...` to launch the activity.
- Capture a device screenshot via `adb shell screencap -p /sdcard/paynex_device.png` and `adb pull` it to the repo.
- Confirm the app launches and loads `https://paynex.azurewebsites.net` with paynex branding.
