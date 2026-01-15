import { NextRequest, NextResponse } from "next/server";
export const dynamic = 'force-dynamic';

/**
 * Server-side execution for voice agent tools.
 * - Accepts POST { toolName, args }
 * - Uses x-wallet (and optionally x-slug) from headers to scope shop context
 * - Calls internal REST endpoints and applies filtering/pagination for inventory tools
 * - Returns { result: { ok: boolean; data?: any; error?: string } }
 */
export async function POST(req: NextRequest) {
  try {
    const { toolName, args } = await req.json().catch(() => ({}) as any);
    const name = String(toolName || "").trim();
    if (!name) {
      return NextResponse.json({ error: "missing_tool_name" }, { status: 400 });
    }

    // Derive shop context from headers or args
    const wallet = String(req.headers.get("x-wallet") || (args?.wallet ?? "") || "").toLowerCase();
    const slug = String(req.headers.get("x-slug") || (args?.slug ?? "") || "").toLowerCase();

    // Prefer internal base URL to avoid external egress (e.g., AFD/CDN); fallback to request origin or app URL
    // Use localhost IP to avoid DNS issues in some environments
    const base = process.env.INTERNAL_BASE_URL || (() => {
      try {
        const u = new URL(req.url);
        return u.origin;
      } catch {
        return process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";
      }
    })();

    // Preserve session cookies/authorization if present
    const forwardHeaders = (extra?: Record<string, string>) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(extra || {}),
      };
      const auth = req.headers.get("authorization");
      const cookie = req.headers.get("cookie");
      if (auth) headers["Authorization"] = auth;
      if (cookie) headers["Cookie"] = cookie;
      if (wallet && !headers["x-wallet"]) headers["x-wallet"] = wallet;
      if (slug && !headers["x-slug"]) headers["x-slug"] = slug;
      return headers;
    };

    // Helper to safely fetch JSON (include target URL for diagnostics)
    const safeJsonFetch = async (input: string, init?: RequestInit): Promise<{ ok: boolean; json: any; status: number; target: string }> => {
      try {
        const res = await fetch(input, init);
        const json = await res.json().catch(() => ({}));
        return { ok: res.ok, json, status: res.status, target: input };
      } catch (e: any) {
        return { ok: false, json: { error: e?.message || "network_error" }, status: 0, target: input };
      }
    };

    // Helper to extract modifiers/variants from an item
    const extractItemOptions = (item: any) => {
      // Debug: log the raw item structure
      console.log("[extractItemOptions] raw item:", JSON.stringify({
        id: item?.id,
        name: item?.name,
        attributes: item?.attributes,
        modifierGroups: item?.modifierGroups,
        description: item?.description,
      }, null, 2));

      // Extract modifier info from attributes (the correct field name per types/inventory.ts)
      // Modifiers can be stored in multiple places:
      // 1. item.attributes.data.modifierGroups (when type is "restaurant" or "general")
      // 2. item.attributes.modifierGroups (legacy/direct)
      // 3. item.modifierGroups (legacy top-level)
      const attrs = item?.attributes || {};
      let industryType = String(attrs?.type || "general");
      const data = attrs?.data || {};

      // Try to find modifierGroups in all possible locations
      let modifierGroups: any[] | null = null;
      let modifierSource = "none";
      if (Array.isArray(data?.modifierGroups) && data.modifierGroups.length > 0) {
        modifierGroups = data.modifierGroups;
        modifierSource = "attributes.data.modifierGroups";
      } else if (Array.isArray(attrs?.modifierGroups) && attrs.modifierGroups.length > 0) {
        modifierGroups = attrs.modifierGroups;
        modifierSource = "attributes.modifierGroups";
      } else if (Array.isArray(item?.modifierGroups) && item.modifierGroups.length > 0) {
        modifierGroups = item.modifierGroups;
        modifierSource = "item.modifierGroups";
      }

      // Also check for dietaryTags to detect restaurant items
      const dietaryTags: any[] = Array.isArray(data?.dietaryTags) ? data.dietaryTags
        : Array.isArray(attrs?.dietaryTags) ? attrs.dietaryTags
          : Array.isArray(item?.dietaryTags) ? item.dietaryTags
            : [];

      // If we found modifierGroups or dietaryTags, treat as restaurant type
      if ((modifierGroups && modifierGroups.length > 0) || dietaryTags.length > 0) {
        industryType = "restaurant";
      }

      // Parse modifiers from description if none found in structured data
      // Format: "Optional: Bacon +$0.50, Extra Croutons +$1.00" or similar
      if (!modifierGroups || modifierGroups.length === 0) {
        const desc = String(item?.description || "");
        const optionalMatch = desc.match(/(?:Optional|Add-ons?|Extras?|Modifiers?):\s*(.+)/i);
        if (optionalMatch) {
          const optionsText = optionalMatch[1];
          // Parse comma-separated options like "Bacon +$0.50, Extra Croutons +$1.00"
          const optionMatches = optionsText.matchAll(/([^,]+?)\s*\+?\$?([\d.]+)?/g);
          const parsedModifiers: any[] = [];
          let idx = 0;
          for (const match of optionMatches) {
            const optName = String(match[1] || "").trim();
            const optPrice = match[2] ? parseFloat(match[2]) : 0;
            if (optName) {
              parsedModifiers.push({
                id: `desc-mod-${idx}`,
                name: optName,
                priceAdjustment: optPrice,
                default: false,
                available: true,
              });
              idx++;
            }
          }
          if (parsedModifiers.length > 0) {
            modifierGroups = [{
              id: "description-modifiers",
              name: "Optional Add-ons",
              required: false,
              minSelect: 0,
              maxSelect: parsedModifiers.length,
              selectionType: "multiple",
              modifiers: parsedModifiers,
            }];
            modifierSource = "parsed_from_description";
            industryType = "restaurant";
          }
        }
      }

      console.log("[extractItemOptions] parsed:", { modifierSource, modifierGroupsCount: modifierGroups?.length, industryType });

      let modifiers: any = null;
      let variants: any = null;

      if (modifierGroups && modifierGroups.length > 0) {
        // Restaurant modifiers: { modifierGroups: RestaurantModifierGroup[] }
        modifiers = modifierGroups.map((g: any) => ({
          groupId: String(g?.id || ""),
          groupName: String(g?.name || ""),
          required: Boolean(g?.required),
          minSelect: Number(g?.minSelect || 0),
          maxSelect: Number(g?.maxSelect || 99),
          selectionType: String(g?.selectionType || "multiple"),
          options: Array.isArray(g?.modifiers)
            ? g.modifiers.map((m: any) => ({
              modifierId: String(m?.id || ""),
              name: String(m?.name || ""),
              priceAdjustment: Number(m?.priceAdjustment || 0),
              default: Boolean(m?.default),
              available: m?.available !== false,
            }))
            : [],
        }));
      } else if (industryType === "retail") {
        // Retail variants: { variationGroups: RetailVariationGroup[], variants: RetailProductVariant[] }
        const variationGroups = Array.isArray(data?.variationGroups) ? data.variationGroups : [];
        const productVariants = Array.isArray(data?.variants) ? data.variants : [];

        variants = {
          variationGroups: variationGroups.map((vg: any) => ({
            groupId: String(vg?.id || ""),
            groupName: String(vg?.name || ""),
            options: Array.isArray(vg?.options)
              ? vg.options.map((o: any) => ({
                optionId: String(o?.id || ""),
                value: String(o?.value || ""),
              }))
              : [],
          })),
          variants: productVariants.map((v: any) => ({
            variantId: String(v?.id || ""),
            sku: String(v?.sku || ""),
            name: String(v?.name || ""),
            priceUsd: Number(v?.priceUsd || item?.priceUsd || 0),
            stockQty: Number(v?.stockQty ?? item?.stockQty ?? -1),
            options: v?.options || {},
          })),
        };
      }

      return { industryType, modifiers, variants };
    };

    // Case: getShopDetails
    if (name === "getShopDetails") {
      const { ok, json, status, target } = await safeJsonFetch(`${base}/api/shop/config`, { method: "GET", headers: forwardHeaders() });
      if (!ok) return NextResponse.json({ result: { ok: false, error: json?.error || `shop_config_failed_${status}`, target } });
      const cfg = json?.config || {};
      return NextResponse.json({
        result: {
          ok: true,
          data: {
            name: String(cfg?.name || ""),
            description: String(cfg?.description || ""),
            bio: String(cfg?.bio || ""),
            theme: {
              primaryColor: String(cfg?.theme?.primaryColor || ""),
              secondaryColor: String(cfg?.theme?.secondaryColor || ""),
              textColor: String(cfg?.theme?.textColor || ""),
              fontFamily: String(cfg?.theme?.fontFamily || ""),
              logoShape: cfg?.theme?.logoShape === "circle" ? "circle" : "square",
            },
            slug,
            wallet,
          },
        },
      });
    }

    // Case: getShopRating
    if (name === "getShopRating") {
      const useSlug = slug || String(args?.slug || "");
      if (!useSlug) return NextResponse.json({ result: { ok: false, error: "missing_slug" } });
      const { ok, json, status, target } = await safeJsonFetch(`${base}/api/reviews?subjectType=shop&subjectId=${encodeURIComponent(useSlug)}`, {
        method: "GET",
        headers: forwardHeaders(),
      });
      if (!ok) return NextResponse.json({ result: { ok: false, error: json?.error || `reviews_failed_${status}`, target } });
      const items: any[] = Array.isArray(json?.items) ? json.items : [];
      const count = items.length;
      const avg = count ? items.reduce((s, rv) => s + Number(rv?.rating || 0), 0) / count : 0;
      return NextResponse.json({ result: { ok: true, data: { average: +avg.toFixed(2), count } } });
    }

    // Case: getInventory / getInventoryPage
    if (name === "getInventory" || name === "getInventoryPage") {
      const { ok, json, status, target } = await safeJsonFetch(`${base}/api/inventory`, { method: "GET", headers: forwardHeaders() });
      if (!ok) return NextResponse.json({ result: { ok: false, error: json?.error || `inventory_failed_${status}`, target } });
      let items: any[] = Array.isArray(json?.items) ? json.items : [];

      // Filters
      const query = String(args?.query || "").toLowerCase().trim();
      const category = String(args?.category || "");
      const inStockOnly = Boolean(args?.inStockOnly || false);
      const priceMin = Number.isFinite(Number(args?.priceMin)) ? Number(args?.priceMin) : 0;
      const priceMax = Number.isFinite(Number(args?.priceMax)) ? Number(args?.priceMax) : Number.MAX_SAFE_INTEGER;
      const sort = String(args?.sort || "name-asc");
      const includeModifiers = args?.includeModifiers !== false; // default true

      if (query) {
        items = items.filter((it) =>
          String(it?.name || "").toLowerCase().includes(query) ||
          String(it?.sku || "").toLowerCase().includes(query) ||
          String(it?.description || "").toLowerCase().includes(query) ||
          (Array.isArray(it?.tags) ? it.tags : []).some((t: any) => String(t).toLowerCase().includes(query))
        );
      }
      if (category) {
        items = items.filter((it) => String(it?.category || "") === category);
      }
      items = items.filter((it) => {
        const price = Number(it?.priceUsd || 0);
        return price >= priceMin && price <= priceMax;
      });
      if (inStockOnly) {
        items = items.filter((it) => {
          const stock = Number(it?.stockQty);
          return stock === -1 || stock > 0;
        });
      }

      // Sort
      items.sort((a, b) => {
        switch (sort) {
          case "name-asc":
            return String(a?.name || "").localeCompare(String(b?.name || ""));
          case "name-desc":
            return String(b?.name || "").localeCompare(String(a?.name || ""));
          case "price-asc":
            return Number(a?.priceUsd || 0) - Number(b?.priceUsd || 0);
          case "price-desc":
            return Number(b?.priceUsd || 0) - Number(a?.priceUsd || 0);
          case "recent":
            return Number(b?.createdAt || 0) - Number(a?.createdAt || 0);
          default:
            return 0;
        }
      });

      const mapped = items.map((it) => {
        const baseItem = {
          id: String(it?.id || ""),
          sku: String(it?.sku || ""),
          name: String(it?.name || ""),
          priceUsd: Number(it?.priceUsd || 0),
          stockQty: Number(it?.stockQty || 0),
          category: typeof it?.category === "string" ? String(it?.category) : undefined,
          description: typeof it?.description === "string" ? String(it?.description) : undefined,
          tags: Array.isArray(it?.tags) ? it?.tags : [],
          images: Array.isArray(it?.images) ? it?.images : [],
        };

        if (includeModifiers) {
          const { modifiers, variants, industryType } = extractItemOptions(it);
          return { ...baseItem, industryType, modifiers, variants };
        }
        return baseItem;
      });

      if (name === "getInventory") {
        return NextResponse.json({ result: { ok: true, data: mapped } });
      }

      // Pagination for getInventoryPage
      const page = Math.max(1, Number(args?.page || 1));
      const pageSize = 30;
      const total = mapped.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const clampedPage = Math.min(page, totalPages);
      const start = (clampedPage - 1) * pageSize;
      const data = mapped.slice(start, start + pageSize);
      return NextResponse.json({
        result: {
          ok: true,
          data: {
            page: clampedPage,
            pageSize,
            total,
            totalPages,
            hasPrev: clampedPage > 1,
            hasNext: clampedPage < totalPages,
            items: data,
          },
        },
      });
    }

    // Case: getItemModifiers - fetch modifier/variant info for a specific item
    // Note: getInventory now returns this info if includeModifiers=true, but we keep this for granular lookups
    if (name === "getItemModifiers") {
      const { ok, json, status, target } = await safeJsonFetch(`${base}/api/inventory`, { method: "GET", headers: forwardHeaders() });
      if (!ok) return NextResponse.json({ result: { ok: false, error: json?.error || `inventory_failed_${status}`, target } });
      const items: any[] = Array.isArray(json?.items) ? json.items : [];

      // Find item by id, sku, or name
      const idArg = String(args?.id || "").trim();
      const skuArg = String(args?.sku || "").trim();
      const nameArg = String(args?.name || "").trim().toLowerCase();

      let item: any = null;
      if (idArg) {
        item = items.find((it) => String(it?.id || "") === idArg);
      }
      if (!item && skuArg) {
        item = items.find((it) => String(it?.sku || "").toLowerCase() === skuArg.toLowerCase());
      }
      if (!item && nameArg) {
        item = items.find((it) => String(it?.name || "").toLowerCase() === nameArg);
        // Partial match fallback
        if (!item) {
          item = items.find((it) => String(it?.name || "").toLowerCase().includes(nameArg));
        }
      }

      if (!item) {
        return NextResponse.json({ result: { ok: false, error: "item_not_found" } });
      }

      const { modifiers, variants, industryType } = extractItemOptions(item);

      return NextResponse.json({
        result: {
          ok: true,
          data: {
            itemId: String(item?.id || ""),
            itemName: String(item?.name || ""),
            basePrice: Number(item?.priceUsd || 0),
            industryType,
            hasModifiers: !!(modifiers && modifiers.length > 0),
            hasVariants: !!(variants && variants.variants && variants.variants.length > 0),
            modifiers,
            variants,
          },
        },
      });
    }

    // Case: Cart operations - these are client-side tools that modify React state
    // The server acknowledges them but they should be executed via the client-side dispatcher
    if (name === "addToCart" || name === "editCartItem" || name === "removeFromCart" ||
      name === "updateCartItem" || name === "updateCartItemQty" || name === "clearCart" || name === "getCartSummary") {
      // Return a special response indicating this is a client-side tool
      // The client's realtime voice agent should intercept this and execute via local dispatcher
      return NextResponse.json({
        result: {
          ok: true,
          clientSideTool: true,
          toolName: name,
          args: args || {},
          message: `Tool '${name}' requires client-side execution. Delegate to shopAgentDispatcher.`,
        },
      });
    }

    // Case: getOwnerAnalytics (owner-gated)
    if (name === "getOwnerAnalytics") {
      const qs = new URLSearchParams();
      if (wallet) qs.set("wallet", wallet);
      const metrics = String(args?.metrics || "");
      if (metrics) qs.set("metrics", metrics);
      const range = String(args?.range || "");
      if (range) qs.set("range", range);
      const since = Number(args?.sinceMs || 0);
      if (Number.isFinite(since) && since > 0) qs.set("sinceMs", String(since));

      const { ok, json, status, target } = await safeJsonFetch(`${base}/api/agent/owner-analytics?${qs.toString()}`, {
        method: "GET",
        headers: forwardHeaders(),
      });
      if (!ok) {
        return NextResponse.json({ result: { ok: false, error: json?.error || `owner_analytics_failed_${status}`, target } });
      }
      return NextResponse.json({ result: { ok: true, data: json?.stats || {} } });
    }

    // Unknown tool: return a structured error so client can surface gracefully
    return NextResponse.json({ result: { ok: false, error: `unknown_tool:${name}` } });
  } catch (error) {
    console.error("[api/agent/voice/call-tool] error:", error);
    const message = error instanceof Error ? error.message : "unknown_error";
    return NextResponse.json({ result: { ok: false, error: message } }, { status: 500 });
  }
}
