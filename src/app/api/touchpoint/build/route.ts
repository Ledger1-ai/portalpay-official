import { NextRequest, NextResponse } from "next/server";
import { requireThirdwebAuth } from "@/lib/auth";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { getContainer } from "@/lib/cosmos";
import { zipalign } from "@/utils/zipalign";

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
 * Get base APK bytes for touchpoint build
 * Priority: 1) Brand-specific APK 2) surge-touchpoint 3) portalpay
 */
async function getBaseTouchpointApk(brandKey: string): Promise<Uint8Array | null> {
    const conn = String(process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AZURE_BLOB_CONNECTION_STRING || "").trim();
    const container = String(process.env.PP_APK_CONTAINER || "portalpay").trim();

    if (conn && container) {
        const prefix = String(process.env.PP_APK_BLOB_PREFIX || "brands").trim().replace(/^\/+|\/+$/g, "");
        const { BlobServiceClient } = await import("@azure/storage-blob");
        const bsc = BlobServiceClient.fromConnectionString(conn);
        const cont = bsc.getContainerClient(container);

        // 1. Try brand-specific APK first (e.g., xoinpay-signed.apk)
        try {
            const brandBlobName = prefix ? `${prefix}/${brandKey}-signed.apk` : `${brandKey}-signed.apk`;
            const brandBlob = cont.getBlockBlobClient(brandBlobName);
            if (await brandBlob.exists()) {
                const buf = await brandBlob.downloadToBuffer();
                console.log(`[Touchpoint Build] Using brand-specific APK: ${brandBlobName}`);
                return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
            }
            console.log(`[Touchpoint Build] Brand APK not found: ${brandBlobName}`);
        } catch { }

        // 2. Try surge-touchpoint
        try {
            const surgeBlobName = prefix ? `${prefix}/surge-touchpoint-signed.apk` : `surge-touchpoint-signed.apk`;
            const surgeBlob = cont.getBlockBlobClient(surgeBlobName);
            if (await surgeBlob.exists()) {
                const buf = await surgeBlob.downloadToBuffer();
                console.log(`[Touchpoint Build] Using surge-touchpoint: ${surgeBlobName}`);
                return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
            }
        } catch { }

        // 3. Fall back to portalpay APK
        try {
            const fallbackBlobName = prefix ? `${prefix}/portalpay-signed.apk` : `portalpay-signed.apk`;
            const fallbackBlob = cont.getBlockBlobClient(fallbackBlobName);
            if (await fallbackBlob.exists()) {
                const buf = await fallbackBlob.downloadToBuffer();
                console.log(`[Touchpoint Build] Using fallback portalpay: ${fallbackBlobName}`);
                return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
            }
        } catch { }
    }

    // Local filesystem fallback
    const portalPayPath = path.join(process.cwd(), "android", "launcher", "recovered", "portalpay-signed.apk");
    try {
        const data = await fs.readFile(portalPayPath);
        console.log("[Touchpoint Build] Using local portalpay-signed.apk as base");
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } catch {
        return null;
    }
}

/**
 * Sign APK using node-forge (APK v1 / JAR signing)
 * This makes the APK installable on devices that require signatures
 * Uses node-forge for proper X.509 certificate and PKCS#7 signing
 */
