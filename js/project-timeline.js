import { getProject } from "./data/projects.js";

const PROJECTION_HORIZON_YEARS = 10;
const START_YEAR = new Date().getFullYear();

export const PROJECT_TIMELINE_YEARS = Object.freeze(
  Array.from({ length: PROJECTION_HORIZON_YEARS }, (_, index) => START_YEAR + index),
);

function buildYearlyProjection(labels) {
  return PROJECT_TIMELINE_YEARS.map((year, index) => ({
    year,
    label: labels[index] || labels[labels.length - 1] || "Pending",
  }));
}

// Shipped builds (actual milestones). They have no yearly projections, so they
// render as an "actual" row in the My builds lane and are kept out of the
// 10-year projection matrix.
const phantomWalk = getProject("phantom-walk");
export const SHIPPED_BUILDS = Object.freeze(
  phantomWalk
    ? [
        {
          id: phantomWalk.id,
          label: phantomWalk.title,
          trajectory: phantomWalk.summary,
          actual: [{ year: 2026, label: "Shipped" }],
        },
      ]
    : [],
);

export const PROJECT_LIFECYCLE_PROJECTIONS = Object.freeze([
  {
    id: "portfolio-2025",
    label: "Portfolio_2025",
    trajectory: "Simulation-first portfolio system",
    horizon: "Interface becomes a live research shell rather than a static showcase.",
    yearly: buildYearlyProjection([
      "Topology and keyframe pass",
      "Motion system stabilization",
      "Narrative environment expansion",
      "Simulation-first UI hardening",
      "Adaptive scene orchestration",
      "Cross-project command surfaces",
      "Live research reporting",
      "Autonomous diagnostics",
      "Archive remastering",
      "Flagship interface refresh",
    ]),
  },
  {
    id: "sentinel-construct",
    label: "Sentinel Construct",
    trajectory: "Constraint-driven simulation compiler",
    horizon: "Moves from speculative scenario engine toward a durable frontier research runtime.",
    yearly: buildYearlyProjection([
      "Scenario pack hardening",
      "Reliability baseline recovery",
      "Autonomous experiment queues",
      "Recursive swarm tuning",
      "External validation harness",
      "Constraint compiler expansion",
      "Multi-domain scenario markets",
      "High-variance frontier sims",
      "Governance stress maps",
      "Mature research engine",
    ]),
  },
  {
    id: "biomed-indexing-tool",
    label: "Biomed Indexing Tool",
    trajectory: "Scientific retrieval and evidence surfacing",
    horizon: "Evolves into a long-horizon evidence graph with analyst-facing synthesis layers.",
    yearly: buildYearlyProjection([
      "Ingestion spine",
      "Source normalization",
      "Retrieval UX refinement",
      "Analyst copilots",
      "Structured evidence graphs",
      "Multi-modal indexing",
      "Longitudinal knowledge updates",
      "Regulatory traceability",
      "Automated synthesis",
      "Durable research stack",
    ]),
  },
  {
    id: "research-systems",
    label: "Research Systems",
    trajectory: "Cross-domain hypothesis and experiment ops",
    horizon: "Becomes the substrate that ties simulation, evidence, and iteration memory together.",
    yearly: buildYearlyProjection([
      "Hypothesis registry",
      "Experiment operations",
      "Model comparison lanes",
      "Knowledge lattice",
      "Observability layer",
      "Cross-domain synthesis",
      "Institutional memory",
      "Predictive roadmaps",
      "Adaptive simulation routing",
      "Unified research substrate",
    ]),
  },
  {
    id: "colony-intelligence-framework",
    label: "Colony Intelligence Framework",
    trajectory: "Distributed survivability and coordination logic",
    horizon: "Progresses from framing work into an operable long-range systems doctrine.",
    yearly: buildYearlyProjection([
      "Systems framing",
      "Colony primitives",
      "Coordination simulation",
      "Survivability logic",
      "Mission doctrine loops",
      "Distributed agent governance",
      "Habitat optimization",
      "Off-world autonomy trials",
      "Large-scale colony planning",
      "Mature colonization framework",
    ]),
  },
]);

