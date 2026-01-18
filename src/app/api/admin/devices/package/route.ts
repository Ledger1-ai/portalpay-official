import { NextRequest, NextResponse } from "next/server";
import { requireThirdwebAuth } from "@/lib/auth";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
 * Get APK bytes from blob storage or local filesystem
 * For white-label brands, falls back to the base PortalPay APK since
 * the brand identity is determined by the web app, not the APK itself.
 */
async function getApkBytes(brandKey: string): Promise<{ bytes: Uint8Array; source: string } | null> {
  // Prefer Azure Blob Storage if configured
  const conn = String(process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AZURE_BLOB_CONNECTION_STRING || "").trim();
  const container = String(process.env.PP_APK_CONTAINER || "portalpay").trim();

  if (conn && container) {
    const prefix = String(process.env.PP_APK_BLOB_PREFIX || "brands").trim().replace(/^\/+|\/+$/g, "");
    const { BlobServiceClient } = await import("@azure/storage-blob");
    const bsc = BlobServiceClient.fromConnectionString(conn);
    const cont = bsc.getContainerClient(container);

    // Try brand-specific APK first
    try {
      const blobName = prefix ? `${prefix}/${brandKey}-signed.apk` : `${brandKey}-signed.apk`;
      const blob = cont.getBlockBlobClient(blobName);
      if (await blob.exists()) {
        const buf = await blob.downloadToBuffer();
        return {
          bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
          source: `blob:${blobName}`
        };
      }
    } catch { }

    // Fall back to base PortalPay APK for white-label brands
    if (brandKey !== "portalpay" && brandKey !== "paynex") {
      try {
        const fallbackBlobName = prefix ? `${prefix}/portalpay-signed.apk` : `portalpay-signed.apk`;
        const fallbackBlob = cont.getBlockBlobClient(fallbackBlobName);
        if (await fallbackBlob.exists()) {
          const buf = await fallbackBlob.downloadToBuffer();
          return {
            bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
            source: `blob:${fallbackBlobName} (base APK for white-label)`
          };
        }
      } catch { }
    }
  }

  // Local filesystem fallback (for portalpay/paynex)
  const APP_TO_PATH: Record<string, string> = {
    portalpay: path.join("android", "launcher", "recovered", "portalpay-signed.apk"),
    paynex: path.join("android", "launcher", "recovered", "paynex-signed.apk"),
  };

  // Try brand-specific path
  let rel = APP_TO_PATH[brandKey];

  // Fall back to portalpay for white-label brands
  if (!rel && brandKey !== "portalpay" && brandKey !== "paynex") {
    rel = APP_TO_PATH["portalpay"];
  }

  if (!rel) return null;

  try {
    const filePath = path.join(process.cwd(), rel);
    const data = await fs.readFile(filePath);
    const isBase = brandKey !== "portalpay" && brandKey !== "paynex";
    return {
      bytes: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      source: isBase ? `local:${rel} (base APK for white-label)` : `local:${rel}`
    };
  } catch {
    return null;
  }
}