async function signApk(apkBytes: Uint8Array, brandKey: string): Promise<Uint8Array> {
    const forge = await import("node-forge");
    const crypto = await import("crypto");

    console.log(`[APK Sign] Starting node-forge signing for ${brandKey}`);

    try {
        // Load the APK
        const apkZip = await JSZip.loadAsync(apkBytes);

        // Pre-generated debug RSA private key (2048-bit) - avoids slow runtime generation
        const DEBUG_PRIVATE_KEY_PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAwm1+QevkNvPFJ+U6akEMuvzOQIDEaftQdmMGfjCJ53YJ9Gf9
l8fmnx106MKKt0hwiYklwGWnqH29cvM7mHUKQFOHynv3Iy9jpkUOPY3fSh2JTTCM
kgmrhvjcI8mjdA013YlrNbxIhj9zZqfi0CWtJ6iCEyw0wHOml1U98cJoo2jckiwH
eaIrOu+s+GdS2XfmKAdS6/0efHh1Wit409/S+zlpozhHJzP5QoNTbls1oVeuwgGN
bL4VycPFC8mIxKqs31NtnIRZ9/GtXbv3KQopAUYleiyHyjdw9vYLH5DWSQTr9YZT
Qe2YZGUfn0XfAlqDkoDLHv9KEY1db8kTDl3zQwIDAQABAoIBAC9Q0DIgwxgweOF9
opqrG/sBfPwrmiEknO9CqBjbnSPsEP4etJNUfaZpV8MxXOq/wUtnSf2pf4S8nPc1
hGJU0VrYOSqownsYlEqpcY6/UQDLcVeMohkEK28cbw5yism6UUqJn8KjAI9TL7Vi
1ArNsHb/RjB+SJQxUPBxOTL1mdtyQ2FCgCNEI+XQnkklkqtceHo1oI2EPnTGCaTz
sKUQas7NWIpBik8FQob8Sv/FRHjCVp8WcMB0bAVIe7XEJv63ISotlVxPKHfazWdq
H3nd3/ZBcRv57PbQMHdvOU0t7WOAIBt7kxOJgDkh0KlReAjAJCWwP26UAtPuba7e
OXsgPTECgYEA9pxgg8nw+bBcq5CUNGygbDhXrMnHKbs8ZdK8qRuhYcNGw8r+hCFL
AtI/sKP84xwNoqqFCuc07PTsMPtijkDllf63v5cUGKMnoUW5USjWMdBNLe/WH3yw
jPL2GdZO+bMlNDDdVwClJquualTpt+gMUwp93QbEpevzIVTc1spjnvsCgYEAydSB
vKO6xf/NvC5AXbMs96d0R47Q8lCUYi04TuGGyXLBwCB0XyCwteiu02iQfpCLTh6Q
XiKkS1y5ISI8wHW1Ag3YJuNiukbJzWT7t1H2RIYRvnzi1wtD55nf3EjmhXwm1K7B
X8lW5OT/jTmBEJRW8GjdqEZeehgAxpsb3qIrqlkCgYEApJBjo24dnTFAFcir7XPT
dYP/lbEscz+bpUMEXECw54Ec9si+IMPqv1433BMCTTdKLhNmJol0+u7Rsjn+YXkS
+433ZiVV5r7xUiAp8uuyS5l59z6Ff4uAcP4slb86Aky2deZpvYYTrwN/pzs0n2F8
3+kvZk/+583U95geqkJySgMCgYAIglAR7ukx7c3zsBOAn8w2iLXLSoceoC0RUoy8
Lp/rIE5w1i1x0UQB91Rfj1oALAHjgkBd56H7l2YqsnHTP2MpOgIx6YZBCjj50tcV
7HuweeKHoGZD4LK1MfSRKfWmDQzqDJAUhL2IGut3PcRmOYrMye8GaCkVhquJtAJh
yX6DyQKBgQDC+Xya1cAi7X0AaXkE2v2e6OQCs8TTrhTiWf/FGdj2/jaxI4nydtv7
NLmbV4uQeYNUbUznEXsfEDuXkYmbKEQ5TI0vDZguXmTH3ZI13rLlp/NWRnZr57c0
XSx/tDaus4PyhrX57y3P7cSQxaCrWaoSXUk7EK0Usg4OR4m8eTzkSg==
-----END RSA PRIVATE KEY-----`;

        // Get or generate keys from hardcoded PEM (instant, no generation needed)
        console.log(`[APK Sign] Using pre-generated debug keypair...`);
        const privateKey = forge.pki.privateKeyFromPem(DEBUG_PRIVATE_KEY_PEM);
        const publicKey = forge.pki.setRsaPublicKey(privateKey.n, privateKey.e);

        // Create a self-signed certificate
        console.log(`[APK Sign] Creating self-signed certificate...`);
        const cert = forge.pki.createCertificate();
        cert.publicKey = publicKey;
        cert.serialNumber = "01";
        cert.validity.notBefore = new Date();
        cert.validity.notAfter = new Date();
        cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

        const attrs = [
            { name: "commonName", value: "PortalPay Debug Key" },
            { name: "organizationName", value: "PortalPay" },
            { shortName: "OU", value: brandKey }
        ];
        cert.setSubject(attrs);
        cert.setIssuer(attrs);

        // Sign the certificate
        cert.sign(privateKey, forge.md.sha256.create());

        // Remove existing META-INF signature files
        const existingMetaInf = Object.keys(apkZip.files).filter(p => p.startsWith("META-INF/"));
        for (const p of existingMetaInf) {
            apkZip.remove(p);
        }
        console.log(`[APK Sign] Removed ${existingMetaInf.length} existing META-INF files`);

        // Step 1: Generate MANIFEST.MF with SHA-256 digests of all files
        const manifestLines: string[] = [
            "Manifest-Version: 1.0",
            "Created-By: 1.0 (PortalPay APK Signer)",
            ""
        ];

        // Collect all files (excluding META-INF)
        const paths = Object.keys(apkZip.files).filter(p => !p.startsWith("META-INF/") && !apkZip.files[p].dir);
        console.log(`[APK Sign] Processing ${paths.length} files for signing...`);

        for (const filePath of paths) {
            const file = apkZip.files[filePath];
            const data = await file.async("nodebuffer");

            // Calculate SHA-256 digest
            const md = forge.md.sha256.create();
            md.update(data.toString("binary"));
            const sha256 = forge.util.encode64(md.digest().getBytes());

            manifestLines.push(`Name: ${filePath}`);
            manifestLines.push(`SHA-256-Digest: ${sha256}`);
            manifestLines.push("");
        }

        const manifestContent = manifestLines.join("\r\n");

        // Step 2: Generate CERT.SF (signature file)
        const manifestMd = forge.md.sha256.create();
        manifestMd.update(manifestContent, "utf8");
        const manifestHash = forge.util.encode64(manifestMd.digest().getBytes());

        const sfLines: string[] = [
            "Signature-Version: 1.0",
            `SHA-256-Digest-Manifest: ${manifestHash}`,
            "Created-By: 1.0 (PortalPay APK Signer)",
            ""
        ];

        // Add per-file digests (hash of each manifest entry block)
        const manifestBlocks = manifestContent.split("\r\n\r\n");
        for (const block of manifestBlocks) {
            if (block.startsWith("Name: ")) {
                const nameMatch = block.match(/Name: (.+)/);
                if (nameMatch) {
                    const blockMd = forge.md.sha256.create();
                    blockMd.update(block + "\r\n\r\n", "utf8");
                    const blockHash = forge.util.encode64(blockMd.digest().getBytes());
                    sfLines.push(`Name: ${nameMatch[1]}`);
                    sfLines.push(`SHA-256-Digest: ${blockHash}`);
                    sfLines.push("");
                }
            }
        }

        const sfContent = sfLines.join("\r\n");

        // Step 3: Generate CERT.RSA (PKCS#7 signature)
        console.log(`[APK Sign] Creating PKCS#7 signature...`);

        // Create a PKCS#7 signed data structure
        const p7 = forge.pkcs7.createSignedData();
        p7.content = forge.util.createBuffer(sfContent, "utf8");
        p7.addCertificate(cert);

        p7.addSigner({
            key: privateKey,
            certificate: cert,
            digestAlgorithm: forge.pki.oids.sha256,
            authenticatedAttributes: [
                {
                    type: forge.pki.oids.contentType,
                    value: forge.pki.oids.data
                },
                {
                    type: forge.pki.oids.messageDigest
                    // value will be auto-generated
                },
                {
                    type: forge.pki.oids.signingTime,
                    value: new Date().toISOString()
                }
            ]
        });

        // Sign the data
        p7.sign({ detached: true });

        // Convert to DER format
        const asn1 = p7.toAsn1();
        const der = forge.asn1.toDer(asn1).getBytes();
        const pkcs7Buffer = Buffer.from(der, "binary");

        console.log(`[APK Sign] PKCS#7 signature created (${pkcs7Buffer.length} bytes)`);

        // Add new signature files
        apkZip.file("META-INF/MANIFEST.MF", manifestContent, { compression: "STORE" });
        apkZip.file("META-INF/CERT.SF", sfContent, { compression: "STORE" });
        apkZip.file("META-INF/CERT.RSA", pkcs7Buffer, { binary: true, compression: "STORE" });

        console.log(`[APK Sign] Added META-INF signature files`);

        // Helper to check if file must be uncompressed
        const mustBeUncompressed = (filePath: string): boolean => {
            const name = filePath.split("/").pop() || "";
            // resources.arsc MUST be uncompressed and aligned for Android R+
            if (name === "resources.arsc") return true;
            // META-INF files should also be uncompressed
            if (filePath.startsWith("META-INF/")) return true;
            return false;
        };

        // Rebuild APK with proper per-file compression
        const newApkZip = new JSZip();

        // Get all files
        const allFiles: { path: string; file: JSZip.JSZipObject }[] = [];
        apkZip.forEach((relativePath, file) => {
            if (!file.dir) {
                allFiles.push({ path: relativePath, file });
            }
        });

        // Rebuild with proper compression settings
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

        console.log(`[APK Sign] ${uncompressedCount} files stored uncompressed (resources.arsc, META-INF)`);

        // Generate the final signed APK
        const signedApk = await newApkZip.generateAsync({
            type: "nodebuffer",
            platform: "UNIX",
        });

        console.log(`[APK Sign] Signed APK generated (${signedApk.byteLength} bytes)`);

        return new Uint8Array(signedApk.buffer, signedApk.byteOffset, signedApk.byteLength);

    } catch (e: any) {
        console.error(`[APK Sign] Signing failed: ${e?.message}`);
        console.error(e?.stack);
        // Return unsigned APK on failure
        return apkBytes;
    }
}

