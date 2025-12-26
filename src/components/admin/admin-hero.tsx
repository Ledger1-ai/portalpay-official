'use client';

import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import { useBrand } from '@/contexts/BrandContext';
import { cachedFetch } from '@/lib/client-api-cache';

// Fixed hero/nav bar for Admin, aligned with global navbar and AdminSidebar offsets
// Mirrors docs header positioning: fixed under global nav, with blur + border.
export default function AdminHero() {
  const brand = useBrand();

  // Avoid generic placeholder brand names and generic platform assets in partner containers
  // Derive container type from runtime API (works across custom domains)
  const [container, setContainer] = useState<{ containerType: string }>({ containerType: 'unknown' });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const j = await cachedFetch('/api/site/container', { cache: 'no-store' });
        if (!cancelled && j && typeof j === 'object') {
          setContainer({ containerType: String(j.containerType || 'unknown').toLowerCase() });
        }
      } catch { }
    })();
    return () => { cancelled = true; };
  }, []);
  const isPartnerContainer = (container.containerType || '').toLowerCase() === 'partner';
  const rawBrandName = String(brand?.name || '').trim();
  const isGenericBrandName =
    /^ledger\d*$/i.test(rawBrandName) ||
    /^partner\d*$/i.test(rawBrandName) ||
    /^default$/i.test(rawBrandName);
  const keyForDisplay = String((brand as any)?.key || '').trim();
  const titleizedKey = keyForDisplay.toLowerCase() === 'basaltsurge' ? 'BasaltSurge' : (keyForDisplay ? keyForDisplay.charAt(0).toUpperCase() + keyForDisplay.slice(1) : 'PortalPay');
  const finalName = (!rawBrandName || isGenericBrandName) ? titleizedKey : rawBrandName;
  const displayBrandName = finalName.toLowerCase() === 'basaltsurge' ? 'BasaltSurge' : finalName;

  const appLogo = String(brand?.logos?.app || '').trim();
  const symLogo = String(brand?.logos?.symbol || '').trim();
  const logoCandidate = symLogo || appLogo;
  const fileName = (logoCandidate.split('/').pop() || '').toLowerCase();
  const genericLogoRe = /^(portalpay(\\d*)\\.png|ppsymbol(\\.png)?|favicon\\-[0-9]+x[0-9]+\\.png|next\\.svg|cblogod\\.png)$/i;
  const preferredLogo = (!logoCandidate || genericLogoRe.test(fileName)) ? '/ppsymbol.png' : logoCandidate;

  return (
    <header className="fixed top-[84px] left-0 right-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Image
              src={preferredLogo}
              alt={displayBrandName || 'Brand'}
              width={32}
              height={32}
            />
            <span className="font-bold text-lg">{displayBrandName}</span>
          </div>
          <div className="h-6 w-px bg-border" />
          <h1 className="text-xl md:text-2xl font-semibold">Admin</h1>
        </div>
        {/* Right side reserved for future quick actions if needed */}
        <div className="hidden md:flex items-center gap-3" />
      </div>
    </header>
  );
}
