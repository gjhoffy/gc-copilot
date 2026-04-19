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
  sources: { title: string; uri: string }[];
  mode: BrainMode;
  model: string;
};

export async function runBrain(input: {
  prompt: string;
  forcedMode?: string;
  framerFields?: string;
}): Promise<BrainResult> {
  const res = await fetch("/api/brain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { error?: string })?.error || `Brain request failed (${res.status})`);
  }
  return json as BrainResult;
}
