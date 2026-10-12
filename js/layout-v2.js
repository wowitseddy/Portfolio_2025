// layout-v2: six DOM sections mapped to scroll-flow ranges.
// Driven from main.js' animate() with the same flowProgress the 3D scene uses,
// so text and 3D always agree. Each <section class="v2-section"> declares
// data-range="start,end" in flow units (0..1).

const state = {
  sections: [],
  progressFill: null,
  lastActive: -1,
  motionScale: 1,
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
      return { node, start, end, side, opacity: -1, shift: NaN };
    },
  );
  state.progressFill = document.querySelector(".v2-progress__fill");
  state.sections.forEach((entry) => {
    const panel = entry.node.querySelector(".v2-panel");
    if (panel) bindPanelScroll(panel);
  });
  const syncModes = () => {
    state.motionScale = isReducedMotion() ? 0 : 1;
    document.body.classList.toggle("v2-compact", isCompactLayout());
    document.body.classList.toggle("v2-reduced-motion", isReducedMotion());
    state.sections.forEach((entry) => { entry.opacity = -1; });
  };
  syncModes();
  compactQuery.addEventListener?.("change", syncModes);
  reducedMotionQuery.addEventListener?.("change", syncModes);
  document.body.classList.add("layout-v2");
}

// Where the section's 3D focal object should sit, as a fraction of the
// viewport from center (+x = right). Text on the left -> object on the right.
const FOCUS_SHIFT_X = 0.22;
// Mobile: the text panel is a bottom sheet, so the object moves up instead.
const COMPACT_FOCUS_Y = -0.2;
const compactQuery = window.matchMedia("(max-width: 640px)");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

export function isCompactLayout() {
  return compactQuery.matches;
}

export function isReducedMotion() {
  return reducedMotionQuery.matches;
}

export function getSectionFocus(entry) {
  if (!entry) return { x: 0, y: 0 };
  // Reduced motion: no layout-driven 3D movement at all (crossfades only).
  if (isReducedMotion()) return { x: 0, y: 0 };
  if (isCompactLayout()) return { x: 0, y: entry.side === "center" ? 0 : COMPACT_FOCUS_Y };
  const x = entry.side === "left" ? FOCUS_SHIFT_X : entry.side === "right" ? -FOCUS_SHIFT_X : 0;
  return { x, y: 0 };
}

