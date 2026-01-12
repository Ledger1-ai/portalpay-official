"use client";

import React from "react";
import { motion } from "framer-motion";
import { Bot, Zap, Network, Globe, ArrowRight, Sparkles, Store, Wallet } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";

export function AgenticPaymentsSection() {
    // 1. Get Brand Context
    const brand = useBrand();
    const brandName = brand?.name || "BasaltSurge";
    const primaryColor = brand?.colors?.primary || "#35ff7c"; // Default to Basalt Green if missing

    // Flow Steps Data
    const flowSteps = [
        {
            icon: <Bot className="w-6 h-6" />,
            title: "1. Agent Discovery",
            desc: "AI discovers your inventory via standardized llms.txt & UCP feeds."
        },
        {
            icon: <Wallet className="w-6 h-6" />,
            title: "2. Native Checkout",
            desc: "Agent builds a cart and initiates a session without human UI."
        },
        {
            icon: <Zap className="w-6 h-6" />,
            title: "3. Instant Settlement",
            desc: "Payment logic handles the 402 challenge, settling in seconds."
        }
    ];

    return (
        <section className="mb-36 relative overflow-hidden" id="agentic-commerce">
            {/* Background Atmosphere - Centered behind the title */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                    className="w-[800px] h-[800px] rounded-full blur-[150px] opacity-10"
                    style={{ backgroundColor: primaryColor }}
                />
            </div>

            {/* Header */}
            <div className="text-center mb-16 max-w-4xl mx-auto px-4 relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono mb-6 backdrop-blur-md"
                    style={{ color: primaryColor, borderColor: `${primaryColor}33` }}
                >
                    <Bot className="w-3 h-3" />
                    <span>AGENT_NATIVE_COMMERCE</span>
                </motion.div>

                <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-6">
                    Built for the <br />
                    <span
                        className="bg-clip-text text-transparent bg-gradient-to-r from-white"
                        style={{ backgroundImage: `linear-gradient(to right, #fff, ${primaryColor})` }}
                    >
                        Machine Economy.
                    </span>
                </h2>

                <p className="text-lg text-zinc-400 leading-relaxed max-w-2xl mx-auto">
                    Future-proof your business by actively selling to AI agents today.
                    {brandName} is the <strong>first platform in the world</strong> to unify Google's UCP and the x402 standard into a single, seamless layer.
                </p>
            </div>

            {/* Main Feature Grids */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-stretch relative z-10 mb-20">
                {/* UCP Card */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    className="glass-pane rounded-3xl border border-zinc-800 p-8 md:p-10 relative overflow-hidden group hover:border-indigo-500/30 transition-all duration-500"
                >
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity duration-500">
                        <Network className="w-48 h-48 text-indigo-500" />
                    </div>
                    <div className="relative z-10 flex flex-col h-full">
                        <div className="w-14 h-14 mb-8 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-[0_0_30px_rgba(99,102,241,0.2)]">
                            <Globe className="w-7 h-7" />
                        </div>
                        <h2 className="text-3xl font-bold text-white mb-2">Universal Access.</h2>
                        <h3 className="text-lg text-indigo-400 font-mono mb-8">"Standardized Discovery."</h3>
                        <p className="text-zinc-400 leading-relaxed mb-6">
                            Your store is automatically broadcast to Google's <strong>Universal Commerce Protocol (UCP)</strong>.
                            This creates a standardized "shopping interface" for AI models, allowing them to browse, filter, and cart items
                            without fragile web scraping.
                        </p>
                        <ul className="space-y-3 pt-6 border-t border-white/5 text-sm text-zinc-300 font-medium">
                            <li className="flex items-center gap-3">
                                <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_#6366f1]" />
                                Full UCP <code className="text-xs text-indigo-400 font-mono">checkout-sessions</code> API.
                            </li>
                            <li className="flex items-center gap-3">
                                <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_#6366f1]" />
                                Auto-generated markdown inventory feeds.
                            </li>
                        </ul>
                    </div>
                </motion.div>

                {/* x402 Card */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    className="glass-pane rounded-3xl border border-zinc-800 p-8 md:p-10 relative overflow-hidden group hover:border-purple-500/30 transition-all duration-500"
                >
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity duration-500">
                        <Zap className="w-48 h-48 text-purple-500" />
                    </div>
                    <div className="relative z-10 flex flex-col h-full">
                        <div className="w-14 h-14 mb-8 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shadow-[0_0_30px_rgba(168,85,247,0.2)]">
                            <Zap className="w-7 h-7" />
                        </div>
                        <h2 className="text-3xl font-bold text-white mb-2">Instant Settlement.</h2>
                        <h3 className="text-lg text-purple-400 font-mono mb-8">"Native Agent Payments."</h3>
                        <p className="text-zinc-400 leading-relaxed mb-6">
                            Support for the <strong>x402</strong> standard means agents pay immediately using crypto wallets.
                            When an agent hits a 402 error, it facilitates an instant, on-chain settlement negotiation—no credit cards required.
                        </p>
                        <ul className="space-y-3 pt-6 border-t border-white/5 text-sm text-zinc-300 font-medium">
                            <li className="flex items-center gap-3">
                                <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_10px_#a855f7]" />
                                Zero-click autonomous transactions.
                            </li>
                            <li className="flex items-center gap-3">
                                <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_10px_#a855f7]" />
                                Real-time revenue splitting & settlement.
                            </li>
                        </ul>
                    </div>
                </motion.div>
            </div>

            {/* Visual Flow Section */}
            <div className="relative mb-20">
                <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-zinc-700 to-transparent transform -translate-y-1/2 md:block hidden" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
                    {flowSteps.map((step, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1 }}
                            className="bg-black border border-zinc-800 rounded-xl p-6 text-center relative group hover:border-zinc-700 transition-colors"
                        >
                            <div
                                className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center border transition-all duration-300 group-hover:scale-110"
                                style={{
                                    borderColor: `${primaryColor}40`,
                                    backgroundColor: `${primaryColor}10`,
                                    color: primaryColor
                                }}
                            >
                                {step.icon}
                            </div>
                            <h4 className="text-white font-bold mb-2">{step.title}</h4>
                            <p className="text-sm text-zinc-500">{step.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* SME Empowerment / Global Reach Message */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-pane border border-zinc-800 rounded-2xl p-8 md:p-12 text-center relative overflow-hidden"
            >
                {/* Shine effect */}
                <div className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 group-hover:animate-shine pointer-events-none" />

                <div className="relative z-10 max-w-3xl mx-auto space-y-6">
                    <div className="inline-flex flex-col items-center">
                        <div className="p-3 bg-white/5 rounded-full mb-4 ring-1 ring-white/10">
                            <Store className="w-6 h-6 text-white" />
                        </div>
                        <h3 className="text-2xl md:text-3xl font-bold text-white">
                            Empowering SMEs Globally.
                        </h3>
                    </div>

                    <p className="text-lg text-zinc-400">
                        For the first time, a small coffee shop in Seattle or a digital artist in Seoul can act as a
                        <strong> headless node</strong> in the global AI supply chain.
                        We level the playing field, allowing anyone to serve the next billion autonomous users
                        without expensive enterprise infrastructure.
                    </p>

                    <div className="pt-4 flex flex-wrap justify-center gap-4 text-sm font-medium text-zinc-500">
                        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800">
                            <Sparkles className="w-3 h-3 text-yellow-500" /> First of its Kind
                        </span>
                        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800">
                            <Globe className="w-3 h-3 text-blue-500" /> Global Reach
                        </span>
                        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800">
                            <Zap className="w-3 h-3 text-purple-500" /> Zero Friction
                        </span>
                    </div>
                </div>
            </motion.div>

        </section>
    );
}
