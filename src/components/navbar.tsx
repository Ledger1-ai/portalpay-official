"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useActiveAccount, useActiveWallet, darkTheme } from "thirdweb/react";
import { signLoginPayload } from "thirdweb/auth";
import { client, chain, getWallets } from "@/lib/thirdweb/client";
import { usePortalThirdwebTheme, getConnectButtonStyle, connectButtonClass } from "@/lib/thirdweb/theme";
import { ChevronDown, Dot, Ellipsis } from "lucide-react";
import { AuthModal } from "./auth-modal";
import { useTranslations } from "next-intl";
import { cachedContainerIdentity } from "@/lib/client-api-cache";
import { useBrand } from "@/contexts/BrandContext";
import { getDefaultBrandSymbol, getDefaultBrandName, getEffectiveBrandKey, resolveBrandSymbol } from "@/lib/branding";

// Dynamic import to avoid SSR hydration mismatch
const ConnectButton = dynamic(() => import("thirdweb/react").then((m) => m.ConnectButton), { ssr: false });

import { useTheme } from "@/contexts/ThemeContext";

type NavItem = { href: string; label: string; ownerOnly?: boolean; authOnly?: boolean };

export function Navbar() {
    const twTheme = usePortalThirdwebTheme();
    const account = useActiveAccount();
    const activeWallet = useActiveWallet();
    const owner = (process.env.NEXT_PUBLIC_OWNER_WALLET || "").toLowerCase();
    const isOwner = (account?.address || "").toLowerCase() === owner && !!owner;
    const wallet = (account?.address || "").toLowerCase();
    const pathname = usePathname();
    const tCommon = useTranslations("common");
    const tNavbar = useTranslations("navbar");
    const tSearch = useTranslations("search");
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [isSocialLogin, setIsSocialLogin] = useState(false);
    const checkingAuth = useRef(false);
    const [authed, setAuthed] = useState(false);
    const [pendingAdminNav, setPendingAdminNav] = useState(false);
    const router = useRouter();
    const brand = useBrand();
    // Container identity (platform vs partner) to control branding load behavior
    const [container, setContainer] = useState<{ containerType: string; brandKey: string }>(() => {
        try {
            const d = typeof document !== 'undefined' ? document.documentElement : null;
            const t = (d?.getAttribute('data-pp-container-type') || '').toLowerCase();
            const k = (d?.getAttribute('data-pp-brand-key') || (brand as any)?.key || '').toString();
            if (t === 'partner' || t === 'platform') {
                return { containerType: t, brandKey: k };
            }
        } catch { }
        const key = String((brand as any)?.key || '');
        const isPlatformBrand = !key || key.toLowerCase() === 'portalpay' || key.toLowerCase() === 'basaltsurge';
        const typeGuess = isPlatformBrand ? 'platform' : 'partner';
        return { containerType: typeGuess, brandKey: key };
    });
    const [wallets, setWallets] = useState<any[]>([]);
    useEffect(() => {
        let mounted = true;
        getWallets()
            .then((w) => { if (mounted) setWallets(w as any[]); })
            .catch(() => setWallets([]));
        return () => { mounted = false; };
    }, []);

    // Site branding from dynamic ThemeContext (which now includes Shop overrides)
    const { theme: ctxTheme } = useTheme();
    // Helper to resolve effective branding, prioritizing partner assets if in partner container
    // CRITICAL: When logged out on BasaltSurge, use static defaults, NOT stored config data
    const effectiveTheme = useMemo(() => {
        const t = ctxTheme;
        const effectiveBrandKey = (t.brandKey || container.brandKey || getEffectiveBrandKey()).toLowerCase();
        const isBasalt = effectiveBrandKey === "basaltsurge";
        const isLoggedIn = Boolean(account?.address);

        // When logged out on BasaltSurge, force static platform defaults
        if (isBasalt && !isLoggedIn) {
            return {
                brandLogoUrl: "/BasaltSurgeWideD.png",
                brandFaviconUrl: t.brandFaviconUrl || "/favicon-32x32.png",
                symbolLogoUrl: "/BasaltSurgeD.png",
                brandName: "BasaltSurge",
                brandLogoShape: "square",
                brandKey: "basaltsurge",
                navbarMode: "logo" as const
            };
        }

        return {
            brandLogoUrl: t.brandLogoUrl,
            brandFaviconUrl: t.brandFaviconUrl,
            symbolLogoUrl: t.symbolLogoUrl,
            brandName: t.brandName,
            brandLogoShape: t.brandLogoShape,
            brandKey: t.brandKey,
            navbarMode: t.navbarMode
        };
    }, [ctxTheme]);

    // Use effectiveTheme instead of local state
    const theme = effectiveTheme;

    // Check authentication status and auto-authenticate or show modal
    useEffect(() => {
        const w = (account?.address || "").toLowerCase();
        if (!w || checkingAuth.current) {
            return;
        }

        checkingAuth.current = true;

        (async () => {
            try {
                // Check if already authenticated
                const me = await fetch('/api/auth/me', { cache: 'no-store' })
                    .then(r => r.ok ? r.json() : { authed: false })
                    .catch(() => ({ authed: false }));

                if (me?.authed) {
                    setAuthed(true);
                    // Already authenticated, just register user
                    try {
                        await fetch('/api/users/register', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ wallet: w })
                        });
                    } catch { }
                    checkingAuth.current = false;
                    return;
                }

                // Detect wallet type
                const walletId = activeWallet?.id;
                const isEmbeddedWallet = walletId === "inApp" || walletId === "embedded";

                // Show authentication modal for both social and external wallets
                setAuthed(false);
                setTimeout(() => {
                    setIsSocialLogin(isEmbeddedWallet);
                    setShowAuthModal(true);
                    checkingAuth.current = false;
                }, 800);
            } catch {
                checkingAuth.current = false;
            }
        })();
    }, [account, account?.address, activeWallet?.id]);

    // Broadcast login/logout so ThemeLoader can immediately apply merchant-scoped theme
    useEffect(() => {
        const w = (account?.address || "").toLowerCase();
        try {
            if (w) {
                window.dispatchEvent(new CustomEvent("pp:auth:logged_in", { detail: { wallet: w } }));
            } else {
                window.dispatchEvent(new CustomEvent("pp:auth:logged_out"));
            }
        } catch { }
    }, [account?.address]);

    // Listen for explicit auth prompt triggers (e.g., clicking gated links)
    useEffect(() => {
        function onPrompt(ev: any) {
            try {
                const d = ev?.detail || {};
                setIsSocialLogin(Boolean(d?.preferSocial));
                setShowAuthModal(true);
            } catch { }
        }
        window.addEventListener("pp:auth:prompt", onPrompt as any);
        return () => {
            window.removeEventListener("pp:auth:prompt", onPrompt as any);
        };
    }, []);

    const items = useMemo<NavItem[]>(() => {
        const base: NavItem[] = [
            { href: "/terminal", label: "Terminal" },
        ];
        if (account?.address) base.push({ href: "/profile", label: tNavbar("profile"), authOnly: true });
        if (account?.address) base.push({ href: "/shop", label: tNavbar("shop"), authOnly: true });
        if (account?.address) base.push({ href: "/admin", label: tNavbar("admin"), authOnly: true });
        return base;
    }, [account?.address, tNavbar]);

    // Animated active underline pointer
    const navRef = useRef<HTMLDivElement | null>(null);
    const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
    const [indicator, setIndicator] = useState<{ left: number; width: number; visible: boolean }>({ left: 0, width: 0, visible: false });
    const [defiEnabled, setDefiEnabled] = useState(true);
    const [defiOverride, setDefiOverride] = useState(false);

    useEffect(() => {
        function update() {
            const container = navRef.current;
            if (!container) { setIndicator(i => ({ ...i, visible: false })); return; }
            // Force Loyalty highlight for loyalty routes
            const isLoyaltyPath = pathname?.startsWith('/live') || pathname?.startsWith('/leaderboard');
            if (isLoyaltyPath) {
                const socialEl = linkRefs.current['/loyalty'];
                if (socialEl) {
                    const cb = socialEl.getBoundingClientRect();
                    const nb = container.getBoundingClientRect();
                    setIndicator({ left: cb.left - nb.left, width: cb.width, visible: true });
                    return;
                }
            }
            // Find active item by pathname prefix
            let active: HTMLAnchorElement | null = null;
            let bestLen = -1;
            for (const k of Object.keys(linkRefs.current)) {
                const el = linkRefs.current[k];
                if (!el) continue;
                const href = el.getAttribute('href') || '';
                if (pathname?.startsWith(href) && href.length > bestLen) { active = el; bestLen = href.length; }
            }
            if (!active) { setIndicator(i => ({ ...i, visible: false })); return; }
            const cb = active.getBoundingClientRect();
            const nb = container.getBoundingClientRect();
            setIndicator({ left: cb.left - nb.left, width: cb.width, visible: true });
        }
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [pathname, items.length]);

    useEffect(() => {
        let cancelled = false;
        const headers: Record<string, string> = { "x-theme-caller": "navbar:defi" };
        if (wallet) headers["x-wallet"] = wallet;
        let skip = false;
        try {
            const u = new URL(window.location.href);
            const path = u.pathname || "";
            skip = path.startsWith("/portal") || path.startsWith("/terminal") || path.startsWith("/pricing");
        } catch { }
        (!skip ? fetch('/api/site/config', { headers, cache: "no-store" }) : Promise.resolve({ json: async () => ({}) } as any))
            .then(r => r.json())
            .then(j => {
                if (cancelled) return;
                const cfg = j?.config || {};
                setDefiEnabled(cfg?.defiEnabled !== false);
            })
            .catch(() => {
                if (cancelled) return;
                setDefiEnabled(true);
            });
        return () => { cancelled = true; };
    }, [wallet]);

    useEffect(() => {
        function updateOverride() {
            try {
                const hasCookie = typeof document !== "undefined" && document.cookie.split(";").some(c => c.trim().startsWith("cb_defi_local_override="));
                const hasSession = typeof window !== "undefined" && window.sessionStorage && window.sessionStorage.getItem("cb:defiLocalOverride") === "1";
                setDefiOverride((hasCookie || hasSession) && isOwner);
            } catch {
                setDefiOverride(false);
            }
        }
        updateOverride();
        const handler = () => updateOverride();
        window.addEventListener("cb:defiLocalOverride", handler as any);
        return () => { window.removeEventListener("cb:defiLocalOverride", handler as any); };
    }, [isOwner]);

    // Search UI state
    const [q, setQ] = useState("");
    const [domain, setDomain] = useState("");
    const [platform, setPlatform] = useState("");
    const [language, setLanguage] = useState("");
    const [minXp, setMinXp] = useState<string>("");
    const [open, setOpen] = useState(false);
    // Profiles sort/filter
    const [liveOnly, setLiveOnly] = useState(false);
    const [userSort, setUserSort] = useState<string>("xp_desc"); // xp_desc | heartbeat_desc | seen_desc | name_asc
    // Shops sort/filter
    const [shopSort, setShopSort] = useState<string>("updated_desc"); // updated_desc | name_asc | slug_asc
    const [shopSetupOnly, setShopSetupOnly] = useState(false);
    const [shopHasSlugOnly, setShopHasSlugOnly] = useState(false);
    const [shopPack, setShopPack] = useState("");
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [loadingShops, setLoadingShops] = useState(false);
    const loading = loadingUsers || loadingShops;
    const [userResults, setUserResults] = useState<any[]>([]);
    const [shopResults, setShopResults] = useState<any[]>([]);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [mobileSocialOpen, setMobileSocialOpen] = useState(false);
    const [socialOpen, setSocialOpen] = useState(false);
    const socialHideRef = useRef<number | null>(null);
    const [defiOpen, setDefiOpen] = useState(false);
    const [mobileDefiOpen, setMobileDefiOpen] = useState(false);
    const defiHideRef = useRef<number | null>(null);
    const dropdownRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        function onDocClick(e: MouseEvent) {
            const t = e.target as Node;
            if (!dropdownRef.current) return;
            if (!dropdownRef.current.contains(t)) setOpen(false);
        }
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    useEffect(() => {
        return () => { if (socialHideRef.current) { clearTimeout(socialHideRef.current); } };
    }, []);

    useEffect(() => {
        return () => { if (defiHideRef.current) { clearTimeout(defiHideRef.current); } };
    }, []);

    useEffect(() => {
        const effective = defiEnabled || (isOwner && defiOverride);
        if (!effective) {
            setDefiOpen(false);
            setMobileDefiOpen(false);
        }
    }, [defiEnabled, defiOverride, isOwner]);

    useEffect(() => {
        const ctrlUsers = new AbortController();
        const ctrlShops = new AbortController();
        const term = q.trim();
        const noFilters = !domain && !platform && !language && !minXp;
        if (term.length < 2 && noFilters) {
            setUserResults([]);
            setShopResults([]);
            setLoadingUsers(false);
            setLoadingShops(false);
            return;
        }
        // Users search (supports filters)
        setLoadingUsers(true);
        const u = new URL('/api/users/search', window.location.origin);
        if (term) u.searchParams.set('q', term);
        if (domain) u.searchParams.set('domains', domain);
        if (platform) u.searchParams.set('platforms', platform);
        if (language) u.searchParams.set('languages', language);
        if (minXp) u.searchParams.set('minXp', String(Math.max(0, parseInt(minXp) || 0)));
        if (liveOnly) u.searchParams.set('live', 'true');
        if (userSort && userSort !== 'xp_desc') u.searchParams.set('sort', userSort);
        u.searchParams.set('limit', '12');
        fetch(u.toString(), { signal: ctrlUsers.signal })
            .then(r => r.json())
            .then(j => { setUserResults(Array.isArray(j?.users) ? j.users : []); })
            .catch(() => { })
            .finally(() => setLoadingUsers(false));
        // Shops search (only when term is present)
        if (term.length >= 2) {
            setLoadingShops(true);
            const s = new URL('/api/shop/search', window.location.origin);
            s.searchParams.set('q', term);
            if (shopSort) s.searchParams.set('sort', shopSort);
            if (shopSetupOnly) s.searchParams.set('setup', 'true');
            if (shopHasSlugOnly) s.searchParams.set('hasSlug', 'true');
            if (shopPack) s.searchParams.set('pack', shopPack);
            s.searchParams.set('limit', '12');
            fetch(s.toString(), { signal: ctrlShops.signal })
                .then(r => r.json())
                .then(j => { setShopResults(Array.isArray(j?.shops) ? j.shops : []); })
                .catch(() => { })
                .finally(() => setLoadingShops(false));
        } else {
            setShopResults([]);
            setLoadingShops(false);
        }
        return () => { ctrlUsers.abort(); ctrlShops.abort(); };
    }, [q, domain, platform, language, minXp, liveOnly, userSort, shopSort, shopSetupOnly, shopHasSlugOnly, shopPack]);

    const socialActive = useMemo(() => pathname?.startsWith('/analytics') || pathname?.startsWith('/leaderboard'), [pathname]);
    const defiEffective = defiEnabled || (isOwner && defiOverride);
    const navZ = (pathname?.startsWith('/terminal') || pathname?.startsWith('/pricing')) ? 'z-[10000]' : 'z-50';
    // Compute branding readiness and whether to show skeleton in partner containers
    const isPartnerContainer = (() => {
        const t = (container.containerType || "").toLowerCase();
        if (t) return t === "partner";
        const bk = (theme.brandKey || container.brandKey || (brand as any)?.key || "").toLowerCase();
        return !!bk && bk !== "portalpay" && bk !== "basaltsurge";
    })();
    const hasBrandAssets = Boolean((theme.symbolLogoUrl || "").trim() || (theme.brandFaviconUrl || "").trim() || (theme.brandLogoUrl || "").trim());
    const effectiveBrandKey = (theme.brandKey || container.brandKey || getEffectiveBrandKey()).toLowerCase();
    const showBrandSkeleton = isPartnerContainer && !hasBrandAssets;
    // Determine if a proper full-width logo exists for this brand; if not, fall back to symbol+text
    const fullLogoUrl = String((theme.brandLogoUrl || "")).trim();
    const hasPartnerFullLogo = (() => {
        if (!fullLogoUrl) return false;
        // Detect blob storage URLs containing the brand key (case-insensitive)
        const lowerUrl = fullLogoUrl.toLowerCase();
        const lowerKey = (effectiveBrandKey || "").toLowerCase();
        if (lowerKey && lowerKey !== "portalpay" && lowerKey !== "basaltsurge") {
            // Check for brand key in blob storage paths (e.g., /Brands/paynex... or /brands/paynex...)
            if (lowerUrl.includes(`/brands/${lowerKey}`) || lowerUrl.includes(`/${lowerKey}`)) return true;
            // Check for blob storage URLs that contain the brand key anywhere
            if (lowerUrl.includes(lowerKey) && (lowerUrl.includes('blob.core.windows.net') || lowerUrl.includes('azureedge.net'))) return true;
        }
        // Reject known default PortalPay assets
        const filename = (fullLogoUrl.split("/").pop() || "").toLowerCase();
        const isDefaultAsset = /^(portalpay\d*\.png|ppsymbol(bg)?\.png|bssymbol\.png|cblogod\.png|favicon-\d+x\d+\.png|next\.svg)$/i.test(filename);
        // Accept any non-default URL
        return !isDefaultAsset;
    })();

    // Effective logo URLs
    const effectiveLogoApp = theme.brandLogoUrl;
    const effectiveLogoSymbol = theme.symbolLogoUrl;
    const effectiveLogoFavicon = theme.brandFaviconUrl;

    // Trust explicit navbarMode from theme
    const navbarMode: "symbol" | "logo" = (() => {
        if (theme.navbarMode === "logo") return "logo";
        if (theme.navbarMode === "symbol") return "symbol";
        // Fallback: use "logo" for partners with a full logo, otherwise "symbol"
        if (effectiveBrandKey && effectiveBrandKey !== "portalpay" && effectiveBrandKey !== "basaltsurge") return "logo";
        return "symbol";
    })();

    // Partner-safe display name: treat generic names and 'PortalPay' as placeholders in partner containers
    const displayBrandName = (() => {
        const raw = String(theme.brandName || "").trim();
        const generic =
            /^ledger\d*$/i.test(raw) ||
            /^partner\d*$/i.test(raw) ||
            /^default$/i.test(raw) ||
            (isPartnerContainer && /^portalpay$/i.test(raw));
        const key = String((theme.brandKey || container.brandKey || "")).trim();
        const lowerKey = key.toLowerCase();
        // explicit casing for basaltsurge
        if (lowerKey === "basaltsurge") return "BasaltSurge";
        const titleizedKey = key ? key.charAt(0).toUpperCase() + key.slice(1) : "PortalPay";
        return (!raw || generic) ? titleizedKey : raw;
    })();

    return (
        <header className={`w-full sticky top-0 ${navZ} backdrop-blur bg-background/70 border-b`}>
            <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2 min-w-0 relative z-50">
                    {showBrandSkeleton ? (
                        <span
                            aria-hidden="true"
                            className={
                                "w-8 h-8 flex-shrink-0 bg-foreground/10 brand-skeleton " +
                                (theme.brandLogoShape === "round"
                                    ? "rounded-full"
                                    : theme.brandLogoShape === "unmasked"
                                        ? "rounded-none bg-transparent"
                                        : "rounded-md")
                            }
                        />
                    ) : navbarMode === 'logo' ? (
                        <img
                            src={(() => {
                                const app = (effectiveLogoApp || "").trim();
                                const sym = (effectiveLogoSymbol || "").trim();
                                const fav = (effectiveLogoFavicon || "").trim();
                                const def = getDefaultBrandSymbol(effectiveBrandKey);
                                return resolveBrandSymbol(app || sym || fav || (isPartnerContainer ? "" : def), effectiveBrandKey);
                            })()}
                            alt={displayBrandName || (isPartnerContainer ? "" : getDefaultBrandName(effectiveBrandKey))}
                            className={
                                "h-8 w-auto max-w-[360px] object-contain flex-shrink-0 rounded-none bg-transparent drop-shadow-md"
                            }
                        />
                    ) : (
                        <img
                            src={(() => {
                                const a = (effectiveLogoSymbol || "").trim();
                                const b = (effectiveLogoFavicon || "").trim();
                                const c = (effectiveLogoApp || "").trim();
                                const def = getDefaultBrandSymbol(effectiveBrandKey);
                                return resolveBrandSymbol(a || b || c || (isPartnerContainer ? "" : def), effectiveBrandKey);
                            })()}
                            alt={displayBrandName || (isPartnerContainer ? "" : "PortalPay")}
                            className={
                                "w-8 h-8 object-contain bg-foreground/5 flex-shrink-0 drop-shadow-md " +
                                (theme.brandLogoShape === "round"
                                    ? "rounded-full"
                                    : theme.brandLogoShape === "unmasked"
                                        ? "rounded-none bg-transparent"
                                        : "rounded-md")
                            }
                        />
                    )}
                    {theme.brandLogoShape === "unmasked" ? null : (
                        showBrandSkeleton || navbarMode !== 'symbol' ? null : (
                            <span className="hidden sm:inline text-sm md:text-xs font-semibold leading-none">
                                {displayBrandName || (isPartnerContainer ? "" : "PortalPay")}
                            </span>
                        )
                    )}
                </Link>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <nav ref={navRef} className="relative hidden md:flex items-center gap-0.5 md:gap-1">
                        {account?.address ? (
                            <div
                                className="relative flex items-center"
                                onMouseEnter={() => {
                                    if (socialHideRef.current) clearTimeout(socialHideRef.current);
                                    setSocialOpen(true);
                                }}
                                onMouseLeave={() => {
                                    if (socialHideRef.current) clearTimeout(socialHideRef.current);
                                    socialHideRef.current = window.setTimeout(() => setSocialOpen(false), 180);
                                }}
                            >
                                <Link
                                    href="/analytics"
                                    ref={el => { linkRefs.current['/loyalty'] = el; }}
                                    className={"px-2 py-0.5 microtext text-[9px] md:text-[9px] lg:text-[10px] rounded-md hover:bg-foreground/5 transition-colors inline-flex items-center leading-none " + (socialActive ? "text-foreground" : "text-foreground/80")}
                                >
                                    {tNavbar("loyalty")}
                                    <ChevronDown className="inline-block ml-1 opacity-80 h-3 w-3 align-[-2px]" />
                                </Link>
                                {socialOpen ? (
                                    <div className="absolute left-0 top-full mt-0 z-10 glass-float rounded-md border p-1">
                                        <Link href="/analytics" className="block px-3 py-1.5 microtext text-[10px] rounded-md hover:bg-foreground/5">{tNavbar("analytics")}</Link>
                                        <Link href="/leaderboard" className="block px-3 py-1.5 microtext text-[10px] rounded-md hover:bg-foreground/5">{tNavbar("leaderboard")}</Link>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                        {items.map((it: NavItem) => (
                            <Link
                                key={it.href}
                                href={it.href}
                                ref={el => { linkRefs.current[it.href] = el; }}
                                onClick={(e) => {
                                    try {
                                        if (it.href === "/admin" && !authed) {
                                            // Prevent navigation until auth completes
                                            e.preventDefault();
                                            setPendingAdminNav(true);
                                            const walletId = activeWallet?.id;
                                            const isEmbeddedWallet = walletId === "inApp" || walletId === "embedded";
                                            setIsSocialLogin(isEmbeddedWallet);
                                            setShowAuthModal(true);
                                        }
                                    } catch { }
                                }}
                                className={"px-2 py-0.5 microtext text-[9px] md:text-[9px] lg:text-[10px] rounded-md hover:bg-foreground/5 transition-colors inline-flex items-center leading-none " + (pathname?.startsWith(it.href) ? "text-foreground" : "text-foreground/80")}
                            >
                                {it.label}
                            </Link>
                        ))}
                        {/* Animated underline */}
                        {indicator.visible ? (
                            <span
                                className="absolute bottom-0 h-[2px] rounded bg-[var(--pp-secondary)] transition-all duration-200"
                                style={{ left: indicator.left, width: indicator.width }}
                            />
                        ) : null}
                    </nav>
                    {/* Search */}
                    <div className="relative flex items-center gap-1" ref={dropdownRef}>
                        <div className="hidden sm:flex items-center gap-2">
                            <input
                                value={q}
                                onChange={e => { setQ(e.target.value); setOpen(true); }}
                                placeholder={tCommon("search")}
                                className="w-48 h-9 px-3 py-1 rounded-md bg-foreground/5 focus:outline-none focus:ring-2 focus:ring-[var(--pp-secondary)] text-sm"
                            />
                            <button title={tNavbar("filters")} onClick={() => setOpen(o => !o)} className="w-9 h-9 grid place-items-center rounded-md hover:bg-foreground/5">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 3H2l8 9v7l4 2v-9l8-9z" /></svg>
                            </button>
                        </div>
                        {/* Mobile search trigger */}
                        <button className="sm:hidden w-9 h-9 grid place-items-center rounded-md glass-pane border hover:bg-foreground/10 relative z-50" onClick={() => setOpen(o => !o)} aria-label={tCommon("search")}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" /></svg>
                        </button>
                        {/* Mobile hamburger */}
                        <button className="md:hidden w-9 h-9 grid place-items-center rounded-md glass-pane border hover:bg-foreground/10 ml-1 relative z-50" onClick={() => setMobileOpen(o => !o)} aria-label={tCommon("menu")}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
                        </button>
                        {open && (
                            <div className="fixed inset-0 z-40 flex items-start justify-center pt-16">
                                <div className="absolute inset-0 glass-backdrop" onClick={() => setOpen(false)} />
                                <div className="relative w-[min(520px,calc(100vw-24px))] max-h-[75vh] glass-float rounded-xl border p-3 text-sm">
                                    <div className="mb-2">
                                        <label className="text-xs">{tSearch("search")}</label>
                                        <input value={q} onChange={e => setQ(e.target.value)} placeholder={tCommon("search")}
                                            className="mt-1 h-9 w-full px-3 rounded-md bg-foreground/10 focus:outline-none" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <div className="microtext uppercase text-[10px] opacity-70 mb-1">Profiles</div>
                                            <label className="text-xs">{tSearch("domain")}<input value={domain} onChange={e => setDomain(e.target.value)} className="mt-1 h-8 w-full px-2 rounded-md bg-foreground/10 focus:outline-none" placeholder="e.g., podcasts" /></label>
                                            <label className="text-xs">{tSearch("platform")}<input value={platform} onChange={e => setPlatform(e.target.value)} className="mt-1 h-8 w-full px-2 rounded-md bg-foreground/10 focus:outline-none" placeholder="e.g., Twitch" /></label>
                                            <label className="text-xs">{tSearch("language")}<input value={language} onChange={e => setLanguage(e.target.value)} className="mt-1 h-8 w-full px-2 rounded-md bg-foreground/10 focus:outline-none" placeholder="e.g., English" /></label>
                                            <label className="text-xs">{tSearch("minXp")}<input value={minXp} onChange={e => setMinXp(e.target.value)} inputMode="numeric" className="mt-1 h-8 w-full px-2 rounded-md bg-foreground/10 focus:outline-none" placeholder="0" /></label>
                                            <div className="mt-2 flex items-center gap-2">
                                                <label className="text-xs flex items-center gap-1">
                                                    <input type="checkbox" checked={liveOnly} onChange={e => setLiveOnly(e.target.checked)} className="h-3 w-3" /> Live only
                                                </label>
                                                <label className="text-xs flex items-center gap-1">
                                                    Sort:
                                                    <select value={userSort} onChange={e => setUserSort(e.target.value)} className="h-8 px-2 rounded-md bg-foreground/10 focus:outline-none">
                                                        <option value="xp_desc">Best (XP)</option>
                                                        <option value="heartbeat_desc">Recently active</option>
                                                        <option value="seen_desc">Recently seen</option>
                                                        <option value="name_asc">Name A–Z</option>
                                                    </select>
                                                </label>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="microtext uppercase text-[10px] opacity-70 mb-1">Shops</div>
                                            <label className="text-xs">Industry pack
                                                <select value={shopPack} onChange={e => setShopPack(e.target.value)} className="mt-1 h-8 w-full px-2 rounded-md bg-foreground/10 focus:outline-none">
                                                    <option value="">Any</option>
                                                    <option value="restaurant">Restaurant</option>
                                                    <option value="retail">Retail</option>
                                                    <option value="hotel">Hotel</option>
                                                    <option value="freelancer">Freelancer</option>
                                                </select>
                                            </label>
                                            <div className="mt-2 flex items-center gap-3">
                                                <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={shopSetupOnly} onChange={e => setShopSetupOnly(e.target.checked)} className="h-3 w-3" /> Setup complete</label>
                                                <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={shopHasSlugOnly} onChange={e => setShopHasSlugOnly(e.target.checked)} className="h-3 w-3" /> Has slug</label>
                                            </div>
                                            <div className="mt-2">
                                                <label className="text-xs">
                                                    Sort:
                                                    <select value={shopSort} onChange={e => setShopSort(e.target.value)} className="ml-2 h-8 px-2 rounded-md bg-foreground/10 focus:outline-none">
                                                        <option value="updated_desc">Recently updated</option>
                                                        <option value="name_asc">Name A–Z</option>
                                                        <option value="slug_asc">Slug A–Z</option>
                                                    </select>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-3 max-h-72 overflow-auto divide-y divide-foreground/10">
                                        {loading ? <div className="py-6 text-center opacity-75">{tSearch("searching")} <Ellipsis className="inline h-3 w-3 align-[-2px]" /></div> : null}
                                        {!loading && userResults.length === 0 && shopResults.length === 0 ? <div className="py-6 text-center opacity-75">{tSearch("noMatches")}</div> : null}
                                        {shopResults.length > 0 ? (
                                            <div className="py-2">
                                                <div className="px-2 py-1 microtext uppercase text-[10px] opacity-70">Shops</div>
                                                {shopResults.map((s: any) => {
                                                    const name = s.name || s.slug || (s.wallet ? `${s.wallet.slice(0, 6)}...${s.wallet.slice(-4)}` : "Shop");
                                                    const slug = s.slug;
                                                    if (!slug) return null;
                                                    return (
                                                        <a key={`shop-${slug}`} href={`/shop/${slug}`} className="flex items-center justify-between gap-3 py-2 hover:bg-foreground/5 px-2 rounded-md">
                                                            <span className="flex items-center gap-3">
                                                                <span className="w-8 h-8 rounded-md overflow-hidden bg-foreground/10">
                                                                    {s.brandLogoUrl ? <img src={s.brandLogoUrl} alt={name} className="w-full h-full object-cover" /> : <span className="w-8 h-8 block" />}
                                                                </span>
                                                                <span className="flex flex-col">
                                                                    <span className="font-medium leading-tight">{name}</span>
                                                                    <span className="microtext text-muted-foreground">/{slug}</span>
                                                                </span>
                                                            </span>
                                                        </a>
                                                    );
                                                })}
                                            </div>
                                        ) : null}
                                        {userResults.length > 0 ? (
                                            <div className="py-2">
                                                <div className="px-2 py-1 microtext uppercase text-[10px] opacity-70">Profiles</div>
                                                {userResults.map((u: any) => {
                                                    const name = u.displayName || (u.wallet ? `${u.wallet.slice(0, 6)}...${u.wallet.slice(-4)}` : 'User');
                                                    return (
                                                        <a key={u.wallet} href={`/u/${u.wallet}`} className="flex items-center justify-between gap-3 py-2 hover:bg-foreground/5 px-2 rounded-md">
                                                            <span className="flex items-center gap-3">
                                                                <span className="w-8 h-8 rounded-full overflow-hidden bg-foreground/10">
                                                                    {u.pfpUrl ? <img src={u.pfpUrl} alt={name} className="w-full h-full object-cover" /> : <span className="w-8 h-8 block" />}
                                                                </span>
                                                                <span className="flex flex-col">
                                                                    <span className="font-medium leading-tight">{name}</span>
                                                                    <span className="microtext text-muted-foreground">{u.wallet.slice(0, 10)}... <Dot className="inline h-3 w-3 mx-1" /> {u.xp || 0} XP</span>
                                                                </span>
                                                            </span>
                                                            <span className="hidden md:flex items-center gap-2">
                                                                {(u.domains || []).slice(0, 1).map((d: string, i: number) => <span key={i} className="px-2 py-0.5 rounded-md border text-xs opacity-80">{d}</span>)}
                                                                {(u.platforms || []).slice(0, 1).map((p: string, i: number) => <span key={i} className="px-2 py-0.5 rounded-md border text-xs opacity-80">{p}</span>)}
                                                            </span>
                                                        </a>
                                                    );
                                                })}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="hidden md:block"><ConnectButton
                        client={client}
                        chain={chain}
                        wallets={wallets}
                        connectButton={{
                            label: <span className="microtext">{tCommon("login")}</span>,
                            className: connectButtonClass,
                            style: getConnectButtonStyle(),
                        }}
                        signInButton={{
                            label: tCommon("authenticate"),
                            className: connectButtonClass,
                            style: getConnectButtonStyle(),
                        }}
                        detailsButton={{
                            displayBalanceToken: { [((chain as any)?.id ?? 8453)]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
                        }}
                        detailsModal={{
                            payOptions: {
                                buyWithFiat: {
                                    prefillSource: {
                                        currency: "USD",
                                    },
                                },
                                prefillBuy: {
                                    chain: chain,
                                    token: {
                                        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                                        name: "USD Coin",
                                        symbol: "USDC",
                                    },
                                },
                            },
                        }}
                        connectModal={{ title: tCommon("login"), titleIcon: showBrandSkeleton ? undefined : (() => { const a = (theme.symbolLogoUrl || "").trim(); const b = (theme.brandFaviconUrl || "").trim(); const c = (theme.brandLogoUrl || "").trim(); return a || b || c || (isPartnerContainer ? undefined : getDefaultBrandSymbol(effectiveBrandKey)); })(), size: "compact", showThirdwebBranding: false }}
                        theme={twTheme}
                        onDisconnect={async () => {
                            try {
                                // Call logout endpoint to clear authentication cookies
                                await fetch('/api/auth/logout', { method: 'POST' });

                                // Dispatch logout event for any listeners
                                window.dispatchEvent(new CustomEvent("pp:auth:logged_out"));
                            } catch (error) {
                                console.error('Logout failed:', error);
                            }

                            // Redirect to home page
                            try {
                                window.location.href = '/';
                            } catch { }
                        }}
                    /></div>
                </div>
            </div>
            {/* Mobile menu overlay */}
            {mobileOpen && (
                <div className="fixed inset-0 z-30 md:hidden">
                    <div className="absolute inset-0 glass-backdrop" onClick={() => setMobileOpen(false)} />
                    <div className="absolute top-14 left-0 right-0 glass-float rounded-b-xl border p-3 space-y-2">
                        <nav className="flex flex-col">
                            {account?.address ? (
                                <>
                                    <button onClick={() => setMobileSocialOpen(o => !o)} className="px-3 py-2 microtext text-[11px] rounded-md hover:bg-foreground/10 flex items-center justify-between">
                                        <span className={socialActive ? "text-foreground" : "text-foreground/80"}>{tNavbar("loyalty")}</span>
                                        <span className={"opacity-80 transition-transform " + (mobileSocialOpen ? "rotate-180" : "")}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                                        </span>
                                    </button>
                                    {mobileSocialOpen ? (
                                        <div className="pl-3">
                                            <Link href="/analytics" onClick={() => setMobileOpen(false)} className={"px-3 py-2 microtext text-[11px] rounded-md hover:bg-foreground/10 " + (pathname?.startsWith('/analytics') ? "text-foreground" : "text-foreground/80")}>{tNavbar("analytics")}</Link>
                                            <Link href="/leaderboard" onClick={() => setMobileOpen(false)} className={"px-3 py-2 microtext text-[11px] rounded-md hover:bg-foreground/10 " + (pathname?.startsWith('/leaderboard') ? "text-foreground" : "text-foreground/80")}>{tNavbar("leaderboard")}</Link>
                                        </div>
                                    ) : null}
                                </>
                            ) : null}
                            {items.map((it: NavItem) => (
                                <Link
                                    key={it.href}
                                    href={it.href}
                                    onClick={(e) => {
                                        try {
                                            if (it.href === "/admin" && !authed) {
                                                // Prevent navigation until auth completes
                                                e.preventDefault();
                                                setMobileOpen(false);
                                                setPendingAdminNav(true);
                                                const walletId = activeWallet?.id;
                                                const isEmbeddedWallet = walletId === "inApp" || walletId === "embedded";
                                                setIsSocialLogin(isEmbeddedWallet);
                                                setShowAuthModal(true);
                                            } else {
                                                setMobileOpen(false);
                                            }
                                        } catch {
                                            setMobileOpen(false);
                                        }
                                    }}
                                    className={"px-3 py-2 microtext text-[11px] rounded-md hover:bg-foreground/10 " + (pathname?.startsWith(it.href) ? "text-foreground" : "text-foreground/80")}
                                >
                                    {it.label}
                                </Link>
                            ))}
                        </nav>
                        <div className="pt-2">
                            <ConnectButton
                                client={client}
                                chain={chain}
                                wallets={wallets}
                                connectButton={{
                                    label: <span className="microtext">{tCommon("login")}</span>,
                                    className: connectButtonClass,
                                    style: getConnectButtonStyle(),
                                }}
                                signInButton={{
                                    label: tCommon("authenticate"),
                                    className: connectButtonClass,
                                    style: getConnectButtonStyle(),
                                }}
                                detailsButton={{
                                    displayBalanceToken: { [((chain as any)?.id ?? 8453)]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
                                    style: getConnectButtonStyle(),
                                }}
                                detailsModal={{
                                    payOptions: {
                                        buyWithFiat: {
                                            prefillSource: {
                                                currency: "USD",
                                            },
                                        },
                                        prefillBuy: {
                                            chain: chain,
                                            token: {
                                                address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                                                name: "USD Coin",
                                                symbol: "USDC",
                                            },
                                        },
                                    },
                                }}
                                connectModal={{ title: tCommon("login"), titleIcon: showBrandSkeleton ? undefined : (() => { const a = (theme.symbolLogoUrl || "").trim(); const b = (theme.brandFaviconUrl || "").trim(); const c = (theme.brandLogoUrl || "").trim(); return a || b || c || (isPartnerContainer ? undefined : getDefaultBrandSymbol(effectiveBrandKey)); })(), size: "compact", showThirdwebBranding: false }}
                                theme={twTheme}
                                onDisconnect={async () => {
                                    try {
                                        // Call logout endpoint to clear authentication cookies
                                        await fetch('/api/auth/logout', { method: 'POST' });

                                        // Dispatch logout event for any listeners
                                        window.dispatchEvent(new CustomEvent("pp:auth:logged_out"));
                                    } catch (error) {
                                        console.error('Logout failed:', error);
                                    }

                                    // Redirect to home page
                                    try {
                                        window.location.href = '/';
                                    } catch { }
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Authentication Modal */}
            <AuthModal
                isOpen={showAuthModal}
                isSocialLogin={isSocialLogin}
                onClose={() => setShowAuthModal(false)}
                onSuccess={() => {
                    setShowAuthModal(false);
                    setAuthed(true);
                    checkingAuth.current = false;
                    // Register user after successful auth
                    if (wallet) {
                        try {
                            fetch('/api/users/register', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ wallet })
                            }).catch(() => { });
                        } catch { }
                    }
                    // If user attempted to open Admin before auth, navigate now
                    try {
                        if (pendingAdminNav) {
                            setPendingAdminNav(false);
                            router.push("/admin");
                        }
                    } catch { }
                }}
                onError={(error) => {
                    console.error('[Auth] Failed:', error);
                    // Allow retry by not resetting checkingAuth
                }}
            />
        </header>
    );
}
