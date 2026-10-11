const STORAGE_KEY = "portfolio.examDiagnostics.attempts";

const FAILURE_CLASSES = [
  "algebra fluency",
  "trig identities",
  "vectors",
  "unit conversion",
  "force balance",
  "circuits basics",
  "graph reading",
  "time-pressure error rate",
];

const sampleAttempt = {
  label: "Stage 1 cold diagnostic",
  date: new Date().toISOString().slice(0, 10),
  overallCorrect: 24,
  overallTotal: 36,
  targetThreshold: 70,
  targetWindow: 45,
  transcriptText:
    "Misread two graph prompts under time pressure. Circuit questions slowed down after the first algebra miss. Need cleaner unit conversion and vectors review.",
  videoName: "practice-attempt-01.mp4",
  skills: {
    "algebra fluency": 58,
    "trig identities": 52,
    vectors: 61,
    "unit conversion": 49,
    "force balance": 56,
    "circuits basics": 63,
    "graph reading": 68,
    "time-pressure error rate": 43,
  },
};

let attempts = [];

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clampPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function setStatus(message) {
  const status = document.getElementById("diagnostics-status");
  if (status) status.textContent = message;
}

function createSkillInputs() {
  const root = document.getElementById("skill-inputs");
  if (!root) return;
  root.innerHTML = FAILURE_CLASSES.map(
    (skill) => `
      <div class="skill-row">
        <div class="skill-label">${escapeHtml(skill)}</div>
        <label>
          Score %
          <input data-skill-input="${escapeHtml(skill)}" type="number" min="0" max="100" value="0" />
        </label>
        <label>
          Floor %
          <input data-skill-floor="${escapeHtml(skill)}" type="number" min="0" max="100" value="70" disabled />
        </label>
        <label>
          Trend
          <input data-skill-trend="${escapeHtml(skill)}" type="text" value="baseline" disabled />
        </label>
      </div>
    `,
  ).join("");
}

function readAttemptForm() {
  const label = document.getElementById("attempt-label")?.value.trim() || "Untitled Attempt";
  const date = document.getElementById("attempt-date")?.value || new Date().toISOString().slice(0, 10);
  const overallCorrect = Number(document.getElementById("overall-correct")?.value || 0);
  const overallTotal = Number(document.getElementById("overall-total")?.value || 36);
  const targetThreshold = Number(document.getElementById("target-threshold")?.value || 70);
  const targetWindow = Number(document.getElementById("target-window")?.value || 45);
  const transcriptText = document.getElementById("transcript-text")?.value || "";
  const videoName = document.getElementById("video-upload")?.files?.[0]?.name || "";
  const skills = Object.fromEntries(
    FAILURE_CLASSES.map((skill) => {
      const value = document.querySelector(`[data-skill-input="${CSS.escape(skill)}"]`)?.value || 0;
      return [skill, clampPercent(value)];
    }),
  );

  return {
    label,
    date,
    overallCorrect,
    overallTotal,
    targetThreshold,
    targetWindow,
    transcriptText,
    videoName,
    skills,
  };
}

function saveAttempts() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(attempts));
}

function loadAttempts() {
  try {
    attempts = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(attempts)) attempts = [];
  } catch {
    attempts = [];
  }
}

function loadAttemptIntoForm(attempt) {
  document.getElementById("attempt-label").value = attempt.label || "";
  document.getElementById("attempt-date").value = attempt.date || "";
  document.getElementById("overall-correct").value = attempt.overallCorrect ?? 0;
  document.getElementById("overall-total").value = attempt.overallTotal ?? 36;
  document.getElementById("target-threshold").value = attempt.targetThreshold ?? 70;
  document.getElementById("target-window").value = attempt.targetWindow ?? 45;
  document.getElementById("transcript-text").value = attempt.transcriptText || "";
  FAILURE_CLASSES.forEach((skill) => {
    const input = document.querySelector(`[data-skill-input="${CSS.escape(skill)}"]`);
    if (input) input.value = attempt.skills?.[skill] ?? 0;
  });
}

