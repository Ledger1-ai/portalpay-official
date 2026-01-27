"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
const ConnectButton = dynamic(() => import("thirdweb/react").then((m) => m.ConnectButton), { ssr: false });
import { client, chain, getWallets } from "@/lib/thirdweb/client";
import { usePortalThirdwebTheme, getConnectButtonStyle, connectButtonClass } from "@/lib/thirdweb/theme";
import { useBrand } from "@/contexts/BrandContext";

interface SignupWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onComplete: () => void;
}

const WIZARD_STEPS = [
    {
        id: "welcome",
        title: "Welcome to BasaltSurge",
        subtitle: "The Future of Web3 Commerce",
        content: (
            <div className="space-y-4">
                <p className="text-sm text-gray-300 leading-relaxed">
                    BasaltSurge is a <span className="text-emerald-400 font-semibold">trustless, permissionless</span> payment infrastructure
                    that enables businesses to accept cryptocurrency and card payments with instant settlement.
                </p>
                <div className="grid grid-cols-3 gap-2 mt-6">
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                        <div className="text-xl mb-1">⚡</div>
                        <div className="text-[10px] font-mono text-gray-400 uppercase">Instant</div>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                        <div className="text-xl mb-1">🔒</div>
                        <div className="text-[10px] font-mono text-gray-400 uppercase">Secure</div>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                        <div className="text-xl mb-1">💎</div>
                        <div className="text-[10px] font-mono text-gray-400 uppercase">Trustless</div>
                    </div>
                </div>
            </div>
        ),
    },
    {
        id: "split-deployment",
        title: "Split Contract Architecture",
        subtitle: "Transparent & Automated Earnings",
        content: (
            <div className="space-y-4">
                <p className="text-sm text-gray-300 leading-relaxed">
                    Our <span className="text-cyan-400 font-semibold">Split Contract</span> automatically handles every transaction,
                    separating platform fees from your earnings in a single atomic operation.
                </p>
                <div className="relative p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-white/10 mt-4">
                    <div className="flex items-center justify-between text-center">
                        <div className="flex-1">
                            <div className="w-10 h-10 mx-auto rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center mb-1.5">
                                <span className="text-sm">💳</span>
                            </div>
                            <div className="text-[10px] font-mono text-blue-400">Customer</div>
                        </div>
                        <div className="px-2">
                            <div className="w-6 h-0.5 bg-gradient-to-r from-blue-500 to-emerald-500" />
                        </div>
                        <div className="flex-1">
                            <div className="w-10 h-10 mx-auto rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-1.5">
                                <span className="text-sm">📜</span>
                            </div>
                            <div className="text-[10px] font-mono text-emerald-400">Split Contract</div>
                        </div>
                        <div className="px-2">
                            <div className="w-6 h-0.5 bg-gradient-to-r from-emerald-500 to-cyan-500" />
                        </div>
                        <div className="flex-1">
                            <div className="w-10 h-10 mx-auto rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center mb-1.5">
                                <span className="text-sm">💰</span>
                            </div>
                            <div className="text-[10px] font-mono text-cyan-400">Your Wallet</div>
                        </div>
                    </div>
                    <p className="text-[10px] text-gray-400 text-center mt-3 font-mono">
                        EARNINGS COLLECTED → FEES DEDUCTED → YOU WITHDRAW
                    </p>
                </div>
                <ul className="space-y-1.5 text-xs text-gray-400 mt-3">
                    <li className="flex items-start gap-2">
                        <span className="text-emerald-400 mt-0.5">✓</span>
                        <span>All earnings held in your smart contract</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-emerald-400 mt-0.5">✓</span>
                        <span>Withdraw to your wallet anytime</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-emerald-400 mt-0.5">✓</span>
                        <span>Fully audited and transparent on-chain</span>
                    </li>
                </ul>
            </div>
        ),
    },
    {
        id: "pricing",
        title: "Simple, Transparent Pricing",
        subtitle: "Fees Paid by the Customer",
        content: (
            <div className="space-y-4">
                <p className="text-sm text-gray-300 leading-relaxed">
                    Transaction fees are <span className="text-emerald-400 font-semibold">added to the transaction</span> and
                    paid by the customer—you keep 100% of your listed price.
                </p>
                <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20">
                        <div className="text-2xl font-bold text-emerald-400 mb-1">✓</div>
                        <div className="text-xs font-semibold text-white mb-0.5">Crypto Payments</div>
                        <div className="text-[10px] text-gray-400">USDC, ETH, and more</div>
                    </div>
                    <div className="p-4 rounded-xl bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border border-cyan-500/20">
                        <div className="text-2xl font-bold text-cyan-400 mb-1">✓</div>
                        <div className="text-xs font-semibold text-white mb-0.5">Card Payments</div>
                        <div className="text-[10px] text-gray-400">Credit & Debit cards</div>
                    </div>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-2">
                        <div className="text-lg">🚀</div>
                        <div>
                            <div className="text-xs font-semibold text-white">No Monthly Fees</div>
                            <div className="text-[10px] text-gray-400">Full platform access included</div>
                        </div>
                    </div>
                </div>
            </div>
        ),
    },
    {
        id: "connect",
        title: "Ready to Begin",
        subtitle: "Connect Your Wallet",
        content: null, // Will be rendered separately with connect button
    },
];

