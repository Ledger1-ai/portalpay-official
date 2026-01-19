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

// Debug keystore info
const DEBUG_CERT_CN = "Android Debug";
const DEBUG_CERT_VALIDITY_YEARS = 30;

// JAR manifest line length limit (per JAR specification)
const MAX_LINE_LENGTH = 70;

/**
 * Wrap a manifest line to comply with JAR specification (72 byte max per line).
 * Continuation lines start with a single space.
 */
function wrapManifestLine(line: string): string {
    if (line.length <= MAX_LINE_LENGTH) {
        return line;
    }

    const result: string[] = [];
    let remaining = line;
    let isFirst = true;

    while (remaining.length > 0) {
        const maxLen = isFirst ? MAX_LINE_LENGTH : MAX_LINE_LENGTH - 1;
        const chunk = remaining.substring(0, maxLen);
        remaining = remaining.substring(maxLen);

        if (isFirst) {
            result.push(chunk);
            isFirst = false;
        } else {
            result.push(" " + chunk);
        }
    }

    return result.join("\r\n");
}

/**
 * Generate a self-signed debug certificate for APK signing.
 */
function generateDebugCertificate(): { privateKey: forge.pki.PrivateKey; certificate: forge.pki.Certificate } {
    const keys = forge.pki.rsa.generateKeyPair(2048);

    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01";

    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + DEBUG_CERT_VALIDITY_YEARS);

    const attrs = [
        { name: "commonName", value: DEBUG_CERT_CN },
        { name: "organizationName", value: "Android" },
        { name: "organizationalUnitName", value: "Android" },
        { name: "countryName", value: "US" },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    cert.setExtensions([
        { name: "basicConstraints", cA: true },
        { name: "keyUsage", keyCertSign: true, digitalSignature: true },
    ]);

    cert.sign(keys.privateKey, forge.md.sha256.create());

    return { privateKey: keys.privateKey, certificate: cert };
}

let cachedCert: { privateKey: forge.pki.PrivateKey; certificate: forge.pki.Certificate } | null = null;

function getDebugCertificate() {
    if (!cachedCert) {
        console.log("[APK Signer] Generating debug certificate...");
        cachedCert = generateDebugCertificate();
    }
    return cachedCert;
}

/**
 * Calculate SHA-256 digest and return base64
 */
function sha256Base64(data: Buffer | string): string {
    const hash = crypto.createHash("sha256");
    hash.update(data);
    return hash.digest("base64");
}

/**
 * Calculate SHA-1 digest and return base64
 */
function sha1Base64(data: Buffer | string): string {
    const hash = crypto.createHash("sha1");
    hash.update(data);
    return hash.digest("base64");
}

/**
 * Build a single manifest entry and return both the entry text AND its digest
 */
function buildManifestEntry(filename: string, contentDigest: string): { text: string; digest: string } {
    const lines = [
        wrapManifestLine(`Name: ${filename}`),
        wrapManifestLine(`SHA-256-Digest: ${contentDigest}`),
        "" // Blank line ends the section
    ];
    const text = lines.join("\r\n");
    // The digest for CERT.SF is of the entry INCLUDING the trailing CRLF
    const entryWithCrlf = text + "\r\n";
    return { text, digest: sha256Base64(entryWithCrlf) };
}

/**
 * Build MANIFEST.MF and return content + per-entry digests for CERT.SF
 */
function buildManifest(files: Map<string, Buffer>): { manifest: string; entryDigests: Map<string, string> } {
    const sections: string[] = [];
    const entryDigests = new Map<string, string>();

    // Main section (no Name attribute)
    sections.push(wrapManifestLine("Manifest-Version: 1.0"));
    sections.push(wrapManifestLine("Created-By: 1.0 (PortalPay APK Signer)"));
    sections.push(""); // Blank line after main section

    // Entry sections - sorted for consistency
    const sortedFiles = Array.from(files.keys()).filter(f => !f.startsWith("META-INF/")).sort();

    for (const filename of sortedFiles) {
        const content = files.get(filename)!;
        const contentDigest = sha256Base64(content);
        const entry = buildManifestEntry(filename, contentDigest);
        sections.push(entry.text);
        entryDigests.set(filename, entry.digest);
    }

    return { manifest: sections.join("\r\n"), entryDigests };
}

/**
 * Build CERT.SF (Signature File)
 */