function getOverallPercent(attempt) {
  const total = Number(attempt.overallTotal || 0);
  const correct = Number(attempt.overallCorrect || 0);
  if (!total) return 0;
  return Math.round((correct / total) * 100);
}

function formatDaysRemaining(attempt) {
  if (!attempts.length) return "n/a";
  const firstDate = new Date(attempts[0].date || Date.now());
  const currentDate = new Date(attempt.date || Date.now());
  const daysElapsed = Math.max(0, Math.round((currentDate - firstDate) / 86400000));
  const remaining = Number(attempt.targetWindow || 45) - daysElapsed;
  return `${remaining}d`;
}

function colorForPercent(percent, threshold) {
  const value = clampPercent(percent);
  if (value >= threshold + 10) return "rgba(96, 214, 146, 0.38)";
  if (value >= threshold) return "rgba(166, 214, 96, 0.28)";
  if (value >= threshold - 10) return "rgba(225, 184, 86, 0.28)";
  return "rgba(224, 95, 95, 0.28)";
}

function updateTrendFields() {
  FAILURE_CLASSES.forEach((skill) => {
    const trendInput = document.querySelector(`[data-skill-trend="${CSS.escape(skill)}"]`);
    if (!trendInput) return;
    if (attempts.length < 2) {
      trendInput.value = "baseline";
      return;
    }
    const latest = attempts[attempts.length - 1].skills?.[skill] ?? 0;
    const previous = attempts[attempts.length - 2].skills?.[skill] ?? 0;
    const delta = latest - previous;
    if (delta > 4) trendInput.value = `up ${delta}`;
    else if (delta < -4) trendInput.value = `down ${Math.abs(delta)}`;
    else trendInput.value = "flat";
  });
}

function renderSummary() {
  const target = document.getElementById("diagnostics-summary");
  if (!target) return;

  if (!attempts.length) {
    target.innerHTML = "<p>No attempts saved yet.</p>";
    return;
  }

  const latest = attempts[attempts.length - 1];
  const overall = getOverallPercent(latest);
  const threshold = Number(latest.targetThreshold || 70);
  const hits = FAILURE_CLASSES.filter((skill) => (latest.skills?.[skill] ?? 0) >= threshold).length;

  target.innerHTML = `
    <h2>Summary</h2>
    <div class="summary-grid">
      <div class="summary-stat">
        <span class="summary-stat-label">Latest Overall</span>
        <span class="summary-stat-value">${overall}%</span>
      </div>
      <div class="summary-stat">
        <span class="summary-stat-label">Threshold</span>
        <span class="summary-stat-value">${threshold}%</span>
      </div>
      <div class="summary-stat">
        <span class="summary-stat-label">Classes At Goal</span>
        <span class="summary-stat-value">${hits}/${FAILURE_CLASSES.length}</span>
      </div>
      <div class="summary-stat">
        <span class="summary-stat-label">Days Remaining</span>
        <span class="summary-stat-value">${formatDaysRemaining(latest)}</span>
      </div>
    </div>
  `;
}

