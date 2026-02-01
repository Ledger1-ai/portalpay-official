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
    const { searchParams } = new URL(request.url);
    const wallet = request.headers.get("x-wallet") || searchParams.get("wallet");

    if (!wallet) {
      return NextResponse.json({ error: "Wallet required" }, { status: 400 });
    }

    const statusFilter = searchParams.get("status")?.split(",") || ["new", "preparing", "ready"];
    const sourceFilter = searchParams.get("source") || "all";

    const kitchenOrders: any[] = [];

    // =====================
    // 1. Fetch POS Orders
    // =====================
    // =====================
    // 1. Fetch POS Orders (from Cosmos DB)
    // =====================
    if (sourceFilter === "all" || sourceFilter === "pos") {
      try {
        const container = await getContainer();

        // Build query for POS receipts
        // We want receipts that have a kitchenStatus and are not cancelled/refunded (unless we track those too)
        // AND status is relevant (e.g. not just 'generated' floating without items, but actual orders)
        // kitchenStatus presence implies it's an order sent to kitchen.

        // Filter by kitchen statuses if specified
        // statusFilter is array of strings.
        // Cosmos IN clause: WHERE c.kitchenStatus IN ('new', 'preparing', 'ready')
        const statusClause = statusFilter.length > 0
          ? `AND ARRAY_CONTAINS(@statusFilter, c.kitchenStatus)`
          : "";

        const querySpec = {
          query: `
            SELECT * FROM c 
            WHERE c.type='receipt' 
            AND c.wallet=@wallet 
            AND IS_DEFINED(c.kitchenStatus) 
            ${statusClause}
            ORDER BY c.createdAt ASC
          `,
          parameters: [
            { name: "@wallet", value: wallet.toLowerCase() },
            { name: "@statusFilter", value: statusFilter }
          ]
        };

        const { resources: posReceipts } = await container.items.query(querySpec).fetchAll();

        for (const receipt of posReceipts) {
          const lineItems = Array.isArray(receipt.lineItems) ? receipt.lineItems : [];

          // Filter out taxes/fees
          const restaurantItems = lineItems.filter((item: any) => {
            const label = String(item.label || "").toLowerCase();
            return !label.includes("processing fee") && !label.includes("tax") && !label.includes("discount");
          }).map((item: any) => {
            // Unify modifier structure for KDS
            // The Handheld/API sends 'modifiers' array on the item directly now (step 803)
            // The KDS component (step 843) expects 'attributes.modifierGroups' or similar?
            // Actually, let's just pass 'modifiers' and update the frontend component to handle it.
            // But to minimize frontend changes now, let's map it if possible.
            // Component code: const modifiers = item.attributes?.modifierGroups || [];

            let modGroups = item.attributes?.modifierGroups || [];
            if (Array.isArray(item.modifiers) && item.modifiers.length > 0 && modGroups.length === 0) {
              // Map flat modifiers to a "Modifiers" group
              modGroups = [{
                name: "Modifiers",
                modifiers: item.modifiers.map((m: any) => ({
                  name: m.name,
                  priceAdjustment: m.priceAdjustment,
                  selected: true
                }))
              }];
            }

            return {
              ...item,
              attributes: {
                ...item.attributes,
                modifierGroups: modGroups
              }
            };
          });

          if (restaurantItems.length > 0) {
            let serverName = receipt.employeeName || receipt.metadata?.employeeName || receipt.servedBy;
            let specialInstructions = receipt.note || receipt.specialInstructions;

            // Fallback: Parse Server Name from note if not explicit
            if (!serverName && specialInstructions && specialInstructions.includes("Server:")) {
              const match = specialInstructions.match(/Server:\s*([^\n]+)/i);
              if (match) {
                serverName = match[1].trim();
              }
            }

            kitchenOrders.push({
              receiptId: receipt.receiptId,
              totalUsd: receipt.totalUsd,
              currency: receipt.currency || "USD",
              createdAt: receipt.createdAt,
              status: receipt.status,
              kitchenStatus: receipt.kitchenStatus,
              lineItems: restaurantItems,
              brandName: receipt.brandName,
              kitchenMetadata: receipt.kitchenMetadata || {
                enteredKitchenAt: receipt.createdAt,
              },
              orderType: receipt.orderType || (receipt.tableNumber ? "dine-in" : "takeout"),
              tableNumber: receipt.tableNumber,
              customerName: receipt.customerName || (receipt.tableNumber ? `Table ${receipt.tableNumber}` : "Guest"),
              serverName,
              specialInstructions,
              source: "pos",
            });
          }
        }
      } catch (e) {
        console.error("[kitchen/orders] Failed to fetch POS orders from Cosmos:", e);
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

    const validStatuses = ["new", "preparing", "ready", "completed", "archived"];
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
    const container = await getContainer();
    const { resources: posReceipts } = await container.items.query({
      query: "SELECT * FROM c WHERE c.receiptId = @id AND c.wallet = @wallet",
      parameters: [
        { name: "@id", value: receiptId },
        { name: "@wallet", value: wallet.toLowerCase() }
      ]
    }).fetchAll();

    if (posReceipts.length === 0) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    const posReceipt = posReceipts[0];
    posReceipt.kitchenStatus = kitchenStatus;

    // Add metadata timestamps for POS too
    posReceipt.kitchenMetadata = posReceipt.kitchenMetadata || { enteredKitchenAt: posReceipt.createdAt };

    if (kitchenStatus === "preparing") {
      posReceipt.kitchenMetadata.startedPreparingAt = Date.now();
    } else if (kitchenStatus === "ready") {
      posReceipt.kitchenMetadata.markedReadyAt = Date.now();
    } else if (kitchenStatus === "completed") {
      posReceipt.kitchenMetadata.completedAt = Date.now();
    }

    await container.items.upsert(posReceipt);

    return NextResponse.json({
      ok: true,
      receipt: {
        ...posReceipt,
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
