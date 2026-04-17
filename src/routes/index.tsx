import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CopilotPanel } from "@/components/CopilotPanel";

type Mode = "market" | "page" | "audit" | "framer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "The GC Copilot — 2026 SEO Workstation for Contractors" },
      {
        name: "description",
        content:
          "A precision AI workstation for General Contractors & Painters building on Framer. Trust Velocity + AIO Optimization, grounded in live 2026 data.",
      },
      { property: "og:title", content: "The GC Copilot" },
      { property: "og:description", content: "2026 SEO workstation for GC & Painting Framer sites." },
    ],
  }),
  component: Index,
});

const CARDS: { mode: Mode; num: string; title: string; sub: string; desc: string }[] = [
  {
    mode: "market",
    num: "01",
    title: "Analyze My Market",
    sub: "Recon",
    desc: "Aggregate local competitor data, 2026 price trends, and rising AIO query opportunities.",
  },
  {
    mode: "page",
    num: "02",
    title: "Write My Page",
    sub: "Deploy",
    desc: "Generate AIO-extractive landing pages with neighborhood entity grounding + JSON-LD schema.",
  },
  {
    mode: "audit",
    num: "03",
    title: "Audit My Framer Site",
    sub: "Inspect",
    desc: "Score Trust Velocity & AI-Search readiness. Top 10 ranked fixes with exact Framer settings.",
  },
];

function Index() {
  const [active, setActive] = useState<Mode | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground grid-bg">
      {/* Header */}
      <header className="border-b-2 border-border bg-background/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="hazard-stripes w-10 h-10" />
            <div>
              <p className="font-display text-lg leading-none">THE GC COPILOT</p>
              <p className="font-mono text-[10px] text-muted-foreground tracking-widest mt-1">
                v.2026 // GROUNDED · TRUST-VELOCITY · AIO
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3 font-mono text-xs">
            <span className="w-2 h-2 bg-primary animate-pulse" />
            <span className="text-muted-foreground">GEMINI 2.5 / SEARCH-GROUNDED</span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-16 pb-12">
        <p className="font-mono text-xs text-primary tracking-widest mb-4">
          // PERSONAL WORKSTATION · GENERAL CONTRACTOR + PAINTING
        </p>
        <h1 className="text-5xl md:text-7xl leading-[0.9] max-w-4xl">
          Build A Framer Site That <span className="text-primary">AI Engines Cite.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-base md:text-lg text-muted-foreground">
          Three precision tools. Live 2026 web data via Google Search grounding. Optimized
          for Trust Velocity (consistent local signals) and AIO Optimization (citation in
          Google AI Overviews).
        </p>
        <div className="mt-8 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest">
          {["Local-First", "AI Overviews", "JSON-LD", "Framer-Native", "E-E-A-T 2026"].map((t) => (
            <span key={t} className="border-2 border-border px-3 py-1.5 text-muted-foreground">
              ▸ {t}
            </span>
          ))}
        </div>
      </section>

      {/* Cards */}
      <section className="max-w-7xl mx-auto px-6 pb-24">
        <div className="grid md:grid-cols-3 gap-6">
          {CARDS.map((c) => (
            <button
              key={c.mode}
              onClick={() => setActive(c.mode)}
              className="group text-left bg-card border-2 border-border p-6 hover:border-primary hover:brutal-shadow hover:-translate-x-1 hover:-translate-y-1 transition-all"
            >
              <div className="flex items-start justify-between mb-8">
                <span className="font-display text-5xl text-primary">{c.num}</span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground border border-border px-2 py-1 group-hover:border-primary group-hover:text-primary">
                  {c.sub}
                </span>
              </div>
              <h3 className="text-2xl mb-3 leading-tight">{c.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{c.desc}</p>
              <div className="mt-6 flex items-center justify-between border-t-2 border-border pt-4">
                <span className="font-mono text-xs text-muted-foreground group-hover:text-primary">
                  OPEN_TOOL
                </span>
                <span className="font-display text-xl text-primary group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Framer formatter — secondary tool */}
        <div className="mt-6">
          <button
            onClick={() => setActive("framer")}
            className="w-full bg-card border-2 border-dashed border-border p-5 flex items-center justify-between hover:border-primary group transition-colors"
          >
            <div className="flex items-center gap-4 text-left">
              <span className="hazard-stripes w-8 h-8" />
              <div>
                <p className="font-display text-lg">04 · Framer CMS Formatter</p>
                <p className="font-mono text-xs text-muted-foreground">
                  Paste your CMS field names → get drop-in, AIO-formatted values.
                </p>
              </div>
            </div>
            <span className="font-display text-xl text-primary group-hover:translate-x-1 transition-transform">
              →
            </span>
          </button>
        </div>
      </section>

      {/* Footer spec strip */}
      <footer className="border-t-2 border-border">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-wrap items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>© 2026 GC COPILOT // PERSONAL BUILD</span>
          <span>SPEC: TRUST-VELOCITY · AIO · LOCAL-FIRST</span>
          <span className="text-primary">SYSTEM ONLINE ▣</span>
        </div>
      </footer>

      {active && <CopilotPanel mode={active} onClose={() => setActive(null)} />}
    </div>
  );
}
