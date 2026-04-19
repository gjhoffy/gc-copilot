# GC-COPILOT SECURITY FIXES - IMPLEMENTATION GUIDE

## Quick Fix Priority Order
1. ✅ Fix API key exposure (5 minutes)
2. ✅ Restrict CORS (10 minutes)
3. ✅ Add input validation (20 minutes)
4. ✅ Add rate limiting (30 minutes)
5. ✅ Add security headers (15 minutes)

---

## FIX #1: MOVE API KEY OUT OF URL (CRITICAL)

### BEFORE (Vulnerable):
```typescript
// api/brain.ts - LINE 175
const url = `${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

const response = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(reqBody),
});
```

### AFTER (Secure):
```typescript
// api/brain.ts - LINE 175
const url = `${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse`;

const response = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-goog-api-key": apiKey,
  },
  body: JSON.stringify(reqBody),
});
```

**Why:** API keys in URLs are logged everywhere (proxies, CDN, server logs). Headers are more secure and standard practice for API authentication.

---

## FIX #2: RESTRICT CORS (CRITICAL)

### BEFORE (Vulnerable):
```typescript
// api/brain.ts - LINE 111
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
```

### AFTER (Secure):
```typescript
// api/brain.ts - TOP OF FILE, after imports
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean);

if (ALLOWED_ORIGINS.length === 0) {
  throw new Error("FATAL: ALLOWED_ORIGINS environment variable not configured");
}

function getCorsHeaders(origin?: string | null) {
  const isAllowed = origin && ALLOWED_ORIGINS.some(allowed => 
    new RegExp(allowed.replace(/\*/g, ".*")).test(origin)
  );
  
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token",
    "Access-Control-Allow-Credentials": "true",
  };
}

// UPDATE LINE 111:
export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin");
  const cors = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  // ... rest of function, replace all `cors` references with the new `cors` variable
}
```

### Configuration (.env):
```
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com,https://*.yourdomain.com
```

**Why:** Wildcard CORS allows any website to call your API. Restricting it prevents unauthorized access.

---

## FIX #3: ADD INPUT VALIDATION (HIGH)

### BEFORE (Vulnerable):
```typescript
// api/brain.ts - LINE 140
const userPrompt = (body.prompt || "").trim();
if (!userPrompt) {
  return new Response(JSON.stringify({ error: "Empty prompt" }), {
    status: 400,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

const mode = detectMode(userPrompt, body.forcedMode);
```

### AFTER (Secure):
```typescript
// api/brain.ts - TOP OF FILE, after imports
import { z } from "zod";

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

// UPDATE LINE 125 - where body is parsed:
let body: RequestBody;
try {
  body = RequestBodySchema.parse(await req.json());
} catch (err) {
  if (err instanceof z.ZodError) {
    return new Response(
      JSON.stringify({ 
        error: "Invalid request format",
        details: err.errors.map(e => `${e.path.join(".")}: ${e.message}`),
      }),
      { status: 400, headers: { "Content-Type": "application/json", ...cors } }
    );
  }
  throw err;
}

// Remove old validation, now use validated body directly:
const userPrompt = body.prompt;
const mode = detectMode(userPrompt, body.forcedMode);
const framerFields = body.framerFields;
```

**Why:** Validates all inputs at entry point. Prevents injection, DOS, and malformed requests.

---

## FIX #4: ADD RATE LIMITING (HIGH)

### Installation:
```bash
bun add @upstash/ratelimit @upstash/redis
```

### Implementation:
```typescript
// api/brain.ts - TOP OF FILE, after imports
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Verify Upstash env vars are set
if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  console.warn("UPSTASH_REDIS_* not configured - rate limiting disabled");
}

const redis = process.env.UPSTASH_REDIS_REST_URL 
  ? Redis.fromEnv() 
  : null;

const ratelimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"), // 10 requests per hour per IP
}) : null;

