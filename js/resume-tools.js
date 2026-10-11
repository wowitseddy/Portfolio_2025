const STORAGE_KEYS = {
  source: "portfolio.resumeTools.source",
  groups: "portfolio.resumeTools.groups",
  index: "portfolio.resumeTools.index",
  role: "portfolio.resumeTools.role",
  company: "portfolio.resumeTools.company",
  focus: "portfolio.resumeTools.focus",
};

const sampleResume = `DEVIN EDWARDS
SYSTEMS-LEVEL SOFTWARE, SIMULATION, AND APPLIED ML WORKFLOWS

SUMMARY
- Builds simulation-first interfaces, rapid debugging loops, visual systems, and analyst-facing tooling.
- Focuses on measurable execution across engineering, research, autonomy-adjacent systems, and technical media workflows.

TARGET HIGHLIGHTS
- 100,000 mutation campaign visibility with throughput, latency, and failure distribution tracking.
- Three.js, Vite, JS, Python, research tooling, deployment hardening, and evidence-first iteration.
- Resume material can be re-tuned quickly for role-specific language, deliverables, and employer handling constraints.

PROJECTS
- Sentinel Construct: mutation intelligence matrix, scenario compilation, research artifact generation.
- Biomed Indexing Tool: retrieval, evidence surfacing, and analyst-facing synthesis.
- Portfolio_2025: simulation-first interface, archive media surfacing, deployment workflow, and interactive projection tooling.
- Colony Intelligence Framework: manufacturing/autonomy simulation harness, observability, and mission-style scoring.

SKILLS
- Three.js, Vite, JavaScript, Python, systems debugging, simulation framing, rapid delivery.
- Research tooling, indexing, observability, deployment, and operator-facing interface design.
- PyTorch, JAX, CUDA, ROS2-adjacent workflows, and experimentation infrastructure.
`;

const FALLBACK_EMPLOYER_GROUPS = [
  {
    id: "frontier-systems",
    label: "Frontier Systems & Autonomy",
    tags: ["systems", "autonomy", "robotics", "manufacturing"],
    sources: [
      {
        type: "greenhouse-board",
        company: "Anduril Industries",
        boardToken: "andurilindustries",
        tags: ["defense", "autonomy", "embedded"],
      },
      {
        type: "greenhouse-board",
        company: "Astranis",
        boardToken: "astranis",
        tags: ["space", "systems", "manufacturing"],
      },
    ],
  },
  {
    id: "applied-ml",
    label: "Applied ML & Research Interfaces",
    tags: ["ml", "research", "nlp", "product"],
    sources: [
      {
        type: "greenhouse-board",
        company: "Anthropic",
        boardToken: "anthropic",
        tags: ["llm", "alignment", "research"],
      },
      {
        type: "lever-postings",
        company: "Scale AI",
        site: "scaleai",
        tags: ["ml", "data", "platform"],
      },
    ],
  },
];

const FALLBACK_SKILL_TAXONOMY = [
  {
    id: "python",
    label: "Python",
    category: "core",
    terms: ["python"],
    todo: "Keep Python visible in the top summary and project bullets.",
    priority: 1,
  },
  {
    id: "javascript",
    label: "JavaScript",
    category: "core",
    terms: ["javascript", "js", "ecmascript"],
    todo: "Keep JavaScript delivery examples tied to shipped interfaces and tooling.",
    priority: 1,
  },
  {
    id: "simulation",
    label: "Simulation",
    category: "systems",
    terms: ["simulation", "digital twin", "simulator"],
    todo: "Lead with simulation-first work when the role is systems, robotics, or manufacturing adjacent.",
    priority: 1,
  },
  {
    id: "scikit-learn",
    label: "Scikit-learn",
    category: "ml",
    terms: ["scikit-learn", "sklearn", "sci-kit"],
    todo: "Build one scikit-learn artifact with evaluation metrics, feature pipeline, and error analysis.",
    priority: 1,
  },
  {
    id: "spark-mllib",
    label: "Spark MLlib",
    category: "ml",
    terms: ["spark mllib", "mllib", "apache spark"],
    todo: "If repeated across target roles, add distributed ML exposure or explicit Spark pipeline work.",
    priority: 1,
  },
  {
    id: "mxnet",
    label: "MXNet",
    category: "ml",
    terms: ["mxnet", "apache mxnet"],
    todo: "Only invest in MXNet if actual target roles still require it; otherwise document the gap and deprioritize.",
    priority: 2,
  },
  {
    id: "r-modeling",
    label: "R Modeling Toolkit",
    category: "ml",
    terms: ["rstudio", "tidymodels", "caret", "glm", "statistical modeling"],
    todo: "Add an R-based modeling sample if the roles emphasize analytics, forecasting, or formal statistics.",
    priority: 1,
  },
  {
    id: "nlp-linguistics",
    label: "NLP / Linguistics",
    category: "ml",
    terms: ["nlp", "natural language processing", "linguistics", "tokenization", "semantic", "corpus"],
    todo: "Build one NLP or linguistics artifact with data prep, evaluation, and error taxonomy.",
    priority: 1,
  },
];

