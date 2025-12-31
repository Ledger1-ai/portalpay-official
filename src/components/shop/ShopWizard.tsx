"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ShopConfig, ShopTheme, InventoryArrangement } from "@/app/shop/page";
import ImageUploadField from "@/components/forms/ImageUploadField";
import ShopClient from "@/app/shop/[slug]/ShopClient";
import { getAllIndustryPacks } from "@/lib/industry-packs";
import { useActiveAccount } from "thirdweb/react";

type Props = {
    initialConfig: ShopConfig;
    onSave: (config: ShopConfig) => Promise<void>;
    onClose: () => void;
};

type WizardStep = "essentials" | "branding" | "layout" | "content" | "review";

export default function ShopWizard({ initialConfig, onSave, onClose }: Props) {
    const [step, setStep] = useState<WizardStep>("essentials");
    const [config, setConfig] = useState<ShopConfig>(initialConfig);
    const [saving, setSaving] = useState(false);
    const [showMobilePreview, setShowMobilePreview] = useState(false);
    const account = useActiveAccount();
    const [activeUploads, setActiveUploads] = useState(0);

    const onUploadStart = () => setActiveUploads(prev => prev + 1);
    const onUploadEnd = () => setActiveUploads(prev => Math.max(0, prev - 1));

    // Mock data for preview
    const mockItems = useMemo(() => {
        const pack = getAllIndustryPacks().find(p => p.id === config.industryPack) || getAllIndustryPacks()[0];
        // Sample items don't have IDs, so we generate them to avoid key errors
        return (pack?.sampleItems || []).map((item, idx) => ({
            ...item,
            id: `mock-item-${idx}`,
            stockQty: item.stockQty ?? 999
        }));
    }, [config.industryPack]);

    const mockReviews: any[] = [];

    // Navigation
    const nextStep = () => {
        if (step === "essentials") setStep("branding");
        else if (step === "branding") setStep("layout");
        else if (step === "layout") setStep("content");
        else if (step === "content") setStep("review");
    };

    const prevStep = () => {
        if (step === "branding") setStep("essentials");
        else if (step === "layout") setStep("branding");
        else if (step === "content") setStep("layout");
        else if (step === "review") setStep("content");
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(config);
            onClose();
        } catch (e) {
            console.error("Failed to save", e);
        } finally {
            setSaving(false);
        }
    };

    // Helper to clamp colors
    const clampColor = (v: string, fallback: string) => {
        if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return v;
        return fallback;
    };

    return (
        <div className="fixed inset-x-0 top-[112px] z-[9999] flex bg-background overflow-hidden" style={{ height: 'calc(100vh - 112px)' }}>
            {/* Left Sidebar: Form */}
            <div className="w-full md:w-[450px] flex flex-col border-r bg-background h-full shadow-2xl z-10">
                {/* Header */}
                <div className="p-6 border-b flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold">Shop Setup</h2>
                        <div className="text-xs text-muted-foreground mt-1">
                            Step {step === "essentials" ? 1 : step === "branding" ? 2 : step === "layout" ? 3 : step === "content" ? 4 : 5} of 5
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            className="md:hidden px-3 py-1.5 text-xs font-medium border rounded-full hover:bg-muted"
                            onClick={() => setShowMobilePreview(true)}
                        >
                            Preview
                        </button>
                        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-2">✕</button>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {step === "essentials" && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
                            <div>
                                <h3 className="text-lg font-semibold mb-2">The Essentials</h3>
                                <p className="text-sm text-muted-foreground mb-4">Let's start with your shop's identity.</p>
                            </div>

                            <div>
                                <label className="text-sm font-medium">Shop Name</label>
                                <input
                                    className="w-full h-10 px-3 mt-1 border rounded-md bg-background focus:ring-2 focus:ring-primary/20 transition-all"
                                    value={config.name}
                                    onChange={(e) => setConfig({ ...config, name: e.target.value })}
                                    placeholder="e.g. Acme Corp"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="text-sm font-medium">Slug (URL)</label>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-sm text-muted-foreground">/shop/</span>
                                    <input
                                        className="flex-1 h-10 px-3 border rounded-md bg-background focus:ring-2 focus:ring-primary/20 transition-all"
                                        value={config.slug || ""}
                                        onChange={(e) => setConfig({ ...config, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                                        placeholder="acme-corp"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-medium">Short Description</label>
                                <textarea
                                    className="w-full h-24 px-3 py-2 mt-1 border rounded-md bg-background focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                                    value={config.description || ""}
                                    onChange={(e) => setConfig({ ...config, description: e.target.value })}
                                    placeholder="Best widgets in town..."
                                />
                            </div>
                        </div>
                    )}

                    {step === "branding" && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                            <div>
                                <h3 className="text-lg font-semibold mb-2">Branding</h3>
                                <p className="text-sm text-muted-foreground mb-4">Make it yours.</p>
                            </div>

                            <ImageUploadField
                                label="Logo"
                                value={config.theme.brandLogoUrl || ""}
                                onChange={(url) => setConfig(prev => ({ ...prev, theme: { ...prev.theme, brandLogoUrl: Array.isArray(url) ? url[0] : url } }))}
                                target="brand_logo"
                                onUploadStart={onUploadStart}
                                onUploadEnd={onUploadEnd}
                                previewSize={64}
                            />

                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="text-sm font-medium">Primary</label>
                                    <div className="flex items-center gap-2 mt-1">
                                        <input
                                            type="color"
                                            className="w-10 h-10 p-0 shrink-0 aspect-square rounded border cursor-pointer"
                                            value={clampColor(config.theme.primaryColor || "#0ea5e9", "#0ea5e9")}
                                            onChange={(e) => setConfig(prev => ({ ...prev, theme: { ...prev.theme, primaryColor: e.target.value } }))}
                                        />
                                        <input
                                            className="flex-1 h-10 px-2 border rounded text-xs font-mono"
                                            value={config.theme.primaryColor || "#0ea5e9"}
                                            onChange={(e) => setConfig(prev => ({ ...prev, theme: { ...prev.theme, primaryColor: e.target.value } }))}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Secondary</label>
                                    <div className="flex items-center gap-2 mt-1">
                                        <input
                                            type="color"
                                            className="w-10 h-10 p-0 shrink-0 aspect-square rounded border cursor-pointer"
                                            value={clampColor(config.theme.secondaryColor || "#22c55e", "#22c55e")}
                                            onChange={(e) => setConfig(prev => ({ ...prev, theme: { ...prev.theme, secondaryColor: e.target.value } }))}
                                        />
                                        <input
                                            className="flex-1 h-10 px-2 border rounded text-xs font-mono"
                                            value={config.theme.secondaryColor || "#22c55e"}
                                            onChange={(e) => setConfig(prev => ({ ...prev, theme: { ...prev.theme, secondaryColor: e.target.value } }))}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-medium">Font Family</label>
                                <select
                                    className="w-full h-10 px-3 mt-1 border rounded-md bg-background"
                                    value={config.theme.fontFamily || "Inter, sans-serif"}
                                    onChange={(e) => setConfig(prev => ({ ...prev, theme: { ...prev.theme, fontFamily: e.target.value } }))}
                                >
                                    <option value="Inter, sans-serif">Inter (Default)</option>
                                    <option value="Roboto, sans-serif">Roboto</option>
                                    <option value="Poppins, sans-serif">Poppins</option>
                                    <option value="Merriweather, serif">Merriweather</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {step === "layout" && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                            <div>
                                <h3 className="text-lg font-semibold mb-2">Layout</h3>
                                <p className="text-sm text-muted-foreground mb-4">Choose how your products are displayed.</p>
                            </div>

                            <div className="space-y-4">
                                <label className="text-sm font-medium">Structure Mode</label>
                                <div className="grid grid-cols-1 gap-3">
                                    {[
                                        { id: "minimalist", label: "Minimalist", desc: "Clean grid, no hero." },
                                        { id: "balanced", label: "Balanced", desc: "Standard header & grid." },
                                        { id: "maximalist", label: "Maximalist", desc: "Immersive hero & banners." }
                                    ].map((m) => (
                                        <div
                                            key={m.id}
                                            onClick={() => setConfig(prev => ({ ...prev, theme: { ...prev.theme, layoutMode: m.id as any } }))}
                                            className={`p-4 rounded-lg border cursor-pointer transition-all ${config.theme.layoutMode === m.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/50"}`}
                                        >
                                            <div className="font-semibold">{m.label}</div>
                                            <div className="text-xs text-muted-foreground">{m.desc}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {config.theme.layoutMode !== "minimalist" && config.theme.layoutMode !== "maximalist" && (
                                <ImageUploadField
                                    label="Cover Photo"
                                    value={config.theme.coverPhotoUrl || ""}
                                    onChange={(url) => setConfig(prev => ({ ...prev, theme: { ...prev.theme, coverPhotoUrl: Array.isArray(url) ? url[0] : url } }))}
                                    target="cover_photo"
                                    onUploadStart={onUploadStart}
                                    onUploadEnd={onUploadEnd}
                                    guidance="1920x400 recommended"
                                    previewSize={120}
                                />
                            )}

                            {config.theme.layoutMode === "maximalist" && (
                                <>
                                    <ImageUploadField
                                        label="Maximalist Banner"
                                        value={config.theme.maximalistBannerUrl || ""}
                                        onChange={(url) => setConfig(prev => ({ ...prev, theme: { ...prev.theme, maximalistBannerUrl: Array.isArray(url) ? url[0] : url } }))}
                                        target="maximalist_banner"
                                        onUploadStart={onUploadStart}
                                        onUploadEnd={onUploadEnd}
                                        guidance="Ultra-wide banner (32:9 aspect ratio recommended)"
                                        previewSize={120}
                                    />

                                    <div>
                                        <label className="text-sm font-medium block mb-2">Rotating Gallery (5 Slots)</label>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                            {[0, 1, 2, 3, 4].map((idx) => (
                                                <ImageUploadField
                                                    key={idx}
                                                    label={`Slot ${idx + 1}`}
                                                    value={config.theme.galleryImages?.[idx] || ""}
                                                    onChange={(url) => {
                                                        const newImages = [...(config.theme.galleryImages || [])];
                                                        newImages[idx] = Array.isArray(url) ? url[0] : url;
                                                        setConfig(prev => ({ ...prev, theme: { ...prev.theme, galleryImages: newImages } }));
                                                    }}
                                                    target={`gallery_${idx}`}
                                                    onUploadStart={onUploadStart}
                                                    onUploadEnd={onUploadEnd}
                                                    guidance="16:9 ratio"
                                                    previewSize={80}
                                                    compact
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {step === "content" && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
                            <div>
                                <h3 className="text-lg font-semibold mb-2">Content & Links</h3>
                                <p className="text-sm text-muted-foreground mb-4">Tell your story.</p>
                            </div>

                            <div>
                                <label className="text-sm font-medium">Bio</label>
                                <textarea
                                    className="w-full h-32 px-3 py-2 mt-1 border rounded-md bg-background resize-none focus:ring-2 focus:ring-primary/20"
                                    value={config.bio || ""}
                                    onChange={(e) => setConfig({ ...config, bio: e.target.value })}
                                    placeholder="We started in 2024..."
                                />
                            </div>

                            {/* Link editing could be complex, for wizard mvp let's skipping granular link edit or just show count */}
                            <div className="p-4 border rounded bg-muted/20 text-sm text-muted-foreground text-center">
                                You can manage detailed social links in the main dashboard after setup.
                            </div>
                        </div>
                    )}

                    {step === "review" && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300 text-center py-10">
                            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
                                ✓
                            </div>
                            <h3 className="text-2xl font-bold">Ready to Launch?</h3>
                            <p className="text-muted-foreground max-w-xs mx-auto">
                                Your shop <strong>{config.name}</strong> is looking great. Click below to save and go live.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t bg-muted/10 flex justify-between items-center">
                    {step !== "essentials" ? (
                        <button onClick={prevStep} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
                            Back
                        </button>
                    ) : <div />}

                    {step === "review" ? (
                        <button
                            onClick={handleSave}
                            disabled={saving || activeUploads > 0}
                            className={`bg-green-600 hover:bg-green-700 text-white px-8 py-2.5 rounded-full font-bold shadow-lg shadow-green-600/20 active:scale-95 transition-all flex items-center gap-2 ${activeUploads > 0 ? "opacity-75 cursor-wait" : ""}`}
                        >
                            {activeUploads > 0 ? (
                                <>
                                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                                    Uploading...
                                </>
                            ) : saving ? (
                                <>
                                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                                    Saving...
                                </>
                            ) : (
                                "Launch Shop"
                            )}
                        </button>
                    ) : (
                        <button
                            onClick={nextStep}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2.5 rounded-full font-medium shadow-lg shadow-primary/20 active:scale-95 transition-all"
                        >
                            Continue
                        </button>
                    )}
                </div>
            </div>

            {/* Right Side: Live Preview */}
            <div className={`flex-1 bg-[#050510] relative flex flex-col transition-all duration-300 ${showMobilePreview ? 'absolute inset-0 z-[6000] translate-x-0' : 'hidden md:flex'}`}>

                {/* Mobile Preview Header */}
                <div className="md:hidden p-4 bg-black/90 backdrop-blur border-b border-white/10 flex items-center justify-between sticky top-0 z-20 text-white">
                    <span className="font-semibold text-sm">Live Preview</span>
                    <button
                        onClick={() => setShowMobilePreview(false)}
                        className="text-xs bg-white text-black px-3 py-1.5 rounded-full font-bold"
                    >
                        Close Preview
                    </button>
                </div>

                <div className="absolute inset-0 top-[57px] md:top-0 overflow-hidden flex flex-col">
                    {/* Sleek Browser Bar */}
                    <div className="h-14 bg-white/5 backdrop-blur-md border-b border-white/10 flex items-center px-6 gap-4 select-none shrink-0 z-20 relative">
                        <div className="flex gap-2">
                            <div className="w-3 h-3 rounded-full bg-[#ff5f57] border border-black/10 shadow-[0_0_10px_rgba(255,95,87,0.5)]"></div>
                            <div className="w-3 h-3 rounded-full bg-[#febc2e] border border-black/10 shadow-[0_0_10px_rgba(254,188,46,0.5)]"></div>
                            <div className="w-3 h-3 rounded-full bg-[#28c840] border border-black/10 shadow-[0_0_10px_rgba(40,200,64,0.5)]"></div>
                        </div>
                        <div className="flex-1 max-w-[500px] mx-auto h-8 rounded-lg bg-black/40 border border-white/5 flex items-center justify-center text-xs font-mono tracking-wide text-white/50 shadow-inner gap-2">
                            <span className="text-emerald-500">🔒</span>
                            <span>{typeof window !== 'undefined' ? window.location.host : 'surge.basalthq.com'}/shop/<span className="text-white/90">{config.slug || "your-slug"}</span></span>
                        </div>
                    </div>

                    {/* The Actual Shop Client - Containment Enforced! */}
                    <div className="flex-1 w-full bg-black isolate transform-gpu overflow-y-auto flex flex-col min-h-0">
                        <div className="flex-1 min-h-0">
                            <ShopClient
                                config={config}
                                items={mockItems}
                                reviews={mockReviews}
                                merchantWallet={account?.address || ""}
                                cleanSlug={config.slug || "preview"}
                                isPreview={true}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
