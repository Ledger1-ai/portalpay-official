import { NextRequest, NextResponse } from "next/server";
import { requireThirdwebAuth } from "@/lib/auth";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import archiver from "archiver";
import { Readable } from "node:stream";

// Try to import sharp safely (it might not be available in all envs)

let sharp: any;
try {
    sharp = require("sharp");
} catch (e) {
    console.error("[Touchpoint Build] CRITICAL: 'sharp' dependency not found. APK icon generation will fail.", e);
    // process.exit(1)? No, we are in a route.
    // We will let it be undefined but fail later if we try to use it?
    // Better to throw here if we want to enforce it.
    // However, for now let's just log VERY LOUDLY.
}

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
    // 1. Fetch "Golden Master" Unsigned APK from Azure Blob Storage
    // This file (base/portalpay-unsigned-master.apk) is the valid, clean, 278MB template.
    // We fetching it from Azure to avoid storing 200MB+ files in GitHub.
    const conn = String(process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AZURE_BLOB_CONNECTION_STRING || "").trim();
    const container = String(process.env.PP_APK_CONTAINER || "portalpay").trim();

    if (conn && container) {
        try {
            const { BlobServiceClient } = await import("@azure/storage-blob");
            const bsc = BlobServiceClient.fromConnectionString(conn);
            const cont = bsc.getContainerClient(container);

            // "Golden Master" path in blob storage
            const masterBlobName = "base/portalpay-unsigned-master.apk";
            const blob = cont.getBlockBlobClient(masterBlobName);

            if (await blob.exists()) {
                console.log(`[Touchpoint Build] Downloading Master Base from Azure: ${masterBlobName}`);
                const buf = await blob.downloadToBuffer();
                console.log(`[Touchpoint Build] Download complete (${buf.byteLength} bytes)`);
                return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
            } else {
                console.error(`[Touchpoint Build] CRITICAL: Master Base APK not found in Azure: ${masterBlobName}`);
            }
        } catch (e) {
            console.error("[Touchpoint Build] Failed to fetch Master Base from Azure:", e);
        }
    }

    // 2. Local fallback (Dev environment only)
    let rel = path.join("android", "launcher", "recovered", "portalpay-unsigned.apk");
    // Check if separate paynex base exists (if needed)
    if (brandKey === "paynex") {
        rel = path.join("android", "launcher", "recovered", "paynex-unsigned.apk");
    }

    try {
        const filePath = path.join(process.cwd(), rel);
        const data = await fs.readFile(filePath);
        console.log(`[Touchpoint Build] Using local base: ${rel} (${data.byteLength} bytes)`);
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } catch {
        return null;
    }
}

/**
 * Android Icon Standards
 */
const ICON_SIZES: Record<string, number> = {
    "mipmap-mdpi-v4": 48,
    "mipmap-hdpi-v4": 72,
    "mipmap-xhdpi-v4": 96,
    "mipmap-xxhdpi-v4": 144,
    "mipmap-xxxhdpi-v4": 192,
};

async function getBrandIconsFromFolder(brandKey: string): Promise<Record<string, Buffer> | null> {
    const brandDir = path.join(process.cwd(), "public", "brands", brandKey);
    const strategies = ["res", "android/res", "android"];

    for (const sub of strategies) {
        const resDir = path.join(brandDir, sub);
        try {
            await fs.access(resDir);
            console.log(`[Touchpoint Build] Found pre-existing icon folder: ${resDir}`);
            const icons: Record<string, Buffer> = {};

            // Recursive walker for res folder
            // We assume structure: [resDir]/mipmap-hdpi/ic_launcher.png
            const entries = await fs.readdir(resDir, { withFileTypes: true });

            for (const e of entries) {
                if (e.isDirectory() && e.name.startsWith("mipmap")) {
                    // This is a mipmap folder (e.g. mipmap-hdpi)
                    const mipmapDir = path.join(resDir, e.name);
                    const files = await fs.readdir(mipmapDir);
                    for (const f of files) {
                        if (f.startsWith("ic_launcher") || f === "icon.png") {
                            if (f.includes("ic_launcher")) {
                                const buf = await fs.readFile(path.join(mipmapDir, f));
                                icons[`res/${e.name}/${f}`] = buf;
                            }
                        }
                    }
                }
            }

            if (Object.keys(icons).length > 0) {
                console.log(`[Touchpoint Build] Loaded ${Object.keys(icons).length} icons from folder.`);
                return icons;
            }
        } catch {
            continue;
        }
    }
    return null;
}

