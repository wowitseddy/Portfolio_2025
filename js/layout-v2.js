// layout-v2: six DOM sections mapped to scroll-flow ranges.
// Driven from main.js' animate() with the same flowProgress the 3D scene uses,
// so text and 3D always agree. Each <section class="v2-section"> declares
// data-range="start,end" in flow units (0..1).

const state = {
  sections: [],
  progressFill: null,
  lastActive: -1,
};

export function initLayoutV2() {
  state.sections = Array.from(document.querySelectorAll(".v2-section")).map(
    (node) => {
      const [start, end] = (node.dataset.range || "0,1")
        .split(",")
        .map((v) => Number.parseFloat(v));
      const side = node.classList.contains("v2-side-left")
        ? "left"
        : node.classList.contains("v2-side-right")
          ? "right"
          : "center";
      return { node, start, end, side, opacity: -1 };
    },
  );
  state.progressFill = document.querySelector(".v2-progress__fill");
  document.body.classList.add("layout-v2");
}

// Where the section's 3D focal object should sit, as a fraction of the
// viewport from center (+x = right). Text on the left -> object on the right.
const FOCUS_SHIFT_X = 0.22;
export function getSectionFocus(entry) {
  if (!entry) return { x: 0, y: 0 };
  const x = entry.side === "left" ? FOCUS_SHIFT_X : entry.side === "right" ? -FOCUS_SHIFT_X : 0;
  return { x, y: 0 };
}

export function getLayoutSections() {
  return state.sections;
}

function activeIndex(flow) {
  const { sections } = state;
  for (let i = 0; i < sections.length; i += 1) {
    if (flow >= sections[i].start && flow < sections[i].end) return i;
  }
  return flow < 0.5 ? 0 : sections.length - 1;
}

function setSectionOpacity(entry, opacity) {
  const rounded = Math.round(opacity * 1000) / 1000;
  if (rounded === entry.opacity) return;
  entry.opacity = rounded;
  entry.node.style.setProperty("--v2-op", String(rounded));
  entry.node.classList.toggle("is-v2-visible", rounded > 0.001);
  entry.node.setAttribute("aria-hidden", rounded > 0.5 ? "false" : "true");
}

export function updateLayoutV2(flow) {
  if (state.sections.length === 0) return null;
  const idx = activeIndex(flow);
  state.sections.forEach((entry, i) => setSectionOpacity(entry, i === idx ? 1 : 0));
  if (idx !== state.lastActive) {
    state.lastActive = idx;
    document.body.dataset.v2Section = state.sections[idx].node.id;
  }
  if (state.progressFill) {
    state.progressFill.style.transform = `scaleY(${Math.min(Math.max(flow, 0), 1).toFixed(4)})`;
  }
  return { activeIndex: idx, section: state.sections[idx], focus: getSectionFocus(state.sections[idx]) };
}
