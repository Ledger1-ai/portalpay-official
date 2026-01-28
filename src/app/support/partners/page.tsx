"use client";

import React from "react";
import { useBrand } from "@/contexts/BrandContext";
import { getEnv } from "@/lib/env";

export default function PartnersSupportPage() {
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
                <h1 className="text-3xl font-bold tracking-tight mb-2">Partner Program</h1>
                <p className="text-lg text-muted-foreground">Resources for platforms, agencies, and developers building on {displayBrandName}.</p>
            </div>

            <div className="space-y-12">
                <section id="overview" className="space-y-4">
                    <h2 className="text-2xl font-bold border-b pb-2">Program Overview</h2>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                        <p>
                            The {displayBrandName} Partner Program allows you to integrate our payment infrastructure into your platform
                            or offer it to your clients. Earn revenue share on every transaction processed through your integration.
                        </p>
                    </div>
                </section>

                <section id="integrations" className="space-y-4">
                    <h2 className="text-2xl font-bold border-b pb-2">Building Integrations</h2>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                        <p>
                            Partners can build custom plugins and integrations using our SDKs.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                            <div className="p-4 border rounded-lg">
                                <h3 className="font-semibold mb-2">Platform Plugins</h3>
                                <p className="text-sm text-muted-foreground">
                                    Build native integrations for platforms like Shopify, Wix, or custom SaaS solutions.
                                </p>
                            </div>
                            <div className="p-4 border rounded-lg">
                                <h3 className="font-semibold mb-2">White Label</h3>
                                <p className="text-sm text-muted-foreground">
                                    Customize the checkout experience with your own branding and UI components.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="brands" className="space-y-4">
                    <h2 className="text-2xl font-bold border-b pb-2">Managing Brands</h2>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                        <p>
                            As a partner, you can manage multiple merchant brands under a single account.
                        </p>
                        <ul className="list-disc pl-5 space-y-2 mt-4">
                            <li><strong>Brand Keys:</strong> Each merchant is assigned a unique `brandKey` for API isolation.</li>
                            <li><strong>Configuration:</strong> Configure payment settings, fees, and branding per merchant.</li>
                            <li><strong>Analytics:</strong> View aggregated volume and revenue across all your managed brands.</li>
                        </ul>
                    </div>
                </section>
            </div>
        </div>
    );
}
