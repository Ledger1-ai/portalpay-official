"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
    InventoryItem,
    RestaurantItemAttributes,
    isRestaurantAttributes,
    RestaurantModifierGroup,
    RestaurantModifier
} from "@/types/inventory";
import { useServerAssistant } from "@/hooks/useServerAssistant";
import { buildServerAssistantPrompt } from "@/agent/prompts/serverAssistantPrompt";
import { QRCode } from "react-qrcode-logo";
import { ChevronLeft, ShoppingBag, Mic, MicOff, X, Volume2, VolumeX, Trash2, Plus, Minus, LayoutGrid } from "lucide-react";

// Helper for currency
const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount);
};

// Deterministic color generator for categories
const getCategoryColor = (category: string) => {
    let hash = 0;
    for (let i = 0; i < category.length; i++) {
        hash = category.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
        "border-red-500/50 text-red-400 bg-red-950/30",
        "border-orange-500/50 text-orange-400 bg-orange-950/30",
        "border-amber-500/50 text-amber-400 bg-amber-950/30",
        "border-yellow-500/50 text-yellow-400 bg-yellow-950/30",
        "border-lime-500/50 text-lime-400 bg-lime-950/30",
        "border-green-500/50 text-green-400 bg-green-950/30",
        "border-emerald-500/50 text-emerald-400 bg-emerald-950/30",
        "border-teal-500/50 text-teal-400 bg-teal-950/30",
        "border-cyan-500/50 text-cyan-400 bg-cyan-950/30",
        "border-sky-500/50 text-sky-400 bg-sky-950/30",
        "border-blue-500/50 text-blue-400 bg-blue-950/30",
        "border-indigo-500/50 text-indigo-400 bg-indigo-950/30",
        "border-violet-500/50 text-violet-400 bg-violet-950/30",
        "border-purple-500/50 text-purple-400 bg-purple-950/30",
        "border-fuchsia-500/50 text-fuchsia-400 bg-fuchsia-950/30",
        "border-pink-500/50 text-pink-400 bg-pink-950/30",
        "border-rose-500/50 text-rose-400 bg-rose-950/30",
    ];
    return colors[Math.abs(hash) % colors.length];
};

interface HandheldInterfaceProps {
    merchantWallet: string;
    employeeId: string;
    employeeName: string;
    employeeRole: string;
    sessionId: string;
    onLogout: () => Promise<void>;
    brandName: string;
    logoUrl?: string;
    theme?: any;
    items?: any[];
    tables?: string[];
}

interface CartItem {
    item: InventoryItem;
    quantity: number;
    modifiers: RestaurantModifier[];
    instanceId: string;
}

