# PortalPay Pricing & Subscription Tiers

PortalPay is exposed via Azure API Management (APIM) products. Each product represents a subscription tier with specific rate limits, quotas, and support/SLA characteristics. All developer API access requires an APIM subscription key supplied in the request header: `Ocp-Apim-Subscription-Key`.

- Base URL: `https://pay.ledger1.ai`
- Authentication (Developer APIs): APIM subscription key in header
  - `Ocp-Apim-Subscription-Key: {your-subscription-key}`
- Origin enforcement: Requests must traverse Azure Front Door (AFD). Direct APIM origin may be rejected with 403 (origin enforcement).
- Wallet identity: Resolved automatically at the gateway based on your subscription; client requests do not include wallet identity.

Rate limit headers (when APIM policy is enabled):
- `X-RateLimit-Limit`: Maximum number of requests allowed in the current window
- `X-RateLimit-Remaining`: Remaining requests in the current window
- `X-RateLimit-Reset`: Unix ms timestamp when the current window resets

---

## Tiers

1) Starter
- Product ID: `portalpay-starter`
- Rate limit: 5 requests per minute
- Quota: 100 requests per week
- Intended for evaluation, prototypes, and low-volume usage
- Support/SLA: Community support

2) Pro
- Product ID: `portalpay-pro`
- Rate limit: 60 requests per minute
- Quota: 100,000 requests per month
- Intended for production workloads with moderate traffic
- Support/SLA: Standard business support

3) Enterprise
- Product ID: `portalpay-enterprise`
- Rate limit: 600 requests per minute
- Quota: 5,000,000 requests per month
- Intended for high-throughput and mission-critical workloads
- Support/SLA: Enterprise support, custom SLAs available

Notes and behavior

- Rate limiting and quotas are keyed by your APIM subscription (`counter-key="@(context.Subscription.Id)"`), ensuring isolation across customers.
- Some read-only endpoints may be environment-gated or open without auth; production usually enforces APIM for all developer-facing endpoints.
- Abusive or anomalous behavior may trigger additional protections (WAF rules, IP/geo filtering, blocklists).

---

## Getting a Subscription Key

- APIM Developer Portal: Sign up for a product (Starter, Pro, or Enterprise), then retrieve your subscription key.
- PortalPay Admin UI: Admin → API Subscriptions (if enabled) to manage keys linked to your merchant account.
- Your subscription determines the wallet identity used by the backend; it is resolved automatically at the gateway.

---

## Upgrading and Downgrading

- Move between tiers by changing your APIM product subscription (Developer Portal or support channel).
- Changes take effect immediately or shortly after approval depending on your organization’s workflow.

---

## Usage Examples

Basic request (replace `$APIM_SUBSCRIPTION_KEY` with your key):
```bash
curl -X GET "https://pay.ledger1.ai/api/receipts?limit=10" \
  -H "Ocp-Apim-Subscription-Key: $APIM_SUBSCRIPTION_KEY"
```

Create inventory item:
```bash
curl -X POST "https://pay.ledger1.ai/api/inventory" \
  -H "Content-Type: application/json" \
  -H "Ocp-Apim-Subscription-Key: $APIM_SUBSCRIPTION_KEY" \
  -d '{
    "sku": "ITEM-001",
    "name": "Sample Product",
    "priceUsd": 25.00,
    "stockQty": 100,
    "taxable": true
  }'
```

---

## Billing Guidance (Informational)

- Starter: Free or nominal monthly fee suited for testing
- Pro: Fixed monthly subscription + overage per 1k requests beyond quota
- Enterprise: Contracted pricing based on committed usage and SLA; custom policies available

---

## Contact

- Business inquiries and Enterprise upgrades: Use the Support Messaging feature in the Admin module under General
- Community support: Discord or GitHub Issues
