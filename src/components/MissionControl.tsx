import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useServerFn } from "@tanstack/react-start";
import { runBrain, getModeLabel, type BrainMode } from "@/lib/brain";

type Source = { title: string; uri: string };
type Run = {
  id: string;
  prompt: string;
  mode: BrainMode | null;
  text: string;
  sources: Source[];
  status: "thinking" | "done" | "error";
  error?: string;
  ms?: number;
};

const MODE_OPTIONS: { value: "auto" | BrainMode; label: string }[] = [
  { value: "auto", label: "AUTO-DETECT" },
  { value: "blog", label: "BLOG" },
  { value: "market", label: "MARKET" },
  { value: "page", label: "PAGE" },
  { value: "audit", label: "AUDIT" },
  { value: "framer", label: "FRAMER CMS" },
  { value: "chat", label: "CHAT" },
];

const QUICK_PROMPTS: { label: string; prompt: string; hint: string }[] = [
  {
    label: "BLOG // LIMEWASH",
    hint: "Content factory",
    prompt:
      "Write a 2026 SEO blog post on limewashing brick exteriors for homeowners in Doylestown, PA. Lean into Bucks County colonial / federal architecture and freeze-thaw realities.",
  },
  {
    label: "MARKET // 18901",
    hint: "Recon brief",
    prompt:
      "Run a 2026 competitive brief for interior repaints + full GC remodels in Doylestown 18901. Top 5 competitors, current price ranges, rising AIO queries, trust gaps to exploit.",
  },
  {
    label: "PAGE // NEW HOPE EXTERIOR",
    hint: "Landing copy",
    prompt:
      "Write the full landing page for exterior painting in New Hope, PA (18938). AIO-extractive, FAQ, JSON-LD, neighborhood proof.",
  },
  {
    label: "AUDIT // FRAMER URL",
    hint: "Paste your URL",
    prompt: "Audit this Framer site for 2026 AIO + Trust Velocity: https://",
  },
];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function loadFramerFields() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("gigabrain.framerFields") || "";
}

