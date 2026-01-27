"use client";

import React, { useState, useEffect, useCallback } from "react";
import { CheckCircle, XCircle, Clock, RefreshCw, User, Settings, ShieldCheck } from "lucide-react";
import TruncatedAddress from "@/components/truncated-address";
import { useActiveAccount } from "thirdweb/react";
import { ensureSplitForWallet } from "@/lib/thirdweb/split";

interface ClientRequest {
    id: string;
    wallet: string;
    brandKey: string;
    status: "pending" | "approved" | "rejected";
    shopName: string;
    logoUrl?: string;
    faviconUrl?: string;
    primaryColor?: string;
    notes?: string;
    reviewedBy?: string;
    reviewedAt?: number;
    createdAt: number;
}

export default function ClientRequestsPanel() {
    const account = useActiveAccount();
    const [requests, setRequests] = useState<ClientRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Split Config Modal State
    const [configReq, setConfigReq] = useState<ClientRequest | null>(null);

    const fetchRequests = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const statusParam = filter === "all" ? "" : `?status=${filter}`;
            const res = await fetch(`/api/partner/client-requests${statusParam}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.error || "Failed to fetch requests");
            }

            setRequests(data.requests || []);
        } catch (e: any) {
            setError(e?.message || "Failed to load requests");
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    async function handleAction(requestId: string, action: "approved" | "rejected") {
        setProcessingId(requestId);
        try {
            const res = await fetch("/api/partner/client-requests", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ requestId, status: action })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.message || data?.error || "Action failed");
            }

            // Refresh list
            await fetchRequests();
        } catch (e: any) {
            alert(`Error: ${e?.message || "Failed to process request"}`);
        } finally {
            setProcessingId(null);
        }
    }

    function formatDate(ts?: number) {
        if (!ts) return "—";
        return new Date(ts).toLocaleDateString() + " " + new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    const statusBadge = (status: string) => {
        switch (status) {
            case "pending":
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400"><Clock className="w-3 h-3" /> Pending</span>;
            case "approved":
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400"><CheckCircle className="w-3 h-3" /> Approved</span>;
            case "rejected":
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400"><XCircle className="w-3 h-3" /> Rejected</span>;
            default:
                return <span className="text-gray-500 text-xs">{status}</span>;
        }
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <User className="h-5 w-5 text-blue-500" />
                    <div>
                        <h3 className="text-sm font-semibold">Client Requests</h3>
                        <p className="text-xs text-muted-foreground">
                            Review and approve access requests from merchants
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Filter */}
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value as any)}
                        className="h-8 px-3 rounded-md border bg-background text-xs"
                    >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="all">All</option>
                    </select>
                    <button
                        onClick={fetchRequests}
                        disabled={loading}
                        className="h-8 px-3 rounded-md border text-xs flex items-center gap-2 hover:bg-foreground/5 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-400 text-sm">
                    {error}
                </div>
            )}

            {/* Requests List */}
            {loading ? (
                <div className="p-8 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
                </div>
            ) : requests.length === 0 ? (
                <div className="p-8 text-center border rounded-lg bg-foreground/5">
                    <User className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">No {filter === "all" ? "" : filter} requests found</p>
                </div>
            ) : (
                <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-foreground/5 border-b">
                            <tr className="text-xs text-muted-foreground">
                                <th className="text-left p-3 font-medium">Merchant</th>
                                <th className="text-left p-3 font-medium">Shop Name</th>
                                <th className="text-left p-3 font-medium">Preview</th>
                                <th className="text-left p-3 font-medium">Status</th>
                                <th className="text-left p-3 font-medium">Submitted</th>
                                <th className="text-center p-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {requests.map((req) => (
                                <tr key={req.id} className="hover:bg-foreground/5">
                                    <td className="p-3">
                                        <TruncatedAddress address={req.wallet} />
                                    </td>
                                    <td className="p-3 font-medium">{req.shopName}</td>
                                    <td className="p-3">
                                        <div className="flex items-center gap-2">
                                            {req.logoUrl ? (
                                                <img src={req.logoUrl} alt="" className="h-8 w-8 rounded object-cover" />
                                            ) : (
                                                <div className="h-8 w-8 rounded bg-gray-700 flex items-center justify-center text-xs text-gray-400">
                                                    {req.shopName.charAt(0)}
                                                </div>
                                            )}
                                            {req.primaryColor && (
                                                <div
                                                    className="h-6 w-6 rounded-full border border-white/20"
                                                    style={{ backgroundColor: req.primaryColor }}
                                                    title={req.primaryColor}
                                                />
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-3">{statusBadge(req.status)}</td>
                                    <td className="p-3 text-xs text-muted-foreground">{formatDate(req.createdAt)}</td>
                                    <td className="p-3">
                                        {req.status === "pending" ? (
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => handleAction(req.id, "approved")}
                                                    disabled={processingId === req.id}
                                                    className="h-7 px-3 rounded-md bg-green-600 hover:bg-green-500 text-white text-xs font-medium flex items-center gap-1 disabled:opacity-50"
                                                >
                                                    <CheckCircle className="h-3.5 w-3.5" />
                                                    Approve
                                                </button>
                                                <button
                                                    onClick={() => handleAction(req.id, "rejected")}
                                                    disabled={processingId === req.id}
                                                    className="h-7 px-3 rounded-md bg-red-600 hover:bg-red-500 text-white text-xs font-medium flex items-center gap-1 disabled:opacity-50"
                                                >
                                                    <XCircle className="h-3.5 w-3.5" />
                                                    Reject
                                                </button>
                                            </div>
                                        ) : req.status === "approved" ? (
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => setConfigReq(req)}
                                                    className="h-7 px-3 rounded-md border hover:bg-muted text-xs font-medium flex items-center gap-1"
                                                >
                                                    <Settings className="h-3.5 w-3.5" />
                                                    Split
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="text-center text-xs text-muted-foreground">
                                                {req.reviewedBy && (
                                                    <span>by <TruncatedAddress address={req.reviewedBy} /></span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Config Split Modal */}
            {configReq && (
                <ConfigSplitModal
                    req={configReq}
                    account={account}
                    onClose={() => setConfigReq(null)}
                />
            )}

            {/* Summary */}
            {!loading && requests.length > 0 && (
                <div className="text-xs text-muted-foreground">
                    Showing {requests.length} request{requests.length !== 1 ? "s" : ""}
                </div>
            )}
        </div>
    );
}

function ConfigSplitModal({ req, account, onClose }: { req: ClientRequest, account: any, onClose: () => void }) {
    const [loading, setLoading] = useState(true);
    const [platformBps, setPlatformBps] = useState(50); // Default, fetch real
    const [partnerBps, setPartnerBps] = useState(0);
    const [deploying, setDeploying] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        // Fetch Brand Config to get Platform BPS default & Partner BPS default
        fetch(`/api/platform/brands/${req.brandKey}/config`)
            .then(r => r.json())
            .then(data => {
                const b = data.brand || {};
                setPlatformBps(Number(b.platformFeeBps || 50));
                setPartnerBps(Number(b.partnerFeeBps || 0));
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [req.brandKey]);

    const merchantBps = Math.max(0, 10000 - platformBps - partnerBps);

    async function handleDeploy() {
        if (!account) {
            setError("Wallet not connected");
            return;
        }
        setDeploying(true);
        setError("");
        try {
            const addr = await ensureSplitForWallet(account, req.brandKey, partnerBps, req.wallet);
            if (!addr) throw new Error("Deployment failed or cancelled");
            alert(`Split deployed successfully at ${addr}`);
            onClose();
        } catch (e: any) {
            setError(e.message || "Deployment failed");
        } finally {
            setDeploying(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
            <div className="bg-background border rounded-2xl max-w-md w-full p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-bold flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-purple-500" />
                        Configure Revenue Split
                    </h3>
                    <button onClick={onClose}>✕</button>
                </div>

                <div className="text-sm text-muted-foreground">
                    Deploy a revenue split contract for <strong>{req.shopName}</strong>.
                    <br />
                    Target Wallet: <span className="font-mono text-xs">{req.wallet.slice(0, 6)}...{req.wallet.slice(-4)}</span>
                </div>

                {loading ? (
                    <div className="py-8 text-center text-muted-foreground">Loading config...</div>
                ) : (
                    <div className="space-y-3 bg-muted/20 p-4 rounded-lg border">
                        {/* Platform Fee (Locked) */}
                        <div>
                            <div className="flex justify-between text-sm mb-1">
                                <label className="text-muted-foreground">Platform Fee (Locked)</label>
                                <span className="font-mono">{(platformBps / 100).toFixed(2)}%</span>
                            </div>
                            <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded overflow-hidden">
                                <div className="h-full bg-gray-500" style={{ width: `${platformBps / 100}%` }} />
                            </div>
                        </div>

                        {/* Partner Fee (Editable) */}
                        <div>
                            <div className="flex justify-between text-sm mb-1">
                                <label className="font-medium">Partner Fee (Your Share)</label>
                                <span className="font-mono">{(partnerBps / 100).toFixed(2)}%</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max={10000 - platformBps}
                                step="1" // 1 bps
                                value={partnerBps}
                                onChange={e => setPartnerBps(Number(e.target.value))}
                                className="w-full h-2 bg-gray-200 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                            <div className="mt-1 flex gap-2">
                                <input
                                    type="number"
                                    value={partnerBps}
                                    onChange={e => setPartnerBps(Math.min(10000 - platformBps, Math.max(0, Number(e.target.value))))}
                                    className="w-20 text-xs px-2 py-1 rounded border bg-background"
                                />
                                <span className="text-xs text-muted-foreground pt-1">bps (100 = 1%)</span>
                            </div>
                        </div>

                        {/* Merchant Fee (Result) */}
                        <div className="pt-2 border-t">
                            <div className="flex justify-between text-sm font-semibold">
                                <label className="text-emerald-500">Merchant Share</label>
                                <span className="font-mono text-emerald-500">{(merchantBps / 100).toFixed(2)}%</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                                Calculated Remainder
                            </div>
                        </div>
                    </div>
                )}

                {error && <div className="text-xs text-red-500 bg-red-500/10 p-2 rounded">{error}</div>}

                <button
                    onClick={handleDeploy}
                    disabled={loading || deploying || !account}
                    className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {deploying ? "Deploying..." : "Deploy / Update Split"}
                </button>
            </div>
        </div>
    );
}