let skillTaxonomy = FALLBACK_SKILL_TAXONOMY;
let indexedJobsState = null;

function parseLinesToHtml(text, roleTarget, companyTarget) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, index, arr) => !(line === "" && arr[index - 1] === ""));

  const html = [];
  const heading = lines.shift() || "Resume Preview";
  html.push(`<h2>${escapeHtml(heading)}</h2>`);

  if (roleTarget || companyTarget) {
    html.push(
      `<p><strong>Target:</strong> ${escapeHtml(roleTarget || "Role")}${companyTarget ? ` | ${escapeHtml(companyTarget)}` : ""}</p>`,
    );
  }

  let listOpen = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
      continue;
    }

    if (/^[A-Z0-9][A-Z0-9\s\-:&]+$/.test(line) && line.length <= 72) {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
      html.push(`<h3>${escapeHtml(line)}</h3>`);
      continue;
    }

    if (/^[-*•]\s+/.test(line)) {
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${escapeHtml(line.replace(/^[-*•]\s+/, ""))}</li>`);
      continue;
    }

    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }
    html.push(`<p>${escapeHtml(line)}</p>`);
  }

  if (listOpen) {
    html.push("</ul>");
  }

  return html.join("\n");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function tokenizeFocusKeywords(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function safeParseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function loadJsonResource(path, fallback) {
  try {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load ${path}`);
    }
    return response.json();
  } catch {
    return fallback;
  }
}

function normalizeSkillText(value) {
  return ` ${String(value || "").toLowerCase()} `;
}

function detectSkillsInText(text, taxonomy) {
  const haystack = normalizeSkillText(text);
  return taxonomy.filter((skill) =>
    (skill.terms || []).some((term) => haystack.includes(normalizeSkillText(term).trim())),
  );
}

function buildResumeSkillSet(text, taxonomy) {
  return new Set(detectSkillsInText(text, taxonomy).map((skill) => skill.id));
}

function extractJobText(job) {
  return [job.title, job.company, job.location, job.text, ...(job.tags || []), JSON.stringify(job.metadata || {})]
    .filter(Boolean)
    .join("\n");
}

function screenJob(job, resumeSkillIds, focusTokens, taxonomy) {
  const detectedJobSkills = detectSkillsInText(extractJobText(job), taxonomy);
  const matchedSkills = detectedJobSkills.filter((skill) => resumeSkillIds.has(skill.id));
  const missingSkills = detectedJobSkills.filter((skill) => !resumeSkillIds.has(skill.id));
  const lowerText = extractJobText(job).toLowerCase();
  const focusHits = focusTokens.filter((token) => lowerText.includes(token));
  const scoreBase = matchedSkills.length * 14 + focusHits.length * 7 - missingSkills.length * 5;
  const score = Math.max(0, Math.min(100, 45 + scoreBase));

  return {
    ...job,
    matchedSkills,
    missingSkills,
    focusHits,
    score,
  };
}

