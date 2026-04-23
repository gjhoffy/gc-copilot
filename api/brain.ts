// Vercel Edge Function: /api/brain
export const config = { runtime: "edge" };

import { z } from "zod";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { composePrompt, getCompositionForMode } from "./prompts";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_FALLBACKS = ["gemini-3.0-flash", "gemini-2.5-flash-latest"];
const TAVILY_BASE = "https://api.tavily.com/search";

function getCorsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-goog-api-key",
  };
}

const RequestBodySchema = z.object({
  prompt: z.string().min(1).max(3000),
  forcedMode: z.enum(["market", "blog", "page", "audit", "chat"]).optional(),
});

// Redis/ratelimit initialized inside handler to avoid cold-start crashes
function getRedisAndRatelimit() {
  try {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return { redis: null, ratelimit: null };
    const redis = Redis.fromEnv();
    const ratelimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "1 h") });
    return { redis, ratelimit };
  } catch {
    return { redis: null, ratelimit: null };
  }
}

function detectMode(prompt: string, forced?: string): string {
  if (forced) return forced;
  const p = prompt.toLowerCase();
  if (/\bblog|article|post/.test(p)) return "blog";
  if (/\baudit|review/.test(p)) return "audit";
  if (/\bpage/.test(p)) return "page";
  if (/\bmarket|competitor/.test(p)) return "market";
  return "chat";
}

async function tavilySearch(query: string, apiKey: string) {
  try {
    const res = await fetch(TAVILY_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query, max_results: 5 }),
    });
    const json = await res.json() as any;
    return (json.results || []).map((r: any) => ({ title: r.title, uri: r.url, content: r.content }));
  } catch { return []; }
}

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin");
  const cors = getCorsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  try {
    const { ratelimit } = getRedisAndRatelimit();
    if (ratelimit) {
      const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
      const { success } = await ratelimit.limit(ip);
      if (!success) return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: cors });
    }

    const rawBody = await req.json();
    const result = RequestBodySchema.safeParse(rawBody);
    if (!result.success) return new Response(JSON.stringify({ error: "Input" }), { status: 400, headers: cors });

    const { prompt, forcedMode } = result.data;
    const mode = detectMode(prompt, forcedMode) as any;

    const geminiKey = process.env.GEMINI_API_KEY;
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (!geminiKey) throw new Error("Missing GEMINI_API_KEY");

    // FIX 1: Mode-aware Tavily query — only append local geo suffix for local-intent modes
    let searchContext = "";
    let searchResults: any[] = [];
    if (tavilyKey) {
      const localModes = ["market", "blog", "page", "audit", "chat"];
      const searchQuery = localModes.includes(mode)
        ? `${prompt} Bucks County PA 2026`
        : prompt;
      searchResults = await tavilySearch(searchQuery, tavilyKey);
    }

    // FIX 2: Structured search context with clear delimiters so Gemini recognizes it as grounding data
    if (searchResults.length > 0) {
      searchContext = `\n\n---\nLIVE SEARCH RESULTS (use these as grounding, do not ignore):\n${
        searchResults.map((r, i) =>
          `[${i + 1}] ${r.title}\nURL: ${r.uri}\n${r.content}`
        ).join("\n\n")
      }\n---`;
    }

    const composition = getCompositionForMode(mode);
    const systemPrompt = composePrompt(composition);

    // Try each model in order until one succeeds — actual fallback logic
    const geminiBody = JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: prompt + searchContext }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4000 },
    });

    let geminiRes: Response | null = null;
    let lastError = "";
    for (const model of MODEL_FALLBACKS) {
      const res = await fetch(`${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
        body: geminiBody,
      });
      // 429 = quota exhausted, 404 = model not found — both are worth trying next model
      if (res.ok) {
        geminiRes = res;
        break;
      }
      lastError = `Gemini error ${res.status} (${model}): ${await res.text()}`;
      if (res.status !== 429 && res.status !== 404) break; // don't retry on auth/bad request errors
    }

    if (!geminiRes) throw new Error(lastError);

    const stream = new ReadableStream({
      async start(controller) {
        const reader = geminiRes.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const cleanLine = line.replace(/^data:\s*/, "").trim();
              if (!cleanLine) continue;

              try {
                const json = JSON.parse(cleanLine);
                const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                  controller.enqueue(encoder.encode(JSON.stringify({ text, mode }) + "\n"));
                }
              } catch {
                // ignore malformed SSE lines
              }
            }
          }

          controller.enqueue(
            encoder.encode(JSON.stringify({ done: true, sources: searchResults }) + "\n")
          );
        } catch (error) {
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...cors,
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}