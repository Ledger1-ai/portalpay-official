"use client";

import React, { useState, useEffect, useCallback } from "react";
import HandheldInterface from "@/components/handheld/HandheldInterface";
import TerminalAdminDashboard from "@/components/terminal/TerminalAdminDashboard";
import { ShopConfig } from "@/app/shop/[slug]/ShopClient";

// ThirdWeb Imports
import { ConnectButton, useActiveAccount, useDisconnect, useActiveWallet } from "thirdweb/react";
import { client, chain, getWallets } from "@/lib/thirdweb/client";
import { usePortalThirdwebTheme, getConnectButtonStyle, connectButtonClass } from "@/lib/thirdweb/theme";

// Handles Authenticating the Employee via PIN before showing the interface
export default function HandheldSessionManager({ config, merchantWallet, items }: { config: ShopConfig; merchantWallet: string; items: any[] }) {
    const [view, setView] = useState<"pin" | "terminal" | "admin">("pin");
    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // Admin / Wallet
    const account = useActiveAccount();
    const activeWallet = useActiveWallet();
    const { disconnect } = useDisconnect();
    const twTheme = usePortalThirdwebTheme();
    const [isLoggedOut, setIsLoggedOut] = useState(false);

    // Load wallets and handle mounting to prevent hydration mismatch
    const [wallets, setWallets] = useState<any[]>([]);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        let isMounted = true;
        setMounted(true);
        getWallets().then((w) => {
            if (isMounted) setWallets(w);
        });
        return () => { isMounted = false; };
    }, []);

    // Session State
    const [activeSession, setActiveSession] = useState<{
        sessionId: string;
        staffId: string;
        name: string;
        role: string;
        totalSales?: number;
    } | null>(null);

    // Apply Theme
    useEffect(() => {
        const root = document.documentElement;
        const theme = config?.theme || {};
        const p = (theme.primaryColor || "#0ea5e9").trim();
        const s = (theme.secondaryColor || "#0ea5e9").trim();

        root.style.setProperty("--pp-primary", p);
        root.style.setProperty("--pp-secondary", s);

        if (theme.fontFamily) {
            root.style.setProperty("--font-sans", theme.fontFamily);
        }
    }, [config]);

    // Admin Access Check
    useEffect(() => {
        const w = (account?.address || "").toLowerCase();
        const m = (merchantWallet || "").toLowerCase();

        // Reset manual logout flag if wallet disconnects
        if (!w) {
            setIsLoggedOut(false);
            // PERSIST UNAUTHORIZED ERROR: Do not clear error if it was an auth failure
            // if (error && error.includes("Unauthorized")) setError(""); 
            return;
        }

        // If wallet is connected and matches merchant
        if (w && view === "pin" && !isLoggedOut) {
            if (m && w === m) {
                setView("admin");
                setError("");
            } else if (m && w !== m) {
                // Unauthorized - Disconnect immediately
                setError("Unauthorized: Wallet is not the merchant");
                if (activeWallet) disconnect(activeWallet);
            }
        }
    }, [account?.address, view, merchantWallet, isLoggedOut, disconnect, activeWallet]);

    // Poll for stats
    useEffect(() => {
        if (!activeSession?.sessionId) return;

        const fetchStats = async () => {
            try {
                const res = await fetch(`/api/terminal/session?sessionId=${activeSession.sessionId}&merchantWallet=${merchantWallet}`);
                const data = await res.json();
                if (data.session) {
                    setActiveSession(prev => prev ? { ...prev, totalSales: data.session.totalSales } : null);
                }
            } catch (e) {
                console.error("Stats poll failed", e);
            }
        };

        const interval = setInterval(fetchStats, 30000); // Poll every 30s
        fetchStats(); // Initial fetch

        return () => clearInterval(interval);
    }, [activeSession?.sessionId, merchantWallet]);

    // Auto-end session on page close/refresh
    useEffect(() => {
        if (!activeSession?.sessionId || !merchantWallet) return;

        const endSessionOnClose = () => {
            // Use sendBeacon with Blob for reliable delivery during page unload
            const payload = JSON.stringify({ sessionId: activeSession.sessionId, merchantWallet });
            const blob = new Blob([payload], { type: "application/json" });
            navigator.sendBeacon("/api/terminal/session", blob);
        };

        window.addEventListener("beforeunload", endSessionOnClose);
        window.addEventListener("pagehide", endSessionOnClose);

        return () => {
            window.removeEventListener("beforeunload", endSessionOnClose);
            window.removeEventListener("pagehide", endSessionOnClose);
        };
    }, [activeSession?.sessionId, merchantWallet]);

    const handleLogin = async () => {
        if (pin.length < 4) return;
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/terminal/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ merchantWallet, pin })
            });
            const data = await res.json();
            if (data.success && data.session) {
                setActiveSession(data.session);
                setView("terminal");
                setPin("");
            } else {
                setError(data.detail || data.error || "Invalid PIN");
                setPin("");
            }
        } catch (e) {
            setError("Connection failed");
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = useCallback(async () => {
        if (activeSession?.sessionId) {
            try {
                await fetch("/api/terminal/session", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sessionId: activeSession.sessionId, merchantWallet })
                });
            } catch (e) {
                console.error("Logout failed", e);
            }
        }
        setActiveSession(null);
        setView("pin");
        setPin("");
    }, [activeSession, merchantWallet]);

    const handleAdminLogout = () => {
        setView("pin");
        setIsLoggedOut(true);
        // Optionally disconnect wallet logic here via ThirdWeb hook if needed, 
        // but typically user just switches back.
    };

    const appendPin = (d: string) => {
        if (pin.length < 6) {
            setPin(prev => prev + d);
            setError("");
        }
    };

    const resolvedLogoUrl = (() => {
        // Robust check: Theme data might be split between root 'theme' and nested 'config.theme'
        const t1 = config.theme || {};
        const t2 = (config as any).config?.theme || {};

        // Strict priority: Brand Logo (App) -> Brand Symbol -> Favicon -> Merchant PFP
        // Check both sources for each property
        const logo = t1.brandLogoUrl || t2.brandLogoUrl || (t1 as any).symbolLogoUrl || (t2 as any).symbolLogoUrl;

        if (logo) return logo;

        const fav = (t1 as any).brandFaviconUrl || (t2 as any).brandFaviconUrl;
        // If we have a favicon, use it as symbol fallback
        if (fav) return fav;

        // Final fallback to PFP if no brand assets exist
        if (merchantWallet) return `/api/users/pfp?wallet=${merchantWallet}`;

        // Absolute fallback
        return "/favicon.ico";
    })();

    const primaryColor = config.theme?.primaryColor || "#0ea5e9";
    const secondaryColor = config.theme?.secondaryColor || config.theme?.primaryColor || "#0ea5e9";

    // ADMIN VIEW
    if (view === "admin") {
        return (
            <TerminalAdminDashboard
                merchantWallet={account?.address || merchantWallet}
                brandName={config.name}
                logoUrl={resolvedLogoUrl}
                theme={config.theme}
                onLogout={handleAdminLogout}
                // Check if split address exists in config
                // ShopConfig type needs to be checked, usually it's config.splitAddress or inside config.config
                // Assuming it might be at top level based on ShopClient
                // But let's check config type usage. It's ShopConfig.
                // Let's safe access it.
                // TypeScript might complain if I access unknown props, but let's try safely cast or just pass if known.
                // Actually ShopConfig interface import is from ShopClient... 
                // Let's just pass (config as any).splitAddress for now or check type
                splitAddress={(config as any).splitAddress || (config as any).split?.address || (config as any).config?.splitAddress || (config as any).config?.split?.address}
                reserveRatios={(config as any).reserveRatios || (config as any).config?.reserveRatios}
                accumulationMode={(config as any).accumulationMode || (config as any).config?.accumulationMode}
            />
        );
    }

    // TERMINAL INTERFACE VIEW
    if (view === "terminal" && activeSession) {
        // Format stats for display
        const sessTotal = typeof activeSession.totalSales === 'number' ? activeSession.totalSales : 0;
        const statsStr = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(sessTotal);

        return (
            <HandheldInterface
                merchantWallet={merchantWallet}
                employeeId={activeSession.staffId}
                employeeName={`${activeSession.name}`}
                employeeRole={activeSession.role}
                sessionId={activeSession.sessionId}
                onLogout={handleLogout}
                brandName={config.name}
                logoUrl={resolvedLogoUrl}
                theme={config.theme}
                items={items}
                tables={(config as any).industryParams?.restaurant?.tables || []}
            />
        );
    }

    // PIN VIEW (Default)
    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ backgroundColor: "#000" }}>
            {/* Background Gradient using Theme Primary Color */}
            <div
                className="absolute inset-0 pointer-events-none opacity-30"
                style={{
                    background: `radial-gradient(circle at 50% 50%, ${primaryColor}40 0%, transparent 70%)`
                }}
            />

            <div className="max-w-md w-full bg-[#0f0f12] border border-white/10 rounded-2xl shadow-2xl overflow-hidden relative z-10 animate-in fade-in zoom-in duration-300">
                <div className="p-8 text-center space-y-4">
                    {resolvedLogoUrl && (
                        <div className="mx-auto w-24 h-24 bg-white/5 rounded-2xl flex items-center justify-center p-4 shadow-inner border border-white/10">
                            <img src={resolvedLogoUrl} className="h-full w-full object-contain" alt="Logo" />
                        </div>
                    )}
                    <h1 className="text-2xl font-bold text-white">Employee Login</h1>
                    <p className="text-gray-400 text-sm">Enter your Access PIN to start session</p>

                    <div className="flex justify-center gap-2 my-6">
                        {[0, 1, 2, 3].map(i => (
                            <div
                                key={i}
                                className="w-4 h-4 rounded-full border transition-all duration-300"
                                style={{
                                    borderColor: i < pin.length ? primaryColor : "rgba(255,255,255,0.2)",
                                    backgroundColor: i < pin.length ? primaryColor : "transparent",
                                    transform: i < pin.length ? "scale(1.1)" : "scale(1)"
                                }}
                            />
                        ))}
                    </div>

                    {error && <div className="text-red-500 text-sm animate-pulse bg-red-900/20 py-1 rounded border border-red-900/50">{error}</div>}

                    <div className="grid grid-cols-3 gap-4 max-w-xs mx-auto">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                            <button
                                key={n}
                                onClick={() => appendPin(String(n))}
                                className="h-16 rounded-2xl bg-white/5 hover:bg-white/10 text-xl font-bold transition-all active:scale-95 text-white border border-white/5"
                            >
                                {n}
                            </button>
                        ))}
                        <div /> {/* Spacer */}
                        <button
                            onClick={() => appendPin("0")}
                            className="h-16 rounded-2xl bg-white/5 hover:bg-white/10 text-xl font-bold transition-all active:scale-95 text-white border border-white/5"
                        >
                            0
                        </button>
                        <button
                            onClick={() => setPin(prev => prev.slice(0, -1))}
                            className="h-16 rounded-2xl bg-white/5 hover:bg-red-900/20 text-red-500 font-bold transition-all active:scale-95 flex items-center justify-center border border-white/5 group"
                        >
                            <span className="group-hover:scale-110 transition-transform">⌫</span>
                        </button>
                    </div>

                    <button
                        onClick={handleLogin}
                        disabled={loading || pin.length < 4}
                        className="w-full h-14 text-white rounded-xl font-bold mt-6 disabled:opacity-50 shadow-lg hover:brightness-110 active:scale-95 transition-all text-lg"
                        style={{ backgroundColor: secondaryColor }}
                    >
                        {loading ? "Verifying..." : "Start Session"}
                    </button>

                    {/* ADMIN LOGIN */}
                    <div className="pt-8 mt-4 border-t border-dashed border-white/10">
                        <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-4">Merchant Access</p>
                        <div className="flex justify-center">
                            {mounted && wallets.length > 0 ? (
                                <ConnectButton
                                    client={client}
                                    chain={chain}
                                    wallets={wallets}
                                    connectButton={{
                                        label: "Admin Login",
                                        className: connectButtonClass,
                                        style: {
                                            ...getConnectButtonStyle(),
                                            fontSize: "14px",
                                            padding: "10px 24px",
                                            backgroundColor: "rgba(255,255,255,0.05)",
                                            border: "1px solid rgba(255,255,255,0.1)",
                                            color: "white"
                                        }
                                    }}
                                    detailsButton={{
                                        displayBalanceToken: { [((chain as any)?.id ?? 8453)]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
                                    }}
                                    detailsModal={{
                                        payOptions: {
                                            buyWithFiat: {
                                                prefillSource: {
                                                    currency: "USD",
                                                },
                                            },
                                            prefillBuy: {
                                                chain: chain,
                                                token: {
                                                    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                                                    name: "USD Coin",
                                                    symbol: "USDC",
                                                },
                                            },
                                        },
                                    }}
                                    connectModal={{
                                        title: "Merchant Login",
                                        titleIcon: resolvedLogoUrl || "/favicon.ico",
                                        size: "compact",
                                        showThirdwebBranding: false
                                    }}
                                    theme={twTheme}
                                />
                            ) : (
                                <div className="h-[28px] flex items-center justify-center text-xs text-muted-foreground animate-pulse">
                                    Loading...
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