function buildTodoList(screenedJobs) {
  const missingMap = new Map();

  screenedJobs.forEach((job) => {
    job.missingSkills.forEach((skill) => {
      const current = missingMap.get(skill.id) || { skill, count: 0 };
      current.count += 1;
      missingMap.set(skill.id, current);
    });
  });

  return Array.from(missingMap.values())
    .sort((left, right) => {
      if (left.count !== right.count) {
        return right.count - left.count;
      }
      return (left.skill.priority || 99) - (right.skill.priority || 99);
    })
    .slice(0, 8)
    .map(({ skill, count }) => ({
      label: skill.label,
      count,
      todo: skill.todo,
    }));
}

function summarizeScreening(indexedState, resumeText, focusKeywords, taxonomy) {
  const jobs = Array.isArray(indexedState?.jobs) ? indexedState.jobs : [];
  const resumeSkillIds = buildResumeSkillSet(resumeText, taxonomy);
  const focusTokens = tokenizeFocusKeywords(focusKeywords);
  const screenedJobs = jobs
    .map((job) => screenJob(job, resumeSkillIds, focusTokens, taxonomy))
    .sort((left, right) => right.score - left.score);

  const strengthsMap = new Map();
  screenedJobs.forEach((job) => {
    job.matchedSkills.forEach((skill) => {
      strengthsMap.set(skill.id, (strengthsMap.get(skill.id) || 0) + 1);
    });
  });

  const strengths = Array.from(strengthsMap.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([skillId, count]) => ({
      skill: taxonomy.find((entry) => entry.id === skillId),
      count,
    }))
    .filter((entry) => entry.skill);

  const todoList = buildTodoList(screenedJobs.slice(0, 20));

  return {
    totalJobs: screenedJobs.length,
    topJobs: screenedJobs.slice(0, 12),
    strengths,
    todoList,
    indexedAt: indexedState?.indexedAt || null,
    sourceErrors: indexedState?.errors || [],
  };
}

function renderJobFitSummary(target, summary) {
  if (!target) return;

  if (!summary || !summary.totalJobs) {
    target.innerHTML = '<p class="job-empty">No indexed jobs yet. Crawl a set of feeds or import a saved index JSON.</p>';
    return;
  }

  const topJob = summary.topJobs[0] || null;
  const strengthsMarkup = summary.strengths.length
    ? `<ul>${summary.strengths
        .map((entry) => `<li>${escapeHtml(entry.skill.label)} appears across ${entry.count} indexed roles.</li>`)
        .join("")}</ul>`
    : '<p class="job-empty">No repeated resume strengths surfaced yet.</p>';
  const todosMarkup = summary.todoList.length
    ? `<ul>${summary.todoList
        .map(
          (entry) =>
            `<li><strong>${escapeHtml(entry.label)}</strong> appears in ${entry.count} roles. ${escapeHtml(entry.todo)}</li>`,
        )
        .join("")}</ul>`
    : '<p class="job-empty">No major gaps surfaced from the indexed roles.</p>';
  const errorMarkup = summary.sourceErrors.length
    ? `<p>${summary.sourceErrors.length} feed errors were captured during indexing. Failed sources are omitted from scoring.</p>`
    : "";

  target.innerHTML = `
    <h2>Fit Summary</h2>
    <div class="job-fit-summary-grid">
      <div class="job-fit-stat">
        <span class="job-fit-stat-label">Indexed Roles</span>
        <span class="job-fit-stat-value">${summary.totalJobs}</span>
      </div>
      <div class="job-fit-stat">
        <span class="job-fit-stat-label">Top Match</span>
        <span class="job-fit-stat-value">${topJob ? `${topJob.score}%` : "0%"}</span>
      </div>
      <div class="job-fit-stat">
        <span class="job-fit-stat-label">Indexed At</span>
        <span class="job-fit-stat-value">${summary.indexedAt ? escapeHtml(new Date(summary.indexedAt).toLocaleDateString()) : "n/a"}</span>
      </div>
    </div>
    <h3>Strongest Current Matches</h3>
    ${strengthsMarkup}
    <h3>To-Do Workups</h3>
    ${todosMarkup}
    ${errorMarkup}
  `;
}

