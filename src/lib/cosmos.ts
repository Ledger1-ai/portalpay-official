import { CosmosClient, Database, Container } from "@azure/cosmos";
import https from "https";

const defaultDbId =
  process.env.COSMOS_PAYPORTAL_DB_ID ||
  process.env.COSMOS_DB_ID ||
  "payportal";
const defaultContainerId =
  process.env.COSMOS_PAYPORTAL_CONTAINER_ID ||
  process.env.COSMOS_CONTAINER_ID ||
  "payportal_events";

type Cached = {
  client?: CosmosClient;
  db?: Database;
  container?: Container;
  containerId?: string;
  dbId?: string;
};

const cache: Cached = {};

export async function getContainer(dbId = defaultDbId, containerId = defaultContainerId): Promise<Container> {
  if (cache.container && cache.dbId === dbId && cache.containerId === containerId) return cache.container;

  // Accept multiple env var names to reduce deployment misconfig risk
  const conn = process.env.COSMOS_CONNECTION_STRING
    || process.env.AZURE_COSMOS_CONNECTION_STRING
    || process.env.AZURE_COSMOSDB_CONNECTION_STRING
    || process.env.COSMOSDB_CONNECTION_STRING
    || "";
  // Enforce live Cosmos DB; do not use in-memory mock
  if (!conn) {
    throw new Error("COSMOS_CONNECTION_STRING (or alias) not set. Live Cosmos DB is required for all environments.");
  }
  // Guard: this app uses Cosmos DB for NoSQL (Core/SQL) SDK, not MongoDB API
  if (/mongodb:\/\//i.test(conn) || /ApiKind=MongoDB/i.test(conn)) {
    throw new Error("COSMOS_CONNECTION_STRING is for MongoDB API. Use a Cosmos DB for NoSQL (Core) connection string.");
  }

  const client = cache.client || new CosmosClient({
    endpoint: conn.match(/AccountEndpoint=([^;]+)/)?.[1] || "",
    key: conn.match(/AccountKey=([^;]+)/)?.[1] || "",
    agent: new https.Agent({ rejectUnauthorized: false })
  });
  cache.client = client;

  const { database } = await client.databases.createIfNotExists({ id: dbId });
  cache.db = database;

  // OPTIMIZATION: Use optimistic container reference to avoid network RTT on every cold start
  // We assume the container exists in production. "createIfNotExists" adds significant latency.
  const container = database.container(containerId);
  // Only verify existence if explicitly needed (e.g. during specialized init routines), 
  // but for high-traffic runtime, assume it's there.

  cache.container = container;
  cache.dbId = dbId;
  cache.containerId = containerId;
  return container;
}

// ---------------- In-memory mock container (dev only) ----------------
type Doc = Record<string, any> & { id: string };
const memDbs: Record<string, Record<string, Doc[]>> = {};

