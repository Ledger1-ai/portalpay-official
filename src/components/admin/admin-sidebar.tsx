'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  PanelLeftClose,
  PanelLeft,
  LayoutDashboard,
  Receipt,
  Package,
  ClipboardList,
  ShoppingBag,
  MessageSquare,
  Gauge,
  Utensils,
  Hotel,
  Brush,
  Users,
  Building2,
  BookOpen,
  FileText,
  Sparkles,
} from 'lucide-react';
import { useBrand } from '@/contexts/BrandContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cachedFetch } from '@/lib/client-api-cache';
import { getDefaultBrandSymbol, resolveBrandSymbol, getEffectiveBrandKey, resolveBrandAppLogo } from '@/lib/branding';

type AdminTabKey =
  | 'terminal'
  | 'devices'
  | 'kitchen'
  | 'delivery'
  | 'reserve'

  | 'inventory'
  | 'orders'
  | 'purchases'
  | 'messages'
  | 'messages-buyer'
  | 'messages-merchant'
  | 'endpoints'
  | 'team'
  | 'rewards'
  | 'loyalty'
  | 'loyaltyConfig'
  | 'pms'
  | 'branding'
  | 'globalArt'
  | 'users'
  | 'splitConfig'
  | 'applications'
  | 'partners'
  | 'contracts'
  | 'shopSetup'
  | 'profileSetup'
  | 'whitelabel'
  | 'withdrawal'
  | 'admins'
  | 'seoPages'
  | 'integrations'
  | 'shopifyPartner'
  | 'shopifyPlatform'
  | 'support'
  | 'supportAdmin'
  | 'writersWorkshop'
  | 'publications';

interface AdminSidebarProps {
  activeTab: AdminTabKey;
  onChangeTab: (tab: AdminTabKey) => void;
  industryPack: string | null;
  canBranding: boolean;
  canMerchants: boolean;
  isSuperadmin: boolean;
  canAdmins?: boolean;
  onCollapseChange?: (collapsed: boolean) => void;
}

interface NavItem {
  title: string;
  key?: AdminTabKey;
  icon?: React.ReactNode;
  items?: { title: string; key: AdminTabKey }[];
}

