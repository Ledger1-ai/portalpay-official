import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "../../../../../lib/cosmos";
import { renderToStream } from "@react-pdf/renderer";
import { EndOfDayPDF } from "../../../../../components/reports/EndOfDayPDF";
import JSZip from "jszip";
import React from "react";

const BLOCKED_URL_PART = "a311dcf8";
const LEGACY_LOGO = "cblogod.png";

function sanitizeShopTheme(theme: any) {
    if (!theme) return theme;
    const t = { ...theme };

    // Sanitize URLs
    if (t.brandLogoUrl && (t.brandLogoUrl.includes(BLOCKED_URL_PART) || t.brandLogoUrl.includes(LEGACY_LOGO))) {
        t.brandLogoUrl = "/BasaltSurgeWideD.png";
    }
    if (t.brandFaviconUrl && (t.brandFaviconUrl.includes(BLOCKED_URL_PART) || t.brandFaviconUrl.includes(LEGACY_LOGO))) {
        t.brandFaviconUrl = "/Surge.png";
    }
    return t;
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const sessionId = searchParams.get("sessionId");
        const startTs = Number(searchParams.get("start")); // Timestamp in seconds
        const endTs = Number(searchParams.get("end"));     // Timestamp in seconds
        const merchantWallet = req.headers.get("x-wallet");

        if (!sessionId || !startTs || !endTs || !merchantWallet) {
            return NextResponse.json({ error: "Missing required params" }, { status: 400 });
        }

        const container = await getContainer();
        const w = String(merchantWallet).toLowerCase();

        // 1. Verify User Role via Session
        const { resource: session } = await container.item(sessionId, w).read();

        if (!session) {
            return NextResponse.json({ error: "Session invalid" }, { status: 401 });
        }

        const role = String(session.role || "").toLowerCase();
        if (role !== "manager" && role !== "keyholder") {
            return NextResponse.json({ error: "Unauthorized: Requires manager or keyholder role" }, { status: 403 });
        }

        // 2. Fetch Shop Config for Branding
        const configQuery = {
            query: "SELECT * FROM c WHERE c.wallet = @w AND c.type = 'shop_config'",
            parameters: [{ name: "@w", value: w }]
        };
        const { resources: configs } = await container.items.query(configQuery).fetchAll();
        const config = configs[0] || { name: "Shop", theme: {} };

        if (config.theme) {
            config.theme = sanitizeShopTheme(config.theme);
        }

        // 3. Aggregate Data
        const receiptsQuery = {
            query: `
                SELECT c.totalUsd, c.tipAmount, c.currency, c.paymentMethod
                FROM c 
                WHERE c.type = 'receipt' 
                AND c.merchantWallet = @w 
                AND c._ts >= @start 
                AND c._ts <= @end
            `,
            parameters: [
                { name: "@w", value: w },
                { name: "@start", value: startTs },
                { name: "@end", value: endTs }
            ]
        };

        const { resources: receipts } = await container.items.query(receiptsQuery).fetchAll();

        // Calculate Stats
        const totalSales = receipts.reduce((acc: number, r: any) => acc + (r.totalUsd || 0), 0);
        const totalTips = receipts.reduce((acc: number, r: any) => acc + (r.tipAmount || 0), 0);
        const transactionCount = receipts.length;
        const averageOrderValue = transactionCount > 0 ? totalSales / transactionCount : 0;

        // Payment Methods Breakdown
        const methodMap = new Map<string, number>();
        for (const r of receipts) {
            const m = r.paymentMethod || r.currency || "Unknown";
            const val = r.totalUsd || 0;
            methodMap.set(m, (methodMap.get(m) || 0) + val);
        }

        const paymentMethods = Array.from(methodMap.entries()).map(([method, total]) => ({ method, total }));

        // 4. Generate PDF
        const pdfStream = await renderToStream(
            <EndOfDayPDF
                brandName={config.name || "Merchant"}
                logoUrl={config.theme?.brandLogoUrl}
                date={new Date(startTs * 1000).toLocaleDateString()}
                generatedBy={session.staffName || "Staff"}
                stats={{
                    totalSales,
                    totalTips,
                    transactionCount,
                    averageOrderValue
                }}
                paymentMethods={paymentMethods}
            />
        );

        // consume stream to buffer
        const chunks: Uint8Array[] = [];
        for await (const chunk of pdfStream) {
            chunks.push(chunk as Uint8Array);
        }
        const pdfBuffer = Buffer.concat(chunks);

        // 5. Generate CSV
        const csvRows = receipts.map((r: any) => {
            return `${r.currency},${r.paymentMethod || 'Unknown'},${r.totalUsd}`;
        });
        const csv = "Currency,Method,AmountUSD\n" + csvRows.join("\n");

        // 6. Zip It
        const zip = new JSZip();
        zip.file("report.pdf", pdfBuffer);
        zip.file("sales_data.csv", csv);

        // Return as Uint8Array for Next.js compatibility
        const zipData = await zip.generateAsync({ type: "uint8array" });

        // 7. Return
        return new NextResponse(new Blob([zipData as any]), {
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename="eod-report-${startTs}.zip"`
            }
        });

    } catch (e: any) {
        console.error("Report generation failed", e);
        return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
    }
}
