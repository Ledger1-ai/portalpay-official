"use client";

import React, { useRef, useMemo } from "react";
import { motion, useInView } from "framer-motion";

export default function PublisherOsirisSection() {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: false, margin: "-100px" });

    // Generate particles for the flow animation
    const particles = useMemo(() => Array.from({ length: 20 }), []);

    return (
        <div ref={ref} className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">

            {/* 1. Text Content */}
            <div className="relative z-10">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={isInView ? { opacity: 1, x: 0 } : {}}
                    transition={{ duration: 0.8 }}
                >
                    <div className="flex items-center gap-3 mb-6">
                        <span className="px-3 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full text-xs font-mono tracking-widest uppercase">
                            New · Industry Pack
                        </span>
                        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full text-xs font-mono tracking-widest uppercase">
                            Osiris USBN
                        </span>
                    </div>

                    <h2 className="text-3xl md:text-4xl font-bold mb-4 leading-tight">
                        Publish Onchain. <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">
                            Keep 99.5%
                        </span> of Earnings.
                    </h2>

                    <p className="text-muted-foreground mb-6 leading-relaxed text-sm md:text-base">
                        Stop donating 65% of your royalties to legacy platforms.
                        <strong className="text-foreground"> Osiris USBN</strong> replaces the expensive ISBN standard ($250/book)
                        with an onchain identifier costing just <strong>$0.002</strong>.
                    </p>

                    <ul className="space-y-3 mb-8">
                        {[
                            "Replaces ISBN ($250) with USBN ($0.002)",
                            "Gas-Sponsored Deployment (Zero Cost)",
                            "Retain 99.5% Revenue vs 35%",
                            "Direct-to-Reader Ownership",
                            "Programmable Royalties on Resale"
                        ].map((item, i) => (
                            <motion.li
                                key={i}
                                initial={{ opacity: 0, y: 10 }}
                                animate={isInView ? { opacity: 1, y: 0 } : {}}
                                transition={{ delay: 0.2 + i * 0.1 }}
                                className="flex items-center gap-3 text-sm text-foreground/80"
                            >
                                <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                    <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                {item.includes("($0.002)") || item.includes("99.5%") ? (
                                    <span className="font-semibold text-foreground">{item}</span>
                                ) : item}
                            </motion.li>
                        ))}
                    </ul>

                    <div className="mt-8 p-4 rounded-lg bg-zinc-900/50 border border-zinc-800">
                        <p className="text-xs text-zinc-400 leading-relaxed">
                            <strong className="text-zinc-200">How to start:</strong> To start publishing, activate the <span className="text-amber-500">Publisher Pack</span> in the Shop Config, then head to the <span className="text-emerald-400">Writer&apos;s Workshop</span> panel in the Apps section of the Admin module.
                        </p>
                    </div>
                </motion.div>
            </div>

            {/* 2. Spectacular Animation */}
            <div className="relative h-[500px] bg-zinc-900/50 rounded-2xl border border-white/10 p-8 flex flex-col justify-between overflow-hidden group">
                {/* Background Grid */}
                <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>

                {/* VISUAL: LEGACY vs OSIRIS */}
                <div className="relative z-10 h-full flex flex-col gap-8">

                    {/* A. LEGACY MODEL */}
                    <div className="h-1/2 relative bg-zinc-950/50 rounded-xl border border-red-900/30 border-dashed p-4 flex items-center">
                        <div className="absolute top-2 left-4 text-xs font-mono text-red-500/50 uppercase">Legacy (Amazon)</div>

                        {/* Source */}
                        <div className="w-16 h-16 rounded-lg bg-zinc-800 flex items-center justify-center border border-zinc-700">
                            <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                        </div>

                        {/* Path - Choked */}
                        <div className="flex-1 h-3 mx-4 bg-zinc-800 rounded-full relative overflow-hidden">
                            {particles.map((_, i) => (
                                <motion.div
                                    key={i}
                                    className="absolute top-0 bottom-0 w-8 bg-red-500/50 rounded-full blur-[2px]"
                                    initial={{ left: "-10%" }}
                                    animate={{ left: "60%" }} // Gets stuck at the wall
                                    transition={{
                                        duration: 2,
                                        repeat: Infinity,
                                        ease: "linear",
                                        delay: i * 0.1
                                    }}
                                    style={{ height: "100%" }}
                                />
                            ))}
                        </div>

                        {/* The Wall (35%) */}
                        <div className="w-4 h-24 bg-red-900/80 rounded flex items-center justify-center relative shadow-[0_0_20px_rgba(220,38,38,0.4)]">
                            <span className="absolute -top-6 text-red-500 font-bold text-xs uppercase tracking-wider">Fees</span>
                        </div>

                        {/* Destination - Trickle */}
                        <div className="w-16 h-16 ml-4 bg-zinc-800 rounded-full flex flex-col items-center justify-center border border-zinc-700 opacity-50">
                            <span className="text-xs text-zinc-400">You Get</span>
                            <span className="text-lg font-bold text-red-400">35%</span>
                        </div>
                    </div>

                    {/* B. OSIRIS MODEL */}
                    <div className="h-1/2 relative bg-emerald-950/10 rounded-xl border border-emerald-500/30 p-4 flex items-center shadow-[0_0_50px_rgba(16,185,129,0.1)]">
                        <div className="absolute top-2 left-4 text-xs font-mono text-emerald-500/50 uppercase">BasaltSurge + OsirisUSBN</div>

                        {/* Source */}
                        <div className="w-16 h-16 rounded-lg bg-emerald-900/20 flex items-center justify-center border border-emerald-500/50 relative">
                            <motion.div
                                className="absolute inset-0 bg-emerald-500/20 blur-lg"
                                animate={{ opacity: [0.5, 1, 0.5] }}
                                transition={{ duration: 2, repeat: Infinity }}
                            />
                            <svg className="w-8 h-8 text-emerald-400 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>

                        {/* Path - Superconductor */}
                        <div className="flex-1 h-8 mx-4 bg-emerald-950/50 rounded-full relative overflow-hidden border border-emerald-500/20">
                            {/* Flowing Energy */}
                            {particles.map((_, i) => (
                                <motion.div
                                    key={i}
                                    className="absolute top-2 h-4 w-12 bg-amber-400 rounded-full blur-[2px] shadow-[0_0_10px_rgba(251,191,36,0.8)]"
                                    initial={{ left: "-20%" }}
                                    animate={{ left: "120%" }} // Flows all the way through
                                    transition={{
                                        duration: 1.5,
                                        repeat: Infinity,
                                        ease: "linear",
                                        delay: i * 0.08
                                    }}
                                />
                            ))}
                        </div>

                        {/* No Wall - Just Gas Sponsorship Shield */}
                        <motion.div
                            className="w-8 h-8 mr-4 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-400/50"
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                        >
                            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </motion.div>

                        {/* Destination - Full Revenue */}
                        <div className="w-20 h-20 bg-amber-500/10 rounded-full flex flex-col items-center justify-center border border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.2)]">
                            <span className="text-xs text-amber-200">You Get</span>
                            <span className="text-2xl font-black text-amber-400">99.5%</span>
                        </div>
                    </div>

                </div>

                {/* Decorative Elements */}
                <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-amber-500/10 rounded-full blur-[100px] pointer-events-none"></div>
                <div className="absolute -top-20 -left-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none"></div>
            </div>
        </div>
    );
}
