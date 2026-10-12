import missionCsv from "../docs/certification-hypercharge-90-day.csv?raw";

const STORAGE_KEY = "dragonfire.protocol.state";
const MISSION_LENGTH = 90;
const DAY_MILLISECONDS = 86400000;
const TARGET_CAPABILITIES = [
  {
    title: "manufacturing math discipline",
    detail: "unit conversion, tolerances, ratios, and process-sheet literacy",
  },
  {
    title: "cad and drawing execution",
    detail: "dimensioned sketches, geometry speed, and artifact packaging",
  },
  {
    title: "electrical and circuits reasoning",
    detail: "ohm's law, series/parallel logic, instrumentation, and schematic reading",
  },
  {
    title: "mechanical setup quality",
    detail: "vectors, free-body diagrams, statics, and force-balance cleanup",
  },
  {
    title: "tight technical documentation",
    detail: "lab summaries, review memos, dashboards, and concise reporting under time pressure",
  },
  {
    title: "iteration velocity under stress",
    detail: "mock review, postmortem loops, drift correction, and restart discipline",
  },
];

const CERTIFICATION_LANES = [
  {
    title: "CSWA / entry CAD track",
    tier: "near-term",
    fit: "mechanical design, manufacturing drawings, fast geometry execution",
    mission: "Use this to prove drafting discipline and part-model fluency while the math floor is still being rebuilt.",
  },
  {
    title: "Autodesk Fusion or Inventor certification",
    tier: "near-term",
    fit: "CAD-to-fab workflows, drawings, assemblies, and revision hygiene",
    mission: "Useful if your build path is prototype-heavy and you need visible hardware artifacts fast.",
  },
  {
    title: "FANUC or Siemens automation fundamentals",
    tier: "mid-term",
    fit: "factory automation, robotics cells, controls exposure, industrial systems",
    mission: "Closer to advanced manufacturing credibility than generic software certificates.",
  },
  {
    title: "PLC fundamentals",
    tier: "mid-term",
    fit: "controls logic, sequencing, troubleshooting, integration mindset",
    mission: "High-value if the goal is hardware, tooling, test, or manufacturing engineering instead of pure theory.",
  },
  {
    title: "IPC electronics assembly familiarity",
    tier: "mid-term",
    fit: "electronics handling, board work, lab discipline, manufacturing process exposure",
    mission: "Good signal when you need to show practical hardware seriousness, not just exam performance.",
  },
  {
    title: "Python numerical modeling portfolio pieces",
    tier: "always-on",
    fit: "test automation, data reduction, analysis scripts, engineering tooling",
    mission: "Not a formal cert, but directly useful and harder to fake than a badge.",
  },
];

const ORGANIZATION_TARGETS = [
  {
    title: "IEEE student or local professional branch",
    kind: "organization",
    fit: "electronics, controls, instrumentation, engineering network exposure",
  },
  {
    title: "ASME student or local section",
    kind: "organization",
    fit: "mechanical systems, manufacturing, design review culture, hardware vocabulary",
  },
  {
    title: "SAE chapter or Baja / Formula team",
    kind: "competition-team",
    fit: "fabrication, packaging, integration, testing, deadlines, subsystem ownership",
  },
  {
    title: "Robotics club or makerspace build team",
    kind: "club",
    fit: "hands-on iteration, mechatronics practice, quick prototyping, peer debugging",
  },
  {
    title: "Rocketry or propulsion club",
    kind: "club",
    fit: "structures, test discipline, systems thinking, aerospace-adjacent build culture",
  },
  {
    title: "CubeSat or small satellite student project",
    kind: "project-team",
    fit: "tight constraints, documentation, systems integration, cross-discipline execution",
  },
];

