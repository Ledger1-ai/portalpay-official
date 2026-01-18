import { NextRequest, NextResponse } from "next/server";
import { requireThirdwebAuth } from "@/lib/auth";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

function json(obj: any, init?: { status?: number; headers?: Record<string, string> }) {
    const s = JSON.stringify(obj);
    const len = new TextEncoder().encode(s).length;
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Content-Length": String(len),
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        ...(init?.headers || {}),
    };
    return new NextResponse(s, { status: init?.status ?? 200, headers });
}

/**
 * Get the base Container APK (portalpay-signed.apk / paynex-signed.apk) to act as the base.
 * Aligned with Partner Container logic.
 */
async function getBaseApkBytes(brandKey: string): Promise<Uint8Array | null> {
    const conn = String(process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AZURE_BLOB_CONNECTION_STRING || "").trim();
    const container = String(process.env.PP_APK_CONTAINER || "portalpay").trim();

    if (conn && container) {
        try {
            const prefix = String(process.env.PP_APK_BLOB_PREFIX || "brands").trim().replace(/^\/+|\/+$/g, "");
            const { BlobServiceClient } = await import("@azure/storage-blob");
            const bsc = BlobServiceClient.fromConnectionString(conn);
            const cont = bsc.getContainerClient(container);

            // 1. Try brand-specific signed APK (unlikely for broad touchpoint use, but check)
            const blobName = prefix ? `${prefix}/${brandKey}-signed.apk` : `${brandKey}-signed.apk`;
            const blob = cont.getBlockBlobClient(blobName);
            if (await blob.exists()) {
                const buf = await blob.downloadToBuffer();
                console.log(`[Touchpoint Build] Found base APK in blob: ${blobName}`);
                return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
            }

            // 2. Fallback: portalpay-signed.apk (The standard container base)
            const fallbackBlobName = prefix ? `${prefix}/portalpay-signed.apk` : `portalpay-signed.apk`;
            const fallbackBlob = cont.getBlockBlobClient(fallbackBlobName);
            if (await fallbackBlob.exists()) {
                const buf = await fallbackBlob.downloadToBuffer();
                console.log(`[Touchpoint Build] Found fallback base APK in blob: ${fallbackBlobName}`);
                return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
            }

        } catch (e) {
            console.warn("[Touchpoint Build] Blob fetch failed, trying local.", e);
        }
    }

    // Local Fallback (Dev environment)
    const possiblePaths = [
        path.join(process.cwd(), "android", "launcher", "recovered", "portalpay-signed.apk"),
        path.join(process.cwd(), "android", "launcher", "recovered", "paynex-signed.apk"),
    ];

    for (const p of possiblePaths) {
        try {
            const data = await fs.readFile(p);
            console.log(`[Touchpoint Build] Using local base APK: ${p}`);
            return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        } catch { }
    }

    return null;
}

// --- Installer Script Helpers (Copied from package/route.ts) ---

