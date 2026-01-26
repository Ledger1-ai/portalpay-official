/**
 * APK Builder with 4-byte Alignment Support
 * 
 * Android R+ (API 30+) requires resources.arsc to be stored uncompressed AND
 * aligned on a 4-byte boundary. JSZip doesn't support alignment, so we need
 * a custom ZIP builder.
 * 
 * This module provides APK building with proper alignment.
 */

import JSZip from "jszip";
import forge from "node-forge";
import crypto from "crypto";

// ZIP constants
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034B50;
const ZIP_CENTRAL_DIR_SIGNATURE = 0x02014B50;
const ZIP_END_OF_CENTRAL_DIR_SIGNATURE = 0x06054B50;

interface ZipEntry {
    name: string;
    data: Buffer;
    crc32: number;
    compressedData: Buffer;
    compressionMethod: number; // 0 = STORE, 8 = DEFLATE
    isCompressed: boolean;
    requiresAlignment: boolean;
}

/**
 * Calculate CRC32 checksum
 */
function crc32(data: Buffer): number {
    let crc = 0xFFFFFFFF;
    const table = crc32Table();

    for (let i = 0; i < data.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
    }

    return (crc ^ 0xFFFFFFFF) >>> 0;
}

let _crc32Table: number[] | null = null;
function crc32Table(): number[] {
    if (_crc32Table) return _crc32Table;

    _crc32Table = [];
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        _crc32Table[n] = c;
    }
    return _crc32Table;
}

/**
 * DEFLATE compress data
 */
