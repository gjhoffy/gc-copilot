import { createFileRoute } from "@tanstack/react-router";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_FALLBACKS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
];

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

type Mode = "market" | "blog" | "page" | "audit" | "framer" | "chat";

function detectMode(prompt: string, forced?: string): Mode {
  if (forced && ["market", "blog", "page", "audit", "framer", "chat"].includes(forced)) {
    return forced as Mode;
  }
  const p = prompt.toLowerCase();
  if (/\bblog|article|post about|write.*post|reel|caption|content for/.test(p)) return "blog";
  if (/\baudit|review my site|score my|check my framer|crawl/.test(p)) return "audit";
  if (/\bcms|framer field|field names?:|paste.*framer/.test(p)) return "framer";
  if (/\b(landing|service page|page for|write.*page)\b/.test(p)) return "page";
  if (/\bcompetitor|market|pricing in|trends|demand|who ranks/.test(p)) return "market";
  return "chat";
}

function buildPrompt(mode: Mode, userPrompt: string, framerFields?: string): string {
  let extra = "";
  if (mode === "blog" && framerFields?.trim()) {
    extra = `\n\nUSER'S FRAMER BLOG CMS FIELDS (use these EXACT keys in the FRAMER CMS BLOCK json):\n${framerFields.trim()}`;
  }
  if (mode === "framer" && framerFields?.trim()) {
    extra = `\n\nFRAMER CMS FIELDS TO FILL (one per line, name then optional max length):\n${framerFields.trim()}\nReturn a markdown table: Field | Value. Respect limits. AIO-extractive phrasing.`;
  }
  return `[MODE: ${mode}]\n\n${userPrompt}${extra}`;
}

export const Route = createFileRoute("/api/brain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        let body: { prompt?: string; forcedMode?: string; framerFields?: string };
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
        }

        const userPrompt = (body.prompt || "").trim();
        if (!userPrompt) {
          return new Response(JSON.stringify({ error: "prompt required" }), { status: 400 });
        }

        const mode = detectMode(userPrompt, body.forcedMode);
        const fullPrompt = buildPrompt(mode, userPrompt, body.framerFields);

        const reqBody = {
          systemInstruction: { parts: [{ text: SYSTEM_PRIMER }] },
          contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
          generationConfig: { temperature: 0.55, maxOutputTokens: 6144 },
          tools: mode === "framer" ? undefined : [{ google_search: {} }],
        };

        // Find a working model first (with retry on overload)
        let upstream: Response | null = null;
        let lastErr = "";
        outer: for (const model of MODEL_FALLBACKS) {
          for (let attempt = 0; attempt < 2; attempt++) {
            const url = `${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
            const r = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(reqBody),
            });
            if (r.ok && r.body) {
              upstream = r;
              break outer;
            }
            const txt = await r.text().catch(() => "");
            lastErr = `[${model} ${r.status}] ${txt.slice(0, 200)}`;
            if (![429, 500, 502, 503, 504].includes(r.status)) break;
            if (attempt === 0) await new Promise((res) => setTimeout(res, 1200));
          }
        }

        if (!upstream || !upstream.body) {
          return new Response(
            `event: error\ndata: ${JSON.stringify({ error: lastErr || "Upstream unavailable" })}\n\n`,
            { headers: { "Content-Type": "text/event-stream" } },
          );
        }

        // Transform Gemini SSE → our SSE (text deltas + sources + meta)
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const reader = upstream.body.getReader();

        const stream = new ReadableStream({
          async start(controller) {
            const send = (event: string, data: unknown) => {
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
              );
            };

            send("meta", { mode });

            const seenUris = new Set<string>();
            let buf = "";
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                let idx: number;
                while ((idx = buf.indexOf("\n")) !== -1) {
                  const line = buf.slice(0, idx).replace(/\r$/, "");
                  buf = buf.slice(idx + 1);
                  if (!line.startsWith("data: ")) continue;
                  const json = line.slice(6).trim();
                  if (!json || json === "[DONE]") continue;
                  try {
                    const parsed = JSON.parse(json);
                    const cand = parsed?.candidates?.[0];
                    const parts = cand?.content?.parts;
                    if (Array.isArray(parts)) {
                      for (const p of parts) {
                        if (typeof p?.text === "string" && p.text) {
                          send("delta", { text: p.text });
                        }
                      }
                    }
                    const chunks = cand?.groundingMetadata?.groundingChunks;
                    if (Array.isArray(chunks)) {
                      for (const c of chunks) {
                        const uri = c?.web?.uri;
                        const title = c?.web?.title || "Source";
                        if (uri && !seenUris.has(uri)) {
                          seenUris.add(uri);
                          send("source", { uri, title });
                        }
                      }
                    }
                  } catch {
                    /* partial — skip */
                  }
                }
              }
              send("done", { sources: seenUris.size });
            } catch (err) {
              send("error", {
                error: err instanceof Error ? err.message : "stream failed",
              });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