/**
 * Customize the Touchpoint APK:
 * 1. Inject installationId Script Logic (Always, since this is touchpoint)
 * 2. Replace Icons (if iconBuffer provided) and remove adaptive icon XMLs
 * 3. Broad URL replacement catch-all
 */
async function customizeTouchpointApk(apkBytes: Uint8Array, endpoint: string, iconBuffer?: Uint8Array): Promise<Uint8Array> {
    const apkZip = await JSZip.loadAsync(apkBytes);

    // 1. Modify Endpoints (wrap.html)
    const wrapHtmlPath = "assets/wrap.html";
    const wrapHtmlFile = apkZip.file(wrapHtmlPath);

    if (wrapHtmlFile) {
        let content = await wrapHtmlFile.async("string");

        // Injection script with installationId and endpoint
        const injectionScript = `
        // --- INJECTED: Installation ID & Endpoint Logic ---
        var installationId = localStorage.getItem("installationId");
        if (!installationId) {
            installationId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
            localStorage.setItem("installationId", installationId);
        }
        var qp = new URLSearchParams(window.location.search);
        var src = qp.get("src") || "${endpoint}";
        if (src) {
             var sep = src.indexOf("?") !== -1 ? "&" : "?";
             src += sep + "installationId=" + installationId;
        }
        // --------------------------------------------------
        `;

        // Try to replace the target block (standard pattern)
        const targetBlockRegex = /var\s+qp\s*=\s*new\s*URLSearchParams\(window\.location\.search\);\s*var\s+src\s*=\s*qp\.get\s*\(\s*["']src["']\s*\)\s*\|\|\s*["'][^"']+["'];/;

        if (targetBlockRegex.test(content)) {
            content = content.replace(targetBlockRegex, injectionScript);
            console.log(`[Touchpoint APK] Injected script logic`);
        } else {
            // Fallback: replace any azurewebsites.net URL
            // Also try replacing TARGET_URL/src vars in case Base APK changed
            content = content.replace(/var\s+TARGET_URL\s*=\s*"[^"]*"/, `var TARGET_URL = "${endpoint}"`);
            content = content.replace(/const\s+TARGET_URL\s*=\s*"[^"]*"/, `const TARGET_URL = "${endpoint}"`);

            // Robust catch-all - replace ALL known base URLs
            if (!content.includes(endpoint)) {
                // Azure webapps
                content = content.replace(/https:\/\/[a-z0-9-]+\.azurewebsites\.net[^"']*/g, endpoint);
                // Basalt production domains
                content = content.replace(/https:\/\/surge\.basalthq\.com[^"']*/g, endpoint);
                content = content.replace(/https:\/\/basaltsurge\.com[^"']*/g, endpoint);
                content = content.replace(/https:\/\/pay\.ledger1\.ai[^"']*/g, endpoint);
            }
            console.log(`[Touchpoint APK] Applied fallback replacement`);
        }

        // VERIFY the endpoint was injected
        if (content.includes(endpoint)) {
            console.log(`[Touchpoint APK] SUCCESS: wrap.html contains endpoint ${endpoint}`);
        } else {
            console.error(`[Touchpoint APK] CRITICAL: wrap.html does NOT contain ${endpoint}!`);
            console.error(`[Touchpoint APK] Current content sample: ${content.substring(0, 500)}`);
        }

        apkZip.file(wrapHtmlPath, content, { compression: "DEFLATE" });
    } else {
        console.warn(`[Touchpoint APK] wrap.html not found!`);
    }

    // 2. Replace Icons
    if (iconBuffer) {
        const densities = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
        const fileNames = ["ic_launcher.png", "ic_launcher_round.png"];

        for (const density of densities) {
            for (const fileName of fileNames) {
                apkZip.file(`res/mipmap-${density}/${fileName}`, iconBuffer, { compression: "DEFLATE" });
                apkZip.file(`res/mipmap-${density}-v4/${fileName}`, iconBuffer, { compression: "DEFLATE" });
            }
        }

        // Remove adaptive icons
        const adaptivePaths = [
            "res/mipmap-anydpi-v26/ic_launcher.xml",
            "res/mipmap-anydpi-v26/ic_launcher_round.xml"
        ];
        for (const p of adaptivePaths) {
            if (apkZip.file(p)) {
                apkZip.remove(p);
                console.log(`[Touchpoint APK] Removed adaptive icon: ${p}`);
            }
        }
        console.log(`[Touchpoint APK] Replaced icons`);
    }

    // Return uncompressed ZIP bytes (will be re-compressed during signing/alignment)
    return await apkZip.generateAsync({ type: "uint8array" });
}

async function getBrandIconUrl(brandKey: string): Promise<string | null> {
    try {
        const container = await getContainer();
        // Strip -touchpoint suffix if present
        const lookupKey = brandKey.replace(/-touchpoint$/, "");

        // Query for partner application
        const q = {
            query: "SELECT TOP 1 * FROM c WHERE c.brandKey = @brandKey AND c.type = 'partner_application' ORDER BY c.createdAt DESC",
            parameters: [{ name: "@brandKey", value: lookupKey }]
        };
        const { resources } = await container.items.query(q).fetchAll();
        if (resources.length > 0 && resources[0].logos?.app) {
            return resources[0].logos.app;
        }
    } catch (e: any) {
        console.error("[Touchpoint Build] Failed to fetch brand icon:", e?.message);
    }
    return null;
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

        // Get base touchpoint APK (tries brand-specific first, then fallbacks)
        const baseApk = await getBaseTouchpointApk(brandKey);
        if (!baseApk) {
            return json({
                error: "base_apk_not_found",
                message: `No base APK found for ${brandKey}. Looked for ${brandKey}-signed.apk, surge-touchpoint-signed.apk, and portalpay-signed.apk`
            }, { status: 404 });
        }

        console.log(`[Touchpoint Build] ${brandKey}, Endpoint: ${endpoint}`);

        // Get Icon
        let iconBuffer: Uint8Array | undefined;
        try {
            const iconUrl = await getBrandIconUrl(brandKey);
            if (iconUrl) {
                console.log(`[Touchpoint Build] Found Icon: ${iconUrl}`);
                const res = await fetch(iconUrl);
                if (res.ok) {
                    const buf = await res.arrayBuffer();
                    iconBuffer = new Uint8Array(buf);
                }
            }
        } catch (e) {
            console.warn(`[Touchpoint Build] Failed to fetch icon:`, e);
        }

        // 1. Customize
        let currentApk = await customizeTouchpointApk(baseApk, endpoint, iconBuffer);

        // 2. Sign
        currentApk = await signApk(currentApk, brandKey);

        // 3. Align
        try {
            console.log(`[Touchpoint Build] Aligning...`);
            currentApk = await zipalign(currentApk);
            console.log(`[Touchpoint Build] Aligned (${currentApk.length} bytes)`);
        } catch (e) {
            console.error(`[Touchpoint Build] Align failed:`, e);
        }

        // Upload to blob storage
        const uploadResult = await uploadTouchpointApk(brandKey, currentApk);

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
