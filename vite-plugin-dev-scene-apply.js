/**
 * vite-plugin-dev-scene-apply.js
 * Dev-only Vite plugin that exposes POST /___dev-scene-apply.
 * Receives the current dev-scene inspector export payload and writes
 * transforms directly into main.js, CSS into css/main.css (sentinel block),
 * and projection overlay HTML into index.html (sentinel block).
 * Zero impact on production build — plugin only activates in serve mode.
 */

import fs from "fs";
import path from "path";

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

const CSS_SENTINEL_START = "/* DEV-SCENE:projection:start */";
const CSS_SENTINEL_END = "/* DEV-SCENE:projection:end */";
const HTML_SENTINEL_START = "<!-- DEV-SCENE:overlays:start -->";
const HTML_SENTINEL_END = "<!-- DEV-SCENE:overlays:end -->";
const TRANSFORMS_SENTINEL_START = "// DEV-SCENE:transforms:start";
const TRANSFORMS_SENTINEL_END = "// DEV-SCENE:transforms:end";
const KEYFRAMES_SENTINEL_START = "// DEV-SCENE:keyframes:start";
const KEYFRAMES_SENTINEL_END = "// DEV-SCENE:keyframes:end";
const MATERIALS_SENTINEL_START = "// DEV-SCENE:materials:start";
const MATERIALS_SENTINEL_END = "// DEV-SCENE:materials:end";
const PROJECTION_DATA_SENTINEL_START = "// DEV-SCENE:projection-data:start";
const PROJECTION_DATA_SENTINEL_END = "// DEV-SCENE:projection-data:end";
const LOD_SENTINEL_START = "// DEV-SCENE:lod:start";
const LOD_SENTINEL_END = "// DEV-SCENE:lod:end";
const ASSET_INDEX_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".mp4",
  ".webm",
  ".mov",
  ".glb",
  ".gltf",
  ".pdf",
]);

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function safeWrite(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function buildConstBlock(name, value) {
  return `const ${name} = ${JSON.stringify(value, null, 2)};`;
}

function extractSentinelBlock(src, startSentinel, endSentinel) {
  const startIdx = src.indexOf(startSentinel);
  const endIdx = src.indexOf(endSentinel);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return null;
  }
  return src.slice(startIdx + startSentinel.length, endIdx).trim();
}

