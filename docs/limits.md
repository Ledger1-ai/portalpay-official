# Rate Limits & Quotas

Understanding API rate limits and usage quotas for PortalPay.

## Overview

PortalPay implements rate limiting per wallet address to ensure fair usage and system stability. Rate limits are enforced on a per-endpoint basis.

---

## Rate Limits by Endpoint Category

| Endpoint Category | Limit | Window | Reset |
|------------------|-------|--------|-------|
| Inventory Writes (POST) | 60 requests | 1 minute | Rolling |
| Inventory Deletes (DELETE) | 30 requests | 1 minute | Rolling |
| Order Creation (POST) | 100 requests | 1 minute | Rolling |
| General Reads (GET) | 300 requests | 1 minute | Rolling |
| Split Configuration | 10 requests | 1 minute | Rolling |

---

## How Rate Limiting Works

### Per-Wallet Enforcement

Rate limits are enforced per wallet address. Each merchant wallet has independent rate limits.

```
Wallet A: Can make 60 inventory writes/minute
Wallet B: Can also make 60 inventory writes/minute (independent)
```

### Rolling Windows

PortalPay uses rolling windows, not fixed intervals:

```
Fixed Window (Not Used):
12:00:00 - 12:00:59 → 60 requests allowed
12:01:00 - 12:01:59 → 60 new requests allowed

Rolling Window (Used):
Any 60-second period → 60 requests allowed
```

### Rate Limit Response

When rate limited, you'll receive:

```json
{
  "error": "rate_limited",
  "message": "Rate limit exceeded",
  "resetAt": 1698765432000
}
```

**HTTP Status**: 429 Too Many Requests

**Headers**:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1698765432
```

---

## Best Practices

### 1. Implement Exponential Backoff

```typescript
async function makeRequestWithBackoff(
  fn: () => Promise<any>,
  maxRetries = 3
): Promise<any> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      if (error.error === 'rate_limited' && i < maxRetries - 1) {
        const waitTime = error.resetAt - Date.now();
        const backoff = Math.min(waitTime, 60000); // Max 1 minute
        
        console.log(`Rate limited. Waiting ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
      throw error;
    }
  }
}
```

### 2. Batch Operations

Instead of making many individual requests, batch them:

```typescript
// Bad: Multiple requests
for (const item of items) {
  await createInventoryItem(item); // 100 requests
}

// Good: Single batch request
await createInventoryBatch(items); // 1 request
```

### 3. Cache Responses

```typescript
const cache = new Map();

async function getCachedInventory(wallet: string) {
  const key = `inventory:${wallet}`;
  const cached = cache.get(key);
  
  if (cached && Date.now() - cached.timestamp < 60000) {
    return cached.data;
  }
  
  const data = await getInventory(wallet);
  cache.set(key, { data, timestamp: Date.now() });
  return data;
}
```

### 4. Monitor Usage

```typescript
class RateLimitTracker {
  private calls: Map<string, number[]> = new Map();
  
  track(endpoint: string) {
    const now = Date.now();
    const calls = this.calls.get(endpoint) || [];
    
    // Keep only calls from last minute
    const recent = calls.filter(time => now - time < 60000);
    recent.push(now);
    
    this.calls.set(endpoint, recent);
  }
  
  getUsage(endpoint: string, limit: number): number {
    const calls = this.calls.get(endpoint) || [];
    return (calls.length / limit) * 100;
  }
}
```

---

## Upgrading Limits

### Usage Tiers

| Tier | Rate Limit | Quota |
|------|------------|-------|
| **Starter** | 500 req/min | 5,000 req/week |
| **Pro** | 2,500 req/min | 1,000,000 req/month |
| **Enterprise** | 10,000 req/min | 50,000,000 req/month |

All merchants start on the **Starter** tier.

### Enterprise Plans

For higher limits, use the Support Messaging feature in the Admin module under General with:
- Your use case
- Expected request volume
- Business details

Custom rate limits available for:
- High-volume merchants
- B2B integrations
- White-label solutions

---

## Avoiding Rate Limits

### Polling vs Webhooks

**Don't Poll** (uses rate limits):
```typescript
// Bad: Polling every 5 seconds
setInterval(async () => {
  const status = await checkReceiptStatus(receiptId);
  if (status === 'completed') {
    processReceipt(receiptId);
  }
}, 5000); // 12 requests/minute per receipt
```

**Use Webhooks** (when available):
```typescript
// Good: Webhook notification
app.post('/webhooks/portalpay', (req, res) => {
  const { event, receiptId } = req.body;
  if (event === 'receipt.paid') {
    processReceipt(receiptId);
  }
  res.sendStatus(200);
});
```

### Smart Queuing

```typescript
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private readonly rateLimit = 60; // per minute
  private readonly window = 60000; // 1 minute
  
  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      this.process();
    });
  }
  
  private async process() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    const delay = this.window / this.rateLimit;
    
    while (this.queue.length > 0) {
      const fn = this.queue.shift();
      if (fn) await fn();
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.processing = false;
  }
}
```

---

## Quotas (Future)

Currently, there are no hard quotas on:
- Total API calls per month
- Storage (receipts, inventory)
- Number of products
- Number of orders

This may change in the future with the introduction of tiered pricing plans.

---

## Monitoring Your Usage

### API Call Tracking

```typescript
const dailyStats = {
  calls: 0,
  errors: 0,
  rateLimits: 0,
  date: new Date().toDateString()
};

function trackCall(success: boolean, rateLimited: boolean) {
  // Reset on new day
  if (dailyStats.date !== new Date().toDateString()) {
    console.log('Previous day stats:', dailyStats);
    dailyStats.calls = 0;
    dailyStats.errors = 0;
    dailyStats.rateLimits = 0;
    dailyStats.date = new Date().toDateString();
  }
  
  dailyStats.calls++;
  if (!success) dailyStats.errors++;
  if (rateLimited) dailyStats.rateLimits++;
}
```

### Dashboard (Coming Soon)

A usage dashboard will be available showing:
- Real-time rate limit usage
- Historical API call volume
- Error rates
- Peak usage times

---

## FAQ

### Q: What happens if I exceed the rate limit?

**A**: You'll receive a 429 error with a `resetAt` timestamp. Wait until that time and retry.

### Q: Do rate limits reset at fixed intervals?

**A**: No, PortalPay uses rolling windows. The limit applies to any 60-second period.

### Q: Can I check my current rate limit usage?

**A**: Rate limit headers are included in API responses showing your current usage.

### Q: Are WebSocket connections rate limited?

**A**: WebSocket connections have separate limits. Contact support for details.

### Q: Do failed requests count towards rate limits?

**A**: Yes, all requests (successful or failed) count towards rate limits.

### Q: Can I request higher limits temporarily?

**A**: Contact support for temporary limit increases for special events or migrations.

---

## Related Resources

- [Error Handling](./errors.md) - Handling rate limit errors
- [API Reference](./api/README.md) - Endpoint documentation
- [Best Practices](./auth.md#best-practices) - Integration patterns

---

**Need Higher Limits?** Use the Support Messaging feature in the Admin module under General
