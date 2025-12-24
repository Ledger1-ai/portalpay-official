"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { isCandidateSlug } from "@/lib/routing";
import { Navbar } from "@/components/navbar";
import { LanguageSelectorBar } from "@/components/language-selector-bar";
import { TerminalViewBar } from "@/components/terminal-view-bar";

/**
 * Check if the current hostname is a custom domain (not a main platform domain).
 */
function isCustomDomainHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return !(
    h.endsWith("basalthq.com") ||
    h.endsWith("portalpay.io") ||
    h.includes("localhost") ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h.includes("azurewebsites.net") ||
    h.includes("vercel.app")
  );
}

/**
 * HideableNavbar
 * - Hides the global Navbar on the /portal route so the payment portal
 *   opens in a clean window without the rest of the interface.
 * - Hides on custom domains (shop storefronts accessed via custom domain)
 * - Includes the LanguageSelectorBar below the navbar for language selection
 */
export function HideableNavbar() {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const [isCustomDomain, setIsCustomDomain] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect custom domain on client mount
  useEffect(() => {
    try {
      const hostname = window.location.hostname;
      setIsCustomDomain(isCustomDomainHostname(hostname));
    } catch {
      setIsCustomDomain(false);
    }
  }, []);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  const fsParam = String(searchParams?.get("fs") || searchParams?.get("fullscreen") || "").toLowerCase();
  const isFullscreen = fsParam === "1" || fsParam === "true";

  // Hide navbar on custom domains (shop storefronts)
  if (isCustomDomain) {
    return null;
  }
  if (pathname === "/portal" || pathname.startsWith("/portal/")) {
    return null;
  }
  if (pathname.startsWith("/shop/")) {
    return null;
  }
  // Hide navbar on MSA signing pages (clean Adobe Sign iframe experience)
  if (pathname === "/msa" || pathname === "/msas") {
    return null;
  }
  // Hide navbar on reader pages (clean immersive reading experience)
  if (pathname.startsWith("/reader/") || pathname === "/reader") {
    return null;
  }
  // Hide navbar on /terminal when opened as a pop-out/fullscreen (fs=1)
  if ((pathname === "/terminal" || pathname.startsWith("/terminal")) && isFullscreen) {
    return null;
  }
  // Hide navbar on /terminal on mobile when in terminal mode (default or view=terminal)
  // This allows the terminal numpad and QR code to fit without scrolling
  const viewParam = String(searchParams?.get("view") || "").toLowerCase();
  const isTerminalView = viewParam === "terminal" || viewParam === "" || !viewParam;
  if ((pathname === "/terminal" || pathname.startsWith("/terminal")) && isMobile && isTerminalView) {
    return null;
  }
  // Hide navbar on vanity slugs (e.g., /myshop)
  if (isCandidateSlug(pathname)) {
    return null;
  }
  return (
    <div className="sticky top-0 z-[10001]">
      <Navbar />
      {!((pathname.startsWith("/pricing") || pathname.startsWith("/terminal")) && isMobile) ? <LanguageSelectorBar /> : null}
      {(pathname.startsWith("/pricing") || pathname.startsWith("/terminal")) && !isMobile ? <TerminalViewBar /> : null}
    </div>
  );
}