function parseConstBlockValue(block, name) {
  if (!block) {
    return { ok: false, error: `missing block: ${name}` };
  }

  const match = block.match(
    new RegExp(`const\\s+${name}\\s*=\\s*([\\s\\S]*?);\\s*$`)
  );

  if (!match) {
    return { ok: false, error: `unable to parse const block: ${name}` };
  }

  try {
    return { ok: true, value: JSON.parse(match[1]) };
  } catch (error) {
    return {
      ok: false,
      error: `invalid JSON in ${name}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeBlockText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function compareTransformBlocks(expected, actual) {
  const expectedData = expected && typeof expected === "object" ? expected : {};
  const actualData = actual && typeof actual === "object" ? actual : {};
  const expectedRefs = Object.keys(expectedData).sort();
  const actualRefs = Object.keys(actualData).sort();
  const missingRefs = expectedRefs.filter((ref) => !hasOwn(actualData, ref));
  const extraRefs = actualRefs.filter((ref) => !hasOwn(expectedData, ref));
  const mismatches = [];

  expectedRefs.forEach((ref) => {
    if (!hasOwn(actualData, ref)) {
      return;
    }
    const expectedEntry = expectedData[ref] || {};
    const actualEntry = actualData[ref] || {};
    ["position", "rotation", "scale"].forEach((field) => {
      const expectedField = Array.isArray(expectedEntry[field])
        ? expectedEntry[field]
        : [];
      const actualField = Array.isArray(actualEntry[field])
        ? actualEntry[field]
        : [];
      if (stableStringify(expectedField) !== stableStringify(actualField)) {
        mismatches.push({
          ref,
          field,
          expected: expectedField,
          actual: actualField,
        });
      }
    });

    if (!!expectedEntry.visible !== !!actualEntry.visible) {
      mismatches.push({
        ref,
        field: "visible",
        expected: !!expectedEntry.visible,
        actual: !!actualEntry.visible,
      });
    }
  });

  const ok = missingRefs.length === 0 && extraRefs.length === 0 && mismatches.length === 0;
  const summary = ok
    ? `verified transforms (${expectedRefs.length} objects)`
    : `transform mismatch: ${missingRefs.length} missing, ${extraRefs.length} extra, ${mismatches.length} field diffs`;

  return {
    ok,
    expectedCount: expectedRefs.length,
    actualCount: actualRefs.length,
    missingRefs,
    extraRefs,
    mismatches: mismatches.slice(0, 24),
    summary,
  };
}

function compareStructuredBlocks(expected, actual, label) {
  const ok = stableStringify(expected) === stableStringify(actual);
  return {
    ok,
    summary: ok ? `verified ${label}` : `${label} mismatch`,
  };
}

function compareTextBlocks(expected, actual, label) {
  const ok = normalizeBlockText(expected) === normalizeBlockText(actual);
  return {
    ok,
    summary: ok ? `verified ${label}` : `${label} mismatch`,
  };
}

function verifyAppliedPayload({ mainSrc, cssSrc, htmlSrc, payload }) {
  const verification = {
    ok: true,
    summary: "verified",
    blocks: {},
  };
  const failures = [];

  if (payload?.sourceState?.transforms) {
    const transformsBlock = extractSentinelBlock(
      mainSrc,
      TRANSFORMS_SENTINEL_START,
      TRANSFORMS_SENTINEL_END
    );
    const parsed = parseConstBlockValue(transformsBlock, "DEV_SCENE_TRANSFORMS");
    verification.blocks.transforms = parsed.ok
      ? compareTransformBlocks(payload.sourceState.transforms, parsed.value)
      : { ok: false, summary: parsed.error, error: parsed.error };
    if (!verification.blocks.transforms.ok) {
      failures.push(verification.blocks.transforms.summary);
    }
  }

  if (payload?.sourceState?.manualKeyframes) {
    const keyframesBlock = extractSentinelBlock(
      mainSrc,
      KEYFRAMES_SENTINEL_START,
      KEYFRAMES_SENTINEL_END
    );
    const parsed = parseConstBlockValue(keyframesBlock, "DEV_SCENE_MANUAL_KEYFRAMES");
    verification.blocks.manualKeyframes = parsed.ok
      ? compareStructuredBlocks(payload.sourceState.manualKeyframes, parsed.value, "manual keyframes")
      : { ok: false, summary: parsed.error, error: parsed.error };
    if (!verification.blocks.manualKeyframes.ok) {
      failures.push(verification.blocks.manualKeyframes.summary);
    }
  }

  if (payload?.sourceState?.materials) {
    const materialsBlock = extractSentinelBlock(
      mainSrc,
      MATERIALS_SENTINEL_START,
      MATERIALS_SENTINEL_END
    );
    const parsed = parseConstBlockValue(materialsBlock, "DEV_SCENE_MATERIALS");
    verification.blocks.materials = parsed.ok
      ? compareStructuredBlocks(payload.sourceState.materials, parsed.value, "materials")
      : { ok: false, summary: parsed.error, error: parsed.error };
    if (!verification.blocks.materials.ok) {
      failures.push(verification.blocks.materials.summary);
    }
  }

  if (payload?.sourceState?.projectionOverlays) {
    const projectionBlock = extractSentinelBlock(
      mainSrc,
      PROJECTION_DATA_SENTINEL_START,
      PROJECTION_DATA_SENTINEL_END
    );
    const parsed = parseConstBlockValue(
      projectionBlock,
      "DEV_SCENE_PROJECTION_OVERLAYS"
    );
    verification.blocks.projectionOverlays = parsed.ok
      ? compareStructuredBlocks(payload.sourceState.projectionOverlays, parsed.value, "projection overlays")
      : { ok: false, summary: parsed.error, error: parsed.error };
    if (!verification.blocks.projectionOverlays.ok) {
      failures.push(verification.blocks.projectionOverlays.summary);
    }
  }

  if (payload?.lodJs) {
    const lodBlock = extractSentinelBlock(mainSrc, LOD_SENTINEL_START, LOD_SENTINEL_END);
    verification.blocks.lod = compareTextBlocks(payload.lodJs, lodBlock, "lod export");
    if (!verification.blocks.lod.ok) {
      failures.push(verification.blocks.lod.summary);
    }
  }

  if (hasOwn(payload, "css")) {
    const cssBlock = extractSentinelBlock(cssSrc || "", CSS_SENTINEL_START, CSS_SENTINEL_END);
    verification.blocks.css = compareTextBlocks(payload.css, cssBlock, "projection css");
    if (!verification.blocks.css.ok) {
      failures.push(verification.blocks.css.summary);
    }
  }

  if (hasOwn(payload, "html")) {
    const htmlBlock = extractSentinelBlock(htmlSrc || "", HTML_SENTINEL_START, HTML_SENTINEL_END);
    verification.blocks.html = compareTextBlocks(payload.html, htmlBlock, "projection html");
    if (!verification.blocks.html.ok) {
      failures.push(verification.blocks.html.summary);
    }
  }

  verification.ok = failures.length === 0;
  verification.summary = verification.ok ? "verified source coherence" : failures.join(" | ");
  return verification;
}

/**
 * Replace (or insert) a sentinel-delimited block inside a larger file.
 */
function replaceSentinelBlock(src, startSentinel, endSentinel, newContent) {
  const startIdx = src.indexOf(startSentinel);
  const endIdx = src.indexOf(endSentinel);

  if (startIdx !== -1 && endIdx !== -1) {
    return (
      src.slice(0, startIdx + startSentinel.length) +
      "\n" +
      newContent +
      "\n" +
      src.slice(endIdx)
    );
  }

  // Sentinels not yet present — append before last meaningful tag.
  return src + `\n${startSentinel}\n${newContent}\n${endSentinel}\n`;
}

function buildAssetIndex(rootDir) {
  const assetsDir = path.join(rootDir, "assets");
  const assetPaths = [];

  function walk(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    entries.forEach((entry) => {
      const absolutePath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        return;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!ASSET_INDEX_EXTENSIONS.has(ext)) {
        return;
      }
      const relativePath = path
        .relative(rootDir, absolutePath)
        .split(path.sep)
        .join("/");
      assetPaths.push(`/${relativePath}`);
    });
  }

  if (fs.existsSync(assetsDir)) {
    walk(assetsDir);
  }

  assetPaths.sort((a, b) => a.localeCompare(b));
  return {
    workspaceRoot: rootDir,
    assetPaths,
  };
}

export default function devSceneApplyPlugin() {
  let root = process.cwd();

  // Tracks paths written by this plugin so HMR is suppressed for those writes.
  // Writing main.js would otherwise trigger a full page reload (white flash).
  const _suppressHmrPaths = new Set();
  function suppressedWrite(filePath, content) {
    const resolved = path.resolve(filePath);
    _suppressHmrPaths.add(resolved);
    safeWrite(filePath, content);
    setTimeout(() => _suppressHmrPaths.delete(resolved), 500);
  }

  return {
    name: "dev-scene-apply",
    apply: "serve", // dev-only, excluded from build

    configResolved(config) {
      root = config.root || process.cwd();
    },

    handleHotUpdate({ file }) {
      if (_suppressHmrPaths.has(path.resolve(file))) {
        return []; // suppress HMR — this file was written by the inspector plugin
      }
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method === "GET" && req.url === "/___dev-scene-assets") {
          try {
            const payload = buildAssetIndex(root);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, ...payload }));
          } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
          return;
        }

        if (req.method !== "POST" || req.url !== "/___dev-scene-apply") {
          return next();
        }

        let body = "";
        req.on("data", (chunk) => (body += chunk.toString()));
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            const results = {};

            // ── 1. main.js source-backed scene state ──────────────────────
            const mainJsPath = path.join(root, "main.js");
            const mainSrc = safeRead(mainJsPath);
            if (mainSrc) {
              let patchedMain = mainSrc;

              if (payload.sourceState?.transforms) {
                patchedMain = replaceSentinelBlock(
                  patchedMain,
                  TRANSFORMS_SENTINEL_START,
                  TRANSFORMS_SENTINEL_END,
                  buildConstBlock(
                    "DEV_SCENE_TRANSFORMS",
                    payload.sourceState.transforms
                  )
                );
              }

              if (payload.sourceState?.manualKeyframes) {
                patchedMain = replaceSentinelBlock(
                  patchedMain,
                  KEYFRAMES_SENTINEL_START,
                  KEYFRAMES_SENTINEL_END,
                  buildConstBlock(
                    "DEV_SCENE_MANUAL_KEYFRAMES",
                    payload.sourceState.manualKeyframes
                  )
                );
              }

              if (payload.sourceState?.materials) {
                patchedMain = replaceSentinelBlock(
                  patchedMain,
                  MATERIALS_SENTINEL_START,
                  MATERIALS_SENTINEL_END,
                  buildConstBlock(
                    "DEV_SCENE_MATERIALS",
                    payload.sourceState.materials
                  )
                );
              }

              if (payload.sourceState?.projectionOverlays) {
                patchedMain = replaceSentinelBlock(
                  patchedMain,
                  PROJECTION_DATA_SENTINEL_START,
                  PROJECTION_DATA_SENTINEL_END,
                  buildConstBlock(
                    "DEV_SCENE_PROJECTION_OVERLAYS",
                    payload.sourceState.projectionOverlays
                  )
                );
              }

              if (payload.lodJs) {
                patchedMain = replaceSentinelBlock(
                  patchedMain,
                  LOD_SENTINEL_START,
                  LOD_SENTINEL_END,
                  payload.lodJs.trim()
                );
              }

              if (patchedMain !== mainSrc) {
                suppressedWrite(mainJsPath, patchedMain);
                results.mainJs = "patched";
              } else {
                results.mainJs = "no-change";
              }
            }

            // ── 2. css/main.css projection block ──────────────────────────
            if (hasOwn(payload, "css")) {
              const cssPath = path.join(root, "css", "main.css");
              let cssSrc = safeRead(cssPath) || "";
              const patchedCss = replaceSentinelBlock(
                cssSrc,
                CSS_SENTINEL_START,
                CSS_SENTINEL_END,
                String(payload.css || "").trim()
              );
              if (patchedCss !== cssSrc) {
                suppressedWrite(cssPath, patchedCss);
                results.css = "patched";
              } else {
                results.css = "no-change";
              }
            }

            // ── 3. index.html overlay divs ────────────────────────────────
            if (hasOwn(payload, "html")) {
              const htmlPath = path.join(root, "index.html");
              let htmlSrc = safeRead(htmlPath) || "";

              // Insert sentinels before </body> if not present yet.
              if (
                !htmlSrc.includes(HTML_SENTINEL_START) &&
                htmlSrc.includes("</body>")
              ) {
                htmlSrc = htmlSrc.replace(
                  "</body>",
                  `${HTML_SENTINEL_START}\n${HTML_SENTINEL_END}\n</body>`
                );
              }

              const patchedHtml = replaceSentinelBlock(
                htmlSrc,
                HTML_SENTINEL_START,
                HTML_SENTINEL_END,
                String(payload.html || "").trim()
              );
              if (patchedHtml !== htmlSrc) {
                suppressedWrite(htmlPath, patchedHtml);
                results.html = "patched";
              } else {
                results.html = "no-change";
              }
            }

            // ── 4. Persist full state snapshot ───────────────────────────
            if (payload.snapshot) {
              const snapPath = path.join(root, "dev-scene-state.json");
              suppressedWrite(snapPath, JSON.stringify(payload.snapshot, null, 2));
              results.snapshot = "saved";
            }

            const verifiedMainSrc = safeRead(path.join(root, "main.js")) || "";
            const verifiedCssSrc = safeRead(path.join(root, "css", "main.css")) || "";
            const verifiedHtmlSrc = safeRead(path.join(root, "index.html")) || "";
            const verification = verifyAppliedPayload({
              mainSrc: verifiedMainSrc,
              cssSrc: verifiedCssSrc,
              htmlSrc: verifiedHtmlSrc,
              payload,
            });

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                ok: verification.ok,
                results,
                verification,
                error: verification.ok ? null : verification.summary,
              })
            );
          } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
      });
    },
  };
}
