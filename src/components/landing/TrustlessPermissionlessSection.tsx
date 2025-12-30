"use client";

import React from "react";
import { motion } from "framer-motion";

export default function TrustlessPermissionlessSection() {
    return (
        <section className="mb-16 relative overflow-hidden">
            {/* Background Atmosphere */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-900/10 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-900/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-stretch">

                {/* TRUSTLESS */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    className="glass-pane rounded-2xl border border-zinc-800 p-8 relative overflow-hidden group"
                >
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                        <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
                        </svg>
                    </div>

                    <div className="relative z-10">
                        <div className="w-12 h-12 mb-6 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                        </div>

                        <h2 className="text-2xl font-bold text-white mb-4">Trustless.</h2>
                        <h3 className="text-lg text-blue-400 font-mono mb-6">"Don't Verify. Validate."</h3>

                        <p className="text-zinc-400 leading-relaxed mb-6">
                            In traditional finance, you trust the bank not to freeze your funds. In BasaltSurge, you trust code.
                            Smart contracts execute exactly as written. No middleman, no bias, no "pending approval".
                        </p>

                        <ul className="space-y-2 text-sm text-zinc-300">
                            <li className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                Settlement is guaranteed by the blockchain.
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                Revenue splits are automated and immutable.
                            </li>
                        </ul>
                    </div>
                </motion.div>

                {/* PERMISSIONLESS */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    className="glass-pane rounded-2xl border border-zinc-800 p-8 relative overflow-hidden group"
                >
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                        <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
                        </svg>
                    </div>

                    <div className="relative z-10">
                        <div className="w-12 h-12 mb-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>

                        <h2 className="text-2xl font-bold text-white mb-4">Permissionless.</h2>
                        <h3 className="text-lg text-emerald-400 font-mono mb-6">"Open to Everyone."</h3>

                        <p className="text-zinc-400 leading-relaxed mb-6">
                            No applications. No credit checks. No geo-blocking. BasaltSurge is open software that anyone can use.
                            Whether you're a coffee shop in Seattle or a digital artist in Seoul, the network is open 24/7.
                        </p>

                        <ul className="space-y-2 text-sm text-zinc-300">
                            <li className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                No paperwork or bank approval needed.
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Retain full custody of your funds.
                            </li>
                        </ul>
                    </div>
                </motion.div>

            </div>
        </section>
    );
}
