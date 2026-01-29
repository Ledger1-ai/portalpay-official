"use client";

import React from "react";
import { useTheme } from "@/contexts/ThemeContext";

interface SignupButtonProps {
    className?: string;
    children?: React.ReactNode;
    variant?: "shiny" | "simple" | "block";
}

export function SignupButton({ className, children, variant = "simple" }: SignupButtonProps) {
    const { theme: siteTheme } = useTheme();

    const handleSignupClick = (e: React.MouseEvent) => {
        e.preventDefault();
        window.dispatchEvent(new Event("pp:wizard:open"));
    };

    if (variant === "shiny") {
        return (
            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSignupClick(e);
                }}
                className={className || "group relative overflow-hidden px-8 py-4 rounded-md bg-pp-secondary text-[var(--primary-foreground)] font-bold text-lg transition-all hover:opacity-100 shadow-lg hover:shadow-xl"}
            >
                <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{
                        backgroundImage: `radial-gradient(circle at 75% 10%, ${siteTheme.primaryColor}, transparent 55%), radial-gradient(circle at 25% 90%, ${siteTheme.primaryColor}, transparent 55%)`,
                        backgroundColor: "#000000",
                        backgroundSize: "400% 400%",
                        animation: "bg-pan 15s ease infinite alternate",
                    }}
                />
                <span className="relative z-10 flex items-center gap-2">
                    {children || "Sign Up Now"}
                </span>
            </button>
        );
    }

    // Handle block/w-full separately in className or here?
    // If variant block, we usually want block w-full text-center

    return (
        <button
            type="button"
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSignupClick(e);
            }}
            className={className || "px-8 py-3 rounded-md bg-pp-secondary text-[var(--primary-foreground)] font-bold text-lg transition-opacity hover:opacity-90"}
        >
            {children || "Sign Up Now"}
        </button>
    );
}