const COMPETITION_LADDER = [
  {
    title: "Formula SAE / Baja SAE",
    stage: "high-value build ladder",
    why: "Real packaging, fabrication, controls, testing, and deadline pressure.",
  },
  {
    title: "Robotics competition team or autonomous systems challenge",
    stage: "mechatronics ladder",
    why: "Good for controls, sensors, software-hardware integration, and debug discipline.",
  },
  {
    title: "Hackathons with hardware tracks",
    stage: "fast-iteration ladder",
    why: "Useful for speed, demos, scope control, and short-cycle execution under stress.",
  },
  {
    title: "University engineering design competitions",
    stage: "portfolio ladder",
    why: "Produces artifacts and reviews that translate better than passive coursework.",
  },
  {
    title: "Open-source hardware or lab-tooling contribution",
    stage: "asynchronous ladder",
    why: "Good fallback when no local team is available and you still need visible output.",
  },
  {
    title: "Personal capstone with test logs and build reviews",
    stage: "solo ladder",
    why: "If external infrastructure is weak, build your own evidence trail.",
  },
];

const DEFAULT_STATE = {
  missionStart: new Date().toISOString().slice(0, 10),
  threshold: 70,
  deviceRole: "operator",
  syncEndpoint: "",
  timers: {
    timed: 90,
    rebuild: 60,
    applied: 90,
    aux: 45,
  },
  dailyLogs: {},
};

const sampleProgress = {
  1: { completed: true, score: 58, note: "baseline complete, algebra and timing weak" },
  2: { completed: true, score: 63, note: "algebra cleaner after rebuild" },
  3: { completed: true, score: 61, note: "units still dropping under speed" },
  4: { completed: false, score: 0, note: "graph-reading block delayed by drift" },
};

let state = structuredClone(DEFAULT_STATE);
let schedule = [];
let deferredPrompt = null;
let activeTimer = null;
let timerInterval = null;

function parseCsv(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function setStatus(message) {
  const target = document.getElementById("mission-status");
  if (target) target.textContent = message;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function getMissionStartDate() {
  return new Date(`${state.missionStart}T00:00:00`);
}

function getElapsedDays(now = new Date()) {
  return Math.max(0, Math.floor((now - getMissionStartDate()) / DAY_MILLISECONDS));
}

function getMissionDay(now = new Date()) {
  return clamp(getElapsedDays(now) + 1, 1, MISSION_LENGTH);
}

function getCurrentEntry() {
  return schedule.find((entry) => Number(entry.Day) === getMissionDay()) || schedule[0];
}

function getCurrentPhaseEntries() {
  const current = getCurrentEntry();
  return schedule.filter((entry) => entry.Phase === current.Phase);
}

function getPhaseMeta() {
  const entries = getCurrentPhaseEntries();
  const start = Number(entries[0]?.Day || 1);
  const end = Number(entries[entries.length - 1]?.Day || start);
  const currentDay = getMissionDay();
  return {
    label: entries[0]?.Phase || "Foundation Reset",
    start,
    end,
    remaining: Math.max(0, end - currentDay),
    progress: Math.round(((currentDay - start + 1) / Math.max(1, end - start + 1)) * 100),
  };
}

function getCompletionStats() {
  const completed = Object.values(state.dailyLogs).filter((entry) => entry.completed).length;
  const currentDay = getMissionDay();
  const completionPercent = Math.round((completed / MISSION_LENGTH) * 100);
  const elapsedPercent = Math.round((currentDay / MISSION_LENGTH) * 100);
  return { completed, currentDay, completionPercent, elapsedPercent };
}

function getTrajectoryAlerts() {
  const { completed, currentDay, completionPercent, elapsedPercent } = getCompletionStats();
  const latestLog = state.dailyLogs[currentDay] || {};
  const score = Number(latestLog.score || document.getElementById("today-score")?.value || 0);
  const threshold = Number(state.threshold || 70);
  const alerts = [];

  if (completed < currentDay - 1) {
    alerts.push({
      kind: completed < currentDay - 3 ? "fail" : "warn",
      text: `Schedule drift detected. ${currentDay - 1 - completed} day(s) are not marked complete.`,
    });
  } else {
    alerts.push({ kind: "pass", text: "Mission completion is keeping pace with elapsed days." });
  }

  if (score && score < threshold) {
    alerts.push({
      kind: score < threshold - 10 ? "fail" : "warn",
      text: `Today's score is ${score}%. Threshold is ${threshold}%. Immediate rebuild required.`,
    });
  } else if (score) {
    alerts.push({ kind: "pass", text: `Today's score is ${score}%, at or above threshold.` });
  }

  if (elapsedPercent - completionPercent > 8) {
    alerts.push({
      kind: "fail",
      text: `Trajectory is lagging by ${elapsedPercent - completionPercent} percentage points against mission time.`,
    });
  }

  return alerts;
}

function saveState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (parsed && typeof parsed === "object") {
      state = {
        ...structuredClone(DEFAULT_STATE),
        ...parsed,
        timers: { ...DEFAULT_STATE.timers, ...(parsed.timers || {}) },
        dailyLogs: parsed.dailyLogs || {},
      };
    }
  } catch {
    state = structuredClone(DEFAULT_STATE);
  }
}

