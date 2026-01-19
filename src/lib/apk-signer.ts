/**
 * Pure JavaScript APK Signing Utility
 * 
 * Implements JAR signing (APK Signature Scheme v1) using node-forge.
 * This allows signing APKs without requiring Java.
 * 
 * V1 signing works for sideloaded APKs on all Android versions.
 */

import forge from "node-forge";
import JSZip from "jszip";
import crypto from "crypto";

// Debug keystore info (matches uber-apk-signer default)
const DEBUG_KEY_ALIAS = "androiddebugkey";
const DEBUG_CERT_CN = "Android Debug";
const DEBUG_CERT_VALIDITY_YEARS = 30;

/**
 * Generate a self-signed debug certificate for APK signing.
 * Similar to what Android SDK's debug.keystore provides.
 */
function generateDebugCertificate(): { privateKey: forge.pki.PrivateKey; certificate: forge.pki.Certificate } {
    // Generate RSA key pair
    const keys = forge.pki.rsa.generateKeyPair(2048);

    // Create certificate
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01";

    // Set validity
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + DEBUG_CERT_VALIDITY_YEARS);

    // Set subject and issuer (self-signed)
    const attrs = [
        { name: "commonName", value: DEBUG_CERT_CN },
        { name: "organizationName", value: "Android" },
        { name: "organizationalUnitName", value: "Android" },
        { name: "countryName", value: "US" },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    // Set extensions
    cert.setExtensions([
        { name: "basicConstraints", cA: true },
        { name: "keyUsage", keyCertSign: true, digitalSignature: true },
    ]);

    // Sign the certificate with the private key
    cert.sign(keys.privateKey, forge.md.sha256.create());

    return { privateKey: keys.privateKey, certificate: cert };
}

// Cache the debug certificate so we don't regenerate it every time
let cachedCert: { privateKey: forge.pki.PrivateKey; certificate: forge.pki.Certificate } | null = null;

function getDebugCertificate() {
    if (!cachedCert) {
        console.log("[APK Signer] Generating debug certificate...");
        cachedCert = generateDebugCertificate();
    }
    return cachedCert;
}

/**
 * Calculate SHA-256 digest of data and return base64-encoded string
 */
function sha256Base64(data: Buffer | string): string {
    const hash = crypto.createHash("sha256");
    hash.update(data);
    return hash.digest("base64");
}

/**
 * Calculate SHA-1 digest of data and return base64-encoded string
 */
function sha1Base64(data: Buffer | string): string {
    const hash = crypto.createHash("sha1");
    hash.update(data);
    return hash.digest("base64");
}

/**
 * Build MANIFEST.MF content
 * Lists all files with their SHA-256 digests
 */
function buildManifest(files: Map<string, Buffer>): string {
    const lines: string[] = [
        "Manifest-Version: 1.0",
        "Created-By: 1.0 (PortalPay APK Signer)",
        "",
    ];

    for (const [filename, content] of files) {
        // Skip META-INF files
        if (filename.startsWith("META-INF/")) continue;

        const digest = sha256Base64(content);
        lines.push(`Name: ${filename}`);
        lines.push(`SHA-256-Digest: ${digest}`);
        lines.push("");
    }

    return lines.join("\r\n");
}

/**
 * Build CERT.SF (Signature File) content
 * Contains digest of entire manifest and per-entry digests
 */
function buildSignatureFile(manifestContent: string, files: Map<string, Buffer>): string {
    const lines: string[] = [
        "Signature-Version: 1.0",
        `SHA-256-Digest-Manifest: ${sha256Base64(manifestContent)}`,
        "Created-By: 1.0 (PortalPay APK Signer)",
        "",
    ];

    // For each entry in manifest, we digest the entry block (Name + Digest + newlines)
    const manifestLines = manifestContent.split("\r\n");
    let entryBlock: string[] = [];
    let inEntry = false;

    for (const line of manifestLines) {
        if (line.startsWith("Name: ")) {
            if (inEntry && entryBlock.length > 0) {
                // Digest previous entry block
                const blockContent = entryBlock.join("\r\n") + "\r\n";
                const name = entryBlock[0].substring(6); // Remove "Name: "
                lines.push(`Name: ${name}`);
                lines.push(`SHA-256-Digest: ${sha256Base64(blockContent)}`);
                lines.push("");
            }
            entryBlock = [line];
            inEntry = true;
        } else if (inEntry) {
            if (line === "") {
                // End of entry
                entryBlock.push(line);
                const blockContent = entryBlock.join("\r\n") + "\r\n";
                const name = entryBlock[0].substring(6);
                lines.push(`Name: ${name}`);
                lines.push(`SHA-256-Digest: ${sha256Base64(blockContent)}`);
                lines.push("");
                inEntry = false;
                entryBlock = [];
            } else {
                entryBlock.push(line);
            }
        }
    }

    return lines.join("\r\n");
}