export const PROJECT_TIMELINE_KEYFRAME_GUIDE = Object.freeze(
  PROJECT_LIFECYCLE_PROJECTIONS.map((project, projectIndex) => ({
    id: project.id,
    label: project.label,
    sectionId: "timeline-section",
    suggestedLane: projectIndex,
    yearStops: project.yearly.map((entry, yearIndex, allYears) => ({
      year: entry.year,
      t:
        allYears.length <= 1
          ? 0
          : Number((yearIndex / (allYears.length - 1)).toFixed(4)),
      label: entry.label,
    })),
  })),
);

function ensureDebugHandles() {
  if (typeof window === "undefined") {
    return;
  }

  window.__PROJECT_TIMELINE_YEARS = PROJECT_TIMELINE_YEARS;
  window.__PROJECT_TIMELINE_PROJECTIONS = PROJECT_LIFECYCLE_PROJECTIONS;
  window.__PROJECT_TIMELINE_KEYFRAME_GUIDE = PROJECT_TIMELINE_KEYFRAME_GUIDE;
}

function createNode(tagName, className, textContent) {
  const node = document.createElement(tagName);
  if (className) {
    node.className = className;
  }
  if (typeof textContent === "string") {
    node.textContent = textContent;
  }
  return node;
}

function buildYearRail(className) {
  const rail = createNode("div", className);
  PROJECT_TIMELINE_YEARS.forEach((year, index) => {
    const yearNode = createNode("span", `${className}__year${index === 0 ? " is-current" : ""}`, String(year));
    rail.appendChild(yearNode);
  });
  return rail;
}

function renderMenuTimelinePanel(menuRoot) {
  if (!menuRoot) {
    return;
  }

  let panel = menuRoot.querySelector(".menu-timeline-panel");
  if (!panel) {
    panel = createNode("section", "menu-timeline-panel");
    panel.setAttribute("aria-label", "Decade project projection summary");
    menuRoot.appendChild(panel);
  }

  panel.replaceChildren();
  panel.appendChild(createNode("div", "menu-timeline-panel__eyebrow", "Decade Projection"));
  panel.appendChild(createNode("h3", "menu-timeline-panel__title", `${PROJECT_TIMELINE_YEARS[0]}-${PROJECT_TIMELINE_YEARS[PROJECT_TIMELINE_YEARS.length - 1]}`));
  panel.appendChild(createNode("p", "menu-timeline-panel__copy", "Year-over-year lifecycle forecast for the active project stack. Topology and keyframes stay manual."));
  panel.appendChild(buildYearRail("menu-timeline-rail"));

  const viewport = createNode("div", "menu-timeline-projects-viewport");
  const track = createNode("div", "menu-timeline-projects-track");

  for (let copyIndex = 0; copyIndex < 2; copyIndex += 1) {
    const list = createNode("div", "menu-timeline-projects");
    if (copyIndex > 0) {
      list.setAttribute("aria-hidden", "true");
    }

    PROJECT_LIFECYCLE_PROJECTIONS.forEach((project) => {
      const first = project.yearly[0];
      const last = project.yearly[project.yearly.length - 1];
      const row = createNode("article", "menu-timeline-project");
      row.appendChild(createNode("div", "menu-timeline-project__name", project.label));
      row.appendChild(createNode("div", "menu-timeline-project__trajectory", project.trajectory));
      row.appendChild(createNode("div", "menu-timeline-project__arc", `${first.year}: ${first.label} -> ${last.year}: ${last.label}`));
      list.appendChild(row);
    });

    track.appendChild(list);
  }

  viewport.appendChild(track);
  panel.appendChild(viewport);
}

function buildProjectCard(project) {
  const card = createNode("article", "timeline-project-card");

  const header = createNode("div", "timeline-project-card__header");
  header.appendChild(createNode("h3", "timeline-project-card__title", project.label));
  header.appendChild(createNode("p", "timeline-project-card__trajectory", project.trajectory));
  card.appendChild(header);

  card.appendChild(createNode("p", "timeline-project-card__horizon", project.horizon));

  const yearGrid = createNode("div", "timeline-year-grid");
  project.yearly.forEach((entry, index) => {
    const cell = createNode("div", `timeline-year-cell${index === 0 ? " is-current" : ""}`);
    cell.appendChild(createNode("span", "timeline-year-cell__year", String(entry.year)));
    cell.appendChild(createNode("strong", "timeline-year-cell__label", entry.label));
    yearGrid.appendChild(cell);
  });
  card.appendChild(yearGrid);

  return card;
}