function syncFormFromState() {
  document.getElementById("mission-start").value = state.missionStart;
  document.getElementById("mission-threshold").value = state.threshold;
  document.getElementById("device-role").value = state.deviceRole || "operator";
  document.getElementById("sync-endpoint").value = state.syncEndpoint || "";
  document.getElementById("timed-minutes").value = state.timers.timed;
  document.getElementById("rebuild-minutes").value = state.timers.rebuild;
  document.getElementById("applied-minutes").value = state.timers.applied;
  document.getElementById("aux-minutes").value = state.timers.aux;
}

function syncStateFromForm() {
  state.missionStart = document.getElementById("mission-start").value || DEFAULT_STATE.missionStart;
  state.threshold = clamp(document.getElementById("mission-threshold").value, 1, 100);
  state.deviceRole = document.getElementById("device-role").value || "operator";
  state.syncEndpoint = document.getElementById("sync-endpoint").value.trim();
  state.timers.timed = clamp(document.getElementById("timed-minutes").value, 5, 360);
  state.timers.rebuild = clamp(document.getElementById("rebuild-minutes").value, 5, 360);
  state.timers.applied = clamp(document.getElementById("applied-minutes").value, 5, 360);
  state.timers.aux = clamp(document.getElementById("aux-minutes").value, 5, 240);
}

function renderMissionSummary() {
  const target = document.getElementById("mission-summary");
  if (!target) return;
  const { completed, currentDay, completionPercent } = getCompletionStats();
  const phase = getPhaseMeta();
  const missionEnd = new Date(getMissionStartDate().getTime() + (MISSION_LENGTH - 1) * DAY_MILLISECONDS);
  const remaining = Math.max(0, Math.ceil((missionEnd - new Date()) / DAY_MILLISECONDS));
  const latestScore = Number(state.dailyLogs[currentDay]?.score || document.getElementById("today-score")?.value || 0);

  target.innerHTML = `
    <div class="section-header">
      <h2>Mission Summary</h2>
      <p>Hard countdowns, visible gates, and zero ambiguity about the current day.</p>
    </div>
    <div class="summary-grid">
      <div class="stat-card"><div class="metric-label">Mission Day</div><div class="metric-value">${currentDay}</div></div>
      <div class="stat-card"><div class="metric-label">Completed Days</div><div class="metric-value">${completed}</div></div>
      <div class="stat-card"><div class="metric-label">Mission End</div><div class="metric-value">${remaining}d</div></div>
      <div class="stat-card"><div class="metric-label">Today Score</div><div class="metric-value">${latestScore || "--"}</div></div>
    </div>
    <div class="chip-row">
      <span class="chip">current phase: ${escapeHtml(phase.label)}</span>
      <span class="chip">completion: ${completionPercent}%</span>
      <span class="chip">threshold: ${state.threshold}%</span>
      <span class="chip">end date: ${formatDate(missionEnd)}</span>
      <span class="chip">role: ${escapeHtml(state.deviceRole || "operator")}</span>
    </div>
  `;
}

