import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const HOST = process.env.DRAGONFIRE_HOST || "0.0.0.0";
const PORT = Number(process.env.DRAGONFIRE_PORT || 8787);
const DIST_DIR = resolve("dist");
const DATA_DIR = resolve("output", "dragonfire");
const STATE_FILE = join(DATA_DIR, "mission-state.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

const defaultState = {
  state: {
    missionStart: new Date().toISOString().slice(0, 10),
    threshold: 70,
    deviceRole: "operator",
    syncEndpoint: "",
    timers: { timed: 90, rebuild: 60, applied: 90, aux: 45 },
    dailyLogs: {},
  },
  updatedAt: new Date().toISOString(),
};

function ensureStateFile() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(STATE_FILE)) {
    writeFileSync(STATE_FILE, JSON.stringify(defaultState, null, 2));
  }
}

function readState() {
  ensureStateFile();
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

async function writeState(payload) {
  ensureStateFile();
  await fs.writeFile(STATE_FILE, JSON.stringify(payload, null, 2));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(JSON.stringify(payload));
}

function serveStatic(requestPath, response) {
  const safePath = normalize(requestPath === "/" ? "/dragonfire-protocol.html" : requestPath).replace(/^([.][.][/\\])+/, "");
  const trimmed = safePath.replace(/^[/\\]+/, "");
  const filePath = join(DIST_DIR, trimmed);
  if (!filePath.startsWith(DIST_DIR) || !existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream" });
  createReadStream(filePath).pipe(response);
}

createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: "Missing URL" });
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    response.end();
    return;
  }

  if (url.pathname === "/api/state") {
    if (request.method === "GET") {
      sendJson(response, 200, readState());
      return;
    }
    if (request.method === "PUT") {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", async () => {
        try {
          const payload = JSON.parse(body || "{}");
          await writeState({ ...payload, updatedAt: payload.updatedAt || new Date().toISOString() });
          sendJson(response, 200, { ok: true });
        } catch (error) {
          sendJson(response, 400, { error: error.message });
        }
      });
      return;
    }
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  serveStatic(url.pathname, response);
}).listen(PORT, HOST, () => {
  ensureStateFile();
  console.log(`Dragonfire sync server listening on http://${HOST}:${PORT}`);
  console.log(`State endpoint: http://${HOST}:${PORT}/api/state`);
});