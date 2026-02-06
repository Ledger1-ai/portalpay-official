// Load environment variables from .env.local or .env
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { getContainer } from "@/lib/cosmos";

/**
 * Migration script to update existing API keys with expanded default scopes.
 * 
 * Run with: npx tsx scripts/migrate-api-key-scopes.ts
 * 
 * This adds missing scopes to all existing API keys that don't have them.
 * Safe to run multiple times (idempotent).
 */

const NEW_DEFAULT_SCOPES = [
    "receipts:read", "receipts:write",
    "orders:read", "orders:create",
    "inventory:read", "inventory:write",
    "split:read", "split:write", "shop:read"
];

async function migrateApiKeyScopes() {
    console.log("🔄 Starting API key scope migration...");
    console.log(`   New scopes: ${NEW_DEFAULT_SCOPES.join(", ")}`);

    const container = await getContainer();

    // Find all API keys
    const query = "SELECT * FROM c WHERE c.type = 'api_key' AND c.isActive = true";
    const { resources: keys } = await container.items.query({ query }).fetchAll();

    console.log(`📋 Found ${keys.length} active API keys`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const key of keys) {
        const currentScopes = Array.isArray(key.scopes) ? key.scopes : [];
        const missingScopes = NEW_DEFAULT_SCOPES.filter(s => !currentScopes.includes(s));

        if (missingScopes.length === 0) {
            skipped++;
            console.log(`⏭️  Skipped ${key.id} (already has all scopes)`);
            continue;
        }

        // Add missing scopes
        const updatedScopes = [...currentScopes, ...missingScopes];
        const updatedKey = {
            ...key,
            scopes: updatedScopes,
            updatedAt: Date.now(),
            _migrationNote: `Scopes expanded on ${new Date().toISOString()}`
        };

        try {
            // Use upsert instead of replace - works regardless of partition key
            await container.items.upsert(updatedKey);
            updated++;
            console.log(`✅ Updated ${key.id} (${key.label || "unnamed"}) - added: ${missingScopes.join(", ")}`);
        } catch (e: any) {
            errors++;
            console.error(`❌ Failed to update ${key.id}: ${e?.message?.substring(0, 100)}`);
        }
    }

    console.log("\n📊 Migration Summary:");
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped (already had all scopes): ${skipped}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total: ${keys.length}`);
}

// Run migration
migrateApiKeyScopes()
    .then(() => {
        console.log("\n✨ Migration complete!");
        process.exit(0);
    })
    .catch((e) => {
        console.error("\n💥 Migration failed:", e);
        process.exit(1);
    });