export default function MissionControl() {
  const brainFn = useServerFn(runBrain);

  const [prompt, setPrompt] = useState("");
  const [forcedMode, setForcedMode] = useState<"auto" | BrainMode>("auto");
  const [framerFields, setFramerFields] = useState<string>(() => loadFramerFields());
  const [showFieldEditor, setShowFieldEditor] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    localStorage.setItem("gigabrain.framerFields", framerFields);
  }, [framerFields]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void submit();
      }
      if (e.key === "/" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, forcedMode, framerFields]);

  const activeRun = useMemo(
    () => runs.find((r) => r.id === active) ?? runs[0],
    [runs, active],
  );

  async function submit() {
    const p = prompt.trim();
    if (!p) return;
    const id = uid();
    const startedAt = Date.now();
    const newRun: Run = {
      id,
      prompt: p,
      mode: forcedMode === "auto" ? null : forcedMode,
      text: "",
      sources: [],
      status: "thinking",
    };
    setRuns((prev) => [newRun, ...prev]);
    setActive(id);
    setPrompt("");

    try {
      const result = await brainFn({
        data: {
          prompt: p,
          forcedMode: forcedMode === "auto" ? undefined : forcedMode,
          framerFields,
        },
      });
      setRuns((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                text: result.text || "_Brain returned no content. Re-run._",
                sources: result.sources,
                mode: result.mode as BrainMode,
                status: "done",
                ms: Date.now() - startedAt,
              }
            : r,
        ),
      );
    } catch (err) {
      setRuns((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: "error",
                error: err instanceof Error ? err.message : "Unknown error",
                ms: Date.now() - startedAt,
              }
            : r,
        ),
      );
    }
  }

  const isBlogOrFramer =
    forcedMode === "blog" ||
    forcedMode === "framer" ||
    /\bblog|framer field|cms/i.test(prompt);

  return (
    <div className="min-h-screen bg-background text-foreground grid-bg">
      {/* Header */}
      <header className="border-b-2 border-border bg-background/85 backdrop-blur sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hazard-stripes w-9 h-9 shrink-0" />
            <div className="min-w-0">
              <p className="font-display text-base md:text-lg leading-none truncate">
                CONSTRUCTBUILT // GIGA BRAIN
              </p>
              <p className="font-mono text-[10px] text-muted-foreground tracking-widest mt-1">
                v.2026 · BUCKS COUNTY LOCKED · SEARCH-GROUNDED
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3 font-mono text-[10px]">
            <span className="w-2 h-2 bg-primary animate-pulse" />
            <span className="text-muted-foreground">GEMINI 2.5 / GROUNDED</span>
          </div>
        </div>
      </header>

      {/* Body grid */}
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Main column */}
        <main className="min-w-0 flex flex-col gap-5">
          {/* Mission Control bar */}
          <section className="bg-card border-2 border-border">
            <div className="flex items-center justify-between border-b-2 border-border px-4 py-2">
              <div className="flex items-center gap-2 font-mono text-[10px] tracking-widest text-primary">
                <span className="w-1.5 h-1.5 bg-primary" />
                MISSION CONTROL
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={forcedMode}
                  onChange={(e) => setForcedMode(e.target.value as "auto" | BrainMode)}
                  className="bg-background border border-border px-2 py-1 font-mono text-[10px] tracking-widest"
                >
                  {MODE_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowFieldEditor((s) => !s)}
                  className={`font-mono text-[10px] tracking-widest border px-2 py-1 ${
                    framerFields
                      ? "border-primary text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                  title="Saved Framer CMS field names (used for blog + framer modes)"
                >
                  FRAMER FIELDS {framerFields ? "●" : "○"}
                </button>
              </div>
            </div>

            <div className="p-4">
              <textarea
                ref={inputRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Tell the brain what to build. e.g. 'Blog: limewashing brick for Doylestown homeowners' or 'Audit https://mysite.framer.website'"
                rows={4}
                className="w-full bg-background border-2 border-border focus:border-primary outline-none p-3 font-mono text-sm resize-y"
              />

              <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q.label}
                      onClick={() => {
                        setPrompt(q.prompt);
                        inputRef.current?.focus();
                      }}
                      className="font-mono text-[10px] tracking-widest border-2 border-border px-2 py-1.5 hover:border-primary hover:text-primary"
                      title={q.hint}
                    >
                      ▸ {q.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => void submit()}
                  disabled={!prompt.trim()}
                  className="bg-primary text-primary-foreground font-display tracking-wider px-5 py-2.5 disabled:opacity-40 brutal-shadow-light hover:translate-x-[-2px] hover:translate-y-[-2px] transition-transform"
                >
                  EXECUTE →
                </button>
              </div>
              <p className="mt-2 font-mono text-[10px] text-muted-foreground tracking-widest">
                ⌘/CTRL + ENTER · MODE: {forcedMode === "auto" ? "AUTO-DETECT" : forcedMode.toUpperCase()}
                {isBlogOrFramer && !framerFields ? (
                  <>
                    {" · "}
                    <button
                      onClick={() => setShowFieldEditor(true)}
                      className="text-primary underline underline-offset-2"
                    >
                      paste your Framer field names
                    </button>
                  </>
                ) : null}
              </p>
            </div>

            {showFieldEditor && (
              <div className="border-t-2 border-border p-4 bg-background">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-display text-sm">FRAMER CMS FIELD PROFILE</p>
                  <button
                    onClick={() => setShowFieldEditor(false)}
                    className="font-mono text-[10px] tracking-widest text-muted-foreground hover:text-primary"
                  >
                    CLOSE ✕
                  </button>
                </div>
                <p className="font-mono text-[10px] text-muted-foreground tracking-widest mb-2">
                  ONE FIELD PER LINE · OPTIONALLY: NAME (MAX_CHARS)
                </p>
                <textarea
                  value={framerFields}
                  onChange={(e) => setFramerFields(e.target.value)}
                  rows={8}
                  placeholder={`title (60)\nslug\nexcerpt (160)\nhero_alt\nbody_md\nfaq\nschema_jsonld\ntags\npublished_at\nreading_time_min`}
                  className="w-full bg-card border-2 border-border focus:border-primary outline-none p-3 font-mono text-xs resize-y"
                />
                <p className="font-mono text-[10px] text-muted-foreground tracking-widest mt-2">
                  SAVED LOCALLY · USED IN BLOG + FRAMER MODES
                </p>
              </div>
            )}
          </section>

          {/* Output */}
          <section className="bg-card border-2 border-border min-h-[400px]">
            <div className="flex items-center justify-between border-b-2 border-border px-4 py-2">
              <div className="flex items-center gap-2 font-mono text-[10px] tracking-widest">
                <span
                  className={`w-1.5 h-1.5 ${
                    activeRun?.status === "thinking"
                      ? "bg-primary animate-pulse"
                      : activeRun?.status === "error"
                        ? "bg-destructive"
                        : "bg-primary"
                  }`}
                />
                BRAIN OUTPUT
                {activeRun?.mode ? (
                  <span className="text-primary ml-2">
                    [{getModeLabel(activeRun.mode).toUpperCase()}]
                  </span>
                ) : null}
              </div>
              {activeRun?.ms ? (
                <span className="font-mono text-[10px] text-muted-foreground tracking-widest">
                  {(activeRun.ms / 1000).toFixed(1)}s
                </span>
              ) : null}
            </div>

            <div className="p-5 md:p-6">
              {!activeRun ? (
                <EmptyState />
              ) : activeRun.status === "thinking" ? (
                <ThinkingState prompt={activeRun.prompt} />
              ) : activeRun.status === "error" ? (
                <div className="font-mono text-sm text-destructive">
                  ✕ {activeRun.error}
                </div>
              ) : (
                <article className="prose prose-invert max-w-none prose-headings:font-display prose-headings:uppercase prose-headings:tracking-tight prose-h1:text-3xl prose-h2:text-2xl prose-h2:border-b-2 prose-h2:border-border prose-h2:pb-2 prose-h2:mt-8 prose-h3:text-xl prose-pre:bg-background prose-pre:border-2 prose-pre:border-border prose-pre:rounded-none prose-code:text-primary prose-code:before:content-none prose-code:after:content-none prose-strong:text-primary prose-a:text-primary prose-a:underline-offset-4 prose-li:my-1 prose-table:border-2 prose-table:border-border prose-th:bg-background prose-th:font-mono prose-th:text-xs prose-th:uppercase prose-th:tracking-widest prose-th:p-2 prose-th:border prose-th:border-border prose-td:p-2 prose-td:border prose-td:border-border prose-td:text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {activeRun.text}
                  </ReactMarkdown>
                </article>
              )}
            </div>
          </section>

          {/* History */}
          {runs.length > 1 && (
            <section>
              <p className="font-mono text-[10px] tracking-widest text-muted-foreground mb-2">
                // SESSION HISTORY
              </p>
              <ul className="grid gap-1.5">
                {runs.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => setActive(r.id)}
                      className={`w-full text-left flex items-center gap-3 border-2 px-3 py-2 ${
                        active === r.id
                          ? "border-primary bg-card"
                          : "border-border bg-card/50 hover:border-primary/60"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 shrink-0 ${
                          r.status === "thinking"
                            ? "bg-primary animate-pulse"
                            : r.status === "error"
                              ? "bg-destructive"
                              : "bg-muted-foreground"
                        }`}
                      />
                      <span className="font-mono text-[10px] tracking-widest text-primary w-20 shrink-0">
                        [{r.mode ? r.mode.toUpperCase() : "AUTO"}]
                      </span>
                      <span className="text-sm truncate">{r.prompt}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>

        {/* Live Sources sidebar */}
        <aside className="lg:sticky lg:top-[80px] self-start">
          <div className="bg-card border-2 border-border">
            <div className="flex items-center justify-between border-b-2 border-border px-4 py-2">
              <div className="flex items-center gap-2 font-mono text-[10px] tracking-widest text-primary">
                <span
                  className={`w-1.5 h-1.5 ${
                    activeRun?.status === "thinking" ? "bg-primary animate-pulse" : "bg-primary"
                  }`}
                />
                LIVE SOURCES
              </div>
              <span className="font-mono text-[10px] text-muted-foreground tracking-widest">
                {activeRun?.sources.length ?? 0} cited
              </span>
            </div>
            <div className="p-3 max-h-[70vh] overflow-y-auto">
              {!activeRun ? (
                <p className="font-mono text-[10px] text-muted-foreground tracking-widest p-2">
                  AWAITING QUERY. GROUNDED CITATIONS WILL APPEAR HERE.
                </p>
              ) : activeRun.status === "thinking" ? (
                <ul className="space-y-2">
                  {[0, 1, 2, 3].map((i) => (
                    <li
                      key={i}
                      className="h-10 border-2 border-dashed border-border animate-pulse"
                    />
                  ))}
                  <p className="font-mono text-[10px] text-muted-foreground tracking-widest pt-1">
                    SCANNING LIVE WEB · BUCKS COUNTY CONTEXT…
                  </p>
                </ul>
              ) : activeRun.sources.length === 0 ? (
                <p className="font-mono text-[10px] text-muted-foreground tracking-widest p-2">
                  NO EXTERNAL CITATIONS RETURNED FOR THIS RUN.
                </p>
              ) : (
                <ol className="space-y-2">
                  {activeRun.sources.map((s, i) => (
                    <li key={s.uri + i}>
                      <a
                        href={s.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="block border-2 border-border hover:border-primary p-2 group"
                      >
                        <div className="flex items-start gap-2">
                          <span className="font-mono text-[10px] text-primary tracking-widest shrink-0 mt-0.5">
                            [{String(i + 1).padStart(2, "0")}]
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs leading-snug group-hover:text-primary line-clamp-2">
                              {s.title}
                            </p>
                            <p className="font-mono text-[10px] text-muted-foreground truncate mt-0.5">
                              {safeHost(s.uri)}
                            </p>
                          </div>
                        </div>
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          <div className="mt-4 bg-card border-2 border-dashed border-border p-3">
            <p className="font-mono text-[10px] tracking-widest text-primary mb-2">
              // LOCALE LOCK
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Doylestown <span className="text-foreground">18901 / 18902</span> · New Hope{" "}
              <span className="text-foreground">18938</span> · Newtown{" "}
              <span className="text-foreground">18940</span> · Warrington{" "}
              <span className="text-foreground">18976</span> · Buckingham · Furlong · Bucks County, PA.
            </p>
          </div>
        </aside>
      </div>

      <footer className="border-t-2 border-border mt-6">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>© 2026 CONSTRUCTBUILT // GIGA BRAIN</span>
          <span>SPEC: TRUST-VELOCITY · AIO · GROUNDED</span>
          <span className="text-primary">SYSTEM ONLINE ▣</span>
        </div>
      </footer>
    </div>
  );
}

function safeHost(uri: string) {
  try {
    return new URL(uri).host.replace(/^www\./, "");
  } catch {
    return uri.slice(0, 40);
  }
}

function EmptyState() {
  return (
    <div className="py-10 text-center">
      <div className="hazard-stripes w-16 h-16 mx-auto mb-6" />
      <h2 className="font-display text-2xl md:text-3xl mb-2">BRAIN STANDING BY</h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        Type a prompt or hit a quick action. The brain auto-detects intent — blog, market
        recon, landing page, audit, or Framer CMS — and grounds every answer in live 2026
        Bucks County data.
      </p>
    </div>
  );
}

function ThinkingState({ prompt }: { prompt: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 font-mono text-xs text-primary tracking-widest">
        <span className="w-2 h-2 bg-primary animate-pulse" />
        BRAIN ENGAGED · GROUNDING LIVE WEB · 2026 BUCKS COUNTY CONTEXT
      </div>
      <div className="border-2 border-dashed border-border p-3 font-mono text-xs text-muted-foreground">
        ▸ {prompt}
      </div>
      <ul className="space-y-2">
        {[90, 80, 70, 95, 60].map((w, i) => (
          <li
            key={i}
            className="h-3 bg-border animate-pulse"
            style={{ width: `${w}%` }}
          />
        ))}
      </ul>
    </div>
  );
}