function buildInstallerBat(brandKey: string): string {
  const apkName = `${brandKey}.apk`;
  return [
    "@echo off",
    "setlocal",
    `echo ${brandKey} Installer`,
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
  const apkName = `${brandKey}.apk`;
  return [
    "#!/bin/bash",
    "",
    `# ${brandKey} Installer for macOS/Linux`,
    'set -e',
    "",
    'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    `APK_NAME="${apkName}"`,
    "",
    `echo "${brandKey} Installer"`,
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

function buildReadme(brandKey: string, endpoint?: string): string {
  const lines = [
    `${brandKey} Installer Package`,
    ``,
  ];

  if (endpoint) {
    lines.push(`Target Endpoint: ${endpoint}`);
    lines.push(``);
  }

  lines.push(
    `Contents:`,
    `- ${brandKey}.apk  (signed APK)`,
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
    `4) On first launch, the app will phone-home to register the install for brand '${brandKey}'`,
    ``,
    `macOS/Linux Steps:`,
    `1) Connect the Android device via USB`,
    `2) Open Terminal and navigate to this folder`,
    `3) Make the script executable: chmod +x install_${brandKey}.sh`,
    `4) Run the script: ./install_${brandKey}.sh`,
    `5) After install completes, launch the app with network connectivity`,
    `6) On first launch, the app will phone-home to register the install for brand '${brandKey}'`,
    ``,
  );

  if (endpoint) {
    lines.push(
      `Configured Endpoint:`,
      `This package was generated with target endpoint: ${endpoint}`,
      `The APK wrapper will load this endpoint at runtime.`,
      ``
    );
  }

  lines.push(
    `Note: If the device blocks ADB installs or staging, use enterprise provisioning (Device Owner) or native ADB CLI.`,
    ``
  );

  return lines.join("\n");
}

/**
 * Modify wrap.html inside the APK to change the default endpoint
 * APK files are ZIP archives, so we can use JSZip to modify them
 * 
 * IMPORTANT: For Android R+ (API 30+), resources.arsc must be stored UNCOMPRESSED.
 * We need to rebuild the ZIP with per-file compression settings.
 */
async function modifyApkEndpoint(apkBytes: Uint8Array, endpoint: string): Promise<Uint8Array> {
  const apkZip = await JSZip.loadAsync(apkBytes);

  // Find and modify wrap.html in assets folder
  const wrapHtmlPath = "assets/wrap.html";
  const wrapHtmlFile = apkZip.file(wrapHtmlPath);

  if (wrapHtmlFile) {
    let content = await wrapHtmlFile.async("string");

    // Replace the default endpoint in wrap.html
    // Original: var src = qp.get("src") || "https://paynex.azurewebsites.net";
    // We need to replace the fallback URL
    const endpointPattern = /var\s+src\s*=\s*qp\.get\s*\(\s*["']src["']\s*\)\s*\|\|\s*["']([^"']+)["']/;
    const match = content.match(endpointPattern);

    if (match) {
      const oldEndpoint = match[1];
      content = content.replace(
        endpointPattern,
        `var src = qp.get("src") || "${endpoint}"`
      );
      console.log(`[APK] Modified wrap.html endpoint: ${oldEndpoint} -> ${endpoint}`);
    } else {
      // Try a simpler replacement for the default URL
      content = content.replace(
        /https:\/\/paynex\.azurewebsites\.net/g,
        endpoint
      );
      console.log(`[APK] Replaced paynex.azurewebsites.net with ${endpoint} in wrap.html`);
    }

    apkZip.file(wrapHtmlPath, content);
  } else {
    console.warn(`[APK] wrap.html not found at ${wrapHtmlPath}`);
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
  console.log(`[APK] Removed ${filesToRemove.length} signature files from META-INF/`);

  // Re-generate APK with proper per-file compression
  // IMPORTANT: resources.arsc MUST be uncompressed for Android R+ (API 30+)
  const mustBeUncompressed = (filePath: string): boolean => {
    const name = filePath.split("/").pop() || "";
    // resources.arsc MUST be uncompressed and aligned for Android R+
    if (name === "resources.arsc") return true;
    // .so files CAN be compressed - Android extracts them at install time
    return false;
  };

  // Create a new ZIP with proper per-file compression settings
  const newApkZip = new JSZip();

  // Copy all files with appropriate compression
  const allFiles: { path: string; file: JSZip.JSZipObject }[] = [];
  apkZip.forEach((relativePath, file) => {
    if (!file.dir) {
      allFiles.push({ path: relativePath, file });
    }
  });

  // Sequential processing for deterministic ZIP generation
  // (Fixes potential race/memory issues with JSZip on large files)
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
  console.log(`[APK] ${uncompressedCount} files stored uncompressed (resources.arsc)`);

  const modifiedApk = await newApkZip.generateAsync({
    type: "nodebuffer",
    platform: "UNIX",
  });

  return new Uint8Array(modifiedApk.buffer, modifiedApk.byteOffset, modifiedApk.byteLength);
}

/**
 * Generate ZIP package and optionally upload to blob storage
 */
async function generateAndUploadPackage(
  brandKey: string,
  apkBytes: Uint8Array,
  endpoint?: string
): Promise<{
  success: boolean;
  blobUrl?: string;
  sasUrl?: string;
  error?: string;
  size?: number;
  endpoint?: string;
}> {
  // Modify APK if endpoint is specified
  let finalApkBytes = apkBytes;
  if (endpoint) {
    try {
      finalApkBytes = await modifyApkEndpoint(apkBytes, endpoint);
    } catch (e: any) {
      console.error(`[APK] Failed to modify endpoint: ${e?.message}`);
      // Continue with original APK if modification fails
    }
  }

  // Create ZIP
  const zip = new JSZip();
  zip.file(`${brandKey}.apk`, finalApkBytes);
  zip.file(`install_${brandKey}.bat`, buildInstallerBat(brandKey));
  zip.file(`install_${brandKey}.sh`, buildInstallerSh(brandKey));
  zip.file(`README.txt`, buildReadme(brandKey, endpoint));

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 }
  });

  // Upload to blob storage
  const conn = String(process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AZURE_BLOB_CONNECTION_STRING || "").trim();
  const container = String(process.env.PP_PACKAGES_CONTAINER || "device-packages").trim();

  if (!conn) {
    return { success: false, error: "AZURE_STORAGE_CONNECTION_STRING or AZURE_BLOB_CONNECTION_STRING not configured" };
  }

  try {
    const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = await import("@azure/storage-blob");
    const bsc = BlobServiceClient.fromConnectionString(conn);
    const cont = bsc.getContainerClient(container);

    // Create container if it doesn't exist
    await cont.createIfNotExists({ access: "blob" });

    const blobName = `${brandKey}/${brandKey}-installer.zip`;
    const blob = cont.getBlockBlobClient(blobName);

    // Upload
    await blob.uploadData(zipBuffer, {
      blobHTTPHeaders: {
        blobContentType: "application/zip",
        blobContentDisposition: `attachment; filename="${brandKey}-installer.zip"`,
      },
      metadata: {
        brandKey,
        createdAt: new Date().toISOString(),
        apkSize: String(finalApkBytes.byteLength),
        zipSize: String(zipBuffer.byteLength),
        ...(endpoint ? { endpoint } : {}),
      },
    });

    // Generate SAS URL for download (valid for 24 hours)
    let sasUrl: string | undefined;
    try {
      const accountMatch = conn.match(/AccountName=([^;]+)/i);
      const keyMatch = conn.match(/AccountKey=([^;]+)/i);
      if (accountMatch && keyMatch) {
        const sharedKeyCredential = new StorageSharedKeyCredential(accountMatch[1], keyMatch[1]);
        const sasToken = generateBlobSASQueryParameters({
          containerName: container,
          blobName,
          permissions: BlobSASPermissions.parse("r"),
          startsOn: new Date(),
          expiresOn: new Date(Date.now() + 24 * 3600 * 1000),
        }, sharedKeyCredential).toString();

        sasUrl = `${blob.url}?${sasToken}`;
      }
    } catch { }

    return {
      success: true,
      blobUrl: blob.url,
      sasUrl,
      size: zipBuffer.byteLength,
      endpoint,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "Failed to upload package" };
  }
}

/**
 * POST /api/admin/devices/package
 * 
 * Generate an installer package (.zip) for a brand and upload to blob storage.
 * If the signed APK doesn't exist, returns an error.
 * 
 * Body:
 * {
 *   "brandKey": "xoinpay",  // required
 *   "endpoint": "https://xoinpay.azurewebsites.net"  // optional - URL to load in the APK wrapper
 * }
 * 
 * Response:
 * {
 *   "ok": true,
 *   "brandKey": "xoinpay",
 *   "endpoint": "https://xoinpay.azurewebsites.net",
 *   "packageUrl": "https://...",
 *   "sasUrl": "https://...?sv=...",
 *   "size": 12345678
 * }
 */
export async function POST(req: NextRequest) {
  // Auth: Admin or Superadmin only
  let caller: { wallet: string; roles: string[] };
  try {
    const c = await requireThirdwebAuth(req);
    const roles = Array.isArray(c?.roles) ? c.roles : [];
    if (!roles.includes("admin") && !roles.includes("superadmin")) {
      return json({ error: "forbidden" }, { status: 403 });
    }
    caller = { wallet: c.wallet, roles };
  } catch {
    return json({ error: "unauthorized" }, { status: 401 });
  }

  // Parse body
  let body: { brandKey?: string; endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, { status: 400 });
  }

  const brandKey = String(body?.brandKey || "").toLowerCase().trim();
  if (!brandKey) {
    return json({ error: "brandKey_required" }, { status: 400 });
  }

  // Validate and normalize endpoint URL
  let endpoint: string | undefined;
  if (body?.endpoint) {
    let rawEndpoint = String(body.endpoint).trim();
    // Ensure it has a protocol
    if (rawEndpoint && !rawEndpoint.startsWith("http://") && !rawEndpoint.startsWith("https://")) {
      rawEndpoint = `https://${rawEndpoint}`;
    }
    // Validate it's a valid URL
    try {
      new URL(rawEndpoint);
      endpoint = rawEndpoint;
    } catch {
      return json({ error: "invalid_endpoint", message: "Endpoint must be a valid URL" }, { status: 400 });
    }
  }

  // Get APK bytes
  const apkResult = await getApkBytes(brandKey);
  if (!apkResult) {
    return json({
      error: "apk_not_found",
      message: `No signed APK found for brand '${brandKey}' and no base APK available for fallback.`,
      hint: `Expected blob path: brands/${brandKey}-signed.apk in container '${process.env.PP_APK_CONTAINER || "portalpay"}'. For white-label brands, ensure brands/portalpay-signed.apk exists as a base.`
    }, { status: 404 });
  }

  // Generate and upload package
  const result = await generateAndUploadPackage(brandKey, apkResult.bytes, endpoint);

  if (!result.success) {
    return json({
      error: "package_failed",
      message: result.error
    }, { status: 500 });
  }

  return json({
    ok: true,
    brandKey,
    endpoint: result.endpoint,
    packageUrl: result.blobUrl,
    sasUrl: result.sasUrl,
    size: result.size,
    apkSize: apkResult.bytes.byteLength,
    apkSource: apkResult.source,
  });
}

/**
 * GET /api/admin/devices/package?brandKey=xoinpay
 * 
 * Check if a package exists for a brand and return its download URL.
 */
export async function GET(req: NextRequest) {
  // Auth: Admin or Superadmin only
  try {
    const caller = await requireThirdwebAuth(req);
    const roles = Array.isArray(caller?.roles) ? caller.roles : [];
    if (!roles.includes("admin") && !roles.includes("superadmin")) {
      return json({ error: "forbidden" }, { status: 403 });
    }
  } catch {
    return json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const brandKey = url.searchParams.get("brandKey")?.toLowerCase().trim();

  if (!brandKey) {
    return json({ error: "brandKey_required" }, { status: 400 });
  }

  const conn = String(process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AZURE_BLOB_CONNECTION_STRING || "").trim();
  const container = String(process.env.PP_PACKAGES_CONTAINER || "device-packages").trim();

  if (!conn) {
    return json({
      exists: false,
      error: "storage_not_configured"
    });
  }

  try {
    const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = await import("@azure/storage-blob");
    const bsc = BlobServiceClient.fromConnectionString(conn);
    const cont = bsc.getContainerClient(container);
    const blobName = `${brandKey}/${brandKey}-installer.zip`;
    const blob = cont.getBlockBlobClient(blobName);

    const exists = await blob.exists();
    if (!exists) {
      return json({
        exists: false,
        brandKey,
      });
    }

    // Get properties
    const props = await blob.getProperties();

    // Generate SAS URL
    let sasUrl: string | undefined;
    try {
      const accountMatch = conn.match(/AccountName=([^;]+)/i);
      const keyMatch = conn.match(/AccountKey=([^;]+)/i);
      if (accountMatch && keyMatch) {
        const sharedKeyCredential = new StorageSharedKeyCredential(accountMatch[1], keyMatch[1]);
        const sasToken = generateBlobSASQueryParameters({
          containerName: container,
          blobName,
          permissions: BlobSASPermissions.parse("r"),
          startsOn: new Date(),
          expiresOn: new Date(Date.now() + 1 * 3600 * 1000), // 1 hour
        }, sharedKeyCredential).toString();

        sasUrl = `${blob.url}?${sasToken}`;
      }
    } catch { }

    return json({
      exists: true,
      brandKey,
      packageUrl: blob.url,
      sasUrl,
      size: props.contentLength,
      createdAt: props.metadata?.createdAt,
      lastModified: props.lastModified?.toISOString(),
      endpoint: props.metadata?.endpoint,
    });
  } catch (e: any) {
    return json({
      exists: false,
      error: e?.message || "Failed to check package"
    });
  }
}
