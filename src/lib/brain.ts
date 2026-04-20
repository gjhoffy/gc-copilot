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

export type BrainResult = {
  text: string;
  sources?: { title: string; uri: string }[];
  mode?: BrainMode;
  model?: string;
  done?: boolean;
};

function getBrainEndpoint() {
  const configured = import.meta.env.VITE_BRAIN_API_URL?.trim();

  if (!configured) {
    return "/api/brain";
  }

  return configured.endsWith("/api/brain")
    ? configured
    : `${configured.replace(/\/$/, "")}/api/brain`;
}

export async function runBrain(input: {
  prompt: string;
  forcedMode?: string;
  framerFields?: string;
  onChunk?: (chunk: BrainResult) => void;
}): Promise<BrainResult> {
  const res = await fetch(getBrainEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => null);
    const fallbackMessage =
      res.status === 404
        ? "Brain endpoint not found. Point VITE_BRAIN_API_URL to your Vercel deployment."
        : `Brain request failed (${res.status})`;

    throw new Error((json as { error?: string } | null)?.error || fallbackMessage);
  }

  // Handle streaming response
  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  let fullText = '';
  let finalResult: BrainResult | null = null;

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

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
        console.warn('Failed to parse streaming chunk:', line, e);
      }
    }
  }

  if (!finalResult) {
    throw new Error("No complete response received");
  }

  return finalResult;
}
