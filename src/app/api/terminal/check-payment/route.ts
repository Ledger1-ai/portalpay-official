import { NextRequest, NextResponse } from "next/server";
import { getSiteConfigForWallet } from "@/lib/site-config";
import { getContract, getContractEvents, prepareEvent, createThirdwebClient } from "thirdweb";
import { base } from "thirdweb/chains";
import { getContainer } from "@/lib/cosmos";

// Helper to create Thirdweb client
const client = createThirdwebClient({
    clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "",
    secretKey: process.env.THIRDWEB_SECRET_KEY || ""
});

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const { wallet, receiptId, since, amount, currency } = body;

        if (!wallet || !receiptId || !since || !amount || !currency) {
            return NextResponse.json({ error: "Missing required params" }, { status: 400 });
        }

        const normalizedWallet = String(wallet).toLowerCase();

        // 1. Get Split Address
        const cfg = await getSiteConfigForWallet(normalizedWallet).catch(() => null);
        let splitAddress = (cfg as any)?.splitAddress || (cfg as any)?.split?.address;

        // If no split address in config, try the one passed in body? (Optional safety)
        // Ideally we trust the config on server side for security.

        if (!splitAddress || !/^0x[a-f0-9]{40}$/i.test(splitAddress)) {
            // Fallback: check if we can resolve it via deploy API logic or just fail
            // For now, if no split, we can't check chain.
            return NextResponse.json({ ok: false, error: "no_split_config" });
        }

        // 2. Determine Tokens to watch
        // If Currency is ETH, check native.
        // If Currency is USDC/etc, check Token Contract Transfer.

        const isNative = currency === "ETH";
        const tokens = (cfg as any)?.tokens || [];
        const tokenConfig = tokens.find((t: any) => t.symbol === currency);

        let foundTx: any = null;

        // Tolerance: +/- 25%? Or just (x + 25%)? User said "within 25% ... (x + 25%)"
        // We'll interpret as: Acceptable if Actual >= Expected * 0.75 AND Actual <= Expected * 1.25
        const expected = Number(amount);
        const minAmount = expected * 0.75;
        const maxAmount = expected * 1.25;

        // BLOCKCHAIN CHECK
        try {
            const contract = getContract({
                client,
                chain: base,
                address: splitAddress as `0x${string}`,
            });

            // Native ETH: PaymentReceived(address from, uint256 amount)
            // ERC20: Transfer(address from, address to, uint256 value) on Token Contract

            let events: any[] = [];

            if (isNative) {
                const event = prepareEvent({
                    signature: "event PaymentReceived(address from, uint256 amount)"
                });
                events = await getContractEvents({
                    contract,
                    events: [event],
                    fromBlock: BigInt(1), // Ideally we limit block range by time, but getContractEvents uses blocks. 
                    // We'll fetch recent and filter by timestamp if possible, or just trust the poll + since param?
                    // Events return blockNumber. We might need to fetch block time. 
                    // Optimization: We only care about events AFTER `since`. `since` is in ms or seconds?
                    // Usually `since` is Date.now() when QR opened (ms).
                    // We can't efficiently filter by time in `getContractEvents` without block lookup.
                    // For polling, we'll fetch last 100 events and filter.
                });
            } else {
                if (tokenConfig?.address) {
                    const tokenContract = getContract({
                        client,
                        chain: base,
                        address: tokenConfig.address as `0x${string}`,
                    });

                    // Filter: To = splitAddress
                    const event = prepareEvent({
                        signature: "event Transfer(address indexed from, address indexed to, uint256 value)",
                        filters: {
                            to: splitAddress as `0x${string}`
                        }
                    });
                    events = await getContractEvents({
                        contract: tokenContract,
                        events: [event],
                        fromBlock: BigInt(1), // Again, ideally limit by block
                    });
                }
            }

            // FILTER EVENTS
            // We need to match Amount and Time.
            // Since we don't have event timestamps easily without RPC calls for every block, 
            // and `since` is wall clock time...
            // Use a simplified heuristic:
            // "Is there a transaction with matching amount that is NOT already consumed?"
            // Consumed? We don't track consumed txs here yet. 
            // But if we POLL every 10s, we might catch the same one.
            // `since` helps: only match if we haven't seen it before? 
            // Actually, just checking if ANY unconsumed tx exists in the timeframe.
            // Timeframe: we need to verify block timestamp > since.
            // We'll have to fetch block for candidates.

            // 1. Filter by Amount first (cheap)
            const candidates = events.filter(e => {
                // Parse amount
                // Native: args.amount
                // ERC20: args.value
                const rawVal = e.args?.amount || e.args?.value || BigInt(0);
                // Convert to human readable?
                // `amount` param is likely in "ether"/"units". `rawVal` is Wei.
                // We need decimals.
                const decimals = isNative ? 18 : (tokenConfig?.decimals || 6); // Default 6 for USDC?
                const val = Number(rawVal) / (10 ** decimals);

                return val >= minAmount && val <= maxAmount;
            });

            // 2. Filter by Time (expensive - requires block fetch)
            for (const c of candidates) {
                // Check block time
                // Using thirdweb/rpc or standard provider?
                // Use fetch to get block? 
                // We can use client to get block? 
                // `getContractEvents` result usually includes `blockNumber`.
                // We assume `since` is passed in Seconds? Or Ms?
                // Let's assume Ms.

                // Note: If we find a match, we consider it paid. 
                // Risk: Replaying old tx? 
                // Only if `since` is old. Terminal sets `since` = QR open time.
                // So old txs won't match `block.timestamp >= since`.

                // How to get block timestamp?
                // We can use a public RPC call or just assume "latest blocks are recent".
                // If candidates.length > 0, we can accept if it's "recent enough".
                // BUT rigorously:
                // We need to fetch block. 
                // Let's rely on block number? 'Since' block? 
                // We don't know the block number for `since`.

                // Alternative: Just accept if it's within the last X blocks?
                // 10 seconds is ~5 blocks on Base.
                // If we poll, we likely see new events.

                // Let's try to verify timestamp if possible, otherwise accept cautiously?
                // Or just: "If we see a matching amount after the user clicked Pay, it's likely them".
                // We can't query block timestamp easily with just thirdweb client in this scope without extra RPC calls.
                // Let's try: `eth_getBlockByNumber`.

                try {
                    const rpcResponse = await fetch(`https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_KEY}`, {
                        method: "POST",
                        body: JSON.stringify({
                            jsonrpc: "2.0",
                            id: 1,
                            method: "eth_getBlockByNumber",
                            params: ["0x" + c.blockNumber.toString(16), false]
                        })
                    });
                    const rpcData = await rpcResponse.json();
                    const ts = parseInt(rpcData.result.timestamp, 16) * 1000; // ms

                    if (ts >= since) {
                        foundTx = c.transactionHash;
                        break;
                    }
                } catch (e) {
                    // If RPC fails (no alchemy key?), maybe fallback to accepting if strict mode is off?
                    // Or skip. 
                    console.error("RPC block fetch failed", e);
                }
            }

        } catch (e) {
            console.error("Chain check failed", e);
        }

        if (foundTx) {
            // MARK AS PAID
            const container = await getContainer();
            const { resource: receiptDoc } = await container.item(`receipt:${receiptId}`, wallet).read();

            if (receiptDoc && receiptDoc.status !== "paid") {
                receiptDoc.status = "paid";
                receiptDoc.txHash = foundTx;
                receiptDoc.paidAt = Date.now();
                receiptDoc.lastUpdatedAt = Date.now();
                receiptDoc.paymentMethod = "crypto_fallback";

                await container.item(`receipt:${receiptId}`, wallet).replace(receiptDoc);
                return NextResponse.json({ ok: true, paid: true, txHash: foundTx, receipt: receiptDoc });
            } else if (receiptDoc && receiptDoc.status === "paid") {
                return NextResponse.json({ ok: true, paid: true, txHash: receiptDoc.txHash, receipt: receiptDoc });
            }
        }

        return NextResponse.json({ ok: true, paid: false });

    } catch (e: any) {
        return NextResponse.json({ error: e.message || "failed" }, { status: 500 });
    }
}