// UPDATE handler function - ADD AFTER cors setup, BEFORE body parsing:
export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin");
  const cors = getCorsHeaders(origin);

  // ↓ ADD THIS SECTION ↓
  if (ratelimit && req.method === "POST") {
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    try {
      const { success, pending, reset } = await ratelimit.limit(ip);
      
      if (!success) {
        const resetDate = new Date(reset * 1000).toISOString();
        return new Response(
          JSON.stringify({ 
            error: "Rate limit exceeded. Try again after " + resetDate,
            retryAfter: Math.ceil((reset * 1000 - Date.now()) / 1000),
          }),
          { 
            status: 429, 
            headers: { 
              "Content-Type": "application/json",
              "Retry-After": Math.ceil((reset * 1000 - Date.now()) / 1000).toString(),
              ...cors,
            } 
          }
        );
      }
    } catch (err) {
      console.error("Rate limiter error:", err);
      // Continue on rate limiter failure
    }
  }
  // ↑ END RATE LIMITING SECTION ↑

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  // ... rest of handler
}
```

### Vercel Configuration (vercel.json):
```json
{
  "env": {
    "UPSTASH_REDIS_REST_URL": "@upstash_redis_rest_url",
    "UPSTASH_REDIS_REST_TOKEN": "@upstash_redis_rest_token"
  }
}
```

**Why:** Prevents API quota exhaustion via DOS attacks. Limits requests per IP.

---

## FIX #5: ADD SECURITY HEADERS (HIGH)

### Implementation:
```typescript
// api/brain.ts - TOP OF FILE, after imports
function getSecurityHeaders() {
  return {
    "Content-Security-Policy": "default-src 'none'; script-src 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };
}

// UPDATE handler function - combine with CORS headers:
export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin");
  const cors = getCorsHeaders(origin);
  const securityHeaders = getSecurityHeaders();
  const headers = { ...cors, ...securityHeaders };

  // ... rest of function, replace all header references with `headers`
}
```

**Why:** Prevents XSS, clickjacking, MIME sniffing, and enforces HTTPS.

---

## FIX #6: SANITIZE ERROR MESSAGES (HIGH)

### BEFORE (Vulnerable):
```typescript
// api/brain.ts - ERROR HANDLERS
catch (err) {
  return new Response(
    JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
    { status: 500, headers: { "Content-Type": "application/json", ...cors } },
  );
}
```

### AFTER (Secure):
```typescript
// api/brain.ts - ERROR HANDLERS
catch (err) {
  const isProduction = process.env.NODE_ENV === "production";
  const errorMessage = isProduction 
    ? "An error occurred processing your request" 
    : err instanceof Error ? err.message : "Unknown error";
  
  // Log the real error securely (to your monitoring service)
  console.error("[API Error]", {
    timestamp: new Date().toISOString(),
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    ip: req.headers.get("x-forwarded-for"),
  });
  
  return new Response(
    JSON.stringify({ error: errorMessage }),
    { status: 500, headers: { "Content-Type": "application/json", ...cors } }
  );
}
```

**Why:** Doesn't leak internal system details to attackers.

---

## COMPLETE FIXED api/brain.ts SKELETON

Here's the structure after all fixes:

```typescript
// api/brain.ts
import { z } from "zod";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ============ CONFIGURATION ============
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_FALLBACKS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
const TAVILY_BASE = "https://api.tavily.com/search";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean);
if (ALLOWED_ORIGINS.length === 0) {
  throw new Error("FATAL: ALLOWED_ORIGINS environment variable not configured");
}

// ============ VALIDATION ============
const RequestBodySchema = z.object({
  prompt: z.string()
    .min(1, "Prompt cannot be empty")
    .max(3000, "Prompt exceeds maximum length")
    .trim(),
  forcedMode: z.enum(["market", "blog", "page", "audit", "framer", "chat"]).optional(),
  framerFields: z.string().max(5000).optional(),
});

type RequestBody = z.infer<typeof RequestBodySchema>;

// ============ RATE LIMITING ============
const redis = process.env.UPSTASH_REDIS_REST_URL ? Redis.fromEnv() : null;
const ratelimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"),
}) : null;

// ============ SECURITY HELPERS ============
function getCorsHeaders(origin?: string | null) {
  const isAllowed = origin && ALLOWED_ORIGINS.some(allowed =>
    new RegExp(allowed.replace(/\*/g, ".*")).test(origin)
  );
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token",
    "Access-Control-Allow-Credentials": "true",
  };
}

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

// ============ HANDLER ============
export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin");
  const cors = getCorsHeaders(origin);
  const security = getSecurityHeaders();
  const headers = { ...cors, ...security, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers }
    );
  }

  try {
    // ---- RATE LIMIT CHECK ----
    if (ratelimit) {
      const ip = req.headers.get("x-forwarded-for") || "unknown";
      const { success, reset } = await ratelimit.limit(ip);
      if (!success) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded" }),
          { status: 429, headers }
        );
      }
    }

    // ---- VALIDATE INPUT ----
    let body: RequestBody;
    try {
      body = RequestBodySchema.parse(await req.json());
    } catch (err) {
      if (err instanceof z.ZodError) {
        return new Response(
          JSON.stringify({ error: "Invalid request", details: err.errors }),
          { status: 400, headers }
        );
      }
      throw err;
    }

    // ---- CHECK API KEYS ----
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers }
      );
    }

    // ---- PROCESS REQUEST (rest of your logic) ----
    // ... your existing logic here ...
    
    return new Response(stream, { headers });

  } catch (err) {
    const isProduction = process.env.NODE_ENV === "production";
    const errorMessage = isProduction
      ? "An error occurred processing your request"
      : err instanceof Error ? err.message : "Unknown error";

    console.error("[API Error]", {
      timestamp: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    });

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers }
    );
  }
}

