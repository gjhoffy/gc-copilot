import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { runCopilot } from "@/lib/gemini";

type Mode = "market" | "page" | "audit" | "framer";

const FIELD_CONFIG: Record<
  Mode,
  { title: string; tag: string; fields: { key: string; label: string; placeholder: string; textarea?: boolean }[] }
> = {
  market: {
    title: "Analyze My Market",
    tag: "01 / RECON",
    fields: [
      { key: "city", label: "City / Metro", placeholder: "e.g. Austin, TX" },
      { key: "services", label: "Services Offered", placeholder: "interior repaint, cabinet refinish, full GC remodel" },
    ],
  },
  page: {
    title: "Write My Page",
    tag: "02 / DEPLOY",
    fields: [
      { key: "neighborhood", label: "Neighborhood", placeholder: "e.g. Tarrytown" },
      { key: "city", label: "City", placeholder: "e.g. Austin, TX" },
      { key: "service", label: "Service", placeholder: "e.g. Interior House Painting" },
      { key: "angle", label: "Brand Angle (optional)", placeholder: "e.g. licensed GC, 7-day finish guarantee" },
    ],
  },
  audit: {
    title: "Audit My Framer Site",
    tag: "03 / INSPECT",
    fields: [
      { key: "url", label: "Framer Site URL", placeholder: "https://yoursite.framer.website" },
    ],
  },
  framer: {
    title: "Framer CMS Formatter",
    tag: "04 / FORMAT",
    fields: [
      { key: "topic", label: "Page Topic", placeholder: "e.g. Exterior Painting in Westlake" },
      {
        key: "fields",
        label: "Paste your Framer CMS field names (one per line)",
        placeholder: "title (max 60)\nmeta (max 155)\nslug\nhero_headline\nhero_alt\nfaq_schema",
        textarea: true,
      },
    ],
  },
};

export function CopilotPanel({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const cfg = FIELD_CONFIG[mode];
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ text: string; sources: { title: string; uri: string }[] } | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await runCopilot({ data: { mode, payload: values } });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8 border-b-2 border-border pb-4">
          <div>
            <p className="font-mono text-xs text-primary tracking-widest">{cfg.tag}</p>
            <h2 className="text-3xl md:text-5xl mt-1">{cfg.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="font-mono text-sm border-2 border-border px-4 py-2 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
          >
            [ ESC ]
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Inputs */}
          <div className="space-y-4">
            {cfg.fields.map((f) => (
              <div key={f.key}>
                <label className="block font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  &gt; {f.label}
                </label>
                {f.textarea ? (
                  <textarea
                    value={values[f.key] || ""}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    rows={8}
                    className="w-full bg-input border-2 border-border px-3 py-2 font-mono text-sm focus:border-primary outline-none resize-y"
                  />
                ) : (
                  <input
                    value={values[f.key] || ""}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    className="w-full bg-input border-2 border-border px-3 py-2 font-mono text-sm focus:border-primary outline-none"
                  />
                )}
              </div>
            ))}
            <button
              onClick={submit}
              disabled={loading}
              className="w-full bg-primary text-primary-foreground font-display uppercase text-lg py-4 border-2 border-primary brutal-shadow-light hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-wait"
            >
              {loading ? "// PROCESSING..." : "▶ EXECUTE"}
            </button>
            {error && (
              <div className="border-2 border-destructive bg-destructive/10 p-3 font-mono text-xs text-destructive">
                ERROR: {error}
              </div>
            )}
          </div>

          {/* Output */}
          <div className="border-2 border-border bg-card min-h-[400px] p-5">
            <div className="flex items-center gap-2 border-b border-border pb-2 mb-4">
              <span className="w-2 h-2 bg-primary animate-pulse" />
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                {loading ? "Streaming output..." : result ? "Output" : "Standby"}
              </span>
            </div>
            {!result && !loading && (
              <p className="font-mono text-xs text-muted-foreground">
                // Awaiting input. Fill the fields and execute.
              </p>
            )}
            {loading && (
              <div className="font-mono text-xs text-muted-foreground space-y-2">
                <p>&gt; Connecting to Gemini 2.5 Flash...</p>
                <p>&gt; Grounding via Google Search...</p>
                <p>&gt; Applying 2026 SEO heuristics...</p>
                <p>&gt; Optimizing for Trust Velocity + AIO...</p>
              </div>
            )}
            {result && (
              <>
                <article className="prose prose-sm prose-invert max-w-none font-body
                  prose-headings:font-display prose-headings:uppercase prose-headings:text-foreground
                  prose-h1:text-2xl prose-h2:text-xl prose-h2:border-b-2 prose-h2:border-primary prose-h2:pb-1
                  prose-h3:text-base prose-h3:text-primary
                  prose-strong:text-primary prose-strong:font-semibold
                  prose-a:text-primary prose-a:underline
                  prose-code:bg-secondary prose-code:px-1 prose-code:text-primary prose-code:before:content-none prose-code:after:content-none
                  prose-pre:bg-secondary prose-pre:border prose-pre:border-border prose-pre:text-xs
                  prose-table:font-mono prose-table:text-xs prose-th:bg-secondary prose-th:text-primary
                  prose-li:marker:text-primary">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.text}</ReactMarkdown>
                </article>
                {result.sources.length > 0 && (
                  <div className="mt-6 border-t-2 border-border pt-4">
                    <p className="font-mono text-xs uppercase tracking-wider text-primary mb-2">
                      ▣ Grounded Sources ({result.sources.length})
                    </p>
                    <ul className="space-y-1">
                      {result.sources.map((s, i) => (
                        <li key={i} className="font-mono text-xs">
                          <a
                            href={s.uri}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-primary underline"
                          >
                            [{String(i + 1).padStart(2, "0")}] {s.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <button
                  onClick={() => navigator.clipboard.writeText(result.text)}
                  className="mt-4 font-mono text-xs border border-border px-3 py-1 hover:bg-primary hover:text-primary-foreground hover:border-primary"
                >
                  ⧉ COPY MARKDOWN
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
