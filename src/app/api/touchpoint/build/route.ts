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
 * Get base touchpoint APK bytes from blob storage or local filesystem
 * Tries Azure blob first, then local filesystem
 * Falls back to portalpay APK if surge-touchpoint doesn't exist
 */
async function getBaseTouchpointApk(brandKey: string = ""): Promise<Uint8Array | null> {
    // ALWAYS start from the clean, lightweight local base.
    // Do NOT fetch from Blob Storage, as that contains the *output* of previous builds (which might be bloated).

    // Default to portalpay-unsigned.apk (35MB) instead of signed (277MB)
    // This ensures a fresh build and small file size.
    let rel = path.join("android", "launcher", "recovered", "portalpay-unsigned.apk");

    // Check if separate paynex base exists (if needed)
    if (brandKey === "paynex") {
        rel = path.join("android", "launcher", "recovered", "paynex-unsigned.apk");
    }

    try {
        const filePath = path.join(process.cwd(), rel);
        // Verify it exists
        await fs.access(filePath);
        const data = await fs.readFile(filePath);
        console.log(`[Touchpoint Build] Using local base: ${rel} (${data.byteLength} bytes)`);
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } catch {
        // Fallback to signed if unsigned missing (though unusual)
        try {
            const fallbackRel = rel.replace("unsigned", "signed");
            const fd = await fs.readFile(path.join(process.cwd(), fallbackRel));
            console.warn(`[Touchpoint Build] Unsigned base missing. Fallback to signed: ${fallbackRel}`);
            return new Uint8Array(fd.buffer, fd.byteOffset, fd.byteLength);
        } catch (e) {
            console.error(`[Touchpoint Build] Failed to find base APK for ${brandKey}:`, e);
            return null;
        }
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

        // We want to replace the basic URL assignment with a robust installationId handler.
        // Target: var qp = new URLSearchParams(...); var src = ...;
        // matching the block to replace it entirely
        const targetBlockRegex = /var\s+qp\s*=\s*new\s*URLSearchParams\(window\.location\.search\);\s*var\s+src\s*=\s*qp\.get\s*\(\s*["']src["']\s*\)\s*\|\|\s*["'][^"']+["'];/;

        const injectionScript = `
        // --- INJECTED: Installation ID & Endpoint Logic ---
        var installationId = localStorage.getItem("installationId");
        if (!installationId) {
            // Generate UUID v4
            installationId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
            localStorage.setItem("installationId", installationId);
        }

        var qp = new URLSearchParams(window.location.search);
        var src = qp.get("src") || "${endpoint}";

        // Append installationId to src so the web app can use it
        if (src) {
             var sep = src.indexOf("?") !== -1 ? "&" : "?";
             src += sep + "installationId=" + installationId;
        }
        // --------------------------------------------------
        `;

        // Attempt replacement
        if (targetBlockRegex.test(content)) {
            content = content.replace(targetBlockRegex, injectionScript);
            console.log(`[Touchpoint APK] Injected installationId logic and endpoint: ${endpoint}`);
        } else {
            console.warn("[Touchpoint APK] Could not find exact JS block to replace in wrap.html. Falling back to simple endpoint replacement.");
            // Fallback: Just replace the URL string if the block match fails
            content = content.replace(
                /https:\/\/[a-z0-9-]+\.azurewebsites\.net/g,
                endpoint
            );
        }

        apkZip.file(wrapHtmlPath, content);
    } else {
        console.warn(`[Touchpoint APK] wrap.html not found at ${wrapHtmlPath}`);
    }

    // Remove old signature files (Uber signer handles this, but good practice to clear)
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

    // Re-generate APK (unsigned)
    // Note: JSZip GenerateAsync is slow but necessary to serialize the modified zip
    const modifiedApkUnsigned = await apkZip.generateAsync({
        type: "nodebuffer",
        platform: "UNIX",
    });

    console.log(`[Touchpoint APK] Generated unsigned APK (${modifiedApkUnsigned.byteLength} bytes). Starting signing process...`);

    // --- SIGNING PROCESS ---
    // 1. Write temp unsigned APK
    const tempDir = path.join(process.cwd(), "tmp");
    await fs.mkdir(tempDir, { recursive: true });
    const tempId = Math.random().toString(36).substring(7);
    const unsignedPath = path.join(tempDir, `${brandKey}-${tempId}-unsigned.apk`);
    const signedPath = path.join(tempDir, `${brandKey}-${tempId}-unsigned-aligned-debugSigned.apk`); // Default uber-signer output pattern

    await fs.writeFile(unsignedPath, modifiedApkUnsigned);

    // 2. Spawn Java Process to sign
    // Requires java on PATH and tools/uber-apk-signer.jar
    // Command: java -jar tools/uber-apk-signer.jar -a tmp/x.apk --allowResign
    const signerPath = path.join(process.cwd(), "tools", "uber-apk-signer.jar");

    // Check if signer exists
    try {
        await fs.access(signerPath);
    } catch {
        console.error("[Touchpoint APK] CRITICAL: uber-apk-signer.jar not found in tools/. Returning unsigned APK.");
        await fs.unlink(unsignedPath).catch(() => { });
        return new Uint8Array(modifiedApkUnsigned.buffer, modifiedApkUnsigned.byteOffset, modifiedApkUnsigned.byteLength);
    }

    // Determine Java Executable
    let javaPath = "java"; // Default to global PATH
    const localJrePath = path.join(process.cwd(), "tools", "jre-linux", "bin", "java");

    // Check if local portable JRE exists (only on Linux/Production usually)
    try {
        await fs.access(localJrePath);
        javaPath = localJrePath;
        console.log(`[Touchpoint APK] Using portable JRE: ${javaPath}`);
    } catch {
        console.log("[Touchpoint APK] Portable JRE not found, using global 'java'");
    }

    console.log(`[Touchpoint APK] Executing signer: ${javaPath} -jar ${signerPath} -a ${unsignedPath} --allowResign`);

    const { spawn } = await import("child_process");

    await new Promise<void>((resolve, reject) => {
        const child = spawn(javaPath, ["-jar", signerPath, "-a", unsignedPath, "--allowResign"], {
            stdio: "inherit", // Pipe output to console for debugging
        });

        child.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Signer process exited with code ${code}`));
        });

        child.on("error", (err) => reject(err));
    });

    // 3. Read signed APK
    console.log("[Touchpoint APK] Signing complete. Reading output...");
    try {
        const signedData = await fs.readFile(signedPath);
        console.log(`[Touchpoint APK] Successfully read signed APK (${signedData.byteLength} bytes)`);

        // Cleanup
        await fs.unlink(unsignedPath).catch(() => { });
        await fs.unlink(signedPath).catch(() => { });

        return new Uint8Array(signedData.buffer, signedData.byteOffset, signedData.byteLength);
    } catch (e) {
        console.error("[Touchpoint APK] Failed to read signed APK:", e);
        // Fallback to unsigned if read fails 
        await fs.unlink(unsignedPath).catch(() => { });
        return new Uint8Array(modifiedApkUnsigned.buffer, modifiedApkUnsigned.byteOffset, modifiedApkUnsigned.byteLength);
    }
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
                ? "https://basaltsurge.com/touchpoint/setup"
                : `https://${brandKey}.azurewebsites.net/touchpoint/setup`;
        }

        // Get base touchpoint APK
        const baseApk = await getBaseTouchpointApk();
        if (!baseApk) {
            return json({
                error: "base_apk_not_found",
                message: "No base APK found. Looked for surge-touchpoint-signed.apk and portalpay-signed.apk in android/launcher/recovered/"
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
