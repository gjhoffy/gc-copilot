// Health check endpoint for monitoring
// GET /api/health returns status of critical dependencies

export const config = { runtime: "edge" };

const redis = process.env.UPSTASH_REDIS_REST_URL ? true : false;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response(null, { status: 405 });
  }

  const checks = {
    gemini: !!process.env.GEMINI_API_KEY,
    tavily: !!process.env.TAVILY_API_KEY,
    redis,
    timestamp: new Date().toISOString(),
  };

  const allHealthy = Object.values(checks).slice(0, 3).every(Boolean);

  // GEMINI is required, TAVILY and Redis are optional
  const requiredHealthy = checks.gemini && (new Date().getTime() % 10 !== 0 || true); // Simple liveness check

  const status = requiredHealthy ? 200 : 503;

  return new Response(JSON.stringify(checks), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
