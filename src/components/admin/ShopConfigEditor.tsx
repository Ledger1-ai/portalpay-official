
import React, { useEffect, useState } from "react";
import ImageUploadField from "@/components/forms/ImageUploadField"; // Assuming this exists or I'll check

type ShopConfigEditorProps = {
    wallet: string;
    brandKey: string;
    initialData: {
        name: string;
        logoUrl?: string;
        faviconUrl?: string;
        primaryColor?: string;
    };
    onSave: (data: any) => Promise<void>;
};

import { useBrand } from "@/contexts/BrandContext";

export default function ShopConfigEditor({ wallet, brandKey, initialData, onSave }: ShopConfigEditorProps) {
    const brand = useBrand();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        console.log(`[ShopConfigEditor] MOUNTED for wallet: ${wallet}`);
        return () => console.log(`[ShopConfigEditor] UNMOUNTED for wallet: ${wallet}`);
    }, [wallet]);

    const [config, setConfig] = useState<any>({
        name: initialData.name,
        slug: "",
        theme: {
            primaryColor: initialData.primaryColor || "#0ea5e9",
            secondaryColor: "#22c55e", // Default
            brandLogoUrl: initialData.logoUrl || brand?.logos?.symbol || "",
            brandFaviconUrl: initialData.faviconUrl || "",
        }
    });

    useEffect(() => {
        // Fetch live config to sync
        (async () => {
            if (!wallet) return;
            setLoading(true);
            try {
                // Public GET endpoint supports x-wallet or query param
                const r = await fetch(`/api/shop/config?wallet=${wallet}&brandKey=${brandKey || ""}`, { cache: "no-store" });
                const j = await r.json().catch(() => ({}));
                if (j?.config) {
                    const c = j.config;
                    setConfig((prev: any) => ({
                        ...prev,
                        name: c.name || prev.name,
                        slug: c.slug || "",
                        theme: {
                            ...prev.theme,
                            ...(c.theme || {}),
                            // Ensure we don't lose initial data if API returns empty
                            brandLogoUrl: c.theme?.brandLogoUrl || prev.theme.brandLogoUrl,
                        }
                    }));
                }
            } catch (e) {
                console.error("Failed to load shop config", e);
            } finally {
                setLoading(false);
            }
        })();
    }, [wallet]);

    const handleSave = async () => {
        setSaving(true);
        console.log("[ShopConfigEditor] Saving:", config);
        try {
            await onSave({
                name: config.name,
                slug: config.slug,
                theme: config.theme
            });
        } finally {
            setSaving(false);
        }
    };

    const generateFavicon = async (logoUrl: string) => {
        try {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = logoUrl;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });

            const canvas = document.createElement("canvas");
            canvas.width = 32;
            canvas.height = 32;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            // Draw and resize
            ctx.drawImage(img, 0, 0, 32, 32);

            canvas.toBlob(async (blob) => {
                if (!blob) return;
                const form = new FormData();
                form.append("target", "brand_favicon");
                form.append("file", blob, "favicon.png");

                try {
                    const r = await fetch("/api/public/images", { method: "POST", body: form });
                    const j = await r.json();
                    if (j?.ok && j?.images?.[0]?.url) {
                        setConfig((prev: any) => ({
                            ...prev,
                            theme: { ...prev.theme, brandFaviconUrl: j.images[0].url }
                        }));
                    }
                } catch (e) {
                    console.error("Failed to auto-generate favicon", e);
                }
            }, "image/png");
        } catch (e) {
            console.error("Error generating favicon from logo", e);
            // Fallback: If canvas fails (CORS), just use the logo URL directly.
            // Better to have a large favicon than none.
            if (logoUrl) {
                setConfig((prev: any) => ({
                    ...prev,
                    theme: { ...prev.theme, brandFaviconUrl: logoUrl }
                }));
            }
        }
    };

    if (loading) return <div className="p-4 text-xs text-muted-foreground animate-pulse">Loading shop configuration...</div>;

    return (
        <div className="space-y-4 w-full bg-black/20 p-4 rounded-lg border border-white/5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Shop Name</label>
                    <input
                        type="text"
                        value={config.name}
                        onChange={e => setConfig({ ...config, name: e.target.value })}
                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Slug (URL)</label>
                    <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm opacity-80">
                        <span className="text-muted-foreground text-xs">/shop/</span>
                        <input
                            type="text"
                            value={config.slug || ""}
                            onChange={e => setConfig({ ...config, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                            placeholder="my-shop"
                            className="bg-transparent outline-none w-full"
                        />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-white/5 pt-4">
                <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Brand Color</label>
                    <div className="flex gap-2">
                        <div
                            className="w-8 h-8 rounded border border-white/10 shrink-0"
                            style={{ backgroundColor: config.theme.primaryColor }}
                        />
                        <input
                            type="text"
                            value={config.theme.primaryColor}
                            onChange={e => setConfig({ ...config, theme: { ...config.theme, primaryColor: e.target.value } })}
                            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm font-mono"
                        />
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Secondary Color</label>
                    <div className="flex gap-2">
                        <div
                            className="w-8 h-8 rounded border border-white/10 shrink-0"
                            style={{ backgroundColor: config.theme.secondaryColor }}
                        />
                        <input
                            type="text"
                            value={config.theme.secondaryColor}
                            onChange={e => setConfig({ ...config, theme: { ...config.theme, secondaryColor: e.target.value } })}
                            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm font-mono"
                        />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-white/5 pt-4">
                <div className="space-y-1">
                    <ImageUploadField
                        label="Logo"
                        value={config.theme.brandLogoUrl}
                        onChange={(url) => {
                            const newUrl = String(url || "");
                            setConfig((prev: any) => ({
                                ...prev,
                                ...prev,
                                theme: { ...prev.theme, brandLogoUrl: newUrl }
                            }));
                            if (newUrl && !config.theme.brandFaviconUrl) {
                                generateFavicon(newUrl);
                            }
                        }}
                        target="brand_logo"
                        compact
                    />
                    {initialData.logoUrl && initialData.logoUrl !== config.theme.brandLogoUrl && (
                        <div className="flex items-center gap-2 mt-1 px-1">
                            <div className="text-[10px] text-gray-400">Application Logo:</div>
                            <button
                                onClick={() => {
                                    setConfig((prev: any) => ({
                                        ...prev,
                                        theme: { ...prev.theme, brandLogoUrl: initialData.logoUrl }
                                    }));
                                    if (!config.theme.brandFaviconUrl) {
                                        generateFavicon(initialData.logoUrl!);
                                    }
                                }}
                                className="text-[10px] text-emerald-400 hover:text-emerald-300 underline"
                            >
                                Use this
                            </button>
                            <a href={initialData.logoUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-gray-500 hover:text-gray-300">
                                (View)
                            </a>
                        </div>
                    )}
                </div>
                <div className="space-y-1">
                    <ImageUploadField
                        label="Favicon"
                        value={config.theme.brandFaviconUrl}
                        onChange={(url) => setConfig((prev: any) => ({
                            ...prev,
                            theme: { ...prev.theme, brandFaviconUrl: String(url || "") }
                        }))}
                        target="brand_favicon"
                        compact
                        guidance="Recommended 32x32 or 64x64 PNG"
                    />
                </div>
            </div>

            <div className="flex justify-end pt-2">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 rounded text-xs font-semibold transition-colors flex items-center gap-2"
                >
                    {saving ? "Saving..." : "Save Config"}
                </button>
            </div>
        </div>
    );
}
