
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getContainer } from "@/lib/cosmos";
import { decrypt } from "@/lib/crypto";
import { getOrderDetails } from "@/lib/uber-eats";

export const dynamic = "force-dynamic";

/**
 * Uber Eats Webhook Handler
 * 
 * Receives and processes real-time events from Uber Eats:
 * - orders.notification: New order created
 * - orders.cancel: Order cancelled
 * - store.status.changed: Store status updated
 */

export async function GET() {
    return NextResponse.json({
        status: "active",
        message: "Uber Eats Webhook endpoint is live. Use POST with valid X-Uber-Signature.",
        supportedEvents: ["orders.notification", "orders.cancel", "store.status.changed"]
    }, {
        headers: { "Access-Control-Allow-Origin": "*" }
    });
}

export async function POST(req: NextRequest) {
    try {
        // 1. Read raw body first (needed for HMAC verification)
        const bodyText = await req.text();

        // 2. Validate Signature (X-Uber-Signature header)
        const signature = req.headers.get("X-Uber-Signature");
        if (!signature) {
            console.warn("[Uber Webhook] Missing X-Uber-Signature header");
            return new NextResponse("Missing Signature", { status: 401 });
        }

        // 3. Fetch client secret for HMAC verification
        const container = await getContainer();
        const { resource } = await container.item("ubereats_platform_config:portalpay", "portalpay").read();

        if (!resource || !resource.clientSecret) {
            console.error("[Uber Webhook] Platform credentials not found");
            return new NextResponse("Configuration Error", { status: 500 });
        }

        // Decrypt client secret (used as signing key per Uber docs)
        const clientSecret = await decrypt(resource.clientSecret);

        // 4. Verify HMAC-SHA256 signature
        const hmac = crypto.createHmac("sha256", clientSecret);
        const expectedSignature = hmac.update(bodyText).digest("hex");

        if (signature !== expectedSignature) {
            console.warn("[Uber Webhook] Invalid signature", {
                received: signature.slice(0, 20) + "...",
                expected: expectedSignature.slice(0, 20) + "..."
            });
            return new NextResponse("Invalid Signature", { status: 401 });
        }

        console.log("[Uber Webhook] Signature verified");

        // 5. Parse event
        let event: any;
        try {
            event = JSON.parse(bodyText);
        } catch (e) {
            console.error("[Uber Webhook] Failed to parse body:", e);
            return new NextResponse("Invalid JSON", { status: 400 });
        }

        const eventType = event.event_type || event.type;
        const eventId = event.event_id || event.id;
        const eventTime = event.event_time || Date.now();

        console.log(`[Uber Webhook] Received ${eventType}`, {
            eventId,
            resourceType: event.resource_type,
            resourceId: event.resource_href?.split("/").pop()
        });

        // 6. Store event for audit trail
        const eventRecord = {
            id: `webhook_event:${eventId || Date.now()}`,
            wallet: "portalpay",
            type: "uber_webhook_event",
            eventType,
            eventId,
            eventTime,
            payload: event,
            processedAt: Date.now()
        };

        try {
            await container.items.create(eventRecord);
        } catch (e) {
            // Ignore duplicate key errors
            console.warn("[Uber Webhook] Could not store event:", e);
        }

        // 7. Process based on event type
        switch (eventType) {
            case "orders.notification":
                await processOrderNotification(container, event);
                break;

            case "orders.cancel":
                await processOrderCancel(container, event);
                break;

            case "store.status.changed":
                await processStoreStatusChange(container, event);
                break;

            default:
                console.log(`[Uber Webhook] Unhandled event type: ${eventType}`);
        }

        // 8. Acknowledge receipt immediately (200 OK per Uber docs)
        return new NextResponse(null, {
            status: 200,
            headers: { "Access-Control-Allow-Origin": "*" }
        });

    } catch (err: any) {
        console.error("[Uber Webhook] Error:", err);
        return new NextResponse(err.message, {
            status: 500,
            headers: { "Access-Control-Allow-Origin": "*" }
        });
    }
}

/**
 * Process new order notification
 */
async function processOrderNotification(container: any, event: any) {
    try {
        // Extract order ID from resource_href: /v1/eats/orders/{order_id}
        const orderId = event.resource_href?.split("/").pop() || event.meta?.resource_id;

        if (!orderId) {
            console.warn("[Uber Webhook] Order notification missing order ID");
            return;
        }

        console.log(`[Uber Webhook] Processing new order: ${orderId}`);

        // Fetch full order details from Uber Eats API
        const orderDetails = await getOrderDetails(orderId);

        if (!orderDetails) {
            console.error(`[Uber Webhook] Could not fetch order details for ${orderId}`);
            return;
        }

        // Store order in database
        const orderRecord = {
            id: `uber_order:${orderId}`,
            wallet: "portalpay",
            type: "uber_eats_order",
            orderId,
            storeId: orderDetails.store?.id || event.meta?.store_id,
            status: orderDetails.current_state || "CREATED",
            customerName: orderDetails.eater?.first_name || "Customer",
            items: orderDetails.cart?.items?.map((item: any) => ({
                id: item.id,
                title: item.title,
                quantity: item.quantity,
                price: item.price?.base_price,
            })) || [],
            total: orderDetails.payment?.charges?.total || 0,
            currency: orderDetails.payment?.charges?.currency || "USD",
            estimatedReadyTime: orderDetails.estimated_ready_for_pickup_at,
            placedAt: orderDetails.placed_at || Date.now(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            rawPayload: orderDetails
        };

        await container.items.upsert(orderRecord);
        console.log(`[Uber Webhook] Order ${orderId} stored successfully`);

    } catch (err) {
        console.error("[Uber Webhook] Error processing order notification:", err);
    }
}

/**
 * Process order cancellation
 */
async function processOrderCancel(container: any, event: any) {
    try {
        const orderId = event.resource_href?.split("/").pop() || event.meta?.resource_id;

        if (!orderId) {
            console.warn("[Uber Webhook] Cancel notification missing order ID");
            return;
        }

        console.log(`[Uber Webhook] Processing order cancellation: ${orderId}`);

        // Update order status
        const orderDocId = `uber_order:${orderId}`;

        try {
            const { resource: existing } = await container.item(orderDocId, "portalpay").read();

            if (existing) {
                existing.status = "CANCELLED";
                existing.cancelledAt = Date.now();
                existing.cancellationReason = event.meta?.reason || "Unknown";
                existing.updatedAt = Date.now();

                await container.items.upsert(existing);
                console.log(`[Uber Webhook] Order ${orderId} marked as cancelled`);
            }
        } catch (e) {
            console.warn(`[Uber Webhook] Order ${orderId} not found in database`);
        }

    } catch (err) {
        console.error("[Uber Webhook] Error processing cancellation:", err);
    }
}

/**
 * Process store status change
 */
async function processStoreStatusChange(container: any, event: any) {
    try {
        const storeId = event.resource_href?.split("/").pop() || event.meta?.store_id;
        const newStatus = event.meta?.new_status || event.status;

        console.log(`[Uber Webhook] Store ${storeId} status changed to: ${newStatus}`);

        // Store status update
        const statusRecord = {
            id: `store_status:${storeId}:${Date.now()}`,
            wallet: "portalpay",
            type: "uber_store_status",
            storeId,
            newStatus,
            oldStatus: event.meta?.old_status,
            changedAt: Date.now()
        };

        await container.items.create(statusRecord);

    } catch (err) {
        console.error("[Uber Webhook] Error processing store status change:", err);
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Uber-Signature",
        },
    });
}
