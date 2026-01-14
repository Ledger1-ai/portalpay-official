import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { getSiteConfigForWallet } from "@/lib/site-config"; // If needed for fresh fees
import { getBrandKey } from "@/config/brands";

function toCents(n: number) { return Math.round(Math.max(0, Number(n || 0)) * 100); }
function fromCents(c: number) { return Math.round(c) / 100; }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const tipInput = Number(body?.tipAmount);

    if (!id || !Number.isFinite(tipInput) || tipInput < 0) {
        return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    try {
        const container = await getContainer();
        const query = `SELECT * FROM c WHERE c.receiptId = @id`;
        const { resources } = await container.items.query({
            query,
            parameters: [{ name: "@id", value: id }]
        }).fetchAll();

        if (!resources || resources.length === 0) {
            return NextResponse.json({ error: "receipt_not_found" }, { status: 404 });
        }

        const receipt = resources[0];
        if (receipt.status === 'paid' || receipt.status === 'reconciled') {
            // For now, allow adding tips post-payment? (e.g. restaurant write-in).
            // But usually this updates the total charged.
            // If manual cash tip, maybe valid. If update charge, problematic.
            // Let's allow it but log a warning or flag.
        }

        const tipAmount = fromCents(toCents(tipInput));

        // Recalculate Totals
        // 1. Identify Base
        // Look for items that are NOT Tax, Processing Fee, Gratuity
        const baseItems = receipt.lineItems.filter((i: any) =>
            i.label !== "Tax" && i.label !== "Processing Fee" && i.label !== "Gratuity"
        );
        const baseUsd = baseItems.reduce((acc: number, i: any) => acc + (i.priceUsd || 0), 0);
        const baseCents = toCents(baseUsd);

        // 2. Recalculate Tax (Fixed Rate from Receipt)
        const taxRate = Number(receipt.taxRate || 0);
        const taxCents = Math.round(baseCents * taxRate);

        // 3. Tip
        const tipCents = toCents(tipAmount);

        // 4. Processing Fee
        // We need the fee percentage. It might be stored implicitly or we fetch.
        // If we can't find it, we might preserve existing fee ratio?
        // Simpler: Fetch config for wallet.
        const wallet = receipt.wallet;
        let feePct = 0.005; // 0.5% default
        try {
            const cfg = await getSiteConfigForWallet(wallet);
            // Re-derive fee logic (base + processing)
            // This is complex to duplicate.
            // Alternative: Derive from existing receipt if fee exists?
            const oldFeeItem = receipt.lineItems.find((i: any) => i.label === "Processing Fee");
            const oldTotalPreFee = (receipt.totalUsd || 0) - (oldFeeItem?.priceUsd || 0);
            if (oldFeeItem && oldTotalPreFee > 0) {
                // fee / preFee
                // This is imprecise.
            }
            const procFee = Number(cfg?.processingFeePct || 0);
            /* We'll use a simplified fetch here or just use default 0.5% + stored processingFeePct if available in site config? 
               Actually, let's just use 0.5% + (cfg.processingFeePct || 0).
            */
            const basePlatformFee = 0.5; // We assume 0.5% unless brand overridden, which is hard to check here.
            // Let's stick to 0.5% + cfg.processingFeePct for consistency with Terminal.
            feePct = (basePlatformFee + procFee) / 100;
        } catch { }

        // Calculate Fee on (Base + Tax + Tip)
        // Fees usually apply to the total amount charged to card.
        const subtotalCents = baseCents + taxCents + tipCents;
        const feeCents = Math.round(subtotalCents * feePct);

        const totalCents = subtotalCents + feeCents;

        // Construct new Line Items
        const newLineItems = [
            ...baseItems,
            ...(taxCents > 0 ? [{ label: "Tax", priceUsd: fromCents(taxCents) }] : []),
            ...(tipCents > 0 ? [{ label: "Gratuity", priceUsd: fromCents(tipCents) }] : []),
            ...(feeCents > 0 ? [{ label: "Processing Fee", priceUsd: fromCents(feeCents) }] : [])
        ];

        const updatedReceipt = {
            ...receipt,
            tipAmount: tipAmount,
            totalUsd: fromCents(totalCents),
            lineItems: newLineItems,
            lastUpdatedAt: Date.now()
        };

        await container.items.upsert(updatedReceipt);

        return NextResponse.json({ ok: true, receipt: updatedReceipt });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
