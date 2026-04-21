import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { runBrain, getModeLabel, BrainError, type BrainMode } from "@/lib/brain";
import {
  SettingsDialog,
  loadSettings,
  applySettings,
  type AppSettings,
} from "@/components/Settings";

type Source = { title: string; uri: string };
type Run = {
  id: string;
  prompt: string;
  mode: BrainMode | null;
  text: string;
  sources: Source[];
  status: "thinking" | "done" | "error";
  error?: string;
  errorStatus?: number;
  errorBody?: string;
  errorEndpoint?: string;
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
  const [prompt, setPrompt] = useState("");
  const [forcedMode, setForcedMode] = useState<"auto" | BrainMode>("auto");
  const [framerFields, setFramerFields] = useState<string>(() => loadFramerFields());
  const [showFieldEditor, setShowFieldEditor] = useState(false);
  const [runs, setRuns] = useState<Run[]>(() => {
    const initialSettings = loadSettings();
    if (typeof window === "undefined" || !initialSettings.preserveHistory) return [];

    try {
      const saved = localStorage.getItem("gigabrain.history");
      return saved ? (JSON.parse(saved) as Run[]) : [];
    } catch {
      return [];
    }
  });
  const [active, setActive] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(loadSettings());
  const [showSettings, setShowSettings] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const framerFieldsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    applySettings(settings);
  }, [settings]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!settings.preserveHistory) {
      localStorage.removeItem("gigabrain.history");
      return;
    }

    const completedRuns = runs
      .filter((run) => run.status !== "thinking")
      .slice(0, settings.maxHistoryItems);

    localStorage.setItem("gigabrain.history", JSON.stringify(completedRuns));
  }, [runs, settings.preserveHistory, settings.maxHistoryItems]);

  // Debounce framer fields localStorage writes (500ms)
  useEffect(() => {
    if (framerFieldsTimeoutRef.current) {
      clearTimeout(framerFieldsTimeoutRef.current);
    }

    framerFieldsTimeoutRef.current = setTimeout(() => {
      localStorage.setItem("gigabrain.framerFields", framerFields);
      framerFieldsTimeoutRef.current = null;
    }, 500);

    return () => {
      if (framerFieldsTimeoutRef.current) {
        clearTimeout(framerFieldsTimeoutRef.current);
      }
    };
  }, [framerFields]);

  const submit = useCallback(async () => {
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
      const result = await runBrain({
        prompt: p,
        forcedMode: forcedMode === "auto" ? undefined : forcedMode,
        framerFields,
        onChunk: settings.autoStream
          ? (chunk) => {
              setRuns((prev) =>
                prev.map((r) =>
                  r.id === id
                    ? {
                        ...r,
                        text: chunk.text || r.text,
                        sources: chunk.sources ?? r.sources,
                        mode: (chunk.mode as BrainMode | undefined) ?? r.mode,
                        status: chunk.done ? "done" : "thinking",
                        ms: chunk.done ? Date.now() - startedAt : r.ms,
                      }
                    : r,
                ),
              );
            }
          : undefined,
      });
      setRuns((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                text: result.text || "_Brain returned no content. Re-run._",
                sources: result.sources ?? [],
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
                errorStatus: err instanceof BrainError ? err.status : undefined,
                errorBody: err instanceof BrainError ? err.body : undefined,
                errorEndpoint: err instanceof BrainError ? err.endpoint : undefined,
                ms: Date.now() - startedAt,
              }
            : r,
        ),
      );
    }
  }, [prompt, forcedMode, framerFields]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!settings.enableKeyboardShortcuts) return;

      const target = document.activeElement as HTMLElement;
      const isInInput = target?.tagName === "TEXTAREA" || target?.tagName === "INPUT";

      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        if (!isInInput || target?.getAttribute("data-cmd-enter") === "true") {
          e.preventDefault();
          void submit();
        }
      }

      if (e.key === "/" && !isInInput) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings.enableKeyboardShortcuts, submit]);

  const activeRun = useMemo(() => runs.find((r) => r.id === active) ?? runs[0], [runs, active]);

  const isBlogOrFramer =
    forcedMode === "blog" || forcedMode === "framer" || /\bblog|framer field|cms/i.test(prompt);

  return (
    <div className="min-h-screen bg-background text-foreground grid-bg">
      <header className="sticky top-0 z-30 border-b-2 border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="hazard-stripes h-9 w-9 shrink-0" />
            <div className="min-w-0">
              <p className="truncate font-display text-base leading-none md:text-lg">
                CONSTRUCTBUILT // GIGA BRAIN
              </p>
              <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
                v.2026 · BUCKS COUNTY LOCKED · SEARCH-GROUNDED
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-3 font-mono text-[10px] md:flex">
            <span className="h-2 w-2 animate-pulse bg-primary" />
            <span className="text-muted-foreground">GEMINI 2.5 / GROUNDED</span>
            <span className="mx-2 h-1 w-1 bg-border" />
            <button
              onClick={() => setShowSettings(true)}
              className="hover:text-primary transition-colors"
              title="Settings"
            >
              ⚙ SETTINGS
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-4 py-6 md:px-6 lg:grid-cols-[1fr_320px]">
        <main className="min-w-0 flex flex-col gap-5">
          <section className="border-2 border-border bg-card">
            <div className="flex items-center justify-between border-b-2 border-border px-4 py-2">
              <div className="flex items-center gap-2 font-mono text-[10px] tracking-widest text-primary">
                <span className="h-1.5 w-1.5 bg-primary" />
                MISSION CONTROL
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={forcedMode}
                  onChange={(e) => setForcedMode(e.target.value as "auto" | BrainMode)}
                  className="border border-border bg-background px-2 py-1 font-mono text-[10px] tracking-widest"
                >
                  {MODE_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowFieldEditor((s) => !s)}
                  className={`border px-2 py-1 font-mono text-[10px] tracking-widest ${
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
                className="w-full resize-y border-2 border-border bg-background p-3 font-mono text-sm outline-none focus:border-primary"
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q.label}
                      onClick={() => {
                        setPrompt(q.prompt);
                        inputRef.current?.focus();
                      }}
                      className="border-2 border-border px-2 py-1.5 font-mono text-[10px] tracking-widest hover:border-primary hover:text-primary"
                      title={q.hint}
                    >
                      ▸ {q.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => void submit()}
                  disabled={!prompt.trim()}
                  className="brutal-shadow-light bg-primary px-5 py-2.5 font-display tracking-wider text-primary-foreground transition-transform hover:translate-x-[-2px] hover:translate-y-[-2px] disabled:opacity-40"
                >
                  EXECUTE →
                </button>
              </div>
              <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                {settings.enableKeyboardShortcuts && "⌘/CTRL + ENTER · "}MODE:{" "}
                {forcedMode === "auto" ? "AUTO-DETECT" : forcedMode.toUpperCase()}
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
              <div className="border-t-2 border-border bg-background p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-display text-sm">FRAMER CMS FIELD PROFILE</p>
                  <button
                    onClick={() => setShowFieldEditor(false)}
                    className="font-mono text-[10px] tracking-widest text-muted-foreground hover:text-primary"
                  >
                    CLOSE ✕
                  </button>
                </div>
                <p className="mb-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  ONE FIELD PER LINE · OPTIONALLY: NAME (MAX_CHARS)
                </p>
                <textarea
                  value={framerFields}
                  onChange={(e) => setFramerFields(e.target.value)}
                  rows={8}
                  placeholder={`title (60)\nslug\nexcerpt (160)\nhero_alt\nbody_md\nfaq\nschema_jsonld\ntags\npublished_at\nreading_time_min`}
                  className="w-full resize-y border-2 border-border bg-card p-3 font-mono text-xs outline-none focus:border-primary"
                />
                <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  SAVED LOCALLY · USED IN BLOG + FRAMER MODES
                </p>
              </div>
            )}
          </section>

          <section className="min-h-[400px] border-2 border-border bg-card">
            <div className="flex items-center justify-between border-b-2 border-border px-4 py-2">
              <div className="flex items-center gap-2 font-mono text-[10px] tracking-widest">
                <span
                  className={`h-1.5 w-1.5 ${
                    activeRun?.status === "thinking"
                      ? "animate-pulse bg-primary"
                      : activeRun?.status === "error"
                        ? "bg-destructive"
                        : "bg-primary"
                  }`}
                />
                BRAIN OUTPUT
                {activeRun?.mode ? (
                  <span className="ml-2 text-primary">
                    [{getModeLabel(activeRun.mode).toUpperCase()}]
                  </span>
                ) : null}
              </div>
              {settings.showExecutionTime && activeRun?.ms ? (
                <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
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
                <div className="space-y-3 font-mono text-sm">
                  <div className="text-destructive">✕ {activeRun.error}</div>
                  {settings.showBackendError && (activeRun.errorStatus || activeRun.errorBody) ? (
                    <div className="space-y-2 border-2 border-destructive/40 bg-background p-3">
                      <p className="text-[10px] tracking-widest text-destructive">
                        BACKEND ERROR DETAIL
                      </p>
                      {activeRun.errorEndpoint ? (
                        <p className="break-all text-[11px] text-muted-foreground">
                          POST {activeRun.errorEndpoint}
                        </p>
                      ) : null}
                      {activeRun.errorStatus ? (
                        <p className="text-[11px] text-foreground">
                          HTTP {activeRun.errorStatus}
                        </p>
                      ) : null}
                      {activeRun.errorBody ? (
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border border-border bg-card p-2 text-[11px] leading-snug text-foreground">
                          {activeRun.errorBody}
                        </pre>
                      ) : null}
                    </div>
                  ) : null}
                  {!settings.showBackendError ? (
                    <p className="text-[10px] tracking-widest text-muted-foreground">
                      Enable “Show Backend Error” in Settings to inspect the raw response.
                    </p>
                  ) : null}
                </div>
              ) : (
                <article className="prose prose-invert max-w-none prose-headings:font-display prose-headings:uppercase prose-headings:tracking-tight prose-h1:text-3xl prose-h2:mt-8 prose-h2:border-b-2 prose-h2:border-border prose-h2:pb-2 prose-h2:text-2xl prose-h3:text-xl prose-pre:rounded-none prose-pre:border-2 prose-pre:border-border prose-pre:bg-background prose-code:text-primary prose-code:before:content-none prose-code:after:content-none prose-strong:text-primary prose-a:text-primary prose-a:underline-offset-4 prose-li:my-1 prose-table:border-2 prose-table:border-border prose-th:border prose-th:border-border prose-th:bg-background prose-th:p-2 prose-th:font-mono prose-th:text-xs prose-th:uppercase prose-th:tracking-widest prose-td:border prose-td:border-border prose-td:p-2 prose-td:text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeRun.text}</ReactMarkdown>
                </article>
              )}
            </div>
          </section>

          {runs.length > 1 && (
            <section>
              <p className="mb-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                // SESSION HISTORY
              </p>
              <ul className="grid gap-1.5">
                {runs.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => setActive(r.id)}
                      className={`flex w-full items-center gap-3 border-2 px-3 py-2 text-left ${
                        active === r.id
                          ? "border-primary bg-card"
                          : "border-border bg-card/50 hover:border-primary/60"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 ${
                          r.status === "thinking"
                            ? "animate-pulse bg-primary"
                            : r.status === "error"
                              ? "bg-destructive"
                              : "bg-muted-foreground"
                        }`}
                      />
                      <span className="w-20 shrink-0 font-mono text-[10px] tracking-widest text-primary">
                        [{r.mode ? r.mode.toUpperCase() : "AUTO"}]
                      </span>
                      <span className="truncate text-sm">{r.prompt}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>

        <aside className="self-start lg:sticky lg:top-[80px]">
          <div className="border-2 border-border bg-card">
            <div className="flex items-center justify-between border-b-2 border-border px-4 py-2">
              <div className="flex items-center gap-2 font-mono text-[10px] tracking-widest text-primary">
                <span
                  className={`h-1.5 w-1.5 ${
                    activeRun?.status === "thinking" ? "animate-pulse bg-primary" : "bg-primary"
                  }`}
                />
                LIVE SOURCES
              </div>
              {settings.showSourcesCount && (
                <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
                  {activeRun?.sources.length ?? 0} cited
                </span>
              )}
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-3">
              {!activeRun ? (
                <p className="p-2 font-mono text-[10px] tracking-widest text-muted-foreground">
                  AWAITING QUERY. GROUNDED CITATIONS WILL APPEAR HERE.
                </p>
              ) : activeRun.status === "thinking" ? (
                <ul className="space-y-2">
                  {[0, 1, 2, 3].map((i) => (
                    <li
                      key={i}
                      className="h-10 animate-pulse border-2 border-dashed border-border"
                    />
                  ))}
                  <p className="pt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
                    SCANNING LIVE WEB · BUCKS COUNTY CONTEXT…
                  </p>
                </ul>
              ) : activeRun.sources.length === 0 ? (
                <p className="p-2 font-mono text-[10px] tracking-widest text-muted-foreground">
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
                        className="block border-2 border-border bg-background p-3 hover:border-primary"
                      >
                        <div className="font-mono text-[10px] tracking-widest text-primary">
                          [{String(i + 1).padStart(2, "0")}]
                        </div>
                        <div className="mt-1 text-sm leading-tight">{s.title}</div>
                        <div className="mt-2 truncate font-mono text-[10px] tracking-widest text-muted-foreground">
                          {safeHost(s.uri)}
                        </div>
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          <div className="mt-4 border-2 border-dashed border-border bg-card p-3">
            <p className="mb-2 font-mono text-[10px] tracking-widest text-primary">
              // LOCALE LOCK
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Doylestown <span className="text-foreground">18901 / 18902</span> · New Hope{" "}
              <span className="text-foreground">18938</span> · Newtown{" "}
              <span className="text-foreground">18940</span> · Warrington{" "}
              <span className="text-foreground">18976</span> · Buckingham · Furlong · Bucks County,
              PA.
            </p>
          </div>
        </aside>
      </div>

      <footer className="mt-6 border-t-2 border-border">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-6 py-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>© 2026 Hoffman Paint & Home Design // GIGA BRAIN</span>
          <span>SPEC: TRUST-VELOCITY · AIO · GROUNDED</span>
          <span className="text-primary">SYSTEM ONLINE ▣</span>
        </div>
      </footer>

      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        onSettingsChange={setSettings}
      />
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
      <div className="mx-auto mb-6 h-16 w-16 hazard-stripes" />
      <h2 className="mb-2 font-display text-2xl md:text-3xl">BRAIN STANDING BY</h2>
      <p className="mx-auto max-w-md text-sm text-muted-foreground">
        Type a prompt or hit a quick action. The brain auto-detects intent — blog, market recon,
        landing page, audit, or Framer CMS — and grounds every answer in live 2026 Bucks County
        data.
      </p>
    </div>
  );
}

function ThinkingState({ prompt }: { prompt: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 font-mono text-xs tracking-widest text-primary">
        <span className="h-2 w-2 animate-pulse bg-primary" />
        BRAIN ENGAGED · GROUNDING LIVE WEB · 2026 BUCKS COUNTY CONTEXT
      </div>
      <div className="border-2 border-dashed border-border p-3 font-mono text-xs text-muted-foreground">
        ▸ {prompt}
      </div>
      <ul className="space-y-2">
        {[90, 80, 70, 95, 60].map((w, i) => (
          <li key={i} className="h-3 animate-pulse bg-border" style={{ width: `${w}%` }} />
        ))}
      </ul>
    </div>
  );
}
