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
            subtitle: "Crypto Payments and Billing",
            description: "Enterprise crypto payments with instant settlement. Unified billing and analytics.",
            tagline: "Crypto Payments Simplified",
            ogTitle: "BasaltSurge",
            ogDescription: "Enterprise crypto payments with instant settlement. Unified billing and analytics.",
            ogImageUrl: "https://surge.basalthq.com/opengraph-image.png", // Generative OG image with extension rewrite
            imageUrl: "https://surge.basalthq.com/opengraph-image.png",
            primaryCategory: "finance",
            tags: ["payments", "crypto", "billing", "merchant"],
        },
        accountAssociation: {
            header: "eyJmaWQiOjEwNDM0NjQsInR5cGUiOiJhdXRoIiwia2V5IjoiMHg4MkU1QUMwNDJhNTYzNTQ4ZTVEZWE1MmY2NGM2ZmU3RTc0Y0NmMkM3In0",
            payload: "eyJkb21haW4iOiJzdXJnZS5iYXNhbHRocS5jb20ifQ",
            signature: "faHRdX6S6EFr9TH8oC/dKpnDJRkkElqlVs2oNnrIK/EsY92TJJBnQAyvphOnKrfEXcYkklxe9t8q0DyX8fmnJRw="
        }
    };

    return NextResponse.json(accountBalance);
}
