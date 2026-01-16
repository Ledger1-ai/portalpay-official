import { NextRequest, NextResponse } from "next/server";
import { requireThirdwebAuth } from "@/lib/auth";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

export const runtime = "nodejs";

function getContainerType(): "platform" | "partner" {
    const ct = String(process.env.NEXT_PUBLIC_CONTAINER_TYPE || process.env.CONTAINER_TYPE || "platform").toLowerCase();
    return ct === "partner" ? "partner" : "platform";
}

function getBrandKey(): string {
    return String(process.env.BRAND_KEY || process.env.NEXT_PUBLIC_BRAND_KEY || "").toLowerCase();
}

async function getApkBytes(appKey: string): Promise<Uint8Array | null> {
    // Prefer Azure Blob Storage if configured
    const conn = String(process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AZURE_BLOB_CONNECTION_STRING || "").trim();
    const container = String(process.env.PP_APK_CONTAINER || "portalpay").trim();
    if (conn && container) {
        const prefix = String(process.env.PP_APK_BLOB_PREFIX || "brands").trim().replace(/^\/+|\/+$/g, "");
        const { BlobServiceClient } = await import("@azure/storage-blob");
        const bsc = BlobServiceClient.fromConnectionString(conn);
        const cont = bsc.getContainerClient(container);

        // Try brand-specific APK from blob (works for portalpay, paynex, and ALL touchpoint variants)
        const tryBlob = async (key: string) => {
            try {
                const blobName = prefix ? `${prefix}/${key}-signed.apk` : `${key}-signed.apk`;
                console.log(`[APK ZIP] Checking blob: ${blobName}`);
                const blob = cont.getBlockBlobClient(blobName);
                if (await blob.exists()) {
                    const buf = await blob.downloadToBuffer();
                    console.log(`[APK ZIP] Found ${blobName} (${buf.length} bytes)`);
                    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
                }
            } catch (e: any) {
                console.warn(`[APK ZIP] Failed to check ${key}:`, e.message);
            }
            return null;
        };

        // 1. Try exact match
        let bytes = await tryBlob(appKey);

        // 2. Try aliases (surge <-> basaltsurge)
        if (!bytes) {
            if (appKey === "surge-touchpoint") {
                bytes = await tryBlob("basaltsurge-touchpoint");
            } else if (appKey === "basaltsurge-touchpoint") {
                bytes = await tryBlob("surge-touchpoint");
            }
        }

        if (bytes) return bytes;
    }

    // Local filesystem fallback
    const APP_TO_PATH: Record<string, string> = {
        portalpay: path.join("android", "launcher", "recovered", "portalpay-signed.apk"),
        paynex: path.join("android", "launcher", "recovered", "paynex-signed.apk"),
        "surge-touchpoint": path.join("android", "launcher", "recovered", "surge-touchpoint-signed.apk"),
    };
    const rel = APP_TO_PATH[appKey];
    if (!rel) return null;
    try {
        const filePath = path.join(process.cwd(), rel);
        const data = await fs.readFile(filePath);
        console.log(`[APK ZIP] Found ${appKey} in local filesystem`);
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } catch {
        return null;
    }
}

function buildInstallerBat(appKey: string, isTouchpoint: boolean = false): string {
    // Windows .bat script to assist operator installs via adb.exe
    // Assumes adb.exe available in PATH (Android Platform Tools)
    const apkName = `${appKey}.apk`;
    const title = isTouchpoint ? "Touchpoint" : "PortalPay/Paynex";
    return [
        "@echo off",
        "setlocal",
        `echo ${title} Installer`,
        "echo.",
        "where adb >nul 2>nul",
        "if %ERRORLEVEL% NEQ 0 (",
        "  echo ERROR: adb.exe not found in PATH.",
        "  echo Download Android Platform Tools from https://developer.android.com/tools/releases/platform-tools",
        "  pause",
        "  exit /b 1",
        ")",
        "adb start-server",
        "echo Checking devices...",
        "adb devices",
        "echo Ensure USB debugging is enabled and the RSA prompt is accepted on the device.",
        "echo.",
        `echo Installing ${apkName} ...`,
        `adb install -r "%~dp0${apkName}"`,
        "if %ERRORLEVEL% NEQ 0 (",
        "  echo Install failed. See above adb output.",
        "  pause",
        "  exit /b 1",
        ")",
        "echo Install succeeded.",
        "echo Launch the app with network enabled to register the install on first run.",
        "pause",
        "endlocal",
        ""
    ].join("\r\n");
}

function buildInstallerSh(appKey: string, isTouchpoint: boolean = false): string {
    // macOS/Linux shell script to assist operator installs via adb
    // Assumes adb available in PATH (Android Platform Tools)
    const apkName = `${appKey}.apk`;
    const title = isTouchpoint ? "Touchpoint" : "PortalPay/Paynex";
    return [
        "#!/bin/bash",
        "",
        `# ${title} Installer for macOS/Linux`,
        'set -e',
        "",
        'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
        `APK_NAME="${apkName}"`,
        "",
        'echo "PortalPay/Paynex Installer"',
        'echo ""',
        "",
        '# Check if adb is available',
        'if ! command -v adb &> /dev/null; then',
        '    echo "ERROR: adb not found in PATH."',
        '    echo "Download Android Platform Tools from https://developer.android.com/tools/releases/platform-tools"',
        '    echo "On macOS, you can also install via Homebrew: brew install android-platform-tools"',
        '    exit 1',
        'fi',
        "",
        '# Start ADB server',
        'adb start-server',
        "",
        '# List connected devices',
        'echo "Checking devices..."',
        'adb devices',
        'echo ""',
        'echo "Ensure USB debugging is enabled and the RSA prompt is accepted on the device."',
        'echo ""',
        "",
        '# Install the APK',
        'echo "Installing $APK_NAME ..."',
        'if adb install -r "$SCRIPT_DIR/$APK_NAME"; then',
        '    echo ""',
        '    echo "Install succeeded."',
        '    echo "Launch the app with network enabled to register the install on first run."',
        'else',
        '    echo ""',
        '    echo "Install failed. See above adb output."',
        '    exit 1',
        'fi',
        ""
    ].join("\n");
}

