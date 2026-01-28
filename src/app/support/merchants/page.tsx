"use client";

import React from "react";
import { useBrand } from "@/contexts/BrandContext";
import { getEnv } from "@/lib/env";

export default function MerchantsSupportPage() {
    const brand = useBrand();
    const env = getEnv();
    const isPartnerContainer = String(env.CONTAINER_TYPE || "").toLowerCase() === "partner";

    // Dynamic brand name: partner uses their brand, platform uses BasaltSurge
    const displayBrandName = (() => {
        if (isPartnerContainer && brand?.name) {
            return brand.name;
        }
        return "BasaltSurge";
    })();

    return (
        <div className="space-y-8 max-w-3xl">
            <div>
                <h1 className="text-3xl font-bold tracking-tight mb-2">Merchant Guide</h1>
                <p className="text-lg text-muted-foreground">Everything you need to know about accepting payments and managing your store with {displayBrandName}.</p>
            </div>

            <div className="space-y-12">
                <section id="getting-started" className="space-y-4">
                    <h2 className="text-2xl font-bold border-b pb-2">Getting Started</h2>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                        <p>
                            Welcome to {displayBrandName}! As a merchant, you can accept crypto payments directly on your online store.
                            To get started, you'll need to configure your wallet and payment settings.
                        </p>
                        <ul className="list-disc pl-5 space-y-2 mt-4">
                            <li><strong>Connect Wallet:</strong> Link your business wallet to receive funds directly.</li>
                            <li><strong>Select Currencies:</strong> Choose which cryptocurrencies you want to accept (USDC, ETH, BTC, etc.).</li>
                            <li><strong>Set Pricing:</strong> Configure how crypto prices are calculated (real-time vs. fixed).</li>
                        </ul>
                    </div>
                </section>

                <section id="payments" className="space-y-4">
                    <h2 className="text-2xl font-bold border-b pb-2">Payments &amp; Payouts</h2>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                        <h3 className="text-lg font-semibold mt-4">Accepting Payments</h3>
                        <p>
                            When a customer checks out, they will see a &quot;Pay with Crypto&quot; button. Clicking this opens the {displayBrandName} payment modal,
                            where they can connect their wallet and complete the transaction.
                        </p>

                        <h3 className="text-lg font-semibold mt-6">Settlement</h3>
                        <p>
                            Funds are settled directly to your connected wallet. There is no holding period.
                            Network fees are paid by the customer.
                        </p>
                    </div>
                </section>

                <section id="orders" className="space-y-4">
                    <h2 className="text-2xl font-bold border-b pb-2">Order Management</h2>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                        <p>
                            Orders paid via {displayBrandName} are automatically synced with your e-commerce platform (Shopify, WooCommerce, etc.).
                        </p>
                        <div className="bg-muted/30 p-4 rounded-lg border mt-4">
                            <h4 className="font-semibold text-sm mb-2">Order Statuses</h4>
                            <ul className="space-y-2 text-sm">
                                <li className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                                    <span><strong>Pending:</strong> Payment detected but not yet confirmed on-chain.</span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                    <span><strong>Paid:</strong> Payment confirmed. Order is ready to ship.</span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                    <span><strong>Failed:</strong> Payment failed or timed out.</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
