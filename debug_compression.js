
const JSZip = require("jszip");
const fs = require("fs");

async function main() {
    console.log("Creating dummy APK structure...");

    // Simulate reading an APK
    const zip = new JSZip();
    zip.file("AndroidManifest.xml", "dummy content");
    zip.file("resources.arsc", Buffer.alloc(1024)); // 1KB dummy arsc
    zip.file("classes.dex", "dummy code");

    // The Logic from package/route.ts
    const mustBeUncompressed = (filePath) => {
        const name = filePath.split("/").pop() || "";
        if (name === "resources.arsc") return true;
        return false;
    };

    const newApkZip = new JSZip();

    // Iterate and write
    const files = [];
    zip.forEach((path, file) => files.push({ path, file }));

    for (const { path, file } of files) {
        const content = await file.async("nodebuffer");
        const compress = !mustBeUncompressed(path);

        console.log(`Processing ${path}: Compress=${compress}`);

        newApkZip.file(path, content, {
            compression: compress ? "DEFLATE" : "STORE",
            compressionOptions: compress ? { level: 6 } : undefined,
        });
    }

    const buffer = await newApkZip.generateAsync({
        type: "nodebuffer",
        platform: "UNIX",
    });

    // Inspect the generated ZIP headers
    const checkZip = await JSZip.loadAsync(buffer);
    const arsc = checkZip.file("resources.arsc");
    // JSZip internals aren't easily exposed via public API for compression method check
    // We can check the raw entries if we access internal objects, but easier to just log what we requested.
    // However, to be 100% sure, we can parse the local file header manually or trust the generating log.

    // Let's write it to disk to check with external tools if needed, 
    // but for now, we rely on the logic check printed above.
    // Actually, we can check the _data property if we are lucky (implementation detail)
    // or inspect it via a simple header parses.

    // Simple manual parse of Local File Header for the first file (likely resources.arsc if we added it?)
    // No, order is not guaranteed.

    console.log("\nVerifying 'resources.arsc' compression method in generated buffer...");

    // Find "resources.arsc" in the buffer
    // Filename is at offset 30 in LFH.
    // Search for the string.
    const searchBuf = Buffer.from("resources.arsc");
    const idx = buffer.indexOf(searchBuf);
    if (idx !== -1) {
        // LFH starts 30 + filenameLength bytes BEFORE the filename? 
        // No. LFH structure:
        // 0-3: Signature (0x04034b50)
        // ...
        // 8-9: Compression Method (0=Stored, 8=Deflated)

        // We need to find the specific LFH for this file.
        // It's safer to scan for signatures and check filenames.

        let found = false;
        let pos = 0;
        while (pos < buffer.length) {
            const sig = buffer.readUInt32LE(pos);
            if (sig !== 0x04034b50) {
                // Central directory or other
                break;
            }

            const compressionMethod = buffer.readUInt16LE(pos + 8);
            const nameLen = buffer.readUInt16LE(pos + 26);
            const extraLen = buffer.readUInt16LE(pos + 28);
            const name = buffer.slice(pos + 30, pos + 30 + nameLen).toString();

            if (name === "resources.arsc") {
                console.log(`Found resources.arsc Header at path ${pos}`);
                console.log(`Compression Method: ${compressionMethod} (0=STORE, 8=DEFLATE)`);
                if (compressionMethod === 0) console.log("SUCCESS: Stored Uncompressed");
                else console.error("FAILURE: Compressed!");
                found = true;
                break;
            }

            // Move to next entry
            // This is hard without parsing size... 
            // Compressed size is at +18, Uncompressed at +22
            const compSize = buffer.readUInt32LE(pos + 18);
            pos += 30 + nameLen + extraLen + compSize;

            // Data descriptor handling is missing here but JSZip usually doesn't use them for Buffer generation if unrelated.
            // Actually JSZip generateAsync might put Data Descriptors (bit 3 of flags).
            const flags = buffer.readUInt16LE(pos + 6);
            if ((flags & 0x0008) !== 0) {
                console.log("Warning: Data Descriptor used, skipping offset calc might be wrong.");
            }
        }

        if (!found) console.log("Could not locate resources.arsc header in scan.");
    }
}

main().catch(console.error);