function buildReadme(appKey: string, brandKey: string, isTouchpoint: boolean = false): string {
    const appLabel = isTouchpoint
        ? `${brandKey.charAt(0).toUpperCase() + brandKey.slice(1)} Touchpoint`
        : (appKey === "paynex" ? "Paynex" : "PortalPay");
    return [
        `PortalPay Installer Package (${appLabel})`,
        ``,
        `Contents:`,
        `- ${appKey}.apk  (signed APK)`,
        `- install_${appKey}.bat  (Windows installer script using adb)`,
        `- install_${appKey}.sh   (macOS/Linux installer script using adb)`,
        ``,
        `Requirements:`,
        `- Android Platform Tools (adb) installed and on PATH`,
        `  - Windows: Download from https://developer.android.com/tools/releases/platform-tools`,
        `  - macOS: brew install android-platform-tools (or download from above)`,
        `  - Linux: apt install android-tools-adb (or download from above)`,
        `- Device with Developer Options -> USB debugging enabled`,
        `- Accept the RSA fingerprint prompt on first ADB connection`,
        ``,
        `Windows Steps:`,
        `1) Connect the Android device via USB`,
        `2) Double-click install_${appKey}.bat (or run in an elevated terminal)`,
        `3) After install completes, launch the app with network connectivity`,
        `4) On first launch, the app will phone-home to register the install for brand '${brandKey}'`,
        ``,
        `macOS/Linux Steps:`,
        `1) Connect the Android device via USB`,
        `2) Open Terminal and navigate to this folder`,
        `3) Make the script executable: chmod +x install_${appKey}.sh`,
        `4) Run the script: ./install_${appKey}.sh`,
        `5) After install completes, launch the app with network connectivity`,
        `6) On first launch, the app will phone-home to register the install for brand '${brandKey}'`,
        ``,
        `Note: If the device blocks ADB installs or staging, use enterprise provisioning (Device Owner) or native ADB CLI.`,
        ``
    ].join("\n");
}

/**
 * GET /api/admin/apk/zips/[app]
 * Returns a ZIP containing:
 * - {app}.apk
 * - install_{app}.bat
 * - README.txt
 *
 * Access: Admin or Superadmin. Partner containers gated to their own brand.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ app: string }> }) {
    try {
        const caller = await requireThirdwebAuth(req).catch(() => null);
        const roles = Array.isArray(caller?.roles) ? caller!.roles : [];
        if (!(roles.includes("admin") || roles.includes("superadmin"))) {
            return NextResponse.json({ error: "forbidden" }, { status: 403 });
        }

        const containerType = getContainerType();
        const envBrand = getBrandKey();
        const { searchParams } = new URL(req.url);
        const brandParam = searchParams.get("brand");

        const { app } = await ctx.params;
        const requestedApp = String(app || "").toLowerCase().trim();
        if (!requestedApp) {
            return NextResponse.json({ error: "app_key_required" }, { status: 400 });
        }

        // Resolve touchpoint to brand-specific APK key
        let effectiveKey = requestedApp;
        let isTouchpoint = false;
        if (requestedApp === "touchpoint") {
            isTouchpoint = true;
            if (containerType === "platform" && brandParam) {
                effectiveKey = `${brandParam.toLowerCase()}-touchpoint`;
            } else {
                effectiveKey = (envBrand && containerType === "partner")
                    ? `${envBrand}-touchpoint`
                    : "surge-touchpoint";
            }
        }

        // Partner container gating
        if (containerType === "partner") {
            // Allow touchpoint (resolves to their brand) or exact brand match
            if (requestedApp !== "touchpoint" && (!envBrand || requestedApp !== envBrand)) {
                return NextResponse.json({ error: "zip_not_visible" }, { status: 404 });
            }
        }

        const apkBytes = await getApkBytes(effectiveKey);
        if (!apkBytes) {
            return NextResponse.json({ error: "apk_not_found" }, { status: 404 });
        }

        const zip = new JSZip();
        zip.file(`${effectiveKey}.apk`, apkBytes);
        zip.file(`install_${effectiveKey}.bat`, buildInstallerBat(effectiveKey, isTouchpoint));
        zip.file(`install_${effectiveKey}.sh`, buildInstallerSh(effectiveKey, isTouchpoint));
        zip.file(`README.txt`, buildReadme(effectiveKey, envBrand || brandParam || "platform", isTouchpoint));

        // Generate ZIP as ArrayBuffer for type-safe Response BodyInit
        const arr = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
        const filename = `${effectiveKey}-installer.zip`;

        return new Response(arr, {
            headers: {
                "Content-Type": "application/zip",
                "Content-Length": String(arr.byteLength),
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                Pragma: "no-cache",
                Expires: "0",
            },
        });
    } catch {
        return NextResponse.json({ error: "zip_failed" }, { status: 500 });
    }
}
