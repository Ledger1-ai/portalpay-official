"use client";

import { useEffect, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

export default function FarcasterProvider({ children }: { children: React.ReactNode }) {
    const [isSDKLoaded, setIsSDKLoaded] = useState(false);
    const [context, setContext] = useState<any>();

    useEffect(() => {
        const load = async () => {
            console.log("FarcasterProvider: Loading SDK...");
            try {
                // Check if SDK actions exist
                if (sdk && sdk.actions) {
                    console.log("FarcasterProvider: calling sdk.actions.ready()");
                    sdk.actions.ready();
                } else {
                    console.error("FarcasterProvider: SDK actions not found!", sdk);
                }

                const ctx = await sdk.context;
                console.log("FarcasterProvider: Context loaded", ctx);
                setContext(ctx);
            } catch (err) {
                console.error("FarcasterProvider: Error loading SDK", err);
            }
        };
        if (sdk && !isSDKLoaded) {
            setIsSDKLoaded(true);
            load();
        } else if (!sdk) {
            console.error("FarcasterProvider: SDK import is null/undefined");
        }
    }, [isSDKLoaded]);

    return <>{children}</>;
}