function renderHeatmap() {
  const target = document.getElementById("diagnostics-heatmap");
  if (!target) return;
  if (!attempts.length) {
    target.innerHTML = "<p>No heatmap yet.</p>";
    return;
  }

  const threshold = Number(attempts[attempts.length - 1].targetThreshold || 70);
  const header = attempts
    .map((attempt, index) => `<th>${escapeHtml(attempt.label || `Attempt ${index + 1}`)}</th>`)
    .join("");
  const rows = FAILURE_CLASSES.map((skill) => {
    const cells = attempts
      .map((attempt) => {
        const percent = attempt.skills?.[skill] ?? 0;
        return `<td><div class="heatmap-cell" style="background:${colorForPercent(percent, threshold)}">${percent}%</div></td>`;
      })
      .join("");
    return `<tr><td>${escapeHtml(skill)}</td>${cells}</tr>`;
  }).join("");

  target.innerHTML = `
    <h2>Failure-Class Heatmap</h2>
    <table class="heatmap-table">
      <thead><tr><th>Class</th>${header}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderRecommendations() {
  const target = document.getElementById("diagnostics-recommendations");
  if (!target) return;
  if (!attempts.length) {
    target.innerHTML = "<p>No recommendations yet.</p>";
    return;
  }

  const latest = attempts[attempts.length - 1];
  const threshold = Number(latest.targetThreshold || 70);
  const weakest = FAILURE_CLASSES.map((skill) => ({ skill, value: latest.skills?.[skill] ?? 0 }))
    .sort((left, right) => left.value - right.value)
    .slice(0, 4);
  const regressions = attempts.length < 2
    ? []
    : FAILURE_CLASSES.filter((skill) => {
        const current = latest.skills?.[skill] ?? 0;
        const prior = attempts[attempts.length - 2].skills?.[skill] ?? 0;
        return prior - current >= 8;
      });

  target.innerHTML = `
    <h2>Recommendations</h2>
    <h3>Immediate Weak Points</h3>
    <ul class="recommendation-list">
      ${weakest.map((entry) => `<li>${escapeHtml(entry.skill)} at ${entry.value}%: drive one targeted practice block before the next full attempt.</li>`).join("")}
    </ul>
    <h3>Regression Flags</h3>
    ${regressions.length ? `<ul class="recommendation-list">${regressions.map((skill) => `<li>${escapeHtml(skill)} fell by 8 points or more since the last attempt.</li>`).join("")}</ul>` : "<p>No major regression flags from the previous attempt.</p>"}
    <h3>Threshold Check</h3>
    <p>${FAILURE_CLASSES.filter((skill) => (latest.skills?.[skill] ?? 0) >= threshold).length} of ${FAILURE_CLASSES.length} classes are at or above ${threshold}%.</p>
  `;
}

function renderAttempts() {
  const target = document.getElementById("diagnostics-attempts");
  if (!target) return;
  if (!attempts.length) {
    target.innerHTML = "<p>No attempt history yet.</p>";
    return;
  }

  target.innerHTML = `
    <h2>Attempt History</h2>
    ${attempts
      .slice()
      .reverse()
      .map(
        (attempt) => `
          <article class="attempt-card">
            <h3>${escapeHtml(attempt.label)}</h3>
            <p>${escapeHtml(attempt.date)} | Overall ${getOverallPercent(attempt)}% (${attempt.overallCorrect}/${attempt.overallTotal})</p>
            <p>${attempt.videoName ? `Video: ${escapeHtml(attempt.videoName)}` : "No video attached"}</p>
            <p>${escapeHtml((attempt.transcriptText || "").slice(0, 220))}</p>
          </article>
        `,
      )
      .join("")}
  `;
}

function renderAll() {
  updateTrendFields();
  renderSummary();
  renderHeatmap();
  renderRecommendations();
  renderAttempts();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(attempts, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "exam-diagnostics-attempts.json";
  link.click();
  URL.revokeObjectURL(url);
}

function bindTranscriptUpload() {
  const upload = document.getElementById("transcript-upload");
  upload?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    document.getElementById("transcript-text").value = await file.text();
    setStatus(`Loaded transcript: ${file.name}`);
  });
}

function bindActions() {
  document.getElementById("save-attempt")?.addEventListener("click", () => {
    const attempt = readAttemptForm();
    attempts.push(attempt);
    attempts.sort((left, right) => String(left.date).localeCompare(String(right.date)));
    saveAttempts();
    renderAll();
    setStatus(`Saved ${attempt.label}.`);
  });

  document.getElementById("load-sample")?.addEventListener("click", () => {
    loadAttemptIntoForm(sampleAttempt);
    setStatus("Loaded sample attempt into the form.");
  });

  document.getElementById("export-json")?.addEventListener("click", () => {
    exportJson();
    setStatus("Exported attempt history JSON.");
  });

  document.getElementById("clear-data")?.addEventListener("click", () => {
    attempts = [];
    window.localStorage.removeItem(STORAGE_KEY);
    renderAll();
    setStatus("Cleared saved attempt history.");
  });
}

function initDefaults() {
  document.getElementById("attempt-date").value = new Date().toISOString().slice(0, 10);
}

function main() {
  createSkillInputs();
  initDefaults();
  loadAttempts();
  bindTranscriptUpload();
  bindActions();
  renderAll();
}

main();