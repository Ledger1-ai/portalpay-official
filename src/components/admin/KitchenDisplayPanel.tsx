"use client";

import React, { useState, useEffect, useRef } from "react";
import { useActiveAccount } from "thirdweb/react";

type KitchenOrder = {
  receiptId: string;
  uberOrderId?: string; // For Uber Eats orders
  totalUsd: number;
  currency: string;
  createdAt: number;
  status: string;
  kitchenStatus: "new" | "preparing" | "ready" | "completed";
  lineItems: Array<{
    label: string;
    priceUsd: number;
    qty?: number;
    attributes?: Record<string, any>;
  }>;
  brandName?: string;
  kitchenMetadata?: {
    enteredKitchenAt: number;
    startedPreparingAt?: number;
    markedReadyAt?: number;
  };
  orderType?: string;
  tableNumber?: string;
  customerName?: string;
  specialInstructions?: string;
  source?: "pos" | "ubereats"; // Order source
  estimatedPickup?: number;
  uberMetadata?: {
    storeId?: string;
    estimatedDelivery?: number;
    driverId?: string;
  };
};

function formatElapsedTime(startTimestamp: number): string {
  const elapsed = Date.now() - startTimestamp;
  const minutes = Math.floor(elapsed / 60000);

  if (minutes < 1) return "< 1 min";
  if (minutes === 1) return "1 min";
  return `${minutes} min`;
}

