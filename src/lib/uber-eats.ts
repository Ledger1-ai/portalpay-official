/**
 * Uber Eats Integration Helper
 * 
 * Provides:
 * - Token caching with 30-day TTL
 * - Environment-aware API URLs
 * - Authenticated API calls
 */

import { getContainer } from "@/lib/cosmos";
import { decrypt } from "@/lib/crypto";

// Token cache TTL: 25 days (buffer before 30-day expiry)
const TOKEN_TTL_MS = 25 * 24 * 60 * 60 * 1000;

export interface UberEatsConfig {
    clientId: string;
    clientSecret: string;
    isSandbox: boolean;
}

export interface CachedToken {
    accessToken: string;
    expiresAt: number;
    scope: string;
}

/**
 * Get API base URL based on environment
 */
export function getApiBaseUrl(isSandbox: boolean): string {
    return isSandbox ? "https://sandbox-api.uber.com" : "https://api.uber.com";
}

/**
 * Get Auth URL based on environment
 */
export function getAuthUrl(isSandbox: boolean): string {
    return isSandbox
        ? "https://sandbox-login.uber.com/oauth/v2/token"
        : "https://login.uber.com/oauth/v2/token";
}

/**
 * Fetch platform configuration from Cosmos DB
 */
export async function getUberEatsConfig(): Promise<UberEatsConfig | null> {
    try {
        const container = await getContainer();
        const { resource } = await container.item("ubereats_platform_config:portalpay", "portalpay").read();

        if (!resource || !resource.clientId || !resource.clientSecret) {
            console.error("[UberEats] Platform config missing or incomplete");
            return null;
        }

        const clientId = await decrypt(resource.clientId);
        const clientSecret = await decrypt(resource.clientSecret);
        const isSandbox = resource.environment === "sandbox" || resource.sandbox === true;

        return { clientId, clientSecret, isSandbox };
    } catch (error) {
        console.error("[UberEats] Failed to get config:", error);
        return null;
    }
}

/**
 * Get cached token or generate new one
 * Tokens are cached per platform (not per store) since we use client_credentials
 */
export async function getAccessToken(): Promise<CachedToken | null> {
    const container = await getContainer();
    const tokenDocId = "ubereats_access_token:portalpay";

    // Try to get cached token
    try {
        const { resource: tokenDoc } = await container.item(tokenDocId, "portalpay").read();

        if (tokenDoc && tokenDoc.expiresAt > Date.now()) {
            console.log("[UberEats] Using cached access token");
            return {
                accessToken: tokenDoc.accessToken,
                expiresAt: tokenDoc.expiresAt,
                scope: tokenDoc.scope
            };
        }
    } catch {
        // Token doesn't exist, will generate new one
    }

    // Generate new token
    const config = await getUberEatsConfig();
    if (!config) {
        console.error("[UberEats] Cannot get token - no config");
        return null;
    }

    const params = new URLSearchParams();
    params.append("client_id", config.clientId);
    params.append("client_secret", config.clientSecret);
    params.append("grant_type", "client_credentials");
    params.append("scope", "eats.store eats.order eats.store.orders.read eats.store.status.write");

    const authUrl = getAuthUrl(config.isSandbox);
    console.log(`[UberEats] Fetching new token from ${config.isSandbox ? 'sandbox' : 'production'}`);

    const response = await fetch(authUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
    });

    if (!response.ok) {
        const error = await response.text();
        console.error("[UberEats] Token fetch failed:", error);
        return null;
    }

    const tokenData = await response.json();
    const expiresAt = Date.now() + TOKEN_TTL_MS; // Use our TTL, not Uber's full 30 days

    // Cache the token
    const tokenDoc = {
        id: tokenDocId,
        wallet: "portalpay",
        accessToken: tokenData.access_token,
        expiresAt,
        scope: tokenData.scope || "",
        tokenType: tokenData.token_type,
        createdAt: Date.now()
    };

    try {
        await container.items.upsert(tokenDoc);
        console.log("[UberEats] Token cached successfully, expires:", new Date(expiresAt).toISOString());
    } catch (err) {
        console.error("[UberEats] Failed to cache token:", err);
    }

    return {
        accessToken: tokenData.access_token,
        expiresAt,
        scope: tokenData.scope || ""
    };
}

/**
 * Make authenticated API call to Uber Eats
 */
export async function uberEatsApiCall<T = any>(
    endpoint: string,
    options: {
        method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
        body?: any;
        storeId?: string;
    } = {}
): Promise<{ ok: boolean; data?: T; error?: string; status?: number }> {
    const token = await getAccessToken();
    if (!token) {
        return { ok: false, error: "Failed to get access token" };
    }

    const config = await getUberEatsConfig();
    if (!config) {
        return { ok: false, error: "Failed to get config" };
    }

    const baseUrl = getApiBaseUrl(config.isSandbox);
    const url = `${baseUrl}${endpoint}`;

    console.log(`[UberEats API] ${options.method || "GET"} ${url}`);

    try {
        const response = await fetch(url, {
            method: options.method || "GET",
            headers: {
                "Authorization": `Bearer ${token.accessToken}`,
                "Content-Type": "application/json",
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
        });

        const status = response.status;

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[UberEats API] Error ${status}:`, errorText);
            return { ok: false, error: errorText, status };
        }

        // Some endpoints return empty body on success
        const text = await response.text();
        const data = text ? JSON.parse(text) : null;

        return { ok: true, data, status };
    } catch (err: any) {
        console.error("[UberEats API] Request failed:", err);
        return { ok: false, error: err.message };
    }
}

/**
 * Validate store access
 */
export async function validateStoreAccess(storeId: string): Promise<boolean> {
    const result = await uberEatsApiCall(`/v1/eats/stores/${storeId}`);
    return result.ok;
}

/**
 * Get store details
 */
export async function getStoreDetails(storeId: string): Promise<any | null> {
    const result = await uberEatsApiCall(`/v1/eats/stores/${storeId}`);
    return result.ok ? result.data : null;
}

/**
 * Update store menu
 */
export async function updateStoreMenu(storeId: string, menuPayload: any): Promise<{ ok: boolean; error?: string }> {
    const result = await uberEatsApiCall(`/v2/eats/stores/${storeId}/menus`, {
        method: "PUT",
        body: menuPayload
    });
    return { ok: result.ok, error: result.error };
}

/**
 * Get order details
 */
export async function getOrderDetails(orderId: string): Promise<any | null> {
    const result = await uberEatsApiCall(`/v1/eats/orders/${orderId}`);
    return result.ok ? result.data : null;
}

/**
 * Accept order
 */
export async function acceptOrder(orderId: string, readyForPickupTime?: string): Promise<boolean> {
    const body: any = {};
    if (readyForPickupTime) {
        body.ready_for_pickup_time = readyForPickupTime;
    }

    const result = await uberEatsApiCall(`/v1/eats/orders/${orderId}/accept`, {
        method: "POST",
        body
    });
    return result.ok;
}

/**
 * Deny order
 */
export async function denyOrder(orderId: string, reason: string): Promise<boolean> {
    const result = await uberEatsApiCall(`/v1/eats/orders/${orderId}/deny`, {
        method: "POST",
        body: { reason }
    });
    return result.ok;
}

/**
 * Cancel order
 */
export async function cancelOrder(orderId: string, reason: string, cancellingParty: "MERCHANT"): Promise<boolean> {
    const result = await uberEatsApiCall(`/v1/eats/orders/${orderId}/cancel`, {
        method: "POST",
        body: {
            reason,
            cancelling_party: cancellingParty
        }
    });
    return result.ok;
}
