// Client-side brain: posts to /api/brain (Vercel serverless function).
 
export type BrainMode = "market" | "blog" | "page" | "audit" | "chat";
 
const MODE_LABELS: Record<BrainMode, string> = {
  market: "Market Recon",
  blog: "Content Factory",
  page: "Landing Page",
  audit: "Site Audit",
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
  onChunk?: (chunk: BrainResult) => void;
}): Promise<BrainResult> {
  const endpoint = getBrainEndpoint();
 
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: input.prompt,
      forcedMode: input.forcedMode,
    }),
  });
 
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let parsedMessage = "";
    try {
      const json = JSON.parse(raw) as { error?: string };
      parsedMessage = json?.error ?? "";
    } catch {
      // use raw as-is
    }
    throw new BrainError(parsedMessage || `Brain request failed (${res.status})`, {
      status: res.status,
      body: raw,
      endpoint,
    });
  }
 
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
 
        if (input.onChunk) {
          input.onChunk({
            ...chunk,
            text: fullText,
          });
        }
 
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
