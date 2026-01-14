"use client";

import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { X, Search, ShoppingCart, Trash2, Plus, Minus, Tag, RotateCcw, ChevronLeft, ChevronRight, Sparkles, Ticket, Percent } from "lucide-react";
import { InventoryItem } from "@/types/inventory";
import { ShopConfig } from "@/app/shop/[slug]/ShopClient";

// ============================================================
// THEMED MESH GRADIENT (matches shop page implementation)
// ============================================================
function generateThemedColors(id: string, primary: string, secondary: string): string[] {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash << 5) - hash + id.charCodeAt(i);
        hash = hash & hash;
    }
    const colors: string[] = [primary || "#0ea5e9", secondary || "#22c55e"];
    for (let i = 0; i < 3; i++) {
        const h = Math.abs(hash + i * 137) % 360;
        const s = 65 + (Math.abs(hash + i * 251) % 25);
        const l = 55 + (Math.abs(hash + i * 179) % 25);
        colors.push(`hsl(${h}, ${s}%, ${l}%)`);
    }
    return colors;
}

function MeshGradientPlaceholder({
    seed,
    className,
    primaryColor,
    secondaryColor,
    logoUrl
}: {
    seed: string;
    className?: string;
    primaryColor?: string;
    secondaryColor?: string;
    logoUrl?: string;
}) {
    const colors = useMemo(() => generateThemedColors(seed, primaryColor || "#0ea5e9", secondaryColor || "#22c55e"), [seed, primaryColor, secondaryColor]);

    const gradientStyle: React.CSSProperties = useMemo(() => ({
        background: `
            radial-gradient(at 0% 0%, ${colors[0]} 0px, transparent 50%),
            radial-gradient(at 100% 0%, ${colors[1]} 0px, transparent 50%),
            radial-gradient(at 100% 100%, ${colors[2]} 0px, transparent 50%),
            radial-gradient(at 0% 100%, ${colors[3]} 0px, transparent 50%),
            radial-gradient(at 50% 50%, ${colors[4]} 0px, transparent 50%)
        `,
        backgroundColor: colors[0]
    }), [colors]);

    return (
        <div
            className={`relative overflow-hidden ${className || ""}`}
            style={gradientStyle}
        >
            <div className="absolute inset-0 flex items-center justify-center">
                {logoUrl ? (
                    <img src={logoUrl} alt="" className="w-1/2 h-1/2 object-contain opacity-80" />
                ) : (
                    <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-white/40 font-bold text-xl"
                        style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
                    >
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================
// DISCOUNT UI HELPERS (matches shop page implementation)
// ============================================================
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const h = hex.trim().replace(/^#/, "");
    const full = h.length === 3 ? h.split("").map((ch) => ch + ch).join("") : h;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return { r, g, b };
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
    const srgb = [rgb.r, rgb.g, rgb.b].map((v) => v / 255);
    const lin = srgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrastTextFor(bg: string, fallback = "#ffffff"): string {
    const rgb = hexToRgb(bg);
    if (!rgb) return fallback;
    const L = relativeLuminance(rgb);
    return L > 0.5 ? "#000000" : "#ffffff";
}

function toHslaTint(hsl: string, alpha = 0.08): string {
    const s = String(hsl || "").trim();
    if (!s.startsWith("hsl(")) return s;
    return s.replace(/^hsl\(/, "hsla(").replace(/\)$/, `,${alpha})`);
}

function formatDiscountText(d: { type: string; value: number }): string {
    if (d.type === 'percentage') return `${d.value}% OFF`;
    if (d.type === 'fixed_amount') return `$${d.value} OFF`;
    if (d.type === 'buy_x_get_y') return `Buy ${Math.floor(d.value)} Get 1 Free`;
    return 'SALE';
}

function formatDiscountRequirement(d: { minRequirement: string; minRequirementValue: number }): string | null {
    if (d.minRequirement === 'amount' && d.minRequirementValue > 0) {
        return `Min $${d.minRequirementValue} order`;
    }
    if (d.minRequirement === 'quantity' && d.minRequirementValue > 0) {
        return `Min ${d.minRequirementValue} items`;
    }
    return null;
}

function DiscountBanner({ discount, compact = false, primaryColor, secondaryColor }: { discount: { type: string; value: number; title?: string; minRequirement: string; minRequirementValue: number }; compact?: boolean; primaryColor?: string; secondaryColor?: string }) {
    const text = formatDiscountText(discount);
    const requirement = formatDiscountRequirement(discount);
    const bgStyle = primaryColor ? {
        background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor || primaryColor} 100%)`
    } : {
        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
    };

    return (
        <div
            className={`absolute top-0 left-0 right-0 z-10 ${compact ? 'px-2 py-1' : 'px-3 py-1.5'} overflow-hidden shadow-sm`}
            style={bgStyle}
        >
            <style>{`
                @keyframes glint {
                    0% { transform: translateX(-150%) skewX(-15deg); }
                    20% { transform: translateX(150%) skewX(-15deg); }
                    100% { transform: translateX(150%) skewX(-15deg); }
                }
            `}</style>
            <div className="absolute inset-0 bg-white/20 skew-x-12" style={{ animation: 'glint 3s infinite' }} />
            <div className="relative flex items-center justify-between gap-2 text-white">
                <div className="flex items-center gap-1.5 min-w-0">
                    <Sparkles className="w-3.5 h-3.5 fill-white/20 animate-pulse" />
                    <span className={`font-bold truncate ${compact ? 'text-[10px]' : 'text-xs'}`}>
                        {text}
                    </span>
                </div>
                {requirement && (
                    <span className={`${compact ? 'text-[8px] px-1' : 'text-[10px] px-1.5'} opacity-90 whitespace-nowrap font-medium bg-black/10 py-0.5 rounded`}>
                        {requirement}
                    </span>
                )}
            </div>
        </div>
    );
}

// ============================================================
// KIOSK CLIENT
// ============================================================
export default function KioskClient({
    config,
    items: initialItems,
    merchantWallet
}: {
    config: ShopConfig;
    items: InventoryItem[];
    merchantWallet: string
}) {
    const [items, setItems] = useState<InventoryItem[]>(initialItems);
    const [cart, setCart] = useState<{ id: string; qty: number; item: InventoryItem }[]>([]);
    const [loading, setLoading] = useState(false);
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [qrValue, setQrValue] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const categoryScrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    // Discount type (matches /api/shop/discounts)
    type Discount = {
        id: string;
        title: string;
        code?: string;
        type: 'percentage' | 'fixed_amount' | 'buy_x_get_y';
        value: number;
        appliesTo: 'all' | 'collection' | 'product';
        appliesToIds: string[];
        minRequirement: 'none' | 'amount' | 'quantity';
        minRequirementValue: number;
        status: 'active' | 'scheduled' | 'expired';
    };

    // Discounts & Coupons state
    const [discounts, setDiscounts] = useState<Discount[]>([]);
    const [coupons, setCoupons] = useState<Discount[]>([]);
    const [appliedCoupon, setAppliedCoupon] = useState<Discount | null>(null);
    const [couponCode, setCouponCode] = useState('');
    const [couponError, setCouponError] = useState('');
    const [discountsLoading, setDiscountsLoading] = useState(false);

    const categories = useMemo(() => {
        const cats = new Set<string>();
        items.forEach(item => {
            if (item.category) cats.add(item.category);
        });
        return Array.from(cats).sort();
    }, [items]);

    const filteredItems = useMemo(() => {
        let result = [...items];
        if (selectedCategory) {
            result = result.filter(item => item.category === selectedCategory);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(item =>
                item.name?.toLowerCase().includes(q) ||
                item.description?.toLowerCase().includes(q) ||
                item.sku?.toLowerCase().includes(q) ||
                item.category?.toLowerCase().includes(q) ||
                (item.tags && item.tags.some(t => t.toLowerCase().includes(q)))
            );
        }
        return result;
    }, [items, selectedCategory, searchQuery]);

    useEffect(() => {
        if (items.length === 0) {
            setLoading(true);
            fetch(`/api/inventory`, { headers: { "x-wallet": merchantWallet } })
                .then(r => r.json())
                .then(d => {
                    if (Array.isArray(d.items)) setItems(d.items.filter((i: any) => i.approved !== false));
                })
                .finally(() => setLoading(false));
        }
    }, [items.length, merchantWallet]);

    // Load discounts on mount
    useEffect(() => {
        loadDiscounts();
    }, [merchantWallet, config.slug]);

    const loadDiscounts = async () => {
        setDiscountsLoading(true);
        try {
            const res = await fetch(`/api/shop/discounts?wallet=${encodeURIComponent(merchantWallet)}${config.slug ? `&slug=${encodeURIComponent(config.slug)}` : ''}`, { cache: 'no-store' });
            const data = await res.json();
            if (Array.isArray(data.discounts)) {
                setDiscounts(data.discounts);
            }
            if (Array.isArray(data.coupons)) {
                setCoupons(data.coupons);
            }
        } catch (e) {
            console.error("Failed to load discounts", e);
        } finally {
            setDiscountsLoading(false);
        }
    };

    // Get applicable discount for an item
    const getItemDiscount = useCallback((item: InventoryItem): Discount | null => {
        if (!discounts.length) return null;
        for (const d of discounts) {
            if (d.appliesTo === 'all') return d;
            if (d.appliesTo === 'collection' && item.category && Array.isArray(d.appliesToIds)) {
                const itemCat = item.category.trim().toLowerCase();
                const match = d.appliesToIds.some(id => id.trim().toLowerCase() === itemCat);
                if (match) return d;
            }
            if (d.appliesTo === 'product' && Array.isArray(d.appliesToIds) && d.appliesToIds.includes(item.id)) {
                return d;
            }
        }
        return null;
    }, [discounts]);

    // Apply coupon code
    const applyCouponCode = useCallback((code: string) => {
        setCouponError('');
        const found = coupons.find(c => c.code?.toUpperCase() === code.toUpperCase());
        if (!found) {
            setCouponError('Invalid coupon code');
            return false;
        }
        setAppliedCoupon(found);
        return true;
    }, [coupons]);

    // Calculate discount amount for cart total (coupon-based)
    const calculateCouponDiscount = useCallback((baseTotal: number, totalQty: number = 0): number => {
        if (!appliedCoupon) return 0;

        // Check requirement
        let met = false;
        if (appliedCoupon.minRequirement === 'none') {
            met = true;
        } else if (appliedCoupon.minRequirement === 'quantity') {
            met = totalQty >= (appliedCoupon.minRequirementValue || 0);
        } else if (appliedCoupon.minRequirement === 'amount') {
            met = baseTotal >= (appliedCoupon.minRequirementValue || 0);
        }

        if (!met) return 0;

        if (appliedCoupon.type === 'percentage') {
            return baseTotal * (appliedCoupon.value / 100);
        } else if (appliedCoupon.type === 'fixed_amount') {
            return Math.min(appliedCoupon.value, baseTotal);
        }
        return 0;
    }, [appliedCoupon]);

    // Calculate discounted price for an individual item
    const calculateItemDiscountedPrice = useCallback((item: InventoryItem, basePrice: number, qty: number = 1, cartSubtotal: number = 0, cartQty: number = 0): { discountedPrice: number; discount: Discount | null; savings: number; met: boolean } => {
        const discount = getItemDiscount(item);
        if (!discount) return { discountedPrice: basePrice, discount: null, savings: 0, met: false };

        // Check requirement
        let met = false;
        if (discount.minRequirement === 'none') {
            met = true;
        } else if (discount.minRequirement === 'quantity') {
            // If it applies to all, check total cart quantity, otherwise check line quantity
            const checkQty = discount.appliesTo === 'all' ? (cartQty || qty) : qty;
            met = checkQty >= discount.minRequirementValue;
        } else if (discount.minRequirement === 'amount') {
            // If it applies to all, check cart subtotal, otherwise check line amount
            const checkAmount = discount.appliesTo === 'all' ? (cartSubtotal || (basePrice * qty)) : (basePrice * qty);
            met = checkAmount >= discount.minRequirementValue;
        }

        if (!met) return { discountedPrice: basePrice, discount, savings: 0, met: false };

        let discountedPrice = basePrice;
        if (discount.type === 'percentage') {
            discountedPrice = basePrice * (1 - discount.value / 100);
        } else if (discount.type === 'fixed_amount') {
            discountedPrice = Math.max(0, basePrice - discount.value);
        }
        const savings = basePrice - discountedPrice;
        return { discountedPrice, discount, savings, met: true };
    }, [getItemDiscount]);

    useEffect(() => {
        const root = document.documentElement;
        const p = (config?.theme?.primaryColor || "#0ea5e9").trim();
        const s = (config?.theme?.secondaryColor || "#22c55e").trim();
        root.style.setProperty("--pp-primary", p);
        root.style.setProperty("--pp-secondary", s);

        const styleId = "kiosk-custom-styles";
        let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
        if (!styleEl) {
            styleEl = document.createElement("style");
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }

        styleEl.textContent = `
            @keyframes meshFloat {
                0%, 100% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
            }
            
            /* Themed Scrollbar */
            .kiosk-scrollbar::-webkit-scrollbar {
                width: 10px;
                height: 10px;
            }
            .kiosk-scrollbar::-webkit-scrollbar-track {
                background: transparent;
            }
            .kiosk-scrollbar::-webkit-scrollbar-thumb {
                background: ${s}80;
                border-radius: 10px;
                border: 2px solid transparent;
                background-clip: padding-box;
            }
            .kiosk-scrollbar::-webkit-scrollbar-thumb:hover {
                background: ${s};
                border: 2px solid transparent;
                background-clip: padding-box;
            }
            .kiosk-scrollbar {
                scrollbar-width: thin;
                scrollbar-color: ${s}80 transparent;
            }
        `;
    }, [config]);

    const updateScrollButtons = useCallback(() => {
        const el = categoryScrollRef.current;
        if (el) {
            setCanScrollLeft(el.scrollLeft > 10);
            setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
        }
    }, []);

    useEffect(() => {
        const el = categoryScrollRef.current;
        if (el) {
            updateScrollButtons();
            el.addEventListener("scroll", updateScrollButtons);
            window.addEventListener("resize", updateScrollButtons);
            return () => {
                el.removeEventListener("scroll", updateScrollButtons);
                window.removeEventListener("resize", updateScrollButtons);
            };
        }
    }, [updateScrollButtons, categories]);

    const scrollCategories = (dir: "left" | "right") => {
        const el = categoryScrollRef.current;
        if (el) {
            el.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" });
        }
    };

    const addToCart = (item: InventoryItem) => {
        setCart(prev => {
            const existing = prev.find(p => p.id === item.id);
            if (existing) {
                return prev.map(p => p.id === item.id ? { ...p, qty: p.qty + 1 } : p);
            }
            return [...prev, { id: item.id, qty: 1, item }];
        });
    };

    const removeFromCart = (id: string) => {
        setCart(prev => prev.filter(p => p.id !== id));
    };

    const updateQty = (id: string, delta: number) => {
        setCart(prev => prev.map(p => {
            if (p.id === id) return { ...p, qty: Math.max(1, p.qty + delta) };
            return p;
        }));
    };

    const reset = () => {
        setCart([]);
        setCheckoutOpen(false);
        setQrValue("");
        setSearchQuery("");
        setSelectedCategory(null);
        setAppliedCoupon(null);
        setCouponCode('');
        setCouponError('');
    };

    // Calculate totals with discounts
    const cartTotals = useMemo(() => {
        let rawSubtotal = 0;
        let itemSavings = 0;
        const totalQty = cart.reduce((acc, line) => acc + line.qty, 0);

        // First pass: Calculate raw subtotal from base prices
        cart.forEach(line => {
            rawSubtotal += (line.item.priceUsd || 0) * line.qty;
        });

        // Second pass: Calculate savings with requirement context
        cart.forEach(line => {
            const { savings } = calculateItemDiscountedPrice(
                line.item,
                line.item.priceUsd || 0,
                line.qty,
                rawSubtotal,
                totalQty
            );
            itemSavings += savings * line.qty;
        });

        const subtotal = rawSubtotal - itemSavings;
        const couponSavings = calculateCouponDiscount(subtotal, totalQty);
        const total = subtotal - couponSavings;
        const totalSavings = itemSavings + couponSavings;

        return { subtotal: rawSubtotal, itemSavings, couponSavings, total, totalSavings };
    }, [cart, calculateItemDiscountedPrice, calculateCouponDiscount]);

    const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
    const pfmt = (n: number) => `${n.toFixed(0)}%`;

    const cartCount = useMemo(() => cart.reduce((acc, line) => acc + line.qty, 0), [cart]);

    const [checkoutError, setCheckoutError] = useState<string | null>(null);

    const handleCheckout = async () => {
        setCheckoutOpen(true);
        setCheckoutError(null);
        try {
            const res = await fetch("/api/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-wallet": merchantWallet },
                body: JSON.stringify({
                    items: cart.map(c => ({ id: c.id, qty: c.qty })),
                    couponCode: appliedCoupon?.code,
                    appliedCoupon: appliedCoupon ? { id: appliedCoupon.id, code: appliedCoupon.code, title: appliedCoupon.title, type: appliedCoupon.type, value: appliedCoupon.value } : undefined,
                    shopSlug: config.slug
                })
            });
            const data = await res.json();
            if (data.receipt?.receiptId || data.receiptId) {
                const rid = data.receipt?.receiptId || data.receiptId;
                // Use portalLink if provided by API, otherwise fallback to local /pay route
                const paymentLink = data.portalLink || `${window.location.origin}/pay/${rid}`;
                setQrValue(paymentLink);
            } else if (data.error) {
                setCheckoutError(data.message || data.error);
            } else {
                setCheckoutError("An unexpected error occurred. Please try again.");
            }
        } catch (e) {
            console.error("Checkout failed", e);
            setCheckoutError("Failed to connect to the server. Please check your connection.");
        }
    };

    // ========================
    // CHECKOUT SCREEN
    // ========================
    if (checkoutOpen) {
        return (
            <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 z-50 flex flex-col items-center justify-center p-8 text-center space-y-8">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] opacity-30" style={{
                        background: `radial-gradient(circle at 30% 30%, ${config.theme?.primaryColor || "#0ea5e9"}40 0%, transparent 50%),
                                     radial-gradient(circle at 70% 70%, ${config.theme?.secondaryColor || "#22c55e"}30 0%, transparent 50%)`,
                        animation: "meshFloat 15s ease-in-out infinite"
                    }} />
                </div>

                <h1 className="text-5xl font-bold text-white relative z-10">Scan to Pay</h1>

                <div className="bg-white p-6 rounded-3xl shadow-2xl relative z-10">
                    <div className="w-72 h-72 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center overflow-hidden">
                        {qrValue ? (
                            <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrValue)}`}
                                alt="Payment QR Code"
                                className="w-64 h-64"
                            />
                        ) : checkoutError ? (
                            <div className="text-red-500 font-bold p-4 text-sm">{checkoutError}</div>
                        ) : (
                            <div className="text-gray-400 animate-pulse font-medium text-lg">Generating...</div>
                        )}
                    </div>
                </div>

                <div className="text-5xl font-bold text-white font-mono relative z-10">{fmt(cartTotals.total)}</div>
                <p className="text-white/70 max-w-md relative z-10">Open your mobile wallet app and scan the QR code to complete your purchase.</p>

                <button onClick={reset} className="px-8 py-4 rounded-2xl border-2 border-white/30 text-white text-lg font-medium hover:bg-white/10 transition-all flex items-center gap-2 relative z-10">
                    <RotateCcw size={20} /> Start New Order
                </button>
            </div>
        );
    }

    // ========================
    // MAIN KIOSK UI
    // ========================
    return (
        <div className="h-screen w-screen overflow-hidden flex flex-col lg:flex-row bg-background">
            {/* ======================================== */}
            {/* LEFT: MAIN CONTENT (Header + Categories sticky, Items scroll) */}
            {/* ======================================== */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                {/* STICKY HEADER */}
                <header className="flex-shrink-0 px-6 py-4 border-b bg-background/95 backdrop-blur-xl z-30">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-4">
                            {config.theme?.brandLogoUrl ? (
                                <img src={config.theme.brandLogoUrl} className="h-12 w-auto object-contain" alt="Logo" />
                            ) : (
                                <div
                                    className="h-12 w-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                                    style={{ background: config.theme?.primaryColor || "#0ea5e9" }}
                                >
                                    {config.name?.charAt(0) || "K"}
                                </div>
                            )}
                            <div>
                                <h1 className="text-xl font-bold">{config.name || "Kiosk"}</h1>
                                <p className="text-xs text-muted-foreground">Self-Service | Tap to Order</p>
                            </div>
                        </div>

                        {/* Search Bar */}
                        <div className="flex-1 max-w-xl ml-auto">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search menu..."
                                    className="w-full h-11 pl-12 pr-4 rounded-xl border bg-muted/50 focus:bg-background focus:border-primary transition-all text-base outline-none"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery("")}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-muted flex items-center justify-center hover:bg-muted-foreground/20"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </header>

                {/* STICKY CATEGORY BAR */}
                {categories.length > 0 && (
                    <div className="flex-shrink-0 relative border-b bg-background/95 backdrop-blur-sm z-20">
                        {canScrollLeft && (
                            <button
                                onClick={() => scrollCategories("left")}
                                className="absolute left-0 top-0 bottom-0 z-10 w-10 bg-gradient-to-r from-background to-transparent flex items-center justify-start pl-1"
                            >
                                <ChevronLeft size={20} className="text-muted-foreground" />
                            </button>
                        )}

                        <div
                            ref={categoryScrollRef}
                            className="flex items-center gap-2 px-6 py-3 overflow-x-auto scrollbar-hide scroll-smooth"
                            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                        >
                            <button
                                onClick={() => setSelectedCategory(null)}
                                className={`flex-shrink-0 px-4 py-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${selectedCategory === null
                                    ? "text-white shadow-md"
                                    : "bg-muted hover:bg-muted-foreground/10"
                                    }`}
                                style={selectedCategory === null ? { background: config.theme?.primaryColor || "#0ea5e9" } : {}}
                            >
                                All Items
                            </button>
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                                    className={`flex-shrink-0 px-4 py-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap flex items-center gap-1.5 ${selectedCategory === cat
                                        ? "text-white shadow-md"
                                        : "bg-muted hover:bg-muted-foreground/10"
                                        }`}
                                    style={selectedCategory === cat ? { background: config.theme?.primaryColor || "#0ea5e9" } : {}}
                                >
                                    <Tag size={12} />
                                    {cat}
                                </button>
                            ))}
                        </div>

                        {canScrollRight && (
                            <button
                                onClick={() => scrollCategories("right")}
                                className="absolute right-0 top-0 bottom-0 z-10 w-10 bg-gradient-to-l from-background to-transparent flex items-center justify-end pr-1"
                            >
                                <ChevronRight size={20} className="text-muted-foreground" />
                            </button>
                        )}
                    </div>
                )}

                {/* SCROLLABLE PRODUCT GRID */}
                <div className="flex-1 overflow-y-auto p-6 kiosk-scrollbar">
                    {loading ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {Array.from({ length: 12 }).map((_, i) => (
                                <div key={i} className="rounded-xl overflow-hidden bg-muted animate-pulse">
                                    <div className="aspect-square" />
                                    <div className="p-3 space-y-2">
                                        <div className="h-4 bg-muted-foreground/20 rounded w-3/4" />
                                        <div className="h-4 bg-muted-foreground/20 rounded w-1/2" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
                                <Search className="w-8 h-8 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-semibold mb-1">No Items Found</h3>
                            <p className="text-muted-foreground text-sm max-w-sm">
                                {searchQuery ? `No results for "${searchQuery}".` : "No items in this category yet."}
                            </p>
                            {(searchQuery || selectedCategory) && (
                                <button onClick={() => { setSearchQuery(""); setSelectedCategory(null); }} className="mt-4 px-4 py-2 rounded-lg border hover:bg-muted text-sm font-medium">
                                    Clear Filters
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {(() => {
                                // Group items by category
                                const grouped: Record<string, typeof filteredItems> = {};
                                const uncategorized: typeof filteredItems = [];

                                filteredItems.forEach(item => {
                                    if (item.category) {
                                        if (!grouped[item.category]) grouped[item.category] = [];
                                        grouped[item.category].push(item);
                                    } else {
                                        uncategorized.push(item);
                                    }
                                });

                                // Generate unique colors for each category based on theme
                                const getCategoryColor = (cat: string, index: number) => {
                                    const primary = config.theme?.primaryColor || "#0ea5e9";
                                    const secondary = config.theme?.secondaryColor || "#22c55e";

                                    // Parse primary color to get base hue
                                    let baseHue = 200; // default blue
                                    try {
                                        if (primary.startsWith("#")) {
                                            const r = parseInt(primary.slice(1, 3), 16);
                                            const g = parseInt(primary.slice(3, 5), 16);
                                            const b = parseInt(primary.slice(5, 7), 16);
                                            const max = Math.max(r, g, b);
                                            const min = Math.min(r, g, b);
                                            if (max === min) baseHue = 0;
                                            else if (max === r) baseHue = ((g - b) / (max - min)) * 60;
                                            else if (max === g) baseHue = (2 + (b - r) / (max - min)) * 60;
                                            else baseHue = (4 + (r - g) / (max - min)) * 60;
                                            if (baseHue < 0) baseHue += 360;
                                        }
                                    } catch { }

                                    // Generate unique hue for each category
                                    let hash = 0;
                                    for (let i = 0; i < cat.length; i++) {
                                        hash = (hash << 5) - hash + cat.charCodeAt(i);
                                        hash = hash & hash;
                                    }
                                    const hueShift = (Math.abs(hash) % 8) * 45; // 8 distinct colors
                                    const hue = (baseHue + hueShift) % 360;

                                    return {
                                        bg: `hsl(${hue}, 75%, 55%)`,
                                        bgLight: `hsla(${hue}, 75%, 55%, 0.1)`,
                                        border: `hsla(${hue}, 75%, 55%, 0.3)`
                                    };
                                };

                                const sortedCategories = Object.keys(grouped).sort();

                                return (
                                    <>
                                        {sortedCategories.map((cat, catIndex) => {
                                            const color = getCategoryColor(cat, catIndex);
                                            const catItems = grouped[cat];

                                            return (
                                                <div key={cat} className="space-y-4">
                                                    {/* Category Header */}
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="w-1 h-8 rounded-full"
                                                            style={{ background: color.bg }}
                                                        />
                                                        <h3 className="text-xl font-bold">{cat}</h3>
                                                        <span className="text-sm text-muted-foreground">({catItems.length})</span>
                                                    </div>

                                                    {/* Category Items Grid */}
                                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                                        {catItems.map(item => {
                                                            const inCart = cart.find(c => c.id === item.id);
                                                            const itemDiscount = getItemDiscount(item);
                                                            const basePrice = Number(item.priceUsd || 0);
                                                            const { discountedPrice, savings } = calculateItemDiscountedPrice(item, basePrice);

                                                            return (
                                                                <button
                                                                    key={item.id}
                                                                    onClick={() => addToCart(item)}
                                                                    className={`group relative bg-card border-2 rounded-xl overflow-hidden text-left flex flex-col h-full shadow-sm transition-all active:scale-[0.98] ${inCart ? "ring-2 ring-primary/30" : "hover:shadow-lg"
                                                                        }`}
                                                                    style={{
                                                                        borderColor: inCart ? color.bg : color.border,
                                                                        backgroundColor: inCart ? color.bgLight : undefined
                                                                    }}
                                                                >
                                                                    {itemDiscount && (
                                                                        <DiscountBanner
                                                                            discount={itemDiscount}
                                                                            compact={true}
                                                                            primaryColor={config.theme?.primaryColor}
                                                                            secondaryColor={config.theme?.secondaryColor}
                                                                        />
                                                                    )}
                                                                    <div className="aspect-square relative overflow-hidden">
                                                                        {item.images && item.images.length > 0 && item.images[0] ? (
                                                                            <img src={item.images[0]} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt={item.name} />
                                                                        ) : (
                                                                            <MeshGradientPlaceholder
                                                                                seed={item.id + (item.name || "item")}
                                                                                className="w-full h-full"
                                                                                primaryColor={color.bg}
                                                                                secondaryColor={config.theme?.secondaryColor}
                                                                                logoUrl={config.theme?.brandLogoUrl}
                                                                            />
                                                                        )}

                                                                        {inCart && (
                                                                            <div className="absolute bottom-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-lg z-20" style={{ background: color.bg }}>
                                                                                {inCart.qty}
                                                                            </div>
                                                                        )}

                                                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all flex items-center justify-center">
                                                                            <div className="w-12 h-12 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all text-white shadow-xl" style={{ background: color.bg }}>
                                                                                <Plus size={24} />
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="p-3 flex-1 flex flex-col">
                                                                        <h3 className="font-medium text-sm leading-tight line-clamp-2">{item.name}</h3>
                                                                        <div className="mt-auto pt-2">
                                                                            {savings > 0 ? (
                                                                                <div className="flex flex-col">
                                                                                    <span className="text-[10px] text-muted-foreground line-through">
                                                                                        {fmt(basePrice)}
                                                                                    </span>
                                                                                    <span className="text-lg font-bold text-green-600">
                                                                                        {fmt(discountedPrice)}
                                                                                    </span>
                                                                                </div>
                                                                            ) : (
                                                                                <span className="text-lg font-bold" style={{ color: color.bg }}>
                                                                                    {fmt(basePrice)}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* Uncategorized items */}
                                        {uncategorized.length > 0 && (
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-1 h-8 rounded-full bg-muted-foreground/30" />
                                                    <h3 className="text-xl font-bold">Other</h3>
                                                    <span className="text-sm text-muted-foreground">({uncategorized.length})</span>
                                                </div>
                                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                                    {uncategorized.map(item => {
                                                        const inCart = cart.find(c => c.id === item.id);
                                                        const itemDiscount = getItemDiscount(item);
                                                        const basePrice = Number(item.priceUsd || 0);
                                                        const { discountedPrice, savings } = calculateItemDiscountedPrice(item, basePrice);

                                                        return (
                                                            <button
                                                                key={item.id}
                                                                onClick={() => addToCart(item)}
                                                                className={`group relative bg-card border rounded-xl overflow-hidden text-left flex flex-col h-full shadow-sm transition-all active:scale-[0.98] ${inCart ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/30 hover:shadow-lg"
                                                                    }`}
                                                            >
                                                                {itemDiscount && (
                                                                    <DiscountBanner
                                                                        discount={itemDiscount}
                                                                        compact={true}
                                                                        primaryColor={config.theme?.primaryColor}
                                                                        secondaryColor={config.theme?.secondaryColor}
                                                                    />
                                                                )}
                                                                <div className="aspect-square relative overflow-hidden">
                                                                    {item.images && item.images.length > 0 && item.images[0] ? (
                                                                        <img src={item.images[0]} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt={item.name} />
                                                                    ) : (
                                                                        <MeshGradientPlaceholder
                                                                            seed={item.id + (item.name || "item")}
                                                                            className="w-full h-full"
                                                                            primaryColor={config.theme?.primaryColor}
                                                                            secondaryColor={config.theme?.secondaryColor}
                                                                            logoUrl={config.theme?.brandLogoUrl}
                                                                        />
                                                                    )}

                                                                    {inCart && (
                                                                        <div className="absolute bottom-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-lg z-20" style={{ background: config.theme?.primaryColor || "#0ea5e9" }}>
                                                                            {inCart.qty}
                                                                        </div>
                                                                    )}

                                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all flex items-center justify-center">
                                                                        <div className="w-12 h-12 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all text-white shadow-xl" style={{ background: config.theme?.primaryColor || "#0ea5e9" }}>
                                                                            <Plus size={24} />
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="p-3 flex-1 flex flex-col">
                                                                    <h3 className="font-medium text-sm leading-tight line-clamp-2">{item.name}</h3>
                                                                    <div className="mt-auto pt-2">
                                                                        {savings > 0 ? (
                                                                            <div className="flex flex-col">
                                                                                <span className="text-[10px] text-muted-foreground line-through">
                                                                                    {fmt(basePrice)}
                                                                                </span>
                                                                                <span className="text-lg font-bold text-green-600">
                                                                                    {fmt(discountedPrice)}
                                                                                </span>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-lg font-bold" style={{ color: config.theme?.primaryColor || "#0ea5e9" }}>
                                                                                {fmt(basePrice)}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </div>
            </div>

            {/* ======================================== */}
            {/* RIGHT: STICKY CART SIDEBAR */}
            {/* ======================================== */}
            <div className="w-full lg:w-[380px] bg-card border-l flex flex-col h-[35vh] lg:h-full flex-shrink-0">
                {/* Cart Header */}
                <div className="flex-shrink-0 p-4 border-b flex items-center justify-between">
                    <h2 className="font-bold text-lg flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ background: config.theme?.primaryColor || "#0ea5e9" }}>
                            <ShoppingCart size={16} />
                        </div>
                        Order
                        {cartCount > 0 && <span className="ml-1 px-2 py-0.5 rounded-full bg-muted text-sm">{cartCount}</span>}
                    </h2>
                    <button onClick={() => setCart([])} disabled={!cart.length} className="text-xs text-destructive hover:underline disabled:opacity-30 flex items-center gap-1">
                        <Trash2 size={12} /> Clear
                    </button>
                </div>

                {/* Cart Items */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2 kiosk-scrollbar">
                    {cart.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                            <ShoppingCart className="w-10 h-10 mb-3 opacity-30" />
                            <p className="text-sm font-medium">Cart is empty</p>
                            <p className="text-xs mt-1">Tap items to add</p>
                        </div>
                    ) : (
                        cart.map(line => (
                            <div key={line.id} className="flex gap-3 bg-muted/50 p-2 rounded-lg items-center">
                                <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
                                    {line.item.images && line.item.images.length > 0 && line.item.images[0] ? (
                                        <img src={line.item.images[0]} className="w-full h-full object-cover" alt="" />
                                    ) : (
                                        <MeshGradientPlaceholder
                                            seed={line.id + (line.item.name || "")}
                                            className="w-full h-full"
                                            primaryColor={config.theme?.primaryColor}
                                            secondaryColor={config.theme?.secondaryColor}
                                        />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm truncate">{line.item.name}</div>
                                    <div className="flex items-center gap-2">
                                        {(() => {
                                            const basePrice = Number(line.item.priceUsd || 0);
                                            const { discountedPrice, savings } = calculateItemDiscountedPrice(line.item, basePrice);
                                            if (savings > 0) {
                                                return (
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs text-muted-foreground line-through opacity-70">
                                                            {fmt(basePrice * line.qty)}
                                                        </span>
                                                        <span className="font-bold text-green-600">
                                                            {fmt(discountedPrice * line.qty)}
                                                        </span>
                                                    </div>
                                                );
                                            }
                                            return (
                                                <span className="font-bold" style={{ color: config.theme?.primaryColor || "#0ea5e9" }}>
                                                    {fmt(basePrice * line.qty)}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={e => { e.stopPropagation(); line.qty > 1 ? updateQty(line.id, -1) : removeFromCart(line.id); }} className="w-7 h-7 rounded-lg border flex items-center justify-center hover:bg-muted">
                                        <Minus size={14} />
                                    </button>
                                    <span className="w-6 text-center text-sm font-bold">{line.qty}</span>
                                    <button onClick={e => { e.stopPropagation(); updateQty(line.id, 1); }} className="w-7 h-7 rounded-lg border flex items-center justify-center hover:bg-muted">
                                        <Plus size={14} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Checkout Footer */}
                <div className="flex-shrink-0 p-4 border-t space-y-3">
                    {/* Coupon Code Input */}
                    <div className="space-y-2">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Coupon code"
                                className="flex-1 h-10 px-3 border rounded-lg bg-background text-sm font-mono uppercase"
                                value={couponCode}
                                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                                disabled={!!appliedCoupon}
                            />
                            {appliedCoupon ? (
                                <button
                                    onClick={() => { setAppliedCoupon(null); setCouponCode(''); setCouponError(''); }}
                                    className="px-3 py-2 border rounded-lg text-sm hover:bg-muted"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            ) : (
                                <button
                                    onClick={() => applyCouponCode(couponCode)}
                                    className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                                    style={{ background: config.theme?.secondaryColor || "#22c55e" }}
                                    disabled={!couponCode.trim()}
                                >
                                    Apply
                                </button>
                            )}
                        </div>
                        {couponError && <p className="text-xs text-red-500">{couponError}</p>}
                        {appliedCoupon && (
                            <div className="flex items-center gap-2 text-xs text-green-600">
                                <Ticket className="w-3 h-3" />
                                <span>{appliedCoupon.title} applied!</span>
                            </div>
                        )}
                    </div>

                    {/* Savings */}
                    {cartTotals.totalSavings > 0 && (
                        <div className="flex items-center justify-between text-green-600">
                            <span className="text-sm flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                Total Savings
                                {appliedCoupon && <span className="text-xs opacity-80">({appliedCoupon.code})</span>}
                            </span>
                            <span className="text-sm font-medium">-{fmt(cartTotals.totalSavings)}</span>
                        </div>
                    )}

                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Total</span>
                        <span className="text-2xl font-bold">{fmt(cartTotals.total)}</span>
                    </div>
                    <button
                        onClick={handleCheckout}
                        disabled={cart.length === 0}
                        className="w-full h-14 rounded-xl font-bold text-lg text-white shadow-lg transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        style={{ background: cart.length > 0 ? `linear-gradient(135deg, ${config.theme?.primaryColor || "#0ea5e9"}, ${config.theme?.secondaryColor || "#22c55e"})` : "#94a3b8" }}
                    >
                        <ShoppingCart size={20} /> Checkout
                    </button>
                </div>
            </div>
        </div>
    );
}