function renderTrajectoryPanel() {
  const target = document.getElementById("trajectory-panel");
  if (!target) return;
  const { completionPercent, elapsedPercent, currentDay } = getCompletionStats();
  const alerts = getTrajectoryAlerts();

  target.innerHTML = `
    <div class="section-header">
      <h2>Trajectory</h2>
      <p>Detect drift early and force correction instead of rationalizing it.</p>
    </div>
    <div class="trajectory-grid">
      <div>
        <div class="subhead">Mission completion</div>
        <div class="trajectory-bar"><div class="trajectory-fill" style="width:${completionPercent}%"></div></div>
        <p class="meta-line">${completionPercent}% of days marked complete</p>
      </div>
      <div>
        <div class="subhead">Elapsed mission time</div>
        <div class="trajectory-bar"><div class="trajectory-fill" style="width:${elapsedPercent}%"></div></div>
        <p class="meta-line">${elapsedPercent}% of the 90-day window has elapsed by mission day ${currentDay}</p>
      </div>
      <div class="alert-list">
        ${alerts.map((alert) => `<div class="alert-item ${alert.kind}">${escapeHtml(alert.text)}</div>`).join("")}
      </div>
    </div>
  `;
}

function renderCapabilityPanel() {
  const target = document.getElementById("capability-panel");
  if (!target) return;
  target.innerHTML = `
    <div class="section-header">
      <h2>Target Capability Stack</h2>
      <p>Career-vector focus for aerospace and advanced manufacturing paths without pretending to know a single employer's private rubric.</p>
    </div>
    <div class="capability-grid">
      ${TARGET_CAPABILITIES.map((item) => `
        <div class="capability-card">
          <div class="phase-label">${escapeHtml(item.title)}</div>
          <p>${escapeHtml(item.detail)}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderCertificationPanel() {
  const target = document.getElementById("certification-panel");
  if (!target) return;
  target.innerHTML = `
    <div class="section-header">
      <h2>Certification Lanes</h2>
      <p>Practical lanes that map to hardware, manufacturing, controls, and toolchain credibility.</p>
    </div>
    <div class="reference-grid">
      ${CERTIFICATION_LANES.map((item) => `
        <div class="reference-card">
          <div class="reference-title">${escapeHtml(item.title)}</div>
          <div class="chip-row">
            <span class="chip">priority: ${escapeHtml(item.tier)}</span>
            <span class="chip">fit: ${escapeHtml(item.fit)}</span>
          </div>
          <p class="reference-meta">${escapeHtml(item.mission)}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderOrganizationsPanel() {
  const target = document.getElementById("organizations-panel");
  if (!target) return;
  target.innerHTML = `
    <div class="section-header">
      <h2>Clubs And Organizations</h2>
      <p>Use these as force multipliers for lab access, peer review, and visible build output.</p>
    </div>
    <div class="reference-grid">
      ${ORGANIZATION_TARGETS.map((item) => `
        <div class="reference-card">
          <div class="reference-title">${escapeHtml(item.title)}</div>
          <div class="chip-row">
            <span class="chip">type: ${escapeHtml(item.kind)}</span>
          </div>
          <p class="reference-meta">${escapeHtml(item.fit)}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderCompetitionPanel() {
  const target = document.getElementById("competition-panel");
  if (!target) return;
  target.innerHTML = `
    <div class="section-header">
      <h2>Competition Milestones</h2>
      <p>External deadlines that force execution, review, and evidence instead of vague preparation.</p>
    </div>
    <div class="reference-grid">
      ${COMPETITION_LADDER.map((item) => `
        <div class="reference-card">
          <div class="reference-title">${escapeHtml(item.title)}</div>
          <div class="chip-row">
            <span class="chip">lane: ${escapeHtml(item.stage)}</span>
          </div>
          <p class="reference-meta">${escapeHtml(item.why)}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderPhasePanel() {
  const target = document.getElementById("phase-panel");
  if (!target) return;
  const phase = getPhaseMeta();
  const entries = getCurrentPhaseEntries();
  const currentEntry = getCurrentEntry();
  target.innerHTML = `
    <div class="section-header">
      <h2>Current Phase</h2>
      <p>Phase countdown and immediate objectives for the current segment.</p>
    </div>
    <div class="phase-grid">
      <div class="phase-card">
        <div class="metric-label">Phase</div>
        <div class="phase-label">${escapeHtml(phase.label)}</div>
        <p class="meta-line">Days ${phase.start}-${phase.end}</p>
      </div>
      <div class="phase-card">
        <div class="metric-label">Phase Countdown</div>
        <div class="timer-value">${phase.remaining}d</div>
        <p class="meta-line">${phase.progress}% through the phase</p>
      </div>
      <div class="phase-card">
        <div class="metric-label">Today's Focus</div>
        <div class="phase-label">${escapeHtml(currentEntry["Primary Focus"] || "")}</div>
        <p class="meta-line">Checkpoint: ${escapeHtml(currentEntry.Checkpoint || "")}</p>
      </div>
      <ul class="detail-list">
        ${entries.slice(0, 4).map((entry) => `<li>Day ${entry.Day}: ${escapeHtml(entry["Primary Focus"])} -> ${escapeHtml(entry["Metric Goal"] || "")}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderDayPanel() {
  const target = document.getElementById("day-panel");
  if (!target) return;
  const currentEntry = getCurrentEntry();
  const currentDay = getMissionDay();
  const log = state.dailyLogs[currentDay] || {};
  target.innerHTML = `
    <div class="section-header">
      <h2>Today's Mission</h2>
      <p>Single source of truth for the active day.</p>
    </div>
    <div class="phase-grid">
      <div class="day-card">
        <div class="metric-label">Day</div>
        <div class="day-number">${currentEntry.Day}</div>
        <p class="meta-line">${escapeHtml(currentEntry.Phase)}</p>
      </div>
      <div class="day-card">
        <div class="metric-label">Timed Block</div>
        <div class="phase-label">${escapeHtml(currentEntry["Timed Block"] || "")}</div>
      </div>
      <div class="day-card">
        <div class="metric-label">Rebuild Block</div>
        <div class="phase-label">${escapeHtml(currentEntry["Rebuild Block"] || "")}</div>
      </div>
      <div class="day-card">
        <div class="metric-label">Applied Block</div>
        <div class="phase-label">${escapeHtml(currentEntry["Applied Block"] || "")}</div>
      </div>
      <div class="day-card">
        <div class="metric-label">Artifact</div>
        <div class="phase-label">${escapeHtml(currentEntry.Artifact || "")}</div>
      </div>
      <div class="day-card">
        <div class="metric-label">Metric Goal</div>
        <div class="phase-label">${escapeHtml(currentEntry["Metric Goal"] || "")}</div>
      </div>
      <div class="day-card">
        <div class="metric-label">Log State</div>
        <div class="phase-label">${log.completed ? "complete" : "active"}</div>
        <p class="meta-line">${escapeHtml(log.note || "No drift note recorded yet.")}</p>
      </div>
    </div>
  `;
}

function formatTimer(seconds) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, "0")).join(":");
}

function notify(title, body) {
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "./vite.svg", badge: "./vite.svg" });
  }
}

