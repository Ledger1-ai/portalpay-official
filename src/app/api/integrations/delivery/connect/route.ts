import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { requireThirdwebAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET: Check connection status for current merchant's store
 * POST: Disconnect the current merchant's Uber Eats store
 */

export async function GET(req: NextRequest) {
    try {
        const auth = await requireThirdwebAuth(req);
        const wallet = auth.wallet;

        const container = await getContainer();
        const docId = `ubereats_connection:${wallet}`;

        try {
            const { resource } = await container.item(docId, wallet).read();

            if (resource && resource.connected) {
                return NextResponse.json({
                    connected: true,
                    storeId: resource.storeId,
                    connectedAt: resource.connectedAt
                });
            }
        } catch {
            // Document doesn't exist - not connected
        }

        return NextResponse.json({ connected: false });

    } catch (err: any) {
        console.error("[Uber Connect Status] Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const auth = await requireThirdwebAuth(req);
        const wallet = auth.wallet;

        const body = await req.json();
        const { action, storeId } = body;

        const container = await getContainer();
        const docId = `ubereats_connection:${wallet}`;

        if (action === "disconnect") {
            // Delete the connection document or mark as disconnected
            try {
                await container.item(docId, wallet).delete();
                console.log(`[Uber Disconnect] Successfully disconnected store for wallet: ${wallet}`);
            } catch {
                // Document may not exist, that's fine
            }

            return NextResponse.json({ success: true, message: "Disconnected from Uber Eats" });
        }

        if (action === "connect") {
            if (!storeId) {
                return NextResponse.json({ error: "Missing Store ID" }, { status: 400 });
            }

            // Save the connection
            const doc = {
                id: docId,
                wallet,
                storeId,
                connected: true,
                connectedAt: Date.now(),
                updatedAt: Date.now()
            };

            await container.items.upsert(doc);
            console.log(`[Uber Connect] Successfully connected store ${storeId} for wallet: ${wallet}`);

            return NextResponse.json({ success: true, storeId });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    } catch (err: any) {
        console.error("[Uber Connect] Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
