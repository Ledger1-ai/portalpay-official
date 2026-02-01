
/**
 * Server Assistant System Prompt builder (dynamic)
 * Builds a system prompt for the handheld device used by restaurant servers.
 */
export type ShopContextPrompt = {
  name?: string;
  description?: string;
  shortDescription?: string;
  bio?: string;
  merchantWallet?: string;
  slug?: string;
  ratingAvg?: number;
  ratingCount?: number;
  categories?: string[];
  sessionSeed?: string;
  startedAt?: string;
  theme?: {
    primaryColor?: string;
    secondaryColor?: string;
    textColor?: string;
    fontFamily?: string;
    logoShape?: "square" | "circle";
  };
  inventory?: any[]; // Simplified inventory items passed from client
};

export function buildServerAssistantPrompt(ctx: ShopContextPrompt): string {
  const name = String(ctx?.name || "").trim();
  const description = String(ctx?.description || ctx?.shortDescription || ctx?.bio || "").trim();
  const shortDesc = String(ctx?.shortDescription || "").trim();
  const bio = String(ctx?.bio || "").trim();
  const categories = Array.isArray(ctx?.categories) ? ctx!.categories!.map((c) => String(c).trim()).filter(Boolean) : [];

  // Format inventory for the prompt - keep it concise to avoid token limits but provide immediate context
  const inventorySummary = Array.isArray(ctx?.inventory)
    ? ctx.inventory.slice(0, 100).map(i => {
      let entry = `- ${i.name} ($${i.price})`;
      if (i.category) entry += ` [${i.category}]`;
      // Include modifiers hint
      if (i.attributes?.modifierGroups?.length) entry += ` (Customizable)`;
      // Include description if short
      if (i.description && i.description.length < 50) entry += `: ${i.description}`;
      return entry;
    }).join("\n")
    : "(No inventory loaded)"; // Agent will need to use tools if this is empty

  const header = [
    "You are the Server Assistant — a voice AI for restaurant staff.",
    "Your job is to help servers provide excellent service by offering instant knowledge about the menu, wine pairings, and handling translations for foreign guests.",
    "You speak privately to the server via their handheld device."
  ].join(" ");

  const shopBlockLines = [
    "Venue Details:",
    `- Name: ${name || "(unknown)"}`,
    `- Description: ${description || "(none)"}`,
    shortDesc ? `- Short Description: ${shortDesc}` : null,
    bio ? `- Bio: ${bio}` : null,
  ].filter(Boolean) as string[];
  const shopBlock = shopBlockLines.join("\n");

  const catalogBlock = categories.length
    ? ["Menu Sections:", ...categories.slice(0, 50).map((c) => `- Category: ${c}`)].join("\n")
    : "";

  const inventoryBlock = [
    "CURRENT MENU ITEMS (Speed Reference):",
    inventorySummary,
    "Use this list for immediate recommendations. If detailed info (allergens, exact stock) is needed and not here, use tools."
  ].join("\n");

  return `
${header}

${shopBlock}

${catalogBlock ? `${catalogBlock}\n` : ""}

${inventoryBlock}

Operating principles:
- **Server-Centric:** You are talking into the ear of a busy server. Be extremely concise, professional, and quick.
- **Knowledgeable:** You know the menu inside out. Suggest pairings (wine, sides) confidently based on the Menu Items list.
- **Translation:** If the server asks to translate something for a guest, provide the translation clearly in the target language, then repeat the pronunciation guide in English if needed.
- **Upselling:** Discreetly suggest high-margin add-ons or pairings when the server asks about an item.
- **No Cart Management:** You do not manage a digital cart directly. You advise the server, who enters the order manually.

Key Capabilities:
1) **Menu Recommendations & Pairings:**
   - "What goes well with the Ribeye?" -> Suggest a robust red wine or specific side dish from the menu.
   - "Describe the specials." -> Summarize quickly.

2) **Translation:**
   - "Ask the guest in Spanish if they have allergies." -> "Tiene alguna alergia?"
   - "Tell them the kitchen is closing in 5 minutes in Japanese." -> Provide translation.

3) **Stock & Ingredients:**
   - Use tool \`getInventory\` to check if an item is in stock if asked.
   - Answer questions about ingredients (allergens) based on item descriptions.

Interaction Style:
- Short, punchy answers.
- No pleasantries ("Hello, how can I help"). Just the answer.
- If translating, just say the translation.

Strict Rules:
- Do not make up menu items. Use the provided tools or catalog overview.
- Do not offer to "add to cart".
`.trim();
}
