// Vercel Node serverless function: POST /api/brain
// Holds Gemini + Tavily logic. Reads GEMINI_API_KEY and TAVILY_API_KEY from env.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_FALLBACKS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
const TAVILY_BASE = "https://api.tavily.com/search";

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
- You have been provided with live 2026 web search results below. Use them. Cite live 2026 data — local pricing, weather, code/permit notes, competitor signals.
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

type BrainMode = "market" | "blog" | "page" | "audit" | "framer" | "chat";

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

async function tavilySearch(query: string, apiKey: string) {
  try {
    const res = await fetch(TAVILY_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "advanced",
        max_results: 6,
        include_answer: false,
      }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    return (json.results || [])
      .map((r) => ({
        title: r.title || "Source",
        uri: r.url || "",
        content: r.content || "",
      }))
      .filter((r) => r.uri);
  } catch {
    return [];
  }
}

export default async function handler(req: Request): Promise<Response> {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  try {
    const body = (await req.json()) as {
      prompt?: string;
      forcedMode?: string;
      framerFields?: string;
    };

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY is not configured on the server" }),
        { status: 500, headers: { "Content-Type": "application/json", ...cors } },
      );
    }

    const tavilyKey = process.env.TAVILY_API_KEY;
    const userPrompt = (body.prompt || "").trim();
    if (!userPrompt) {
      return new Response(JSON.stringify({ error: "Empty prompt" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    const mode = detectMode(userPrompt, body.forcedMode);
    const fullPrompt = buildPrompt(mode, userPrompt, body.framerFields);

    let searchResults: { title: string; uri: string; content: string }[] = [];
    if (mode !== "framer" && tavilyKey) {
      const searchQuery = `${userPrompt} Bucks County PA 2026`;
      searchResults = await tavilySearch(searchQuery, tavilyKey);
    }

    const searchContext =
      searchResults.length > 0
        ? `\n\nLIVE WEB SEARCH RESULTS (2026):\n${searchResults
            .map((r, i) => `[${i + 1}] ${r.title}\n${r.content}`)
            .join("\n\n")}`
        : "";

    const finalPrompt = fullPrompt + searchContext;

    const reqBody = {
      systemInstruction: { parts: [{ text: SYSTEM_PRIMER }] },
      contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
      generationConfig: { temperature: 0.55, maxOutputTokens: 6144 },
    };

    let lastErr = "";
    for (const model of MODEL_FALLBACKS) {
      try {
        const url = `${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqBody),
        });

        if (!response.ok) {
          lastErr = `[${model} ${response.status}] ${await response.text().catch(() => 'Unknown error')}`;
          continue;
        }

        // Create a streaming response
        const stream = new ReadableStream({
          async start(controller) {
            const reader = response.body?.getReader();
            if (!reader) {
              controller.error(new Error('No response body'));
              return;
            }

            let buffer = '';
            const encoder = new TextEncoder();

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += new TextDecoder().decode(value);
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                      const parsed = JSON.parse(data);
                      const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                      if (text) {
                        const chunk = JSON.stringify({
                          text,
                          done: false,
                          mode,
                          model
                        }) + '\n';
                        controller.enqueue(encoder.encode(chunk));
                      }
                    } catch (e) {
                      // Skip invalid JSON
                    }
                  }
                }
              }

              // Send final chunk with sources
              const sources = searchResults.map((r) => ({ title: r.title, uri: r.uri }));
              const finalChunk = JSON.stringify({
                text: '',
                sources,
                done: true,
                mode,
                model
              }) + '\n';
              controller.enqueue(encoder.encode(finalChunk));
              controller.close();

            } catch (error) {
              controller.error(error);
            }
          }
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            ...cors
          }
        });

      } catch (error) {
        lastErr = `[${model}] ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }

    return new Response(
      JSON.stringify({ error: `Gemini upstream unavailable. ${lastErr}` }),
      { status: 502, headers: { "Content-Type": "application/json", ...cors } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...cors } },
    );
  }
}

export const config = { runtime: "edge" };
