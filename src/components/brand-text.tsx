"use client";

import React from "react";
import { useBrand } from "@/contexts/BrandContext";
import { getEffectiveBrandKey } from "@/lib/branding";

interface BrandTextProps {
    fallback?: string;
    className?: string;
}

export default function BrandText({ fallback = "BasaltSurge", className }: BrandTextProps) {
    const brand = useBrand();
    // We can try to get it from the context first, but for SEO landing pages 
    // which might be static/cached, we also look at the DOM attributes or just rely not on context
    // if we are outside the provider (though usually landing pages are wrapped).

    // However, `useBrand` relies on Context which is available in the layout.
    // We want to prefer the DOM attribute if available to avoid hydration mismatches
    // or simply rely on the context if it's properly hydratable.

    // A safe approach for client-side only replacement:
    const [text, setText] = React.useState<string>(fallback);

    React.useEffect(() => {
        // Attempt to read from DOM for partner containers
        const domBrandName = document.documentElement.getAttribute("data-pp-brand-name");
        const domBrandKey = document.documentElement.getAttribute("data-pp-brand-key");
        const containerType = document.documentElement.getAttribute("data-pp-container-type");

        // Check context brand
        const ctxBrandName = (brand as any)?.name;
        const ctxBrandKey = (brand as any)?.key;

        // Logic:
        // If partner container, show partner name.
        // If platform container, show "BasaltSurge" (or fallback).

        const isPartner = containerType === "partner" || (ctxBrandKey && ctxBrandKey !== "portalpay" && ctxBrandKey !== "basaltsurge");

        if (isPartner) {
            if (ctxBrandName && ctxBrandName !== "PortalPay" && ctxBrandName !== "BasaltSurge") {
                setText(ctxBrandName);
            } else if (domBrandName) {
                setText(domBrandName);
            } else {
                // If we really can't find a partner name, we might stick with fallback or just "Partner"
                // But usually context has it.
                if (ctxBrandName) setText(ctxBrandName);
            }
        } else {
            // Platform
            setText("BasaltSurge");
        }

    }, [brand]);

    return <span className={className}>{text}</span>;
}
