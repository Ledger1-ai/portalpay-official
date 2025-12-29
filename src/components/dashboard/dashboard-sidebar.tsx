'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronDown, ChevronRight, LayoutDashboard, Box, ScrollText, KeyRound, PanelLeftClose, PanelLeft } from 'lucide-react';
import { Tooltip } from '../docs/tooltip';
import { useBrand } from "@/contexts/BrandContext";
import { useTheme } from "@/contexts/ThemeContext";
import { resolveBrandSymbol, getDefaultBrandName, resolveBrandAppLogo } from "@/lib/branding";

interface NavItem {
  title: string;
  href?: string;
  icon?: React.ReactNode;
  items?: NavItem[];
}

const navigation: NavItem[] = [
  {
    title: 'Dashboard',
    icon: <LayoutDashboard className="w-4 h-4" />,
    items: [
      { title: 'Overview', href: '/developers/dashboard' },
      { title: 'Products', href: '/developers/dashboard/products' },
      { title: 'Subscriptions', href: '/developers/dashboard/subscriptions' },
      { title: 'API Keys', href: '/developers/dashboard/api-keys' },
    ],
  },
];

function NavGroup({ item, currentPath }: { item: NavItem; currentPath: string }) {
  const [isOpen, setIsOpen] = useState(() => {
    // Auto-open if any child is active
    if (item.items) {
      return item.items.some(child => currentPath === child.href);
    }
    return false;
  });

  const hasChildren = item.items && item.items.length > 0;

  if (!hasChildren && item.href) {
    return (
      <Link
        href={item.href}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${currentPath === item.href
          ? 'bg-primary text-primary-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
      >
        {item.icon}
        <span>{item.title}</span>
      </Link>
    );
  }

  return (
    <div className="space-y-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors"
      >
        {item.icon}
        <span className="flex-1 text-left">{item.title}</span>
        {hasChildren && (
          isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
        )}
      </button>
      {isOpen && hasChildren && (
        <div className="ml-6 space-y-1 border-l border-border pl-3">
          {item.items!.map((child) => (
            <Link
              key={child.href}
              href={child.href!}
              className={`block px-3 py-2 text-sm rounded-lg transition-colors ${currentPath === child.href
                ? 'bg-primary text-primary-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
            >
              {child.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function DashboardSidebar({ currentPath }: { currentPath: string }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const brand = useBrand();
  const { theme } = useTheme();
  const isWideLogo = theme?.navbarMode === 'logo';

  return (
    <aside className={`fixed top-[148px] bottom-0 left-0 border-r border-border bg-background z-10 transition-all duration-300 flex flex-col ${isCollapsed ? 'w-16' : 'w-64'}`}>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {/* Logo */}
        <Link href="/developers/dashboard" className="flex items-center justify-center group p-2">
          {isWideLogo ? (
            <Image
              src={resolveBrandAppLogo(theme?.brandLogoUrl || brand?.logos?.app, (brand as any)?.key)}
              alt={theme?.brandName || brand?.name || "Dashboard"}
              width={160}
              height={40}
              className="transition-transform group-hover:scale-105 rounded-md object-contain h-10 w-auto max-w-[200px]"
            />
          ) : (
            <Image
              src={resolveBrandSymbol(theme?.symbolLogoUrl || brand?.logos?.symbol || brand?.logos?.app || brand?.logos?.favicon, (brand as any)?.key)}
              alt={theme?.brandName || brand?.name || getDefaultBrandName((brand as any)?.key)}
              width={40}
              height={40}
              className="transition-transform group-hover:scale-110 h-10 w-10"
            />
          )}
          {!isCollapsed && !isWideLogo && (
            <div className="ml-3">
              <div className="font-bold text-foreground text-sm">Dashboard</div>
              <div className="text-xs text-muted-foreground">API Management</div>
            </div>
          )}
        </Link>

        {/* Navigation */}
        <nav className={isCollapsed ? "space-y-0.5 flex flex-col items-stretch" : "space-y-1"}>
          {navigation.map((item) => (
            <div key={item.title}>
              {isCollapsed ? (
                <div className="flex flex-col items-center gap-1 py-1">
                  <Tooltip content={item.title} side="right">
                    <Link
                      href={item.items?.[0]?.href || '#'}
                      onClick={(e) => e.stopPropagation()}
                      className="w-8 h-8 rounded-full border-2 border-[var(--pp-secondary)] flex items-center justify-center hover:bg-[var(--pp-secondary)]/10 transition-colors"
                    >
                      <div className="text-[var(--pp-secondary)]">
                        {item.icon}
                      </div>
                    </Link>
                  </Tooltip>
                  <div className="w-px h-1 bg-border" />
                  {item.items?.slice(1).map((child) => (
                    <Tooltip key={child.href} content={child.title} side="right">
                      <Link
                        href={child.href!}
                        onClick={(e) => e.stopPropagation()}
                        className={`p-1 rounded-sm transition-colors ${currentPath === child.href
                          ? 'bg-primary'
                          : 'hover:bg-muted'
                          }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${currentPath === child.href ? 'bg-primary-foreground' : 'bg-foreground'
                          }`} />
                      </Link>
                    </Tooltip>
                  ))}
                </div>
              ) : (
                <NavGroup item={item} currentPath={currentPath} />
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* Toggle Button at bottom */}
      <div className="border-t border-border p-2 flex justify-center">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
