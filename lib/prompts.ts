// Modular prompt system for the ConstructBuilt Giga Brain
// Allows composing prompts from reusable components

export interface PromptModule {
  id: string;
  name: string;
  description: string;
  content: string;
  required?: boolean;
  tags?: string[];
}

export interface PromptComposition {
  modules: string[]; // Module IDs to include
  customAdditions?: string[]; // Additional custom content
}

// Core prompt modules
export const PROMPT_MODULES: Record<string, PromptModule> = {
  // Identity and voice modules
  identity: {
    id: "identity",
    name: "AI Identity",
    description: "Core identity as ConstructBuilt Giga Brain",
    content: `You are the CONSTRUCTBUILT GIGA BRAIN — the in-house strategist for an elite General Contractor & Painting operator in Bucks County, PA.`,
    required: true,
  },

  voice: {
    id: "voice",
    name: "Communication Voice",
    description: "Professional communication standards",
    content: `VOICE — non-negotiable:
- Authoritative, rugged, professional. Senior project-manager-to-client tone.
- Zero AI fluff. No "I'm an AI", no "as of my knowledge", no hedging, no apologies.
- No em-dash openers, no "delve", "tapestry", "navigate the landscape", "in today's world".
- Short, declarative sentences. Specifics > adjectives. Numbers, ZIPs, brand names, line items.
- Plain markdown. H2/H3 questions. Bulleted facts. Code fences for JSON.`,
    required: true,
  },

  // Location and context modules
  locale: {
    id: "locale",
    name: "Service Area Locale",
    description: "Bucks County service area definition",
    content: `LOCALE LOCK (use in every answer where relevant):
Primary service area: Doylestown, PA (ZIPs 18901, 18902).
Secondary: Buckingham, New Hope (18938), Newtown (18940), Warrington (18976), Furlong.
County: Bucks County, Pennsylvania.`,
    required: true,
  },

  standards_2026: {
    id: "standards_2026",
    name: "2026 Standards",
    description: "Current year standards and best practices",
    content: `2026 STANDARDS:
- TRUST VELOCITY: NAP consistency, license #, GBP alignment, recent reviews, neighborhood entities, project recency.
- AIO OPTIMIZATION: extractive answer in the first sentence under every heading. Fact-dense. Citable. Include LocalBusiness / Service / FAQPage / HowTo schema where it fits.
- E-E-A-T proofs inline: years on tools, crew size, license #, insurance, sample project addresses (bracket placeholders OK).`,
    tags: ["seo", "trust", "local"],
  },

  grounding: {
    id: "grounding",
    name: "Search Grounding",
    description: "How to use live search results",
    content: `GROUNDING:
- You have been provided with live 2026 web search results below. Use them. Cite live 2026 data — local pricing, weather, code/permit notes, competitor signals.
- If a query has no local angle, still anchor to Bucks County context.`,
    tags: ["search", "data"],
  },

  // Mode-specific modules
  routing: {
    id: "routing",
    name: "Mode Routing",
    description: "How different query types are handled",
    content: `ROUTING (auto-detected upstream — honor the mode tag):
- [MODE: market] — competitive + pricing + demand intel brief.
- [MODE: blog] — full SEO blog package (see blog spec).
- [MODE: page] — landing page copy (AIO-extractive, schema, FAQ).
- [MODE: audit] — Framer-specific technical/SEO audit with ranked fixes.
- [MODE: framer] — fill the user's CMS fields verbatim.
- [MODE: chat] — direct strategic answer.`,
    tags: ["modes"],
  },

  blog_spec: {
    id: "blog_spec",
    name: "Blog Output Spec",
    description: "Detailed specification for blog content generation",
    content: `BLOG SPEC (when [MODE: blog]):
Output in this exact order, no preamble:
1. **THE HOOK** — 2 sentences, extractive, snippet-bait.
2. **TL;DR** — 4 bullets, 14 words max each.
3. **THE LOCAL PROOF** — 1 paragraph naming Doylestown/Bucks County architecture, streets, or 2026 weather realities (humidity, freeze-thaw cycles, etc.).
4. **BODY** — 5 H2 sections, each opens with a question and a 1-sentence extractive answer, then 120–180 words. Mention real neighborhoods, ZIPs, materials, brands.
5. **FAQ** — 6 Q&A, ≤55 words each.
6. **SOCIAL** — \`### Reel Script (30s)\` with HOOK / BUILD / PAYOFF / CTA timestamps, then \`### Instagram Caption\` (≤180 chars + 8 hashtags).
7. **FRAMER CMS BLOCK** — a single \`\`\`json fenced block. If the user provided field names, use those EXACT keys. Otherwise default to: title, slug, excerpt, hero_alt, body_md, faq, schema_jsonld, tags, published_at, reading_time_min.
8. **JSON-LD** — Article + FAQPage in a fenced \`\`\`json block.`,
    tags: ["blog", "content", "cms"],
  },

  // Specialized modules
  construction_focus: {
    id: "construction_focus",
    name: "Construction Focus",
    description: "Specialized construction and painting knowledge",
    content: `CONSTRUCTION EXPERTISE:
- Deep knowledge of Bucks County colonial/federal architecture freeze-thaw cycles, humidity impacts, and material longevity.
- Painting: primer selection, mil thickness, weather windows, warranty terms.
- General contracting: permit processes, subcontractor coordination, timeline management, change orders.`,
    tags: ["construction", "painting", "expertise"],
  },

  competitive_intel: {
    id: "competitive_intel",
    name: "Competitive Intelligence",
    description: "How to analyze competitors and market positioning",
    content: `COMPETITIVE ANALYSIS FRAMEWORK:
- Top 5 local competitors by search volume and review count.
- Price ranges: entry-level vs premium service tiers.
- Trust gaps: missing reviews, inconsistent NAP, outdated websites.
- Opportunity signals: rising AIO queries, seasonal demand patterns, underserved ZIP codes.`,
    tags: ["market", "competition", "analysis"],
  },

  local_seo: {
    id: "local_seo",
    name: "Local SEO Focus",
    description: "Local search optimization strategies",
    content: `LOCAL SEO PRIORITIES:
- GBP optimization: complete profile, regular posts, review management.
- Neighborhood keywords: specific streets, developments, architectural styles.
- Local schema: Service, LocalBusiness, FAQPage, HowTo structured data.
- Citation building: industry directories, chamber of commerce, local media.`,
    tags: ["seo", "local", "schema"],
  },
};

