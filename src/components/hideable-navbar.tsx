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
    h.includes("vercel.app") ||
    h.includes("xpaypass.com")
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

  // Determine if navbar should be hidden
  const viewParam = String(searchParams?.get("view") || "").toLowerCase();
  const isTerminalView = viewParam === "terminal" || viewParam === "" || !viewParam;

  const shouldHideNavbar =
    isCustomDomain ||
    pathname === "/portal" || pathname.startsWith("/portal/") ||
    pathname.startsWith("/shop/") ||
    pathname === "/apply" || pathname.startsWith("/apply/") ||
    pathname === "/kiosk" || pathname.startsWith("/kiosk/") ||
    pathname === "/msa" || pathname === "/msas" ||
    pathname.startsWith("/reader/") || pathname === "/reader" ||
    ((pathname === "/terminal" || pathname.startsWith("/terminal")) && isFullscreen) ||
    ((pathname === "/terminal" || pathname.startsWith("/terminal")) && isMobile && isTerminalView) ||
    pathname.match(/^\/terminal\/0x[a-fA-F0-9]{40}/) ||
    pathname === "/handheld" || pathname.startsWith("/handheld/") ||
    isCandidateSlug(pathname);

  // Apply body class for navbar padding
  useEffect(() => {
    if (!shouldHideNavbar) {
      document.body.classList.add("with-global-navbar");
    } else {
      document.body.classList.remove("with-global-navbar");
    }
    return () => {
      document.body.classList.remove("with-global-navbar");
    };
  }, [shouldHideNavbar]);

  if (shouldHideNavbar) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[10001] flex flex-col">
      <Navbar />
      {!((pathname.startsWith("/pricing") || pathname.startsWith("/terminal")) && isMobile) ? <LanguageSelectorBar /> : null}
      {(pathname.startsWith("/pricing") || pathname.startsWith("/terminal")) && !isMobile ? <TerminalViewBar /> : null}
    </div>
  );
}
