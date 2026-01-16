
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const appKey = searchParams.get("app");

        const conn = String(process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AZURE_BLOB_CONNECTION_STRING || "").trim();
        const container = String(process.env.PP_APK_CONTAINER || "portalpay").trim();
        const prefix = String(process.env.PP_APK_BLOB_PREFIX || "brands").trim().replace(/^\/+|\/+$/g, "");

        const debugInfo: any = {
            connConfigured: !!conn,
            container,
            prefix,
            appKey,
            blobsFound: []
        };

        if (conn && container) {
            const { BlobServiceClient } = await import("@azure/storage-blob");
            const bsc = BlobServiceClient.fromConnectionString(conn);
            const cont = bsc.getContainerClient(container);

            debugInfo.containerExists = await cont.exists();

            // List blobs to see what's actually there
            const blobs = cont.listBlobsFlat({ prefix });
            for await (const blob of blobs) {
                debugInfo.blobsFound.push(blob.name);
            }

            if (appKey) {
                const blobName = prefix ? `${prefix}/${appKey}-signed.apk` : `${appKey}-signed.apk`;
                const blobClient = cont.getBlockBlobClient(blobName);
                debugInfo.targetBlobCheck = {
                    colculatedName: blobName,
                    exists: await blobClient.exists()
                };
            }
        }

        return NextResponse.json(debugInfo);
    } catch (e: any) {
        return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
    }
}
