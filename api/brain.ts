// Vercel Node serverless function: POST /api/brain
// Holds Gemini + Tavily logic. Reads GEMINI_API_KEY and TAVILY_API_KEY from env.

import { z } from "zod";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { composePrompt, getCompositionForMode, type PromptComposition } from "../lib/prompts";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_FALLBACKS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
const TAVILY_BASE = "https://api.tavily.com/search";

// ============ SECURITY: CORS WHITELIST ============
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://localhost:3000").split(",").filter(Boolean);

function getCorsHeaders(origin?: string | null) {
  const isAllowed = origin && ALLOWED_ORIGINS.some(allowed =>
    new RegExp("^" + allowed.replace(/\*/g, ".*") + "$").test(origin)
  );
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
  };
}

// ============ SECURITY: HEADERS ============
function getSecurityHeaders() {
  return {
    "Content-Security-Policy": "default-src 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };
}

// ============ SECURITY: INPUT VALIDATION ============
const RequestBodySchema = z.object({
  prompt: z.string()
    .min(1, "Prompt cannot be empty")
    .max(3000, "Prompt exceeds maximum length of 3000 characters")
    .trim(),
  forcedMode: z.enum(["market", "blog", "page", "audit", "framer", "chat"]).optional(),
  framerFields: z.string()
    .max(5000, "Framer fields exceed maximum length")
    .optional(),
});

type RequestBody = z.infer<typeof RequestBodySchema>;

// ============ SECURITY: RATE LIMITING ============
const redis = process.env.UPSTASH_REDIS_REST_URL 
  ? Redis.fromEnv() 
  : null;

const ratelimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"), // 10 requests per hour per IP
}) : null;

if (!redis && process.env.NODE_ENV === "production") {
  console.warn("⚠️ WARNING: Rate limiting disabled (Upstash Redis not configured)");
}

const LOCALE = `Primary service area: Doylestown, PA (ZIPs 18901, 18902).
Secondary: Buckingham, New Hope (18938), Newtown (18940), Warrington (18976), Furlong.
County: Bucks County, Pennsylvania.`;

// ============ MODULAR PROMPT SYSTEM ============
// System prompt is now composed from reusable modules
function buildSystemPrompt(mode: BrainMode): string {
  const composition = getCompositionForMode(mode);
  return composePrompt(composition);
}

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
  const origin = req.headers.get("Origin");
  const cors = getCorsHeaders(origin);
  const securityHeaders = getSecurityHeaders();
  const headers = { 
    ...cors, 
    ...securityHeaders,
    "Content-Type": "application/json" 
  };

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  }

  try {
    // ============ SECURITY: RATE LIMITING ============
    if (ratelimit) {
      const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
      try {
        const { success, reset } = await ratelimit.limit(ip);
        
        if (!success) {
          const resetDate = new Date(reset * 1000).toISOString();
          return new Response(
            JSON.stringify({ 
              error: "Rate limit exceeded. Try again later.",
              retryAfter: Math.ceil((reset * 1000 - Date.now()) / 1000),
            }),
            { 
              status: 429, 
              headers: {
                ...headers,
                "Retry-After": Math.ceil((reset * 1000 - Date.now()) / 1000).toString(),
              }
            }
          );
        }
      } catch (err) {
        console.error("Rate limiter error:", err);
        // Continue on rate limiter failure (fail open)
      }
    }

    // ============ SECURITY: INPUT VALIDATION ============
    let body: RequestBody;
    try {
      const rawBody = await req.json();
      body = RequestBodySchema.parse(rawBody);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return new Response(
          JSON.stringify({ 
            error: "Invalid request format",
            details: err.errors.map(e => `${e.path.join(".")}: ${e.message}`),
          }),
          { status: 400, headers }
        );
      }
      return new Response(
        JSON.stringify({ error: "Request body must be valid JSON" }),
        { status: 400, headers }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers }
      );
    }

    const tavilyKey = process.env.TAVILY_API_KEY;
    const userPrompt = body.prompt;
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

    // Build modular system prompt based on detected mode
    const systemPrompt = buildSystemPrompt(mode);

    const reqBody = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
      generationConfig: { temperature: 0.55, maxOutputTokens: 6144 },
    };

    let lastErr = "";
    for (const model of MODEL_FALLBACKS) {
      try {
        // ============ SECURITY: API KEY MOVED TO HEADER ============
        const url = `${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse`;

        const response = await fetch(url, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,  // ✅ SECURE: Key in header, not URL
          },
          body: JSON.stringify(reqBody),
        });

        if (!response.ok) {
          lastErr = `[${model} ${response.status}]`;
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
            ...headers
          }
        });

      } catch (error) {
        lastErr = `[${model}] Request failed`;
      }
    }

    return new Response(
      JSON.stringify({ error: "Service temporarily unavailable. Please try again." }),
      { status: 502, headers }
    );
  } catch (err) {
    const isProduction = process.env.NODE_ENV === "production";
    const errorMessage = isProduction 
      ? "An error occurred processing your request" 
      : err instanceof Error ? err.message : "Unknown error";

    // Log the real error securely (without exposing to client)
    console.error("[API Error]", {
      timestamp: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
      ip: req.headers.get("x-forwarded-for"),
    });

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers }
    );
  }
}

export const config = { runtime: "edge" };