// Generate wizard steps dynamically based on brand
function getWizardSteps(brandName: string) {
    return WIZARD_STEPS.map(step => {
        if (step.id === "welcome") {
            return {
                ...step,
                title: `Welcome to ${brandName}`,
                content: (
                    <div className="space-y-4">
                        <p className="text-sm text-gray-300 leading-relaxed">
                            {brandName} is a <span className="text-emerald-400 font-semibold">trustless, permissionless</span> payment infrastructure
                            that enables businesses to accept cryptocurrency and card payments with instant settlement.
                        </p>
                        <div className="grid grid-cols-3 gap-2 mt-6">
                            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                                <div className="text-xl mb-1">⚡</div>
                                <div className="text-[10px] font-mono text-gray-400 uppercase">Instant</div>
                            </div>
                            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                                <div className="text-xl mb-1">🔒</div>
                                <div className="text-[10px] font-mono text-gray-400 uppercase">Secure</div>
                            </div>
                            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                                <div className="text-xl mb-1">💎</div>
                                <div className="text-[10px] font-mono text-gray-400 uppercase">Trustless</div>
                            </div>
                        </div>
                    </div>
                ),
            };
        }
        return step;
    });
}

export function SignupWizard({ isOpen, onClose, onComplete }: SignupWizardProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [wallets, setWallets] = useState<any[]>([]);
    const twTheme = usePortalThirdwebTheme();
    const brand = useBrand();

    // Get brand-specific values with Platform normalization
    const rawName = (brand as any)?.name || "BasaltSurge";
    const key = String((brand as any)?.key || "").toLowerCase();
    const isPlatform = !key || key === "basaltsurge" || key === "portalpay";

    const brandName = isPlatform ? "BasaltSurge" : rawName;
    const brandLogo = isPlatform ? "/Surge.png" : ((brand as any)?.logos?.symbol || (brand as any)?.logos?.app || "/Surge.png");

    // Generate wizard steps with dynamic brand name
    const wizardSteps = useMemo(() => getWizardSteps(brandName), [brandName]);

    useEffect(() => {
        let mounted = true;
        getWallets()
            .then((w) => { if (mounted) setWallets(w as any[]); })
            .catch(() => setWallets([]));
        return () => { mounted = false; };
    }, []);

    useEffect(() => {
        if (isOpen) {
            setCurrentStep(0);
            // Lock body scroll when modal is open
            const scrollY = window.scrollY;
            document.body.style.position = 'fixed';
            document.body.style.top = `-${scrollY}px`;
            document.body.style.left = '0';
            document.body.style.right = '0';
            document.body.style.overflow = 'hidden';

            return () => {
                document.body.style.position = '';
                document.body.style.top = '';
                document.body.style.left = '';
                document.body.style.right = '';
                document.body.style.overflow = '';
                window.scrollTo(0, scrollY);
            };
        }
    }, [isOpen]);

    const step = wizardSteps[currentStep];
    const isLastStep = currentStep === wizardSteps.length - 1;
    const isFirstStep = currentStep === 0;

    const handleNext = () => {
        if (currentStep < wizardSteps.length - 1) {
            setCurrentStep(currentStep + 1);
        }
    };

    const handlePrev = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    if (!isOpen) return null;
    if (typeof document === 'undefined') return null;

    return createPortal(
        <>
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[900] bg-black/80 backdrop-blur-md"
                onClick={onClose}
            />

            {/* Modal Container - Flexbox centering */}
            <div className="fixed inset-0 z-[901] flex items-center justify-center p-4 pointer-events-none">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="relative w-full max-w-[400px] rounded-2xl border border-white/10 shadow-2xl overflow-hidden pointer-events-auto flex flex-col"
                    style={{
                        background: 'linear-gradient(180deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.98) 100%)',
                        maxHeight: 'calc(100vh - 64px)',
                    }}
                >
                    {/* Header with Logo */}
                    <div className="relative p-6 pb-4 border-b border-white/10 shrink-0">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="relative w-10 h-10">
                                    <Image src={brandLogo} alt={brandName} fill className="object-contain" />
                                </div>
                                <div>
                                    <div className="text-[10px] font-mono text-emerald-400 tracking-widest">SIGNUP_WIZARD</div>
                                    <div className="text-white font-semibold text-sm">{brandName}</div>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                            >
                                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Progress Indicator */}
                        <div className="flex items-center gap-2">
                            {WIZARD_STEPS.map((s, i) => (
                                <div
                                    key={s.id}
                                    className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= currentStep ? 'bg-emerald-500' : 'bg-white/10'
                                        }`}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-6 flex-1 overflow-y-auto">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={step.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2 }}
                            >
                                <div className="mb-1">
                                    <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
                                        Step {currentStep + 1} of {WIZARD_STEPS.length}
                                    </span>
                                </div>
                                <h2 className="text-xl font-bold text-white mb-1">{step.title}</h2>
                                <p className="text-sm text-gray-400 mb-5">{step.subtitle}</p>

                                {step.content ? (
                                    step.content
                                ) : (
                                    /* Connect Step Special Content */
                                    <div className="space-y-4">
                                        <p className="text-sm text-gray-300 leading-relaxed">
                                            Connect your wallet or sign in with a social account to get started.
                                            Your wallet is your identity on the blockchain.
                                        </p>
                                        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                            <ul className="space-y-2 text-xs text-gray-400">
                                                <li className="flex items-start gap-2">
                                                    <span className="text-emerald-400 mt-0.5">✓</span>
                                                    <span>No email or password required</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-emerald-400 mt-0.5">✓</span>
                                                    <span>Your keys, your crypto, your control</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-emerald-400 mt-0.5">✓</span>
                                                    <span>Sign in with Google, Apple, or any wallet</span>
                                                </li>
                                            </ul>
                                        </div>
                                        <div className="pt-2">
                                            <ConnectButton
                                                client={client}
                                                chain={chain}
                                                wallets={wallets}
                                                connectButton={{
                                                    label: <span className="text-xs font-mono font-bold uppercase tracking-wider">Create Account</span>,
                                                    className: "!w-full !h-12 !rounded-xl !font-mono !text-xs !tracking-wider !font-bold !border-none transition-all hover:opacity-90",
                                                    style: {
                                                        background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
                                                        color: '#ffffff',
                                                        borderRadius: '12px',
                                                        width: '100%'
                                                    },
                                                }}
                                                detailsButton={{
                                                    displayBalanceToken: { [((chain as any)?.id ?? 8453)]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
                                                }}
                                                detailsModal={{
                                                    payOptions: {
                                                        buyWithFiat: { prefillSource: { currency: "USD" } },
                                                        prefillBuy: {
                                                            chain: chain,
                                                            token: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", name: "USD Coin", symbol: "USDC" },
                                                        },
                                                    },
                                                }}
                                                connectModal={{
                                                    title: "Create Your Account",
                                                    titleIcon: brandLogo,
                                                    size: "compact",
                                                    showThirdwebBranding: false
                                                }}
                                                theme={twTheme}
                                                onConnect={() => {
                                                    onComplete();
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* Footer Navigation */}
                    <div className="p-6 pt-0 shrink-0">
                        <div className="flex items-center justify-between gap-3">
                            <button
                                onClick={handlePrev}
                                disabled={isFirstStep}
                                className={`px-4 py-2.5 rounded-lg text-xs font-mono uppercase tracking-wider transition-all ${isFirstStep
                                    ? 'opacity-30 cursor-not-allowed text-gray-500'
                                    : 'text-gray-300 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                ← Back
                            </button>

                            {!isLastStep && (
                                <button
                                    onClick={handleNext}
                                    className="px-6 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-mono uppercase tracking-wider transition-all border border-white/10"
                                >
                                    Continue →
                                </button>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
        </>,
        document.body
    );
}
