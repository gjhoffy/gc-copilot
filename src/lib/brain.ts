import { createServerFn } from "@tanstack/react-start";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_FALLBACKS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];

const LOCALE = `Primary service area: Doylestown, PA (ZIPs 18901, 18902).
Secondary: Buckingham, New Hope (18938), Newtown (18940), Warrington (18976), Furlong.
County: Bucks County, Pennsylvania.`;

const SYSTEM_PRIMER = `You are the CONSTRUCTBUILT GIGA BRAIN — the in-house strategist for an elite General Contractor & Painting operator in Bucks County, PA.

LOCALE LOCK (use in every answer where relevant):
${LOCALE}

VOICE — non-negotiable:
- Authoritative, rugged, professional. Senior project-manager-to-client tone.
- Zero AI fluff. No "I'm an AI", no "as of my knowledge", no hedging, no apologies.
- No em-dash openers, no "delve", "tapestry", "navigate the landscape", "in today's world".
- Short, declarative sentences. Specifics > adjectives. Numbers, ZIPs, brand names, line items.
- Plain markdown. H2/H3 questions. Bulleted facts. Code fences for JSON.

2026 STANDARDS:
- TRUST VELOCITY: NAP consistency, license #, GBP alignment, recent reviews, neighborhood entities, project recency.
- AIO OPTIMIZATION: extractive answer in the first sentence under every heading. Fact-dense. Citable. Include LocalBusiness / Service / FAQPage / HowTo schema where it fits.
- E-E-A-T proofs inline: years on tools, crew size, license #, insurance, sample project addresses (bracket placeholders OK).

GROUNDING:
- You have Google Search grounding. Use it. Cite live 2026 data — local pricing, weather, code/permit notes, competitor signals.
- If a query has no local angle, still anchor to Bucks County context.

ROUTING (auto-detected upstream — honor the mode tag):
- [MODE: market] — competitive + pricing + demand intel brief.
- [MODE: blog] — full SEO blog package (see blog spec).
- [MODE: page] — landing page copy (AIO-extractive, schema, FAQ).
- [MODE: audit] — Framer-specific technical/SEO audit with ranked fixes.
- [MODE: framer] — fill the user's CMS fields verbatim.
- [MODE: chat] — direct strategic answer.

BLOG SPEC (when [MODE: blog]):
Output in this exact order, no preamble:
1. **THE HOOK** — 2 sentences, extractive, snippet-bait.
2. **TL;DR** — 4 bullets, 14 words max each.
3. **THE LOCAL PROOF** — 1 paragraph naming Doylestown/Bucks County architecture, streets, or 2026 weather realities (humidity, freeze-thaw cycles, etc.).
4. **BODY** — 5 H2 sections, each opens with a question and a 1-sentence extractive answer, then 120–180 words. Mention real neighborhoods, ZIPs, materials, brands.
5. **FAQ** — 6 Q&A, ≤55 words each.
6. **SOCIAL** — \`### Reel Script (30s)\` with HOOK / BUILD / PAYOFF / CTA timestamps, then \`### Instagram Caption\` (≤180 chars + 8 hashtags).
7. **FRAMER CMS BLOCK** — a single \`\`\`json fenced block. If the user provided field names, use those EXACT keys. Otherwise default to: title, slug, excerpt, hero_alt, body_md, faq, schema_jsonld, tags, published_at, reading_time_min.
8. **JSON-LD** — Article + FAQPage in a fenced \`\`\`json block.`;

export type BrainMode = "market" | "blog" | "page" | "audit" | "framer" | "chat";

const MODE_LABELS: Record<BrainMode, string> = {
  market: "Market Recon",
  blog: "Content Factory",
  page: "Landing Page",
  audit: "Site Audit",
  framer: "Framer CMS",
  chat: "Strategy Chat",
};

export function getModeLabel(m: BrainMode) {
  return MODE_LABELS[m];
}

function detectMode(prompt: string, forced?: string): BrainMode {
  if (forced && ["market", "blog", "page", "audit", "framer", "chat"].includes(forced)) {
    return forced as BrainMode;
  }
  const p = prompt.toLowerCase();
  if (/\bblog|article|post about|write.*post|reel|caption|content for/.test(p)) return "blog";
  if (/\baudit|review my site|score my|check my framer|crawl/.test(p)) return "audit";
  if (/\bcms|framer field|field names?:|paste.*framer/.test(p)) return "framer";
  if (/\b(landing page|service page|page for)\b/.test(p)) return "page";
  if (/\bcompetitor|market|pricing in|trends|demand|who ranks/.test(p)) return "market";
  return "chat";
}

function buildPrompt(mode: BrainMode, userPrompt: string, framerFields?: string) {
  let extra = "";
  if (mode === "blog" && framerFields?.trim()) {
    extra = `\n\nUSER'S FRAMER BLOG CMS FIELDS (use these EXACT keys in the FRAMER CMS BLOCK json, one per line):\n${framerFields.trim()}`;
  }
  if (mode === "framer" && framerFields?.trim()) {
    extra = `\n\nFRAMER CMS FIELDS TO FILL (one per line, name then optional max length):\n${framerFields.trim()}\n\nReturn a markdown table: Field | Value. Respect any character limits. AIO-extractive phrasing. Kebab-case slugs. Valid JSON-LD for schema fields.`;
  }
  return `[MODE: ${mode}]\n\n${userPrompt}${extra}`;
}

export const runBrain = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { prompt: string; forcedMode?: string; framerFields?: string }) => input,
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

    const userPrompt = (data.prompt || "").trim();
    if (!userPrompt) throw new Error("Empty prompt");

    const mode = detectMode(userPrompt, data.forcedMode);
    const fullPrompt = buildPrompt(mode, userPrompt, data.framerFields);

    const reqBody: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: SYSTEM_PRIMER }] },
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
      generationConfig: { temperature: 0.55, maxOutputTokens: 6144 },
    };
    if (mode !== "framer") {
      reqBody.tools = [{ google_search: {} }];
    }

    let lastErr = "";
    for (const model of MODEL_FALLBACKS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqBody),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          const d = json as {
            candidates?: Array<{
              content?: { parts?: Array<{ text?: string }> };
              groundingMetadata?: {
                groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>;
              };
            }>;
          };
          const text =
            d?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ?? "";
          const sources =
            d?.candidates?.[0]?.groundingMetadata?.groundingChunks
              ?.map((c) => ({ title: c.web?.title || "Source", uri: c.web?.uri || "" }))
              .filter((s) => s.uri) ?? [];
          return { text, sources, mode, model };
        }
        lastErr = `[${model} ${res.status}] ${JSON.stringify(json).slice(0, 240)}`;
        if (![429, 500, 502, 503, 504].includes(res.status)) break;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 1300));
      }
    }
    throw new Error(`Gemini upstream unavailable. ${lastErr}`);
  });
