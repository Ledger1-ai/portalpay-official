"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Smartphone, Lock, RefreshCw, Copy, CheckCircle } from "lucide-react";

// Installation ID is generated once and stored permanently
const INSTALLATION_ID_KEY = "touchpoint_installation_id";

function generateInstallationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

function getOrCreateInstallationId(): string {
    try {
        let id = localStorage.getItem(INSTALLATION_ID_KEY);
        if (!id) {
            id = generateInstallationId();
            localStorage.setItem(INSTALLATION_ID_KEY, id);
        }
        return id;
    } catch {
        return generateInstallationId();
    }
}

interface TouchpointConfig {
    configured: boolean;
    mode?: "terminal" | "kiosk" | "handheld";
    merchantWallet?: string;
    brandKey?: string;
    locked?: boolean;
    configuredAt?: string;
    // Lockdown settings for Android app
    lockdownMode?: "none" | "standard" | "device_owner";
    unlockCodeHash?: string | null;
}

export default function TouchpointSetupPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [installationId, setInstallationId] = useState("");
    const [config, setConfig] = useState<TouchpointConfig | null>(null);
    const [checking, setChecking] = useState(false);
    const [copied, setCopied] = useState(false);

    async function fetchConfig(id: string): Promise<TouchpointConfig> {
        const res = await fetch(`/api/touchpoint/config?installationId=${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error("Failed to fetch configuration");
        return res.json();
    }

    function performRedirect(cfg: TouchpointConfig) {
        if (!cfg.configured || !cfg.mode || !cfg.merchantWallet) return;

        // Preserve scale parameter from the APK's built-in URL
        const params = new URLSearchParams(window.location.search);
        const scale = params.get("scale");
        let queryParams = new URLSearchParams();

        if (scale) queryParams.set("scale", scale);

        // Pass lockdown config in query params so Android app can detect it across navigation
        if (cfg.lockdownMode && cfg.lockdownMode !== "none") {
            queryParams.set("lockdownMode", cfg.lockdownMode);
            if (cfg.unlockCodeHash) {
                queryParams.set("unlockHash", cfg.unlockCodeHash);
            }
        }

        const queryStr = queryParams.toString() ? `?${queryParams.toString()}` : "";

        if (cfg.mode === "terminal") {
            // Wallet must be a path parameter for terminal to work without login
            router.replace(`/terminal/${cfg.merchantWallet}${queryStr}`);
        } else if (cfg.mode === "handheld") {
            // Handheld mode uses dedicated handheld interface
            router.replace(`/handheld/${cfg.merchantWallet}${queryStr}`);
        } else if (cfg.mode === "kds") {
            // Kitchen Display System mode
            router.replace(`/kitchen/${cfg.merchantWallet}${queryStr}`);
        } else {
            // Kiosk mode uses shop with wallet as path and kiosk flag
            queryParams.set("kiosk", "1");
            router.replace(`/shop/${cfg.merchantWallet}?${queryParams.toString()}`);
        }
    }

    async function checkConfiguration() {
        if (!installationId) return;

        setChecking(true);
        try {
            const cfg = await fetchConfig(installationId);
            setConfig(cfg);

            if (cfg.configured) {
                console.log("[Touchpoint] Device configured, redirecting...", cfg);

                // Signal Android app immediately via hash
                window.location.hash = `lockdown:${cfg.lockdownMode || "none"}:${cfg.unlockCodeHash || ""}`;

                // Small delay to ensure hash is processed before redirect
                setTimeout(() => performRedirect(cfg), 500);
            }
        } catch (e) {
            console.error("[Touchpoint] Error checking configuration:", e);
        } finally {
            setChecking(false);
        }
    }

    useEffect(() => {
        // Check for installationId in query params (passed by APK wrapper)
        const params = new URLSearchParams(window.location.search);
        let id = params.get("installationId");

        if (id) {
            // Trust the wrapper's ID and persist it
            localStorage.setItem(INSTALLATION_ID_KEY, id);
        } else {
            // Fallback to local storage or generate new
            id = getOrCreateInstallationId();
        }

        setInstallationId(id);

        fetchConfig(id).then(cfg => {
            setConfig(cfg);
            setLoading(false);

            // Expose config to Android app via JS bridge
            if (typeof window !== "undefined") {
                (window as any).TOUCHPOINT_CONFIG = {
                    configured: cfg.configured,
                    mode: cfg.mode,
                    merchantWallet: cfg.merchantWallet,
                    brandKey: cfg.brandKey,
                    locked: cfg.locked,
                    lockdownMode: cfg.lockdownMode || "none",
                    unlockCodeHash: cfg.unlockCodeHash || null,
                };

                // Signal Android app via URL hash (for passive detection)
                window.location.hash = `lockdown:${cfg.lockdownMode || "none"}:${cfg.unlockCodeHash || ""}`;

                console.log("[Touchpoint] Exposed config to JS bridge:", (window as any).TOUCHPOINT_CONFIG);
            }

            if (cfg.configured) {
                console.log("[Touchpoint] Device configured, redirecting...", cfg);
                // Delay redirect slightly to ensure hash change is detected
                setTimeout(() => performRedirect(cfg), 1000);
            }
        }).catch(e => {
            console.error("[Touchpoint] Error fetching config:", e);
            setLoading(false);
        });
    }, []);

    function copyToClipboard() {
        navigator.clipboard.writeText(installationId).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 text-white">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500 mb-4"></div>
                <p className="text-neutral-400">Initializing Touchpoint...</p>
            </div>
        );
    }

    if (config?.configured) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 text-white">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500 mb-4"></div>
                <p className="text-neutral-400">Launching {config.mode}...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-neutral-900 text-neutral-100 font-sans flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-md bg-neutral-800 rounded-2xl shadow-2xl overflow-hidden border border-neutral-700">

                {/* Header */}
                <div className="bg-neutral-950 p-6 flex flex-col items-center border-b border-neutral-800">
                    <div className="h-16 w-16 bg-neutral-800 rounded-full flex items-center justify-center mb-4 border border-neutral-700">
                        <Smartphone className="h-8 w-8 text-amber-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Device Awaiting Configuration</h1>
                    <p className="text-neutral-400 text-sm mt-1 text-center">Contact your administrator to provision this device</p>
                </div>

                {/* Content */}
                <div className="p-8 space-y-6">

                    {/* Installation ID */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-neutral-300 uppercase tracking-wider">Installation ID</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={installationId}
                                readOnly
                                className="w-full bg-neutral-950/50 border border-neutral-700 rounded-lg px-4 py-3 pr-12 text-white font-mono text-sm cursor-text select-all focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                            />
                            <button
                                onClick={copyToClipboard}
                                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-md bg-neutral-700 hover:bg-neutral-600 flex items-center justify-center transition-colors"
                                title="Copy to clipboard"
                            >
                                {copied ? (
                                    <CheckCircle className="h-4 w-4 text-emerald-400" />
                                ) : (
                                    <Copy className="h-4 w-4 text-neutral-300" />
                                )}
                            </button>
                        </div>
                        <p className="text-xs text-neutral-500">
                            Provide this ID to your administrator to configure this device.
                        </p>
                    </div>

                    {/* Status */}
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3">
                        <Lock className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-amber-200">
                            <p className="font-semibold mb-1">Device Not Configured</p>
                            <p className="text-amber-300/80">
                                This device must be provisioned by an admin before it can be used as a Terminal or Kiosk.
                            </p>
                        </div>
                    </div>

                    {/* Check Configuration Button */}
                    <button
                        onClick={checkConfiguration}
                        disabled={checking}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-bold py-4 rounded-xl shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2"
                    >
                        {checking ? (
                            <>
                                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                                Checking...
                            </>
                        ) : (
                            <>
                                <RefreshCw className="h-5 w-5" />
                                Check Configuration
                            </>
                        )}
                    </button>

                </div>

                {/* Footer */}
                <div className="bg-neutral-950/50 p-4 border-t border-neutral-800 flex justify-center">
                    <p className="text-neutral-600 text-xs uppercase tracking-widest font-semibold">
                        Touchpoint Provisioning Required
                    </p>
                </div>

            </div>
        </div>
    );
}
