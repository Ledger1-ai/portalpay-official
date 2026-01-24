import { createThirdwebClient } from "thirdweb";
import { base, baseSepolia, optimism, arbitrum, polygon, sepolia } from "thirdweb/chains";

let _client: ReturnType<typeof createThirdwebClient> | null = null;

export function getClient() {
  if (!_client) {
    const secret = process.env.THIRDWEB_SECRET_KEY;
    const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID;
    _client = secret
      ? createThirdwebClient({ secretKey: secret as string })
      : createThirdwebClient({ clientId: String(clientId || "") });
  }
  return _client;
}

// Backward compatibility: export a lazy proxy so existing imports `client` continue to work
export const client = new Proxy({} as ReturnType<typeof createThirdwebClient>, {
  get(_target, prop) {
    return (getClient() as any)[prop as any];
  }
});

const DEFAULT_CHAIN = base;

function resolveChain() {
  const envId = process.env.NEXT_PUBLIC_CHAIN_ID || process.env.CHAIN_ID;
  const id = envId ? Number(envId) : undefined;
  switch (id) {
    case 8453:
      return base;
    case 84532:
      return baseSepolia;
    case 10:
      return optimism;
    case 42161:
      return arbitrum;
    case 137:
      return polygon;
    case 11155111:
      return sepolia;
    default:
      return DEFAULT_CHAIN;
  }
}

export const chain = resolveChain();

// Client-only wallets accessor that avoids importing wallet definitions on the server
export async function getWallets() {
  if (typeof window === "undefined") return [] as any[];
  const mod = await import("./wallets");
  return mod.getWallets(chain);
}

export function getRecipientAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_RECIPIENT_ADDRESS || process.env.NEXT_PUBLIC_PLATFORM_WALLET || "";
  return addr as `0x${string}`;
}
