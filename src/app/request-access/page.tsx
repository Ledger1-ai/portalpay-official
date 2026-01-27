"use client";

import React, { useState, useEffect } from "react";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { client, chain, getWallets } from "@/lib/thirdweb/client";
import { usePortalThirdwebTheme, connectButtonClass, getConnectButtonStyle } from "@/lib/thirdweb/theme";
import { useBrand } from "@/contexts/BrandContext";

export default function RequestAccessPage() {
    const brand = useBrand();
    const account = useActiveAccount();
    const twTheme = usePortalThirdwebTheme();

    const [wallets, setWallets] = useState<any[]>([]);
    const [mounted, setMounted] = useState(false);

    const [shopName, setShopName] = useState("");
    const [logoUrl, setLogoUrl] = useState("");
    const [primaryColor, setPrimaryColor] = useState("#0ea5e9");
    const [notes, setNotes] = useState("");

    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState("");
    const [existingRequest, setExistingRequest] = useState<{ status: string } | null>(null);

    useEffect(() => {
        setMounted(true);
        getWallets().then(setWallets);
    }, []);

    // Check if user already has a pending request
    useEffect(() => {
        if (!account?.address) return;

        (async () => {
            try {
                const res = await fetch("/api/partner/client-requests?status=pending", {
                    headers: { "x-wallet": account.address }
                });
                const data = await res.json();
                const myRequest = data?.requests?.find((r: any) =>
                    r.wallet?.toLowerCase() === account.address?.toLowerCase()
                );
                if (myRequest) {
                    setExistingRequest({ status: myRequest.status });
                }
            } catch { }
        })();
    }, [account?.address]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!account?.address) {
            setError("Please connect your wallet first.");
            return;
        }

        if (!shopName.trim()) {
            setError("Shop name is required.");
            return;
        }

        setSubmitting(true);
        setError("");

        try {
            const res = await fetch("/api/partner/client-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    shopName: shopName.trim(),
                    logoUrl: logoUrl.trim() || undefined,
                    primaryColor: primaryColor || undefined,
                    notes: notes.trim() || undefined
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.message || data?.error || "Submission failed");
            }

            setSubmitted(true);
        } catch (e: any) {
            setError(e?.message || "Failed to submit request");
        } finally {
            setSubmitting(false);
        }
    }

    const brandColor = brand?.colors?.primary || "#0ea5e9";
    const brandName = brand?.name || "Partner";

    // Already submitted
    if (submitted || existingRequest) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-black">
                <div className="max-w-md w-full bg-[#0f0f12] border border-white/10 rounded-2xl p-8 text-center space-y-4">
                    <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style={{ backgroundColor: `${brandColor}20` }}>
                        <svg className="w-8 h-8" style={{ color: brandColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-white">Request Pending</h1>
                    <p className="text-gray-400">
                        Your access request has been submitted to {brandName}. You will be notified once it is reviewed.
                    </p>
                    <p className="text-sm text-gray-500">
                        This usually takes 1-2 business days.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-black">
            <div className="max-w-lg w-full bg-[#0f0f12] border border-white/10 rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-white/10 text-center">
                    <h1 className="text-2xl font-bold text-white">Request Access</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Join {brandName}'s payment platform
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Wallet Connection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            1. Connect Your Wallet
                        </label>
                        {mounted && wallets.length > 0 ? (
                            <ConnectButton
                                client={client}
                                chain={chain}
                                wallets={wallets}
                                connectButton={{
                                    label: account ? `${account.address.slice(0, 6)}...${account.address.slice(-4)}` : "Connect Wallet",
                                    className: connectButtonClass,
                                    style: {
                                        ...getConnectButtonStyle(),
                                        width: "100%",
                                        justifyContent: "center"
                                    }
                                }}
                                theme={twTheme}
                            />
                        ) : (
                            <div className="h-10 bg-white/5 rounded-lg animate-pulse" />
                        )}
                        {account && (
                            <p className="text-xs text-green-500 mt-1">✓ Wallet connected</p>
                        )}
                    </div>

                    {/* Shop Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            2. Shop Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={shopName}
                            onChange={(e) => setShopName(e.target.value)}
                            placeholder="Your Business Name"
                            className="w-full h-11 px-4 rounded-lg border border-white/10 bg-white/5 text-white placeholder-gray-500 focus:border-white/30 focus:outline-none"
                            required
                        />
                    </div>

                    {/* Logo URL */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            3. Logo URL <span className="text-gray-600">(optional)</span>
                        </label>
                        <input
                            type="url"
                            value={logoUrl}
                            onChange={(e) => setLogoUrl(e.target.value)}
                            placeholder="https://example.com/logo.png"
                            className="w-full h-11 px-4 rounded-lg border border-white/10 bg-white/5 text-white placeholder-gray-500 focus:border-white/30 focus:outline-none"
                        />
                        {logoUrl && (
                            <div className="mt-2 p-2 bg-white/5 rounded-lg inline-block">
                                <img src={logoUrl} alt="Preview" className="h-12 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                            </div>
                        )}
                    </div>

                    {/* Primary Color */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            4. Brand Color <span className="text-gray-600">(optional)</span>
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                type="color"
                                value={primaryColor}
                                onChange={(e) => setPrimaryColor(e.target.value)}
                                className="w-12 h-12 rounded-lg border border-white/10 bg-transparent cursor-pointer"
                            />
                            <input
                                type="text"
                                value={primaryColor}
                                onChange={(e) => setPrimaryColor(e.target.value)}
                                className="flex-1 h-11 px-4 rounded-lg border border-white/10 bg-white/5 text-white font-mono"
                            />
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            5. Additional Notes <span className="text-gray-600">(optional)</span>
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Tell us about your business..."
                            rows={3}
                            maxLength={500}
                            className="w-full px-4 py-3 rounded-lg border border-white/10 bg-white/5 text-white placeholder-gray-500 focus:border-white/30 focus:outline-none resize-none"
                        />
                        <p className="text-xs text-gray-600 mt-1">{notes.length}/500</p>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={submitting || !account}
                        className="w-full h-12 rounded-xl text-white font-semibold disabled:opacity-50 transition-all hover:brightness-110"
                        style={{ backgroundColor: brandColor }}
                    >
                        {submitting ? "Submitting..." : "Submit Request"}
                    </button>
                </form>

                {/* Footer */}
                <div className="p-4 border-t border-white/10 text-center">
                    <p className="text-xs text-gray-600">
                        By submitting, you agree to {brandName}'s terms of service.
                    </p>
                </div>
            </div>
        </div>
    );
}