function NavGroup({ item, activeTab, onChangeTab }: { item: NavItem; activeTab: AdminTabKey; onChangeTab: (tab: AdminTabKey) => void }) {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    // Auto-open if any child is active
    if (item.items) {
      return item.items.some((child) => activeTab === child.key);
    }
    return true;
  });

  const hasChildren = item.items && item.items.length > 0;

  if (!hasChildren && item.key) {
    const isActive = activeTab === item.key;
    return (
      <button
        type="button"
        onClick={() => onChangeTab(item.key!)}
        className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap ${isActive ? 'bg-[var(--pp-secondary)] text-white font-medium shadow-md shadow-[var(--pp-secondary)]/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
      >
        {item.icon}
        <span className="text-left">{item.title}</span>
      </button>
    );
  }

  return (
    <>
      {/* Desktop: vertical collapsible */}
      <div className="hidden md:block space-y-1">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors"
        >
          {item.icon}
          <span className="flex-1 text-left">{item.title}</span>
          {hasChildren && (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              {isOpen ? <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" /> : <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />}
            </svg>
          )}
        </button>
        {isOpen && hasChildren && (
          <div className="ml-6 space-y-1 border-l border-border pl-3">
            {item.items!.map((child) => {
              const isActive = activeTab === child.key;
              return (
                <button
                  key={child.key}
                  type="button"
                  onClick={() => onChangeTab(child.key)}
                  className={`block w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${isActive ? 'bg-[var(--pp-secondary)] text-white font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                >
                  {child.title}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Mobile: flat list of children */}
      {hasChildren &&
        item.items!.map((child) => {
          const isActive = activeTab === child.key;
          return (
            <button
              key={child.key}
              type="button"
              onClick={() => onChangeTab(child.key)}
              className={`md:hidden flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap ${isActive ? 'bg-[var(--pp-secondary)] text-white font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
            >
              <span>{child.title}</span>
            </button>
          );
        })}
    </>
  );
}

export function AdminSidebar({ activeTab, onChangeTab, industryPack, canBranding, canMerchants, isSuperadmin, canAdmins, onCollapseChange }: AdminSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const brand = useBrand();
  const { theme } = useTheme();
  const [containerBrandKey, setContainerBrandKey] = useState<string>("");
  const [containerType, setContainerType] = useState<string>("");
  // Partner brand assets (fetched when container is partner type)
  const [partnerLogoSymbol, setPartnerLogoSymbol] = useState<string>("");
  const [partnerLogoFavicon, setPartnerLogoFavicon] = useState<string>("");
  const [partnerLogoApp, setPartnerLogoApp] = useState<string>("");
  const [partnerBrandName, setPartnerBrandName] = useState<string>("");
  const [isPartnerBrandLoading, setIsPartnerBrandLoading] = useState<boolean>(true);

  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    onCollapseChange?.(newState);
  };

  useEffect(() => {
    let cancelled = false;
    cachedFetch("/api/site/container", { cache: "no-store" })
      .then((ci: any) => {
        if (cancelled) return;
        const bk = String(ci?.brandKey || "").trim();
        const ct = String(ci?.containerType || "").trim();
        setContainerBrandKey(bk);
        setContainerType(ct);
        // If not a partner container, stop loading state immediately
        if (ct.toLowerCase() !== "partner" || !bk) {
          setIsPartnerBrandLoading(false);
        }
      })
      .catch(() => {
        setIsPartnerBrandLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Fetch partner brand configuration when in a partner container
  useEffect(() => {
    if (containerType.toLowerCase() !== "partner" || !containerBrandKey) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/platform/brands/${encodeURIComponent(containerBrandKey)}/config`, { cache: "no-store" });
        if (!res.ok || cancelled) {
          if (!cancelled) setIsPartnerBrandLoading(false);
          return;
        }
        const data = await res.json();
        // API returns { brandKey, brand: { logos, ... }, overrides }
        const cfg = data?.brand || data?.config || data || {};
        const logos = cfg?.logos || data?.overrides?.logos || cfg?.theme?.logos || {};
        if (!cancelled) {
          setPartnerLogoSymbol(String(logos?.symbol || "").trim());
          setPartnerLogoFavicon(String(logos?.favicon || cfg?.theme?.brandFaviconUrl || "").trim());
          setPartnerLogoApp(String(logos?.app || cfg?.theme?.brandLogoUrl || "").trim());
          setPartnerBrandName(String(cfg?.name || cfg?.displayName || "").trim());
          setIsPartnerBrandLoading(false);
        }
      } catch {
        if (!cancelled) setIsPartnerBrandLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [containerType, containerBrandKey]);

  // Effective values: partner assets take precedence over theme context for partner containers
  const isPartnerContainer = String(containerType || "").toLowerCase() === "partner";
  const effectiveLogoSymbol = (isPartnerContainer && partnerLogoSymbol) ? partnerLogoSymbol : (theme?.symbolLogoUrl || "");
  const effectiveLogoFavicon = (isPartnerContainer && partnerLogoFavicon) ? partnerLogoFavicon : (theme?.brandFaviconUrl || "");
  const effectiveLogoApp = (isPartnerContainer && partnerLogoApp) ? partnerLogoApp : (theme?.brandLogoUrl || "");
  const effectiveBrandNameFromPartner = (isPartnerContainer && partnerBrandName) ? partnerBrandName : "";

  // Helper to get symbol logo with proper fallback cascade
  // While loading partner brand data, use a transparent placeholder to prevent flash
  const getSymbolLogo = () => {
    // If we're still loading partner brand data, don't show fallback yet
    if (isPartnerBrandLoading && containerType.toLowerCase() === "partner") {
      // Return a 1x1 transparent data URL to prevent flashing wrong logo
      return "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    }
    // Partner-fetched logos take ABSOLUTE priority in partner containers
    // Do NOT fall through to theme/brand context values - they can override partner logos
    if (isPartnerContainer) {
      const pSym = partnerLogoSymbol.trim();
      const pFav = partnerLogoFavicon.trim();
      const pApp = partnerLogoApp.trim();
      if (pSym) return resolveBrandSymbol(pSym, containerBrandKey);
      if (pFav) return resolveBrandSymbol(pFav, containerBrandKey);
      if (pApp) return resolveBrandSymbol(pApp, containerBrandKey);
      return getDefaultBrandSymbol(containerBrandKey); // Don't fall through to theme/brand context
    }
    // Platform container - use standard cascade with theme values
    const sym = effectiveLogoSymbol.trim();
    const fav = effectiveLogoFavicon.trim();
    const app = effectiveLogoApp.trim();
    // Use wide logo (app) if navbarMode indicates logo preference
    const useWide = (theme?.navbarMode === 'logo');
    const defaultPlatformSymbol = getDefaultBrandSymbol(getEffectiveBrandKey());
    const effectiveKey = containerBrandKey || theme?.brandKey || getEffectiveBrandKey();

    // Choose the right logo based on mode
    if (useWide && app) return resolveBrandSymbol(app, effectiveKey);
    return resolveBrandSymbol(sym || fav || app || defaultPlatformSymbol, effectiveKey);
  };

  // Safe display brand name for admin UI. If name is missing or a generic placeholder, fall back to titleized brand key.
  const rawBrandName = String((effectiveBrandNameFromPartner || theme?.brandName || (brand as any)?.displayName || brand?.name || "")).trim();
  const isGenericBrandName =
    /^ledger\d*$/i.test(rawBrandName) ||
    /^partner\d*$/i.test(rawBrandName) ||
    /^default$/i.test(rawBrandName) ||
    (isPartnerContainer && /^portalpay$/i.test(rawBrandName));
  const keyForDisplay = (() => {
    const bk = containerBrandKey;
    if (bk) return bk;
    return String((brand as any)?.key || '').trim();
  })();
  const titleizedKey = keyForDisplay.toLowerCase() === 'basaltsurge' ? 'BasaltSurge' : (keyForDisplay ? keyForDisplay.charAt(0).toUpperCase() + keyForDisplay.slice(1) : 'PortalPay');
  const finalName = (!rawBrandName || isGenericBrandName) ? titleizedKey : rawBrandName;
  const displayBrandName = finalName.toLowerCase() === 'basaltsurge' ? 'BasaltSurge' : finalName;

  const isWideLogo = (theme?.navbarMode === 'logo');

  const groups: NavItem[] = [
    {
      title: 'General',
      icon: <LayoutDashboard className="w-4 h-4" />,
      items: [
        { title: 'Support', key: 'support' as AdminTabKey },
      ],
    },
    {
      title: 'Shopper',
      icon: <ShoppingBag className="w-4 h-4" />,
      items: [
        { title: 'My Purchases', key: 'purchases' as AdminTabKey },
        { title: 'Messages', key: 'messages-buyer' as AdminTabKey },
        { title: 'Rewards', key: 'rewards' as AdminTabKey },
      ],
    },
    {
      title: 'Merchant',
      icon: <Building2 className="w-4 h-4" />,
      items: [
        { title: 'Terminal', key: 'terminal' as AdminTabKey },
        { title: 'Reserve', key: 'reserve' as AdminTabKey },
        { title: 'Inventory', key: 'inventory' as AdminTabKey },
        { title: 'Orders', key: 'orders' as AdminTabKey },
        { title: 'Loyalty', key: 'loyalty' as AdminTabKey },
        { title: 'Messages', key: 'messages-merchant' as AdminTabKey },
        { title: 'Integrations', key: 'integrations' as AdminTabKey },
        { title: 'Touchpoints', key: 'endpoints' as AdminTabKey },
        { title: 'Team', key: 'team' as AdminTabKey },
      ],
    },
    {
      title: 'Apps',
      icon: <Package className="w-4 h-4" />,
      items: [
        ...(industryPack === 'restaurant' ? [
          { title: 'Kitchen', key: 'kitchen' as AdminTabKey },
          { title: 'Delivery', key: 'delivery' as AdminTabKey }
        ] : []),

        ...(industryPack === 'hotel' ? [{ title: 'PMS', key: 'pms' as AdminTabKey }] : []),
        ...(industryPack === 'publishing' ? [{ title: "Writer's Workshop", key: 'writersWorkshop' as AdminTabKey }] : []),
      ],
    },
    ...(canBranding || isSuperadmin || canAdmins
      ? [
        {
          title: 'Partner/Admin',
          icon: <Brush className="w-4 h-4" />,
          items: [
            { title: 'Devices', key: 'devices' as AdminTabKey },
            { title: 'Split Config', key: 'splitConfig' as AdminTabKey },
            { title: 'Branding', key: 'branding' as AdminTabKey },
            { title: 'Merchants', key: 'users' as AdminTabKey },
            { title: 'SEO Pages', key: 'seoPages' as AdminTabKey },
            { title: 'Plugins', key: 'shopifyPartner' as AdminTabKey },
            ...(canAdmins ? [
              { title: 'Admin Users', key: 'admins' as AdminTabKey },
            ] : []),
          ],
        } as NavItem,
      ]
      : []),
    ...(canMerchants || isSuperadmin
      ? [
        {
          title: 'Platform',
          icon: <Building2 className="w-4 h-4" />,
          items: [
            { title: 'Publications', key: 'publications' as AdminTabKey },
            ...(isSuperadmin
              ? [
                { title: 'Loyalty Config', key: 'loyaltyConfig' as AdminTabKey },
                { title: 'Applications', key: 'applications' as AdminTabKey },
                { title: 'Partners', key: 'partners' as AdminTabKey },
                { title: 'Contracts', key: 'contracts' as AdminTabKey },
                { title: 'Plugin Studio', key: 'shopifyPlatform' as AdminTabKey },
                { title: 'Support Admin', key: 'supportAdmin' as AdminTabKey },
              ]
              : []),
          ],
        } as NavItem,
      ]
      : []),
    {
      title: 'Manuals',
      icon: <BookOpen className="w-4 h-4" />,
      items: [
        { title: 'Shop Setup', key: 'shopSetup' as AdminTabKey },
        { title: 'Profile Setup', key: 'profileSetup' as AdminTabKey },
        { title: 'Whitelabel', key: 'whitelabel' as AdminTabKey },
        { title: 'Withdrawal', key: 'withdrawal' as AdminTabKey },
      ],
    },
  ];

  return (
    <aside
      className={`
        fixed z-10 bg-background transition-all duration-300
        md:top-[176px] md:bottom-0 md:left-0 md:border-r md:flex-col md:h-[calc(100vh-176px)]
        ${isCollapsed ? 'md:w-16' : 'md:w-64'}
        top-[176px] left-0 right-0 border-b md:border-b-0 border-border
        max-md:h-14 max-md:overflow-x-auto max-md:overflow-y-hidden
        flex
      `}
    >
      {/* Desktop: vertical sidebar */}
      <div className="hidden md:flex md:flex-1 md:overflow-y-auto md:p-2 md:space-y-2 md:flex-col">
        {/* Logo - desktop only */}
        <div className="flex items-center justify-center group p-2 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getSymbolLogo()}
            alt={displayBrandName || 'Brand'}
            className={"transition-transform group-hover:scale-105 rounded-md object-contain " + (isWideLogo ? "h-10 w-auto max-w-[200px]" : "h-10 w-10")}
          />
          {!isCollapsed && !isWideLogo && (
            <div className="ml-3">
              <div className="font-bold text-foreground text-sm">{displayBrandName}</div>
              <div className="text-xs text-muted-foreground">Admin Console</div>
            </div>
          )}
          {!isCollapsed && isWideLogo && (
            <span className="sr-only">{displayBrandName} Admin</span>
          )}
        </div>

        {/* Navigation */}
        <nav className={isCollapsed ? 'space-y-0.5 flex flex-col items-stretch' : 'space-y-1'}>
          {groups.map((item) => (
            <div key={item.title}>
              {isCollapsed ? (
                <div className="flex flex-col items-center gap-1 py-1">
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        const first = item.items?.[0];
                        if (first) onChangeTab(first.key);
                      } catch { }
                    }}
                    className="w-8 h-8 rounded-full border-2 border-[var(--pp-secondary)] flex items-center justify-center hover:bg-[var(--pp-secondary)]/10 transition-colors"
                    title={item.title}
                    aria-label={item.title}
                  >
                    <div className="text-[var(--pp-secondary)]">
                      {item.icon}
                    </div>
                  </button>
                  <div className="w-px h-1 bg-border" />
                  {item.items?.slice(1).map((child) => {
                    const isActive = activeTab === child.key;
                    return (
                      <button
                        key={child.key}
                        type="button"
                        onClick={() => onChangeTab(child.key)}
                        className={`p-1 rounded-sm transition-colors ${isActive ? 'bg-[var(--pp-secondary)]' : 'hover:bg-muted'}`}
                        title={child.title}
                        aria-label={child.title}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-white' : 'bg-foreground'}`} />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <NavGroup item={item} activeTab={activeTab} onChangeTab={onChangeTab} />
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* Mobile: horizontal scrolling compact carousel */}
      <div className="flex md:hidden items-center gap-6 px-3 overflow-x-auto flex-nowrap w-full h-14">
        {groups.map((group, groupIndex) => (
          <div key={group.title} className="flex items-center gap-6 shrink-0 h-full">
            {/* Main topic icon circle */}
            <button
              type="button"
              onClick={() => {
                try {
                  const first = group.items?.[0];
                  if (first) onChangeTab(first.key);
                } catch { }
              }}
              className="w-10 h-10 rounded-full border-2 border-[var(--pp-secondary)] flex items-center justify-center hover:bg-[var(--pp-secondary)]/10 transition-colors"
              title={group.title}
            >
              <div className="text-[var(--pp-secondary)]">
                {group.icon}
              </div>
            </button>

            {/* Children as simple text links next to it */}
            <div className="flex items-center gap-4">
              {group.items?.map((child) => {
                const isActive = activeTab === child.key;
                return (
                  <button
                    key={child.key}
                    type="button"
                    onClick={() => onChangeTab(child.key)}
                    className={`text-sm whitespace-nowrap transition-colors ${isActive ? 'font-bold text-[var(--pp-secondary)]' : 'text-muted-foreground'}`}
                  >
                    {child.title}
                  </button>
                );
              })}
            </div>

            {/* Divider unless last group */}
            {groupIndex < groups.length - 1 && (
              <div className="w-px h-8 bg-border/50" />
            )}
          </div>
        ))}
      </div>

      {/* Toggle Button at bottom */}
      <div className="hidden md:flex border-t border-border p-2 justify-center">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
