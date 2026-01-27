"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Smartphone, RefreshCw, Plus, Trash2, Check, X, Clock } from "lucide-react";

interface TouchpointDevice {
    id: string;
    installationId: string;
    mode: "terminal" | "kiosk";
    merchantWallet: string;
    brandKey: string;
    locked: boolean;
    configuredAt: string;
    configuredBy: string;
    lastSeen: string | null;
    ts: number;
}

export default function TouchpointMonitoringPanel() {
    const [devices, setDevices] = useState<TouchpointDevice[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Provision form state
    const [showProvisionForm, setShowProvisionForm] = useState(false);
    const [provisionInstallId, setProvisionInstallId] = useState("");
    const [provisionMode, setProvisionMode] = useState<"terminal" | "kiosk">("terminal");
    const [provisionWallet, setProvisionWallet] = useState("");
    const [provisioning, setProvisioning] = useState(false);

    // Build APK state
    const [showBuildForm, setShowBuildForm] = useState(false);
    const [buildBrandKey, setBuildBrandKey] = useState("");
    const [buildEndpoint, setBuildEndpoint] = useState("");
    const [building, setBuilding] = useState(false);

    // Build status tracking
    const [buildRunId, setBuildRunId] = useState<number | null>(null);
    const [buildStatus, setBuildStatus] = useState<string>("");
    const [buildProgress, setBuildProgress] = useState<number>(0);
    const [buildMessage, setBuildMessage] = useState<string>("");
    const [buildDownloadUrl, setBuildDownloadUrl] = useState<string>("");
    const [buildComplete, setBuildComplete] = useState(false);
    const [buildSuccess, setBuildSuccess] = useState<boolean | null>(null);

    const fetchDevices = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/touchpoint/devices?limit=100");
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.error || "Failed to fetch devices");
            }

            setDevices(data.devices || []);
            setTotal(data.total || 0);
        } catch (e: any) {
            setError(e?.message || "Failed to load devices");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDevices();
    }, [fetchDevices]);

    async function handleProvision() {
        const wallet = provisionWallet.trim();
        const brandKey = provisionInstallId.includes(":") ? "" : (document.getElementById("provision-brand") as HTMLInputElement)?.value.trim();

        if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
            alert("Invalid wallet address");
            return;
        }

        if (!provisionInstallId.trim()) {
            alert("Installation ID required");
            return;
        }

        const isPlatform = process.env.NEXT_PUBLIC_CONTAINER_TYPE !== "partner";
        if (isPlatform && !brandKey) {
            alert("Brand key required for platform provisioning");
            return;
        }

        setProvisioning(true);
        try {
            const res = await fetch("/api/touchpoint/provision", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    installationId: provisionInstallId.trim(),
                    mode: provisionMode,
                    merchantWallet: wallet,
                    brandKey: isPlatform ? brandKey : undefined
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.message || data?.error || "Provision failed");
            }

            alert(`Device provisioned successfully as ${provisionMode}`);
            setShowProvisionForm(false);
            setProvisionInstallId("");
            setProvisionWallet("");
            setProvisionMode("terminal");
            await fetchDevices();
        } catch (e: any) {
            alert(`Error: ${e?.message || "Failed to provision device"}`);
        } finally {
            setProvisioning(false);
        }
    }

    async function handleDelete(installationId: string) {
        if (!confirm("Are you sure you want to reset this device? The user will need to provide the Installation ID again.")) {
            return;
        }

        try {
            const res = await fetch(`/api/touchpoint/config?installationId=${encodeURIComponent(installationId)}`, {
                method: "DELETE",
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.message || data?.error || "Delete failed");
            }

            alert("Device reset successfully");
            await fetchDevices();
        } catch (e: any) {
            alert(`Error: ${e?.message || "Failed to reset device"}`);
        }
    }

    async function handleBuildApk() {
        const brand = buildBrandKey.trim();
        if (!brand) {
            alert("Brand key required");
            return;
        }

        // Reset build tracking state
        setBuildComplete(false);
        setBuildSuccess(null);
        setBuildProgress(0);
        setBuildMessage("Starting build...");
        setBuildStatus("starting");
        setBuilding(true);

        try {
            // Trigger GitHub Actions workflow to build APK
            const res = await fetch("/api/build", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    brandKey: brand,
                    endpoint: buildEndpoint.trim() || undefined,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.message || data?.error || "Build failed");
            }

            // Store the run ID and download URL for tracking
            setBuildRunId(data.runId);
            setBuildDownloadUrl(data.downloadUrl);
            setBuildMessage(data.message || "Build triggered, waiting for status...");
            setBuildProgress(10);

            // Start polling for status if we have a run ID
            if (data.runId) {
                pollBuildStatus(data.runId);
            } else {
                // No run ID available, show basic success
                setBuildComplete(true);
                setBuildSuccess(true);
                setBuildMessage("Build triggered! Check GitHub Actions for status.");
                setBuilding(false);
            }

            // Clear form inputs but keep modal open to show progress
            setBuildBrandKey("");
            setBuildEndpoint("");
        } catch (e: any) {
            setBuildComplete(true);
            setBuildSuccess(false);
            setBuildMessage(`Error: ${e?.message || "Failed to start build"}`);
            setBuilding(false);
        }
    }

    async function pollBuildStatus(runId: number) {
        const maxAttempts = 60; // 10 minutes max (10s intervals)
        let attempts = 0;

        const poll = async () => {
            if (attempts >= maxAttempts) {
                setBuildComplete(true);
                setBuildSuccess(null);
                setBuildMessage("Build timed out. Check GitHub Actions for status.");
                setBuilding(false);
                return;
            }

            try {
                const res = await fetch(`/api/build/status?runId=${runId}`);
                const data = await res.json();

                if (!res.ok) {
                    // If 404, the run might not be registered yet
                    if (res.status === 404 && attempts < 5) {
                        attempts++;
                        setTimeout(poll, 5000);
                        return;
                    }
                    throw new Error(data?.error || "Status check failed");
                }

                setBuildStatus(data.status);
                setBuildProgress(data.progress || 0);
                setBuildMessage(data.message || `Status: ${data.status}`);

                if (data.status === "completed") {
                    setBuildComplete(true);
                    setBuildSuccess(data.conclusion === "success");
                    setBuilding(false);
                    return;
                }

                // Continue polling
                attempts++;
                setTimeout(poll, 10000); // Poll every 10 seconds
            } catch (e: any) {
                console.error("Poll error:", e);
                // Continue polling on error
                attempts++;
                setTimeout(poll, 10000);
            }
        };

        poll();
    }

    function resetBuildState() {
        setShowBuildForm(false);
        setBuildRunId(null);
        setBuildStatus("");
        setBuildProgress(0);
        setBuildMessage("");
        setBuildDownloadUrl("");
        setBuildComplete(false);
        setBuildSuccess(null);
        setBuilding(false);
    }

    function formatDate(dateStr?: string | null) {
        if (!dateStr) return "Never";
        try {
            return new Date(dateStr).toLocaleString();
        } catch {
            return dateStr;
        }
    }

    function formatTimeSince(dateStr?: string | null) {
        if (!dateStr) return "Never";
        try {
            const diff = Date.now() - new Date(dateStr).getTime();
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const days = Math.floor(hours / 24);

            if (days > 0) return `${days}d ago`;
            if (hours > 0) return `${hours}h ago`;
            return "< 1h ago";
        } catch {
            return dateStr;
        }
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Smartphone className="h-5 w-5 text-emerald-500" />
                    <div>
                        <h3 className="text-sm font-semibold">Touchpoint Devices</h3>
                        <p className="microtext text-muted-foreground">
                            Monitor and manage configured Terminal/Kiosk devices
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchDevices}
                        disabled={loading}
                        className="h-8 px-3 rounded-md border text-xs flex items-center gap-2 hover:bg-foreground/5 disabled:opacity-50"
                        title="Refresh"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </button>
                    <button
                        onClick={() => setShowProvisionForm(true)}
                        className="h-8 px-3 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs flex items-center gap-2 font-medium"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Provision Device
                    </button>
                    <button
                        onClick={() => setShowBuildForm(true)}
                        className="h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs flex items-center gap-2 font-medium"
                    >
                        <Smartphone className="h-3.5 w-3.5" />
                        Build APK
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-400 text-sm">
                    {error}
                </div>
            )}

            {/* Provision Form */}
            {showProvisionForm && (
                <div className="p-4 bg-neutral-800 rounded-lg border space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="font-semibold">Provision New Device</h4>
                        <button
                            onClick={() => setShowProvisionForm(false)}
                            className="h-6 w-6 rounded hover:bg-neutral-700 flex items-center justify-center"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <label className="text-xs text-muted-foreground block mb-1">Installation ID</label>
                            <input
                                type="text"
                                value={provisionInstallId}
                                onChange={(e) => setProvisionInstallId(e.target.value)}
                                placeholder="e.g. 1234567890-abc123def456"
                                className="w-full h-9 px-3 rounded-md border bg-background text-sm font-mono"
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">
                                Get this from the device's setup screen
                            </p>
                        </div>

                        <div>
                            <label className="text-xs text-muted-foreground block mb-1">Mode</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setProvisionMode("terminal")}
                                    className={`h-9 px-3 rounded-md border text-sm flex items-center justify-center gap-2 ${provisionMode === "terminal"
                                        ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
                                        : "bg-background hover:bg-foreground/5"
                                        }`}
                                >
                                    Terminal
                                </button>
                                <button
                                    onClick={() => setProvisionMode("kiosk")}
                                    className={`h-9 px-3 rounded-md border text-sm flex items-center justify-center gap-2 ${provisionMode === "kiosk"
                                        ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
                                        : "bg-background hover:bg-foreground/5"
                                        }`}
                                >
                                    Kiosk
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs text-muted-foreground block mb-1">Merchant Wallet</label>
                            <input
                                type="text"
                                value={provisionWallet}
                                onChange={(e) => setProvisionWallet(e.target.value)}
                                placeholder="0x..."
                                className="w-full h-9 px-3 rounded-md border bg-background text-sm font-mono"
                            />
                        </div>

                        {process.env.NEXT_PUBLIC_CONTAINER_TYPE !== "partner" && (
                            <div>
                                <label className="text-xs text-muted-foreground block mb-1">Brand Key</label>
                                <input
                                    id="provision-brand"
                                    type="text"
                                    placeholder="e.g. paynex"
                                    defaultValue="basaltsurge"
                                    className="w-full h-9 px-3 rounded-md border bg-background text-sm"
                                />
                                <p className="text-[10px] text-muted-foreground mt-1">
                                    Target brand for this device (default: basaltsurge)
                                </p>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleProvision}
                        disabled={provisioning}
                        className="w-full h-9 px-3 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-sm font-medium flex items-center justify-center gap-2"
                    >
                        {provisioning ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                                Provisioning...
                            </>
                        ) : (
                            <>
                                <Check className="h-4 w-4" />
                                Provision Device
                            </>
                        )}
                    </button>
                </div>
            )}

            {/* Build APK Form */}
            {showBuildForm && (
                <div className="p-4 bg-neutral-800 rounded-lg border space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="font-semibold">Build Touchpoint APK</h4>
                        <button
                            onClick={resetBuildState}
                            className="h-6 w-6 rounded hover:bg-neutral-700 flex items-center justify-center"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Show form when not building */}
                    {!building && !buildComplete && (
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-muted-foreground block mb-1">Brand Key</label>
                                <input
                                    type="text"
                                    value={buildBrandKey}
                                    onChange={(e) => setBuildBrandKey(e.target.value)}
                                    placeholder="e.g. xoinpay, basaltsurge"
                                    className="w-full h-9 px-3 rounded-md border bg-background text-sm"
                                />
                                <p className="text-[10px] text-muted-foreground mt-1">
                                    The brand this APK will be configured for
                                </p>
                            </div>

                            <div>
                                <label className="text-xs text-muted-foreground block mb-1">Endpoint URL (Optional)</label>
                                <input
                                    type="text"
                                    value={buildEndpoint}
                                    onChange={(e) => setBuildEndpoint(e.target.value)}
                                    placeholder="https://surge.basalthq.com"
                                    className="w-full h-9 px-3 rounded-md border bg-background text-sm font-mono"
                                />
                                <p className="text-[10px] text-muted-foreground mt-1">
                                    Leave empty to use default: https://{buildBrandKey || "brand"}.azurewebsites.net
                                </p>
                            </div>

                            <button
                                onClick={handleBuildApk}
                                className="w-full h-9 px-3 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium flex items-center justify-center gap-2"
                            >
                                <Smartphone className="h-4 w-4" />
                                Build & Upload APK
                            </button>
                        </div>
                    )}

                    {/* Show progress while building */}
                    {building && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500"></div>
                                <span className="text-sm">{buildMessage}</span>
                            </div>

                            {/* Progress bar */}
                            <div className="w-full bg-neutral-700 rounded-full h-2">
                                <div
                                    className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                                    style={{ width: `${buildProgress}%` }}
                                ></div>
                            </div>
                            <p className="text-xs text-muted-foreground text-center">
                                {buildProgress}% - This may take 2-3 minutes
                            </p>
                        </div>
                    )}

                    {/* Show result when complete */}
                    {buildComplete && (
                        <div className="space-y-4">
                            {buildSuccess === true && (
                                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
                                    <div className="flex items-center gap-2 text-emerald-400 mb-2">
                                        <Check className="h-5 w-5" />
                                        <span className="font-medium">Build Successful!</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground mb-3">{buildMessage}</p>
                                    {buildDownloadUrl && (
                                        <a
                                            href={buildDownloadUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-md"
                                        >
                                            <Smartphone className="h-4 w-4" />
                                            Download APK
                                        </a>
                                    )}
                                </div>
                            )}

                            {buildSuccess === false && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md">
                                    <div className="flex items-center gap-2 text-red-400 mb-2">
                                        <X className="h-5 w-5" />
                                        <span className="font-medium">Build Failed</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{buildMessage}</p>
                                </div>
                            )}

                            {buildSuccess === null && (
                                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
                                    <div className="flex items-center gap-2 text-yellow-400 mb-2">
                                        <Clock className="h-5 w-5" />
                                        <span className="font-medium">Status Unknown</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{buildMessage}</p>
                                </div>
                            )}

                            <button
                                onClick={resetBuildState}
                                className="w-full h-9 px-3 rounded-md border hover:bg-foreground/5 text-sm font-medium"
                            >
                                Close
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Devices List */}
            {loading ? (
                <div className="p-8 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500"></div>
                </div>
            ) : devices.length === 0 ? (
                <div className="p-8 text-center border rounded-lg bg-foreground/5">
                    <Smartphone className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">No touchpoint devices configured</p>
                    <p className="text-xs text-muted-foreground mt-1">Click "Provision Device" to get started</p>
                </div>
            ) : (
                <div className="border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-foreground/5 border-b">
                                <tr className="text-xs text-muted-foreground">
                                    <th className="text-left p-3 font-medium">Installation ID</th>
                                    <th className="text-left p-3 font-medium">Mode</th>
                                    <th className="text-left p-3 font-medium">Merchant Wallet</th>
                                    <th className="text-left p-3 font-medium">Brand</th>
                                    <th className="text-left p-3 font-medium">Last Seen</th>
                                    <th className="text-left p-3 font-medium">Configured</th>
                                    <th className="text-center p-3 font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {devices.map((device) => (
                                    <tr key={device.id} className="hover:bg-foreground/5">
                                        <td className="p-3 font-mono text-xs">{device.installationId.slice(0, 24)}...</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${device.mode === "terminal"
                                                ? "bg-blue-500/10 text-blue-400"
                                                : "bg-purple-500/10 text-purple-400"
                                                }`}>
                                                {device.mode}
                                            </span>
                                        </td>
                                        <td className="p-3 font-mono text-xs">{device.merchantWallet.slice(0, 10)}...{device.merchantWallet.slice(-8)}</td>
                                        <td className="p-3 text-xs">{device.brandKey}</td>
                                        <td className="p-3 text-xs text-muted-foreground flex items-center gap-1">
                                            {device.lastSeen && <Clock className="h-3 w-3" />}
                                            {formatTimeSince(device.lastSeen)}
                                        </td>
                                        <td className="p-3 text-xs text-muted-foreground">{formatDate(device.configuredAt)}</td>
                                        <td className="p-3 text-center">
                                            <button
                                                onClick={() => handleDelete(device.installationId)}
                                                className="h-7 w-7 rounded-md hover:bg-red-500/10 flex items-center justify-center mx-auto text-red-400 hover:text-red-300"
                                                title="Reset device"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Footer */}
            {!loading && devices.length > 0 && (
                <div className="text-xs text-muted-foreground">
                    Showing {devices.length} of {total} device{total !== 1 ? "s" : ""}
                </div>
            )}
        </div>
    );
}