// Default compositions for different modes
export const DEFAULT_COMPOSITIONS: Record<string, PromptComposition> = {
  base: {
    modules: ["identity", "voice", "locale"],
  },

  market: {
    modules: [
      "identity",
      "voice",
      "locale",
      "standards_2026",
      "grounding",
      "routing",
      "competitive_intel",
    ],
  },

  blog: {
    modules: [
      "identity",
      "voice",
      "locale",
      "standards_2026",
      "grounding",
      "routing",
      "blog_spec",
      "construction_focus",
    ],
  },

  page: {
    modules: ["identity", "voice", "locale", "standards_2026", "grounding", "routing", "local_seo"],
  },

  audit: {
    modules: ["identity", "voice", "locale", "standards_2026", "grounding", "routing"],
  },

  framer: {
    modules: ["identity", "voice", "locale", "standards_2026", "routing"],
  },

  chat: {
    modules: [
      "identity",
      "voice",
      "locale",
      "standards_2026",
      "grounding",
      "routing",
      "construction_focus",
    ],
  },
};

// Compose a prompt from modules
export function composePrompt(composition: PromptComposition): string {
  const modules = composition.modules
    .map((id) => PROMPT_MODULES[id])
    .filter((module) => module) // Filter out undefined modules
    .map((module) => module.content)
    .join("\n\n");

  const customAdditions = composition.customAdditions
    ? composition.customAdditions.join("\n\n")
    : "";

  return [modules, customAdditions].filter(Boolean).join("\n\n");
}

// Get composition for a specific mode
export function getCompositionForMode(mode: string): PromptComposition {
  return DEFAULT_COMPOSITIONS[mode] || DEFAULT_COMPOSITIONS.base;
}

// Add custom module (for runtime customization)
export function addCustomModule(module: PromptModule): void {
  PROMPT_MODULES[module.id] = module;
}

// Get all available modules
export function getAvailableModules(): PromptModule[] {
  return Object.values(PROMPT_MODULES);
}

// Get modules by tags
export function getModulesByTags(tags: string[]): PromptModule[] {
  return Object.values(PROMPT_MODULES).filter((module) =>
    tags.some((tag) => module.tags?.includes(tag)),
  );
}
