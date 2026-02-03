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

        // 4. Processing Fee - fetch from brand-scoped splitConfig
        const wallet = receipt.wallet;
        let feePct = 0.005; // 0.5% default fallback
        try {
            // Get brandKey from receipt, env, or fallback
            const effectiveBrandKey = (
                typeof receipt?.brandKey === "string" ? receipt.brandKey.toLowerCase() :
                    (process.env.BRAND_KEY || process.env.NEXT_PUBLIC_BRAND_KEY || "").toLowerCase()
            ) || undefined;

            let basePlatformFeePct: number | undefined = undefined;

            // Priority 1: Fetch splitConfig from brand-scoped site config (cross-partition query)
            if (effectiveBrandKey) {
                try {
                    const docId = `site:config:${effectiveBrandKey}`;
                    const spec = {
                        query: "SELECT * FROM c WHERE c.id = @docId",
                        parameters: [{ name: "@docId", value: docId }]
                    };
                    const { resources: cfgResources } = await container.items.query(spec).fetchAll();
                    const cfgResource = Array.isArray(cfgResources) && cfgResources[0] ? cfgResources[0] : null;
                    if (cfgResource?.splitConfig && typeof cfgResource.splitConfig === "object") {
                        const splitCfg = cfgResource.splitConfig;
                        const partnerBps = typeof splitCfg.partnerBps === "number" ? splitCfg.partnerBps : 0;
                        const platformBps = typeof splitCfg.platformBps === "number" ? splitCfg.platformBps : 0;
                        const agentBps = Array.isArray(splitCfg.agents)
                            ? splitCfg.agents.reduce((s: number, a: any) => s + (Number(a.bps) || 0), 0)
                            : 0;
                        basePlatformFeePct = (partnerBps + platformBps + agentBps) / 100;
                        console.log("[Tip Route] Using splitConfig fees:", { partnerBps, platformBps, agentBps, basePlatformFeePct });
                    }
                } catch (e: any) {
                    console.log("[Tip Route] splitConfig fetch failed:", e.message);
                }
            }

            // Priority 2: Fallback to getSiteConfigForWallet
            if (typeof basePlatformFeePct !== "number") {
                const cfg = await getSiteConfigForWallet(wallet, effectiveBrandKey);
                const splitCfg = (cfg as any)?.splitConfig;
                if (splitCfg && typeof splitCfg === "object") {
                    const partnerBps = typeof splitCfg.partnerBps === "number" ? splitCfg.partnerBps : 0;
                    const platformBps = typeof splitCfg.platformBps === "number" ? splitCfg.platformBps : 0;
                    const agentBps = Array.isArray(splitCfg.agents)
                        ? splitCfg.agents.reduce((s: number, a: any) => s + (Number(a.bps) || 0), 0)
                        : 0;
                    basePlatformFeePct = (partnerBps + platformBps + agentBps) / 100;
                } else if (typeof (cfg as any)?.basePlatformFeePct === "number") {
                    basePlatformFeePct = (cfg as any).basePlatformFeePct;
                }
                const procFee = Number(cfg?.processingFeePct || 0);
                if (typeof basePlatformFeePct === "number") {
                    basePlatformFeePct += procFee;
                }
            }

            // Priority 3: Default 0.5%
            if (typeof basePlatformFeePct !== "number") {
                basePlatformFeePct = 0.5;
            }

            feePct = basePlatformFeePct / 100;
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