function KitchenTicket({ order, onStatusChange }: { order: KitchenOrder; onStatusChange: (receiptId: string, newStatus: string, uberOrderId?: string) => void }) {
  const [updating, setUpdating] = useState(false);
  const enteredAt = order.kitchenMetadata?.enteredKitchenAt || order.createdAt;
  const elapsed = formatElapsedTime(enteredAt);

  // Determine urgency based on time
  const minutes = Math.floor((Date.now() - enteredAt) / 60000);
  const isUrgent = minutes > 20;
  const isDelayed = minutes > 30;

  const statusColors: Record<string, string> = {
    new: "bg-orange-100 border-orange-300 text-orange-900",
    preparing: "bg-yellow-100 border-yellow-300 text-yellow-900",
    ready: "bg-green-100 border-green-300 text-green-900",
    completed: "bg-gray-100 border-gray-300 text-gray-900",
  };

  const statusColor = statusColors[order.kitchenStatus] || statusColors.new;

  async function updateStatus(newStatus: string) {
    setUpdating(true);
    try {
      await onStatusChange(order.receiptId, newStatus, order.uberOrderId);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className={`rounded-lg border-2 p-3 ${statusColor} ${isDelayed ? "ring-2 ring-red-500" : isUrgent ? "ring-1 ring-orange-400" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-current/20">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-lg">#{order.receiptId}</span>
            {order.source === "ubereats" && (
              <span className="px-1.5 py-0.5 text-xs font-bold bg-green-600 text-white rounded flex items-center gap-1">
                🚗 Uber
              </span>
            )}
          </div>
          {order.tableNumber && (
            <div className="text-sm font-medium">Table {order.tableNumber}</div>
          )}
          {order.customerName && (
            <div className="text-sm">{order.customerName}</div>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs opacity-75">{new Date(order.createdAt).toLocaleTimeString()}</div>
          <div className={`text-sm font-bold ${isDelayed ? "text-red-700" : isUrgent ? "text-orange-700" : ""}`}>
            {elapsed}
          </div>
          {order.orderType && order.orderType !== "dine-in" && (
            <div className="text-xs font-medium uppercase mt-1">{order.orderType}</div>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="space-y-2 my-3">
        {order.lineItems.map((item, idx) => {
          const modifiers = item.attributes?.modifierGroups || [];
          const hasModifiers = Array.isArray(modifiers) && modifiers.length > 0;

          return (
            <div key={idx} className="text-sm">
              <div className="font-semibold">
                {item.qty && item.qty > 1 ? `${item.qty}x ` : ""}
                {item.label}
              </div>
              {hasModifiers && (
                <div className="ml-3 text-xs opacity-75 space-y-0.5">
                  {modifiers.map((group: any, gidx: number) => {
                    const selectedMods = Array.isArray(group.modifiers)
                      ? group.modifiers.filter((m: any) => m.selected || m.default)
                      : [];

                    return selectedMods.map((mod: any, midx: number) => (
                      <div key={`${gidx}-${midx}`}>
                        {mod.priceAdjustment > 0 ? "+ " : ""}
                        {mod.name}
                        {mod.priceAdjustment !== 0 && ` ($${Math.abs(mod.priceAdjustment).toFixed(2)})`}
                      </div>
                    ));
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Special Instructions */}
      {order.specialInstructions && (
        <div className="my-2 p-2 rounded bg-white/50 border border-current/20">
          <div className="text-xs font-semibold mb-1">🔔 Special Instructions:</div>
          <div className="text-sm">{order.specialInstructions}</div>
        </div>
      )}

      {/* Status Buttons */}
      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-current/20">
        {order.kitchenStatus === "new" && (
          <>
            <button
              className="flex-1 px-3 py-2 rounded-md bg-yellow-600 hover:bg-yellow-700 text-white font-medium text-sm disabled:opacity-50"
              onClick={() => updateStatus("preparing")}
              disabled={updating}
            >
              {updating ? "..." : "Start Prep"}
            </button>
            <button
              className="flex-1 px-3 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white font-medium text-sm disabled:opacity-50"
              onClick={() => updateStatus("ready")}
              disabled={updating}
            >
              {updating ? "..." : "Mark Ready"}
            </button>
          </>
        )}
        {order.kitchenStatus === "preparing" && (
          <button
            className="flex-1 px-3 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white font-medium text-sm disabled:opacity-50"
            onClick={() => updateStatus("ready")}
            disabled={updating}
          >
            {updating ? "..." : "Mark Ready"}
          </button>
        )}
        {order.kitchenStatus === "ready" && (
          <button
            className="flex-1 px-3 py-2 rounded-md bg-gray-600 hover:bg-gray-700 text-white font-medium text-sm disabled:opacity-50"
            onClick={() => updateStatus("completed")}
            disabled={updating}
          >
            {updating ? "..." : "Complete"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function KitchenDisplayPanel() {
  const account = useActiveAccount();
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pollIntervalRef = useRef<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());

  // Audio notification for new orders
  const playNotification = () => {
    try {
      const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZQQ0PVqzn77JfGAg+ltrzxnMpBSp+zPLaizsIGGS57OihUhELTKXh8bllHAU2jtX0zn8uBSh1xPDek0ELElyx5/CrWBgIOZrb88l3LQUme8rx2o08CBlpvO7mnkwPCFWr5O+0YxoGPJfY88yAMgYeb8Tv45xEDQ9XrujwsmEaCT6W2vTIdjAFKn/M8dqLPQgZZbzs6aJRDwpLpODyuWQdBTSL0/XPgTEFKXXE8N+UQgwQV6/n8LFdGgg7mtv1y3oxBSl+zPPaizsIG2m97OmiUQ8KTKXh8bllHAU2j9X0z4ExBil1xe/flkEMElez5/GsWhgJO5na88h1MAUoesy+fkLPg==");
      audio.volume = 0.3;
      audio.play().catch(() => { });
    } catch { }
  };

  async function fetchOrders() {
    if (!account?.address) return;

    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/kitchen/orders?status=new,preparing,ready", {
        headers: { "x-wallet": account.address },
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to fetch orders");
        return;
      }

      const newOrders = data.orders || [];

      // Check for new orders (play sound)
      if (orders.length > 0) {
        const existingIds = new Set(orders.map(o => o.receiptId));
        const hasNewOrders = newOrders.some((o: KitchenOrder) => !existingIds.has(o.receiptId));

        if (hasNewOrders) {
          playNotification();
        }
      }

      setOrders(newOrders);
      setLastUpdate(Date.now());
    } catch (e: any) {
      setError(e?.message || "Failed to fetch orders");
    } finally {
      setLoading(false);
    }
  }

  async function updateOrderStatus(receiptId: string, newStatus: string, uberOrderId?: string) {
    if (!account?.address) return;

    try {
      const response = await fetch("/api/kitchen/orders", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-wallet": account.address,
        },
        body: JSON.stringify({
          receiptId,
          kitchenStatus: newStatus,
          uberOrderId // Include for Uber orders
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update status");
      }

      // Refresh orders immediately
      await fetchOrders();
    } catch (e: any) {
      console.error("Failed to update order status:", e);
    }
  }

  // Initial fetch
  useEffect(() => {
    fetchOrders();
  }, [account?.address]);

  // Auto-refresh polling
  useEffect(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = window.setInterval(() => {
      fetchOrders();
    }, 5000); // Poll every 5 seconds

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [account?.address, orders]);

  if (!account?.address) {
    return (
      <div className="glass-pane rounded-xl border p-6">
        <div className="text-center text-muted-foreground">
          Connect your wallet to access the kitchen display
        </div>
      </div>
    );
  }

  const newOrders = orders.filter(o => o.kitchenStatus === "new");
  const preparingOrders = orders.filter(o => o.kitchenStatus === "preparing");
  const readyOrders = orders.filter(o => o.kitchenStatus === "ready");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass-pane rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Kitchen Display</h2>
            <div className="microtext text-muted-foreground">
              Auto-refreshing every 5 seconds • Last update: {new Date(lastUpdate).toLocaleTimeString()}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{newOrders.length}</div>
              <div className="text-xs text-muted-foreground">New</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{preparingOrders.length}</div>
              <div className="text-xs text-muted-foreground">Preparing</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{readyOrders.length}</div>
              <div className="text-xs text-muted-foreground">Ready</div>
            </div>
          </div>
          <button
            onClick={fetchOrders}
            disabled={loading}
            className="px-3 py-1.5 rounded-md border text-sm"
          >
            {loading ? "Refreshing..." : "Refresh Now"}
          </button>
        </div>
        {error && <div className="mt-2 text-sm text-red-500">{error}</div>}
      </div>

      {/* Orders Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* New Orders Column */}
        <div>
          <div className="mb-2 px-2">
            <h3 className="font-semibold text-lg text-orange-600">New Orders</h3>
            <div className="text-xs text-muted-foreground">{newOrders.length} orders</div>
          </div>
          <div className="space-y-3">
            {newOrders.map(order => (
              <KitchenTicket key={order.receiptId} order={order} onStatusChange={updateOrderStatus} />
            ))}
            {newOrders.length === 0 && (
              <div className="rounded-lg border-2 border-dashed border-gray-300 p-6 text-center text-muted-foreground">
                No new orders
              </div>
            )}
          </div>
        </div>

        {/* Preparing Orders Column */}
        <div>
          <div className="mb-2 px-2">
            <h3 className="font-semibold text-lg text-yellow-600">Preparing</h3>
            <div className="text-xs text-muted-foreground">{preparingOrders.length} orders</div>
          </div>
          <div className="space-y-3">
            {preparingOrders.map(order => (
              <KitchenTicket key={order.receiptId} order={order} onStatusChange={updateOrderStatus} />
            ))}
            {preparingOrders.length === 0 && (
              <div className="rounded-lg border-2 border-dashed border-gray-300 p-6 text-center text-muted-foreground">
                No orders in prep
              </div>
            )}
          </div>
        </div>

        {/* Ready Orders Column */}
        <div>
          <div className="mb-2 px-2">
            <h3 className="font-semibold text-lg text-green-600">Ready for Pickup</h3>
            <div className="text-xs text-muted-foreground">{readyOrders.length} orders</div>
          </div>
          <div className="space-y-3">
            {readyOrders.map(order => (
              <KitchenTicket key={order.receiptId} order={order} onStatusChange={updateOrderStatus} />
            ))}
            {readyOrders.length === 0 && (
              <div className="rounded-lg border-2 border-dashed border-gray-300 p-6 text-center text-muted-foreground">
                No orders ready
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
