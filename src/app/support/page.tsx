"use client";

import React from "react";
import Link from "next/link";
import { useBrand } from "@/contexts/BrandContext";
import { getEnv } from "@/lib/env";

export default function SupportPage() {
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

    // Dynamic contact email: partner uses their contactEmail, platform uses BasaltHQ
    const contactEmail = (() => {
        if (isPartnerContainer && (brand as any)?.contactEmail) {
            return (brand as any).contactEmail;
        }
        return "info@basalthq.com";
    })();

    return (
        <div className="space-y-10">
            {/* Hero */}
            <div className="space-y-4">
                <h1 className="text-4xl font-bold tracking-tight">How can we help?</h1>
                <p className="text-xl text-muted-foreground">
                    Explore our guides and documentation to get the most out of {displayBrandName}.
                </p>
                <div className="relative max-w-lg">
                    <input
                        type="text"
                        placeholder="Search for articles..."
                        className="w-full h-12 pl-10 pr-4 rounded-lg border bg-background focus:ring-2 focus:ring-primary/20 transition"
                    />
                    <svg
                        className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
            </div>

            {/* Categories */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Link href="/support/merchants" className="group block p-6 rounded-xl border bg-card hover:shadow-md transition">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4 group-hover:scale-110 transition">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                        </svg>
                    </div>
                    <h3 className="font-semibold text-lg mb-2">Merchants</h3>
                    <p className="text-sm text-muted-foreground">
                        Learn how to accept payments, manage orders, and configure your store settings.
                    </p>
                </Link>

                <Link href="/support/partners" className="group block p-6 rounded-xl border bg-card hover:shadow-md transition">
                    <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 mb-4 group-hover:scale-110 transition">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                    </div>
                    <h3 className="font-semibold text-lg mb-2">Partners</h3>
                    <p className="text-sm text-muted-foreground">
                        Guides for platform partners, plugin developers, and brand managers.
                    </p>
                </Link>

                <Link href="/support/developers" className="group block p-6 rounded-xl border bg-card hover:shadow-md transition">
                    <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4 group-hover:scale-110 transition">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                    </div>
                    <h3 className="font-semibold text-lg mb-2">Developers</h3>
                    <p className="text-sm text-muted-foreground">
                        API reference, SDK documentation, and integration tutorials.
                    </p>
                </Link>
            </div>

            {/* Contact Section */}
            <div id="contact" className="rounded-xl border bg-muted/30 p-8">
                <div className="flex flex-col md:flex-row gap-8 items-start">
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold mb-2">Still need help?</h2>
                        <p className="text-muted-foreground mb-6">
                            Our support team is available 24/7 to assist you with any issues or questions.
                        </p>
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-background border flex items-center justify-center shrink-0">
                                    <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <div className="text-sm">{contactEmail}</div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-background border flex items-center justify-center shrink-0">
                                    <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                </div>
                                <div className="text-sm">Live Chat (Available 9am - 5pm EST)</div>
                            </div>
                        </div>
                    </div>

                    <div className="w-full md:w-96 bg-background rounded-lg border p-6 shadow-sm">
                        <h3 className="font-semibold mb-4">Send us a message</h3>
                        <form className="space-y-4">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Email Address</label>
                                <input type="email" className="w-full h-9 px-3 rounded-md border text-sm" placeholder="you@example.com" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Subject</label>
                                <select className="w-full h-9 px-3 rounded-md border text-sm bg-background">
                                    <option>General Inquiry</option>
                                    <option>Technical Support</option>
                                    <option>Billing Issue</option>
                                    <option>Feature Request</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Message</label>
                                <textarea className="w-full h-24 px-3 py-2 rounded-md border text-sm" placeholder="How can we help you?" />
                            </div>
                            <button type="submit" className="w-full h-9 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition">
                                Send Message
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
