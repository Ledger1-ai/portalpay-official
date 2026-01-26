import { NextRequest, NextResponse } from "next/server";
import { getReceipts, updateReceiptStatus } from "@/lib/receipts-mem";
import { getInventoryItems } from "@/lib/inventory-mem";
import { getContainer } from "@/lib/cosmos";

/**
 * GET /api/kitchen/orders
 * 
 * Fetches kitchen orders from:
 * 1. POS receipts (paid receipts with restaurant items)
 * 2. Uber Eats orders (from Cosmos DB)
 * 
 * Query params:
 * - status: Filter by kitchen status (new,preparing,ready,completed)
 * - wallet: Merchant wallet (from header x-wallet)
 * - source: Filter by source ("pos", "ubereats", or "all" - default)
 */
export async function GET(request: NextRequest) {
  try {
    const wallet = request.headers.get("x-wallet");
    if (!wallet) {
      return NextResponse.json({ error: "Wallet required" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status")?.split(",") || ["new", "preparing", "ready"];
    const sourceFilter = searchParams.get("source") || "all";

    const kitchenOrders: any[] = [];

    // =====================
    // 1. Fetch POS Orders
    // =====================
    if (sourceFilter === "all" || sourceFilter === "pos") {
      const allReceipts = getReceipts(undefined, wallet.toLowerCase());
      const paidStatuses = ["checkout_success", "reconciled", "tx_mined", "recipient_validated", "paid"];
      const paidReceipts = allReceipts.filter((r: any) => {
        const status = String(r.status || "").toLowerCase();
        return paidStatuses.includes(status);
      });

      const inventory = getInventoryItems(wallet.toLowerCase());
      const inventoryMap = new Map(
        inventory.map((item: any) => [String(item.id || "").toLowerCase(), item])
      );

      for (const receipt of paidReceipts) {
        const lineItems = Array.isArray(receipt.lineItems) ? receipt.lineItems : [];
        const restaurantItems: any[] = [];

        for (const item of lineItems) {
          const label = String(item.label || "").toLowerCase();
          if (label.includes("processing fee") || label.includes("tax")) {
            continue;
          }

          const itemId = String((item as any).itemId || "").toLowerCase();
          const sku = String((item as any).sku || "").toLowerCase();

          let inventoryItem: any = null;
          if (itemId) {
            inventoryItem = inventoryMap.get(itemId);
          }
          if (!inventoryItem && sku) {
            inventoryItem = inventory.find((inv: any) =>
              String(inv.sku || "").toLowerCase() === sku
            );
          }

          if (inventoryItem && inventoryItem.industryPack === "restaurant") {
            restaurantItems.push({
              ...item,
              industryPack: "restaurant",
              attributes: inventoryItem.attributes || {},
            });
          }
        }

        if (restaurantItems.length > 0) {
          const kitchenStatus = String((receipt as any).kitchenStatus || "new");
          if (statusFilter.includes(kitchenStatus)) {
            kitchenOrders.push({
              receiptId: receipt.receiptId,
              totalUsd: receipt.totalUsd,
              currency: receipt.currency || "USD",
              createdAt: receipt.createdAt,
              status: receipt.status,
              kitchenStatus,
              lineItems: restaurantItems,
              brandName: receipt.brandName,
              kitchenMetadata: (receipt as any).kitchenMetadata || {
                enteredKitchenAt: receipt.createdAt,
              },
              orderType: (receipt as any).orderType || "dine-in",
              tableNumber: (receipt as any).tableNumber,
              customerName: (receipt as any).customerName,
              specialInstructions: (receipt as any).specialInstructions,
              source: "pos",
            });
          }
        }
      }
    }

    // =========================
    // 2. Fetch Uber Eats Orders
    // =========================
    if (sourceFilter === "all" || sourceFilter === "ubereats") {
      try {
        const container = await getContainer();

        // Map Uber statuses to kitchen statuses
        const uberToKitchenStatus: Record<string, string> = {
          "CREATED": "new",
          "ACCEPTED": "new",
          "PREPARING": "preparing",
          "READY": "ready",
          "PICKED_UP": "completed",
          "DELIVERED": "completed",
          "CANCELLED": "completed",
        };

        // Query Uber Eats orders from Cosmos DB
        const query = {
          query: "SELECT * FROM c WHERE c.type='uber_eats_order' AND c.status NOT IN ('CANCELLED', 'DELIVERED')",
          parameters: []
        };

        const { resources: uberOrders } = await container.items.query(query).fetchAll();

        for (const order of uberOrders) {
          const kitchenStatus = uberToKitchenStatus[order.status] || "new";

          // Apply status filter
          if (!statusFilter.includes(kitchenStatus)) {
            continue;
          }

          // Transform to KDS format
          const lineItems = (order.items || []).map((item: any) => ({
            label: item.title || item.name || "Unknown Item",
            priceUsd: (item.price || 0) / 100, // cents to dollars
            qty: item.quantity || 1,
            attributes: item.modifiers ? { modifierGroups: item.modifiers } : {},
          }));

          kitchenOrders.push({
            receiptId: `UE-${order.orderId?.slice(-8)?.toUpperCase() || order.id}`,
            uberOrderId: order.orderId, // Keep original for updates
            totalUsd: (order.total || 0) / 100,
            currency: order.currency || "USD",
            createdAt: order.placedAt || order.createdAt,
            status: order.status,
            kitchenStatus,
            lineItems,
            brandName: "Uber Eats",
            kitchenMetadata: {
              enteredKitchenAt: order.placedAt || order.createdAt,
              startedPreparingAt: order.status === "PREPARING" ? order.updatedAt : undefined,
              markedReadyAt: order.status === "READY" ? order.updatedAt : undefined,
            },
            orderType: "delivery",
            tableNumber: undefined,
            customerName: order.customerName || "Uber Eats Customer",
            specialInstructions: order.specialInstructions,
            estimatedPickup: order.estimatedReadyTime,
            source: "ubereats",
            // Include Uber-specific metadata
            uberMetadata: {
              storeId: order.storeId,
              estimatedDelivery: order.estimatedDeliveryTime,
              driverId: order.driverId,
            },
          });
        }
      } catch (uberError) {
        console.warn("[kitchen/orders] Failed to fetch Uber Eats orders:", uberError);
        // Continue without Uber orders - don't fail the whole request
      }
    }

    // Sort by creation time (oldest first - FIFO)
    kitchenOrders.sort((a: any, b: any) => {
      const aTime = Number(a.kitchenMetadata?.enteredKitchenAt || a.createdAt || 0);
      const bTime = Number(b.kitchenMetadata?.enteredKitchenAt || b.createdAt || 0);
      return aTime - bTime;
    });

    return NextResponse.json({
      ok: true,
      orders: kitchenOrders,
      count: kitchenOrders.length,
      sources: {
        pos: kitchenOrders.filter(o => o.source === "pos").length,
        ubereats: kitchenOrders.filter(o => o.source === "ubereats").length,
      }
    });
  } catch (error: any) {
    console.error("[kitchen/orders] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch kitchen orders" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/kitchen/orders
 * Update kitchen status for a receipt or Uber Eats order
 * 
 * Body: { receiptId, kitchenStatus: "new" | "preparing" | "ready" | "completed" }
 */
export async function PATCH(request: NextRequest) {
  try {
    const wallet = request.headers.get("x-wallet");
    if (!wallet) {
      return NextResponse.json({ error: "Wallet required" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { receiptId, kitchenStatus, uberOrderId } = body;

    if (!receiptId || !kitchenStatus) {
      return NextResponse.json(
        { error: "receiptId and kitchenStatus required" },
        { status: 400 }
      );
    }

    const validStatuses = ["new", "preparing", "ready", "completed"];
    if (!validStatuses.includes(kitchenStatus)) {
      return NextResponse.json(
        { error: "Invalid kitchen status" },
        { status: 400 }
      );
    }

    // Check if this is an Uber Eats order (starts with UE-)
    if (receiptId.startsWith("UE-") || uberOrderId) {
      // Update Uber Eats order in Cosmos DB
      const container = await getContainer();
      const orderId = uberOrderId || receiptId.replace("UE-", "");

      // Map kitchen status to Uber status
      const kitchenToUberStatus: Record<string, string> = {
        "new": "ACCEPTED",
        "preparing": "PREPARING",
        "ready": "READY",
        "completed": "PICKED_UP",
      };
      const uberStatus = kitchenToUberStatus[kitchenStatus] || "ACCEPTED";

      // Find and update the order
      const query = {
        query: "SELECT * FROM c WHERE c.type='uber_eats_order' AND (c.orderId=@orderId OR ENDSWITH(c.orderId, @shortId))",
        parameters: [
          { name: "@orderId", value: orderId },
          { name: "@shortId", value: orderId.toUpperCase() }
        ]
      };

      const { resources } = await container.items.query(query).fetchAll();

      if (resources.length === 0) {
        return NextResponse.json({ error: "Uber order not found" }, { status: 404 });
      }

      const order = resources[0];
      order.status = uberStatus;
      order.kitchenStatus = kitchenStatus;
      order.updatedAt = Date.now();

      // Add metadata timestamps
      if (kitchenStatus === "preparing") {
        order.startedPreparingAt = Date.now();
      } else if (kitchenStatus === "ready") {
        order.markedReadyAt = Date.now();
      } else if (kitchenStatus === "completed") {
        order.completedAt = Date.now();
      }

      await container.items.upsert(order);

      return NextResponse.json({
        ok: true,
        receipt: {
          receiptId,
          kitchenStatus,
          uberStatus,
          source: "ubereats",
        },
      });
    }

    // Otherwise, it's a POS receipt
    const allReceipts = getReceipts(undefined, wallet.toLowerCase());
    const receipt = allReceipts.find((r: any) => r.receiptId === receiptId);

    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    const receiptWallet = String(receipt.wallet || "").toLowerCase();
    if (receiptWallet !== wallet.toLowerCase()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    updateReceiptStatus(receiptId, wallet.toLowerCase(), `kitchen:${kitchenStatus}`);

    const updatedReceipts = getReceipts(undefined, wallet.toLowerCase());
    const updatedReceipt = updatedReceipts.find((r: any) => r.receiptId === receiptId);

    return NextResponse.json({
      ok: true,
      receipt: {
        ...updatedReceipt,
        kitchenStatus,
        source: "pos",
      },
    });
  } catch (error: any) {
    console.error("[kitchen/orders] PATCH Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update kitchen status" },
      { status: 500 }
    );
  }
}
