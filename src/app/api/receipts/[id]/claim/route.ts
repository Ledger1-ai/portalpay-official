import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/receipts/[id]/claim
 * Body: { wallet: string }
 * - Links a buyer wallet to a paid receipt (loyalty claim)
 * - Updates 'buyerWallet' field in Cosmos
 * - Only works if receipt is paid/settled
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const correlationId = crypto.randomUUID();
    const p = await ctx.params;
    const id = String(p?.id || "").trim();

    if (!id) {
        return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const buyerWallet = String(body.wallet || "").toLowerCase();

        if (!/^0x[a-f0-9]{40}$/i.test(buyerWallet)) {
            return NextResponse.json({ ok: false, error: "invalid_wallet" }, { status: 400 });
        }

        const container = await getContainer();

        // We need to find the receipt. Since we might not know the merchant wallet (partition key),
        // we query by receiptId. Ideally, the client provides merchant wallet to optimized read,
        // but for safety we query.
        // However, for efficiency, let's try to assume the client passes the merchant wallet in header
        // or we query.
        // Querying by ID is safer.

        const spec = {
            query: "SELECT TOP 1 * FROM c WHERE c.type='receipt' AND c.receiptId=@id",
            parameters: [{ name: "@id", value: id }]
        };
        const { resources } = await container.items.query(spec).fetchAll();
        const existing = Array.isArray(resources) && resources[0] ? resources[0] : null;

        if (!existing) {
            return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
        }

        const status = String(existing.status || "").toLowerCase();
        const isPaid = ["paid", "completed", "reconciled", "settled", "checkout_success", "tx_mined"].includes(status);

        if (!isPaid) {
            return NextResponse.json({ ok: false, error: "receipt_not_paid" }, { status: 400 });
        }

        // If already claimed by someone else?
        // "let's them know that they are now registered... and link it"
        // If buyerWallet is already set and different, do we overwrite? 
        // Usually on-ramp creates a temp wallet. The user connecting is the "real" wallet.
        // Let's allow overwrite for now or if empty.

        // Update
        const patch = {
            ...existing,
            buyerWallet: buyerWallet,
            lastUpdatedAt: Date.now()
        };

        await container.items.upsert(patch);

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        console.error("Claim failed", e);
        return NextResponse.json({ ok: false, error: e.message || "failed" }, { status: 500 });
    }
}
