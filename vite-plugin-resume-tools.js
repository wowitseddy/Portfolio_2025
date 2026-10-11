function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripHtml(value) {
  return normalizeWhitespace(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&"),
  );
}

function resolvePath(target, pathSpec) {
  if (!pathSpec) return target;
  return String(pathSpec)
    .split(".")
    .reduce((cursor, part) => (cursor && part in cursor ? cursor[part] : undefined), target);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  return rawBody ? JSON.parse(rawBody) : {};
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": "PortfolioResumeTools/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }

  return response.json();
}

async function loadSourceJobs(source) {
  if (source.type === "greenhouse-board") {
    const payload = await fetchJson(
      `https://boards-api.greenhouse.io/v1/boards/${source.boardToken}/jobs?content=true`,
    );
    return payload.jobs || [];
  }

  if (source.type === "lever-postings") {
    const payload = await fetchJson(
      `https://api.lever.co/v0/postings/${source.site}?mode=json`,
    );
    return Array.isArray(payload) ? payload : [];
  }

  if (source.type === "generic-json") {
    const payload = await fetchJson(source.url);
    const jobs = resolvePath(payload, source.listPath);
    if (!Array.isArray(jobs)) {
      throw new Error(`Expected array at listPath ${source.listPath || "<root>"}`);
    }
    return jobs;
  }

  throw new Error(`Unsupported source type: ${source.type}`);
}

function normalizeGreenhouseJob(group, source, rawJob) {
  const metadata = {
    team: rawJob.departments?.map((entry) => entry.name).filter(Boolean) || [],
    offices: rawJob.offices?.map((entry) => entry.name).filter(Boolean) || [],
  };
  return {
    id: `greenhouse:${source.boardToken}:${rawJob.id}`,
    sourceType: source.type,
    employerGroupId: group.id,
    employerGroupLabel: group.label,
    company: source.company || group.label,
    title: normalizeWhitespace(rawJob.title),
    location: normalizeWhitespace(rawJob.location?.name),
    updatedAt: rawJob.updated_at || null,
    url: rawJob.absolute_url || "",
    text: stripHtml(rawJob.content),
    metadata,
    tags: Array.from(new Set([...(group.tags || []), ...(source.tags || [])])),
  };
}

function normalizeLeverJob(group, source, rawJob) {
  const categories = rawJob.categories || {};
  const metadata = {
    team: [categories.team].filter(Boolean),
    commitment: categories.commitment || "",
    workplace: categories.workplace || "",
  };
  const text = [
    rawJob.descriptionPlain,
    rawJob.lists?.map((list) => `${list.text}: ${(list.content || []).join(" ")}`).join(" "),
    rawJob.additionalPlain,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id: `lever:${source.site}:${rawJob.id || rawJob.hostedUrl || rawJob.text}`,
    sourceType: source.type,
    employerGroupId: group.id,
    employerGroupLabel: group.label,
    company: source.company || group.label,
    title: normalizeWhitespace(rawJob.text),
    location: normalizeWhitespace(categories.location),
    updatedAt: rawJob.createdAt || null,
    url: rawJob.hostedUrl || rawJob.applyUrl || "",
    text: stripHtml(text),
    metadata,
    tags: Array.from(new Set([...(group.tags || []), ...(source.tags || [])])),
  };
}

function normalizeGenericJob(group, source, rawJob) {
  const metadata = rawJob.metadata && typeof rawJob.metadata === "object" ? rawJob.metadata : {};
  return {
    id: rawJob.id || `generic:${source.company || group.id}:${rawJob.url || rawJob.title}`,
    sourceType: source.type,
    employerGroupId: group.id,
    employerGroupLabel: group.label,
    company: rawJob.company || source.company || group.label,
    title: normalizeWhitespace(rawJob.title),
    location: normalizeWhitespace(rawJob.location),
    updatedAt: rawJob.updatedAt || rawJob.updated_at || null,
    url: rawJob.url || "",
    text: stripHtml(rawJob.text || rawJob.description || rawJob.requirements || ""),
    metadata,
    tags: Array.from(new Set([...(group.tags || []), ...(source.tags || []), ...(rawJob.tags || [])])),
  };
}

function normalizeJob(group, source, rawJob) {
  if (source.type === "greenhouse-board") {
    return normalizeGreenhouseJob(group, source, rawJob);
  }
  if (source.type === "lever-postings") {
    return normalizeLeverJob(group, source, rawJob);
  }
  return normalizeGenericJob(group, source, rawJob);
}

function dedupeJobs(jobs) {
  const seen = new Set();
  return jobs.filter((job) => {
    const key = `${job.url}|${job.company}|${job.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function buildJobIndex(groups) {
  const jobs = [];
  const errors = [];
  const groupStats = [];

  for (const group of groups) {
    let groupCount = 0;
    for (const source of group.sources || []) {
      try {
        const rawJobs = await loadSourceJobs(source);
        const normalizedJobs = rawJobs
          .map((entry) => normalizeJob(group, source, entry))
          .filter((entry) => entry.title && entry.url);
        jobs.push(...normalizedJobs);
        groupCount += normalizedJobs.length;
      } catch (error) {
        errors.push({
          groupId: group.id,
          groupLabel: group.label,
          sourceType: source.type,
          company: source.company || group.label,
          message: error.message,
        });
      }
    }
    groupStats.push({
      id: group.id,
      label: group.label,
      tags: group.tags || [],
      jobCount: groupCount,
    });
  }

  const dedupedJobs = dedupeJobs(jobs).sort((left, right) => {
    const leftDate = Date.parse(left.updatedAt || "") || 0;
    const rightDate = Date.parse(right.updatedAt || "") || 0;
    return rightDate - leftDate;
  });

  return {
    indexedAt: new Date().toISOString(),
    totalJobs: dedupedJobs.length,
    groupStats,
    errors,
    jobs: dedupedJobs,
  };
}

export default function resumeToolsPlugin() {
  return {
    name: "resume-tools-plugin",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = String(req.url || "").split("?")[0];
        if (req.method !== "POST" || path !== "/___resume-jobs-index") {
          return next();
        }

        try {
          const payload = await readJsonBody(req);
          const groups = Array.isArray(payload.groups) ? payload.groups : [];
          const index = await buildJobIndex(groups);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, ...index }));
        } catch (error) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: error.message }));
        }
      });
    },
  };
}