/**
 * Create PKCS#7 signature block
 */
function createSignatureBlock(signatureFileContent: string, privateKey: forge.pki.PrivateKey, certificate: forge.pki.Certificate): Buffer {
    // Create PKCS7 signed data
    const p7 = forge.pkcs7.createSignedData();

    // Add certificate
    p7.addCertificate(certificate);

    // Add signer
    p7.addSigner({
        key: privateKey,
        certificate: certificate,
        digestAlgorithm: forge.pki.oids.sha256,
        authenticatedAttributes: [
            {
                type: forge.pki.oids.contentType,
                value: forge.pki.oids.data,
            },
            {
                type: forge.pki.oids.messageDigest,
                // Will be auto-calculated
            },
            {
                type: forge.pki.oids.signingTime,
                value: new Date(),
            },
        ],
    });

    // Set content
    p7.content = forge.util.createBuffer(signatureFileContent);

    // Sign
    p7.sign({ detached: true });

    // Convert to DER
    const asn1 = p7.toAsn1();
    const der = forge.asn1.toDer(asn1);

    return Buffer.from(der.getBytes(), "binary");
}

/**
 * Sign an APK using JAR signing (v1 signature scheme)
 * 
 * @param apkBytes - The unsigned APK bytes
 * @returns Signed APK bytes
 */
export async function signApk(apkBytes: Uint8Array): Promise<Uint8Array> {
    console.log("[APK Signer] Starting JavaScript-based APK signing...");

    // Load the APK as a ZIP
    const zip = await JSZip.loadAsync(apkBytes);

    // Collect all files and their contents
    const files = new Map<string, Buffer>();
    const fileNames: string[] = [];

    // Remove old signatures if present
    const toRemove: string[] = [];
    zip.forEach((path) => {
        if (path.startsWith("META-INF/")) {
            toRemove.push(path);
        } else {
            fileNames.push(path);
        }
    });

    for (const path of toRemove) {
        zip.remove(path);
    }
    console.log(`[APK Signer] Removed ${toRemove.length} old signature files`);

    // Read all file contents
    for (const filename of fileNames) {
        const file = zip.file(filename);
        if (file && !file.dir) {
            const content = await file.async("nodebuffer");
            files.set(filename, content);
        }
    }
    console.log(`[APK Signer] Processing ${files.size} files for signing`);

    // Get debug certificate
    const { privateKey, certificate } = getDebugCertificate();

    // Build MANIFEST.MF
    const manifestContent = buildManifest(files);

    // Build CERT.SF
    const signatureFileContent = buildSignatureFile(manifestContent, files);

    // Create CERT.RSA (PKCS7 signature block)
    const signatureBlock = createSignatureBlock(signatureFileContent, privateKey, certificate);

    // Add signature files to ZIP
    zip.file("META-INF/MANIFEST.MF", manifestContent);
    zip.file("META-INF/CERT.SF", signatureFileContent);
    zip.file("META-INF/CERT.RSA", signatureBlock);

    console.log("[APK Signer] Added signature files to APK");

    // Generate signed APK
    // Important: resources.arsc must be stored uncompressed
    const signedApk = await zip.generateAsync({
        type: "nodebuffer",
        platform: "UNIX",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
    });

    console.log(`[APK Signer] Signed APK generated (${signedApk.byteLength} bytes)`);

    return new Uint8Array(signedApk.buffer, signedApk.byteOffset, signedApk.byteLength);
}

/**
 * Verify that an APK appears to be signed
 * (Basic check - looks for META-INF signature files)
 */
export async function isApkSigned(apkBytes: Uint8Array): Promise<boolean> {
    const zip = await JSZip.loadAsync(apkBytes);

    let hasManifest = false;
    let hasCertSf = false;
    let hasCertRsa = false;

    zip.forEach((path) => {
        if (path === "META-INF/MANIFEST.MF") hasManifest = true;
        if (path.match(/META-INF\/.*\.SF$/)) hasCertSf = true;
        if (path.match(/META-INF\/.*\.(RSA|DSA|EC)$/)) hasCertRsa = true;
    });

    return hasManifest && hasCertSf && hasCertRsa;
}