// Long panels scroll internally. The page hijacks wheel/touch on window
// (bubble phase), so a panel consumes the gesture while it can still scroll
// in that direction, then hands control back to the page flow.
function canScroll(el, dy) {
  if (el.scrollHeight <= el.clientHeight + 1) return false;
  if (dy > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
  return el.scrollTop > 0;
}

function bindPanelScroll(panel) {
  panel.addEventListener(
    "wheel",
    (event) => {
      const dy = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      if (!canScroll(panel, dy)) return;
      event.preventDefault();
      event.stopPropagation();
      panel.scrollTop += dy;
    },
    { passive: false },
  );
  let lastY = null;
  panel.addEventListener("touchstart", (e) => { lastY = e.touches[0]?.clientY ?? null; }, { passive: true });
  panel.addEventListener(
    "touchmove",
    (event) => {
      const y = event.touches[0]?.clientY;
      if (y === undefined || lastY === null) return;
      const dy = lastY - y;
      lastY = y;
      if (!canScroll(panel, dy)) return;
      // Native scroll inside the panel; keep the page's touch anchor current
      // so the virtual scroll doesn't jump when control returns to it.
      event.stopPropagation();
      document.body.dataset.virtualTouchY = String(y);
    },
    { passive: true },
  );
}

export function getLayoutSections() {
  return state.sections;
}

// Transition rules (LAYOUT_PROPOSAL.md §6):
//  - every section boundary b owns a crossfade band [b - BAND/2, b + BAND/2]
//    of BAND = 6% of total scroll flow;
//  - inside a band the 3D focal shift happens first (u 0 -> 0.6), the outgoing
//    text fades over u 0 -> 0.45 and the incoming text over u 0.5 -> 1, so
//    text always moves after the 3D change;
//  - outside the bands is the section's reading zone: text fully shown and no
//    layout-driven 3D change.
export const TRANSITION = Object.freeze({
  band: 0.06,
  focusEnd: 0.6,
  outEnd: 0.45,
  inStart: 0.5,
  textTravelPx: 16,
});

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

function activeIndex(flow) {
  const { sections } = state;
  for (let i = 0; i < sections.length; i += 1) {
    if (flow >= sections[i].start && flow < sections[i].end) return i;
  }
  return flow < 0.5 ? 0 : sections.length - 1;
}

export function getReadingZones() {
  const half = TRANSITION.band / 2;
  return state.sections.map((s, i) => ({
    id: s.node.id,
    start: i === 0 ? s.start : s.start + half,
    end: i === state.sections.length - 1 ? Math.min(s.end, 1) : s.end - half,
  }));
}

// Pure function of flow: per-section text opacity/shift and the 3D focus.
export function computeLayoutFrame(flow) {
  const { sections } = state;
  const half = TRANSITION.band / 2;
  const out = sections.map(() => ({ opacity: 0, shift: 0 }));
  const idx = activeIndex(flow);
  let focus = getSectionFocus(sections[idx]);
  out[idx].opacity = 1;

  for (let i = 1; i < sections.length; i += 1) {
    const b = sections[i].start;
    if (flow < b - half || flow > b + half) continue;
    const u = clamp01((flow - (b - half)) / TRANSITION.band);
    const prev = sections[i - 1];
    const next = sections[i];
    const fPrev = getSectionFocus(prev);
    const fNext = getSectionFocus(next);
    const fu = ease(clamp01(u / TRANSITION.focusEnd));
    focus = { x: lerp(fPrev.x, fNext.x, fu), y: lerp(fPrev.y, fNext.y, fu) };
    const outT = ease(clamp01(u / TRANSITION.outEnd));
    const inT = ease(clamp01((u - TRANSITION.inStart) / (1 - TRANSITION.inStart)));
    for (let k = 0; k < out.length; k += 1) out[k] = { opacity: 0, shift: 0 };
    out[i - 1] = { opacity: 1 - outT, shift: -outT * TRANSITION.textTravelPx * state.motionScale };
    out[i] = { opacity: inT, shift: (1 - inT) * TRANSITION.textTravelPx * state.motionScale };
    break;
  }
  return { idx, focus, sections: out };
}

function setSectionFrame(entry, frame) {
  const op = Math.round(frame.opacity * 1000) / 1000;
  const shift = Math.round(frame.shift * 10) / 10;
  if (op === entry.opacity && shift === entry.shift) return;
  entry.opacity = op;
  entry.shift = shift;
  entry.node.style.setProperty("--v2-op", String(op));
  entry.node.style.setProperty("--v2-shift", `${shift}px`);
  entry.node.classList.toggle("is-v2-visible", op > 0.001);
  entry.node.setAttribute("aria-hidden", op > 0.5 ? "false" : "true");
}

export function updateLayoutV2(flow) {
  if (state.sections.length === 0) return null;
  const frame = computeLayoutFrame(flow);
  state.sections.forEach((entry, i) => setSectionFrame(entry, frame.sections[i]));
  if (frame.idx !== state.lastActive) {
    state.lastActive = frame.idx;
    document.body.dataset.v2Section = state.sections[frame.idx].node.id;
  }
  if (state.progressFill) {
    state.progressFill.style.transform = isCompactLayout()
      ? `scaleX(${clamp01(flow).toFixed(4)})`
      : `scaleY(${clamp01(flow).toFixed(4)})`;
  }
  return { activeIndex: frame.idx, section: state.sections[frame.idx], focus: frame.focus };
}
