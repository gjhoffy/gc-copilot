// Vercel Edge Function: /api/brain
import { z } from "zod";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { composePrompt, getCompositionForMode } from "./prompts";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_FALLBACKS = ["gemini-2.0-flash", "gemini-1.5-flash"];
const TAVILY_BASE = "https://api.tavily.com/search";

// 2. OPEN CORS (Prevents the 500 error when testing from localhost or new domains)
function getCorsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-goog-api-key",
  };
}

const RequestBodySchema = z.object({
  prompt: z.string().min(1).max(3000),
  forcedMode: z.enum(["market", "blog", "page", "audit", "framer", "chat"]).optional(),
  framerFields: z.string().max(5000).optional(),
});

const redis = process.env.UPSTASH_REDIS_REST_URL ? Redis.fromEnv() : null;
const ratelimit = redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "1 h") }) : null;

function detectMode(prompt: string, forced?: string): string {
  if (forced) return forced;
  const p = prompt.toLowerCase();
  if (/\bblog|article|post/.test(p)) return "blog";
  if (/\baudit|review/.test(p)) return "audit";
  if (/\bcms|framer/.test(p)) return "framer";
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
    if (ratelimit) {
      const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
      const { success } = await ratelimit.limit(ip);
      if (!success) return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: cors });
    }

    const rawBody = await req.json();
    const result = RequestBodySchema.safeParse(rawBody);
    if (!result.success) return new Response(JSON.stringify({ error: "Input" }), { status: 400, headers: cors });
    
    const { prompt, forcedMode, framerFields } = result.data;
    const mode = detectMode(prompt, forcedMode) as any;
    
    const geminiKey = process.env.GEMINI_API_KEY;
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (!geminiKey) throw new Error("Missing Key");

    let searchContext = "";
    let searchResults: any[] = [];
    if (mode !== "framer" && tavilyKey) {
      searchResults = await tavilySearch(`${prompt} Bucks County PA 2026`, tavilyKey);
      searchContext = `\n\nSEARCH:\n${searchResults.map(r => r.content).join("\n")}`;
    }

    const composition = getCompositionForMode(mode);
    const systemPrompt = composePrompt(composition);

    const response = await fetch(`${GEMINI_BASE}/${MODEL_FALLBACKS[0]}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: prompt + searchContext }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4000 },
      }),
    });

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
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
              } catch (e) {
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
