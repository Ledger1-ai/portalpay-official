require('dotenv').config({ path: '.env.local' });
const { BlobServiceClient } = require("@azure/storage-blob");
const fs = require('fs');
const path = require('path');

async function restore() {
    const conn = process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AZURE_BLOB_CONNECTION_STRING;
    if (!conn) {
        console.error("No Azure Connection String found.");
        process.exit(1);
    }

    const containerName = process.env.PP_APK_CONTAINER || "portalpay";
    const blobName = "base/portalpay-unsigned-master.apk";
    const destPath = path.join(__dirname, '../android/launcher/recovered/portalpay-unsigned.apk');

    console.log(`Downloading ${blobName} from container '${containerName}' to ${destPath}...`);

    const blobServiceClient = BlobServiceClient.fromConnectionString(conn);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    if (!await blockBlobClient.exists()) {
        console.error("Master APK not found in Azure!");
        process.exit(1);
    }

    const response = await blockBlobClient.download();
    const writableStream = fs.createWriteStream(destPath);

    response.readableStreamBody.pipe(writableStream);

    writableStream.on('finish', () => {
        console.log("Download complete!");
    });
}

restore();
