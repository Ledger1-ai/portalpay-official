require('dotenv').config({ path: '.env.local' });
const { BlobServiceClient } = require("@azure/storage-blob");

async function listBlobs() {
    const conn = process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AZURE_BLOB_CONNECTION_STRING;
    const containerName = process.env.PP_APK_CONTAINER || "portalpay";

    if (!conn) {
        console.error("No Connection String found in .env.local");
        return;
    }

    const bsc = BlobServiceClient.fromConnectionString(conn);
    const container = bsc.getContainerClient(containerName);

    console.log(`Listing blobs in container '${containerName}' with prefix 'brands/xoinpay/'...`);

    // List blobs
    let count = 0;
    for await (const blob of container.listBlobsFlat({ prefix: 'brands/xoinpay/' })) {
        console.log(` - ${blob.name} (${blob.properties.contentLength} bytes)`);
        count++;
        if (count > 50) {
            console.log("... (truncated)");
            break;
        }
    }

    if (count === 0) {
        console.log("No blobs found with that prefix.");
        // Try listing root brands/ just in case
        console.log("Checking 'brands/' root...");
        for await (const blob of container.listBlobsFlat({ prefix: 'brands/' })) {
            if (blob.name.includes("xoinpay")) {
                console.log(` - ${blob.name}`);
            }
        }
    }
}

listBlobs().catch(console.error);
