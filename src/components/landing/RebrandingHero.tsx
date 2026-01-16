"use client";

import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

// --- Particle System Logic ---
class Particle {
    x: number;
    y: number;
    vx: number = 0;
    vy: number = 0;
    life: number;
    maxLife: number;
    color: string;
    size: number;
    type: "blue_spark" | "hot_spark" | "magma" | "ash" | "shockwave";

    constructor(w: number, h: number, type: "blue_spark" | "hot_spark" | "magma" | "ash" | "shockwave") {
        this.type = type;
        this.x = w / 2;
        this.y = h / 2;

        // Default physics
        const angle = Math.random() * Math.PI * 2;
        let speed = Math.random() * 2;

        if (type === "blue_spark") {
            this.x += (Math.random() - 0.5) * 300;
            this.y += (Math.random() - 0.5) * 300;
            this.color = `rgba(56, 189, 248, ${Math.random() * 0.5 + 0.5})`;
            this.size = Math.random() * 2;
            this.maxLife = 60;
        } else if (type === "hot_spark") {
            this.x += (Math.random() - 0.5) * 50; // Concentrated center
            this.y += (Math.random() - 0.5) * 50;
            speed = Math.random() * 5 + 2; // Faster
            this.color = `rgba(255, 255, 255, ${Math.random() * 0.8 + 0.2})`;
            this.size = Math.random() * 3;
            this.maxLife = 40;
        } else if (type === "magma") {
            // Explosive outward
            speed = Math.random() * 15 + 5; // Very fast
            this.color = `rgba(234, 88, 12, ${Math.random() * 0.9 + 0.1})`;
            this.size = Math.random() * 6 + 2;
            this.maxLife = 100;
        } else if (type === "shockwave") {
            this.size = 1; // Grows rapidly
            this.color = "rgba(255,255,255,0.8)";
            speed = 0;
            this.maxLife = 20;
        } else { // ash
            this.x = Math.random() * w;
            this.y = h + 10;
            speed = Math.random() * 1 + 0.5;
            const a = -Math.PI / 2 + (Math.random() - 0.5); // Upward
            this.vx = Math.cos(a) * speed;
            this.vy = Math.sin(a) * speed;
            this.color = `rgba(34, 197, 94, ${Math.random() * 0.4 + 0.1})`;
            this.size = Math.random() * 3;
            this.maxLife = 200;
            this.life = this.maxLife;
            return; // physics handled mostly in update
        }

        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = this.maxLife;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;

        if (this.type === "shockwave") {
            this.size += 15; // Expand ring
            this.life -= 2;
        } else if (this.type === "magma") {
            this.vx *= 0.95;
            this.vy *= 0.95;
            this.vy += 0.2; // Gravity
        } else if (this.type === "ash") {
            this.y -= 0.5; // Float up
            this.x += Math.sin(this.life * 0.05) * 0.5; // Weave
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        if (this.type === "shockwave") {
            ctx.strokeStyle = `rgba(255, 255, 255, ${this.life / this.maxLife})`;
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }
}

export interface RebrandingHeroProps {
    brandName?: string;
    logoUrl?: string;
    isPartner?: boolean;
}

export default function RebrandingHero({ brandName = "BasaltSurge", logoUrl = "/BasaltSurge.png", isPartner = false }: RebrandingHeroProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [stage, setStage] = useState<"blueprint" | "overheat" | "eruption" | "harden">("blueprint");
    const [isDismissed, setIsDismissed] = useState(false);

    // Cinematic Orchestration
    useEffect(() => {
        if (isPartner) {
            // Partners skip the drama, go straight to final state
            setStage("harden");
            const tDismiss = setTimeout(() => setIsDismissed(true), 15000); // Faster dismiss
            return () => clearTimeout(tDismiss);
        }

        // Basalt Cinematic Sequence
        const t1 = setTimeout(() => setStage("overheat"), 2500);
        const t2 = setTimeout(() => setStage("eruption"), 5000);
        const t3 = setTimeout(() => setStage("harden"), 5300); // 300ms explosion

        // Auto-dismiss "after a minute" (20s interactive time)
        const tDismiss = setTimeout(() => setIsDismissed(true), 25000);

        return () => {
            clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(tDismiss);
        };
    }, [isPartner]);

    // Canvas Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d", { alpha: true }); // optimize
        if (!ctx) return;

        let animationId: number;
        let particles: Particle[] = [];
        let frameCount = 0;

        const resize = () => {
            if (containerRef.current && canvas) {
                // Handle high DPI displays
                const dpr = window.devicePixelRatio || 1;
                const rect = containerRef.current.getBoundingClientRect();

                canvas.width = rect.width * dpr;
                canvas.height = rect.height * dpr;

                ctx.scale(dpr, dpr);
                canvas.style.width = `${rect.width}px`;
                canvas.style.height = `${rect.height}px`;
            }
        };

        window.addEventListener("resize", resize);
        resize();

        const loop = () => {
            frameCount++;
            const width = canvas.width / (window.devicePixelRatio || 1);
            const height = canvas.height / (window.devicePixelRatio || 1);

            ctx.clearRect(0, 0, width, height);

            // Dynamic Emitter based on stage
            // Partners get a gentle constant ambient effect
            if (isPartner) {
                if (Math.random() < 0.2) particles.push(new Particle(width, height, "blue_spark"));
            } else {
                if (stage === "blueprint") {
                    if (Math.random() < 0.3) particles.push(new Particle(width, height, "blue_spark"));
                } else if (stage === "overheat") {
                    // Intense central sparks
                    // Limit creation rate to avoid flooding
                    if (frameCount % 2 === 0) {
                        for (let i = 0; i < 4; i++) particles.push(new Particle(width, height, "hot_spark"));
                    }
                } else if (stage === "eruption") {
                    // EXPLOSION - Burst only occasionally or limit flow
                    if (frameCount % 3 === 0) {
                        for (let i = 0; i < 5; i++) particles.push(new Particle(width, height, "magma"));
                    }
                    if (Math.random() < 0.05) particles.push(new Particle(width, height, "shockwave"));
                } else if (stage === "harden") {
                    // Gentle floating ash
                    if (Math.random() < 0.3) particles.push(new Particle(width, height, "ash"));
                }
            }

            // Update & Draw
            // Use reverse loop for efficient splicing
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.update();
                p.draw(ctx);
                if (p.life <= 0) {
                    particles.splice(i, 1);
                }
            }

            // Limit total particles for safety
            if (particles.length > 400) {
                particles.splice(0, particles.length - 400);
            }

            animationId = requestAnimationFrame(loop);
        };

        loop();
        return () => {
            window.removeEventListener("resize", resize);
            cancelAnimationFrame(animationId);
        };
    }, [stage, isPartner]);

    return (
        <motion.div
            initial={{ height: "85vh", opacity: 1, marginBottom: "-5rem" }}
            animate={{
                height: isDismissed ? 0 : "85vh",
                opacity: isDismissed ? 0 : 1,
                // On dismiss, remove the negative margin so content flows naturally
                marginBottom: isDismissed ? 0 : "-5rem"
            }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} // smooth easeOutQuint-ish
            ref={containerRef}
            className="relative w-full overflow-hidden bg-black flex flex-col items-center justify-center isolate"
        >
            {/* 1. Cinematic Background Layer */}
            <motion.div
                className="absolute inset-0 z-0"
                animate={{
                    background: stage === "harden" || isPartner
                        ? "radial-gradient(circle at center, #022c22 0%, #000000 90%)"
                        : "radial-gradient(circle at center, #0f172a 0%, #000000 90%)"
                }}
                transition={{ duration: 1.5 }}
            />

            <div className="absolute inset-0 bg-[url('/smoke-texture.png')] opacity-20 bg-repeat animate-slide-slow z-0 mix-blend-overlay"></div>
            <canvas ref={canvasRef} className="absolute inset-0 z-10 pointer-events-none" />

            {/* 2. Main Content Layer */}
            <div className="relative z-20 flex flex-col items-center justify-center w-full h-full text-center px-4">

                <div className="relative w-full max-w-4xl h-[400px] flex items-center justify-center mb-0 md:mb-10">
                    <AnimatePresence mode="wait">

                        {/* Basalt-specific intro sequence (hidden for partners) */}
                        {!isPartner && (stage === "blueprint" || stage === "overheat") && (
                            <motion.div
                                key="blueprint"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={stage === "overheat" ? {
                                    scale: [1, 1.05, 0.95, 1.1, 1], // Violent shake
                                    filter: ["brightness(1)", "brightness(3)", "brightness(1)"],
                                    rotate: [0, -2, 2, -1, 1, 0]
                                } : { opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 3, filter: "blur(20px)" }}
                                transition={{ duration: stage === "overheat" ? 0.5 : 1 }}
                                className="relative flex flex-col items-center"
                            >
                                <div className="relative w-48 h-48 md:w-64 md:h-64">
                                    <Image src="/ppsymbol.png" alt="PortalPay" fill className="object-contain" priority />
                                    <motion.div
                                        className="absolute inset-0 border-4 border-blue-500/50 rounded-full"
                                        animate={{ scale: [1, 1.3], opacity: [0.8, 0], borderWidth: ["4px", "1px"] }}
                                        transition={{ duration: 1.5, repeat: Infinity }}
                                    />
                                </div>
                                <motion.div
                                    className="mt-8 text-blue-400 font-mono text-xs md:text-sm tracking-[0.3em] bg-blue-950/50 px-4 py-1 rounded backdrop-blur-sm"
                                    animate={stage === "overheat" ? { color: "#ef4444", backgroundColor: "#450a0a" } : {}}
                                >
                                    SYSTEM_INTEGRITY: {stage === "overheat" ? "CRITICAL FAILURE" : "STABLE"}
                                </motion.div>
                            </motion.div>
                        )}

                        {!isPartner && stage === "eruption" && (
                            <motion.div
                                key="flash"
                                className="absolute inset-0 bg-white z-50 pointer-events-none"
                                initial={{ opacity: 1 }}
                                animate={{ opacity: 0 }}
                                transition={{ duration: 1.5 }} // Longer fade out from white
                            />
                        )}

                        {/* Final Hardened State / Partner Default State */}
                        {(stage === "harden" || isPartner) && (
                            <motion.div
                                key="final"
                                initial={isPartner ? { opacity: 0, scale: 0.95 } : { opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 2, ease: "easeOut" }}
                                className="flex flex-col items-center w-full"
                            >
                                <div className="relative w-64 h-32 md:w-80 md:h-40 mb-8 md:mb-12">
                                    <Image
                                        src={logoUrl}
                                        alt={brandName}
                                        fill
                                        className="object-contain drop-shadow-[0_0_60px_rgba(34,197,94,0.8)]"
                                        priority
                                    />
                                </div>

                                <motion.div
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.5, duration: 1 }}
                                    className="relative"
                                >
                                    {/* Text Backdrop for Readability */}
                                    <div className="absolute inset-0 bg-black/40 blur-xl -z-10 rounded-full transform scale-150"></div>

                                    <h1 className="text-4xl md:text-7xl font-black tracking-tighter text-white mb-6 uppercase drop-shadow-2xl">
                                        The Future of <br />
                                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 filter drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]">
                                            Web3 Commerce
                                        </span>
                                    </h1>
                                    <p className="text-lg md:text-2xl text-emerald-50/90 font-medium max-w-xl mx-auto leading-relaxed drop-shadow-lg">
                                        Forging the next generation of payments.
                                    </p>
                                </motion.div>

                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 1.5 }}
                                    className="mt-8 md:mt-12"
                                >
                                    <button
                                        onClick={() => setIsDismissed(true)}
                                        className="px-8 md:px-10 py-3 md:py-4 bg-white text-black font-bold text-base md:text-lg rounded-full hover:bg-emerald-400 hover:scale-105 transition-all shadow-[0_0_30px_rgba(255,255,255,0.4)]"
                                    >
                                        Enter the New Era
                                    </button>
                                </motion.div>
                            </motion.div>
                        )}

                    </AnimatePresence>
                </div>
            </div>

            {/* Gradient Fade at bottom to blend with content initially */}
            <motion.div
                className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background via-background/80 to-transparent z-40 pointer-events-none"
                animate={{ opacity: isDismissed ? 0 : 1 }}
            />
        </motion.div>
    );
}
