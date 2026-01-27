"use client";

import React, { useEffect, useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { Lock, FileText, Download, Calendar, User, Building2, ChevronRight, X, Loader2, Printer } from "lucide-react";
import { formatCurrency } from "@/lib/fx";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// Types
type MerchantProfile = {
    id: string; // team member id
    merchantWallet: string;
    role: string;
    name: string;
    merchantName?: string;
    logo?: string;
};

export default function ReportsPanel({ merchantWallet, theme }: { merchantWallet: string, theme: any }) {
    const account = useActiveAccount();

    const [reportType, setReportType] = useState("z-report");
    const [range, setRange] = useState("today"); // today, yesterday, week, month, custom
    // Custom Date State
    const [customStart, setCustomStart] = useState(() => new Date().toISOString().split("T")[0]);
    const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().split("T")[0]);

    const [dashboardStats, setDashboardStats] = useState<any>(null);
    const [reportLoading, setReportLoading] = useState(false);
    const [reportError, setReportError] = useState("");

    // Modal State
    const [emailDialogOpen, setEmailDialogOpen] = useState(false);
    const [emailInput, setEmailInput] = useState("");
    const [feedback, setFeedback] = useState<{ open: boolean, title: string, message: string, type: 'success' | 'error' | 'info' }>({
        open: false, title: "", message: "", type: 'info'
    });

    // Load Dashboard Stats
    async function loadDashboard() {
        setReportLoading(true);
        setReportError("");
        try {
            const { start, end } = getDateRange(range);
            const res = await fetch(`/api/terminal/reports?type=${reportType}&start=${start}&end=${end}&format=json`, {
                headers: {
                    "x-wallet": merchantWallet,
                    "x-linked-wallet": account?.address || ""
                }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load report");
            setDashboardStats(data);
        } catch (e: any) {
            setReportError(e.message);
        } finally {
            setReportLoading(false);
        }
    }

    // Utility: Date Ranges
    function getDateRange(r: string) {
        const now = new Date();
        let start = new Date();
        let end = new Date(); // now

        if (r === "custom") {
            // Parse custom inputs (YYYY-MM-DD) in local time
            // We want start to be 00:00:00 and end to be 23:59:59 of selected days
            const s = new Date(customStart);
            s.setHours(0, 0, 0, 0); // Local midnight
            // Fix timezone offset issue: Date(string) creates UTC usually if simplified format, 
            // but for date inputs we treat value as local date components.
            // Actually new Date("YYYY-MM-DD") is treated as UTC.
            // Better to split and construct:
            const [sY, sM, sD] = customStart.split("-").map(Number);
            start = new Date(sY, sM - 1, sD, 0, 0, 0, 0);

            const [eY, eM, eD] = customEnd.split("-").map(Number);
            end = new Date(eY, eM - 1, eD, 23, 59, 59, 999);

        } else if (r === "today") {
            start.setHours(0, 0, 0, 0);
        } else if (r === "yesterday") {
            start.setDate(now.getDate() - 1);
            start.setHours(0, 0, 0, 0);
            end.setDate(now.getDate() - 1);
            end.setHours(23, 59, 59, 999);
        } else if (r === "week") {
            start.setDate(now.getDate() - 7);
        } else if (r === "month") {
            start.setMonth(now.getMonth() - 1);
        }

        return {
            start: Math.floor(start.getTime() / 1000),
            end: Math.floor(end.getTime() / 1000)
        };
    }

    // Reload when range/type changes
    useEffect(() => {
        if (merchantWallet) {
            // Debounce custom date reloads slightly or wait for user action? 
            // For now instant reload is fine unless custom dates are invalid.
            if (range === "custom" && (!customStart || !customEnd)) return;
            loadDashboard();
        }
    }, [range, reportType, merchantWallet, customStart, customEnd]);

    // 4. Download Handler (Renamed to bust cache)
    async function downloadReportAction(format: "zip" | "pdf" = "zip") {
        const linkedWallet = account?.address;

        // Allow download if wallet is connected OR if we are in a session context (simulated here by just checking prop)
        // But for safety, we try to grab linked wallet. If missing, we alert but might proceed if strict mode off.
        if (!linkedWallet) {
            setReportError("Wallet connection recommended for verify.");
            // We can continue if we rely on session cookie, but for now strict:
        }

        setReportLoading(true);
        try {
            const { start, end } = getDateRange(range);
            // Append auth params and timestamp to force uniqueness
            const url = `/api/terminal/reports?type=${reportType}&start=${start}&end=${end}&format=${format}&wallet=${merchantWallet}&linkedWallet=${linkedWallet || ""}&t=${Date.now()}`;

            // BLOCKING DEBUG - User must see this!
            // alert(`Generating URL: \n${url}`);
            console.log("Downloading Report from:", url);

            // We need to fetch with headers, so we can't just open the window.location
            // Using fetch-blob-download pattern
            const res = await fetch(url, {
                headers: {
                    "x-wallet": merchantWallet,
                    "x-linked-wallet": linkedWallet || ""
                }
            });
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(`Download failed: ${res.status} ${txt}`);
            }

            const blob = await res.blob();
            const dUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = dUrl;
            a.download = `${reportType}-${range}-${new Date().toISOString().split('T')[0]}.${format}`;
            document.body.appendChild(a);
            a.click();
            a.remove();

        } catch (e: any) {
            // alert(`Error: ${e.message}`);
            setReportError(e.message);
        } finally {
            setReportLoading(false);
        }
    }

    // 5. Email Handler
    async function handleEmailReport() {
        if (!emailInput) {
            setFeedback({ open: true, title: "Missing Email", message: "Please enter an email address.", type: 'error' });
            return;
        }

        setEmailDialogOpen(false);
        setReportLoading(true);
        try {
            const { start, end } = getDateRange(range);
            // Map internal report types to PDF titles
            const titleMap: Record<string, string> = {
                "z-report": "End of Day",
                "x-report": "Sales Snapshot",
                "employee": "Staff Performance",
                "hourly": "Hourly Sales"
            };
            const rType = titleMap[reportType] || "Report";

            const res = await fetch(`/api/terminal/reports/email`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-wallet": merchantWallet
                },
                body: JSON.stringify({
                    email: emailInput,
                    reportType: rType,
                    startTs: start,
                    endTs: end
                })
            });
            const j = await res.json();
            if (j.success) {
                setFeedback({ open: true, title: "Report Sent", message: "The report has been successfully queued for delivery.", type: 'success' });
            } else {
                throw new Error(j.error || "Failed to send");
            }
        } catch (e: any) {
            setFeedback({ open: true, title: "Delivery Failed", message: e.message, type: 'error' });
        } finally {
            setReportLoading(false);
        }
    }


    // 6. Print Receipt Handler
    function printReceiptAction() {
        if (!dashboardStats) return;

        const w = window.open("", "_blank", "width=400,height=600");
        if (!w) return;

        const dateStr = new Date().toLocaleString();
        const startStr = new Date(Math.floor(dashboardStats.meta.range.start * 1000)).toLocaleDateString();
        const typeTitle = reportType.replace("-", " ").toUpperCase();

        const html = `
            <html>
            <head>
                <title>Receipt</title>
                <style>
                    body { font-family: 'Courier New', monospace; width: 300px; font-size: 12px; margin: 0; padding: 10px; color: #000; }
                    .header { text-align: center; margin-bottom: 20px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
                    .title { font-size: 16px; font-weight: bold; margin-bottom: 5px; }
                    .meta { font-size: 10px; color: #555; }
                    .section { margin-bottom: 15px; border-bottom: 1px dashed #ccc; padding-bottom: 10px; }
                    .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
                    .row.bold { font-weight: bold; }
                    .col-right { text-align: right; }
                    .footer { text-align: center; margin-top: 20px; font-size: 10px; color: #555; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="title">${theme?.brandName || "Merchant Terminal"}</div>
                    <div class="meta">${typeTitle}</div>
                    <div class="meta">${startStr}</div>
                </div>

                <div class="section">
                    <div class="row bold">
                        <span>TOTAL SALES</span>
                        <span>${formatCurrency(dashboardStats.summary.totalSales, "USD")}</span>
                    </div>
                    <div class="row">
                        <span>Transactions</span>
                        <span>${dashboardStats.summary.transactionCount}</span>
                    </div>
                    <div class="row">
                        <span>Average Order</span>
                        <span>${formatCurrency(dashboardStats.summary.averageOrderValue, "USD")}</span>
                    </div>
                    <div class="row">
                        <span>Tips Collected</span>
                        <span>${formatCurrency(dashboardStats.summary.totalTips, "USD")}</span>
                    </div>
                </div>

                ${dashboardStats.paymentMethods ? `
                <div class="section">
                    <div class="row bold" style="margin-bottom:8px">PAYMENTS</div>
                    ${dashboardStats.paymentMethods.map((pm: any) => `
                        <div class="row">
                            <span>${pm.method}</span>
                            <span>${formatCurrency(pm.total, "USD")}</span>
                        </div>
                    `).join("")}
                </div>` : ""}

                ${dashboardStats.employees ? `
                <div class="section">
                    <div class="row bold" style="margin-bottom:8px">STAFF</div>
                    ${dashboardStats.employees.map((e: any) => `
                        <div class="row">
                            <span>${e.id}</span>
                            <span>${formatCurrency(e.sales, "USD")}</span>
                        </div>
                    `).join("")}
                </div>` : ""}

                 ${dashboardStats.hourly ? `
                <div class="section">
                    <div class="row bold" style="margin-bottom:8px">HOURLY</div>
                    ${dashboardStats.hourly.filter((h: any) => h.amount > 0).map((h: any) => `
                        <div class="row">
                            <span>${h.hour}:00</span>
                            <span>${formatCurrency(h.amount, "USD")}</span>
                        </div>
                    `).join("")}
                </div>` : ""}

                <div class="footer">
                    Generated: ${dateStr}<br/>
                    ID: ${Math.random().toString(36).substr(2, 6).toUpperCase()}
                </div>

                <script>
                    window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 500); }
                </script>
            </body>
            </html>
        `;

        w.document.write(html);
        w.document.close();
    }


    // --- RENDERING ---

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    {/* Simplified Header since Dashboard has main header */}
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm text-muted-foreground font-medium">Merchant Report</span>
                    </div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        Reporting Dashboard
                        {reportLoading && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
                    </h2>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={printReceiptAction}
                        disabled={reportLoading || !dashboardStats}
                        className="h-8 flex items-center gap-2 px-3 bg-card border hover:bg-muted text-foreground rounded-lg disabled:opacity-50 text-[10px] font-bold uppercase tracking-wider shadow-sm transition-all"
                    >
                        <Printer className="w-3.5 h-3.5" /> Print
                    </button>
                    <button
                        onClick={() => setEmailDialogOpen(true)}
                        disabled={reportLoading}
                        className="h-8 flex items-center gap-2 px-3 bg-secondary text-secondary-foreground rounded-lg hover:brightness-95 disabled:opacity-50 text-[10px] font-bold uppercase tracking-wider border border-secondary"
                    >
                        <FileText className="w-3.5 h-3.5" /> Email
                    </button>
                    <button
                        onClick={() => downloadReportAction("pdf")}
                        disabled={reportLoading}
                        className="h-8 flex items-center gap-2 px-3 bg-primary text-primary-foreground rounded-lg hover:brightness-110 disabled:opacity-50 shadow-sm transition-all text-[10px] font-bold uppercase tracking-wider"
                    >
                        <FileText className="w-3.5 h-3.5" /> PDF
                    </button>
                    <button
                        onClick={() => downloadReportAction("zip")}
                        disabled={reportLoading}
                        className="h-8 flex items-center gap-2 px-3 bg-primary text-primary-foreground rounded-lg hover:brightness-110 disabled:opacity-50 text-[10px] font-bold uppercase tracking-wider shadow-sm opacity-80"
                    >
                        <Download className="w-3.5 h-3.5" /> ZIP
                    </button>
                </div>
            </div>

            {/* Email Modal */}
            <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Email Report</DialogTitle>
                        <DialogDescription>
                            Send the {reportType.replace("-", " ")} ({range}) to recipient(s).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        <Input
                            placeholder="Enter email addresses (comma separated)"
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <button onClick={() => setEmailDialogOpen(false)} className="px-4 py-2 text-sm rounded hover:bg-muted">Cancel</button>
                        <button onClick={handleEmailReport} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded hover:brightness-110">Send Report</button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Feedback Modal */}
            <Dialog open={feedback.open} onOpenChange={(open) => setFeedback(prev => ({ ...prev, open }))}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className={feedback.type === 'error' ? "text-red-500" : "text-green-500"}>
                            {feedback.title}
                        </DialogTitle>
                        <DialogDescription>
                            {feedback.message}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <button onClick={() => setFeedback(prev => ({ ...prev, open: false }))} className="px-4 py-2 bg-primary text-primary-foreground rounded">
                            OK
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-xl bg-card">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Report Type</span>
                    </div>
                    <select
                        value={reportType}
                        onChange={e => setReportType(e.target.value)}
                        className="w-full text-sm font-medium bg-background border rounded-lg px-3 py-2.5 hover:border-primary/50 transition-colors focus:ring-1 focus:ring-primary shadow-sm cursor-pointer relative z-20"
                    >
                        <option value="z-report">Z-Report (End of Day)</option>
                        <option value="x-report">X-Report (Snapshot)</option>
                        <option value="employee">Employee Performance</option>
                        <option value="hourly">Hourly Sales</option>
                    </select>
                </div>
                <div className="md:col-span-2">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Date Range</span>
                    </div>
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex bg-muted/20 p-1 rounded-lg border flex-1">
                            {["today", "yesterday", "week", "month", "custom"].map(r => (
                                <button
                                    key={r}
                                    onClick={() => setRange(r)}
                                    className={`flex-1 text-[11px] uppercase font-bold tracking-wide py-2 rounded-md transition-all ${range === r
                                        ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>

                        {range === "custom" && (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                                <input
                                    type="date"
                                    value={customStart}
                                    onChange={e => setCustomStart(e.target.value)}
                                    className="h-[38px] px-3 rounded-lg border bg-background text-xs font-medium focus:ring-1 focus:ring-primary"
                                />
                                <span className="text-muted-foreground text-xs">to</span>
                                <input
                                    type="date"
                                    value={customEnd}
                                    onChange={e => setCustomEnd(e.target.value)}
                                    className="h-[38px] px-3 rounded-lg border bg-background text-xs font-medium focus:ring-1 focus:ring-primary"
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Error */}
            {reportError && <div className="p-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl">{reportError}</div>}

            {/* Visualization */}
            {dashboardStats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {/* Summary Cards */}
                    <div className="md:col-span-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard
                            label="Total Sales"
                            value={formatCurrency(dashboardStats.summary?.totalSales || 0, "USD")}
                            sub="Gross Revenue"
                        />
                        <StatCard
                            label="Tips"
                            value={formatCurrency(dashboardStats.summary?.totalTips || 0, "USD")}
                            sub="Gruntuity"
                        />
                        <StatCard
                            label="Transactions"
                            value={dashboardStats.summary?.transactionCount || 0}
                            sub="Total Orders"
                        />
                        <StatCard
                            label="Average Order"
                            value={formatCurrency(dashboardStats.summary?.averageOrderValue || 0, "USD")}
                            sub="Per Transaction"
                        />
                    </div>

                    {/* Report Specific View */}
                    <div className="md:col-span-4 border rounded-xl p-6 bg-card min-h-[300px]">
                        <h3 className="text-lg font-bold mb-4 capitalize">{reportType.replace("-", " ")} Details</h3>

                        {/* Dynamic Content based on Type */}
                        {reportType === "employee" && dashboardStats.employees && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs uppercase text-muted-foreground border-b">
                                        <tr>
                                            <th className="py-3">Staff ID</th>
                                            <th className="py-3 text-right">Sales</th>
                                            <th className="py-3 text-right">Tips</th>
                                            <th className="py-3 text-right">Orders</th>
                                            <th className="py-3 text-right">Avg Ticket</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {dashboardStats.employees.map((e: any) => (
                                            <tr key={e.id}>
                                                <td className="py-3 font-medium">{e.id}</td>
                                                <td className="py-3 text-right">{formatCurrency(e.sales, "USD")}</td>
                                                <td className="py-3 text-right">{formatCurrency(e.tips, "USD")}</td>
                                                <td className="py-3 text-right">{e.count}</td>
                                                <td className="py-3 text-right">{formatCurrency(e.aov, "USD")}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {(reportType === "z-report" || reportType === "x-report") && dashboardStats.paymentMethods && (
                            <div>
                                <h4 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Payment Breakdown</h4>
                                <div className="space-y-2">
                                    {dashboardStats.paymentMethods.map((m: any) => (
                                        <div key={m.method} className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                                            <span className="font-medium">{m.method}</span>
                                            <span className="font-mono">{formatCurrency(m.total, "USD")}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {reportType === "hourly" && (
                            <div className="h-64 flex items-end gap-1 pt-4 pb-0 px-2 overflow-x-auto">
                                {dashboardStats.hourly?.map((h: any) => (
                                    <div key={h.hour} className="flex-1 flex flex-col justify-end items-center group min-w-[20px]">
                                        <div
                                            className="w-full bg-primary/80 rounded-t-sm hover:bg-primary transition-all relative"
                                            style={{ height: `${Math.max(4, (h.amount / (Math.max(...dashboardStats.hourly.map((x: any) => x.amount) || 1)) * 100))}%` }}
                                        >
                                            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10">
                                                {formatCurrency(h.amount, "USD")}
                                            </div>
                                        </div>
                                        <div className="text-[10px] text-muted-foreground mt-1">{h.hour}:00</div>
                                    </div>
                                ))}
                            </div>
                        )}

                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ label, value, sub }: { label: string, value: string | number, sub: string }) {
    return (
        <div className="p-4 rounded-xl border bg-card hover:bg-muted/10 transition-colors">
            <div className="text-xs text-muted-foreground uppercase font-semibold">{label}</div>
            <div className="text-2xl font-bold my-1">{value}</div>
            <div className="text-xs text-muted-foreground">{sub}</div>
        </div>
    );
}