function buildSignatureFile(manifestContent: string, entryDigests: Map<string, string>): string {
    const sections: string[] = [];

    // Main section
    sections.push(wrapManifestLine("Signature-Version: 1.0"));
    sections.push(wrapManifestLine(`SHA-256-Digest-Manifest: ${sha256Base64(manifestContent)}`));
    sections.push(wrapManifestLine("Created-By: 1.0 (PortalPay APK Signer)"));
    sections.push("");

    // Entry digests - sorted to match manifest order
    const sortedNames = Array.from(entryDigests.keys()).sort();
    for (const name of sortedNames) {
        const digest = entryDigests.get(name)!;
        sections.push(wrapManifestLine(`Name: ${name}`));
        sections.push(wrapManifestLine(`SHA-256-Digest: ${digest}`));
        sections.push("");
    }

    return sections.join("\r\n");
}

/**
 * Create PKCS#7 signature block
 */
function createSignatureBlock(signatureFileContent: string, privateKey: forge.pki.PrivateKey, certificate: forge.pki.Certificate): Buffer {
    const p7 = forge.pkcs7.createSignedData();

    p7.addCertificate(certificate);

    p7.addSigner({
        key: privateKey,
        certificate: certificate,
        digestAlgorithm: forge.pki.oids.sha256,
        authenticatedAttributes: [
            { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
            { type: forge.pki.oids.messageDigest },
            { type: forge.pki.oids.signingTime, value: new Date() },
        ],
    });

    p7.content = forge.util.createBuffer(signatureFileContent);
    p7.sign({ detached: true });

    const asn1 = p7.toAsn1();
    const der = forge.asn1.toDer(asn1);

    return Buffer.from(der.getBytes(), "binary");
}

/**
 * Sign an APK using JAR signing (v1 signature scheme)
 * 
 * CRITICAL: We rebuild the entire ZIP from scratch to ensure the bytes
 * we hash are EXACTLY the bytes that end up in the final APK.
 */
export async function signApk(apkBytes: Uint8Array): Promise<Uint8Array> {
    console.log("[APK Signer] Starting JavaScript-based APK signing...");

    // Load the source APK
    const sourceZip = await JSZip.loadAsync(apkBytes);

    // Collect all files (excluding META-INF)
    const files = new Map<string, Buffer>();
    const fileNames: string[] = [];

    sourceZip.forEach((path) => {
        if (!path.startsWith("META-INF/") && !path.endsWith("/")) {
            fileNames.push(path);
        }
    });

    // Read all file contents
    for (const filename of fileNames) {
        const file = sourceZip.file(filename);
        if (file && !file.dir) {
            const content = await file.async("nodebuffer");
            files.set(filename, content);
        }
    }
    console.log(`[APK Signer] Processing ${files.size} files for signing`);

    // Get debug certificate
    const { privateKey, certificate } = getDebugCertificate();

    // Build MANIFEST.MF (and get entry digests for CERT.SF)
    const { manifest, entryDigests } = buildManifest(files);

    // Build CERT.SF
    const signatureFile = buildSignatureFile(manifest, entryDigests);

    // Create CERT.RSA
    const signatureBlock = createSignatureBlock(signatureFile, privateKey, certificate);

    // Build a FRESH ZIP with the EXACT bytes we hashed
    const newZip = new JSZip();

    // Add all original files (sorted for consistency)
    const sortedFiles = Array.from(files.keys()).sort();
    for (const filename of sortedFiles) {
        const content = files.get(filename)!;

        // resources.arsc MUST be stored uncompressed for Android
        const isUncompressed = filename === "resources.arsc" || filename.endsWith(".so");

        newZip.file(filename, content, {
            compression: isUncompressed ? "STORE" : "DEFLATE",
            compressionOptions: isUncompressed ? undefined : { level: 6 },
        });
    }

    // Add signature files
    newZip.file("META-INF/MANIFEST.MF", manifest, { compression: "STORE" });
    newZip.file("META-INF/CERT.SF", signatureFile, { compression: "STORE" });
    newZip.file("META-INF/CERT.RSA", signatureBlock, { compression: "STORE" });

    console.log("[APK Signer] Added signature files to APK");

    // Generate the final APK
    const signedApk = await newZip.generateAsync({
        type: "nodebuffer",
        platform: "UNIX",
    });

    console.log(`[APK Signer] Signed APK generated (${signedApk.byteLength} bytes)`);

    return new Uint8Array(signedApk.buffer, signedApk.byteOffset, signedApk.byteLength);
}

/**
 * Verify that an APK appears to be signed
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
