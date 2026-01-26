import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getContainer } from "@/lib/cosmos";
import { requireApimOrJwt } from "@/lib/gateway-auth";
import { requireCsrf, rateLimitOrThrow, rateKey } from "@/lib/security";
import { parseJsonBody } from "@/lib/validation";
import { auditEvent } from "@/lib/audit";
import { getBrandConfig, getEffectiveProcessingFeeBps } from "@/config/brands";
import { assertOwnershipOrAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MerchantSettingsDoc = {
  id: string; // "merchant:settings"
  wallet: string; // partition key = merchant wallet (lowercased)
  type: "merchant_settings";
  merchantFeeBps?: number; // 0..10000
  updatedAt?: number;
};

function isHexAddress(s: any): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(String(s || "").trim());
}

function headerJson(obj: any, init?: { status?: number; headers?: Record<string, string> }) {
  try {
    const json = JSON.stringify(obj);
    const len = new TextEncoder().encode(json).length;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    };
    headers["Content-Length"] = String(len);
    return new NextResponse(json, { status: init?.status ?? 200, headers });
  } catch {
    return NextResponse.json(obj, init as any);
  }
}

async function readMerchantSettings(wallet: string): Promise<MerchantSettingsDoc | null> {
  try {
    const c = await getContainer();
    const { resource } = await c.item("merchant:settings", wallet).read<MerchantSettingsDoc>();
    return resource || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const correlationId = crypto.randomUUID();
  const idRaw = String(params?.id || "");
  const wallet = idRaw.toLowerCase();
  if (!isHexAddress(wallet)) {
    return NextResponse.json(
      { error: "invalid_wallet", correlationId },
      { status: 400, headers: { "x-correlation-id": correlationId } }
    );
  }

  // Auth: allow JWT admin or owner; allow APIM only when subscription wallet matches the target wallet
  try {
    const caller = await requireApimOrJwt(req, [], { enforceScopes: false });
    if (caller.source === "jwt") {
      // If JWT, treat as admin context: allow owner or admin
      try {
        assertOwnershipOrAdmin(caller.wallet, wallet, (caller.roles || []).includes("admin"));
      } catch {
        return NextResponse.json(
          { error: "forbidden", correlationId },
          { status: 403, headers: { "x-correlation-id": correlationId } }
        );
      }
    } else {
      // APIM: subscription-bound wallet must match target wallet
      if (caller.wallet !== wallet) {
        return NextResponse.json(
          { error: "forbidden", correlationId },
          { status: 403, headers: { "x-correlation-id": correlationId } }
        );
      }
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "unauthorized", correlationId },
      { status: e?.status || 401, headers: { "x-correlation-id": correlationId } }
    );
  }

  try {
    const doc = await readMerchantSettings(wallet);
    const merchantFeeBps = typeof doc?.merchantFeeBps === "number" ? doc!.merchantFeeBps! : undefined;
    const brand = getBrandConfig();
    const effectiveProcessingFeeBps = getEffectiveProcessingFeeBps(brand, merchantFeeBps);

    return headerJson({
      wallet,
      merchantFeeBps,
      effectiveProcessingFeeBps,
      updatedAt: doc?.updatedAt,
    });
  } catch (e: any) {
    // Degraded: still return effective fee using just brand config
    const brand = getBrandConfig();
    const effectiveProcessingFeeBps = getEffectiveProcessingFeeBps(brand, undefined);
    return headerJson({
      wallet,
      merchantFeeBps: undefined,
      effectiveProcessingFeeBps,
      degraded: true,
      reason: e?.message || "cosmos_unavailable",
    });
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const correlationId = crypto.randomUUID();
  const idRaw = String(params?.id || "");
  const wallet = idRaw.toLowerCase();
  if (!isHexAddress(wallet)) {
    return NextResponse.json(
      { error: "invalid_wallet", correlationId },
      { status: 400, headers: { "x-correlation-id": correlationId } }
    );
  }

  // Auth: allow JWT owner/admin; allow APIM only when subscription wallet matches target wallet
  let caller: { source: "jwt" | "apim"; wallet: string; roles?: string[] };
  try {
    caller = await requireApimOrJwt(req, [], { enforceScopes: false }) as any;
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "unauthorized", correlationId },
      { status: e?.status || 401, headers: { "x-correlation-id": correlationId } }
    );
  }
  if (caller.source === "jwt") {
    try {
      assertOwnershipOrAdmin(caller.wallet, wallet, (caller.roles || []).includes("admin"));
    } catch {
      return NextResponse.json(
        { error: "forbidden", correlationId },
        { status: 403, headers: { "x-correlation-id": correlationId } }
      );
    }
    // CSRF for JWT writes
    try {
      requireCsrf(req);
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "bad_origin", correlationId },
        { status: e?.status || 403, headers: { "x-correlation-id": correlationId } }
      );
    }
  } else {
    if (caller.wallet !== wallet) {
      return NextResponse.json(
        { error: "forbidden", correlationId },
        { status: 403, headers: { "x-correlation-id": correlationId } }
      );
    }
  }

  // Rate limit writes
  try {
    rateLimitOrThrow(req, rateKey(req, "merchant_fee_write", wallet), 15, 60_000);
  } catch (e: any) {
    const resetAt = typeof e?.resetAt === "number" ? e.resetAt : undefined;
    return NextResponse.json(
      { error: e?.message || "rate_limited", resetAt, correlationId },
      { status: e?.status || 429, headers: { "x-correlation-id": correlationId, "x-ratelimit-reset": resetAt ? String(resetAt) : "" } }
    );
  }

  // Parse body
  let body: any;
  try {
    body = await parseJsonBody(req);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "invalid_body", correlationId },
      { status: 400, headers: { "x-correlation-id": correlationId } }
    );
  }
  const n = Number(body?.merchantFeeBps);
  if (!Number.isFinite(n) || n < 0 || n > 10000) {
    return NextResponse.json(
      { error: "merchantFeeBps_invalid", correlationId },
      { status: 400, headers: { "x-correlation-id": correlationId } }
    );
  }
  const merchantFeeBps = Math.floor(n);

  // Upsert doc
  const doc: MerchantSettingsDoc = {
    id: "merchant:settings",
    wallet,
    type: "merchant_settings",
    merchantFeeBps,
    updatedAt: Date.now(),
  };

  try {
    const c = await getContainer();
    await c.items.upsert(doc);

    try {
      await auditEvent(req, {
        who: caller.wallet,
        roles: (caller as any).roles,
        what: "merchant_fee_update",
        target: wallet,
        correlationId,
        ok: true,
        metadata: { merchantFeeBps },
      });
    } catch { }

    const brand = getBrandConfig();
    const effectiveProcessingFeeBps = getEffectiveProcessingFeeBps(brand, merchantFeeBps);

    return NextResponse.json(
      { ok: true, wallet, merchantFeeBps, effectiveProcessingFeeBps, correlationId },
      { headers: { "x-correlation-id": correlationId } }
    );
  } catch (e: any) {
    // Degraded: return success with note, allowing UI to proceed with local state (will not persist)
    try {
      await auditEvent(req, {
        who: caller.wallet,
        roles: (caller as any).roles,
        what: "merchant_fee_update",
        target: wallet,
        correlationId,
        ok: true,
        metadata: { degraded: true, reason: e?.message || "cosmos_unavailable", merchantFeeBps },
      });
    } catch { }
    const brand = getBrandConfig();
    const effectiveProcessingFeeBps = getEffectiveProcessingFeeBps(brand, merchantFeeBps);
    return NextResponse.json(
      { ok: true, degraded: true, reason: e?.message || "cosmos_unavailable", wallet, merchantFeeBps, effectiveProcessingFeeBps, correlationId },
      { headers: { "x-correlation-id": correlationId } }
    );
  }
}
