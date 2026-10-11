import {
  initDevTools,
  updateDevTools,
  applyCameraCurve,
  getManualAxisLocks,
  setDevToolsEnabled,
  toggleDevToolsEnabled,
  isDevToolsEnabled,
} from "./dev-scene-tools.js";

const STORAGE_KEY = "portfolio.threeSceneInspectorExtension";

function loadInspectorRecall() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveInspectorRecall(payload) {
  if (typeof window === "undefined" || !payload) {
    return;
  }

  const snapshot = {
    updatedAt: new Date().toISOString(),
    activeLabel: payload.activeLabel || payload.sourceState?.activeLabel || "",
    reason: payload.reason || "sync",
    flow: payload.flow || [],
    sourceState: payload.sourceState || null,
    enabled:
      typeof payload.enabled === "boolean" ? payload.enabled : isDevToolsEnabled(),
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage failures and keep runtime API available.
  }

  window.__THREE_SCENE_INSPECTOR_RECALL__ = snapshot;
}

export function initThreeSceneInspectorExtension(registry, config = {}) {
  const recall = loadInspectorRecall();

  initDevTools(registry, {
    ...config,
    initiallyEnabled:
      typeof config.initiallyEnabled === "boolean"
        ? config.initiallyEnabled
        : typeof recall?.enabled === "boolean"
          ? recall.enabled
          : true,
    initialSelection:
      config.initialSelection || recall?.activeLabel || config.initialSelection,
    onExport(payload) {
      saveInspectorRecall(payload);
      if (typeof config.onExport === "function") {
        config.onExport(payload);
      }
    },
  });

  const shouldIgnoreHotkeyTarget = (target) => {
    if (!target) {
      return false;
    }

    const tagName = target.tagName?.toLowerCase?.() || "";
    return (
      tagName === "input" ||
      tagName === "textarea" ||
      tagName === "select" ||
      target.isContentEditable
    );
  };

  const keydownHandler = (event) => {
    if (shouldIgnoreHotkeyTarget(event.target)) {
      return;
    }

    if (event.code !== "Numpad5") {
      return;
    }

    event.preventDefault();
    const enabled = toggleDevToolsEnabled();
    saveInspectorRecall({
      ...(loadInspectorRecall() || {}),
      activeLabel: loadInspectorRecall()?.activeLabel || "",
      reason: "hotkey-toggle",
      flow: loadInspectorRecall()?.flow || [],
      sourceState: loadInspectorRecall()?.sourceState || null,
      enabled,
    });
  };

  if (typeof window !== "undefined") {
    window.addEventListener("keydown", keydownHandler);
  }

  const api = {
    update(elapsed) {
      if (!isDevToolsEnabled()) {
        return;
      }
      updateDevTools(elapsed);
    },
    applyCameraCurve,
    getManualAxisLocks,
    setEnabled(enabled) {
      const nextEnabled = setDevToolsEnabled(enabled);
      saveInspectorRecall({
        ...(loadInspectorRecall() || {}),
        activeLabel: loadInspectorRecall()?.activeLabel || "",
        reason: "api-toggle",
        flow: loadInspectorRecall()?.flow || [],
        sourceState: loadInspectorRecall()?.sourceState || null,
        enabled: nextEnabled,
      });
      return nextEnabled;
    },
    toggle() {
      const nextEnabled = toggleDevToolsEnabled();
      saveInspectorRecall({
        ...(loadInspectorRecall() || {}),
        activeLabel: loadInspectorRecall()?.activeLabel || "",
        reason: "api-toggle",
        flow: loadInspectorRecall()?.flow || [],
        sourceState: loadInspectorRecall()?.sourceState || null,
        enabled: nextEnabled,
      });
      return nextEnabled;
    },
    isEnabled() {
      return isDevToolsEnabled();
    },
    recall() {
      return loadInspectorRecall();
    },
  };

  if (typeof window !== "undefined") {
    window.__THREE_SCENE_INSPECTOR_EXTENSION__ = api;
    if (recall) {
      window.__THREE_SCENE_INSPECTOR_RECALL__ = recall;
    }
  }

  return api;
}