export default function HandheldInterface({
    merchantWallet,
    employeeId,
    employeeName,
    sessionId,
    onLogout,
    brandName,
    logoUrl,
    theme,
    items = [],
    tables = []
}: HandheldInterfaceProps) {
    // -- THEME & STYLES (Dark Mode Default) --
    // We enforce a dark theme for the handheld interface
    const primaryColor = theme?.primaryColor || "#0ea5e9";

    // -- STATE --
    // -- STATE --
    const [activeCategory, setActiveCategory] = useState<string>("All");
    const [cart, setCart] = useState<CartItem[]>([]);
    const [view, setView] = useState<"menu" | "modifiers" | "tables" | "report" | "payment">("menu");

    // Modifier State
    const [selectedItemForModifiers, setSelectedItemForModifiers] = useState<InventoryItem | null>(null);
    const [pendingModifiers, setPendingModifiers] = useState<RestaurantModifier[]>([]);

    // -- TABLE STATE --
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [activeOrders, setActiveOrders] = useState<Record<string, Array<{ id: string; status: string; total: number; items: any[]; createdAt: number }>>>({});
    const [showTableDetails, setShowTableDetails] = useState(false);
    const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<any | null>(null);
    const [isSplitting, setIsSplitting] = useState(false);
    const [splitSelection, setSplitSelection] = useState<Record<string, number>>({}); // items to split: index -> qty

    // -- REPORT STATE --
    const [reportData, setReportData] = useState<{ totalTips: number; totalSales: number; orders: any[] } | null>(null);

    const fetchReport = async () => {
        try {
            const res = await fetch(`/api/terminal/session?sessionId=${sessionId}&merchantWallet=${merchantWallet}&includeOrders=true`);
            const data = await res.json();
            if (data.session && data.orders) {
                setReportData({
                    totalTips: data.session.totalTips,
                    totalSales: data.session.totalSales,
                    orders: data.orders
                });
            }
        } catch (e) {
            console.error("Failed to fetch report", e);
        }
    };

    // 4. Report View
    const renderReportView = () => {
        return (
            <div className="absolute inset-0 z-30 flex flex-col bg-neutral-900 overflow-hidden text-white font-sans animate-in fade-in">
                <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 shrink-0 bg-neutral-900/50 backdrop-blur-md">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-lg">In-Service Report</span>
                    </div>
                    <button onClick={() => setView("menu")} className="text-xs font-bold bg-white/10 px-3 py-1.5 rounded-lg hover:bg-white/20">
                        Close
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                            <div className="text-xs text-emerald-400 font-bold uppercase tracking-wider mb-1">Total Tips</div>
                            <div className="text-2xl font-mono font-bold text-emerald-300">
                                {reportData ? formatCurrency(reportData.totalTips) : "..."}
                            </div>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                            <div className="text-xs text-neutral-400 font-bold uppercase tracking-wider mb-1">Total Sales</div>
                            <div className="text-2xl font-mono font-bold text-neutral-200">
                                {reportData ? formatCurrency(reportData.totalSales) : "..."}
                            </div>
                        </div>
                    </div>

                    {/* Order List */}
                    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-white/10 bg-white/5 font-bold text-sm text-neutral-300">
                            Session History
                        </div>
                        <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto">
                            {reportData?.orders.map((o: any) => (
                                <div key={o.id} className="px-4 py-3 flex items-center justify-between text-sm">
                                    <div className="flex flex-col gap-0.5">
                                        <div className="font-mono font-bold text-white">#{o.receiptId.slice(-4)}</div>
                                        <div className="text-xs text-neutral-500">{new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Table {o.tableNumber || 'N/A'}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-neutral-200">{formatCurrency(o.totalUsd)}</div>
                                        {o.tipAmount > 0 ? (
                                            <div className="text-xs font-bold text-emerald-400">+{formatCurrency(o.tipAmount)} tip</div>
                                        ) : (
                                            <div className="text-xs text-neutral-600">No tip</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {(!reportData?.orders || reportData.orders.length === 0) && (
                                <div className="p-8 text-center text-neutral-500 italic text-sm">No transactions yet</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };
    // -- POLLING & STATUS --
    // Fetch active kitchen orders to update table status
    useEffect(() => {
        if (!merchantWallet) return;

        const fetchOrders = async () => {
            try {
                const res = await fetch(`/api/kitchen/orders?wallet=${merchantWallet}&status=new,preparing,ready,completed`, {
                    headers: { 'x-wallet': merchantWallet }
                });
                if (!res.ok) return;
                const data = await res.json();
                console.log("Handheld Polling Data:", data); // DEBUG
                if (data.orders && Array.isArray(data.orders)) {
                    // Map orders to tables - GROUPING them
                    const statusMap: Record<string, Array<{ id: string; status: string; total: number; items: any[]; createdAt: number }>> = {};

                    data.orders.forEach((o: any) => {
                        console.log(`Processing Order ${o.receiptId}: Table=${o.tableNumber}, Status=${o.kitchenStatus}`); // DEBUG
                        if (o.tableNumber && o.kitchenStatus) {
                            if (!statusMap[o.tableNumber]) {
                                statusMap[o.tableNumber] = [];
                            }
                            statusMap[o.tableNumber].push({
                                id: o.receiptId,
                                status: o.kitchenStatus,
                                total: o.totalUsd,
                                items: o.lineItems || [],
                                createdAt: o.createdAt
                            });
                        }
                    });
                    console.log("Constructed StatusMap:", statusMap); // DEBUG
                    setActiveOrders(statusMap);
                }
            } catch (e) {
                console.error("Polling failed", e);
            }
        };

        fetchOrders();
        const interval = setInterval(fetchOrders, 5000); // Poll every 5s
        return () => clearInterval(interval);
    }, [merchantWallet]);

    // -- DATA PROCESSING --
    const restaurantItems = useMemo(() => {
        return items.filter(item => {
            const isRestaurantPack = item.industryPack === 'restaurant';
            const hasRestaurantAttrs = isRestaurantAttributes(item.attributes);
            return isRestaurantPack || hasRestaurantAttrs;
        });
    }, [items]);

    const categories = useMemo(() => {
        const cats = new Set<string>();
        cats.add("All");
        restaurantItems.forEach(i => {
            if (i.category) cats.add(i.category);
            const attrs = i.attributes;
            if (attrs) {
                if (isRestaurantAttributes(attrs) && attrs.data?.menuSection) {
                    cats.add(attrs.data.menuSection);
                } else if ((attrs as any).menuSection) {
                    cats.add((attrs as any).menuSection);
                }
            }
        });
        return Array.from(cats).sort();
    }, [restaurantItems]);

    const displayedItems = useMemo(() => {
        if (activeCategory === "All") return restaurantItems;
        return restaurantItems.filter(i => {
            const matchesCategory = i.category === activeCategory;
            let matchesSection = false;
            const attrs = i.attributes;
            if (attrs) {
                if (isRestaurantAttributes(attrs) && attrs.data?.menuSection === activeCategory) {
                    matchesSection = true;
                } else if ((attrs as any).menuSection === activeCategory) {
                    matchesSection = true;
                }
            }
            return matchesCategory || matchesSection;
        });
    }, [restaurantItems, activeCategory]);

    // -- HANDLERS --

    const initiateAddToCart = (item: InventoryItem) => {
        let groups: RestaurantModifierGroup[] = [];
        const attrs = item.attributes;

        if (attrs) {
            if (isRestaurantAttributes(attrs)) {
                groups = attrs.data.modifierGroups || [];
            } else if ((attrs as any).modifierGroups) {
                groups = (attrs as any).modifierGroups;
            }
        }

        if (groups && groups.length > 0) {
            setSelectedItemForModifiers(item);
            setPendingModifiers([]);
            setView("modifiers");
            return;
        }

        addToCart(item, []);
    };

    const addToCart = (item: InventoryItem, modifiers: RestaurantModifier[]) => {
        setCart(prev => {
            if (modifiers.length === 0) {
                const existing = prev.find(p => p.item.id === item.id && p.modifiers.length === 0);
                if (existing) {
                    return prev.map(p => p.instanceId === existing.instanceId ? { ...p, quantity: p.quantity + 1 } : p);
                }
            }
            return [...prev, {
                item,
                quantity: 1,
                modifiers,
                instanceId: Math.random().toString(36).substring(7)
            }];
        });
        setView("menu");
        setSelectedItemForModifiers(null);
        setPendingModifiers([]);
    };

    const handleRemoveFromCart = (instanceId: string) => {
        setCart(prev => prev.filter(p => p.instanceId !== instanceId));
    };

    // Calculate totals
    const getLineTotal = (line: CartItem) => {
        const itemPrice = line.item.priceUsd;
        const modsPrice = line.modifiers.reduce((sum, m) => sum + m.priceAdjustment, 0);
        return (itemPrice + modsPrice) * line.quantity;
    };
    const cartTotal = cart.reduce((sum, line) => sum + getLineTotal(line), 0);
    const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);

    const [isCartOpen, setIsCartOpen] = useState(false);

    // -- VOICE --
    const { state: voiceState, startListening, toggleMute, stop } = useServerAssistant();
    const [showVoiceOverlay, setShowVoiceOverlay] = useState(false);

    const handleVoiceClick = () => {
        if (voiceState.isListening) {
            stop();
            setShowVoiceOverlay(false);
        } else {
            const instruction = buildServerAssistantPrompt({
                name: brandName,
                description: "Restaurant",
                shortDescription: "Restaurant",
                bio: "",
                merchantWallet: merchantWallet,
                slug: "handheld",
                inventory: restaurantItems.map(i => ({
                    name: i.name,
                    price: i.priceUsd,
                    category: i.category,
                    description: i.description
                }))
            } as any);

            startListening({ instructions: instruction });
            setShowVoiceOverlay(true);
        }
    };

    // -- ORDER SUBMISSION --
    const [isSubmitting, setIsSubmitting] = useState(false);

    const submitOrder = async (tableNum: string) => {
        setIsSubmitting(true);
        try {
            const lineItems = cart.map(c => ({
                id: c.item.id,
                qty: c.quantity,
                selectedModifiers: c.modifiers.map(m => ({
                    modifierId: m.id,
                    name: m.name,
                    priceAdjustment: m.priceAdjustment,
                    quantity: 1
                }))
            }));

            const payload = {
                items: lineItems,
                tableNumber: tableNum,
                kitchenStatus: "new",
                source: "handheld",
                staffId: employeeId,
                servedBy: employeeName,
                note: `Server: ${employeeName}`
            };

            const res = await fetch("/api/orders", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-wallet": merchantWallet
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Failed to submit order");

            setCart([]);
            setIsCartOpen(false);
            setView("tables");
            setActiveCategory("All");
            // Optionally auto-select table to show updated status?
            // setSelectedTable(tableNum);
            // setShowTableDetails(true);
        } catch (e) {
            console.error("Order submit failed", e);
            alert("Failed to submit order. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleTableSelection = (table: string) => {
        setSelectedTable(table);
        if (cart.length > 0) {
            // "Tap to Order" mode - just selects it and shows footer
        } else {
            // View Details mode
            setShowTableDetails(true);
        }
    };

    const handleCheckoutClick = () => {
        setView("tables");
        setIsCartOpen(false);
        setSelectedTable(null);
    };

    // -- SWIPE HANDLING --
    const touchStart = useRef<number | null>(null);
    const touchEnd = useRef<number | null>(null);

    const onTouchStart = (e: React.TouchEvent) => {
        touchEnd.current = null;
        touchStart.current = e.targetTouches[0].clientX;
    };

    const onTouchMove = (e: React.TouchEvent) => {
        touchEnd.current = e.targetTouches[0].clientX;
    };

    const onTouchEnd = () => {
        if (!touchStart.current || !touchEnd.current) return;
        const distance = touchStart.current - touchEnd.current;
        const isRightSwipe = distance < -50;

        if (isRightSwipe) {
            if (view === "modifiers") setView("menu");
            if (showTableDetails) setShowTableDetails(false);
        }
    };

    // -- RENDERERS --

    // 1. Modifiers View
    const renderModifiersView = () => {
        if (!selectedItemForModifiers) return null;
        let groups: RestaurantModifierGroup[] = [];
        const attrs = selectedItemForModifiers.attributes;
        if (attrs) {
            if (isRestaurantAttributes(attrs)) {
                groups = attrs.data.modifierGroups || [];
            } else if ((attrs as any).modifierGroups) {
                groups = (attrs as any).modifierGroups;
            }
        }

        if (groups.length === 0) return null;

        const toggleModifier = (mod: RestaurantModifier, group: RestaurantModifierGroup) => {
            if (group.selectionType === 'single') {
                setPendingModifiers(prev => {
                    const othersRemoved = prev.filter(m => !group.modifiers.find(gm => gm.id === m.id));
                    return [...othersRemoved, mod];
                });
            } else {
                setPendingModifiers(prev => {
                    const exists = prev.find(m => m.id === mod.id);
                    return exists ? prev.filter(m => m.id !== mod.id) : [...prev, mod];
                });
            }
        };

        const isGroupSatisfied = (group: RestaurantModifierGroup) => {
            if (!group.required) return true;
            const count = pendingModifiers.filter(m => group.modifiers.find(gm => gm.id === m.id)).length;
            return count >= (group.minSelect || 1);
        };
        const allRequiredSatisfied = groups.every(isGroupSatisfied);
        const currentTotal = selectedItemForModifiers.priceUsd + pendingModifiers.reduce((s, m) => s + m.priceAdjustment, 0);

        return (
            <div
                className="absolute inset-0 z-40 bg-neutral-900 flex flex-col animate-in slide-in-from-right duration-300"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                {/* Header */}
                <div className="h-16 border-b border-white/10 flex items-center justify-between px-4 shrink-0 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-30">
                    <div className="flex items-center">
                        <button
                            onClick={() => setView("menu")}
                            className="w-10 h-10 -ml-2 flex items-center justify-center rounded-full hover:bg-white/10 active:scale-95 text-white"
                        >
                            <ChevronLeft className="w-6 h-6" />
                        </button>
                        <div className="ml-2">
                            <h2 className="font-bold text-white text-lg leading-none">{selectedItemForModifiers.name}</h2>
                            <span className="text-xs text-neutral-400">Customize Item</span>
                        </div>
                    </div>
                    <button
                        onClick={() => addToCart(selectedItemForModifiers, pendingModifiers)}
                        disabled={!allRequiredSatisfied}
                        className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wide transition-all ${allRequiredSatisfied
                            ? "bg-emerald-500 text-black hover:bg-emerald-400 shadow-lg shadow-emerald-500/20"
                            : "bg-white/10 text-white/20 cursor-not-allowed"
                            }`}
                    >
                        Add
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-32">
                    {groups.map(group => (
                        <div key={group.id} className="space-y-3">
                            <div className="flex justify-between items-baseline px-1">
                                <h4 className="font-bold text-neutral-200 text-lg">{group.name}</h4>
                                <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${group.required ? "bg-red-500/20 text-red-400" : "bg-neutral-800 text-neutral-500"
                                    }`}>
                                    {group.required ? "Required" : "Optional"}
                                </span>
                            </div>
                            <div className="grid grid-cols-1 gap-1">
                                {group.modifiers.map(mod => {
                                    const isSelected = pendingModifiers.some(m => m.id === mod.id);
                                    return (
                                        <button
                                            key={mod.id}
                                            onClick={() => toggleModifier(mod, group)}
                                            className={`flex justify-between items-center p-4 rounded-xl border text-left transition-all active:scale-[0.99] ${isSelected
                                                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_-5px_var(--tw-shadow-color)] shadow-emerald-500/30"
                                                : "border-white/5 bg-white/5 hover:bg-white/10 text-neutral-300 hover:border-white/10"
                                                }`}
                                        >
                                            <span className="font-medium">{mod.name}</span>
                                            {mod.priceAdjustment !== 0 && (
                                                <span className={`text-xs font-mono px-2 py-1 rounded bg-black/20 ${mod.priceAdjustment > 0 ? "text-emerald-400" : "text-green-400"}`}>
                                                    {mod.priceAdjustment > 0 ? "+" : ""}
                                                    {formatCurrency(mod.priceAdjustment)}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black/90 to-transparent pt-12">
                    <button
                        disabled={!allRequiredSatisfied}
                        onClick={() => addToCart(selectedItemForModifiers, pendingModifiers)}
                        className={`w-full h-14 rounded-xl font-bold text-white shadow-lg text-lg flex items-center justify-between px-6 transition-all ${allRequiredSatisfied
                            ? "bg-emerald-600 hover:bg-emerald-500 active:scale-95 shadow-emerald-900/50"
                            : "bg-neutral-800 text-neutral-500 cursor-not-allowed border border-white/5"
                            }`}
                    >
                        <span>{allRequiredSatisfied ? "Add to Order" : "Select Required Options"}</span>
                        <span className="font-mono">{formatCurrency(currentTotal)}</span>
                    </button>
                </div>
            </div>
        );
    };




    const handlePaymentClick = (order: any) => {
        setSelectedOrderForPayment(order);
        setView("payment");
    };

    // ... (rest of state)
    // 5. Payment View (with Split & Print)
    const [splitMode, setSplitMode] = useState<"items" | "ratio">("items");

    // Effect to set default split mode based on item count
    useEffect(() => {
        if (selectedOrderForPayment && (selectedOrderForPayment.items || []).length <= 1) {
            setSplitMode("ratio");
        }
    }, [selectedOrderForPayment]);
    const [splitParties, setSplitParties] = useState(2);
    const [splitRatios, setSplitRatios] = useState<number[]>([0.5, 0.5]);
    const [splitResult, setSplitResult] = useState<{ source: any; newReceipts: any[] } | null>(null);
    const [resultIndex, setResultIndex] = useState(0); // For carousel
    const [activeHandle, setActiveHandle] = useState<number | null>(null);

    // Update ratios when party count changes
    useEffect(() => {
        const equal = 1 / splitParties;
        const newRatios = Array(splitParties).fill(equal);
        // Adjust last to ensure sum 1
        newRatios[splitParties - 1] = 1 - (equal * (splitParties - 1));
        setSplitRatios(newRatios);
    }, [splitParties]);

    const renderPaymentView = () => {
        // If we have a result, show the Carousel View
        if (splitResult) {
            const allReceipts = [splitResult.source, ...splitResult.newReceipts];
            const currentReceipt = allReceipts[resultIndex];
            const currentId = currentReceipt.id.replace("receipt:", "");

            const origin = typeof window !== "undefined" ? window.location.origin : "";
            const portalUrl = `${origin}/portal/${encodeURIComponent(currentId)}?recipient=${encodeURIComponent(merchantWallet)}`;

            return (
                <div className="absolute inset-0 z-[70] flex flex-col bg-neutral-950 animate-in slide-in-from-bottom duration-500">
                    <div className="h-16 border-b border-white/10 flex items-center justify-between px-4">
                        <button onClick={() => {
                            setSplitResult(null);
                            setIsSplitting(false);
                            setView("tables");
                            setSelectedOrderForPayment(null);
                        }} className="bg-white/10 p-2 rounded-full">
                            <ChevronLeft className="w-6 h-6 text-white" />
                        </button>
                        <h2 className="text-xl font-bold text-white">Split Receipts</h2>
                        <button onClick={() => {
                            setSplitResult(null);
                            setIsSplitting(false);
                            setView("tables");
                            setSelectedOrderForPayment(null);
                        }} className="text-blue-400 font-bold text-sm">Done</button>
                    </div>

                    <div className="flex-1 overflow-hidden relative flex flex-col pointer-events-none">
                        {/* Carousel Container */}
                        <div className="flex-1 flex items-center justify-center p-8 pointer-events-auto">
                            <div className="w-full max-w-sm bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center space-y-6">
                                <div className="text-center">
                                    <h3 className="text-neutral-500 font-bold uppercase tracking-wider text-xs">Receipt {resultIndex + 1} of {allReceipts.length}</h3>
                                    <div className="font-mono text-2xl font-bold text-black mt-1">
                                        {formatCurrency(currentReceipt.total || currentReceipt.totalUsd)}
                                    </div>
                                </div>

                                <QRCode
                                    value={portalUrl}
                                    size={180}
                                    fgColor="#000000"
                                    bgColor="transparent"
                                    logoImage={logoUrl}
                                    removeQrCodeBehindLogo={true}
                                />

                                <button
                                    onClick={() => {
                                        // Print Logic for this specific receipt
                                        // Update the portal content to this receipt temporarily?
                                        // Or just use the global print mechanism but we need to supply the data.
                                        // For simplicity, we can't easily print NON-selected orders with the current portal pattern 
                                        // unless we temporarily select it.
                                        const prev = selectedOrderForPayment;
                                        setSelectedOrderForPayment(currentReceipt);
                                        setTimeout(() => {
                                            window.print();
                                            // setSelectedOrderForPayment(prev); // Keep it or not?
                                        }, 100);
                                    }}
                                    className="w-full h-12 bg-black text-white rounded-xl font-bold active:scale-95 transition-all text-sm flex items-center justify-center gap-2"
                                >
                                    Print Receipt #{resultIndex + 1}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Notches */}
                    <div className="h-20 flex items-center justify-center gap-3">
                        {allReceipts.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setResultIndex(i)}
                                className={`w-3 h-3 rounded-full transition-all ${i === resultIndex ? "bg-white scale-125" : "bg-white/20 hover:bg-white/40"}`}
                            />
                        ))}
                    </div>
                </div>
            );
        }

        if (!selectedOrderForPayment) return null;

        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const portalUrl = `${origin}/portal/${encodeURIComponent(selectedOrderForPayment.id)}?recipient=${encodeURIComponent(merchantWallet)}`;

        const confirmSplit = async () => {
            // Ratio Mode Payload
            if (splitMode === 'ratio') {
                // Check if ratios sum strict 1?
                // Send multi_ratio payload
                try {
                    const res = await fetch(`/api/receipts/${selectedOrderForPayment.id}/split`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "x-wallet": merchantWallet },
                        body: JSON.stringify({ mode: "multi_ratio", ratios: splitRatios })
                    });

                    if (res.ok) {
                        const data = await res.json();
                        // data contains { source, newReceipts }
                        setSplitResult({ source: data.source, newReceipts: data.newReceipts });
                        setResultIndex(0);
                    } else {
                        const j = await res.json();
                        alert("Split failed: " + (j.error || "Unknown"));
                    }
                } catch (e) { console.error(e); alert("Split failed"); }
                return;
            }

            // Item Mode Payload
            const itemsToSplit: any[] = [];
            const indices = Object.keys(splitSelection).map(Number);
            const sourceItems = selectedOrderForPayment.items || [];

            indices.forEach(idx => {
                const qty = splitSelection[idx];
                if (qty > 0 && sourceItems[idx]) {
                    itemsToSplit.push({
                        label: sourceItems[idx].label || sourceItems[idx].name,
                        priceUsd: sourceItems[idx].priceUsd,
                        qty: qty
                    });
                }
            });

            if (itemsToSplit.length === 0) return;

            try {
                const res = await fetch(`/api/receipts/${selectedOrderForPayment.id}/split`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-wallet": merchantWallet },
                    body: JSON.stringify({ mode: "items", items: itemsToSplit })
                });
                if (res.ok) {
                    alert("Bill Split Successfully!");
                    setIsSplitting(false);
                    setSplitSelection({});
                    // Refresh
                    setView("tables");
                    setSelectedOrderForPayment(null);
                    setShowTableDetails(false);
                } else {
                    const j = await res.json();
                    alert("Split failed: " + (j.error || "Unknown"));
                }
            } catch (e) {
                console.error(e);
                alert("Split failed");
            }
        };

        return (
            <div className="absolute inset-0 z-[60] flex flex-col bg-neutral-950 animate-in slide-in-from-bottom duration-300">
                <div className="h-16 border-b border-white/10 flex items-center justify-between px-4">
                    <button onClick={() => {
                        if (isSplitting) { setIsSplitting(false); setSplitSelection({}); }
                        else setView("tables");
                    }} className="bg-white/10 p-2 rounded-full">
                        <ChevronLeft className="w-6 h-6 text-white" />
                    </button>
                    <h2 className="text-xl font-bold text-white">{isSplitting ? "Split Bill" : "Collect Payment"}</h2>
                    <div className="w-10"></div>
                </div>

                <div className="flex-1 flex flex-col items-center p-8 space-y-6 overflow-y-auto">

                    {!isSplitting ? (
                        <>
                            <div className="bg-white p-4 rounded-xl shadow-2xl">
                                <QRCode
                                    value={portalUrl}
                                    size={200}
                                    fgColor="#000000"
                                    bgColor="transparent"
                                    qrStyle="dots"
                                    eyeRadius={10}
                                    logoImage={logoUrl}
                                    logoWidth={40}
                                    logoHeight={40}
                                    removeQrCodeBehindLogo={true}
                                    logoPadding={5}
                                    ecLevel="H"
                                    quietZone={10}
                                />
                            </div>

                            <div className="text-center">
                                <div className="text-neutral-400 uppercase text-xs font-bold tracking-widest mb-1">Total Due</div>
                                <div className="text-4xl font-bold font-mono text-white">{formatCurrency(selectedOrderForPayment.total)}</div>
                                <div className="text-[10px] text-neutral-500 mt-2 font-mono">{selectedOrderForPayment.id}</div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 w-full">
                                <button
                                    onClick={() => window.print()}
                                    className="h-16 bg-white/10 text-white rounded-2xl font-bold text-lg active:scale-95 transition-all flex items-center justify-center gap-2 border border-white/5"
                                >
                                    Print Receipt
                                </button>
                                <button
                                    onClick={() => setIsSplitting(true)}
                                    className="h-16 bg-blue-500/10 text-blue-400 border border-blue-500/50 rounded-2xl font-bold text-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    Split Bill
                                </button>
                            </div>

                            <button
                                onClick={async () => {
                                    try {
                                        const res = await fetch(`/api/receipts/${selectedOrderForPayment.id}/pay`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json", "x-wallet": merchantWallet },
                                            body: JSON.stringify({ method: "cash" })
                                        });
                                        if (res.ok) {
                                            alert("Payment Recorded!");
                                            setView("tables");
                                            setSelectedOrderForPayment(null);
                                            setShowTableDetails(false);
                                        }
                                    } catch (e) {
                                        console.error(e);
                                        alert("Payment failed");
                                    }
                                }}
                                className="w-full h-16 bg-emerald-500 text-black rounded-2xl font-bold text-xl active:scale-95 transition-all shadow-[0_0_30px_-5px_rgba(16,185,129,0.4)]"
                            >
                                Mark as Paid (Cash)
                            </button>

                            <p className="text-xs text-neutral-600 max-w-xs mx-auto text-center">
                                Scan with guest's phone to pay with Apple Pay / Card.
                            </p>
                        </>
                    ) : (
                        <div className="w-full h-full flex flex-col">
                            {/* Tabs */}
                            <div className="flex p-1 bg-white/5 rounded-xl mb-4">
                                <button
                                    onClick={() => setSplitMode("items")}
                                    disabled={(selectedOrderForPayment.items || []).length <= 1}
                                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${splitMode === "items"
                                        ? "bg-blue-600 text-white shadow"
                                        : "text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"}`}
                                >
                                    By Item
                                </button>
                                <button
                                    onClick={() => setSplitMode("ratio")}
                                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${splitMode === "ratio" ? "bg-blue-600 text-white shadow" : "text-neutral-400 hover:text-white"}`}
                                >
                                    By Ratio
                                </button>
                            </div>

                            {splitMode === "items" && (
                                <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                                    <div className="bg-white/5 rounded-xl border border-white/10 divide-y divide-white/5">
                                        {(selectedOrderForPayment.items || []).map((item: any, idx: number) => {
                                            const maxQty = item.qty || 1;
                                            const selectedQty = splitSelection[idx] || 0;

                                            return (
                                                <div key={idx} className="p-4 flex items-center justify-between">
                                                    <div className="flex-1">
                                                        <div className="font-bold text-white">{item.label || item.name}</div>
                                                        <div className="text-xs text-neutral-400">{formatCurrency(item.priceUsd)}</div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        {selectedQty > 0 && <span className="font-mono text-emerald-400 font-bold">{selectedQty}x</span>}
                                                        <div className="flex bg-black/40 rounded-lg p-1">
                                                            <button
                                                                onClick={() => setSplitSelection(prev => ({ ...prev, [idx]: Math.max(0, (prev[idx] || 0) - 1) }))}
                                                                className="w-8 h-8 flex items-center justify-center bg-white/10 rounded hover:bg-white/20"
                                                            >
                                                                <Minus className="w-4 h-4" />
                                                            </button>
                                                            <div className="w-8 flex items-center justify-center text-sm font-mono text-neutral-500">
                                                                / {maxQty}
                                                            </div>
                                                            <button
                                                                onClick={() => setSplitSelection(prev => ({ ...prev, [idx]: Math.min(maxQty, (prev[idx] || 0) + 1) }))}
                                                                className="w-8 h-8 flex items-center justify-center bg-white/10 rounded hover:bg-white/20"
                                                            >
                                                                <Plus className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {splitMode === "ratio" && (
                                <div className="flex-1 flex flex-col items-center justify-center space-y-6 mb-4 px-4">
                                    <div className="w-full space-y-2">
                                        <div className="flex justify-between items-center text-sm font-bold text-neutral-400 uppercase tracking-wider">
                                            <span>Number of Parties</span>
                                            <div className="flex bg-white/10 rounded-lg p-1 gap-1">
                                                <button onClick={() => setSplitParties(Math.max(2, splitParties - 1))} className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded active:bg-white/20 text-white font-bold transition-colors">-</button>
                                                <span className="w-10 flex items-center justify-center text-white font-mono text-lg">{splitParties}</span>
                                                <button onClick={() => setSplitParties(Math.min(6, splitParties + 1))} className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded active:bg-white/20 text-white font-bold transition-colors">+</button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Multi-Slider Visualization */}
                                    <div
                                        className="w-full pt-8 pb-4 relative select-none touch-none"
                                        onPointerDown={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const x = e.clientX - rect.left;
                                            const w = rect.width;
                                            const val = Math.max(0, Math.min(1, x / w));

                                            // Calculate cumulative positions for handles
                                            let currentSum = 0;
                                            const handles = []; // indices 0 to N-2
                                            for (let i = 0; i < splitParties - 1; i++) {
                                                currentSum += splitRatios[i];
                                                handles.push(currentSum);
                                            }

                                            // Find closest handle
                                            let closestIdx = -1;
                                            let minDist = 0.1; // Capture threshold

                                            handles.forEach((hPos, idx) => {
                                                const dist = Math.abs(val - hPos);
                                                if (dist < minDist) {
                                                    minDist = dist;
                                                    closestIdx = idx;
                                                }
                                            });

                                            if (closestIdx !== -1) {
                                                setActiveHandle(closestIdx);
                                                e.currentTarget.setPointerCapture(e.pointerId);
                                            }
                                        }}
                                        onPointerMove={(e) => {
                                            if (activeHandle === null) return;
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const x = e.clientX - rect.left;
                                            const w = rect.width;
                                            const rawVal = x / w;

                                            // Reconstruct cumulative
                                            let cum = [];
                                            let s = 0;
                                            for (let i = 0; i < splitParties - 1; i++) {
                                                s += splitRatios[i];
                                                cum.push(s);
                                            }

                                            // Constraints
                                            const minGap = 0.05; // 5% min width per party
                                            const prevLimit = (activeHandle > 0) ? cum[activeHandle - 1] + minGap : minGap;
                                            const nextLimit = (activeHandle < cum.length - 1) ? cum[activeHandle + 1] - minGap : 1 - minGap;

                                            const newVal = Math.max(prevLimit, Math.min(nextLimit, rawVal));

                                            // Update cum
                                            cum[activeHandle] = newVal;

                                            // Reconstruct ratios
                                            const newRatios = [];
                                            let prev = 0;
                                            for (let i = 0; i < cum.length; i++) {
                                                newRatios.push(cum[i] - prev);
                                                prev = cum[i];
                                            }
                                            newRatios.push(1 - prev); // Last party

                                            setSplitRatios(newRatios);
                                        }}
                                        onPointerUp={(e) => {
                                            setActiveHandle(null);
                                            e.currentTarget.releasePointerCapture(e.pointerId);
                                        }}
                                    >
                                        {/* Track */}
                                        <div className="w-full h-12 bg-neutral-800 rounded-xl relative overflow-hidden flex shadow-inner ring-1 ring-white/10 pointer-events-none">
                                            {splitRatios.map((r, i) => (
                                                <div key={i} style={{ width: `${r * 100}%` }} className={`h-full border-r border-black/20 last:border-0 ${i % 2 === 0 ? "bg-blue-600" : "bg-purple-600"
                                                    } flex items-center justify-center transition-all duration-75 ease-out relative group`}>
                                                    <span className="text-sm font-bold text-white drop-shadow-md select-none">{Math.round(r * 100)}%</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Handles */}
                                        {Array.from({ length: splitParties - 1 }).map((_, i) => {
                                            // Calculate pos
                                            const pos = splitRatios.slice(0, i + 1).reduce((a, b) => a + b, 0);
                                            return (
                                                <div
                                                    key={i}
                                                    className={`absolute top-8 bottom-4 w-4 -ml-2 z-10 cursor-col-resize group outline-none isolate ${activeHandle === i ? 'z-50' : 'z-20'}`}
                                                    style={{ left: `${pos * 100}%` }}
                                                >
                                                    {/* Visual Handle */}
                                                    <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full shadow-xl flex items-center justify-center transition-transform ${activeHandle === i ? "scale-110 bg-white shadow-blue-500/50" : "bg-white/90 hover:bg-white hover:scale-105"}`}>
                                                        <div className="w-1 h-4 bg-neutral-300 rounded mb-4 pointer-events-none" />
                                                        <div className="w-1 h-4 bg-neutral-300 rounded mx-[1px] pointer-events-none" />
                                                        <div className="w-1 h-4 bg-neutral-300 rounded mt-4 pointer-events-none" />
                                                    </div>

                                                    {/* Vertical Guidelines */}
                                                    <div className={`absolute -top-8 bottom-0 w-px bg-white/50 left-1/2 pointer-events-none transition-opacity ${activeHandle === i ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`} />
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Breakdown List */}
                                    <div className="w-full space-y-2">
                                        {splitRatios.map((r, i) => (
                                            <div key={i} className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/5">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-2 h-2 rounded-full ${i % 2 === 0 ? "bg-blue-500" : "bg-purple-500"}`} />
                                                    <span className="text-sm font-medium text-neutral-300">Party {i + 1}</span>
                                                </div>
                                                <div className="text-right flex items-baseline gap-2">
                                                    <div className="text-xs text-neutral-500">{Math.round(r * 100)}%</div>
                                                    <div className="font-bold text-white font-mono">{formatCurrency(selectedOrderForPayment.total * r)}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <button onClick={() => {
                                        const equal = 1 / splitParties;
                                        setSplitRatios(Array(splitParties).fill(equal));
                                    }} className="w-full py-3 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/20 text-xs font-bold uppercase tracking-wider text-neutral-400 transition-colors">
                                        Reset to Equal Split
                                    </button>
                                </div>
                            )}

                            <button
                                onClick={confirmSplit}
                                disabled={splitMode === 'items' && Object.keys(splitSelection).every(k => !splitSelection[Number(k)])}
                                className="w-full h-16 bg-blue-500 text-white rounded-2xl font-bold text-xl active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none mt-auto shadow-lg shadow-blue-900/20"
                            >
                                {splitMode === 'items' ? 'Split Selected Items' : `Split Total (${formatCurrency(selectedOrderForPayment.total)})`}
                            </button>
                        </div>
                    )}

                    {/* Hidden Printable Receipt - Portaled to avoid layout issues */}
                    {/* Simplified and robust styles for printing */}
                    {!isSplitting && selectedOrderForPayment && typeof window !== "undefined" && createPortal(
                        <div className="hidden print:block fixed inset-0 z-[9999] bg-white text-black p-0 overflow-visible w-full h-full">
                            <style type="text/css" media="print">
                                {`
                                    @page { size: auto; margin: 0mm; }
                                    html, body { 
                                        height: 100%; 
                                        margin: 0 !important; 
                                        padding: 0 !important; 
                                        background-color: white !important; 
                                        color: black !important;
                                        overflow: visible !important;
                                    }
                                    body > *:not(.print-visible-portal) {
                                        display: none !important;
                                    }
                                    .print-visible-portal {
                                        display: block !important;
                                        position: absolute;
                                        top: 0;
                                        left: 0;
                                        width: 100%;
                                        height: 100%;
                                        z-index: 99999;
                                        background: white;
                                    }
                                    .thermal-receipt { 
                                        width: 80mm; 
                                        margin: 0 auto; 
                                        padding: 10px; 
                                        font-family: monospace; 
                                        font-size: 12px; 
                                        color: black;
                                    }
                                `}
                            </style>
                            <div className="print-visible-portal">
                                <div className="thermal-receipt">
                                    <div className="flex flex-col items-center mb-4">
                                        {logoUrl && <img src={logoUrl} className="w-12 h-12 object-contain grayscale mb-2" />}
                                        <h2 className="font-bold text-center text-lg">{brandName || "Receipt"}</h2>
                                        <div className="text-xs mt-1">Server: {employeeName?.split('•')[0].trim() || "Staff"}</div>
                                        <div className="text-xs">Table: {selectedTable}</div>
                                    </div>

                                    <div className="border-b border-black border-dashed opacity-50 my-2" />

                                    <div className="text-xs space-y-1 mb-4">
                                        {selectedOrderForPayment.items?.map((item: any, idx: number) => (
                                            <div key={idx} className="flex justify-between">
                                                <span className="truncate pr-2">
                                                    {item.qty > 1 && <span className="font-bold mr-1">{item.qty}x</span>}
                                                    {item.label || item.name}
                                                </span>
                                                <span>{formatCurrency(item.priceUsd * (item.qty || 1))}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="border-b border-black border-dashed opacity-50 my-2" />

                                    <div className="flex justify-between items-center text-lg font-bold my-2">
                                        <span>Total</span>
                                        <span>{formatCurrency(selectedOrderForPayment.total)}</span>
                                    </div>

                                    <div className="flex justify-center my-6">
                                        <QRCode
                                            value={portalUrl}
                                            size={120}
                                            fgColor="#000000"
                                            bgColor="transparent"
                                            qrStyle="dots"
                                            eyeRadius={4}
                                            removeQrCodeBehindLogo={false}
                                            ecLevel="M"
                                            quietZone={0}
                                        />
                                    </div>

                                    <div className="text-center text-[10px] font-mono opacity-70 mt-4">
                                        Receipt #{selectedOrderForPayment.id.slice(-6)}
                                        <br />
                                        {new Date().toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}
                </div>
            </div>
        );
    };

    // 2. Table Details Overlay
    const renderTableDetails = () => {
        if (!showTableDetails || !selectedTable) return null;

        const tableOrders = activeOrders[selectedTable] || [];
        const totalTableValue = tableOrders.reduce((sum, o) => sum + o.total, 0);

        return (
            <div className="absolute inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-xl animate-in slide-in-from-bottom duration-300">
                <div className="h-16 border-b border-white/10 flex items-center justify-between px-4 shrink-0">
                    <button
                        onClick={() => setShowTableDetails(false)}
                        className="w-10 h-10 -ml-2 flex items-center justify-center rounded-full hover:bg-white/10 text-white"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div className="flex flex-col items-center">
                        <h2 className="font-bold text-xl text-white">Table {selectedTable}</h2>
                        <span className="text-xs text-neutral-400">{tableOrders.length} active receipts</span>
                    </div>
                    <div className="w-10" />
                </div>

                <div className="flex-1 p-4 overflow-y-auto space-y-4">
                    {tableOrders.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-64 text-neutral-500">
                            <span className="text-sm">No active orders</span>
                        </div>
                    )}

                    {tableOrders.sort((a, b) => b.createdAt - a.createdAt).map(order => {
                        let statusColor = "text-neutral-400 border-neutral-800";
                        if (order.status === 'new') statusColor = "text-orange-400 border-orange-500/30 bg-orange-950/20";
                        else if (order.status === 'preparing') statusColor = "text-yellow-400 border-yellow-500/30 bg-yellow-950/20";
                        else if (order.status === 'ready') statusColor = "text-emerald-400 border-green-500/30 bg-green-950/20";
                        else if (order.status === 'completed') statusColor = "text-neutral-400 border-neutral-700/30 bg-neutral-900";

                        return (
                            <div key={order.id} className={`rounded-xl border p-4 ${statusColor}`}>
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-bold text-lg">#{order.id.slice(-6)}</span>
                                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-black/20">
                                            {order.status}
                                        </span>
                                    </div>
                                    <span className="font-bold font-mono text-lg text-white">{formatCurrency(order.total)}</span>
                                </div>
                                <div className="space-y-1 mt-3 border-t border-black/10 pt-2 opacity-80">
                                    {order.items?.map((item: any, idx: number) => (
                                        <div key={idx} className="flex justify-between text-sm">
                                            <span className="text-neutral-200">
                                                {item.qty > 1 && <span className="font-bold mr-1">{item.qty}x</span>}
                                                {item.label}
                                            </span>
                                            <span className="font-mono opacity-60">{formatCurrency(item.priceUsd)}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-3 text-[10px] opacity-50 flex justify-between">
                                    <span>Placed: {new Date(order.createdAt).toLocaleTimeString()}</span>
                                    <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                                </div>

                                {order.status === 'completed' && (
                                    <button
                                        onClick={() => handlePaymentClick(order)}
                                        className="mt-4 w-full h-10 bg-emerald-600 text-white rounded-lg font-bold text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
                                    >
                                        <span>Collect Payment</span>
                                        <span className="bg-black/20 px-1.5 rounded text-xs font-mono">{formatCurrency(order.total)}</span>
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="p-4 border-t border-white/10 bg-neutral-900">
                    <div className="flex justify-between items-center mb-4 px-1">
                        <span className="text-neutral-400 font-medium">Table Total</span>
                        <span className="text-2xl font-bold text-white font-mono">{formatCurrency(totalTableValue)}</span>
                    </div>
                </div>
            </div>
        );
    }

    // 3. Tables Grid
    const renderTablesView = () => {
        return (
            <div className="absolute inset-0 z-20 flex flex-col bg-neutral-900 overflow-hidden text-white font-sans animate-in fade-in">
                {renderTableDetails()}

                <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 shrink-0 bg-neutral-900/50 backdrop-blur-md">
                    <div className="flex items-center gap-2">
                        <LayoutGrid className="w-5 h-5 text-emerald-500" />
                        <span className="font-bold text-lg">
                            {cart.length > 0 ? "Select Table for Order" : "Tables"}
                        </span>
                    </div>
                    <button onClick={() => setView("menu")} className="text-xs font-bold bg-white/10 px-3 py-1.5 rounded-lg hover:bg-white/20">
                        Close
                    </button>
                </div>

                <div className="flex-1 p-4 overflow-y-auto">
                    {cart.length > 0 && (
                        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                            <div>
                                <div className="text-emerald-400 font-bold text-sm uppercase tracking-wide">Ready to Submit</div>
                                <div className="text-white font-mono text-xl font-bold">{cartCount} items • {formatCurrency(cartTotal)}</div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-24">
                        {tables.map(table => {
                            const ongoingOrders = activeOrders[table] || [];
                            const isActive = ongoingOrders.length > 0;

                            // Visuals based on occupancy
                            const containerClass = isActive
                                ? "bg-neutral-800 border-neutral-700"
                                : "bg-neutral-900 border-white/5";

                            return (
                                <button
                                    key={table}
                                    onClick={() => handleTableSelection(table)}
                                    disabled={isSubmitting}
                                    className={`relative p-4 rounded-2xl border flex flex-col items-start justify-between gap-2 transition-all active:scale-95 min-h-[140px] ${containerClass} hover:border-white/20`}
                                >
                                    <div className="w-full flex justify-between items-start">
                                        <span className="text-4xl font-bold font-mono text-neutral-200">{table}</span>
                                        {isActive && (
                                            <span className="font-mono font-bold text-xs bg-black/40 px-2 py-1 rounded text-neutral-300">
                                                {formatCurrency(ongoingOrders.reduce((acc, o) => acc + o.total, 0))}
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-auto w-full">
                                        {isActive ? (
                                            <div className="flex flex-wrap gap-1.5">
                                                {ongoingOrders.map((o, idx) => {
                                                    let dotColor = "bg-neutral-500";
                                                    if (o.status === 'new') dotColor = "bg-orange-500 shadow-[0_0_8px] shadow-orange-500/50";
                                                    if (o.status === 'preparing') dotColor = "bg-yellow-500 shadow-[0_0_8px] shadow-yellow-500/50";
                                                    if (o.status === 'ready') dotColor = "bg-emerald-500 shadow-[0_0_8px] shadow-emerald-500/50";
                                                    if (o.status === 'completed') dotColor = "bg-neutral-600";

                                                    return (
                                                        <div key={idx} className={`w-3 h-3 rounded-full ${dotColor}`} />
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <span className="text-xs uppercase font-bold tracking-widest text-neutral-600">Vacant</span>
                                        )}
                                    </div>

                                    {/* Selection Halo for 'Order' mode */}
                                    {cart.length > 0 && (
                                        <div className="absolute inset-0 border-2 border-dashed border-white/20 rounded-2xl hover:border-emerald-500 hover:bg-emerald-500/5 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                                            <span className="bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                                                {isSubmitting ? "Sending..." : "Tap to Order"}
                                            </span>
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                        {tables.length === 0 && (
                            <div className="col-span-full py-12 text-center text-neutral-500 border border-dashed border-white/10 rounded-2xl">
                                <p className="text-sm">No tables available.</p>
                            </div>
                        )}
                    </div>
                    {cart.length > 0 && selectedTable && (
                        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black/90 to-transparent pt-12">
                            <button
                                onClick={() => submitOrder(selectedTable)}
                                disabled={isSubmitting}
                                className="w-full h-14 rounded-xl font-bold text-white shadow-lg text-lg flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 shadow-emerald-900/50 transition-all"
                            >
                                {isSubmitting ? "Sending..." : `Send Order to Table ${selectedTable}`}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // 2. Menu View
    return (
        <div className="flex flex-col h-screen bg-black text-white overflow-hidden font-sans select-none relative">

            {/* BACKGROUND AMBIENCE */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[100px] mix-blend-screen" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] mix-blend-screen" />
            </div>

            {/* TOP BAR */}
            <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 shrink-0 z-20 bg-black/50 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    {logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logoUrl} className="h-8 w-8 rounded-full object-cover border border-white/10" alt="Logo" />
                    ) : (
                        <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs">
                            {brandName.substring(0, 2).toUpperCase()}
                        </div>
                    )}
                    <div className="leading-tight">
                        <h1 className="font-bold text-sm text-neutral-200">{brandName}</h1>
                        <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wide">{employeeName}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setView(view === "tables" ? "menu" : "tables")}
                        className={`text-[10px] font-bold px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5 ${view === "tables"
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            : "bg-white/5 text-neutral-400 border-white/10 hover:bg-white/10"
                            }`}
                    >
                        <LayoutGrid className="w-3 h-3" />
                        {view === "tables" ? "MENU" : "TABLES"}
                    </button>
                    <button
                        onClick={() => {
                            if (view === "report") {
                                setView("menu");
                            } else {
                                fetchReport();
                                setView("report");
                            }
                        }}
                        className={`text-[10px] font-bold px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5 ${view === "report"
                            ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                            : "bg-white/5 text-neutral-400 border-white/10 hover:bg-white/10"
                            }`}
                    >
                        Report
                    </button>
                    <button onClick={onLogout} className="text-[10px] font-bold text-red-400 bg-red-950/30 border border-red-500/20 px-3 py-1.5 rounded-full hover:bg-red-900/50 active:scale-95 transition-all">
                        LOGOUT
                    </button>
                </div>
            </div>

            {/* MAIN AREA */}
            <div className="flex-1 flex overflow-hidden relative z-10">

                {/* CATEGORIES SIDEBAR */}
                <div className="w-24 border-r border-white/10 flex flex-col shrink-0 overflow-y-auto no-scrollbar bg-neutral-900/50">
                    {categories.map(cat => {
                        const isActive = activeCategory === cat;
                        const colorClass = getCategoryColor(cat); // Pre-calculate deterministic color

                        return (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`p-1 py-3 flex flex-col items-center justify-center border-b border-white/5 transition-all relative group h-24 ${isActive ? "bg-white/5" : "text-neutral-500 hover:text-neutral-300"
                                    }`}
                            >
                                <div className={`w-12 h-12 rounded-2xl mb-2 flex items-center justify-center border text-[10px] font-bold shadow-sm transition-all duration-300 ${isActive ? `${colorClass} scale-110 shadow-[0_0_15px_-5px_currentColor]` : "bg-neutral-800 border-white/5 text-neutral-600 grayscale"
                                    }`}>
                                    {cat.substring(0, 2).toUpperCase()}
                                </div>
                                <span className={`text-[9px] font-bold uppercase tracking-wider text-center px-1 leading-tight ${isActive ? "text-white" : ""}`}>
                                    {cat}
                                </span>

                                {/* Active Indicator Line */}
                                {isActive && (
                                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-current text-white/50" />
                                )}
                            </button>
                        )
                    })}
                </div>

                {/* ITEM GRID */}
                <div className="flex-1 p-3 overflow-y-auto pb-32">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {displayedItems.map(item => {
                            // Determine item color from category
                            const catColor = getCategoryColor(item.category || "All").split(" ")[1]; // extract text-color class approximated

                            return (
                                <button
                                    key={item.id}
                                    onClick={() => initiateAddToCart(item)}
                                    className="bg-neutral-800/50 border border-white/5 rounded-2xl p-4 flex flex-col items-start text-left h-40 active:scale-95 transition-all relative overflow-hidden group hover:border-white/20 hover:bg-neutral-800"
                                >
                                    <div className="font-bold text-sm leading-snug mb-1 line-clamp-2 w-full text-neutral-200 group-hover:text-white transition-colors">
                                        {item.name}
                                    </div>
                                    {item.description && (
                                        <div className="text-[10px] text-neutral-500 line-clamp-2 mb-auto leading-relaxed">
                                            {item.description}
                                        </div>
                                    )}

                                    <div className="mt-auto w-full flex justify-between items-end">
                                        <div className="font-mono text-sm font-bold text-neutral-300">
                                            {formatCurrency(item.priceUsd)}
                                        </div>
                                        <div className="w-8 h-8 rounded-full bg-white/5 text-neutral-400 flex items-center justify-center text-xl leading-none pb-1 group-hover:bg-emerald-500 group-hover:text-white transition-all shadow-sm">
                                            +
                                        </div>
                                    </div>

                                    {/* Configurable Indicator */}
                                    {(() => {
                                        const attrs = item.attributes;
                                        let hasMods = false;
                                        if (attrs) {
                                            if (isRestaurantAttributes(attrs)) hasMods = (attrs.data.modifierGroups || []).length > 0;
                                            else if ((attrs as any).modifierGroups) hasMods = (attrs as any).modifierGroups.length > 0;
                                        }

                                        return hasMods && (
                                            <div className="absolute top-2 right-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                                            </div>
                                        );
                                    })()}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* CART BAR */}
            <div className="h-auto bg-neutral-900 border-t border-white/10 p-3 z-30 shrink-0 pb-6 shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">
                <button
                    onClick={() => setIsCartOpen(true)}
                    className="w-full bg-white text-black h-14 rounded-2xl font-bold shadow-lg active:scale-95 transition-transform flex items-center justify-between px-6"
                >
                    <div className="flex items-center gap-3">
                        <div className="bg-black/10 rounded-full w-8 h-8 flex items-center justify-center text-xs font-mono font-bold">
                            {cartCount}
                        </div>
                        <span className="text-sm uppercase tracking-wide">Current Order</span>
                    </div>
                    <span className="font-mono text-xl tracking-tight">{formatCurrency(cartTotal)}</span>
                </button>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); setView("tables"); }}
                        className="h-10 w-10 bg-white/10 text-white rounded-full flex items-center justify-center hover:bg-white/20 active:scale-95 transition-all border border-white/5"
                    >
                        <LayoutGrid className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* CART MODAL (Full Screen Overlay) */}
            {isCartOpen && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col animate-in fade-in">
                    <div className="h-16 flex items-center justify-between px-6 border-b border-white/10">
                        <h2 className="text-xl font-bold text-white">Current Order</h2>
                        <button onClick={() => setIsCartOpen(false)} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-1">
                        {cart.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-neutral-500 gap-4">
                                <ShoppingBag className="w-12 h-12 opacity-20" />
                                <p>Cart is empty</p>
                            </div>
                        ) : (
                            cart.map(line => (
                                <div key={line.instanceId} className="flex justify-between items-start p-4 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors rounded-xl">
                                    <div className="flex items-start gap-4">
                                        <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center font-bold text-xs text-neutral-300 mt-1">
                                            {line.quantity}
                                        </div>
                                        <div>
                                            <div className="font-bold text-neutral-200">{line.item.name}</div>
                                            <div className="text-xs font-mono text-neutral-500">{formatCurrency(line.item.priceUsd)}</div>
                                            {line.modifiers.map(m => (
                                                <div key={m.id} className="text-xs text-neutral-300 mt-1 flex items-center gap-2 font-medium">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
                                                    {m.name}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <div className="font-mono font-bold text-neutral-200">{formatCurrency(getLineTotal(line))}</div>
                                        <button onClick={() => handleRemoveFromCart(line.instanceId)} className="text-red-400 p-2 hover:bg-red-500/10 rounded-lg">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="p-4 border-t border-white/10 bg-neutral-900">
                        <div className="flex justify-between items-center mb-6 px-2">
                            <span className="text-neutral-400 uppercase text-xs font-bold tracking-widest">Total Due</span>
                            <span className="text-3xl font-bold font-mono text-white">{formatCurrency(cartTotal)}</span>
                        </div>
                        <button
                            onClick={handleCheckoutClick}
                            className="w-full h-16 bg-emerald-500 text-black rounded-2xl font-bold text-xl shadow-[0_0_30px_-5px_rgba(16,185,129,0.4)] active:scale-95 transition-all flex items-center justify-center gap-3"
                        >
                            <span>Select Table</span>
                            <ChevronLeft className="w-5 h-5 rotate-180" />
                        </button>
                    </div>
                </div>
            )}

            {/* MODIFIERS VIEW LAYER */}
            {view === "modifiers" && renderModifiersView()}

            {/* TABLES VIEW LAYER */}
            {/* TABLES VIEW LAYER */}
            {view === "tables" && renderTablesView()}

            {/* REPORT VIEW LAYER */}
            {view === "report" && renderReportView()}

            {/* PAYMENT VIEW LAYER */}
            {view === "payment" && renderPaymentView()}

            {/* FLOATING VOICE BUTTON */}
            <button
                onClick={handleVoiceClick}
                className={`fixed bottom-24 right-4 w-16 h-16 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 z-40 border-4 border-black/50 ${voiceState.isListening
                    ? "bg-red-500 scale-110 shadow-[0_0_30px_rgba(239,68,68,0.6)] animate-pulse text-white"
                    : "bg-white text-black hover:scale-105"
                    }`}
            >
                {voiceState.isListening ? (
                    <div className="w-5 h-5 bg-white rounded-sm" />
                ) : (
                    <Mic className="w-7 h-7" />
                )}
            </button>

            {/* VOICE OVERLAY */}
            {showVoiceOverlay && (
                <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-8 animate-in fade-in duration-300">
                    {/* Visualizer and controls similar to previous version but dark mode optimized */}
                    <div className="relative w-64 h-64 flex items-center justify-center mb-12">
                        {/* Rings */}
                        <div className={`absolute inset-0 border-2 rounded-full transition-all duration-300 ${voiceState.isListening ? "border-red-500/50 scale-110 opacity-100" : "border-white/10 scale-100 opacity-50"}`} />
                        <div className={`absolute inset-4 border-2 rounded-full transition-all duration-500 ${voiceState.isListening ? "border-red-500/30 scale-105 opacity-100" : "border-white/5 scale-100 opacity-30"}`} />

                        {/* Audio Reactive Orb using micLevel from hook */}
                        <div
                            className="w-32 h-32 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-full blur-2xl transition-all duration-75 ease-linear opacity-80"
                            style={{
                                transform: `scale(${1 + (voiceState.micLevel || 0) * 2})`,
                            }}
                        />
                        <div
                            className="w-32 h-32 bg-white rounded-full relative z-10 flex items-center justify-center shadow-[0_0_50px_rgba(255,255,255,0.2)]"
                        >
                            <Mic className="w-10 h-10 text-neutral-900" />
                        </div>
                    </div>

                    <div className="text-2xl font-bold text-white mb-2 text-center">
                        {voiceState.isStarting ? "Connecting..." : "Listening"}
                    </div>
                    <p className="text-white/50 text-center max-w-xs mb-12">
                        Ask for recommendations, translations, or stock checks.
                    </p>

                    <div className="flex gap-4">
                        <button onClick={toggleMute} className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 active:scale-95 transition-all">
                            {voiceState.isMuted ? <MicOff /> : <Mic />}
                        </button>
                        <button onClick={() => { stop(); setShowVoiceOverlay(false); }} className="w-16 h-16 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center hover:bg-red-500/30 active:scale-95 transition-all">
                            <X />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
