"use client";

import React from "react";
import { useBrand } from "@/contexts/BrandContext";
import { getEnv } from "@/lib/env";

export default function DevelopersSupportPage() {
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

    // Dynamic signature header: uses brand key for partner, BasaltSurge for platform
    const signatureHeader = isPartnerContainer && brand?.key
        ? `X-${brand.key.charAt(0).toUpperCase() + brand.key.slice(1)}-Signature`
        : "X-BasaltSurge-Signature";

    return (
        <div className="space-y-8 max-w-3xl">
            <div>
                <h1 className="text-3xl font-bold tracking-tight mb-2">Developer Resources</h1>
                <p className="text-lg text-muted-foreground">Technical documentation for the {displayBrandName} API and SDKs.</p>
            </div>

            <div className="space-y-12">
                <section id="api-reference" className="space-y-4">
                    <h2 className="text-2xl font-bold border-b pb-2">API Reference</h2>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                        <p>
                            Our REST API allows you to create charges, manage customers, and retrieve transaction data programmatically.
                        </p>
                        <div className="bg-slate-950 text-slate-50 p-4 rounded-lg font-mono text-sm mt-4 overflow-x-auto">
                            <div>// Example: Create a Charge</div>
                            <div className="text-blue-400">POST /api/v1/charges</div>
                            <div>{`{`}</div>
                            <div className="pl-4"><span className="text-purple-400">&quot;amount&quot;</span>: <span className="text-green-400">100.00</span>,</div>
                            <div className="pl-4"><span className="text-purple-400">&quot;currency&quot;</span>: <span className="text-green-400">&quot;USD&quot;</span>,</div>
                            <div className="pl-4"><span className="text-purple-400">&quot;description&quot;</span>: <span className="text-green-400">&quot;Order #1234&quot;</span></div>
                            <div>{`}`}</div>
                        </div>
                    </div>
                </section>

                <section id="webhooks" className="space-y-4">
                    <h2 className="text-2xl font-bold border-b pb-2">Webhooks</h2>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                        <p>
                            Listen for real-time events to update your database when payments are completed or failed.
                        </p>
                        <table className="w-full mt-4 text-sm text-left">
                            <thead className="border-b font-medium">
                                <tr>
                                    <th className="py-2">Event</th>
                                    <th className="py-2">Description</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                <tr>
                                    <td className="py-2 font-mono text-blue-600">charge.succeeded</td>
                                    <td className="py-2">Payment was successfully confirmed on the blockchain.</td>
                                </tr>
                                <tr>
                                    <td className="py-2 font-mono text-blue-600">charge.failed</td>
                                    <td className="py-2">Payment failed or expired.</td>
                                </tr>
                                <tr>
                                    <td className="py-2 font-mono text-blue-600">payout.created</td>
                                    <td className="py-2">A payout to your connected wallet was initiated.</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                <section id="security" className="space-y-4">
                    <h2 className="text-2xl font-bold border-b pb-2">Security</h2>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                        <p>
                            Ensure your integration is secure by following these best practices.
                        </p>
                        <ul className="list-disc pl-5 space-y-2 mt-4">
                            <li><strong>Verify Signatures:</strong> Always verify the <code>{signatureHeader}</code> header on webhook requests.</li>
                            <li><strong>API Keys:</strong> Keep your Secret Keys server-side. Never expose them in client-side code.</li>
                            <li><strong>Idempotency:</strong> Use idempotency keys to prevent duplicate charges during network retries.</li>
                        </ul>
                    </div>
                </section>
            </div>
        </div>
    );
}
