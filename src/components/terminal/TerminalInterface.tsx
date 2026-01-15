"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { formatCurrency, roundForCurrency, convertFromUsd, SUPPORTED_CURRENCIES } from "@/lib/fx";
import { fetchEthRates, fetchUsdRates } from "@/lib/eth";
import { QRCodeCanvas } from "qrcode.react";
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

export default function TerminalInterface({ merchantWallet, employeeId, employeeName, employeeRole, sessionId, onLogout, brandName, logoUrl }: TerminalInterfaceProps) {
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

    async function handleEndOfDayReport() {
        if (reportLoading) return;
        setReportLoading(true);
        setError("");

        try {
            // Calculate start/end of day in local time (or just send UTC range if preferred, but local is better for "End of Day")
            // We'll stick to simple 00:00 - 23:59 local client time converted to ISO or timestamp
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

            const startTs = Math.floor(startOfDay.getTime() / 1000);
            const endTs = Math.floor(endOfDay.getTime() / 1000);

            const res = await fetch(`/api/terminal/reports/end-of-day?sessionId=${sessionId}&start=${startTs}&end=${endTs}`, {
                method: "GET",
                headers: { "x-wallet": merchantWallet }
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Failed to generate report");
            }

            // Download Blob
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `end-of-day-${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

        } catch (e: any) {
            console.error(e);
            setError(e.message || "Report generation failed");
        } finally {
            setReportLoading(false);
        }
    }

    // Portal URL for QR
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const portalUrl = selected
        ? `${origin}/portal/${encodeURIComponent(selected.receiptId)}?recipient=${encodeURIComponent(merchantWallet)}`
        : "";

    const isManagerOrKeyholder = employeeRole === 'manager' || employeeRole === 'keyholder';

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {logoUrl && <img src={logoUrl} className="h-10 w-10 object-contain" />}
                    <div>
                        <h1 className="text-2xl font-bold">{brandName || "Terminal"}</h1>
                        {employeeName && <div className="text-sm text-muted-foreground">Operator: {employeeName}</div>}
                    </div>
                </div>
                <div className="flex gap-2">
                    {isManagerOrKeyholder && (
                        <button
                            onClick={handleEndOfDayReport}
                            disabled={reportLoading}
                            className="px-4 py-2 text-sm border bg-background rounded-md hover:bg-muted disabled:opacity-50"
                        >
                            {reportLoading ? "Generating..." : "End-of-Day Report"}
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
            {qrOpen && selected && typeof window !== "undefined" && createPortal(
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm grid place-items-center p-4 animate-in fade-in">
                    <div className="bg-white p-6 rounded-2xl max-w-sm w-full space-y-6 text-center relative shadow-2xl">
                        <button
                            onClick={() => setQrOpen(false)}
                            className="absolute right-4 top-4 text-gray-400 hover:text-black"
                        >
                            <XIcon />
                        </button>

                        <h2 className="text-2xl font-bold text-black">Scan to Pay</h2>

                        <div className="bg-white p-2 rounded-xl border inline-block">
                            <QRCodeCanvas value={portalUrl} size={200} />
                        </div>

                        <div className="text-3xl font-mono font-bold text-black">
                            {formatCurrency(totalConverted, terminalCurrency)}
                        </div>

                        <div className="text-sm text-gray-500 break-all">{portalUrl}</div>

                        <div className="grid grid-cols-2 gap-3 pt-4">
                            <button onClick={() => window.print()} className="px-4 py-2 border rounded-lg text-black hover:bg-gray-50">Print</button>
                            <button onClick={() => setQrOpen(false)} className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800">Done</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

function XIcon() {
    return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 18 18" /></svg>
}