function getInMemoryContainer(dbId: string, containerId: string) {
  if (!memDbs[dbId]) memDbs[dbId] = {};
  if (!memDbs[dbId][containerId]) memDbs[dbId][containerId] = [];
  const store = memDbs[dbId][containerId];

  function findById(id: string): Doc | undefined {
    return store.find((d) => d.id === id);
  }

  function applyQuery(query: string, parameters: { name: string; value: any }[] | undefined): Doc[] | number {
    // Normalize params to include leading '@' for easy lookup
    const p = Object.fromEntries((parameters || []).map((x) => {
      const key = x.name.startsWith("@") ? x.name : ("@" + x.name);
      return [key, x.value];
    }));

    let rows = [...store];

    // Handle IS_DEFINED(c.wallet)
    if (/IS_DEFINED\s*\(\s*c\.wallet\s*\)/i.test(query)) {
      rows = rows.filter((d) => typeof d.wallet !== "undefined" && d.wallet !== null && d.wallet !== "");
    }

    // Handle WHERE c.wallet = @param (supports any param name like @w, @wallet)
    const walletParamMatch = /WHERE\s+c\.wallet\s*=\s*@([A-Za-z_]\w*)/i.exec(query);
    if (walletParamMatch) {
      const pname = "@" + walletParamMatch[1];
      const val = p[pname] ?? p["@wallet"] ?? p["@w"];
      if (typeof val !== "undefined") {
        rows = rows.filter((d) => d.wallet === val);
      }
    } else {
      // Fallback for simple wallet param patterns
      const val = p["@wallet"] ?? p["@w"];
      if (typeof val !== "undefined" && /c\.wallet\s*=\s*@(?:wallet|w)/i.test(query)) {
        rows = rows.filter((d) => d.wallet === val);
      }
    }

    // Optional other filters used in app (category/status)
    if (/c\.category\s*=\s*@category/i.test(query)) {
      rows = rows.filter((d) => d.category === p["@category"]);
    }
    if (/c\.status\s*=\s*@status/i.test(query)) {
      rows = rows.filter((d) => d.status === p["@status"]);
    }

    // Type filters: purchase / usage or both
    const hasPurchase = /c\.type\s*=\s*'purchase'/i.test(query);
    const hasUsage = /c\.type\s*=\s*'usage'/i.test(query);
    if (hasPurchase && !hasUsage) {
      rows = rows.filter((d) => d.type === "purchase");
    } else if (!hasPurchase && hasUsage) {
      rows = rows.filter((d) => d.type === "usage");
    } else if (hasPurchase && hasUsage) {
      rows = rows.filter((d) => d.type === "purchase" || d.type === "usage");
    }

    // ORDER BY createdAt DESC
    if (/ORDER BY\s+c\.createdAt\s+DESC/i.test(query)) {
      rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    // Aggregations
    if (/SELECT\s+VALUE\s+COUNT\(\s*1\s*\)/i.test(query)) {
      return rows.length;
    }
    if (/SELECT\s+VALUE\s+SUM\(\s*c\.seconds\s*\)/i.test(query)) {
      let sum = 0;
      for (const d of rows) sum += Number(d.seconds || 0);
      return sum;
    }

    // Default: return filtered rows (supports SELECT c.wallet, c.type, c.seconds ... etc.)
    return rows;
  }

  return {
    items: {
      create: async (doc: Doc) => {
        store.push(doc);
        return { resource: doc };
      },
      upsert: async (doc: Doc) => {
        const idx = store.findIndex((d) => d.id === doc.id);
        if (idx >= 0) store[idx] = doc; else store.push(doc);
        return { resource: doc };
      },
      query: (spec: { query: string; parameters?: { name: string; value: any }[] }) => ({
        fetchAll: async () => {
          const result = applyQuery(spec.query, spec.parameters);
          if (typeof result === "number") return { resources: [result] };
          return { resources: result };
        },
      }),
    },
    item: (id: string, _pk: string) => ({
      read: async () => ({ resource: findById(id) }),
      replace: async (doc: Doc) => {
        const idx = store.findIndex((d) => d.id === id);
        if (idx >= 0) store[idx] = doc; else store.push(doc);
        return { resource: doc };
      },
    }),
  };
}

export type BillingEvent = {
  id: string;
  type: "purchase" | "usage";
  wallet: string; // partition key
  seconds: number; // positive for both purchase (credit) and usage (debit)
  usd?: number;
  eth?: number;
  txHash?: string;
  sessionId?: string;
  // Bound merchant recipient for the transaction (from QR/link; env is NOT used as fallback anymore)
  recipient?: string;
  // Associated receipt id (e.g., from /portal/[id])
  receiptId?: string;
  // Portal fee applied to each transaction
  portalFeeUsd?: number;
  portalFeePct?: number; // e.g., 0.5 for 0.5%
  portalFeeRecipient?: string; // NEXT_PUBLIC_RECIPIENT_ADDRESS
  ts: number; // epoch ms
};
