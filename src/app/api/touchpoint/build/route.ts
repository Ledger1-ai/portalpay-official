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
 * Get base touchpoint APK bytes from local filesystem
 */
async function getBaseTouchpointApk(): Promise<Uint8Array | null> {
    const basePath = path.join(process.cwd(), "android", "launcher", "recovered", "surge-touchpoint-signed.apk");
    try {
        const data = await fs.readFile(basePath);
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } catch {
        return null;
    }
}

/**
 * Modify touchpoint APK to set brand-specific endpoint
 * Similar to modifyApkEndpoint but for touchpoint configuration
 */
async function modifyTouchpointApk(apkBytes: Uint8Array, brandKey: string, endpoint: string): Promise<Uint8Array> {
    const apkZip = await JSZip.loadAsync(apkBytes);

    // Find and modify wrap.html in assets folder
    const wrapHtmlPath = "assets/wrap.html";
    const wrapHtmlFile = apkZip.file(wrapHtmlPath);

    if (wrapHtmlFile) {
        let content = await wrapHtmlFile.async("string");

        // Replace the default endpoint
        const endpointPattern = /var\s+src\s*=\s*qp\.get\s*\(\s*["']src["']\s*\)\s*\|\|\s*["']([^"']+)["']/;
        const match = content.match(endpointPattern);

        if (match) {
            content = content.replace(
                endpointPattern,
                `var src = qp.get("src") || "${endpoint}"`
            );
            console.log(`[Touchpoint APK] Modified wrap.html endpoint for ${brandKey}: ${endpoint}`);
        } else {
            // Fallback replacement
            content = content.replace(
                /https:\/\/[a-z0-9-]+\.azurewebsites\.net/g,
                endpoint
            );
            console.log(`[Touchpoint APK] Replaced default endpoint with ${endpoint}`);
        }

        apkZip.file(wrapHtmlPath, content);
    } else {
        console.warn(`[Touchpoint APK] wrap.html not found at ${wrapHtmlPath}`);
    }

    // Remove old signature files
    const filesToRemove: string[] = [];
    apkZip.forEach((relativePath) => {
        if (relativePath.startsWith("META-INF/")) {
            filesToRemove.push(relativePath);
        }
    });
    for (const file of filesToRemove) {
        apkZip.remove(file);
    }
    console.log(`[Touchpoint APK] Removed ${filesToRemove.length} signature files`);

    // Re-generate APK with proper compression
    const mustBeUncompressed = (filePath: string): boolean => {
        const name = filePath.split("/").pop() || "";
        return name === "resources.arsc";
    };

    const newApkZip = new JSZip();
    const allFiles: { path: string; file: JSZip.JSZipObject }[] = [];
    apkZip.forEach((relativePath, file) => {
        if (!file.dir) {
            allFiles.push({ path: relativePath, file });
        }
    });

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
    console.log(`[Touchpoint APK] ${uncompressedCount} files stored uncompressed`);

    const modifiedApk = await newApkZip.generateAsync({
        type: "nodebuffer",
        platform: "UNIX",
    });

    return new Uint8Array(modifiedApk.buffer, modifiedApk.byteOffset, modifiedApk.byteLength);
}

/**
 * Upload touchpoint APK to blob storage
 */
async function uploadTouchpointApk(brandKey: string, apkBytes: Uint8Array): Promise<{
    success: boolean;
    blobUrl?: string;
    error?: string;
    size?: number;
}> {
    const conn = String(process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AZURE_BLOB_CONNECTION_STRING || "").trim();
    const container = String(process.env.PP_APK_CONTAINER || "portalpay").trim();

    if (!conn) {
        return { success: false, error: "AZURE_STORAGE_CONNECTION_STRING not configured" };
    }

    try {
        const { BlobServiceClient } = await import("@azure/storage-blob");
        const bsc = BlobServiceClient.fromConnectionString(conn);
        const cont = bsc.getContainerClient(container);

        // Create container if it doesn't exist
        await cont.createIfNotExists({ access: "blob" });

        const prefix = String(process.env.PP_APK_BLOB_PREFIX || "brands").trim().replace(/^\/+|\/+$/g, "");
        const blobName = prefix ? `${prefix}/${brandKey}-touchpoint-signed.apk` : `${brandKey}-touchpoint-signed.apk`;
        const blob = cont.getBlockBlobClient(blobName);

        // Upload
        await blob.uploadData(apkBytes, {
            blobHTTPHeaders: {
                blobContentType: "application/vnd.android.package-archive",
                blobContentDisposition: `attachment; filename="${brandKey}-touchpoint.apk"`,
            },
            metadata: {
                brandKey,
                appType: "touchpoint",
                createdAt: new Date().toISOString(),
                size: String(apkBytes.byteLength),
            },
        });

        console.log(`[Touchpoint APK] Uploaded to blob: ${blobName} (${apkBytes.byteLength} bytes)`);

        return {
            success: true,
            blobUrl: blob.url,
            size: apkBytes.byteLength,
        };
    } catch (e: any) {
        return { success: false, error: e?.message || "Upload failed" };
    }
}

/**
 * POST /api/touchpoint/build
 * 
 * Admin-only endpoint to build and upload a branded touchpoint APK.
 * 
 * Body:
 * {
 *   "brandKey": "xoinpay",
 *   "endpoint": "https://xoinpay.azurewebsites.net"  // optional
 * }
 */
export async function POST(req: NextRequest) {
    try {
        // Auth: Admin or Superadmin only
        const caller = await requireThirdwebAuth(req).catch(() => null as any);
        const roles = Array.isArray(caller?.roles) ? caller.roles : [];
        if (!roles.includes("admin") && !roles.includes("superadmin")) {
            return json({ error: "forbidden" }, { status: 403 });
        }

        const body = await req.json().catch(() => ({} as any));

        const brandKey = String(body?.brandKey || "").toLowerCase().trim();
        if (!brandKey) {
            return json({ error: "brandKey_required" }, { status: 400 });
        }

        // Validate and normalize endpoint URL
        let endpoint: string | undefined;
        if (body?.endpoint) {
            let rawEndpoint = String(body.endpoint).trim();
            if (rawEndpoint && !rawEndpoint.startsWith("http://") && !rawEndpoint.startsWith("https://")) {
                rawEndpoint = `https://${rawEndpoint}`;
            }
            try {
                new URL(rawEndpoint);
                endpoint = rawEndpoint;
            } catch {
                return json({ error: "invalid_endpoint" }, { status: 400 });
            }
        }

        // Default endpoint if not provided
        if (!endpoint) {
            endpoint = brandKey === "surge" || brandKey === "platform"
                ? "https://basaltsurge.com"
                : `https://${brandKey}.azurewebsites.net`;
        }

        // Get base touchpoint APK
        const baseApk = await getBaseTouchpointApk();
        if (!baseApk) {
            return json({
                error: "base_apk_not_found",
                message: "Base touchpoint APK not found at android/launcher/recovered/surge-touchpoint-signed.apk"
            }, { status: 404 });
        }

        console.log(`[Touchpoint APK] Building for brand: ${brandKey}, endpoint: ${endpoint}`);

        // Modify APK with brand endpoint
        const modifiedApk = await modifyTouchpointApk(baseApk, brandKey, endpoint);

        // Upload to blob storage
        const uploadResult = await uploadTouchpointApk(brandKey, modifiedApk);

        if (!uploadResult.success) {
            return json({
                error: "upload_failed",
                message: uploadResult.error
            }, { status: 500 });
        }

        return json({
            ok: true,
            brandKey,
            endpoint,
            blobUrl: uploadResult.blobUrl,
            size: uploadResult.size,
            message: `Touchpoint APK built and uploaded successfully for ${brandKey}`,
        });
    } catch (e: any) {
        console.error("[touchpoint/build] Error:", e);
        return json({ error: "build_failed", message: e?.message || String(e) }, { status: 500 });
    }
}
