const STORAGE_KEY = "portfolio-dev-container-layout";
const HASH_TOKEN = "#dev-containers";
const TARGET_SELECTOR = "[data-dev-container-id], .projection-overlay[data-dev-container-id]";

const state = {
  enabled: false,
  overlay: null,
  panel: null,
  handles: new Map(),
  registry: new Map(),
  layout: {},
  selectedId: "",
  rafId: 0,
};

function loadLayout() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    state.layout = raw ? JSON.parse(raw) : {};
  } catch {
    state.layout = {};
  }
}

function saveLayout() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.layout, null, 2));
}

function injectStyles() {
  if (document.getElementById("dev-container-tools-style")) return;
  const style = document.createElement("style");
  style.id = "dev-container-tools-style";
  style.textContent = `
    .dev-container-tools-layer {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 99996;
    }
    .dev-container-tools-handle {
      position: fixed;
      width: 26px;
      height: 26px;
      border: 1px solid rgba(255, 176, 94, 0.86);
      border-radius: 999px;
      background: rgba(14, 18, 20, 0.88);
      color: rgba(255, 207, 149, 0.98);
      font: 700 13px/1 "IBM Plex Sans", sans-serif;
      pointer-events: auto;
      cursor: pointer;
      box-shadow: 0 0 16px rgba(255, 145, 57, 0.22);
    }
    .dev-container-tools-handle.is-active {
      border-color: rgba(255, 224, 176, 1);
      box-shadow: 0 0 20px rgba(255, 172, 83, 0.42);
    }
    .dev-container-tools-target {
      outline: 1px dashed rgba(255, 183, 106, 0.84);
      outline-offset: 8px;
    }
    .dev-container-tools-panel {
      position: fixed;
      right: 18px;
      top: 18px;
      width: min(320px, calc(100vw - 36px));
      padding: 14px;
      border: 1px solid rgba(255, 176, 94, 0.48);
      background: rgba(8, 12, 16, 0.94);
      color: #eefaff;
      font: 500 12px/1.45 "IBM Plex Sans", sans-serif;
      letter-spacing: 0.03em;
      pointer-events: auto;
      box-shadow: 0 18px 44px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(10px);
    }
    .dev-container-tools-panel strong {
      display: block;
      margin-bottom: 6px;
      color: rgba(255, 208, 156, 0.98);
      font-size: 12px;
      text-transform: uppercase;
    }
    .dev-container-tools-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }
    .dev-container-tools-btn {
      border: 1px solid rgba(151, 229, 255, 0.3);
      background: rgba(15, 33, 40, 0.88);
      color: #eafaff;
      padding: 6px 9px;
      cursor: pointer;
      font: inherit;
    }
    .dev-container-tools-btn[data-tone="danger"] {
      border-color: rgba(255, 122, 122, 0.35);
      color: #ffd2d2;
      background: rgba(48, 12, 16, 0.88);
    }
    .dev-container-tools-muted {
      opacity: 0.72;
      margin-top: 8px;
    }
  `;
  document.head.appendChild(style);
}

function getContainerNodes() {
  return Array.from(document.querySelectorAll(TARGET_SELECTOR));
}

function getContainerRecord(node) {
  const id = node.dataset.devContainerId;
  if (!id) return null;
  const title = node.getAttribute("aria-label")
    || node.dataset.projectionLabel
    || node.querySelector("h2, h3, h4")?.textContent?.trim()
    || id;
  const kind = node.dataset.devContainerKind || (node.classList.contains("projection-overlay") ? "projection" : "content");
  return { id, title, node, kind };
}

function applyNodeState(record) {
  const entry = state.layout[record.id] || {};
  const hidden = !!entry.hidden;
  const deleted = !!entry.deleted;
  record.node.dataset.devContainerState = deleted ? "deleted" : hidden ? "hidden" : "active";
  record.node.style.display = hidden || deleted ? "none" : "";
}

function buildManifest() {
  return Array.from(state.registry.values()).map((record) => ({
    id: record.id,
    title: record.title,
    state: state.layout[record.id] || { hidden: false, deleted: false },
  }));
}

function copyManifest() {
  const payload = JSON.stringify(buildManifest(), null, 2);
  navigator.clipboard.writeText(payload).catch(() => {});
}

function selectContainer(id) {
  state.selectedId = id;
  state.registry.forEach((record) => {
    record.node.classList.toggle("dev-container-tools-target", record.id === id);
    const handle = state.handles.get(record.id);
    if (handle) {
      handle.classList.toggle("is-active", record.id === id);
    }
  });
  renderPanel();
}

function updateEntry(id, patch) {
  state.layout[id] = {
    ...(state.layout[id] || {}),
    ...patch,
  };
  saveLayout();
  const record = state.registry.get(id);
  if (record) {
    applyNodeState(record);
  }
  if ((state.layout[id]?.hidden || state.layout[id]?.deleted) && state.selectedId === id) {
    state.selectedId = "";
  }
  renderPanel();
}

function resetAll() {
  state.layout = {};
  saveLayout();
  state.registry.forEach((record) => applyNodeState(record));
  state.selectedId = "";
  renderPanel();
}

