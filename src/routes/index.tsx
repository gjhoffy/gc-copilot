import { createFileRoute } from "@tanstack/react-router";
import MissionControl from "@/components/MissionControl";
import GlobeBackground from "@/components/GlobeBackground";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ConstructBuilt Giga Brain — 2026 GC + Painting Workstation" },
      {
        name: "description",
        content:
          "AI strategy brain for elite General Contractors in Doylestown & Bucks County. Search-grounded 2026 SEO, blog automation, and Framer CMS output.",
      },
      { property: "og:title", content: "ConstructBuilt Giga Brain" },
      {
        property: "og:description",
        content: "Grounded 2026 SEO + content factory for Bucks County contractors.",
      },
    ],
  }),
  component: () => (
    <>
      <GlobeBackground />
      <MissionControl />
    </>
  ),
});
