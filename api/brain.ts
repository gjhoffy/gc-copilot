// Vercel Node serverless function: POST /api/brain
// Holds Gemini + Tavily logic. Reads GEMINI_API_KEY and TAVILY_API_KEY from env.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { composePrompt, getCompositionForMode } from "./prompts.js";

// ============ ENVIRONMENT VALIDATION ============
function validateEnvironment(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!process.env.GEMINI_API_KEY) {
    errors.push("GEMINI_API_KEY environment variable is required. See .env.example");
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_FALLBACKS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"];

type TavilyResult = {
  title: string;
  url: string;
  content: string;
};

type TavilyResponse = {
  results: TavilyResult[];
};
const TAVILY_BASE = "https://api.tavily.com/search";

// ============ SECURITY: CORS WHITELIST (STRICT - NO WILDCARDS) ============
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function getCorsHeaders(origin?: string | null): Record<string, string> {
  // Exact origin matching only - NO regex wildcards to prevent subdomain hijacking
  const isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
  };
}

// ============ SECURITY: HEADERS (HSTS + CSP) ============
function getSecurityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;",
  };
}

// ============ SECURITY: INPUT SANITIZATION ============
function sanitizeFramerFields(input: string): string {
  // Remove potentially dangerous characters while preserving field structure
  // Allow: alphanumeric, spaces, newlines, underscores, parentheses, hyphens, commas
  return input
    .replace(/[<>"'`]/g, "") // Remove quotes and angle brackets
    .replace(/javascript:/gi, "") // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, "") // Remove event handlers (onclick=, onerror=, etc)
    .replace(/\[MODE:/gi, "[MODE") // Prevent prompt injection by breaking [MODE: syntax
    .substring(0, 2000); // Hard limit (reduced from 5000)
}

// ============ SECURITY: INPUT VALIDATION ============
const RequestBodySchema = z.object({
  prompt: z
    .string()
    .min(1, "Prompt cannot be empty")
    .max(3000, "Prompt exceeds maximum length of 3000 characters")
    .trim(),
  forcedMode: z.enum(["market", "blog", "page", "audit", "framer", "chat"]).optional(),
  framerFields: z
    .string()
    .max(2000, "Framer fields exceed maximum length")
    .transform(sanitizeFramerFields)
    .optional(),
});

type RequestBody = z.infer<typeof RequestBodySchema>;

// ============ SECURITY: RATE LIMITING ============
const redis = process.env.UPSTASH_REDIS_REST_URL ? Redis.fromEnv() : null;

const ratelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
    })
  : null;

// ============ MODULAR PROMPT SYSTEM ============
type BrainMode = "market" | "blog" | "page" | "audit" | "framer" | "chat";

function buildSystemPrompt(mode: BrainMode): string {
  const composition = getCompositionForMode(mode);
  return composePrompt(composition);
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
    extra = `\n\nUSER'S FRAMER BLOG CMS FIELDS:\n${framerFields.trim()}`;
  }
  if (mode === "framer" && framerFields?.trim()) {
    extra = `\n\nFRAMER CMS FIELDS TO FILL:\n${framerFields.trim()}`;
  }
  return `[MODE: ${mode}]\n\n${userPrompt}${extra}`;
}

