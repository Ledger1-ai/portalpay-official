"use client";

import React, { useEffect, useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { Copy, ExternalLink, Smartphone, Monitor } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";

export default function EndpointsPanel() {
    const account = useActiveAccount();
    const brand = useBrand();
    const [slug, setSlug] = useState<string>("");
    const [loading, setLoading] = useState(false);

    // Base URLs
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const kioskUrl = slug ? `${origin}/kiosk/${slug}` : "";
    const terminalUrl = slug ? `${origin}/terminal/${slug}` : "";

    // Helper to copy to clipboard
    const copyToClipboard = (text: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        // Could add toast here
    };

    useEffect(() => {
        if (!account?.address) return;
        setLoading(true);

        (async () => {
            try {
                // Fetch site config to get the slug
                const r = await fetch(`/api/site/config?wallet=${account.address}`);
                const j = await r.json();

                const cfg = j.config || {};
                // Prefer slug, then customDomain (if verified? usually implied), then fallback to wallet
                const bestSlug = cfg.slug || cfg.customDomain || account.address.toLowerCase();
                setSlug(bestSlug);
            } catch {
                setSlug(account.address.toLowerCase());
            } finally {
                setLoading(false);
            }
        })();
    }, [account?.address]);

    if (!account) return <div className="p-4 text-muted-foreground">Please connect your wallet.</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h2 className="text-xl font-semibold">Point of Sale Endpoints</h2>
                <p className="text-muted-foreground text-sm">
                    Use these dedicated links to run PortalPay in Kiosk or Terminal mode on your devices.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Kiosk Mode Card */}
                <div className="border rounded-xl p-5 bg-card relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Monitor size={64} />
                    </div>
                    <div className="flex flex-col h-full justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Monitor className="text-primary" size={20} />
                                <h3 className="font-semibold">Kiosk Mode</h3>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Self-service ordering interface for customers. optimized for tablets and touchscreens.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <div className="bg-muted/50 p-2 rounded-md text-xs font-mono truncate border">
                                {loading ? "Loading..." : kioskUrl || "No URL available"}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => copyToClipboard(kioskUrl)}
                                    className="flex-1 flex items-center justify-center gap-2 text-xs font-medium py-2 px-3 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                >
                                    <Copy size={14} /> Copy Link
                                </button>
                                <a
                                    href={kioskUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 text-xs font-medium py-2 px-3 rounded-md border hover:bg-muted transition-colors"
                                >
                                    <ExternalLink size={14} /> Open
                                </a>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Terminal Mode Card */}
                <div className="border rounded-xl p-5 bg-card relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Smartphone size={64} />
                    </div>
                    <div className="flex flex-col h-full justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Smartphone className="text-primary" size={20} />
                                <h3 className="font-semibold">Terminal Mode</h3>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Staff-facing POS interface for processing orders and payments. Requires employee login.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <div className="bg-muted/50 p-2 rounded-md text-xs font-mono truncate border">
                                {loading ? "Loading..." : terminalUrl || "No URL available"}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => copyToClipboard(terminalUrl)}
                                    className="flex-1 flex items-center justify-center gap-2 text-xs font-medium py-2 px-3 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                >
                                    <Copy size={14} /> Copy Link
                                </button>
                                <a
                                    href={terminalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 text-xs font-medium py-2 px-3 rounded-md border hover:bg-muted transition-colors"
                                >
                                    <ExternalLink size={14} /> Open
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-xs text-amber-600 dark:text-amber-400">
                <strong>Note:</strong> Ensure you have enabled Kiosk and Terminal modes for your shop in the settings. Kiosk mode is public, while Terminal mode requires employee PINs (configured in the Team panel).
            </div>
        </div>
    );
}
