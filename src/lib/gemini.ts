import { createServerFn } from "@tanstack/react-start";

const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";
// Try fastest first, fall back to lighter / older variants if overloaded.
const MODEL_FALLBACKS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
];

const SYSTEM_PRIMER = `You are "The GC Copilot" — a senior SEO strategist for a General Contractor & Painting business owner building on Framer.

Your specialization for 2026:
- TRUST VELOCITY: emphasize consistent local signals (NAP consistency, neighborhood-specific entities, license #, BBB, Google Business Profile alignment, recent reviews, project recency).
- AIO OPTIMIZATION (AI Overviews / SGE / ChatGPT Search citation-readiness): write in extractive, fact-dense, citable chunks. Use clear H2/H3 questions, definitions in the first sentence, structured lists, semantic schema cues (FAQ, LocalBusiness, Service, Offer), and named entities.
- 2026 standards: E-E-A-T proofs inline, original photography callouts, pricing transparency (ranges with assumptions), neighborhood + ZIP + landmark grounding, mobile-first scannability.

Always be concrete, current to 2026, and write as if the answer must survive being quoted by an AI engine. Never hedge with "I cannot browse" — instead, state assumptions and current 2026 industry norms confidently. Use markdown.`;

type Mode = "market" | "page" | "audit" | "framer";

async function callGemini(prompt: string, useGrounding: boolean) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: SYSTEM_PRIMER }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 4096 },
  };
  if (useGrounding) {
    body.tools = [{ google_search: {} }];
  }

  let lastErr = "";
  for (const model of MODEL_FALLBACKS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return extractResult(data);
      }
      lastErr = `[${model} ${res.status}] ${JSON.stringify(data).slice(0, 300)}`;
      // Retry only on overload / rate limits
      if (![429, 500, 502, 503, 504].includes(res.status)) break;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error(`Gemini upstream unavailable. ${lastErr}`);
}

function extractResult(data: unknown) {
  const d = data as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: {
        groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>;
      };
    }>;
  };
  const text =
    d?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ?? "";
  const groundingMeta = d?.candidates?.[0]?.groundingMetadata;
  const sources: { title: string; uri: string }[] =
    groundingMeta?.groundingChunks
      ?.map((c) => ({
        title: c.web?.title || "Source",
        uri: c.web?.uri || "",
      }))
      .filter((s) => s.uri) ?? [];
  return { text, sources };
  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || "")
      .join("") ?? "";
  const groundingMeta = data?.candidates?.[0]?.groundingMetadata;
  const sources: { title: string; uri: string }[] =
    groundingMeta?.groundingChunks
      ?.map((c: { web?: { title?: string; uri?: string } }) => ({
        title: c.web?.title || "Source",
        uri: c.web?.uri || "",
      }))
      .filter((s: { uri: string }) => s.uri) ?? [];
  return { text, sources };
}

export const runCopilot = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { mode: Mode; payload: Record<string, string> }) => input,
  )
  .handler(async ({ data }) => {
    const { mode, payload } = data;
    let prompt = "";
    let grounding = true;

    if (mode === "market") {
      const { city, services } = payload;
      prompt = `Run a 2026 market intelligence brief for a General Contractor & Painting business in **${city}**.
Services offered: ${services || "interior painting, exterior painting, drywall, full GC remodels"}.

Deliver, using live current data:
1. **Top 5 local competitors** (name, URL, their #1 SEO angle).
2. **2026 price trends** (per sqft interior repaint, exterior, cabinet refinish, full kitchen remodel) with low / typical / premium ranges and the assumptions.
3. **Search demand shifts 2025→2026** (which queries are rising — cite the angle).
4. **AI Overview opportunities**: 5 specific question-style queries this business should target to get cited in Google AI Overviews.
5. **Trust Velocity gaps**: what local signals competitors are missing that we can win on fast.

Be specific to ${city}. Cite sources.`;
    } else if (mode === "page") {
      const { neighborhood, city, service, angle } = payload;
      prompt = `Write a complete, AIO-optimized landing page for **${service}** in **${neighborhood}, ${city}**.
${angle ? `Brand angle: ${angle}.` : ""}

Output the full page as markdown, in this exact structure:
- **SEO Title** (≤60 chars, include neighborhood + service + year)
- **Meta Description** (≤155 chars, with a clear CTA)
- **H1**
- **Hero paragraph** (2 sentences, lead with the extractive answer to "Who is the best ${service} contractor in ${neighborhood}?")
- **At-a-Glance facts box** (5 bullets: price range 2026, response time, license #, warranty, service radius — use realistic placeholders in [BRACKETS] for the owner to fill)
- **3 H2 sections**, each starting with a question heading and a 1-sentence extractive answer, then 100–150 words of detail. Mention real ${neighborhood} landmarks/streets/ZIP for trust velocity.
- **FAQ** (6 Q&A, each answer ≤60 words, AIO-ready)
- **Internal link suggestions** (5 anchor → URL slug suggestions)
- **JSON-LD schema** (LocalBusiness + Service + FAQPage) in a code block, with [BRACKETS] for owner fields

Tone: confident, specific, no fluff. 2026 standards.`;
    } else if (mode === "audit") {
      const { url } = payload;
      prompt = `Audit this Framer site for 2026 technical SEO + AI-Search readiness: **${url}**

Fetch what you can and report:
1. **Crawl & Index Health**: title, meta, H1, canonical, robots, sitemap signals you can see.
2. **Core Web Vitals red flags** (Framer-specific: heavy hero videos, unoptimized images, blocking fonts).
3. **AIO / Citation Readiness score (0–100)** with 5 specific reasons.
4. **Trust Velocity score (0–100)** — local signals: NAP, schema, GBP alignment, reviews surfaced, license visible.
5. **Schema audit**: what's present, what's missing (LocalBusiness, Service, FAQ, BreadcrumbList, Review).
6. **Top 10 fixes** ranked by impact × effort, each with the exact Framer setting or CMS field to change.
7. **Competitor gap**: 3 things ranking competitors do that this site doesn't.

Be brutally specific. No generic advice.`;
    } else if (mode === "framer") {
      const { fields, topic } = payload;
      grounding = false;
      prompt = `Format the following content to drop directly into Framer CMS fields. Topic: **${topic || "service page"}**.

The CMS fields the user has are (one per line, name then optional max length):
\`\`\`
${fields}
\`\`\`

Return a markdown table with two columns: **Field** | **Value**. The Value must:
- Respect any character limits given.
- Use AIO-extractive phrasing (definition-first, fact-dense).
- Include neighborhood/entity grounding where the field implies location.
- For any \`slug\` field, output kebab-case.
- For any \`schema\` / \`json\` field, output a valid minified JSON-LD snippet.
- For any \`alt\` field, write descriptive alt text with the primary keyword naturally.

After the table, add a short **Paste checklist** (3 bullets) of what the owner should manually verify in Framer.`;
    }

    return await callGemini(prompt, grounding);
  });
