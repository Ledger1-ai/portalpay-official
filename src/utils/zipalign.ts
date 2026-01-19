/**
 * Node.js implementation of zipalign (4-byte alignment)
 * Android APKs require uncompressed resources to be aligned on 4-byte boundaries.
 */
export async function zipalign(zipBuffer: Uint8Array): Promise<Uint8Array> {
    const buffer = Buffer.from(zipBuffer);
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    // 1. Find EOCD (End of Central Directory)
    // Scan backwards from end for signature 0x06054b50
    let eocdOffset = -1;
    for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
            eocdOffset = i;
            break;
        }
    }
    if (eocdOffset === -1) throw new Error("EOCD not found");

    const numEntries = view.getUint16(eocdOffset + 10, true);
    const cdOffset = view.getUint32(eocdOffset + 16, true);
    const cdSize = view.getUint32(eocdOffset + 12, true);

    // 2. Parse Central Directory to get file list and offsets
    interface Entry {
        fileName: string;
        compressionMethod: number;
        compressedSize: number;
        localHeaderOffset: number;
        cdBuffer: Buffer; // Copy of CD entry to be updated later
        isUncompressed: boolean;
    }

    const entries: Entry[] = [];
    let ptr = cdOffset;
    for (let i = 0; i < numEntries; i++) {
        if (view.getUint32(ptr, true) !== 0x02014b50) throw new Error("Invalid CD signature");

        const compressionMethod = view.getUint16(ptr + 10, true);
        const compressedSize = view.getUint32(ptr + 20, true);
        const fileNameLen = view.getUint16(ptr + 28, true);
        const extraLen = view.getUint16(ptr + 30, true);
        const commentLen = view.getUint16(ptr + 32, true);
        const localHeaderOffset = view.getUint32(ptr + 42, true);

        const fileName = buffer.subarray(ptr + 46, ptr + 46 + fileNameLen).toString("utf8");
        const entryTotalLen = 46 + fileNameLen + extraLen + commentLen;
        const cdEntryBuffer = Buffer.from(buffer.subarray(ptr, ptr + entryTotalLen));

        // Determine if alignment is needed (STORE compression or .so files)
        // Note: Android requires .so to be aligned even if compressed? No, only uncompressed .so.
        // Standard zipalign aligns all uncompressed files.
        const isUncompressed = compressionMethod === 0;

        entries.push({
            fileName,
            compressionMethod,
            compressedSize,
            localHeaderOffset,
            cdBuffer: cdEntryBuffer,
            isUncompressed
        });

        ptr += entryTotalLen;
    }

    // 3. Rebuild ZIP stream
    const parts: Buffer[] = [];
    let currentOffset = 0;

    // We must process in order of their appearance in the file (Local Header order), 
    // not necessarily CD order.
    entries.sort((a, b) => a.localHeaderOffset - b.localHeaderOffset);

    for (const entry of entries) {
        const oldLhOffset = entry.localHeaderOffset;

        // Parse Local Header
        if (view.getUint32(oldLhOffset, true) !== 0x04034b50) throw new Error("Invalid LH signature");
        const lhFileNameLen = view.getUint16(oldLhOffset + 26, true);
        const lhExtraLen = view.getUint16(oldLhOffset + 28, true);

        const lhFixedLen = 30; // 30 bytes fixed header
        const oldExtraOffset = oldLhOffset + lhFixedLen + lhFileNameLen;
        const dataOffset = oldExtraOffset + lhExtraLen;

        const headerFixed = buffer.subarray(oldLhOffset, oldLhOffset + lhFixedLen + lhFileNameLen); // Signature -> Filename
        let extraField = buffer.subarray(oldExtraOffset, oldExtraOffset + lhExtraLen);
        const data = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);

        // Calculate needed padding
        let newExtra = extraField;
        let padding = 0;

        if (entry.isUncompressed) {
            // Offset where data will start: currentOffset + fixed + filename + existing_extra + padding_overhead + padding
            // But we integrate padding INTO extra field.
            // Current logical end of header (start of data) would be: currentOffset + headerFixed.length + extraField.length
            const potentialDataStart = currentOffset + headerFixed.length + extraField.length;

            const remainder = potentialDataStart % 4;
            if (remainder !== 0) {
                // We need to add (4 - remainder) bytes.
                // But adding bytes requires extending Extra Field, which adds 4 bytes overhead (ID+Len).
                // If we simply pad with 0s it's invalid ZIP.
                // We must add a valid Extra Field record.
                // Record overhead is 4 bytes.
                // So adding a record adds (4 + payload) bytes.
                // We need TotalAdded % 4 == (4 - remainder).

                // TotalAdded = 4 + payload.
                // (4 + payload) % 4 == payload % 4.
                // So payload % 4 should equal (4 - remainder) % 4.
                // And payload alignment? No, just total bytes.

                // Example: remainder is 1 (pos 101). Need 3 bytes to reach 104.
                // Can we add 3 bytes?
                // Overhead is 4. 4 + payload = 3? Impossible.
                // 4 + payload = 7? (add 7 bytes). 101 + 7 = 108 (aligned).
                // So if needed=3, we add 7. payload=3.
                // If needed=1, we add 5. payload=1.
                // If needed=2, we add 6. payload=2.
                // If needed=0, zero.

                const needed = 4 - remainder; // 1, 2, 3, or 4 (which is 0)

                // Construct padding extra field: ID(2)=0x0000, Len(2)=payload
                const payloadLen = needed;
                // Wait: needed is what we want to shift by.
                // We add (4 + payloadLen).
                // (4 + payloadLen) % 4 == payloadLen % 4.
                // We want shift % 4 == needed.
                // So payloadLen = needed.
                // Total added = 4 + needed.
                // Example: pos 101. Remainder 1. Target 104 (diff 3).
                // needed=3. payload=3. Total added=7.
                // 101 + 7 = 108. 108 is aligned. Correct.

                const padHeader = Buffer.alloc(4);
                padHeader.writeUInt16LE(0xD935, 0); // 0xD935 - Android alignment ID (or simply use reserved 0)
                // Actually 0xD935 is specific for zipalign. Let's use it.
                padHeader.writeUInt16LE(payloadLen, 2);

                const padData = Buffer.alloc(payloadLen).fill(0);

                newExtra = Buffer.concat([extraField, padHeader, padData]);
                padding = 4 + payloadLen;
            }
        }

        // Update Local Header Extra Field Length
        const newLh = Buffer.from(headerFixed); // Copy
        newLh.writeUInt16LE(newExtra.length, 28); // Update extra len at offset 28

        // Track new offset for this entry
        // NOTE: entries are processed in order, so we can update the CD buffer directly 
        // but check if 'entry' reference is shared? (It's an object in array).
        entry.localHeaderOffset = currentOffset;

        // Write components
        parts.push(newLh);
        parts.push(newExtra);
        parts.push(data);

        currentOffset += newLh.length + newExtra.length + data.length;
    }

    // 4. Write Central Directory
    const newCdStart = currentOffset;
    for (const entry of entries) {
        // Update local header offset in CD entry
        entry.cdBuffer.writeUInt32LE(entry.localHeaderOffset, 42);
        parts.push(entry.cdBuffer);
        currentOffset += entry.cdBuffer.length;
    }

    // 5. Write EOCD
    const eocd = Buffer.from(buffer.subarray(eocdOffset));
    // Update CD offset in EOCD (offset 16)
    eocd.writeUInt32LE(newCdStart, 16);
    parts.push(eocd);

    return Buffer.concat(parts);
}
