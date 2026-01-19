
const JSZip = require("jszip");
const fs = require("fs");
// Mocking the zipalign function import since it's TS
// We'll read the TS file and eval it or just copy logic? 
// Actually easier to just require ts-node or similar? 
// Let's simple copy the logic into this test script for verification to avoid environment issues.
// OR we can try to require it if we set up ts-node.
// Let's try to run it via `ts-node` or just assume I can use a .ts test file if I have ts-node working?
// I'll write a .ts test file and run with npx ts-node?

// Actually, I'll essentially rewrite the test to be self-contained JS + logic to verify.
// I want to test the *actual logic* I modified.
// I will just create a basic JS test that imports the built/transpiled code or I'll copy the function.

// Let's create `scripts/test-alignment.ts` and try to run it with `npx ts-node`.

import { zipalign } from "../src/utils/zipalign";
import JSZip from "jszip";

async function test() {
    console.log("Creating test ZIP...");
    const zip = new JSZip();
    // Add a file that needs alignment (STORE)
    // We need enough data to make offsets interesting.
    const content = Buffer.alloc(100).fill("A");

    // file1: STORE
    zip.file("test.txt", content, { compression: "STORE" });
    // file2: DEFLATE (should be ignored/copied)
    zip.file("compressed.txt", content);
    // file3: STORE (needs alignment)
    zip.file("test2.txt", content, { compression: "STORE" });

    const unaligned = await zip.generateAsync({ type: "nodebuffer", platform: "UNIX" });

    console.log("Original ZIP size:", unaligned.length);
    checkAlignment(unaligned, "Original");

    console.log("\nRunning zipalign...");
    try {
        const aligned = await zipalign(unaligned);
        console.log("Aligned ZIP size:", aligned.length);
        checkAlignment(aligned, "Aligned");

        // Check if valid by reopening
        const loaded = await JSZip.loadAsync(aligned);
        console.log("ZIP is valid (re-opened with JSZip)");
        console.log("Entries:", Object.keys(loaded.files));

    } catch (e) {
        console.error("Zipalign failed:", e);
    }
}

function checkAlignment(buffer: Buffer, label: string) {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    // Simple scan for headers
    let offset = 0;
    while (offset < buffer.length - 30) {
        if (view.getUint32(offset, true) === 0x04034b50) { // Local Header
            const nameLen = view.getUint16(offset + 26, true);
            const extraLen = view.getUint16(offset + 28, true);
            const method = view.getUint16(offset + 8, true);
            const name = buffer.slice(offset + 30, offset + 30 + nameLen).toString();

            const dataOffset = offset + 30 + nameLen + extraLen;
            const isAligned = dataOffset % 4 === 0;

            const status = (method === 0 ? (isAligned ? "OK" : "FAIL") : "SKIP (Compressed)");
            console.log(`[${label}] ${name} (method=${method}) Data at ${dataOffset} (${dataOffset % 4}) -> ${status}`);

            // Advance (needs parsing compressed size)
            // This simple scanner might fail if it hits a signature in data.
            // But for this controlled test it's fine.
            // Need valid skip.
            // For this test we know structure or can read size.
            const cSize = view.getUint32(offset + 18, true);
            offset = dataOffset + cSize;
        } else {
            offset++;
        }
    }
}

test().catch(console.error);