function clearTimerInterval() {
  if (timerInterval) window.clearInterval(timerInterval);
  timerInterval = null;
}

function startTimer(kind) {
  const durationMinutes = Number(state.timers[kind] || 0);
  activeTimer = {
    kind,
    endAt: Date.now() + durationMinutes * 60000,
    durationMinutes,
  };
  tickTimer();
  clearTimerInterval();
  timerInterval = window.setInterval(tickTimer, 1000);
}

function pauseTimer() {
  if (!activeTimer) return;
  activeTimer.remainingSeconds = Math.max(0, Math.round((activeTimer.endAt - Date.now()) / 1000));
  activeTimer.endAt = null;
  clearTimerInterval();
  renderTimerPanel();
}

function resumeTimer() {
  if (!activeTimer?.remainingSeconds) return;
  activeTimer.endAt = Date.now() + activeTimer.remainingSeconds * 1000;
  delete activeTimer.remainingSeconds;
  clearTimerInterval();
  timerInterval = window.setInterval(tickTimer, 1000);
  tickTimer();
}

function resetTimer() {
  activeTimer = null;
  clearTimerInterval();
  renderTimerPanel();
}

function tickTimer() {
  if (!activeTimer?.endAt) {
    renderTimerPanel();
    return;
  }
  const remainingSeconds = Math.max(0, Math.round((activeTimer.endAt - Date.now()) / 1000));
  if (remainingSeconds <= 0) {
    clearTimerInterval();
    const finishedKind = activeTimer.kind;
    activeTimer.expired = true;
    activeTimer.remainingSeconds = 0;
    delete activeTimer.endAt;
    renderTimerPanel();
    setStatus(`${finishedKind} block expired. Move immediately to review or the next block.`);
    notify("Dragonfire Protocol", `${finishedKind} block expired. Transition now.`);
    return;
  }
  activeTimer.remainingSeconds = remainingSeconds;
  renderTimerPanel();
}

