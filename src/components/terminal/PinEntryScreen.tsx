"use client";

import React, { useState, useEffect } from "react";
import { ConnectButton } from "thirdweb/react";
import { client, chain, getWallets } from "@/lib/thirdweb/client";
import { usePortalThirdwebTheme, getConnectButtonStyle, connectButtonClass } from "@/lib/thirdweb/theme";

interface PinEntryScreenProps {
    merchantWallet: string;
    brandName?: string;
    logoUrl?: string;
    theme?: any;
    onPinSuccess: (session: any) => void;
    onAdminLogin: () => void; // Called when wallet connects successfully as admin
}

export default function PinEntryScreen({
    merchantWallet,
    brandName,
    logoUrl,
    theme,
    onPinSuccess,
    onAdminLogin
}: PinEntryScreenProps) {
    const [pin, setPin] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [wallets, setWallets] = useState<any[]>([]);
    const twTheme = usePortalThirdwebTheme();

    // Load wallets to ensure consistent SCA address generation
    useEffect(() => {
        let mounted = true;
        getWallets()
            .then((w) => { if (mounted) setWallets(w as any[]); })
            .catch(() => setWallets([]));
        return () => { mounted = false; };
    }, []);

    // Standard keypad digits
    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"];

    function handleDigit(d: string | number) {
        if (d === "⌫") {
            setPin(prev => prev.slice(0, -1));
            setError("");
        } else if (d !== "") {
            if (pin.length < 6) {
                setPin(prev => prev + d);
                setError("");
            }
        }
    }

    async function submitPin() {
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

            if (!res.ok) {
                throw new Error(data.error || "Invalid PIN");
            }

            onPinSuccess(data.session);
        } catch (e: any) {
            setError(e.message || "Authentication failed");
            setPin("");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background text-foreground">
            <div className="w-full max-w-sm space-y-8 animate-in fade-in zoom-in duration-300 glass-pane p-8 rounded-2xl border shadow-2xl">
                {/* Header */}
                <div className="text-center space-y-4">
                    {logoUrl && (
                        <div className="mx-auto w-24 h-24 bg-white/5 rounded-2xl flex items-center justify-center p-4 shadow-inner border border-white/10">
                            <img src={logoUrl} alt={brandName} className="w-full h-full object-contain drop-shadow-md" />
                        </div>
                    )}
                    <div>
                        <h1 className="text-2xl font-bold">{brandName || "Terminal Access"}</h1>
                        <p className="text-sm text-muted-foreground mt-1">Enter your staff PIN</p>
                    </div>
                </div>

                {/* PIN Display */}
                <div className="flex justify-center gap-4 mb-4">
                    {[0, 1, 2, 3, 4, 5].map(i => (
                        <div
                            key={i}
                            className={`w-4 h-4 rounded-full transition-all duration-200 shadow-sm ${i < pin.length
                                ? "scale-110 shadow-[0_0_10px_currentColor]"
                                : "bg-muted/20 border border-foreground/20"
                                }`}
                            style={i < pin.length ? { backgroundColor: theme?.primaryColor || "#000" } : {}}
                        />
                    ))}
                </div>

                {/* Keypad */}
                <div className="grid grid-cols-3 gap-3">
                    {digits.map((d, idx) => (
                        <button
                            key={idx}
                            onClick={() => handleDigit(d)}
                            disabled={d === "" || loading}
                            className={`h-16 rounded-xl text-2xl font-semibold transition-all active:scale-95 touch-manipulation select-none ${d === ""
                                ? "invisible"
                                : d === "⌫"
                                    ? "bg-transparent text-muted-foreground hover:bg-muted/10"
                                    : "bg-background/50 border shadow-sm hover:bg-muted/20 hover:border-primary/50"
                                }`}
                        >
                            {d}
                        </button>
                    ))}
                </div>

                {/* Login Button */}
                <button
                    onClick={submitPin}
                    disabled={pin.length < 4 || loading}
                    className="w-full py-4 rounded-xl font-bold text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 text-white"
                    style={{ backgroundColor: theme?.primaryColor || "#000" }}
                >
                    {loading ? "Verifying..." : "Login"}
                </button>

                {error && (
                    <div className="text-red-500 text-sm text-center font-medium bg-red-500/10 py-2 rounded-lg border border-red-500/20 shake">
                        {error}
                    </div>
                )}

                {/* Merchant/Admin Login */}
                <div className="pt-6 text-center border-t border-dashed border-white/10">
                    <p className="text-xs text-muted-foreground mb-4 uppercase tracking-wider font-semibold">
                        Merchant Access
                    </p>
                    <div className="flex justify-center invert-0">
                        {wallets.length > 0 ? (
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
                                        border: "1px solid rgba(255,255,255,0.1)"
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
                                    titleIcon: logoUrl || "/Surge.png",
                                    size: "compact",
                                    showThirdwebBranding: false
                                }}
                                theme={twTheme}
                            />
                        ) : (
                            <div className="h-[44px] flex items-center justify-center text-xs text-muted-foreground animate-pulse">
                                Loading login options...
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
