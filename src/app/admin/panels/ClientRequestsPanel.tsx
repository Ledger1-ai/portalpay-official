"use client";

import React, { useEffect, useState } from "react";
import { useActiveAccount } from "thirdweb/react";

type ClientRequest = {
    id: string;
    wallet: string;
    type: "client_request";
    brandKey: string;
    status: "pending" | "approved" | "rejected";
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
};

export default function ClientRequestsPanel() {
    const account = useActiveAccount();
    const [items, setItems] = useState<ClientRequest[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [info, setInfo] = useState("");
    const [brandKey, setBrandKey] = useState("");
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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

    async function updateStatus(id: string, status: "approved" | "rejected") {
        try {
            setError("");
            setInfo("");
            const r = await fetch("/api/partner/client-requests", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "x-wallet": account?.address || "",
                },
                body: JSON.stringify({ requestId: id, status }),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j?.error) {
                setError(j?.error || "Update failed");
                return;
            }
            setInfo(`Request ${status}.`);
            await load();
        } catch (e: any) {
            setError(e?.message || "Action failed");
        }
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
                                            {req.status === "pending" && (
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        className="px-3 py-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-500 border border-green-500/20 text-xs font-semibold transition-colors"
                                                        onClick={() => updateStatus(req.id, "approved")}
                                                    >
                                                        Approve
                                                    </button>
                                                    <button
                                                        className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 text-xs font-semibold transition-colors"
                                                        onClick={() => updateStatus(req.id, "rejected")}
                                                    >
                                                        Reject
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                    {isExpanded && (
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
                                    )}
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
        </div>
    );
}
