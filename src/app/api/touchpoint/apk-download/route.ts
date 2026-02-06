import { NextRequest, NextResponse } from "next/server";
import { BlobServiceClient } from "@azure/storage-blob";

export const runtime = "nodejs";

/**
 * GET /api/touchpoint/apk-download?brandKey=xoinpay
 * 
 * Public APK download endpoint for setup scripts.
 * Downloads the branded APK from Azure Blob Storage.
 * 
 * No auth required - this is used by the setup script running on technician machines.
 * Security: Only serves APKs that exist in blob storage (pre-built by admin).
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const brandKey = searchParams.get("brandKey")?.trim().toLowerCase();

        if (!brandKey) {
            return NextResponse.json({ error: "brandKey_required" }, { status: 400 });
        }

        // Validate brand key format (alphanumeric + hyphens only)
        if (!/^[a-z0-9-]+$/.test(brandKey)) {
            return NextResponse.json({ error: "invalid_brandKey" }, { status: 400 });
        }

        // Get APK from Azure Blob Storage
        const conn = String(process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AZURE_BLOB_CONNECTION_STRING || "").trim();
        const container = String(process.env.PP_APK_CONTAINER || "apks").trim();

        if (!conn) {
            return NextResponse.json({ error: "blob_storage_not_configured" }, { status: 503 });
        }

        try {
            const prefix = String(process.env.PP_APK_BLOB_PREFIX || "").trim().replace(/^\/+|\/+$/g, "");
            const blobName = prefix
                ? `${prefix}/${brandKey}-touchpoint-signed.apk`
                : `${brandKey}-touchpoint-signed.apk`;

            const bsc = BlobServiceClient.fromConnectionString(conn);
            const cont = bsc.getContainerClient(container);
            const blob = cont.getBlockBlobClient(blobName);

            // Check if blob exists
            const exists = await blob.exists();
            if (!exists) {
                // Try alternative naming convention
                const altBlobName = prefix
                    ? `${prefix}/${brandKey}-signed.apk`
                    : `${brandKey}-signed.apk`;
                const altBlob = cont.getBlockBlobClient(altBlobName);
                const altExists = await altBlob.exists();

                if (!altExists) {
                    return NextResponse.json({
                        error: "apk_not_found",
                        message: `No APK found for brand: ${brandKey}. Build the APK first from Admin Panel.`
                    }, { status: 404 });
                }

                // Use alternative blob
                const buf = await altBlob.downloadToBuffer();
                return createApkResponse(buf, brandKey);
            }

            const buf = await blob.downloadToBuffer();
            return createApkResponse(buf, brandKey);

        } catch (e: any) {
            console.error("[touchpoint/apk-download] Blob error:", e);
            return NextResponse.json({
                error: "apk_download_failed",
                message: "Failed to download APK from storage"
            }, { status: 500 });
        }

    } catch (e: any) {
        console.error("[touchpoint/apk-download] Error:", e);
        return NextResponse.json({ error: "download_failed" }, { status: 500 });
    }
}

function createApkResponse(buf: Buffer, brandKey: string): Response {
    const body = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(body);
            controller.close();
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "application/vnd.android.package-archive",
            "Content-Length": String(buf.length),
            "Content-Disposition": `attachment; filename="${brandKey}-touchpoint.apk"`,
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    });
}