export const config = { runtime: "edge" };
```

---

## ADDITIONAL FIXES FOR Client-Side

### FIX #7: VALIDATE FRAMER FIELDS (MEDIUM)

```typescript
// src/components/MissionControl.tsx - ADD NEW FUNCTION:

const FIELD_NAME_REGEX = /^[a-zA-Z0-9_\-()]+$/;
const MAX_FIELDS = 30;
const MAX_FIELD_LENGTH = 100;

function validateFramerFields(input: string): boolean {
  const lines = input.trim().split('\n').filter(l => l.trim());
  if (lines.length === 0) return true; // Empty is OK
  if (lines.length > MAX_FIELDS) return false;

  return lines.every(line => {
    const [name] = line.split(/\s*\(/).map(s => s.trim());
    return name &&
           name.length <= MAX_FIELD_LENGTH &&
           FIELD_NAME_REGEX.test(name);
  });
}

// UPDATE the setFramerFields call:
const handleFramerFieldsChange = (newValue: string) => {
  if (validateFramerFields(newValue)) {
    setFramerFields(newValue);
    localStorage.setItem("gigabrain.framerFields", newValue);
  }
  // Silently reject invalid input
};

// In JSX:
<textarea
  value={framerFields}
  onChange={(e) => handleFramerFieldsChange(e.target.value)}
  // ... rest of props
/>
```

---

## FINAL VERIFICATION CHECKLIST

After applying all fixes:

```bash
# 1. Type check
bun run tsc --noEmit

# 2. Lint
bun run lint

# 3. Test rate limiting (local)
for i in {1..15}; do
  curl -X POST http://localhost:8080/api/brain \
    -H "Content-Type: application/json" \
    -d '{"prompt":"test"}' \
    2>/dev/null | jq .
done
# Should see rate limit error on request 11+

# 4. Test CORS rejection
curl -X OPTIONS https://gc-copilot.vercel.app/api/brain \
  -H "Origin: https://evil.com" \
  -v
# Should NOT have "Access-Control-Allow-Origin: *"

# 5. Test error sanitization
curl -X POST https://gc-copilot.vercel.app/api/brain \
  -H "Content-Type: application/json" \
  -d '{"prompt":"invalid"}' \
  -H "NODE_ENV: production" \
  2>/dev/null | jq .
# Should return "An error occurred processing your request"
```

---

## Deployment Steps

1. **Set environment variables in Vercel:**
   - `ALLOWED_ORIGINS=https://yourdomain.com`
   - `UPSTASH_REDIS_REST_URL=<your-upstash-url>`
   - `UPSTASH_REDIS_REST_TOKEN=<your-upstash-token>`
   - `NODE_ENV=production`

2. **Commit fixed code:**
   ```bash
   git add -A
   git commit -m "security: fix critical vulnerabilities - api keys, cors, validation, rate limiting"
   git push origin main
   ```

3. **Verify deployment:**
   ```bash
   # Monitor Vercel logs
   vercel logs --follow

   # Test API
   curl -X POST https://gc-copilot.vercel.app/api/brain \
     -H "Origin: https://yourdomain.com" \
     -H "Content-Type: application/json" \
     -d '{"prompt":"test","forcedMode":"chat"}'
   ```

4. **Monitor for issues:**
   - Check Vercel dashboard for errors
   - Monitor API usage
   - Review Upstash rate limit metrics

---

## Timeline Estimate

| Task | Time | Priority |
|------|------|----------|
| Fix API key URL → header | 5 min | 🔴 CRITICAL |
| Fix CORS wildcard | 10 min | 🔴 CRITICAL |
| Add input validation | 20 min | 🔴 CRITICAL |
| Add rate limiting | 30 min | 🔴 CRITICAL |
| Add security headers | 15 min | 🔴 CRITICAL |
| Sanitize errors | 10 min | 🟡 HIGH |
| Validate Framer fields | 15 min | 🟡 HIGH |
| **Total** | **~105 minutes** | |

---

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Google API Security](https://cloud.google.com/docs/authentication)
- [Upstash Rate Limiting](https://upstash.com/docs/redis/features/ratelimiting)
- [Vercel Security Best Practices](https://vercel.com/guides/how-to-secure-your-app-on-vercel)