function renderTimelineSection(flowRoot) {
  // layout-v2: the timeline lives inside the #timeline section's panel.
  const v2Body = document.getElementById("v2-timeline-body");
  if (v2Body) {
    renderTimelineLanes(v2Body);
    return;
  }
  if (!flowRoot) {
    return;
  }

  let section = document.getElementById("timeline-section");
  if (!section) {
    section = createNode("section", "flow-section content-section timeline-section");
    section.id = "timeline-section";
    section.setAttribute("data-flow-start", "0.65");
    section.setAttribute("data-flow-end", "0.75");
    section.setAttribute("data-flow-direction", "right");
    flowRoot.appendChild(section);
  }

  let shell = section.querySelector(".timeline-shell");
  if (!shell) {
    shell = createNode("div", "timeline-shell");
    section.appendChild(shell);
  }

  shell.replaceChildren();

  const title = createNode("h2", "sci-title", "Project Lifecycle Projection Matrix");
  title.dataset.text = "Project Lifecycle Projection Matrix";
  shell.appendChild(title);
  shell.appendChild(createNode("div", "section-tertiary-rule"));
  shell.appendChild(createNode("p", "section-tertiary-copy", "Year-over-year projections across the next decade for the active portfolio stack. Manual topology and keyframe authoring remain external to this panel by design."));
  shell.appendChild(buildYearRail("timeline-decade-rail"));

  const note = createNode("div", "timeline-manual-hook");
  note.appendChild(createNode("span", "timeline-manual-hook__label", "Manual Hook"));
  note.appendChild(createNode("p", "timeline-manual-hook__copy", "Use window.__PROJECT_TIMELINE_KEYFRAME_GUIDE when you wire section topology and runtime keyframes."));
  shell.appendChild(note);

  const grid = createNode("div", "timeline-project-grid");
  PROJECT_LIFECYCLE_PROJECTIONS.forEach((project) => {
    grid.appendChild(buildProjectCard(project));
  });
  shell.appendChild(grid);
}

// Lane B: milestones that belong to an external organisation (employer,
// partner, industry). Empty by default; every entry must carry an org tag so it
// can never be confused with the personal builds in Lane A.
// Shape: { org: "Org name", date: "2026-03", title: "Short title", note: "One sentence." }
export const EXTERNAL_ORG_MILESTONES = Object.freeze([]);

function buildHorizonChip(kind, label, entries) {
  const chip = createNode("div", `v2-tl-chip v2-tl-chip--${kind}`);
  chip.appendChild(createNode("span", "v2-tl-chip__when", label));
  entries.forEach((entry) => {
    const item = createNode("span", "v2-tl-chip__item");
    item.appendChild(createNode("span", "v2-tl-chip__year", String(entry.year)));
    item.appendChild(document.createTextNode(` ${entry.label}`));
    chip.appendChild(item);
  });
  return chip;
}

function buildBuildRow(project) {
  const row = createNode("article", "v2-tl-row");
  const head = createNode("div", "v2-tl-row__head");
  head.appendChild(createNode("h3", "v2-h3", project.label));
  head.appendChild(createNode("p", "v2-caption", project.trajectory));
  row.appendChild(head);
  const chips = createNode("div", "v2-tl-row__chips");
  const y = project.yearly;
  chips.appendChild(buildHorizonChip("current", "Now", [y[0]]));
  chips.appendChild(buildHorizonChip("planned", "Next 2 yrs", y.slice(1, 3)));
  chips.appendChild(buildHorizonChip("planned", "Long-term", [y[y.length - 1]]));
  row.appendChild(chips);
  return row;
}

function buildShippedRow(build) {
  const row = createNode("article", "v2-tl-row v2-tl-row--shipped");
  const head = createNode("div", "v2-tl-row__head");
  head.appendChild(createNode("h3", "v2-h3", build.label));
  head.appendChild(createNode("p", "v2-caption", build.trajectory));
  row.appendChild(head);
  const chips = createNode("div", "v2-tl-row__chips");
  chips.appendChild(buildHorizonChip("actual", "Shipped", build.actual));
  row.appendChild(chips);
  return row;
}

