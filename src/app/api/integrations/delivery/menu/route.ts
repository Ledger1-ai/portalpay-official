
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { requireThirdwebAuth } from "@/lib/auth";
import { updateStoreMenu, getUberEatsConfig } from "@/lib/uber-eats";

export const dynamic = "force-dynamic";

/**
 * POST: Sync restaurant menu items to Uber Eats
 * 
 * This endpoint:
 * 1. Fetches restaurant-tagged inventory items
 * 2. Transforms them to Uber Eats menu format
 * 3. PUTs the menu to Uber Eats API
 */
export async function POST(req: NextRequest) {
    try {
        // 1. Auth check (Merchant)
        const auth = await requireThirdwebAuth(req);
        const wallet = auth.wallet;

        const { storeId } = await req.json();
        if (!storeId) {
            return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
        }

        console.log(`[Menu Sync] Starting for store ${storeId}, merchant ${wallet.slice(0, 10)}...`);

        // 2. Check platform config
        const config = await getUberEatsConfig();
        if (!config) {
            return NextResponse.json({
                error: "Uber Eats not configured",
                details: "Admin must configure Uber Eats credentials"
            }, { status: 503 });
        }

        // 3. Fetch Inventory (Restaurant Items Only)
        const container = await getContainer();
        const querySpec = {
            query: "SELECT * FROM c WHERE c.type='inventory_item' AND c.wallet=@wallet AND c.industryPack='restaurant'",
            parameters: [{ name: "@wallet", value: wallet }]
        };

        const { resources: items } = await container.items.query(querySpec).fetchAll();
        const restaurantItems = Array.isArray(items) ? items : [];

        if (restaurantItems.length === 0) {
            return NextResponse.json({
                success: false,
                message: "No restaurant items found in your inventory.",
                details: "Tag items with 'restaurant' industry pack to sync them."
            });
        }

        console.log(`[Menu Sync] Found ${restaurantItems.length} restaurant items`);

        // 4. Transform to Uber Eats Menu Structure
        const menuItems = restaurantItems.map((item, index) => ({
            id: `item-${item.id || index}`,
            title: {
                translations: {
                    en: item.name || "Untitled Item"
                }
            },
            description: {
                translations: {
                    en: item.description || ""
                }
            },
            image_url: item.imageUrl || item.image || undefined,
            price_info: {
                price: Math.round((item.priceUsd || 0) * 100), // Convert to cents
                currency_code: item.currency || "USD"
            },
            quantity_info: {
                quantity: {
                    max_permitted: item.maxQty || 10,
                    charge_above: 0,
                    default_quantity: 1
                }
            },
            // Suspend item if out of stock
            suspension_info: item.stockQty === 0 ? {
                suspension: {
                    suspend_until: 0, // 0 = indefinite until manually resumed
                    reason: "OUT_OF_STOCK"
                }
            } : undefined
        }));

        // Build the menu payload per Uber Eats API spec
        const menuPayload = {
            menus: [{
                id: "main-menu",
                title: {
                    translations: {
                        en: "Main Menu"
                    }
                },
                service_availability: [
                    { day_of_week: "monday", time_periods: [{ start_time: "00:00", end_time: "23:59" }] },
                    { day_of_week: "tuesday", time_periods: [{ start_time: "00:00", end_time: "23:59" }] },
                    { day_of_week: "wednesday", time_periods: [{ start_time: "00:00", end_time: "23:59" }] },
                    { day_of_week: "thursday", time_periods: [{ start_time: "00:00", end_time: "23:59" }] },
                    { day_of_week: "friday", time_periods: [{ start_time: "00:00", end_time: "23:59" }] },
                    { day_of_week: "saturday", time_periods: [{ start_time: "00:00", end_time: "23:59" }] },
                    { day_of_week: "sunday", time_periods: [{ start_time: "00:00", end_time: "23:59" }] },
                ],
                category_ids: ["all-items"]
            }],
            categories: [{
                id: "all-items",
                title: {
                    translations: {
                        en: "All Items"
                    }
                },
                entities: menuItems.map(item => ({
                    id: item.id,
                    type: "ITEM"
                }))
            }],
            items: menuItems
        };

        console.log(`[Menu Sync] Pushing ${menuItems.length} items to Uber Eats (${config.isSandbox ? 'sandbox' : 'production'})`);

        // 5. Push to Uber Eats API
        const result = await updateStoreMenu(storeId, menuPayload);

        if (!result.ok) {
            console.error(`[Menu Sync] Failed:`, result.error);
            return NextResponse.json({
                success: false,
                error: "Menu sync failed",
                details: result.error
            }, { status: 500 });
        }

        // 6. Record sync in database
        const syncRecord = {
            id: `menu_sync:${wallet}:${storeId}:${Date.now()}`,
            wallet,
            storeId,
            type: "menu_sync_log",
            itemCount: menuItems.length,
            syncedAt: Date.now(),
            environment: config.isSandbox ? "sandbox" : "production"
        };

        try {
            await container.items.create(syncRecord);
        } catch (e) {
            console.warn("[Menu Sync] Failed to log sync record:", e);
        }

        console.log(`[Menu Sync] Success! ${menuItems.length} items synced`);

        return NextResponse.json({
            success: true,
            syncedItems: menuItems.length,
            environment: config.isSandbox ? "sandbox" : "production",
            details: `Successfully synced ${menuItems.length} items to Uber Eats`
        });

    } catch (err: any) {
        console.error("[Menu Sync] Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