/**
 * Fetch brand assets from Azure Blob Storage
 * Priority:
 * 1. brands/{key}/icons.zip -> Unzip and use as pre-generated icons
 * 2. brands/{key}/logo.png -> Return as single buffer for Sharp generation
 */
async function getBrandAssetsFromBlob(brandKey: string): Promise<{ icons?: Record<string, Buffer>; logo?: Buffer } | null> {
    const conn = String(process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AZURE_BLOB_CONNECTION_STRING || "").trim();
    const containerName = String(process.env.PP_APK_CONTAINER || "portalpay").trim();

    if (!conn || !containerName) return null;

    try {
        const { BlobServiceClient } = await import("@azure/storage-blob");
        const bsc = BlobServiceClient.fromConnectionString(conn);
        const container = bsc.getContainerClient(containerName);

        // 1. Try icons.zip
        // Expecting brands/{key}/icons.zip
        const zipName = `brands/${brandKey}/icons.zip`;
        const zipBlob = container.getBlockBlobClient(zipName);

        if (await zipBlob.exists()) {
            console.log(`[Touchpoint Build] Found remote icons.zip: ${zipName}`);
            const buf = await zipBlob.downloadToBuffer();
            const zip = await JSZip.loadAsync(buf);

            const icons: Record<string, Buffer> = {};
            // Walk zip for mipmap folders
            for (const filename of Object.keys(zip.files)) {
                if (filename.includes("mipmap") && filename.includes("ic_launcher")) {
                    // Normalize path to res/mipmap-xx/ic_launcher.png
                    // Zip path might be: "icons/mipmap-hdpi/ic_launcher.png" or just "mipmap-hdpi/..."
                    // We need to map it to "res/" relative path in APK

                    // Simple heuristic: grab the segment starting with mipmap
                    const parts = filename.split("/");
                    const mipmapPart = parts.find(p => p.startsWith("mipmap"));
                    if (mipmapPart) {
                        const isRound = filename.includes("round");
                        const targetName = isRound ? "ic_launcher_round.png" : "ic_launcher.png";
                        const targetPath = `res/${mipmapPart}/${targetName}`;

                        icons[targetPath] = await zip.files[filename].async("nodebuffer");
                    }
                }
            }
            if (Object.keys(icons).length > 0) {
                console.log(`[Touchpoint Build] Extracted ${Object.keys(icons).length} icons from remote zip.`);
                return { icons };
            }
        }

        // 2. Try logo.png (or app-icon.png)
        const candidates = [`brands/${brandKey}/logo.png`, `brands/${brandKey}/app-icon.png`];
        for (const c of candidates) {
            const blob = container.getBlockBlobClient(c);
            if (await blob.exists()) {
                console.log(`[Touchpoint Build] Found remote logo: ${c}`);
                const buf = await blob.downloadToBuffer();
                return { logo: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) as Buffer };
            }
        }

    } catch (e) {
        console.error("[Touchpoint Build] Failed to fetch remote brand assets:", e);
    }
    return null;
}

