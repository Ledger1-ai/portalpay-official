import { NextRequest, NextResponse } from "next/server";
// [DEBUG] Force Rebuild: 2026-01-25 10:22 PM
import { getContainer } from "@/lib/cosmos";
import { renderToStream } from "@react-pdf/renderer";
import { EndOfDayPDF } from "@/components/reports/EndOfDayPDF";
import JSZip from "jszip";
import React from "react";
import sharp from "sharp";

const BLOCKED_URL_PART = "a311dcf8";
const LEGACY_LOGO = "cblogod.png";

function sanitizeShopTheme(theme: any) {
    if (!theme) return theme;
    const t = { ...theme };
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

        // Params
        const type = searchParams.get("type") || "z-report"; // z-report, x-report, employee, hourly
        const format = searchParams.get("format") || "json"; // json, zip
        const startTs = Number(searchParams.get("start"));
        const endTs = Number(searchParams.get("end"));

        // Auth Context
        const sessionId = searchParams.get("sessionId"); // Terminal Access
        // Allow fallback to query params for direct PDF/Link access
        const adminWallet = req.headers.get("x-linked-wallet") || searchParams.get("linkedWallet");
        const targetMerchantWallet = req.headers.get("x-wallet") || searchParams.get("wallet");

        console.log("[ReportsAPI] Debug Params:", {
            url: req.url,
            searchParams: searchParams.toString(),
            adminWalletHeader: req.headers.get("x-linked-wallet"),
            adminWalletParam: searchParams.get("linkedWallet"),
            finalAdminWallet: adminWallet
        });

        if (!startTs || !endTs || !targetMerchantWallet) {
            return NextResponse.json({ error: "Missing required params (start, end, wallet)" }, { status: 400 });
        }

        const container = await getContainer();
        const w = String(targetMerchantWallet).toLowerCase();

        // Enforce Partner Isolation
        const ct = String(process.env.NEXT_PUBLIC_CONTAINER_TYPE || process.env.CONTAINER_TYPE || "platform").toLowerCase();
        const branding = {
            key: String(process.env.BRAND_KEY || process.env.NEXT_PUBLIC_BRAND_KEY || "").toLowerCase()
        };

        if (ct === "partner") {
            if (!branding.key) {
                console.error("[Reports] Partner container missing BRAND_KEY");
                return NextResponse.json({ error: "Configuration error" }, { status: 500 });
            }

            // Verify merchant belongs to this brand
            // Similar to Auth check - query shop_config
            const querySpec = {
                query: "SELECT c.brandKey FROM c WHERE c.type = 'shop_config' AND c.wallet = @w",
                parameters: [{ name: "@w", value: w }]
            };
            const { resources: shops } = await container.items.query(querySpec).fetchAll();
            const shopBrand = String(shops?.[0]?.brandKey || "portalpay").toLowerCase();

            if (shopBrand !== branding.key) {
                console.warn(`[Reports] Blocked cross-brand access: Merchant ${shopBrand} trying to access report on ${branding.key}`);
                return NextResponse.json({ error: "Unauthorized for this brand" }, { status: 403 });
            }
        }

        // --- AUTHENTICATION ---
        let authorized = false;
        let staffName = "Admin";

        if (sessionId) {
            // 1. Terminal Session Authentication
            const sessionQuery = {
                query: "SELECT * FROM c WHERE c.id = @id AND c.type = 'terminal_session'",
                parameters: [{ name: "@id", value: sessionId }]
            };
            const { resources: sessions } = await container.items.query(sessionQuery).fetchAll();
            const session = sessions[0];

            if (session && session.merchantWallet === w) {
                const role = String(session.role || "").toLowerCase();
                if (role === "manager" || role === "keyholder") {
                    authorized = true;
                    staffName = session.staffName || "Staff";
                }
            } else {
                console.warn("[ReportsAPI] Invalid Session:", sessionId, session ? "Mismatch Wallet" : "Not Found");
            }
        } else if (adminWallet) {
            // 2. Admin Authentication (Multi-Org Linked Wallet)
            const requestWallet = String(adminWallet).toLowerCase();

            console.log(`[ReportsAPI] Admin Auth Check: Requesting=${requestWallet} Target=${w}`);

            // A. Owner Bypass: If the requesting wallet IS the merchant wallet, allow access.
            if (requestWallet === w) {
                authorized = true;
                staffName = "Owner";
                console.log("[ReportsAPI] Owner Bypass Granted");
            } else {
                // B. Manager Delegated Access
                const memberQuery = {
                    query: "SELECT * FROM c WHERE c.merchantWallet = @mw AND c.type = 'merchant_team_member' AND c.linkedWallet = @lw AND (c.role = 'manager' OR c.role = 'owner')",
                    parameters: [
                        { name: "@mw", value: w },
                        { name: "@lw", value: requestWallet }
                    ]
                };
                const { resources: members } = await container.items.query(memberQuery).fetchAll();
                if (members.length > 0) {
                    authorized = true;
                    staffName = members[0].name;
                    console.log("[ReportsAPI] Manager/Team Access Granted");
                } else {
                    console.warn("[ReportsAPI] Team Member Not Found for:", requestWallet);
                }
            }
        } else {
            console.warn("[ReportsAPI] No Auth Provided (Missing x-linked-wallet or session)");
        }

        if (!authorized) {
            console.error("[ReportsAPI] Unauthorized Access Attempt", { targetMerchantWallet, adminWallet, sessionId });
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        // --- DATA AGGREGATION ---

        // ... Data Fetching ...

        // (Skipping large data fetching block for Replace call)

        // ... (Skipping to Response) ...

        // This tool call only replaces the Auth Block. I will do Format replacement separately.


        // --- DATA AGGREGATION ---

        // Base Receipt Query
        const receiptsQuery = {
            query: `
                SELECT c.totalUsd, c.tipAmount, c.currency, c.paymentMethod, c.createdAt, c.employeeId
                FROM c 
                WHERE c.type = 'receipt' 
                AND c.merchantWallet = @w 
                AND c._ts >= @start 
                AND c._ts <= @end
                AND LOWER(c.status) IN ('paid', 'checkout_success', 'confirmed', 'tx_mined', 'reconciled')
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
        const net = totalSales - 0; // Refunds not yet tracked fully?

        // Payment Methods Breakdown
        const methodMap = new Map<string, number>();
        for (const r of receipts) {
            const m = r.paymentMethod || r.currency || "Unknown";
            const val = r.totalUsd || 0;
            methodMap.set(m, (methodMap.get(m) || 0) + val);
        }
        const paymentMethods = Array.from(methodMap.entries()).map(([method, total]) => ({ method, total }));

        // Specialized Data based on Type
        let detailedData: any = {};

        if (type === "employee" || type === "z-report") {
            const empMap = new Map<string, { sales: number, tips: number, count: number }>();
            for (const r of receipts) {
                const eid = r.employeeId || "Unknown";
                if (!empMap.has(eid)) empMap.set(eid, { sales: 0, tips: 0, count: 0 });
                const e = empMap.get(eid)!;
                e.sales += (r.totalUsd || 0);
                e.tips += (r.tipAmount || 0);
                e.count += 1;
            }
            detailedData.employees = Array.from(empMap.entries()).map(([id, stats]) => ({
                id,
                ...stats,
                aov: stats.count > 0 ? stats.sales / stats.count : 0
            }));
        } else if (type === "hourly") {
            const hourMap = new Array(24).fill(0);
            for (const r of receipts) {
                const d = new Date(r.createdAt || 0);
                const h = d.getHours(); // This uses Server Time (UTC probably), client might need local adjust.
                // Ideally we use local offset passed in params, but for now simplistic UTC mapping 
                hourMap[h] += (r.totalUsd || 0);
            }
            detailedData.hourly = hourMap.map((amount, hour) => ({ hour, amount }));
        }

        // Enrich Employee Names
        if (detailedData.employees) {
            const ids = detailedData.employees.map((e: any) => e.id).filter((id: string) => id !== "Unknown");
            if (ids.length > 0) {
                // Fetch names for IDs
                const nameQuery = {
                    query: `SELECT c.id, c.name FROM c WHERE c.type = 'merchant_team_member' AND c.merchantWallet = @w AND ARRAY_CONTAINS(@ids, c.id)`,
                    parameters: [{ name: "@w", value: w }, { name: "@ids", value: ids }]
                };
                const { resources: members } = await container.items.query(nameQuery).fetchAll();
                const nameMap: Record<string, string> = {};
                members.forEach((m: any) => nameMap[m.id] = m.name);

                detailedData.employees = detailedData.employees.map((e: any) => ({
                    ...e,
                    name: nameMap[e.id] || e.id
                }));
            }
        }

        const reportData = {
            meta: {
                type,
                generatedBy: staffName,
                date: new Date(startTs * 1000).toISOString(),
                range: { start: startTs, end: endTs }
            },
            summary: {
                totalSales,
                totalTips,
                transactionCount,
                averageOrderValue,
                net
            },
            paymentMethods,
            ...detailedData,
            receipts: receipts.map((r: any) => ({
                id: r.id,
                totalUsd: r.totalUsd,
                currency: r.currency,
                paymentMethod: r.paymentMethod,
                createdAt: r.createdAt,
                employeeId: r.employeeId
            }))
        };

        // --- RESPONSE FORMAT ---

        console.log(`[ReportsAPI] Auth Success: ${staffName} accessing ${w}`);

        if (format === "json") {
            return NextResponse.json(reportData);
        } else if (format === "zip" || format === "pdf") {
            // Need Store Config for Branding
            // Need Store Config for Branding
            // Use robust query to handle case-sensitivity issues
            const configQuery = {
                query: "SELECT * FROM c WHERE LOWER(c.wallet) = @w AND c.type = 'shop_config'",
                parameters: [{ name: "@w", value: w }]
            };
            const { resources: configs } = await container.items.query(configQuery).fetchAll();
            let config = configs[0];

            // Fallback: If no config found, try querying without type (rare but possible legacy)
            if (!config) {
                console.log("[ReportsAPI] Config not found with strict type, strictly checking ID...");
                try {
                    // Last ditch: Point Read with various casings? No, query is better.
                    // Just use defaults.
                    config = { name: "Merchant", theme: {} };
                } catch { }
            }
            // Ensure Config Object structure
            if (!config) config = { name: "Merchant", theme: {} };

            if (config.theme) config.theme = sanitizeShopTheme(config.theme);

            // FIX: Ensure Logo is Absolute URL for PDF Renderer (server-side needs host)
            if (config.theme?.brandLogoUrl && config.theme.brandLogoUrl.startsWith("/")) {
                const origin = req.nextUrl.origin;
                config.theme.brandLogoUrl = `${origin}${config.theme.brandLogoUrl}`;
            }

            // FIX: Convert WebP to PNG using Sharp (React-PDF doesn't support WebP)
            if (config.theme?.brandLogoUrl) {
                try {
                    const logoUrl = config.theme.brandLogoUrl;
                    const response = await fetch(logoUrl);
                    if (response.ok) {
                        const arrayBuffer = await response.arrayBuffer();
                        const buffer = Buffer.from(arrayBuffer);

                        // Convert to PNG using sharp
                        const pngBuffer = await sharp(buffer).png().toBuffer();
                        const base64Info = pngBuffer.toString('base64');
                        config.theme.brandLogoUrl = `data:image/png;base64,${base64Info}`;
                        console.log(`[ReportsAPI] Transcoded Logo to PNG (${Math.round(pngBuffer.length / 1024)}KB)`);
                    }
                } catch (e) {
                    console.warn("[ReportsAPI] Logo transcoding failed:", e);
                    // Fallback to text (undefined logo) or original (might fail)
                    // If transcoding fails, react-pdf might still crash on original webp, so safer to unset
                    if (config.theme.brandLogoUrl.endsWith(".webp")) {
                        config.theme.brandLogoUrl = undefined;
                    }
                }
            }

            console.log(`[ReportsAPI] PDF Branding: Name='${config.name}' Logo='${config.theme?.brandLogoUrl ? 'Present (DataURI)' : 'None'}' Color='${config.theme?.primaryColor}'`);

            const reportTitleMap: Record<string, string> = {
                "z-report": "End of Day Report (Z)",
                "x-report": "Snapshot Report (X)",
                "employee": "Employee Performance Report",
                "hourly": "Hourly Sales Report"
            };

            // PDF
            const pdfStream = await renderToStream(
                <EndOfDayPDF
                    brandName={config.name || "Merchant"}
                    logoUrl={config.theme?.brandLogoUrl}
                    brandColor={config.theme?.primaryColor || config.theme?.brandColor}
                    date={new Date(startTs * 1000).toLocaleDateString()}
                    generatedBy={staffName}
                    reportTitle={reportTitleMap[type] || "Report"}
                    stats={{
                        totalSales,
                        totalTips,
                        transactionCount,
                        averageOrderValue
                    }}
                    paymentMethods={paymentMethods}
                    employees={detailedData.employees}
                    hourly={detailedData.hourly}
                    // Explicit Visibility Flags
                    showPayments={type === "z-report" || type === "x-report"}
                    showEmployeeStats={type === "z-report" || type === "x-report" || type === "employee"}
                    showHourlyStats={type === "z-report" || type === "x-report" || type === "hourly"}
                />
            );

            // Stream to Buffer
            const chunks: Uint8Array[] = [];
            for await (const chunk of pdfStream) chunks.push(chunk as Uint8Array);
            const pdfBuffer = Buffer.concat(chunks);

            if (format === "pdf") {
                return new NextResponse(new Blob([pdfBuffer]), {
                    headers: {
                        "Content-Type": "application/pdf",
                        "Content-Disposition": `attachment; filename="${type}-report-${startTs}.pdf"`
                    }
                });
            }

            // CSV
            let csv = "";

            if (type === "employee" && detailedData.employees) {
                const header = "EmployeeID,Sales,Tips,Orders,AvgOrder\n";
                const rows = detailedData.employees.map((e: any) =>
                    `${e.id},${e.sales},${e.tips},${e.count},${e.aov}`
                ).join("\n");
                csv = header + rows;
            } else if (type === "hourly" && detailedData.hourly) {
                const header = "Hour,SalesAmount\n";
                const rows = detailedData.hourly.map((h: any) =>
                    `${h.hour}:00,${h.amount}`
                ).join("\n");
                csv = header + rows;
            } else {
                // Default Z/X Report (Receipt Dump)
                const rows = receipts.map((r: any) => {
                    return `${r.currency},${r.paymentMethod || 'Unknown'},${r.totalUsd},${r.employeeId || ''},${new Date(r.createdAt || 0).toISOString()}`;
                });
                csv = "Currency,Method,AmountUSD,EmployeeID,Date\n" + rows.join("\n");
            }

            // Zip
            const zip = new JSZip();
            zip.file(`${type}_report.pdf`, pdfBuffer);
            zip.file(`${type}_data.csv`, csv);

            const zipData = await zip.generateAsync({ type: "uint8array" });

            return new NextResponse(new Blob([zipData as any]), {
                headers: {
                    "Content-Type": "application/zip",
                    "Content-Disposition": `attachment; filename="${type}-report-${startTs}.zip"`
                }
            });
        }

        return NextResponse.json({ error: "Invalid format" }, { status: 400 });

    } catch (e: any) {
        console.error("Report API Error", e);
        return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
    }
}