async function deflateCompress(data: Buffer): Promise<Buffer> {
    const zlib = await import("zlib");
    return new Promise((resolve, reject) => {
        zlib.deflateRaw(data, { level: 6 }, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}

/**
 * Check if a file should be stored uncompressed (for Android compatibility)
 */
function shouldStoreUncompressed(filename: string): boolean {
    const name = filename.split("/").pop() || "";

    // resources.arsc MUST be uncompressed and aligned for Android R+
    if (name === "resources.arsc") return true;

    // Native libraries should be uncompressed for extractNativeLibs=false
    if (filename.endsWith(".so")) return true;

    // META-INF signature files should be uncompressed
    if (filename.startsWith("META-INF/")) return true;

    // Already compressed formats
    if (filename.endsWith(".png") || filename.endsWith(".jpg") ||
        filename.endsWith(".mp3") || filename.endsWith(".ogg")) return true;

    return false;
}

/**
 * Check if a file requires 4-byte alignment
 */
function requiresAlignment(filename: string): boolean {
    const name = filename.split("/").pop() || "";

    // resources.arsc MUST be 4-byte aligned for Android R+
    if (name === "resources.arsc") return true;

    // Native libraries benefit from alignment
    if (filename.endsWith(".so")) return true;

    return false;
}

/**
 * Build an APK with proper 4-byte alignment for resources.arsc
 * 
 * @param files Map of filename to file content
 * @returns APK bytes as Buffer
 */
export async function buildAlignedApk(files: Map<string, Buffer>): Promise<Buffer> {
    const entries: ZipEntry[] = [];
    const sortedNames = Array.from(files.keys()).sort();

    // Prepare all entries
    for (const name of sortedNames) {
        const data = files.get(name)!;
        const storeUncompressed = shouldStoreUncompressed(name);
        const needsAlignment = requiresAlignment(name);

        let compressedData: Buffer;
        let compressionMethod: number;

        if (storeUncompressed) {
            compressedData = data;
            compressionMethod = 0; // STORE
        } else {
            compressedData = await deflateCompress(data);
            // Only use compression if it actually saves space
            if (compressedData.length < data.length) {
                compressionMethod = 8; // DEFLATE
            } else {
                compressedData = data;
                compressionMethod = 0;
            }
        }

        entries.push({
            name,
            data,
            crc32: crc32(data),
            compressedData,
            compressionMethod,
            isCompressed: compressionMethod === 8,
            requiresAlignment: needsAlignment,
        });
    }

    // Calculate sizes and offsets
    const chunks: Buffer[] = [];
    const localFileOffsets: number[] = [];
    let currentOffset = 0;

    // Write local file headers and data
    for (const entry of entries) {
        const nameBuffer = Buffer.from(entry.name, "utf8");

        // Base header size: 30 bytes + name length
        const baseHeaderSize = 30 + nameBuffer.length;

        // Calculate padding needed for alignment
        let extraFieldPadding = 0;
        if (entry.requiresAlignment && entry.compressionMethod === 0) {
            // Data must start at 4-byte aligned offset
            const dataOffset = currentOffset + baseHeaderSize;
            const misalignment = dataOffset % 4;
            if (misalignment !== 0) {
                extraFieldPadding = 4 - misalignment;
            }
        }

        // Store offset for central directory
        localFileOffsets.push(currentOffset);

        // Build local file header
        const header = Buffer.alloc(30);
        let pos = 0;

        // Signature
        header.writeUInt32LE(ZIP_LOCAL_FILE_HEADER_SIGNATURE, pos); pos += 4;
        // Version needed to extract
        header.writeUInt16LE(20, pos); pos += 2;
        // General purpose bit flag
        header.writeUInt16LE(0, pos); pos += 2;
        // Compression method
        header.writeUInt16LE(entry.compressionMethod, pos); pos += 2;
        // Last mod time/date (use fixed date)
        header.writeUInt16LE(0x4800, pos); pos += 2; // Time
        header.writeUInt16LE(0x5921, pos); pos += 2; // Date (2025-01-01)
        // CRC-32
        header.writeUInt32LE(entry.crc32, pos); pos += 4;
        // Compressed size
        header.writeUInt32LE(entry.compressedData.length, pos); pos += 4;
        // Uncompressed size
        header.writeUInt32LE(entry.data.length, pos); pos += 4;
        // Filename length
        header.writeUInt16LE(nameBuffer.length, pos); pos += 2;
        // Extra field length (for alignment padding)
        header.writeUInt16LE(extraFieldPadding, pos); pos += 2;

        // Write header
        chunks.push(header);
        currentOffset += header.length;

        // Write filename
        chunks.push(nameBuffer);
        currentOffset += nameBuffer.length;

        // Write extra field (padding for alignment)
        if (extraFieldPadding > 0) {
            chunks.push(Buffer.alloc(extraFieldPadding, 0));
            currentOffset += extraFieldPadding;
        }

        // Write file data
        chunks.push(entry.compressedData);
        currentOffset += entry.compressedData.length;
    }

    // Record start of central directory
    const centralDirStart = currentOffset;

    // Write central directory
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const nameBuffer = Buffer.from(entry.name, "utf8");

        const cdHeader = Buffer.alloc(46);
        let pos = 0;

        // Signature
        cdHeader.writeUInt32LE(ZIP_CENTRAL_DIR_SIGNATURE, pos); pos += 4;
        // Version made by
        cdHeader.writeUInt16LE(0x031E, pos); pos += 2; // Unix, ZIP spec 3.0
        // Version needed to extract
        cdHeader.writeUInt16LE(20, pos); pos += 2;
        // General purpose bit flag
        cdHeader.writeUInt16LE(0, pos); pos += 2;
        // Compression method
        cdHeader.writeUInt16LE(entry.compressionMethod, pos); pos += 2;
        // Last mod time/date
        cdHeader.writeUInt16LE(0x4800, pos); pos += 2;
        cdHeader.writeUInt16LE(0x5921, pos); pos += 2;
        // CRC-32
        cdHeader.writeUInt32LE(entry.crc32, pos); pos += 4;
        // Compressed size
        cdHeader.writeUInt32LE(entry.compressedData.length, pos); pos += 4;
        // Uncompressed size
        cdHeader.writeUInt32LE(entry.data.length, pos); pos += 4;
        // Filename length
        cdHeader.writeUInt16LE(nameBuffer.length, pos); pos += 2;
        // Extra field length
        cdHeader.writeUInt16LE(0, pos); pos += 2;
        // File comment length
        cdHeader.writeUInt16LE(0, pos); pos += 2;
        // Disk number start
        cdHeader.writeUInt16LE(0, pos); pos += 2;
        // Internal file attributes
        cdHeader.writeUInt16LE(0, pos); pos += 2;
        // External file attributes (Unix: 0100644)
        cdHeader.writeUInt32LE(0x81A40000, pos); pos += 4;
        // Relative offset of local header
        cdHeader.writeUInt32LE(localFileOffsets[i], pos); pos += 4;

        chunks.push(cdHeader);
        currentOffset += cdHeader.length;

        chunks.push(nameBuffer);
        currentOffset += nameBuffer.length;
    }

    const centralDirSize = currentOffset - centralDirStart;

    // Write end of central directory record
    const eocd = Buffer.alloc(22);
    let pos = 0;

    // Signature
    eocd.writeUInt32LE(ZIP_END_OF_CENTRAL_DIR_SIGNATURE, pos); pos += 4;
    // Disk number
    eocd.writeUInt16LE(0, pos); pos += 2;
    // Disk number with central directory
    eocd.writeUInt16LE(0, pos); pos += 2;
    // Number of entries on this disk
    eocd.writeUInt16LE(entries.length, pos); pos += 2;
    // Total number of entries
    eocd.writeUInt16LE(entries.length, pos); pos += 2;
    // Size of central directory
    eocd.writeUInt32LE(centralDirSize, pos); pos += 4;
    // Offset of central directory
    eocd.writeUInt32LE(centralDirStart, pos); pos += 4;
    // Comment length
    eocd.writeUInt16LE(0, pos); pos += 2;

    chunks.push(eocd);

    return Buffer.concat(chunks);
}

/**
 * Modify an APK file and rebuild with proper alignment.
 * 
 * @param apkBytes Original APK bytes
 * @param modifications Map of filename to new content (only for files to change)
 * @returns Modified APK bytes with proper alignment
 */
export async function modifyApkWithAlignment(
    apkBytes: Uint8Array,
    modifications: Map<string, Buffer>
): Promise<Buffer> {
    console.log("[APK Align] Loading APK...");

    // Load original APK
    const originalZip = await JSZip.loadAsync(apkBytes);

    // Collect all files
    const files = new Map<string, Buffer>();
    const filenames: string[] = [];

    originalZip.forEach((path, file) => {
        if (!file.dir) {
            filenames.push(path);
        }
    });

    // Read all files
    for (const name of filenames) {
        // Skip old signatures
        if (name.startsWith("META-INF/")) continue;

        const file = originalZip.file(name);
        if (file) {
            // Check if we have a modification for this file
            if (modifications.has(name)) {
                files.set(name, modifications.get(name)!);
                console.log(`[APK Align] Modified: ${name}`);
            } else {
                const content = await file.async("nodebuffer");
                files.set(name, content);
            }
        }
    }

    console.log(`[APK Align] Loaded ${files.size} files`);

    // Build aligned APK (without signature)
    const alignedApk = await buildAlignedApk(files);

    console.log(`[APK Align] Built aligned APK (${alignedApk.length} bytes)`);

    return alignedApk;
}

/**
 * Sign an aligned APK with JAR signing (v1 scheme)
 */
export async function signAlignedApk(apkBytes: Buffer): Promise<Buffer> {
    console.log("[APK Sign] Starting signature generation...");

    // Load the APK
    const zip = await JSZip.loadAsync(apkBytes);

    // Collect files for signing
    const files = new Map<string, Buffer>();
    const filenames: string[] = [];

    zip.forEach((path, file) => {
        if (!file.dir && !path.startsWith("META-INF/")) {
            filenames.push(path);
        }
    });

    for (const name of filenames) {
        const file = zip.file(name);
        if (file) {
            const content = await file.async("nodebuffer");
            files.set(name, content);
        }
    }

    // Generate debug certificate
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01";
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 30);

    const attrs = [
        { name: "commonName", value: "Android Debug" },
        { name: "organizationName", value: "Android" },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    // Build MANIFEST.MF
    const manifestLines = ["Manifest-Version: 1.0", "Created-By: 1.0 (PortalPay APK Builder)", ""];
    const sortedFiles = Array.from(files.keys()).sort();

    for (const name of sortedFiles) {
        const content = files.get(name)!;
        const hash = crypto.createHash("sha256").update(content).digest("base64");
        manifestLines.push(`Name: ${name}`);
        manifestLines.push(`SHA-256-Digest: ${hash}`);
        manifestLines.push("");
    }

    const manifestContent = manifestLines.join("\r\n");

    // Build CERT.SF
    const manifestHash = crypto.createHash("sha256").update(manifestContent).digest("base64");
    const sfLines = [
        "Signature-Version: 1.0",
        `SHA-256-Digest-Manifest: ${manifestHash}`,
        "Created-By: 1.0 (PortalPay APK Builder)",
        ""
    ];

    // Add per-entry digests
    const blocks = manifestContent.split("\r\n\r\n");
    for (const block of blocks) {
        if (block.startsWith("Name: ")) {
            const nameMatch = block.match(/Name: (.+)/);
            if (nameMatch) {
                const entryHash = crypto.createHash("sha256").update(block + "\r\n\r\n").digest("base64");
                sfLines.push(`Name: ${nameMatch[1]}`);
                sfLines.push(`SHA-256-Digest: ${entryHash}`);
                sfLines.push("");
            }
        }
    }

    const sfContent = sfLines.join("\r\n");

    // Build PKCS#7 signature
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(sfContent);
    p7.addCertificate(cert);
    p7.addSigner({
        key: keys.privateKey,
        certificate: cert,
        digestAlgorithm: forge.pki.oids.sha256,
        authenticatedAttributes: [
            { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
            { type: forge.pki.oids.messageDigest },
            { type: forge.pki.oids.signingTime, value: new Date().toISOString() },
        ],
    });
    p7.sign({ detached: true });

    const rsaContent = Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary");

    // Add signature files
    files.set("META-INF/MANIFEST.MF", Buffer.from(manifestContent));
    files.set("META-INF/CERT.SF", Buffer.from(sfContent));
    files.set("META-INF/CERT.RSA", rsaContent);

    console.log("[APK Sign] Signature files generated");

    // Rebuild with alignment
    const signedApk = await buildAlignedApk(files);

    console.log(`[APK Sign] Signed APK generated (${signedApk.length} bytes)`);

    return signedApk;
}