async function tavilySearch(query: string, apiKey: string) {
  try {
    console.log("[brain] Tavily: starting search", { query });
    const fetchPromise = fetch(TAVILY_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "advanced",
        max_results: 6,
      }),
    });
    const res = (await Promise.race([
      fetchPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Tavily search timed out after 5s")), 5000),
      ),
    ])) as Response;
    if (!res.ok) return [];
    const json = (await res.json()) as {
      results?: { title?: string; url?: string; content?: string }[];
    };
    const mapped = (json.results || [])
      .map((r) => ({
        title: r.title || "Source",
        uri: r.url || "",
        content: r.content || "",
      }))
      .filter((r) => r.uri);
    console.log("[brain] Tavily: completed", { count: mapped.length });
    return mapped;
  } catch (err) {
    console.warn("[brain] Tavily: failed or timed out", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

function applyHeaders(res: VercelResponse, headers: Record<string, string>) {
  for (const [k, v] of Object.entries(headers)) {
    if (v) res.setHeader(k, v);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log("[brain] handler: start", { method: req.method, url: req.url });
  const origin = (req.headers.origin as string | undefined) ?? null;
  const cors = getCorsHeaders(origin);
  const securityHeaders = getSecurityHeaders();
  applyHeaders(res, { ...cors, ...securityHeaders });

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    if (ratelimit) {
      const ip = (req.headers["x-forwarded-for"] as string | undefined) || "unknown";
      const { success } = await ratelimit.limit(ip);
      if (!success) {
        res.status(429).json({ error: "Rate limit exceeded" });
        return;
      }
    }

    // Vercel Node parses JSON body automatically when Content-Type is application/json
    const rawBody = req.body ?? {};
    console.log("[brain] body parsed");
    const bodyResult = RequestBodySchema.safeParse(rawBody);

    if (!bodyResult.success) {
      res.status(400).json({
        error: "Invalid request format",
        details: bodyResult.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`),
      });
      return;
    }
    const body = bodyResult.data;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Server config error: GEMINI_API_KEY missing" });
      return;
    }

    const mode = detectMode(body.prompt, body.forcedMode);
    console.log("[brain] mode detected", { mode });
    const fullPrompt = buildPrompt(mode, body.prompt, body.framerFields);

    let searchResults: { title: string; uri: string; content: string }[] = [];
    if (mode !== "framer" && process.env.TAVILY_API_KEY) {
      searchResults = await tavilySearch(
        `${body.prompt} Bucks County PA 2026`,
        process.env.TAVILY_API_KEY,
      );
    } else {
      console.log("[brain] Tavily: skipped", { mode, hasKey: !!process.env.TAVILY_API_KEY });
    }

    const searchContext =
      searchResults.length > 0
        ? `\n\nLIVE SEARCH RESULTS:\n${searchResults.map((r, i) => `[${i + 1}] ${r.title}\n${r.content}`).join("\n\n")}`
        : "";

    const systemPrompt = buildSystemPrompt(mode);
    const reqBody = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: fullPrompt + searchContext }] }],
      generationConfig: { temperature: 0.55, maxOutputTokens: 6144 },
    };

    for (const model of MODEL_FALLBACKS) {
      try {
        console.log("[brain] Gemini: calling", { model });
        const url = `${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(reqBody),
        });

        if (!response.ok) {
          console.warn("[brain] Gemini: non-OK response", { model, status: response.status });
          continue;
        }
        console.log("[brain] Gemini: streaming started", { model });

        // Switch response into streaming NDJSON mode
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.status(200);

        const reader = response.body?.getReader();
        if (!reader) {
          res.end();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data.trim() === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
              if (text) {
                res.write(JSON.stringify({ text, done: false, mode, model }) + "\n");
              }
            } catch (error) {
              console.warn("Failed to parse Gemini streaming chunk:", error);
            }
          }
        }

        res.write(
          JSON.stringify({
            text: "",
            sources: searchResults.map((r) => ({ title: r.title, uri: r.uri })),
            done: true,
            mode,
            model,
          }) + "\n",
        );
        res.end();
        return;
      } catch (error: unknown) {
        console.warn("[brain] Gemini: connection failed", {
          model,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    res.status(502).json({
      error: "Service temporarily unavailable. Please try again in a moment.",
      traceId: Math.random().toString(36).substring(2, 11),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[API Error]", { timestamp: new Date().toISOString(), error: errorMsg });

    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error. Please try again later.",
        traceId: Math.random().toString(36).substring(2, 11),
      });
    } else {
      res.end();
    }
  }
}
