// Single source of truth for the Projects section cards (rendered by
// js/project-cards.js). Edit this file to update cards; no layout changes needed.
//
// Fields
//   id       stable slug (also used to link timeline entries)
//   title    card heading
//   status   "shipped" | "in-progress" | "upcoming" | null (no badge)
//   date     free-form display date ("2026", "2026-05") or null
//   summary  one or two factual sentences
//   tags     short labels
//   order    ascending sort key (lower = shown first)
//   url      optional primary link
//   links    optional extra links [{ label, href }]
//   media    reserved for a future expand-on-click view [{ type, src, alt }];
//            not rendered yet
export const PROJECTS = Object.freeze([
  {
    id: "phantom-walk",
    title: "Phantom Walk",
    status: "shipped",
    date: "2026",
    summary:
      "NeRF / Gaussian-splat tool for real-estate immersion pilots with agents.",
    tags: ["NeRF", "Gaussian splatting", "Real estate"],
    order: 10,
    url: "https://phantomwalk.com",
    links: [],
    media: [],
  },
  {
    id: "untitled-3d-photographic-diffusion",
    title: "Untitled — 3D Photographic Diffusion",
    status: "upcoming",
    date: null,
    summary: "Advanced 3D photographic diffusion edits with refined realism.",
    tags: ["Diffusion", "3D", "Photography"],
    order: 20,
    url: null,
    links: [],
    media: [],
  },
  {
    id: "portfolio-2025",
    title: "Portfolio_2025",
    status: "shipped",
    date: "2026",
    summary:
      "Immersive 3D portfolio site (three.js) with simulation-driven tooling and scroll-scene capture/diff tools.",
    tags: ["three.js", "WebGL", "Tooling"],
    order: 30,
    url: "https://www.devinedwards.info",
    links: [{ label: "Source", href: "https://github.com/wowitseddy/Portfolio_2025" }],
    media: [],
  },
  {
    id: "sentinel-construct",
    title: "Sentinel Construct",
    status: "in-progress",
    date: null,
    summary: "Constraint-driven simulation compiler.",
    tags: ["Simulation"],
    order: 40,
    url: "https://github.com/wowitseddy/Portfolio_2025/tree/master/projects/sentinel-construct",
    links: [
      {
        label: "100K Campaign Summary",
        href: "https://github.com/wowitseddy/Portfolio_2025/blob/master/projects/sentinel-construct/output/campaign/mutation-campaign-summary.md",
      },
    ],
    media: [],
  },
  {
    id: "biomed-indexing-tool",
    title: "Biomed Indexing Tool",
    status: "in-progress",
    date: null,
    summary: "Scientific retrieval and evidence surfacing.",
    tags: ["Retrieval", "Research"],
    order: 50,
    url: "https://github.com/wowitseddy/Portfolio_2025/tree/master/projects/biomed-indexing-tool",
    links: [],
    media: [],
  },
  {
    id: "research-systems",
    title: "Research Systems",
    status: "in-progress",
    date: null,
    summary: "Cross-domain hypothesis and experiment ops.",
    tags: ["Research"],
    order: 60,
    url: null,
    links: [],
    media: [],
  },
  {
    id: "colony-intelligence-framework",
    title: "Colony Intelligence Framework",
    status: "in-progress",
    date: null,
    summary: "Distributed survivability and coordination logic.",
    tags: ["Systems"],
    order: 70,
    url: null,
    links: [],
    media: [],
  },
  {
    id: "resume-pdf-editor",
    title: "Resume/ PDF Editor",
    status: null,
    date: null,
    summary: "",
    tags: [],
    order: 80,
    url: "/resume-tools.html",
    links: [],
    media: [],
  },
]);

export function getProject(id) {
  return PROJECTS.find((p) => p.id === id) || null;
}