function renderTimerPanel() {
  const target = document.getElementById("timer-panel");
  if (!target) return;
  const blocks = [
    { key: "timed", label: "Timed Block", minutes: state.timers.timed },
    { key: "rebuild", label: "Rebuild Block", minutes: state.timers.rebuild },
    { key: "applied", label: "Applied Block", minutes: state.timers.applied },
    { key: "aux", label: "Flash / Log", minutes: state.timers.aux },
  ];
  target.innerHTML = `
    <div class="section-header">
      <h2>Countdown Control</h2>
      <p>Run one block at a time. When it expires, force the transition.</p>
    </div>
    <div class="timer-grid">
      ${blocks.map((block) => {
        const isActive = activeTimer?.kind === block.key;
        const value = isActive
          ? formatTimer(activeTimer.remainingSeconds ?? Math.round((block.minutes || 0) * 60))
          : formatTimer(block.minutes * 60);
        const className = `timer-card${isActive ? " running" : ""}${isActive && activeTimer.expired ? " expired" : ""}`;
        return `
          <div class="${className}">
            <div class="metric-label">${block.label}</div>
            <div class="timer-value">${value}</div>
            <p class="meta-line">${block.minutes} minute block</p>
            <div class="timer-controls">
              <button type="button" data-timer-start="${block.key}">Start</button>
            </div>
          </div>
        `;
      }).join("")}
    </div>
    <div class="timer-controls">
      <button type="button" id="pause-timer">Pause</button>
      <button type="button" id="resume-timer">Resume</button>
      <button type="button" id="reset-timer">Reset</button>
    </div>
  `;

  target.querySelectorAll("[data-timer-start]").forEach((button) => {
    button.addEventListener("click", () => startTimer(button.dataset.timerStart));
  });
  document.getElementById("pause-timer")?.addEventListener("click", pauseTimer);
  document.getElementById("resume-timer")?.addEventListener("click", resumeTimer);
  document.getElementById("reset-timer")?.addEventListener("click", resetTimer);
}

function renderWeekPanel() {
  const target = document.getElementById("week-panel");
  if (!target) return;
  const currentDay = getMissionDay();
  const weekStart = Math.floor((currentDay - 1) / 7) * 7 + 1;
  const entries = schedule.filter((entry) => Number(entry.Day) >= weekStart && Number(entry.Day) < weekStart + 7);
  target.innerHTML = `
    <div class="section-header">
      <h2>Active Week</h2>
      <p>Seven-day slice for immediate mission control.</p>
    </div>
    <ul class="week-list">
      ${entries.map((entry) => {
        const log = state.dailyLogs[entry.Day] || {};
        const isActive = Number(entry.Day) === currentDay;
        const classNames = ["week-row", log.completed ? "complete" : "", isActive ? "active" : ""].filter(Boolean).join(" ");
        return `
          <li class="${classNames}">
            <h3>Day ${entry.Day}: ${escapeHtml(entry["Primary Focus"] || "")}</h3>
            <p>${escapeHtml(entry["Timed Block"] || "")}</p>
            <p>${escapeHtml(entry["Metric Goal"] || "")}</p>
            <p>${escapeHtml(log.note || entry.Checkpoint || "")}</p>
          </li>
        `;
      }).join("")}
    </ul>
  `;
}

function renderAll() {
  renderMissionSummary();
  renderTrajectoryPanel();
  renderCapabilityPanel();
  renderCertificationPanel();
  renderOrganizationsPanel();
  renderCompetitionPanel();
  renderPhasePanel();
  renderDayPanel();
  renderTimerPanel();
  renderWeekPanel();
}