function renderTimelineLanes(root) {
  root.replaceChildren();
  root.appendChild(createNode("p", "v2-body", "Year-over-year projections across the next decade for the active portfolio stack. Manual topology and keyframe authoring remain external to this panel by design."));

  const legend = createNode("div", "v2-tl-legend");
  legend.appendChild(createNode("span", "v2-tl-key v2-tl-key--actual", "Shipped (actual)"));
  legend.appendChild(createNode("span", "v2-tl-key v2-tl-key--current", `Current year (${PROJECT_TIMELINE_YEARS[0]}), in progress`));
  legend.appendChild(createNode("span", "v2-tl-key v2-tl-key--planned", "Planned / projected"));
  root.appendChild(legend);

  const laneA = createNode("section", "v2-tl-lane v2-tl-lane--builds");
  laneA.setAttribute("aria-label", "My builds");
  laneA.appendChild(createNode("h3", "v2-tl-lane__title", "My builds"));
  SHIPPED_BUILDS.forEach((build) => laneA.appendChild(buildShippedRow(build)));
  PROJECT_LIFECYCLE_PROJECTIONS.forEach((project) => laneA.appendChild(buildBuildRow(project)));
  root.appendChild(laneA);

  const laneB = createNode("section", "v2-tl-lane v2-tl-lane--external");
  laneB.setAttribute("aria-label", "External / org milestones");
  laneB.appendChild(createNode("h3", "v2-tl-lane__title", "External / org milestones"));
  if (EXTERNAL_ORG_MILESTONES.length === 0) {
    laneB.classList.add("is-empty");
    laneB.appendChild(createNode("p", "v2-caption", "None listed."));
  } else {
    EXTERNAL_ORG_MILESTONES.forEach((m) => {
      const row = createNode("article", "v2-tl-ext");
      row.appendChild(createNode("span", "v2-tl-org", m.org || "Org"));
      row.appendChild(createNode("span", "v2-tl-chip__year", m.date || ""));
      row.appendChild(createNode("strong", "v2-tl-ext__title", m.title || ""));
      if (m.note) row.appendChild(createNode("p", "v2-caption", m.note));
      laneB.appendChild(row);
    });
  }
  root.appendChild(laneB);

  // Full 10-year matrix (all original content), collapsed by default.
  const details = createNode("details", "v2-tl-matrix");
  details.appendChild(createNode("summary", "v2-tl-matrix__toggle", "Full 10-year matrix"));
  const inner = createNode("div", "v2-tl-matrix__inner");
  inner.appendChild(buildYearRail("timeline-decade-rail"));
  const note = createNode("div", "timeline-manual-hook");
  note.appendChild(createNode("span", "timeline-manual-hook__label", "Manual Hook"));
  note.appendChild(createNode("p", "timeline-manual-hook__copy", "Use window.__PROJECT_TIMELINE_KEYFRAME_GUIDE when you wire section topology and runtime keyframes."));
  inner.appendChild(note);
  const grid = createNode("div", "timeline-project-grid");
  PROJECT_LIFECYCLE_PROJECTIONS.forEach((project) => grid.appendChild(buildProjectCard(project)));
  inner.appendChild(grid);
  details.appendChild(inner);
  root.appendChild(details);

  // The page hijacks the wheel for its virtual scroll (window, bubble phase).
  // Let the expanded matrix consume wheel events while it can still scroll.
  inner.addEventListener(
    "wheel",
    (event) => {
      const dy = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const canDown = inner.scrollTop + inner.clientHeight < inner.scrollHeight - 1;
      const canUp = inner.scrollTop > 0;
      if ((dy > 0 && canDown) || (dy < 0 && canUp)) {
        event.preventDefault();
        event.stopPropagation();
        inner.scrollTop += dy;
      }
    },
    { passive: false },
  );
}

export function ensureProjectTimelineUi({ menuRoot, flowRoot } = {}) {
  ensureDebugHandles();
  const resolvedMenuRoot = menuRoot || document.getElementById("sci-fi-menu");
  if (resolvedMenuRoot) {
    resolvedMenuRoot.classList.remove("is-timeline-panel-open");
  }
  // layout-v2 shows the timeline as its own section, so the duplicate
  // summary panel in the nav is no longer rendered.
  if (!document.getElementById("v2-timeline-body")) {
    renderMenuTimelinePanel(resolvedMenuRoot);
  }
  renderTimelineSection(flowRoot || document.getElementById("portfolio-flow"));
}

export function setTimelinePanelOpen(menuRoot, isOpen) {
  if (!menuRoot) {
    return;
  }

  menuRoot.classList.toggle("is-timeline-panel-open", !!isOpen);
}