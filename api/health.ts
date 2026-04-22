// Health check endpoint for monitoring (Vercel Node.js runtime)
// GET /api/health returns status of critical dependencies

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).end();
    return;
  }

  const checks = {
    gemini: !!process.env.GEMINI_API_KEY,
    tavily: !!process.env.TAVILY_API_KEY,
    redis: !!process.env.UPSTASH_REDIS_REST_URL,
    timestamp: new Date().toISOString(),
  };

  res
    .status(checks.gemini ? 200 : 503)
    .setHeader("Cache-Control", "no-cache, no-store, must-revalidate")
    .json(checks);
}