function saveConfig() {
  syncStateFromForm();
  saveState();
  renderAll();
  setStatus("Mission config saved.");
}

async function pullSync() {
  syncStateFromForm();
  if (!state.syncEndpoint) {
    setStatus("Add a sync endpoint before pulling remote mission state.");
    return;
  }
  try {
    const response = await fetch(state.syncEndpoint, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload?.state) throw new Error("Missing state payload");
    state = {
      ...structuredClone(DEFAULT_STATE),
      ...payload.state,
      timers: { ...DEFAULT_STATE.timers, ...(payload.state.timers || {}) },
      dailyLogs: payload.state.dailyLogs || {},
    };
    saveState();
    syncFormFromState();
    renderAll();
    setStatus(`Pulled remote mission state from ${state.syncEndpoint}.`);
  } catch (error) {
    setStatus(`Pull failed: ${error.message}`);
  }
}

async function pushSync() {
  syncStateFromForm();
  if (!state.syncEndpoint) {
    setStatus("Add a sync endpoint before pushing mission state.");
    return;
  }
  try {
    const response = await fetch(state.syncEndpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, updatedAt: new Date().toISOString() }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setStatus(`Pushed mission state to ${state.syncEndpoint}.`);
  } catch (error) {
    setStatus(`Push failed: ${error.message}`);
  }
}

function markCurrentDayComplete() {
  const currentDay = getMissionDay();
  const score = clamp(document.getElementById("today-score").value, 0, 100);
  const note = document.getElementById("drift-note").value.trim();
  state.dailyLogs[currentDay] = { completed: true, score, note, completedAt: new Date().toISOString() };
  saveState();
  renderAll();
  const threshold = Number(state.threshold || 70);
  if (score < threshold) {
    notify("Dragonfire Protocol", `Day ${currentDay} closed below threshold at ${score}%. Immediate rebuild next cycle.`);
  } else {
    notify("Dragonfire Protocol", `Day ${currentDay} complete at ${score}%. Mission remains on track.`);
  }
  setStatus(`Day ${currentDay} marked complete.`);
}

function exportMission() {
  const payload = {
    exportedAt: new Date().toISOString(),
    state,
    currentDay: getMissionDay(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "dragonfire-protocol.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    setStatus("Notifications are not supported in this browser.");
    return;
  }
  const permission = await Notification.requestPermission();
  setStatus(permission === "granted" ? "Alerts enabled." : "Notification permission was not granted.");
}

function seedSample() {
  state.dailyLogs = { ...sampleProgress };
  saveState();
  renderAll();
  setStatus("Loaded sample mission progress.");
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      // QA-5b: scope the worker to the Dragonfire page only, and drop the
      // old site-wide (root-scope) registration from earlier versions.
      const rootScope = new URL("./", window.location.href).href;
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs
          .filter((reg) => reg.scope === rootScope && reg.active?.scriptURL.endsWith("/dragonfire-sw.js"))
          .map((reg) => reg.unregister()),
      );
      await navigator.serviceWorker.register("./dragonfire-sw.js", {
        scope: "./dragonfire-protocol",
      });
    } catch {
      setStatus("Service worker registration failed.");
    }
  }
}

function bindInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    const button = document.getElementById("install-app");
    if (button) button.disabled = false;
  });
  document.getElementById("install-app")?.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    deferredPrompt = null;
    document.getElementById("install-app").disabled = true;
  });
}

function bindEvents() {
  document.getElementById("save-config")?.addEventListener("click", saveConfig);
  document.getElementById("seed-sample")?.addEventListener("click", seedSample);
  document.getElementById("export-mission")?.addEventListener("click", exportMission);
  document.getElementById("enable-notifications")?.addEventListener("click", enableNotifications);
  document.getElementById("complete-day")?.addEventListener("click", markCurrentDayComplete);
  document.getElementById("pull-sync")?.addEventListener("click", pullSync);
  document.getElementById("push-sync")?.addEventListener("click", pushSync);
}

function init() {
  schedule = parseCsv(missionCsv);
  loadState();
  syncFormFromState();
  renderAll();
  bindEvents();
  bindInstallPrompt();
  registerServiceWorker();
}

init();