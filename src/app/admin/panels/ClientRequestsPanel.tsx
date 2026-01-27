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

            <div className="overflow-auto rounded-md border">
                <table className="min-w-full text-sm">
                    <thead>
                        <tr className="bg-foreground/5">
                            <th className="text-left px-3 py-2 font-medium">Business</th>
                            <th className="text-left px-3 py-2 font-medium">Wallet</th>
                            <th className="text-left px-3 py-2 font-medium">Notes</th>
                            <th className="text-left px-3 py-2 font-medium">Status</th>
                            <th className="text-left px-3 py-2 font-medium">Submitted</th>
                            <th className="text-left px-3 py-2 font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(items || []).map((req) => {
                            const submitted = new Date(Number(req.createdAt || 0)).toLocaleString();
                            const badgeClass =
                                req.status === "approved" ? "bg-green-100 text-green-700 border-green-200" :
                                    req.status === "rejected" ? "bg-red-100 text-red-700 border-red-200" :
                                        "bg-yellow-100 text-yellow-700 border-yellow-200";

                            return (
                                <tr key={req.id} className="border-t">
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            {req.logoUrl && <img src={req.logoUrl} className="w-6 h-6 rounded object-contain bg-black/10" />}
                                            <span className="font-semibold">{req.shopName}</span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 font-mono text-xs">{req.wallet}</td>
                                    <td className="px-3 py-2 max-w-xs truncate" title={req.notes}>{req.notes || "—"}</td>
                                    <td className="px-3 py-2">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${badgeClass}`}>
                                            {req.status}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-muted-foreground">{submitted}</td>
                                    <td className="px-3 py-2">
                                        {req.status === "pending" && (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    className="px-2 py-1 rounded-md bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500/20 text-xs font-semibold"
                                                    onClick={() => updateStatus(req.id, "approved")}
                                                >
                                                    Approve
                                                </button>
                                                <button
                                                    className="px-2 py-1 rounded-md bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 text-xs font-semibold"
                                                    onClick={() => updateStatus(req.id, "rejected")}
                                                >
                                                    Reject
                                                </button>
                                            </div>
                                        )}
                                        {req.status !== "pending" && (
                                            <span className="text-xs text-muted-foreground">
                                                Reviewed {req.reviewedAt ? new Date(req.reviewedAt).toLocaleDateString() : ""}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {items.length === 0 && (
                            <tr>
                                <td className="px-3 py-6 text-center text-muted-foreground" colSpan={6}>
                                    No requests found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