function buildInstallerBat(brandKey: string): string {
    const apkName = `${brandKey}-touchpoint.apk`;
    return [
        "@echo off",
        "setlocal",
        `echo ${brandKey} Touchpoint Installer`,
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

function buildInstallerSh(brandKey: string): string {
    const apkName = `${brandKey}-touchpoint.apk`;
    return [
        "#!/bin/bash",
        "",
        `# ${brandKey} Touchpoint Installer for macOS/Linux`,
        "set -e",
        "",
        'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
        `APK_NAME="${apkName}"`,
        "",
        `echo "${brandKey} Touchpoint Installer"`,
        'echo ""',
        "",
        "# Check if adb is available",
        "if ! command -v adb &> /dev/null; then",
        '    echo "ERROR: adb not found in PATH."',
        '    echo "Download Android Platform Tools from https://developer.android.com/tools/releases/platform-tools"',
        '    echo "On macOS, you can also install via Homebrew: brew install android-platform-tools"',
        "    exit 1",
        "fi",
        "",
        "# Start ADB server",
        "adb start-server",
        "",
        "# List connected devices",
        'echo "Checking devices..."',
        "adb devices",
        'echo ""',
        'echo "Ensure USB debugging is enabled and the RSA prompt is accepted on the device."',
        'echo ""',
        "",
        "# Install the APK",
        'echo "Installing $APK_NAME ..."',
        'if adb install -r "$SCRIPT_DIR/$APK_NAME"; then',
        '    echo ""',
        '    echo "Install succeeded."',
        '    echo "Launch the app with network enabled to register the install on first run."',
        "else",
        '    echo ""',
        '    echo "Install failed. See above adb output."',
        "    exit 1",
        "fi",
        ""
    ].join("\n");
}

function buildReadme(brandKey: string, endpoint?: string): string {
    const lines = [
        `${brandKey} Touchpoint Installer Package`,
        ``,
    ];

    if (endpoint) {
        lines.push(`Target Endpoint: ${endpoint}`);
        lines.push(``);
    }

    lines.push(
        `Contents:`,
        `- ${brandKey}-touchpoint.apk  (unsigned APK - enable install from unknown sources / unsigned)`,
        `- install_${brandKey}.bat  (Windows installer script using adb)`,
        `- install_${brandKey}.sh   (macOS/Linux installer script using adb)`,
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
        `2) Double-click install_${brandKey}.bat (or run in an elevated terminal)`,
        `3) After install completes, launch the app with network connectivity`,
        ``,
        `macOS/Linux Steps:`,
        `1) Connect the Android device via USB`,
        `2) Open Terminal and navigate to this folder`,
        `3) Make the script executable: chmod +x install_${brandKey}.sh`,
        `4) Run the script: ./install_${brandKey}.sh`,
        `5) After install completes, launch the app with network connectivity`,
        ``,
    );

    return lines.join("\n");
}

// ----------------------------------------------------------------

/**
 * Modify wrap.html inside the APK (Fast JSZip Method).
 */
async function modifyApkEndpoint(apkBytes: Uint8Array, endpoint: string): Promise<Uint8Array> {
    const apkZip = await JSZip.loadAsync(apkBytes);

    // Find and modify wrap.html in assets folder
    const wrapHtmlPath = "assets/wrap.html";
    const wrapHtmlFile = apkZip.file(wrapHtmlPath);

    if (wrapHtmlFile) {
        let content = await wrapHtmlFile.async("string");

        // Ensure specific Touchpoint param
        const finalEndpoint = endpoint.includes("scale=") ? endpoint : `${endpoint}?scale=0.75`;
        console.log(`[Touchpoint Build] Injecting endpoint: ${finalEndpoint}`);

        // Regex 1: The standard wrap.html config
        // var src = qp.get("src") || "https://..."
        const endpointPattern = /var\s+src\s*=\s*qp\.get\s*\(\s*["']src["']\s*\)\s*\|\|\s*["']([^"']+)["']/;
        const match = content.match(endpointPattern);

        let modified = false;
        if (match) {
            content = content.replace(
                endpointPattern,
                `var src = qp.get("src") || "${finalEndpoint}"`
            );
            modified = true;
        } else {
            // Regex 2: Fallback replacement of hardcoded Azure URL
            const fallbackPattern = /https:\/\/(?:paynex|portalpay)\.azurewebsites\.net/g;
            if (fallbackPattern.test(content)) {
                content = content.replace(fallbackPattern, finalEndpoint);
                modified = true;
            }
        }

        if (modified) {
            apkZip.file(wrapHtmlPath, content);
            console.log(`[Touchpoint Build] Modified wrap.html successfully.`);
        } else {
            console.warn("[Touchpoint Build] WARNING: Could not find URL pattern in wrap.html to replace.");
        }

    } else {
        console.warn(`[Touchpoint Build] wrap.html not found! Is this the correct base APK?`);
    }

    // Remove old signature files - APK will be unsigned after modification
    const filesToRemove: string[] = [];
    apkZip.forEach((relativePath) => {
        if (relativePath.startsWith("META-INF/")) {
            filesToRemove.push(relativePath);
        }
    });
    for (const file of filesToRemove) {
        apkZip.remove(file);
    }
    console.log(`[Touchpoint Build] Removed ${filesToRemove.length} signature files.`);

    // Re-generate APK with proper per-file compression (Crucial for Android)
    const mustBeUncompressed = (filePath: string): boolean => {
        const name = filePath.split("/").pop() || "";
        if (name === "resources.arsc") return true;
        if (name.endsWith(".so")) return false; // Usually compressed in APK, extracted by OS
        return false;
    };

    const newApkZip = new JSZip();
    const allFiles: { path: string; file: JSZip.JSZipObject }[] = [];
    apkZip.forEach((relativePath, file) => {
        if (!file.dir) allFiles.push({ path: relativePath, file });
    });

    // Sequential processing to match partner route logic exactly without async concurrency issues
    let uncompressedCount = 0;
    for (const { path: filePath, file } of allFiles) {
        const content = await file.async("nodebuffer");
        const compress = !mustBeUncompressed(filePath);

        if (!compress) uncompressedCount++;

        newApkZip.file(filePath, content, {
            compression: compress ? "DEFLATE" : "STORE",
            compressionOptions: compress ? { level: 6 } : undefined,
        });
    }
    console.log(`[Touchpoint Build] ${uncompressedCount} files stored uncompressed (resources.arsc).`);

    const modifiedApk = await newApkZip.generateAsync({
        type: "nodebuffer",
        platform: "UNIX",
    });

    return new Uint8Array(modifiedApk.buffer, modifiedApk.byteOffset, modifiedApk.byteLength);
}






/**
 * Setup ZIP package and upload
 */
async function uploadPackage(brandKey: string, apkBytes: Uint8Array, endpoint?: string) {
    const conn = String(process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AZURE_BLOB_CONNECTION_STRING || "").trim();
    const container = String(process.env.PP_PACKAGES_CONTAINER || "device-packages").trim(); // Default to packages container

    if (!conn) throw new Error("Azure Storage not configured");

    // Create ZIP containing APK and scripts
    const zip = new JSZip();
    zip.file(`${brandKey}-touchpoint.apk`, apkBytes);
    zip.file(`install_${brandKey}.bat`, buildInstallerBat(brandKey));
    zip.file(`install_${brandKey}.sh`, buildInstallerSh(brandKey));
    zip.file(`README.txt`, buildReadme(brandKey, endpoint));

    const zipBuffer = await zip.generateAsync({
        type: "nodebuffer",
        compression: "STORE"
    });

    const { BlobServiceClient } = await import("@azure/storage-blob");
    const bsc = BlobServiceClient.fromConnectionString(conn);
    const cont = bsc.getContainerClient(container);
    await cont.createIfNotExists({ access: "blob" });

    // Upload ZIP
    // const prefix = String(process.env.PP_APK_BLOB_PREFIX || "brands").trim().replace(/^\/+|\/+$/g, "");
    const blobName = `${brandKey}/${brandKey}-touchpoint-installer.zip`;
    const blob = cont.getBlockBlobClient(blobName);

    await blob.uploadData(zipBuffer, {
        blobHTTPHeaders: {
            blobContentType: "application/zip",
            blobContentDisposition: `attachment; filename="${brandKey}-touchpoint-installer.zip"`,
        },
        metadata: {
            brandKey,
            createdAt: new Date().toISOString(),
            type: "touchpoint-installer"
        }
    });

    return { url: blob.url, size: zipBuffer.byteLength };
}

/**
 * POST /api/touchpoint/build
 */
export async function POST(req: NextRequest) {
    try {
        await requireThirdwebAuth(req); // verify user exists, strictly speaking
    } catch {
        return json({ error: "unauthorized" }, { status: 401 });
    }

    let body;
    try { body = await req.json(); } catch { return json({ error: "invalid_body" }, { status: 400 }); }

    const brandKey = String(body.brandKey || "").trim();
    const endpoint = String(body.endpoint || "").trim();

    if (!brandKey) return json({ error: "brandKey required" }, { status: 400 });

    try {
        // 1. Get Base APK
        const baseBytes = await getBaseApkBytes(brandKey);
        if (!baseBytes) return json({ error: "No base APK found for touchpoint. Expected portalpay-signed.apk in storage." }, { status: 404 });

        // 2. Modify Logic (JSZip - Fast)
        let processedBytes = baseBytes;
        if (endpoint) {
            processedBytes = await modifyApkEndpoint(baseBytes, endpoint);
        }

        // 3. Sign Logic SKIPPED (Strict Parity with Partner Logic)
        // Code parity: Partner logic strips META-INF but does not re-sign.
        // This avoids timeout (524) and matches the Xoinpay process.
        // processedBytes = await signApk(processedBytes, brandKey);


        // 4. Upload Package (ZIP)
        const result = await uploadPackage(brandKey, processedBytes, endpoint);

        return json({
            success: true,
            blobUrl: result.url,
            size: result.size
        });

    } catch (e: any) {
        console.error("[Touchpoint Build] Error:", e);
        return json({ error: e.message || "Build failed" }, { status: 500 });
    }
}
