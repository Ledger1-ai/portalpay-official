"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { formatCurrency, roundForCurrency, convertFromUsd, SUPPORTED_CURRENCIES } from "@/lib/fx";
import { fetchEthRates, fetchUsdRates } from "@/lib/eth";
import { QRCode } from "react-qrcode-logo";
import { createPortal } from "react-dom";

// Shared Logic extracted from TerminalPage
// Props allow overriding the "Operator" (Merchant) vs the Connected Wallet
interface TerminalInterfaceProps {
    merchantWallet: string; // The wallet receiving funds
    employeeId?: string;    // Optional employee ID to track
    employeeName?: string;
    employeeRole?: string;
    sessionId?: string;     // Optional active session ID
    onLogout?: () => void;
    brandName?: string;
    logoUrl?: string;
    theme?: any;
}

export default function TerminalInterface({ merchantWallet, employeeId, employeeName, employeeRole, sessionId, onLogout, brandName, logoUrl, theme }: TerminalInterfaceProps) {
    const [amountStr, setAmountStr] = useState<string>("");
    const [itemLabel, setItemLabel] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [reportLoading, setReportLoading] = useState(false);
    const [error, setError] = useState("");
    const [terminalCurrency, setTerminalCurrency] = useState("USD");

    // Rates
    const [rates, setRates] = useState<Record<string, number>>({});
    const [usdRates, setUsdRates] = useState<Record<string, number>>({});

    useEffect(() => {
        Promise.all([fetchEthRates(), fetchUsdRates()])
            .then(([r, u]) => { setRates(r); setUsdRates(u); })
            .catch(() => { });
    }, []);

    // Calculator Logic
    function parseAmount(): number {
        const v = Number(amountStr || "0");
        return Number.isFinite(v) ? Math.max(0, v) : 0;
    }
    function appendDigit(d: string) {
        setAmountStr((prev) => {
            const next = (prev || "") + d;
            const parts = next.split(".");
            if (parts.length > 2) return prev || "";
            if (parts.length === 2 && parts[1].length > 2) return prev || "";
            return next.replace(/[^\d.]/g, "");
        });
    }
    function backspace() { setAmountStr((prev) => (prev || "").slice(0, -1)); }
    function clearAmount() { setAmountStr(""); }

    const baseUsd = parseAmount();
    const totalUsd = baseUsd;

    // Conversion
    const totalConverted = useMemo(() => {
        if (terminalCurrency === "USD") return totalUsd;
        const usdRate = Number(usdRates[terminalCurrency] || 0);
        if (usdRate > 0) return roundForCurrency(totalUsd * usdRate, terminalCurrency);
        const converted = convertFromUsd(totalUsd, terminalCurrency, rates);
        return converted > 0 ? roundForCurrency(converted, terminalCurrency) : totalUsd;
    }, [totalUsd, terminalCurrency, usdRates, rates]);

    // Receipt Generation
    const [qrOpen, setQrOpen] = useState(false);
    const [selected, setSelected] = useState<any | null>(null);

    async function generateReceipt() {
        try {
            setLoading(true);
            setError("");
            const amt = parseAmount();
            if (!(amt > 0)) {
                setError("Enter an amount");
                return;
            }

            const payload = {
                amountUsd: +amt.toFixed(2),
                label: (itemLabel || "").trim() || "Terminal Payment",
                currency: terminalCurrency,
                employeeId, // Track employee
                sessionId   // Track session
            };

            const r = await fetch("/api/receipts/terminal", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-wallet": merchantWallet },
                body: JSON.stringify(payload),
            });
            const j = await r.json();
            if (!r.ok || !j?.ok) {
                setError(j?.error || "Failed to generate receipt");
                return;
            }
            setSelected(j.receipt);
            setQrOpen(true);
        } catch (e: any) {
            setError(e?.message || "Failed");
        } finally {
            setLoading(false);
        }
    }

    // Polling Logic for Fallback
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (qrOpen && selected && selected.status !== "paid") {
            const poll = async () => {
                try {
                    const res = await fetch("/api/terminal/check-payment", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            wallet: merchantWallet,
                            receiptId: selected.receiptId,
                            since: selected.createdAt,
                            amount: totalConverted,
                            currency: terminalCurrency
                        })
                    });
                    const data = await res.json();
                    if (data.ok && data.paid) {
                        // Confirmed!
                        setSelected((prev: any) => ({ ...prev, status: "paid", txHash: data.txHash }));
                        // Optional: Play sound or vibrate
                    }
                } catch (e) {
                    console.error("Poll failed", e);
                }
            };

            // Initial poll after 5s, then every 10s
            timer = setInterval(poll, 10000);
            poll(); // Immediate check? No, give it a sec.
        }
        return () => clearInterval(timer);
    }, [qrOpen, selected, merchantWallet, totalConverted, terminalCurrency]);

    // End of Day / Summary Logic
    const [summaryOpen, setSummaryOpen] = useState(false);
    const [reportData, setReportData] = useState<any>(null);
    const [activeReportTab, setActiveReportTab] = useState<"summary" | "details" | "sessions">("summary");

    async function openSummary() {
        setReportLoading(true);
        setError("");
        try {
            const now = new Date();
            const startTs = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime() / 1000);
            const endTs = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime() / 1000);

            const res = await fetch(`/api/terminal/reports?sessionId=${sessionId}&start=${startTs}&end=${endTs}&type=z-report&format=json`, {
                headers: { "x-wallet": merchantWallet }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load summary");

            setReportData(data);
            setSummaryOpen(true);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setReportLoading(false);
        }
    }

    async function closeDay() {
        if (!confirm("Are you sure you want to close the day? This will end the current session.")) return;
        setReportLoading(true);
        try {
            const r = await fetch("/api/terminal/session", {
                method: "POST",
                body: JSON.stringify({ sessionId, merchantWallet })
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || "Failed to close session");

            // Success - maybe redirect or logout
            if (onLogout) onLogout();
            else window.location.reload();

        } catch (e: any) {
            alert(e.message);
            setReportLoading(false);
        }
    }

    // Portal URL for QR
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const portalUrl = useMemo(() => {
        if (!selected) return "";
        const base = `${origin}/portal/${encodeURIComponent(selected.receiptId)}?recipient=${encodeURIComponent(merchantWallet)}`;

        // Removed excessive theme params to keep QR code simple/scannable
        // The portal page will fetch the merchant's config via the wallet address

        return base;
    }, [selected, merchantWallet, origin]);

    const isManagerOrKeyholder = employeeRole === 'manager' || employeeRole === 'keyholder';

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {logoUrl && <img src={logoUrl} className="h-10 w-10 object-contain" />}
                    <div>
                        <h1 className="text-md font-bold">{brandName || "Terminal"}</h1>
                        {employeeName && <div className="text-sm text-muted-foreground">Operator: {employeeName}</div>}
                    </div>
                </div>
                <div className="flex gap-2">
                    {isManagerOrKeyholder && (
                        <button
                            onClick={openSummary}
                            disabled={reportLoading}
                            className="px-4 py-2 text-sm border bg-background rounded-md hover:bg-muted disabled:opacity-50"
                        >
                            {reportLoading ? "Loading..." : "End of Day Summary"}
                        </button>
                    )}
                    {onLogout && (
                        <button onClick={onLogout} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">
                            Logout
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Keypad */}
                <div className="space-y-4">
                    <div className="bg-muted/10 border rounded-xl p-6 text-center space-y-2">
                        <div className="text-sm text-muted-foreground uppercase tracking-wider">Amount</div>
                        <div className="text-4xl font-mono font-bold">{formatCurrency(baseUsd, terminalCurrency)}</div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, ".", 0, "⌫"].map((btn) => (
                            <button
                                key={btn}
                                onClick={() => { if (btn === "⌫") backspace(); else if (btn === ".") appendDigit("."); else appendDigit(String(btn)); }}
                                className="h-16 rounded-xl border bg-background text-xl font-semibold hover:bg-muted/50 active:scale-95 transition-all"
                            >
                                {btn}
                            </button>
                        ))}
                        <button onClick={clearAmount} className="col-span-3 h-12 rounded-xl border text-sm text-muted-foreground hover:bg-red-50 hover:text-red-500 hover:border-red-200">
                            Clear
                        </button>
                    </div>
                </div>

                {/* Details & Action */}
                <div className="space-y-4 flex flex-col">
                    <div className="bg-background border rounded-xl p-4 flex-1 space-y-4">
                        <div>
                            <label className="text-xs font-semibold uppercase text-muted-foreground">Currency</label>
                            <select
                                className="w-full mt-1 p-2 border rounded-md"
                                value={terminalCurrency}
                                onChange={e => setTerminalCurrency(e.target.value)}
                            >
                                {SUPPORTED_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} - {c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase text-muted-foreground">Note / Label</label>
                            <input
                                className="w-full mt-1 p-2 border rounded-md"
                                placeholder="Optional description"
                                value={itemLabel}
                                onChange={e => setItemLabel(e.target.value)}
                            />
                        </div>

                        <div className="pt-4 border-t mt-auto">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-muted-foreground">Total</span>
                                <span className="text-xl font-bold">{formatCurrency(totalConverted, terminalCurrency)}</span>
                            </div>
                            {terminalCurrency !== "USD" && (
                                <div className="flex justify-between items-center text-sm text-muted-foreground">
                                    <span>USD Equiv</span>
                                    <span>${totalUsd.toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {error && <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded">{error}</div>}

                    <button
                        onClick={generateReceipt}
                        disabled={loading || baseUsd <= 0}
                        className="w-full h-14 bg-primary text-primary-foreground rounded-xl font-bold text-lg shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
                    >
                        {loading ? "Creating..." : "Generate Payment QR"}
                    </button>
                </div>
            </div>

            {/* QR Modal */}
            {/* QR / Payment Modal */}
            {qrOpen && selected && typeof window !== "undefined" && createPortal(
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm grid place-items-center p-4 animate-in fade-in receipt-modal-overlay">
                    <div className="bg-[#0f0f12] text-white rounded-2xl max-w-sm w-full text-center relative shadow-2xl p-8 border border-white/10 print-no-bg">
                        <button
                            onClick={() => setQrOpen(false)}
                            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors print-hidden"
                        >
                            <span className="opacity-70 group-hover:opacity-100">
                                <XIcon />
                            </span>
                        </button>

                        <div className="print-hidden">
                            <h2 className="text-2xl font-bold mb-6">Scan to Pay</h2>

                            <div className="inline-block mb-4 p-2 rounded-xl border border-white/10 relative">
                                <QRCode
                                    value={portalUrl}
                                    size={200}
                                    fgColor="#ffffff"
                                    bgColor="transparent"
                                    qrStyle="dots"
                                    eyeRadius={10}
                                    eyeColor={(theme as any)?.secondaryColor || (theme as any)?.primaryColor || "#ffffff"}
                                    logoImage={logoUrl}
                                    logoWidth={40}
                                    logoHeight={40}
                                    removeQrCodeBehindLogo={true}
                                    logoPadding={5}
                                    ecLevel="H"
                                    quietZone={10}
                                />
                                {/* Success Overlay */}
                                {selected?.status === "paid" && (
                                    <div className="absolute inset-0 z-10 bg-black/80 flex items-center justify-center backdrop-blur-sm rounded-lg animate-in fade-in duration-300">
                                        <div className="bg-green-500 rounded-full p-4 shadow-[0_0_30px_-5px_var(--pp-brand-green)]">
                                            <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="text-4xl font-mono font-bold mb-2 tracking-tight">
                                {formatCurrency(totalConverted, terminalCurrency)}
                            </div>

                            <div className="text-xs text-muted-foreground px-4 opacity-50 mb-4 font-mono whitespace-nowrap overflow-hidden text-ellipsis w-full max-w-[300px] mx-auto">
                                {portalUrl}
                            </div>

                            {/* Polling / Fallback Status */}
                            {selected?.status !== "paid" && (
                                <div className="mb-6 space-y-2">
                                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                        <span>Waiting for payment...</span>
                                    </div>
                                    <div className="text-[10px] text-gray-500 font-mono">
                                        Checking chain every 10s • <span className="opacity-70">Detecting {terminalCurrency}</span>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => window.print()}
                                    className="px-4 py-3 border border-white/10 rounded-xl font-semibold hover:bg-white/5 transition-colors"
                                >
                                    Print
                                </button>
                                <button
                                    onClick={() => {
                                        if (selected?.status === 'paid') {
                                            setQrOpen(false);
                                            clearAmount();
                                            setItemLabel("");
                                        } else {
                                            setQrOpen(false);
                                        }
                                    }}
                                    className="px-4 py-3 text-white rounded-xl font-bold shadow-lg hover:brightness-110 active:scale-95 transition-all"
                                    style={{ backgroundColor: selected?.status === 'paid' ? '#22c55e' : ((theme as any)?.secondaryColor || (theme as any)?.primaryColor || "#000") }}
                                >
                                    {selected?.status === 'paid' ? "New Sale" : "Cancel"}
                                </button>
                            </div>
                        </div>

                        {/* Printable Receipt - Hidden on Screen */}
                        <div className="thermal-paper hidden print:block text-black text-left mx-auto font-mono leading-tight">
                            <div className="flex flex-col items-center mb-2">
                                {logoUrl && <img src={logoUrl} className="w-8 h-8 object-contain grayscale mb-1" />}
                                <h2 className="font-bold text-center text-sm">{brandName || "Terminal"}</h2>
                                {employeeName && <div className="text-[10px] mt-0.5">Op: {employeeName.split('•')[0].trim()}</div>}
                            </div>

                            <div className="border-b border-black border-dashed opacity-50 my-2" />

                            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[10px]">
                                <span className="text-gray-600">Time</span>
                                <span className="text-right">{new Date().toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true })}</span>

                                <span className="text-gray-600">Rcpt</span>
                                <span className="text-right truncate">{selected.receiptId.slice(0, 8)}</span>
                            </div>

                            <div className="border-b border-black border-dashed opacity-50 my-2" />

                            <div className="flex justify-between items-center text-sm font-bold my-2">
                                <span>{itemLabel || "Sale"}</span>
                                <span>{formatCurrency(totalConverted, terminalCurrency)}</span>
                            </div>

                            <div className="border-b border-black border-dashed opacity-50 my-2" />

                            <div className="flex justify-center my-2">
                                <QRCode
                                    value={portalUrl}
                                    size={100}
                                    fgColor="#000000"
                                    bgColor="transparent"
                                    qrStyle="dots"
                                    eyeRadius={4}
                                    removeQrCodeBehindLogo={false}
                                    logoImage=""
                                    ecLevel="M"
                                    quietZone={0}
                                />
                            </div>

                            <div className="text-center text-[8px] font-mono break-all opacity-70 mt-1">
                                {window.location.host}/portal/{selected.receiptId.slice(0, 8)}...
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* End of Day Summary Modal */}
            {summaryOpen && reportData && typeof window !== "undefined" && createPortal(
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm grid place-items-center p-4 animate-in fade-in">
                    <div className="rounded-2xl max-w-2xl w-full text-center relative shadow-2xl flex flex-col max-h-[90vh] border border-white/10 bg-[#0f0f12] text-white">
                        {/* Header */}
                        <div className="flex justify-between items-center p-6 border-b border-white/10">
                            <h2 className="text-xl font-bold">End of Day Report</h2>
                            <button
                                onClick={() => setSummaryOpen(false)}
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                            >
                                <XIcon />
                            </button>
                        </div>

                        <div className="flex border-b border-white/10">
                            {[
                                { id: "summary", label: "Summary" },
                                { id: "details", label: "Details & Transactions" },
                                { id: "sessions", label: "Sessions" }
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    className={`flex-1 py-3 text-sm font-semibold transition-colors`}
                                    style={{
                                        borderBottom: activeReportTab === tab.id ? `2px solid ${(theme as any)?.secondaryColor || (theme as any)?.primaryColor || "#fff"}` : "transparent",
                                        color: activeReportTab === tab.id ? ((theme as any)?.secondaryColor || (theme as any)?.primaryColor || "#fff") : "#9ca3af"
                                    }}
                                    onClick={() => setActiveReportTab(tab.id as any)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Content */}
                        <div className="p-6 overflow-y-auto flex-1 text-left">
                            {activeReportTab === "summary" && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                            <p className="text-xs text-gray-400 uppercase font-semibold">Total Sales</p>
                                            <p className="text-3xl font-bold">{formatCurrency((reportData.summary?.totalSales || 0), "USD")}</p>
                                        </div>
                                        <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                            <p className="text-xs text-gray-400 uppercase font-semibold">Total Tips</p>
                                            <p className="text-3xl font-bold">{formatCurrency((reportData.summary?.totalTips || 0), "USD")}</p>
                                        </div>
                                    </div>

                                    <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-medium text-gray-400">Transactions</span>
                                            <span className="text-lg font-bold">{reportData.summary?.transactionCount || 0}</span>
                                        </div>
                                        <div className="flex justify-between items-center border-t border-white/10 pt-3">
                                            <span className="text-sm font-medium text-gray-400">Avg. Order Value</span>
                                            <span className="text-lg font-bold">{formatCurrency((reportData.summary?.averageOrderValue || 0), "USD")}</span>
                                        </div>
                                        <div className="flex justify-between items-center border-t border-white/10 pt-3">
                                            <span className="text-sm font-bold uppercase">Net Revenue</span>
                                            <span className="text-xl font-bold text-green-400">{formatCurrency((reportData.summary?.net || 0), "USD")}</span>
                                        </div>
                                    </div>

                                    {/* Payment Methods */}
                                    {reportData.paymentMethods && reportData.paymentMethods.length > 0 && (
                                        <div className="space-y-2">
                                            <h3 className="text-sm font-semibold text-gray-400 uppercase">Payment Methods</h3>
                                            <div className="bg-white/5 rounded-lg border border-white/5 divide-y divide-white/5">
                                                {reportData.paymentMethods.map((pm: any, idx: number) => (
                                                    <div key={idx} className="flex justify-between items-center p-3 text-sm">
                                                        <span className="font-medium">{pm.method}</span>
                                                        <span>{formatCurrency(pm.total, "USD")}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Employee Performance */}
                                    {reportData.employees && reportData.employees.length > 0 && (
                                        <div className="space-y-2">
                                            <h3 className="text-sm font-semibold text-gray-400 uppercase">Employee Performance</h3>
                                            <div className="bg-white/5 rounded-lg border border-white/5 divide-y divide-white/5">
                                                <div className="flex justify-between items-center p-3 text-xs text-muted-foreground bg-white/5 font-semibold uppercase">
                                                    <span>Staff Member</span>
                                                    <span className="text-right">Sales (Tips)</span>
                                                </div>
                                                {reportData.employees.map((emp: any, idx: number) => (
                                                    <div key={idx} className="flex justify-between items-center p-3 text-sm">
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">{emp.name || emp.id}</span>
                                                            <span className="text-xs text-muted-foreground">{emp.count} orders • {formatCurrency(emp.aov, "USD")} avg</span>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="font-bold">{formatCurrency(emp.sales, "USD")}</div>
                                                            {emp.tips > 0 && <div className="text-xs text-muted-foreground">+{formatCurrency(emp.tips, "USD")} tips</div>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeReportTab === "details" && (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <h3 className="text-sm font-semibold text-gray-400">Transactions ({reportData.receipts?.length || 0})</h3>
                                    </div>

                                    {reportData.receipts && reportData.receipts.length > 0 ? (
                                        <div className="border border-white/10 rounded-lg overflow-hidden">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-white/5 text-gray-400 font-medium">
                                                    <tr>
                                                        <th className="px-4 py-2">Time</th>
                                                        <th className="px-4 py-2">Method</th>
                                                        <th className="px-4 py-2 text-right">Amount</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/5">
                                                    {reportData.receipts.map((r: any, idx: number) => (
                                                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                                                            <td className="px-4 py-3 text-gray-400">
                                                                {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </td>
                                                            <td className="px-4 py-3 font-medium">
                                                                {r.paymentMethod || r.currency || "Cash"}
                                                            </td>
                                                            <td className="px-4 py-3 text-right font-bold">
                                                                {formatCurrency(r.totalUsd, "USD")}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="text-center py-10 text-gray-500 bg-white/5 rounded-xl border border-white/10 border-dashed">
                                            No detailed transactions available for this period.
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeReportTab === "sessions" && (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <h3 className="text-sm font-semibold text-gray-400">Sessions ({reportData.sessions?.length || 0})</h3>
                                    </div>

                                    {reportData.sessions && reportData.sessions.length > 0 ? (
                                        <div className="border border-white/10 rounded-lg overflow-hidden">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-white/5 text-gray-400 font-medium">
                                                    <tr>
                                                        <th className="px-4 py-2">Staff</th>
                                                        <th className="px-4 py-2">Start</th>
                                                        <th className="px-4 py-2">End</th>
                                                        <th className="px-4 py-2 text-right">Sales (Tips)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/5">
                                                    {reportData.sessions.map((s: any, idx: number) => (
                                                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                                                            <td className="px-4 py-3 font-medium text-white">{s.staffName}</td>
                                                            <td className="px-4 py-3 text-gray-400">
                                                                {new Date(s.startTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </td>
                                                            <td className="px-4 py-3 text-gray-400">
                                                                {s.endTime ? new Date(s.endTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : <span className="text-green-400 font-bold">Active</span>}
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                <span className="font-bold text-white">{formatCurrency(s.totalSales, "USD")}</span>
                                                                {s.totalTips > 0 && <span className="text-xs text-muted-foreground ml-1">({formatCurrency(s.totalTips, "USD")})</span>}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="text-center py-10 text-gray-500 bg-white/5 rounded-xl border border-white/10 border-dashed">
                                            No session history available for this period.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-white/10 bg-white/5 rounded-b-2xl">
                            <button
                                onClick={closeDay}
                                disabled={reportLoading}
                                className="w-full py-3 bg-red-600 text-white rounded-xl font-bold text-lg hover:bg-red-700 disabled:opacity-50 transition-colors shadow-sm"
                            >
                                {reportLoading ? "Closing..." : "Close Day & Logout"}
                            </button>
                            <p className="text-xs text-gray-500 mt-2">
                                Closing the day ends your session. Values are final.
                            </p>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

function XIcon() {
    return <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="M6 6 18 18" /></svg>
}
