"use client";

import React from "react";
import { motion } from "framer-motion";

const plugins = [
    {
        name: "WooCommerce",
        description: "Native plugin for WordPress stores. Accept crypto in minutes.",
        color: "#96588a",
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                <path d="M12.82 17.96c-.66.19-2.02.16-2.55-.38-.45-.48-.06-1.58.19-2.09.28-.58.33-.87.33-.87s.17-1.45-.63-1.6c-.66-.12-1.28.69-1.54 1.13-.5.85-.35 1.54-.35 1.54s-.48 2.05-2.22 1.68c-1.34-.28-1.53-2.19-1.53-2.19s-.48-4.22 2.37-6.04c2.61-1.67 5.75-.41 5.75-.41s3.78 1.54 3.73 5.4c-.03 2.15-1.4 3.44-3.55 3.83" />
            </svg>
        ) // Simplified Woo shape
    },
    {
        name: "Shopify",
        description: "Headless checkout integration for Shopify Plus merchants.",
        color: "#96bf48",
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                <path d="M20.2 7.7l-3.3-3.4c-.5-.5-1.3-.6-1.9-.2l-5.6 3.8-3.3-2.3c-.5-.4-1.2-.3-1.6.2l-3.1 3.5c-.4.5-.4 1.2 0 1.7l8.2 8.3c.4.4 1 .4 1.4 0l8.2-8.3c.4-.5.4-1.2 0-1.7zm-8.8 8.1l-6.3-6.4 1.8-2 2.1 1.4c.5.4 1.2.3 1.6-.2l4.6-3.1 4.5 4.6-8.3 5.7z" />
            </svg>
        ) // Bag-like shape
    },
    {
        name: "Uber Eats",
        description: "Seamless crypto payments for food delivery and takeout.",
        color: "#06C167",
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                <path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z" />
            </svg>
        ) // Fork and Knife
    },
    {
        name: "PrestaShop",
        description: "Open source module for European commerce leaders.",
        color: "#df0067",
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                <path d="M11.6,2.2c-0.2,0.1-4.7,6.8-4.7,6.8s-3.7,5.5-3.7,5.5C2.7,15.2,2,16.2,2,16.2c-0.2,0.5-0.1,1.1,0.2,1.5 c0.4,0.4,0.9,0.5,1.4,0.4c0,0,11.5-3.3,11.5-3.3l5.8-1.7c0.5-0.1,0.9-0.5,0.9-1.1c0-0.5-0.3-1-0.8-1.2c0,0-5.4-1.9-5.4-1.9 L11.6,2.2z" />
            </svg>
        ) // Puffin-ish abstract
    },
    {
        name: "Wix",
        description: "Seamless checkout for Wix eCommerce sites.",
        color: "#0c6adc",
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-3-7h2l2 4.5L14 8h2l-3 9h-2z" />
            </svg>
        ) // Text-like
    },
    {
        name: "API & SDKs",
        description: "Build custom flows with our TS, Python, and Go libraries.",
        color: "#fff",
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-5 14H9v-2h6v2zm0-5H9v-2h6v2zm0-5H9V6h6v2z" />
            </svg>
        )
    }
];

export default function PluginsSection() {
    return (
        <section className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
                Connect Anywhere. <br className="md:hidden" />
                <span className="text-zinc-500">We speak your language.</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {plugins.map((plugin, i) => (
                    <motion.div
                        key={plugin.name}
                        whileHover={{ y: -5 }}
                        className="glass-pane p-6 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-colors group"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div
                                className="w-12 h-12 rounded-lg flex items-center justify-center bg-zinc-900 border border-zinc-800 group-hover:bg-zinc-800 transition-colors"
                                style={{ color: plugin.color }}
                            >
                                {plugin.icon}
                            </div>
                            <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider py-1 px-2 rounded bg-zinc-900/50">
                                v2.0
                            </div>
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2">{plugin.name}</h3>
                        <p className="text-sm text-zinc-400 leading-relaxed">
                            {plugin.description}
                        </p>
                    </motion.div>
                ))}
            </div>

            <div className="mt-8 text-center text-sm text-zinc-500">
                Don&apos;t see your platform? <span className="text-emerald-500 cursor-pointer hover:underline">View the API Docs</span> to build a custom integration.
            </div>
        </section>
    );
}
