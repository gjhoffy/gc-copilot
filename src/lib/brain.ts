// Client-side brain: posts to /api/brain (Vercel serverless function).

export type BrainMode = "market" | "blog" | "page" | "audit" | "framer" | "chat";

const MODE_LABELS: Record<BrainMode, string> = {
  market: "Market Recon",
  blog: "Content Factory",
  page: "Landing Page",
  audit: "Site Audit",
  framer: "Framer CMS",
  chat: "Strategy Chat",
};

export function getModeLabel(m: BrainMode) {
  return MODE_LABELS[m];
}

export function getBrainEndpoint(): string {
  const override = (import.meta.env.VITE_BRAIN_API_URL as string | undefined)?.trim();
  if (override) return override;
  if (typeof window !== "undefined") return `${window.location.origin}/api/brain`;
  return "/api/brain";
}

export type BrainResult = {
  text: string;
  sources?: { title: string; uri: string }[];
  mode?: BrainMode;
  model?: string;
  done?: boolean;
};

export class BrainError extends Error {
  status: number;
  body: string;
  endpoint: string;
  constructor(message: string, opts: { status: number; body: string; endpoint: string }) {
    super(message);
    this.name = "BrainError";
    this.status = opts.status;
    this.body = opts.body;
    this.endpoint = opts.endpoint;
  }
}

export async function runBrain(input: {
  prompt: string;
  forcedMode?: string;
  framerFields?: string;
  onChunk?: (chunk: BrainResult) => void;
}): Promise<BrainResult> {
  // Development mock - returns fake responses for testing UI
  if (process.env.NODE_ENV === "development") {
    return new Promise((resolve) => {
      const mockResponse: BrainResult = {
        text: `## Mock Response for Development

This is a **mock response** for testing the UI in development mode.

**Your prompt:** "${input.prompt}"

**Detected mode:** ${input.forcedMode || "auto"}

**Mock features:**
- ✅ Streaming simulation
- ✅ Source citations
- ✅ Mode detection
- ✅ Response formatting

To test the real API, deploy to Vercel with \`GEMINI_API_KEY\` and \`TAVILY_API_KEY\` environment variables set.

---

### Sample Content
This would normally contain AI-generated content based on your prompt about Bucks County construction and painting services.

**Key points:**
- Local market analysis
- SEO-optimized content
- Professional contractor insights
- Bucks County specific recommendations

### Sources
- [Bucks County Business Directory](https://example.com)
- [Doylestown Chamber of Commerce](https://example.com)
- [PA Contractor Licensing Board](https://example.com)`,
        sources: [
          { title: "Bucks County Business Directory", uri: "https://example.com" },
          { title: "Doylestown Chamber of Commerce", uri: "https://example.com" },
          { title: "PA Contractor Licensing Board", uri: "https://example.com" },
        ],
        mode: (input.forcedMode as BrainMode) || "chat",
        model: "mock-gemini-2.5-flash",
        done: true,
      };

      // Simulate streaming by calling onChunk multiple times
      if (input.onChunk) {
        const words = mockResponse.text.split(" ");
        let currentText = "";

        words.forEach((word, index) => {
          setTimeout(() => {
            currentText += (index > 0 ? " " : "") + word;
            input.onChunk!({
              ...mockResponse,
              text: currentText,
              done: index === words.length - 1,
            });
          }, index * 50); // 50ms delay between words
        });
      }

      // Resolve after simulated streaming
      setTimeout(() => resolve(mockResponse), 2000);
    });
  }

  // Production - real API call
  const endpoint = getBrainEndpoint();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let parsedMessage = "";
    try {
      const json = JSON.parse(raw) as { error?: string };
      parsedMessage = json?.error ?? "";
    } catch {
      // raw will be used as-is below
    }
    throw new BrainError(parsedMessage || `Brain request failed (${res.status})`, {
      status: res.status,
      body: raw,
      endpoint,
    });
  }

  // Handle streaming response
  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  let fullText = "";
  let finalResult: BrainResult | null = null;

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const chunk: BrainResult = JSON.parse(line.trim());
        if (chunk.text) {
          fullText += chunk.text;
        }

        // Call the chunk callback if provided
        if (input.onChunk) {
          input.onChunk({
            ...chunk,
            text: fullText, // Accumulate text for UI updates
          });
        }

        // Store the final result when done
        if (chunk.done) {
          finalResult = {
            text: fullText,
            sources: chunk.sources || [],
            mode: chunk.mode,
            model: chunk.model,
            done: true,
          };
        }
      } catch (e) {
        console.warn("Failed to parse streaming chunk:", line, e);
      }
    }
  }

  if (!finalResult) {
    throw new Error("No complete response received");
  }

  return finalResult;
}