function renderJobResults(target, summary) {
  if (!target) return;

  if (!summary || !summary.topJobs.length) {
    target.innerHTML = '<p class="job-empty">No job match breakdown to display yet.</p>';
    return;
  }

  target.innerHTML = `
    <h2>Top Indexed Roles</h2>
    ${summary.topJobs
      .map(
        (job) => `
          <article class="job-result-card">
            <div class="job-result-score">Fit ${job.score}%</div>
            <h3>${escapeHtml(job.title)}</h3>
            <p class="job-result-meta">${escapeHtml(job.company)}${job.location ? ` | ${escapeHtml(job.location)}` : ""}</p>
            <div class="job-result-tags">
              ${(job.tags || []).slice(0, 6).map((tag) => `<span class="job-token tag">${escapeHtml(tag)}</span>`).join("")}
            </div>
            <p><strong>Matched Skills</strong></p>
            <div class="job-result-matched">
              ${job.matchedSkills.length ? job.matchedSkills.map((skill) => `<span class="job-token matched">${escapeHtml(skill.label)}</span>`).join("") : '<span class="job-empty">No strong matches surfaced.</span>'}
            </div>
            <p><strong>Missing / Underrepresented</strong></p>
            <div class="job-result-missing">
              ${job.missingSkills.length ? job.missingSkills.map((skill) => `<span class="job-token missing">${escapeHtml(skill.label)}</span>`).join("") : '<span class="job-empty">No clear gaps surfaced.</span>'}
            </div>
            <p><a class="job-result-link" href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer">Open role posting</a></p>
          </article>
        `,
      )
      .join("")}
  `;
}

function updateStatus(target, message) {
  if (target) {
    target.textContent = message;
  }
}

async function crawlIndexedJobs(groups) {
  const response = await fetch("/___resume-jobs-index", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ groups }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload?.error || "Job indexing failed");
  }
  return payload;
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