function createHandle(record) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "dev-container-tools-handle";
  button.textContent = record.kind === "projection" ? "×" : "#";
  button.title = `Edit ${record.id}`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    selectContainer(record.id === state.selectedId ? "" : record.id);
  });
  state.overlay.appendChild(button);
  state.handles.set(record.id, button);
}

function updateHandlePositions() {
  syncRegistry();
  state.registry.forEach((record) => {
    const handle = state.handles.get(record.id);
    if (!handle) return;
    const layoutState = state.layout[record.id] || {};
    if (layoutState.hidden || layoutState.deleted) {
      handle.style.display = "none";
      return;
    }
    const rect = record.node.getBoundingClientRect();
    const visible = rect.width > 10 && rect.height > 10 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight;
    handle.style.display = visible ? "block" : "none";
    if (!visible) return;
    const offset = record.kind === "projection" ? 10 : 14;
    handle.style.left = `${Math.max(8, rect.right - offset)}px`;
    handle.style.top = `${Math.max(8, rect.top - offset)}px`;
  });
  state.rafId = window.requestAnimationFrame(updateHandlePositions);
}

function renderPanel() {
  if (!state.panel) return;
  const selected = state.selectedId ? state.registry.get(state.selectedId) : null;
  const selectedState = selected ? (state.layout[selected.id] || {}) : null;
  state.panel.innerHTML = "";

  const title = document.createElement("strong");
  title.textContent = selected ? `# ${selected.id}` : "# Dev Containers";
  state.panel.appendChild(title);

  const copy = document.createElement("div");
  copy.textContent = selected
    ? `${selected.title} • ${selected.kind} • ${selected.node.tagName.toLowerCase()}`
    : "Use #dev-containers in the URL, then click a hash handle to hide or delete a content block.";
  state.panel.appendChild(copy);

  if (selected) {
    const row = document.createElement("div");
    row.className = "dev-container-tools-row";

    const hideBtn = document.createElement("button");
    hideBtn.type = "button";
    hideBtn.className = "dev-container-tools-btn";
    hideBtn.textContent = selectedState?.hidden ? "Unhide" : "Hide";
    hideBtn.addEventListener("click", () => {
      updateEntry(selected.id, { hidden: !selectedState?.hidden, deleted: false });
    });
    row.appendChild(hideBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "dev-container-tools-btn";
    deleteBtn.dataset.tone = "danger";
    deleteBtn.textContent = selectedState?.deleted ? "Restore" : "Delete";
    deleteBtn.addEventListener("click", () => {
      updateEntry(selected.id, { deleted: !selectedState?.deleted, hidden: false });
    });
    row.appendChild(deleteBtn);

    const manifestBtn = document.createElement("button");
    manifestBtn.type = "button";
    manifestBtn.className = "dev-container-tools-btn";
    manifestBtn.textContent = "Copy Manifest";
    manifestBtn.addEventListener("click", copyManifest);
    row.appendChild(manifestBtn);

    state.panel.appendChild(row);
  }

  const utilityRow = document.createElement("div");
  utilityRow.className = "dev-container-tools-row";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "dev-container-tools-btn";
  resetBtn.textContent = "Reset All";
  resetBtn.addEventListener("click", resetAll);
  utilityRow.appendChild(resetBtn);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "dev-container-tools-btn";
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", () => {
    window.location.hash = "";
  });
  utilityRow.appendChild(closeBtn);

  state.panel.appendChild(utilityRow);

  const note = document.createElement("div");
  note.className = "dev-container-tools-muted";
  note.textContent = "Manifest output is meant for later agent-assisted insertion or fast manual repurposing.";
  state.panel.appendChild(note);
}

function syncRegistry() {
  getContainerNodes().forEach((node) => {
    const record = getContainerRecord(node);
    if (!record) return;
    state.registry.set(record.id, record);
    applyNodeState(record);
    if (!state.handles.has(record.id)) {
      createHandle(record);
    }
  });
}

function mountUi() {
  if (state.overlay) return;
  injectStyles();
  const overlay = document.createElement("div");
  overlay.className = "dev-container-tools-layer";
  const panel = document.createElement("div");
  panel.className = "dev-container-tools-panel";
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  state.overlay = overlay;
  state.panel = panel;
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      selectContainer("");
    }
  });
}

function unmountUi() {
  if (state.rafId) {
    window.cancelAnimationFrame(state.rafId);
    state.rafId = 0;
  }
  state.registry.forEach((record) => {
    record.node.classList.remove("dev-container-tools-target");
  });
  state.handles.clear();
  state.registry.clear();
  if (state.overlay?.parentNode) {
    state.overlay.parentNode.removeChild(state.overlay);
  }
  state.overlay = null;
  state.panel = null;
  state.selectedId = "";
}

function syncEnabledFromHash() {
  const shouldEnable = window.location.hash.includes("dev-containers");
  if (shouldEnable === state.enabled) return;
  state.enabled = shouldEnable;
  if (state.enabled) {
    loadLayout();
    mountUi();
    syncRegistry();
    renderPanel();
    updateHandlePositions();
  } else {
    unmountUi();
  }
}

export function initDevContainerTools() {
  window.addEventListener("hashchange", syncEnabledFromHash);
  syncEnabledFromHash();
}
