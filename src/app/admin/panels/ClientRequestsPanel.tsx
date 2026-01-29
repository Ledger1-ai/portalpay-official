"use client";

import React, { useEffect, useState } from "react";
import { useActiveAccount } from "thirdweb/react";

type ClientRequest = {
    id: string;
    wallet: string;
    type: "client_request";
    brandKey: string;
    status: "pending" | "approved" | "rejected" | "blocked";
    shopName: string;
    legalBusinessName?: string;
    businessType?: string;
    ein?: string;
    website?: string;
    phone?: string;
    businessAddress?: {
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
    };
    logoUrl?: string;
    notes?: string;
    reviewedBy?: string;
    reviewedAt?: number;
    createdAt: number;
    splitConfig?: {
        partnerBps: number;
        merchantBps: number;
    };
};

export default function ClientRequestsPanel() {
    const account = useActiveAccount();
    const [items, setItems] = useState<ClientRequest[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [info, setInfo] = useState("");
    const [brandKey, setBrandKey] = useState("");
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    // Split Config State
    const [approvingId, setApprovingId] = useState<string | null>(null);
    const [platformBps] = useState(25); // Locked platform fee (0.25%)
    const [partnerBps, setPartnerBps] = useState(50); // Default partner fee (0.5%)

    // Derived merchant bps
    const merchantBps = 10000 - platformBps - partnerBps;

    async function load() {
        try {
            setLoading(true);
            setError("");
            setInfo("");
            const r = await fetch("/api/partner/client-requests", {
                cache: "no-store",
                credentials: "include",
            });
            const j = await r.json().catch(() => ({}));
            if (j.error) {
                setError(j.error);
                return;
            }
            const arr = Array.isArray(j?.requests) ? j.requests : [];
            setBrandKey(j?.brandKey || "");
            // Sort newest first
            arr.sort((a: any, b: any) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));
            setItems(arr);
        } catch (e: any) {
            setError(e?.message || "Failed to load requests");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, [account?.address]);

    async function updateStatus(id: string, status: "pending" | "approved" | "rejected" | "blocked", splitConfig?: { partnerBps: number, merchantBps: number }) {
        try {
            setError("");
            setInfo("");
            const body: any = { requestId: id, status };
            if (splitConfig) {
                body.splitConfig = splitConfig;
            }

            const r = await fetch("/api/partner/client-requests", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "x-wallet": account?.address || "",
                },
                body: JSON.stringify(body),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j?.error) {
                setError(j?.error || "Update failed");
                return;
            }
            setInfo(`Request ${status}.`);
            await load();
            setApprovingId(null); // Close modal if open
        } catch (e: any) {
            setError(e?.message || "Action failed");
        }
    }

    const openApprovalModal = (id: string, existingSplit?: { partnerBps: number }) => {
        setApprovingId(id);
        if (existingSplit) {
            setPartnerBps(existingSplit.partnerBps);
        } else {
            setPartnerBps(50); // Reset to default
        }
    };

    const confirmApproval = () => {
        if (!approvingId) return;
        updateStatus(approvingId, "approved", { partnerBps, merchantBps });
    };

    async function deleteRequest(id: string) {
        if (!confirm("Delete this request? The user will be able to apply again.")) return;
        try {
            setError("");
            setInfo("");
            const r = await fetch("/api/partner/client-requests", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    "x-wallet": account?.address || "",
                },
                body: JSON.stringify({ requestId: id }),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j?.error) {
                setError(j?.error || "Delete failed");
                return;
            }
            setInfo("Request deleted. User can apply again.");
            await load();
        } catch (e: any) {
            setError(e?.message || "Delete failed");
        }
    }

    async function blockUser(id: string) {
        if (!confirm("Block this applicant? They will not be able to apply again until unblocked.")) return;
        await updateStatus(id, "blocked");
    }

    const toggleExpand = (id: string) => {
        const next = new Set(expandedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedIds(next);
    };

    return (
        <div className="glass-pane rounded-xl border p-6 space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold">Client Requests</h2>
                    <p className="microtext text-muted-foreground mt-1">
                        Manage access requests for <span className="font-mono text-emerald-400">{brandKey}</span>.
                    </p>
                </div>
                <button className="px-3 py-1.5 rounded-md border text-sm" onClick={load} disabled={loading}>
                    {loading ? "Refreshing…" : "Refresh"}
                </button>
            </div>

            {error && <div className="microtext text-red-500">{error}</div>}
            {info && <div className="microtext text-green-600">{info}</div>}

            <div className="overflow-auto rounded-md border bg-black/20">
                <table className="min-w-full text-sm">
                    <thead>
                        <tr className="bg-foreground/5 text-xs uppercase tracking-wider text-muted-foreground border-b border-foreground/10">
                            <th className="text-left px-4 py-3 font-medium">Business</th>
                            <th className="text-left px-4 py-3 font-medium">KYB Info</th>
                            <th className="text-left px-4 py-3 font-medium">Status</th>
                            <th className="text-left px-4 py-3 font-medium">Date</th>
                            <th className="text-right px-4 py-3 font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-foreground/5">
                        {(items || []).map((req) => {
                            const submitted = new Date(Number(req.createdAt || 0)).toLocaleString();
                            const badgeClass =
                                req.status === "approved" ? "bg-green-500/10 text-green-500 border-green-500/20" :
                                    req.status === "rejected" ? "bg-red-500/10 text-red-500 border-red-500/20" :
                                        req.status === "blocked" ? "bg-purple-500/10 text-purple-500 border-purple-500/20" :
                                            "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
                            const isExpanded = expandedIds.has(req.id);

                            return (
                                <React.Fragment key={req.id}>
                                    <tr className={`hover:bg-foreground/5 transition-colors ${isExpanded ? "bg-foreground/5" : ""}`}>
                                        <td className="px-4 py-3 align-top">
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                                                    {req.logoUrl ? (
                                                        <img src={req.logoUrl} className="w-full h-full object-contain" />
                                                    ) : (
                                                        <span className="text-lg">🏢</span>
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-white">{req.shopName}</div>
                                                    <div className="text-xs text-muted-foreground font-mono">{req.wallet.slice(0, 6)}...{req.wallet.slice(-4)}</div>
                                                    <button
                                                        onClick={() => toggleExpand(req.id)}
                                                        className="mt-1 text-xs text-emerald-400 hover:underline flex items-center gap-1"
                                                    >
                                                        {isExpanded ? "Hide Details" : "View Details"}
                                                        <svg className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <div className="space-y-1">
                                                <div className="text-xs">
                                                    <span className="text-muted-foreground">Legal Name: </span>
                                                    <span className="text-white">{req.legalBusinessName || "—"}</span>
                                                </div>
                                                <div className="text-xs">
                                                    <span className="text-muted-foreground">Type: </span>
                                                    <span className="uppercase text-xs font-mono bg-white/5 px-1.5 py-0.5 rounded">{req.businessType || "?"}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border uppercase tracking-wide ${badgeClass}`}>
                                                {req.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 align-top text-xs text-muted-foreground whitespace-nowrap">
                                            {submitted}
                                        </td>
                                        <td className="px-4 py-3 align-top text-right">
                                            <div className="flex items-center justify-end gap-2 flex-wrap">
                                                {req.status === "pending" && (
                                                    <>
                                                        <button
                                                            className="px-3 py-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-500 border border-green-500/20 text-xs font-semibold transition-colors"
                                                            onClick={() => openApprovalModal(req.id)}
                                                        >
                                                            Approve
                                                        </button>
                                                        <button
                                                            className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 text-xs font-semibold transition-colors"
                                                            onClick={() => updateStatus(req.id, "rejected")}
                                                        >
                                                            Reject
                                                        </button>
                                                    </>
                                                )}
                                                {req.status === "approved" && (
                                                    <button
                                                        className="px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 text-xs font-semibold transition-colors flex items-center gap-1"
                                                        onClick={() => openApprovalModal(req.id, req.splitConfig)}
                                                        title="Update Revenue Split"
                                                    >
                                                        <span>{req.splitConfig ? `${(req.splitConfig.partnerBps / 100).toFixed(2)}% Split` : "Set Split"}</span>
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        </svg>
                                                    </button>
                                                )}
                                                {req.status === "blocked" && (
                                                    <button
                                                        className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-semibold transition-colors"
                                                        onClick={() => updateStatus(req.id, "pending")}
                                                        title="Unblock this user"
                                                    >
                                                        Unblock
                                                    </button>
                                                )}

                                                {req.status !== "blocked" && (
                                                    <button
                                                        className="px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 text-xs font-semibold transition-colors"
                                                        onClick={() => blockUser(req.id)}
                                                        title="Block this user from applying again"
                                                    >
                                                        Block
                                                    </button>
                                                )}
                                                <button
                                                    className="px-3 py-1.5 rounded-lg bg-gray-500/10 hover:bg-gray-500/20 text-gray-400 border border-gray-500/20 text-xs font-semibold transition-colors"
                                                    onClick={() => deleteRequest(req.id)}
                                                    title="Delete request (allows re-application)"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    {
                                        isExpanded && (
                                            <tr className="bg-foreground/[0.02]">
                                                <td colSpan={5} className="px-4 py-4 border-t border-foreground/5">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                        <div className="space-y-3">
                                                            <h4 className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-2">Business Details</h4>
                                                            <div className="space-y-2">
                                                                <div className="grid grid-cols-[80px_1fr] gap-2 text-sm">
                                                                    <span className="text-muted-foreground">Legal Name</span>
                                                                    <span className="select-all">{req.legalBusinessName || "—"}</span>
                                                                </div>
                                                                <div className="grid grid-cols-[80px_1fr] gap-2 text-sm">
                                                                    <span className="text-muted-foreground">DBA Name</span>
                                                                    <span className="select-all">{req.shopName}</span>
                                                                </div>
                                                                <div className="grid grid-cols-[80px_1fr] gap-2 text-sm">
                                                                    <span className="text-muted-foreground">Type</span>
                                                                    <span className="uppercase">{req.businessType || "—"}</span>
                                                                </div>
                                                                <div className="grid grid-cols-[80px_1fr] gap-2 text-sm">
                                                                    <span className="text-muted-foreground">EIN/Tax ID (Last 4)</span>
                                                                    <span className="font-mono text-emerald-400 select-all">{req.ein || "—"}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-3">
                                                            <h4 className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-2">Contact & Location</h4>
                                                            <div className="space-y-2">
                                                                <div className="grid grid-cols-[80px_1fr] gap-2 text-sm">
                                                                    <span className="text-muted-foreground">Address</span>
                                                                    <span>
                                                                        {req.businessAddress ? (
                                                                            <>
                                                                                {req.businessAddress.street}<br />
                                                                                {req.businessAddress.city}, {req.businessAddress.state} {req.businessAddress.zip}<br />
                                                                                {req.businessAddress.country}
                                                                            </>
                                                                        ) : "—"}
                                                                    </span>
                                                                </div>
                                                                <div className="grid grid-cols-[80px_1fr] gap-2 text-sm">
                                                                    <span className="text-muted-foreground">Website</span>
                                                                    {req.website ? (
                                                                        <a href={req.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate">
                                                                            {req.website}
                                                                        </a>
                                                                    ) : "—"}
                                                                </div>
                                                                <div className="grid grid-cols-[80px_1fr] gap-2 text-sm">
                                                                    <span className="text-muted-foreground">Phone</span>
                                                                    <a href={`tel:${req.phone}`} className="hover:text-white transition-colors">{req.phone || "—"}</a>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-3">
                                                            <h4 className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-2">Metadata</h4>
                                                            <div className="space-y-2">
                                                                <div className="grid grid-cols-[80px_1fr] gap-2 text-sm">
                                                                    <span className="text-muted-foreground">Wallet</span>
                                                                    <div className="font-mono text-xs break-all select-all opacity-80">{req.wallet}</div>
                                                                </div>
                                                                <div className="grid grid-cols-[80px_1fr] gap-2 text-sm">
                                                                    <span className="text-muted-foreground">Notes</span>
                                                                    <div className="text-xs italic bg-black/20 p-2 rounded border border-white/5 max-h-[80px] overflow-y-auto">
                                                                        {req.notes || "No notes provided."}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    }
                                </React.Fragment>
                            );
                        })}
                        {items.length === 0 && (
                            <tr>
                                <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <span className="text-2xl">📭</span>
                                        <span>No client requests found.</span>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {/* Split Config Modal */}
            {
                approvingId && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                            <div className="p-6 border-b border-white/5">
                                <h3 className="text-lg font-semibold text-white">Approve & Configure Splits</h3>
                                <p className="text-xs text-zinc-400 mt-1">Configure revenue sharing for this merchant.</p>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Platform Fee (Locked) */}
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs uppercase tracking-wider font-mono text-zinc-500">
                                        <span>Platform Fee</span>
                                        <span>Locked</span>
                                    </div>
                                    <div className="p-3 rounded-lg bg-black/20 border border-white/5 flex justify-between items-center opacity-70">
                                        <span className="text-zinc-400 text-sm">PortalPay Platform</span>
                                        <span className="font-mono text-emerald-500">{(platformBps / 100).toFixed(2)}%</span>
                                    </div>
                                </div>

                                {/* Partner Fee (Slider) */}
                                <div className="space-y-3">
                                    <div className="flex justify-between text-xs uppercase tracking-wider font-mono text-zinc-500">
                                        <span>Partner Fee</span>
                                        <span>adjustable</span>
                                    </div>
                                    <div className="p-4 rounded-lg bg-zinc-800/50 border border-white/10 space-y-4">
                                        <div className="flex justify-between items-center">
                                            <span className="text-white text-sm font-medium">Your Revenue</span>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    value={partnerBps}
                                                    onChange={(e) => setPartnerBps(Math.min(9900, Math.max(0, parseInt(e.target.value) || 0)))}
                                                    className="w-16 bg-black/40 border border-white/10 rounded px-2 py-1 text-right font-mono text-sm text-white focus:border-emerald-500 outline-none"
                                                />
                                                <span className="text-zinc-500 text-xs">bps</span>
                                            </div>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1000" // Max 10% for partner usually? Or allow up to 99%? Let's cap slider at 20% (2000bps) for UX, but input allows more.
                                            step="5"
                                            value={partnerBps}
                                            onChange={(e) => setPartnerBps(parseInt(e.target.value))}
                                            className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                        />
                                        <div className="text-right text-xs text-emerald-400 font-mono">
                                            {(partnerBps / 100).toFixed(2)}%
                                        </div>
                                    </div>
                                </div>

                                {/* Merchant Split (Remainder) */}
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs uppercase tracking-wider font-mono text-zinc-500">
                                        <span>Merchant Receives</span>
                                        <span>Remainder</span>
                                    </div>
                                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex justify-between items-center">
                                        <span className="text-emerald-100 text-sm font-medium">Merchant Net</span>
                                        <span className="font-mono text-emerald-400 font-bold text-lg">{(merchantBps / 100).toFixed(2)}%</span>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-black/20 border-t border-white/5 flex gap-3 justify-end">
                                <button
                                    onClick={() => setApprovingId(null)}
                                    className="px-4 py-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white text-sm transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmApproval}
                                    className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm shadow-lg shadow-emerald-500/10 transition-colors"
                                >
                                    Confirm Approval
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
