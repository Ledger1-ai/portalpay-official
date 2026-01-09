import { NextResponse } from "next/server";
import { getBrandKey } from "@/config/brands";
import { headers } from "next/headers";

export async function GET() {
    const accountBalance = {
        miniapp: {
            version: "1",
            name: "BasaltSurge",
            iconUrl: "https://surge.basalthq.com/Surge.png",
            homeUrl: "https://surge.basalthq.com",
            splashImageUrl: "https://surge.basalthq.com/Surge.png",
            splashBackgroundColor: "#0a0a0a",
            subtitle: "Web3-native eCommerce - Crypto Payments & Billing",
            description: "Enterprise crypto payments at 0.5% with instant settlement. Unified billing and analytics.",
            tagline: "Crypto Payments Simplified",
            ogTitle: "BasaltSurge",
            ogDescription: "Enterprise crypto payments at 0.5% with instant settlement. Unified billing and analytics.",
            ogImageUrl: "https://surge.basalthq.com/opengraph-image", // Dynamic OG image
            primaryCategory: "finance",
            tags: ["payments", "crypto", "billing", "merchant"],
            // Account association: The user didn't provide one, so we omit or null.
        }
    };

    return NextResponse.json(accountBalance);
}