function main() {
  const source = document.getElementById("resume-source");
  const roleTarget = document.getElementById("role-target");
  const companyTarget = document.getElementById("company-target");
  const focusKeywords = document.getElementById("focus-keywords");
  const employerGroupsSource = document.getElementById("employer-groups-source");
  const preview = document.getElementById("resume-preview");
  const fitSummary = document.getElementById("job-fit-summary");
  const jobResults = document.getElementById("job-results");
  const jobIndexStatus = document.getElementById("job-index-status");
  const loadSample = document.getElementById("load-sample");
  const renderPreview = document.getElementById("render-preview");
  const saveLocal = document.getElementById("save-local");
  const printPdf = document.getElementById("print-pdf");
  const upload = document.getElementById("txt-upload");
  const loadDefaultGroups = document.getElementById("load-default-groups");
  const crawlJobs = document.getElementById("crawl-jobs");
  const screenJobs = document.getElementById("screen-jobs");
  const exportJobIndex = document.getElementById("export-job-index");
  const employerGroupUpload = document.getElementById("employer-group-upload");
  const jobIndexUpload = document.getElementById("job-index-upload");

  if (!source || !preview) {
    return;
  }

  Promise.all([
    loadJsonResource("./data/resume-skill-taxonomy.json", FALLBACK_SKILL_TAXONOMY),
    loadJsonResource("./data/resume-employer-groups.json", FALLBACK_EMPLOYER_GROUPS),
  ]).then(([taxonomy, groups]) => {
    skillTaxonomy = Array.isArray(taxonomy) && taxonomy.length ? taxonomy : FALLBACK_SKILL_TAXONOMY;
    const savedGroups = safeParseJson(window.localStorage.getItem(STORAGE_KEYS.groups) || "", groups);
    if (employerGroupsSource) {
      employerGroupsSource.value = JSON.stringify(savedGroups, null, 2);
    }
  });

  const savedSource = window.localStorage.getItem(STORAGE_KEYS.source);
  const savedRole = window.localStorage.getItem(STORAGE_KEYS.role);
  const savedCompany = window.localStorage.getItem(STORAGE_KEYS.company);
  const savedFocus = window.localStorage.getItem(STORAGE_KEYS.focus);
  const savedIndex = safeParseJson(window.localStorage.getItem(STORAGE_KEYS.index) || "", null);
  source.value = savedSource || sampleResume;
  if (roleTarget) roleTarget.value = savedRole || "";
  if (companyTarget) companyTarget.value = savedCompany || "";
  if (focusKeywords) focusKeywords.value = savedFocus || "";
  indexedJobsState = savedIndex;

  const render = () => {
    preview.innerHTML = parseLinesToHtml(
      source.value,
      roleTarget?.value || "",
      companyTarget?.value || "",
    );

    const summary = summarizeScreening(
      indexedJobsState,
      source.value,
      focusKeywords?.value || "",
      skillTaxonomy,
    );
    renderJobFitSummary(fitSummary, summary);
    renderJobResults(jobResults, summary);
  };

  loadSample?.addEventListener("click", () => {
    source.value = sampleResume;
    render();
  });

  renderPreview?.addEventListener("click", render);

  saveLocal?.addEventListener("click", () => {
    window.localStorage.setItem(STORAGE_KEYS.source, source.value);
    window.localStorage.setItem(STORAGE_KEYS.role, roleTarget?.value || "");
    window.localStorage.setItem(STORAGE_KEYS.company, companyTarget?.value || "");
    window.localStorage.setItem(STORAGE_KEYS.focus, focusKeywords?.value || "");
    if (employerGroupsSource?.value) {
      window.localStorage.setItem(STORAGE_KEYS.groups, employerGroupsSource.value);
    }
    if (indexedJobsState) {
      window.localStorage.setItem(STORAGE_KEYS.index, JSON.stringify(indexedJobsState));
    }
    render();
    updateStatus(jobIndexStatus, "Saved resume source, targets, groups, and current index locally.");
  });

  printPdf?.addEventListener("click", () => {
    render();
    window.print();
  });

  upload?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    source.value = await file.text();
    render();
  });

  loadDefaultGroups?.addEventListener("click", async () => {
    const groups = await loadJsonResource("./data/resume-employer-groups.json", FALLBACK_EMPLOYER_GROUPS);
    if (employerGroupsSource) {
      employerGroupsSource.value = JSON.stringify(groups, null, 2);
    }
    updateStatus(jobIndexStatus, "Loaded default employer groups metadata.");
  });

  employerGroupUpload?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file || !employerGroupsSource) {
      return;
    }
    employerGroupsSource.value = await file.text();
    updateStatus(jobIndexStatus, `Loaded employer groups from ${file.name}.`);
  });

  jobIndexUpload?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    indexedJobsState = safeParseJson(await file.text(), null);
    if (indexedJobsState) {
      window.localStorage.setItem(STORAGE_KEYS.index, JSON.stringify(indexedJobsState));
      updateStatus(jobIndexStatus, `Imported indexed jobs from ${file.name}.`);
      render();
    }
  });

  crawlJobs?.addEventListener("click", async () => {
    const groups = safeParseJson(employerGroupsSource?.value || "", null);
    if (!Array.isArray(groups)) {
      updateStatus(jobIndexStatus, "Employer group JSON is invalid. Fix the JSON before crawling.");
      return;
    }

    updateStatus(jobIndexStatus, "Crawling configured employer feeds and building normalized index...");
    try {
      indexedJobsState = await crawlIndexedJobs(groups);
      window.localStorage.setItem(STORAGE_KEYS.groups, JSON.stringify(groups));
      window.localStorage.setItem(STORAGE_KEYS.index, JSON.stringify(indexedJobsState));
      updateStatus(
        jobIndexStatus,
        `Indexed ${indexedJobsState.totalJobs} roles across ${indexedJobsState.groupStats.length} employer groups.`,
      );
      render();
    } catch (error) {
      updateStatus(
        jobIndexStatus,
        `${error.message}. Live crawling needs the Vite dev server or a CORS-friendly feed source.`,
      );
    }
  });

  screenJobs?.addEventListener("click", () => {
    render();
    updateStatus(jobIndexStatus, "Re-screened the current resume text against the indexed roles.");
  });

  exportJobIndex?.addEventListener("click", () => {
    if (!indexedJobsState) {
      updateStatus(jobIndexStatus, "No indexed jobs available to export yet.");
      return;
    }
    downloadJson("resume-job-index.json", indexedJobsState);
    updateStatus(jobIndexStatus, "Exported current job index JSON.");
  });

  render();
}

main();