async function getBrandLogoBuffer(brandKey: string): Promise<Buffer | null> {
    // Look for logo candidates in public/brands/[brandKey]/
    const brandDir = path.join(process.cwd(), "public", "brands", brandKey);
    const candidates = [
        "app-icon.png",
        "logo.png",
        "icon.png",
        `${brandKey}-logo.png`,
        "XoinPay X logo.png", // Specific override for user
        "Xoinpay transparent logo.png"
    ];

    try {
        await fs.access(brandDir);
        const files = await fs.readdir(brandDir);

        // Find first matching candidate (case-insensitive)
        for (const c of candidates) {
            const match = files.find(f => f.toLowerCase() === c.toLowerCase());
            if (match) {
                const p = path.join(brandDir, match);
                console.log(`[Touchpoint Build] Found brand logo: ${p}`);
                return await fs.readFile(p);
            }
        }
    } catch {
        // ignore
    }
    return null;
}




/**
 * Modify touchpoint APK to set brand-specific endpoint
 * Uses simple string replacement for wrap.html and robust re-zipping
 * to ensure resources.arsc remains uncompressed (Android R+ requirement).
 */
async function modifyTouchpointApk(apkBytes: Uint8Array, brandKey: string, endpoint: string): Promise<Uint8Array> {
    const apkZip = await JSZip.loadAsync(apkBytes);

    // 1. Prepare Modified wrap.html content
    const wrapHtmlPath = "assets/wrap.html";
    const wrapHtmlFile = apkZip.file(wrapHtmlPath);
    let modifiedWrapHtml: Buffer | null = null;

    if (wrapHtmlFile) {
        let content = await wrapHtmlFile.async("string");

        // Target: var qp = ...; var src = ...;
        // Use a more relaxed regex to capture the block including newlines
        // Note: [\s\S] matches any char including newlines
        const targetBlockRegex = /var\s+qp\s*=\s*new\s*URLSearchParams\([^)]+\);[\s\S]*?var\s+src\s*=\s*qp\.get\([^)]+\)\s*\|\|\s*["'][^"']+["'];/;

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

        // Append installationId
        if (src) {
             var sep = src.indexOf("?") !== -1 ? "&" : "?";
             src += sep + "installationId=" + installationId;
        }
        
        // --- DEBUG OVERLAY ---
        // Verify what is actually loading
        var debugDiv = document.createElement("div");
        debugDiv.style.position = "fixed";
        debugDiv.style.bottom = "10px";
        debugDiv.style.left = "10px";
        debugDiv.style.backgroundColor = "rgba(0,0,0,0.8)";
        debugDiv.style.color = "#0f0";
        debugDiv.style.padding = "10px";
        debugDiv.style.fontSize = "12px";
        debugDiv.style.zIndex = "99999";
        debugDiv.style.pointerEvents = "none";
        debugDiv.innerHTML = "<b>Target:</b> " + src + "<br><b>ID:</b> " + installationId;
        document.body.appendChild(debugDiv);
        // ---------------------
        // --------------------------------------------------
        `;

        // Debug log
        console.log("[Touchpoint Build] wrap.html content snippet upstream:", content.substring(content.indexOf("var qp"), content.indexOf("var src") + 100));

        if (targetBlockRegex.test(content)) {
            content = content.replace(targetBlockRegex, injectionScript);
            console.log(`[Touchpoint APK] Injected installationId logic via REGEX MATCH. Endpoint: ${endpoint}`);
        } else {
            console.warn("[Touchpoint APK] Regex failed. Fallback: String replacement.");
            // Log what we missed
            // Fallback
            content = content.replace(/https:\/\/[a-z0-9-]+\.azurewebsites\.net/g, endpoint);
            console.log(`[Touchpoint APK] Applied fallback replacement. Endpoint: ${endpoint}`);
        }
        modifiedWrapHtml = Buffer.from(content);
    } else {
        console.warn(`[Touchpoint APK] wrap.html not found at ${wrapHtmlPath}`);
    }

    // 2. Prepare Brand Icons
    // Priority: 
    // 1. Remote Blob Zip (icons.zip)
    // 2. Local Folder (res/)
    // 3. Remote Blob Logo (logo.png) -> Sharp
    // 4. Local File (logo.png) -> Sharp

    let iconBuffers: Record<string, Buffer> = {};
    let sourceLogoBuffer: Buffer | null = null;

    // Check Remote Assets first
    const remoteAssets = await getBrandAssetsFromBlob(brandKey);
    if (remoteAssets?.icons) {
        console.log("[Touchpoint Build] Using remote pre-generated icons.");
        iconBuffers = remoteAssets.icons;
    }

    // If no remote icons, check local folder
    if (Object.keys(iconBuffers).length === 0) {
        const folderIcons = await getBrandIconsFromFolder(brandKey);
        if (folderIcons) {
            console.log("[Touchpoint Build] Using local pre-generated icons.");
            iconBuffers = folderIcons;
        }
    }

    // If still no icons, we need to generate them via Sharp
    if (Object.keys(iconBuffers).length === 0) {
        // Did we get a remote logo?
        if (remoteAssets?.logo) {
            sourceLogoBuffer = remoteAssets.logo;
            console.log("[Touchpoint Build] Using remote logo for generation.");
        } else {
            // Check local logo
            sourceLogoBuffer = await getBrandLogoBuffer(brandKey);
            if (sourceLogoBuffer) console.log("[Touchpoint Build] Using local logo for generation.");
        }

        if (sourceLogoBuffer && sharp) {
            console.log("[Touchpoint Build] Generating brand icons from logo...");
            for (const [folder, size] of Object.entries(ICON_SIZES)) {
                try {
                    const resized = await sharp(sourceLogoBuffer).resize(size, size).toBuffer();
                    iconBuffers[`res/${folder}/ic_launcher.png`] = resized;
                    iconBuffers[`res/${folder}/ic_launcher_round.png`] = resized;
                } catch (e) {
                    console.error(`[Touchpoint Build] Failed to resize icon for ${folder}:`, e);
                }
            }
        } else if (!sourceLogoBuffer) {
            console.warn(`[Touchpoint Build] No brand logo found (remote or local). Skipping icon injection.`);
        } else if (!sharp) {
            // We have a logo but no sharp
            // Only throw if we strictly need generation
            throw new Error("[Touchpoint Build] 'sharp' dependency is missing AND no pre-generated icons found. Cannot brand this APK.");
        }
    }

    // 3. Stream Re-Zipping using Archiver (Critical for APK alignment rules)
    // Android R+ requires resources.arsc to be STORED (uncompressed) and 4-byte aligned.
    // uber-apk-signer handles alignment, but we must ensure it is NOT compressed beforehand.
    console.log("[Touchpoint APK] Re-packing APK with mixed compression (STORE resources.arsc)...");

    // Create archiver instance
    const archive = archiver("zip", { zlib: { level: 6 } });
    const buffers: Buffer[] = [];

    // Capture output
    const outputPromise = new Promise<void>((resolve, reject) => {
        archive.on("data", (data) => buffers.push(data));
        archive.on("end", () => resolve());
        archive.on("error", (err) => reject(err));
    });

    // Iterate files from source JSZip
    const files = Object.keys(apkZip.files);
    for (const filename of files) {
        // Skip signatures (META-INF)
        if (filename.startsWith("META-INF/")) continue;

        // Skip wrap.html (we add modified version later)
        if (filename === wrapHtmlPath) continue;

        // Skip icons if we have replacements
        if (iconBuffers[filename]) continue;

        const file = apkZip.file(filename);
        if (!file || file.dir) continue;

        // Determine compression method
        // resources.arsc MUST be STORED (store: true). Everything else DEFLATE (store: false).
        const isArsc = filename === "resources.arsc" || filename.endsWith(".so");
        const store = isArsc;

        if (store) {
            console.log(`[Touchpoint Build] Storing uncompressed: ${filename}`);
        }

        const content = await file.async("nodebuffer");
        archive.append(content, { name: filename, store: store });
    }

    // Add modified wrap.html
    if (modifiedWrapHtml) {
        archive.append(modifiedWrapHtml, { name: wrapHtmlPath }); // Default DEFLATE
    }

    // Add injected icons
    for (const [path, buffer] of Object.entries(iconBuffers)) {
        archive.append(buffer, { name: path });
    }

    // Finalize
    await archive.finalize();
    await outputPromise;

    const modifiedApkUnsigned = Buffer.concat(buffers);
    console.log(`[Touchpoint APK] Generated unsigned APK (${modifiedApkUnsigned.byteLength} bytes). Starting signing process...`);

    // --- SIGNING PROCESS ---
    // 1. Write temp unsigned APK
    const tempDir = path.join(process.cwd(), "tmp");
    await fs.mkdir(tempDir, { recursive: true });
    const tempId = Math.random().toString(36).substring(7);
    const unsignedPath = path.join(tempDir, `${brandKey}-${tempId}-unsigned.apk`);
    // uber-apk-signer intelligently strips "-unsigned" before appending suffixes
    const signedPath = path.join(tempDir, `${brandKey}-${tempId}-aligned-debugSigned.apk`);

    await fs.writeFile(unsignedPath, modifiedApkUnsigned);

    // 2. Spawn Java Process to sign
    const signerPath = path.join(process.cwd(), "tools", "uber-apk-signer.jar");

    try {
        await fs.access(signerPath);
    } catch {
        console.error("[Touchpoint APK] CRITICAL: uber-apk-signer.jar not found in tools/. Returning unsigned APK.");
        await fs.unlink(unsignedPath).catch(() => { });
        return new Uint8Array(modifiedApkUnsigned);
    }

    // Determine Java Executable
    let javaPath = "java"; // Default to global PATH
    const localJrePath = path.join(process.cwd(), "tools", "jre-linux", "bin", "java");
    try {
        await fs.access(localJrePath);
        javaPath = localJrePath;
        console.log(`[Touchpoint APK] Using portable JRE: ${javaPath}`);
    } catch {
        console.log("[Touchpoint APK] Portable JRE not found, using global 'java'");
    }

    // 3. Spawn Java Process to sign
    console.log(`[Touchpoint APK] Executing signer: ${javaPath} -jar ${signerPath} -a ${unsignedPath} --allowResign`);

    const { spawn } = await import("child_process");

    await new Promise<void>((resolve, reject) => {
        const child = spawn(javaPath, ["-jar", signerPath, "-a", unsignedPath, "--allowResign"], {
            stdio: "pipe", // Capture stdio
        });

        let stdout = "";
        let stderr = "";

        child.stdout?.on("data", (d) => {
            const s = d.toString();
            stdout += s;
            process.stdout.write(`[Signer STDOUT] ${s}`);
        });

        child.stderr?.on("data", (d) => {
            const s = d.toString();
            stderr += s;
            process.stderr.write(`[Signer STDERR] ${s}`);
        });

        child.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Signer process exited with code ${code}.\nSTDERR: ${stderr}\nSTDOUT: ${stdout}`));
        });

        child.on("error", (err) => reject(err));
    });

    // 4. Read signed APK
    console.log("[Touchpoint APK] Signing complete. Reading output...");
    try {
        if (!await fs.stat(signedPath).catch(() => false)) {
            throw new Error("Signed output file verification failed: File does not exist: " + signedPath);
        }

        const signedData = await fs.readFile(signedPath);
        console.log(`[Touchpoint APK] Successfully read signed APK (${signedData.byteLength} bytes)`);

        // Cleanup
        await fs.unlink(unsignedPath).catch(() => { });
        await fs.unlink(signedPath).catch(() => { });

        return new Uint8Array(signedData);
    } catch (e) {
        console.error("[Touchpoint APK] Failed to read signed APK:", e);
        throw e;
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
