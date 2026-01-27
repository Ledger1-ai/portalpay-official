"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
const ConnectButton = dynamic(() => import("thirdweb/react").then((m) => m.ConnectButton), { ssr: false });
import { useActiveAccount } from "thirdweb/react";
import { client, chain, getWallets } from "@/lib/thirdweb/client";
import { usePortalThirdwebTheme } from "@/lib/thirdweb/theme";
import { useBrand } from "@/contexts/BrandContext";
import ImageUploadField from "./forms/ImageUploadField";

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
    const account = useActiveAccount();
    const [currentStep, setCurrentStep] = useState(0);
    const [wallets, setWallets] = useState<any[]>([]);
    const twTheme = usePortalThirdwebTheme();
    const brand = useBrand();

    // Application Form State
    const [connectedWallet, setConnectedWallet] = useState<string>("");
    const [shopName, setShopName] = useState("");
    // KYB State
    const [legalName, setLegalName] = useState("");
    const [businessType, setBusinessType] = useState("llc");
    const [ein, setEin] = useState("");
    const [website, setWebsite] = useState("");
    const [phone, setPhone] = useState("");
    const [address, setAddress] = useState({ street: "", city: "", state: "", zip: "", country: "US" });

    const [logoUrl, setLogoUrl] = useState("");
    const [notes, setNotes] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState("");
    const [applicationStatus, setApplicationStatus] = useState<"none" | "pending" | "success">("none");

    // Get brand-specific values with Platform normalization
    const rawName = (brand as any)?.name || "BasaltSurge";
    const key = String((brand as any)?.key || "").toLowerCase();
    const isPlatform = !key || key === "basaltsurge" || key === "portalpay";

    const brandName = isPlatform ? "BasaltSurge" : rawName;
    const brandLogo = isPlatform ? "/Surge.png" : ((brand as any)?.logos?.symbol || (brand as any)?.logos?.app || "/Surge.png");

    // Check Access Mode
    const accessMode = (brand as any)?.accessMode || "open";
    const isPrivate = accessMode === "request";

    // Generate wizard steps dynamically based on brand
    const wizardSteps = useMemo(() => {
        const base = getWizardSteps(brandName);
        if (isPrivate && applicationStatus !== "success") {
            // In private mode, we might need an extra step if not approved
            // We'll handle this by dynamically rendering the "Connect" step transformation
            return base;
        }
        return base;
    }, [brandName, isPrivate, applicationStatus]);

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
            setConnectedWallet("");
            setApplicationStatus("none");

            // Lock body scroll logic...
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



    // Handle Wallet Connection in Private Mode
    async function handleWalletConnected(wallet: string) {
        setConnectedWallet(wallet);
        if (isPrivate) {
            // Check if user is already approved
            try {
                const res = await fetch("/api/auth/me"); // or specific check
                const me = await res.json().catch(() => ({}));

                // If already approved, allow login
                if (me?.authed || me?.approved) {
                    // Already approved? Then they should technically use Login, not Signup.
                    // But if they are here, we can just close the wizard and let Navbar handle auth.
                    onComplete();
                } else {
                    // Not approved -> Show Application Form
                    setApplicationStatus("pending");
                }
            } catch {
                setApplicationStatus("pending");
            }
        } else {
            onComplete();
        }
    }

    async function submitApplication() {
        if (!shopName.trim()) {
            setSubmitError("Doing Business As (DBA) Name is required");
            return;
        }
        if (!legalName.trim()) {
            setSubmitError("Legal Business Name is required");
            return;
        }
        if (!ein.trim()) {
            setSubmitError("Tax ID / EIN is required");
            return;
        }

        setSubmitting(true);
        setSubmitError("");
        try {
            const res = await fetch("/api/partner/client-requests", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-wallet": connectedWallet // Identifying the wallet
                },
                body: JSON.stringify({
                    shopName,
                    legalBusinessName: legalName,
                    businessType,
                    ein,
                    website,
                    phone,
                    businessAddress: address,
                    logoUrl,
                    notes
                })
            });
            const data = await res.json();
            if (!res.ok) {
                // If 409, might already be pending
                if (res.status === 409) {
                    setApplicationStatus("success"); // Treat as success/already done
                    return;
                }
                throw new Error(data.error || "Submission failed");
            }
            setApplicationStatus("success");
        } catch (e: any) {
            setSubmitError(e.message || "Failed to submit application");
        } finally {
            setSubmitting(false);
        }
    }


    // Navigation Helpers
    const isFirstStep = currentStep === 0;
    const isLastStep = currentStep === wizardSteps.length - 1;

    const handleNext = () => {
        if (!isLastStep) {
            setCurrentStep(curr => curr + 1);
        }
    };

    const handlePrev = () => {
        if (!isFirstStep) {
            setCurrentStep(curr => curr - 1);
        }
    };

    const step = wizardSteps[currentStep];
    // If in application flow, override step content
    const isApplicationForm = isPrivate && applicationStatus === "pending" && connectedWallet;
    const isApplicationSuccess = isPrivate && applicationStatus === "success";

    if (!isOpen) return null;
    if (typeof document === 'undefined') return null;

    return createPortal(
        <>
            {/* Backdrop - High Z-Index for Mobile Overlay */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9998] bg-black/90 backdrop-blur-md"
                onClick={onClose}
            />

            {/* Modal Container - Max Z-Index, Full Screen Mobile aware */}
            <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none p-0 sm:p-4 pt-[safe-area-inset-top]">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="relative w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-[480px] sm:rounded-2xl border-0 sm:border border-white/10 shadow-2xl overflow-hidden pointer-events-auto flex flex-col bg-black/95 sm:bg-black/90"
                    style={{
                        background: 'linear-gradient(180deg, rgba(10,10,10,1) 0%, rgba(5,5,5,1) 100%)',
                    }}
                >
                    {/* Header - Sticky */}
                    <div className="relative p-6 pb-4 border-b border-white/10 shrink-0 bg-black/50 backdrop-blur-sm z-10 pt-safe-top">
                        <div className="flex items-center justify-between mb-4 mt-2 sm:mt-0">
                            <div className="flex items-center gap-3">
                                <div className="relative w-10 h-10 shrink-0">
                                    <Image src={brandLogo} alt={brandName} fill className="object-contain" />
                                </div>
                                <div>
                                    <div className="text-[10px] font-mono text-emerald-400 tracking-widest">
                                        {isApplicationSuccess ? "APPLICATION_SENT" : (isApplicationForm ? "PARTNER_APPLICATION" : "SIGNUP_WIZARD")}
                                    </div>
                                    <div className="text-white font-semibold text-sm">{brandName}</div>
                                </div>
                            </div>
                            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Progress Indicator - Hide on application screen to reduce clutter or show single step */}
                        {!isApplicationSuccess && !isApplicationForm && (
                            <div className="flex items-center gap-2">
                                {WIZARD_STEPS.map((s, i) => (
                                    <div key={s.id} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= currentStep ? 'bg-emerald-500' : 'bg-white/10'}`} />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Content - Scrollable */}
                    <div className="p-6 flex-1 overflow-y-auto pb-safe-bottom">
                        <AnimatePresence mode="wait">
                            {isApplicationSuccess ? (
                                <motion.div
                                    key="success"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="text-center py-8"
                                >
                                    <div className="w-16 h-16 mx-auto bg-emerald-500/10 rounded-full flex items-center justify-center mb-4 border border-emerald-500/20">
                                        <span className="text-3xl">🎉</span>
                                    </div>
                                    <h2 className="text-xl font-bold text-white mb-2">Application Received</h2>
                                    <p className="text-sm text-gray-400 mb-6">
                                        Your request to join {brandName} has been submitted. We will review your application and notify you shortly.
                                    </p>
                                    <div className="p-3 bg-white/5 rounded-lg border border-white/10 mb-6">
                                        <div className="text-[10px] font-mono text-gray-500 uppercase">Wallet</div>
                                        <div className="text-xs font-mono text-emerald-400 truncate">{connectedWallet}</div>
                                    </div>
                                    <button onClick={onClose} className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold transition-colors">
                                        Close
                                    </button>
                                </motion.div>
                            ) : isApplicationForm ? (
                                <motion.div
                                    key="application"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                >
                                    <h2 className="text-xl font-bold text-white mb-1">Apply for Access</h2>
                                    <p className="text-sm text-gray-400 mb-5">Please provide your business details for KYB verification.</p>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-xs text-gray-400 block mb-1">Wallet Address</label>
                                            <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10 font-mono text-xs text-gray-300 truncate">
                                                {connectedWallet}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs text-gray-400 block mb-1">Legal Business Name <span className="text-red-400">*</span></label>
                                                <input
                                                    value={legalName}
                                                    onChange={e => setLegalName(e.target.value)}
                                                    className="w-full px-3 py-2 bg-black/20 rounded-lg border border-white/10 text-sm text-white focus:border-emerald-500 outline-none transition-colors"
                                                    placeholder="Official Legal Name"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-400 block mb-1">DBA / Shop Name <span className="text-red-400">*</span></label>
                                                <input
                                                    value={shopName}
                                                    onChange={e => setShopName(e.target.value)}
                                                    className="w-full px-3 py-2 bg-black/20 rounded-lg border border-white/10 text-sm text-white focus:border-emerald-500 outline-none transition-colors"
                                                    placeholder="Doing Business As"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs text-gray-400 block mb-1">Business Type</label>
                                                <select
                                                    value={businessType}
                                                    onChange={e => setBusinessType(e.target.value)}
                                                    className="w-full px-3 py-2 bg-black/20 rounded-lg border border-white/10 text-sm text-white focus:border-emerald-500 outline-none transition-colors appearance-none"
                                                >
                                                    <option value="llc">LLC</option>
                                                    <option value="corp">Corporation</option>
                                                    <option value="sole_prop">Sole Proprietorship</option>
                                                    <option value="partnership">Partnership</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-400 block mb-1">Tax ID / EIN <span className="text-red-400">*</span></label>
                                                <input
                                                    value={ein}
                                                    onChange={e => setEin(e.target.value)}
                                                    className="w-full px-3 py-2 bg-black/20 rounded-lg border border-white/10 text-sm text-white focus:border-emerald-500 outline-none transition-colors"
                                                    placeholder="xx-xxxxxxx"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs text-gray-400 block mb-1">Website</label>
                                                <input
                                                    value={website}
                                                    onChange={e => setWebsite(e.target.value)}
                                                    className="w-full px-3 py-2 bg-black/20 rounded-lg border border-white/10 text-sm text-white focus:border-emerald-500 outline-none transition-colors"
                                                    placeholder="https://"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-400 block mb-1">Phone Number</label>
                                                <input
                                                    value={phone}
                                                    onChange={e => setPhone(e.target.value)}
                                                    className="w-full px-3 py-2 bg-black/20 rounded-lg border border-white/10 text-sm text-white focus:border-emerald-500 outline-none transition-colors"
                                                    placeholder="+1 (555) 000-0000"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-xs text-gray-400 block mb-1">Business Address</label>
                                            <div className="space-y-2">
                                                <input
                                                    value={address.street}
                                                    onChange={e => setAddress({ ...address, street: e.target.value })}
                                                    className="w-full px-3 py-2 bg-black/20 rounded-lg border border-white/10 text-sm text-white focus:border-emerald-500 outline-none transition-colors mb-2"
                                                    placeholder="Street Address"
                                                />
                                                <div className="grid grid-cols-3 gap-2">
                                                    <input
                                                        value={address.city}
                                                        onChange={e => setAddress({ ...address, city: e.target.value })}
                                                        className="w-full px-3 py-2 bg-black/20 rounded-lg border border-white/10 text-sm text-white focus:border-emerald-500 outline-none transition-colors"
                                                        placeholder="City"
                                                    />
                                                    <input
                                                        value={address.state}
                                                        onChange={e => setAddress({ ...address, state: e.target.value })}
                                                        className="w-full px-3 py-2 bg-black/20 rounded-lg border border-white/10 text-sm text-white focus:border-emerald-500 outline-none transition-colors"
                                                        placeholder="State"
                                                    />
                                                    <input
                                                        value={address.zip}
                                                        onChange={e => setAddress({ ...address, zip: e.target.value })}
                                                        className="w-full px-3 py-2 bg-black/20 rounded-lg border border-white/10 text-sm text-white focus:border-emerald-500 outline-none transition-colors"
                                                        placeholder="ZIP"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-xs text-gray-400 block mb-1">Business Logo</label>
                                            <ImageUploadField
                                                value={logoUrl}
                                                onChange={(val) => setLogoUrl(Array.isArray(val) ? val[0] : val)}
                                                target="partner_application_logo"
                                                previewSize={80}
                                                className="w-full"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-xs text-gray-400 block mb-1">Notes / Description</label>
                                            <textarea
                                                value={notes}
                                                onChange={e => setNotes(e.target.value)}
                                                className="w-full px-3 py-2 bg-black/20 rounded-lg border border-white/10 text-sm text-white focus:border-emerald-500 outline-none transition-colors min-h-[80px]"
                                                placeholder="Tell us about what you're building..."
                                            />
                                        </div>

                                        {submitError && (
                                            <div className="text-xs text-red-400 bg-red-500/10 p-2 rounded border border-red-500/20">
                                                {submitError}
                                            </div>
                                        )}

                                        <button
                                            onClick={submitApplication}
                                            disabled={submitting}
                                            className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                                        >
                                            {submitting ? "Submitting Application..." : "Submit Application"}
                                        </button>
                                        <div className="h-6" /> {/* Extra padding for scroll */}
                                    </div>
                                </motion.div>
                            ) : (
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
                                        <div className="space-y-4">
                                            <p className="text-sm text-gray-300 leading-relaxed">
                                                {account?.address ? (
                                                    <>
                                                        You are connected as <span className="font-mono text-emerald-400">{account.address.slice(0, 6)}...{account.address.slice(-4)}</span>.
                                                        <br />Proceed to the application to join {brandName}.
                                                    </>
                                                ) : (
                                                    <>Connect your wallet to {isPrivate ? "apply for access" : "get started"}.</>
                                                )}
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
                                                </ul>
                                            </div>

                                            <div className="pt-2">
                                                {account?.address ? (
                                                    <button
                                                        onClick={() => handleWalletConnected(account.address)}
                                                        className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold shadow-lg shadow-emerald-500/20 transition-all active:scale-95 text-xs font-mono uppercase tracking-wider"
                                                    >
                                                        Continue to Application
                                                    </button>
                                                ) : (
                                                    <ConnectButton
                                                        client={client}
                                                        chain={chain}
                                                        wallets={wallets}
                                                        connectButton={{
                                                            label: <span className="text-xs font-mono font-bold uppercase tracking-wider">{isPrivate ? "Connect to Apply" : "Create Account"}</span>,
                                                            className: "!w-full !h-12 !rounded-xl !font-mono !text-xs !tracking-wider !font-bold !border-none transition-all hover:opacity-90",
                                                            style: {
                                                                background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
                                                                color: '#ffffff',
                                                                borderRadius: '12px',
                                                                width: '100%'
                                                            },
                                                        }}
                                                        connectModal={{
                                                            title: isPrivate ? "Connect to Apply" : "Create Your Account",
                                                            titleIcon: brandLogo,
                                                            size: "compact",
                                                            showThirdwebBranding: false
                                                        }}
                                                        theme={twTheme}
                                                        onConnect={async (activeWallet) => {
                                                            const w = activeWallet?.getAccount()?.address;
                                                            if (w) await handleWalletConnected(w);
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Footer Navigation */}
                    {!isApplicationForm && !isApplicationSuccess && (
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
                    )}
                </motion.div>
            </div>
        </>,
        document.body
    );
}
