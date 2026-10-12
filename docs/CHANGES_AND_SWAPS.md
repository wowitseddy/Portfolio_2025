# Changes and swaps: optimize-runtime

Baseline: see CHECKPOINT.md. Each entry has one commit, what changed or was swapped, and before → after.

## a. Fix /assets/undefined 404 and updateCursorPosition ReferenceError
- `main.js`: `OUTER_RING_MODEL_SRC` pointed at `decal_ring_outer.glb`, which doesn't exist (only `decal_ring_outer_.glb` does). Vite rewrote the missing URL to `/assets/undefined`. Swapped it to `decal_ring_outer_.glb`, the file the code already used as its fallback.
- `js/hexgrid.js`: removed the `window.onload` handler that referenced the undefined global `updateCursorPosition`. The real handler lives in reticule.js. Added a null guard for `.hex-grid` / `.gradient-mask`.
- Before: 1 failed request (404) plus 1 pageerror on every load. After: 0 / 0 (verified in the localhost capture; see Verification).

## b. Hide invisible / out-of-range objects; re-enable frustum culling
- New `applyAutoHide()` runs each frame before render. Any transparent mesh, line, or points object whose material opacity is < 0.004 gets `visible=false`. It's restored as soon as opacity rises, and only objects this pass hid are ever unhidden. This covers the Harness rig `cs_*` helper lines (32 objects at opacity 0 → 0.1).
- The particle-core wireframe (Circle.006/.007, ~565k triangles drawn as wireframe) now has `visible=false` while its `uFieldOpacity` is ~0, i.e. before flow 0.75 (gravityField start).
- `frustumCulled` was forced `false` on the Corporate Agent banner, the auxiliary text GLBs, and the Dyson ring. It's now `true` for non-skinned meshes (with bounds computed). Skinned meshes keep culling off.
- Also added a read-only `window.__portfolioDebug.getScrollProgress()` probe (separate commit) so the capture tool can sample by real scroll progress.
- Before → after (hero, flow 0.18, localhost, SwiftShader): draw calls 93 → 61. Triangles 2.63M → 2.51M (the wireframe core isn't counted as triangles; the big remaining costs are the PROJECTS banner and BCI text, handled in c/d). Visible objects 457 → 448.

## c. Compress all GLBs (meshopt + quantization + webp), simplify the particle-core rings
Swapped every file in `assets/GLTF/` for an optimized version. The originals stay in git history (`checkpoint-2026-10-11-pre-optimize-master`).
- All files: `gltf-transform optimize --compress meshopt --texture-compress webp --flatten false --join false --instance false --palette false --simplify false --prune false --resample true` (scene graph, node names, and animations are kept, because the code looks them up by name).
- `particle_core_wireframe.glb`: Circle.006/.007 get TANGENT/UV/NORMAL stripped (they only render as a wireframe with a position-driven shader), then weld + meshopt simplify (ratio 0.7, error 0.001) + quantize + meshopt (`scripts/glb-weld-simplify.mjs`). 282,624 → 197,836 triangles per ring; vertices 620k → 99k per ring. Normals are recomputed at load.
- Loader: `createGltfLoader()` now sets `MeshoptDecoder` (bundled with three, no extra files) and recomputes missing normals.

| file | before (raw) | after |
|---|---|---|
| particle_core_wireframe.glb | 66.5 MB | 1.21 MB |
| Because_Corporate_Agents…glb | 27.5 MB | 1.99 MB |
| BCI_TEXT_.glb | 21.2 MB | 2.30 MB |
| AGENT_TEXT_.glb | 4.8 MB | 0.67 MB |
| Harness_PK_GLTF.glb | 2.7 MB | 0.71 MB |
| ABOUT_TEXT_.glb | 2.0 MB | 0.29 MB |
| all GLBs | ≈128 MB | 7.7 MB |

- Load (localhost, no gzip): GLB bytes 128.3 MB → 7.8 MB. Slowest GLB 11.0 s (particle core) → 0.37 s. On live (gzip) the particle core was 13.7 MB / 17.2 s.
- Visual check: contact sheet unchanged through the scroll; the rings at flow ≥ 0.75 render with slightly sparser wireframe density. No console errors, no failed requests.

## d. Low-poly swap for the extruded "PROJECTS" banner and BCI text
- The 688k-vertex mesh named `PROJECTS` comes from `Because_Corporate_Agents_Cant_Code_And_Exploit_Telemetry_.glb` (Plane.011). `PROJECTS_TEXT_.glb` itself isn't loaded by the page.
- **Swap chosen: lower-poly mesh, not troika SDF text.** The banner is a 1,634-unit-long animated extruded strip with a transmission-glass material. Rebuilding it as SDF text would need the exact font, string layout, and path animation, so the visual match would be unreliable. A simplified mesh keeps the same node, animation, and material.
- Method (`scripts/glb-weld-simplify.mjs`): strip UV/NORMAL (no textures on these materials), weld, meshopt simplify (error 0.0001 of extent ≈ 0.16 units on ~58-unit-tall glyphs), quantize, meshopt. Normals are rebuilt at load with `toCreasedNormals` at 35°, so letter faces stay flat and edges stay sharp.

| mesh | triangles before → after | file (raw) before → after |
|---|---|---|
| PROJECTS banner (Plane.011) | 456,392 → 149,238 | 27.5 MB → 0.32 MB |
| BCI text (Text.006 / `Text001`) | 475,241 → 142,572 | 21.2 MB → 0.53 MB |

- Frame triangles (renderer.info summed over all passes per frame): 2.51M → **0.92M** (baseline 2.63M). Draw calls unchanged at 61–74.
- Visual check: side-by-side frames at flow 0.125, 0.25, and 0.5 look the same at capture resolution; the glass text silhouettes are intact.
- Not done (recommendation): the banner's `MeshPhysicalMaterial` uses `transmission: 0.92`, which makes three render an extra transmission pass of the scene every frame. Switching it to plain transparency would roughly halve per-frame scene cost, but it changes the look, so I'm leaving that for the owner to decide.

## e. Hero-first loading; stream the particle core
- `bootstrapSceneAssets()` now waits only for hero-critical assets: Harness rig, Corporate Agent banner, rotor, outer ring, and the auxiliary text GLBs (visible from flow ≈0.1). Then it hides the preloader.
- The particle-core wireframe plus Dyson ring (only visible from flow ≈0.69) moved to `DEFERRED_SCENE_TASKS`. They load at `requestIdleCallback` after the hero is ready, or immediately once scroll progress reaches 0.55.
- Before → after: see the Verification table (startup-ready time, bytes before preloader hide). The deferred file is now 1.2 MB instead of 13.7 MB gzip / 66.5 MB raw, so the deferral matters less after (c). It still takes it off the critical path.
- Service worker: **not added.** `public/dragonfire-sw.js` is already registered at the site root scope (by dragonfire-protocol.html), and a second root-scope worker would replace it and break that page's offline cache. Hashed `/assets/*` files are already HTTP-cacheable. A shared SW would need merging both caches; that's a future item.

## f. Crossfade the flow 0.75 transition (former 37–42% "hard cut")
- Cause: at `gravityFieldConfig.startProgress` (0.75), `particles.visible` / `secondaryParticles.visible` flipped to `false` in a single frame. The particle-core wireframe only started fading in from 0 at the same moment.
- Fix (same scroll logic, no content change): a crossfade band from 0.69 to 0.79 (`getCoreCrossfadeT`, smoothstep). Particle opacity targets are multiplied by `1 - t`, and particles stay drawn until their eased opacity reaches ~0 (bounded to the band). The wireframe's collapse progress starts at `t * 0.35` inside the band, so it's already fading in while the particles fade out. After 0.79 the original curve takes over.
- Before → after: the baseline goes from a full particle field at flow 0.74 to particles gone plus shells at 0.76. Now, at 0.6875 / 0.75 / 0.8125 / 0.875 the core dims, the shells appear faintly, then reach full strength. The verdict no longer lists a cut with hidden objects. The only flag left is 9 core nodes turning visible at the start of the fade.

## d2. Follow-up to (d): bake creased normals offline instead of at load
- Problem found in verification: `toCreasedNormals` at runtime cost ~3.0 s (banner) and ~18 s per particle-core ring (measured in Node) of main-thread time.
- Swap: `BCI_TEXT_.glb` and the Corporate Agent banner now ship with creased (35°) normals baked by `scripts/glb-bake-creased-normals.mjs`. File sizes: BCI 0.53 → 0.70 MB, banner 0.32 → 0.41 MB. The runtime fallback for meshes without normals (the wireframe rings) is plain `computeVertexNormals()` (~19 ms per ring). The BufferGeometryUtils import was removed.

## c2. Fix: particle-core shells were missing (regression from c)
- Found in verification: with the quantized + welded + simplified `particle_core_wireframe.glb`, the shells never drew at flow ≥ 0.75. The material never compiled. Its custom field shader depends on the original local vertex positions, and quantization moves the scale onto node transforms. I confirmed this A/B: the original file renders, the optimized file doesn't, and a float weld+simplify version compiled but still showed no shells.
- Swap: `particle_core_wireframe.glb` is now the **original geometry** with only the unused TANGENT and TEXCOORD_0 attributes stripped (`scripts/glb-strip-unused-attributes.mjs`). No weld, simplify, quantize or dedup.
- Result: 66.5 MB → 36.7 MB raw (15 MB gzip vs 13.7 MB transferred on live). The ring simplification (282k → 198k triangles per ring) from (c) is **reverted**. The ring triangle counts are back to the originals, but the rings stay hidden until flow 0.69 (from b).

## Verification (localhost, `vite build`, SwiftShader, /workspace/site-capture/manifest_capture.py + reconstruct.py)
Baseline = `checkpoint-2026-10-11-pre-optimize-master` built the same way (byte-identical main bundle to live). New = optimize-runtime @ 74435a2.

| metric | baseline | optimize-runtime |
|---|---|---|
| triangles / frame (all passes) | 2,629,835 | 922,601 |
| draw calls / frame | 80–93 | 61–74 |
| GLB bytes downloaded (raw, local) | 128.3 MB | 40.0 MB |
| GLB bytes gzip (all GLBs) | 27.3 MB | 16.8 MB |
| slowest GLB request (local) | 7.2 s | 0.09 s |
| failed requests | 1 (/assets/undefined 404) | 0 |
| console errors | 2 (404 + updateCursorPosition) | 0 |
| flow 0.75 transition | single-frame cut (particles off, shells on) | crossfade 0.69–0.79 |
| visual check | — | all sections render; banner, rig, text, rings, particle core, and shells present; no black frames |

Notes:
- Startup-ready time under SwiftShader was too noisy to compare: readings ran 8–24 s on both builds, partly because my early polling depended on frames that render at about 1 fps. Real-GPU timings still need measuring.
- New contact sheet: `/workspace/site-capture/runs/final/contact_sheet.png`.

---
# fix-artifacts (after the optimize-runtime deploy, 2026-10-11 evening)
New checkpoint tags (pushed): `checkpoint-2026-10-11-post-optimize-master` → ef91117, `checkpoint-2026-10-11-post-optimize-gh-pages` → 348f1ec (live bundle main-BJny5w4c.js).
Owner report on a real GPU: previously invisible helper objects ("track-keys", IDs) became visible, and some meshes render pitch black with zero emission.

## Root causes
1. **Quantization changed node transforms and geometry scale** (88e178c, `gltf-transform optimize` with meshopt ⇒ KHR_mesh_quantization). It moved dequantization scale/offset onto nodes (node counts rose 1→2, 3→6, 6→10 in 11 files) and rescaled positions to unit range. `cleanLooseModelArtifacts()` zeroes the opacity of "loose" meshes (identity transform, not animated) and hides meshes with a bounding radius < 0.0006. After quantization those helper meshes have a non-identity transform and a unit-range radius, so they're no longer treated as loose or tiny, and they show up.
2. **Material dedup** in the same optimize pass merged distinct materials. In `decal_rotor.glb` and `decal_rotor_spinner_webP.glb`, `Hologram`, `.001`, `.002`, `.003` and `Hologram Shader *.002` were collapsed into one `Hologram.003`. Per-mesh material styling (opacity/emissive set per mesh) then acts on one shared material, and the name-based lookups lose their target. That gives black or unlit hologram parts.
3. **Auto-hide could force `visible = true`** (cc8ab57). If original code hid an object after auto-hide had hidden it, auto-hide would later re-show it. The particle-core root was also set `visible = shouldShow` directly, overriding any original/dev state.
4. **Frustum culling re-enable** (cc8ab57) relied on bounds that quantization changed. Not proven to cause a visible artifact, but it isn't safe, so it's reverted.

## Fix 1: restore original GLBs (revert c for all files except BCI text, banner, particle core)
Restored from `checkpoint-2026-10-11-pre-optimize-master`: ABOUT/AGENT/PROJECT(S)_TEXT, DECAL, PANEL, Dyson_Ring, Harness_PK_GLTF, decal_*, outer_spinner. Node graphs, materials and transforms are identical to the baseline again. Cost: these files are back to their original sizes (≈16 MB raw, but small compared with the particle core).

## Fix 2: rebuild BCI text and the banner without quantization or dedup
- `scripts/glb-simplify-text-float.mjs`: strip UV/NORMAL (no textures; only the post-processing passes read `uv`), weld, simplify (same ratios as d), bake creased normals (35°), float positions, **original nodes, transforms and materials untouched** (node counts equal to the baseline, verified with a GLB diff).
- Kept gains: BCI 475,241 → 142,572 triangles (21.2 → 5.4 MB raw); banner 456,392 → 149,238 triangles (27.5 → 4.8 MB raw).

## Fix 3: auto-hide never changes `visible`
- `applyAutoHide()` now skips zero-opacity objects by taking them off render layer 0 (`setAutoSkipped`) and only re-enables layer 0 on objects it took off itself. `object.visible` is never written, so original code (`filterToAnimatedModelBranch`, `cleanLooseModelArtifacts`, dev presets) keeps full control and nothing hidden by the site can be re-shown. The site uses no layers otherwise (checked).
- The particle-core root is no longer set `visible = shouldShow`. Its meshes are layer-skipped the same way while `uFieldOpacity ≈ 0`.
- Perf gain kept: zero-opacity rig lines and the dormant core are still skipped by the renderer.

## Fix 4: revert the frustum-culling re-enable
- The Dyson ring, Corporate Agent banner and auxiliary GLBs are back to `frustumCulled = false`, as in the baseline. The original code disabled culling deliberately, and the re-enable relied on bounds that quantization had changed. The gain was small, so it's reverted for safety. (The helper function is left unused.)

## Verification (fix-artifacts @ 806fbcb, local Vite build, SwiftShader, 1280×800, 9 samples at identical flows 0…1)
Baseline = `checkpoint-2026-10-11-pre-optimize-master` plus only the read-only `__portfolioDebug.getScrollProgress` probe (temp worktree, not committed) so both runs sample the same flows.

**Per-object diff** (`tools/diffstate.py`, objects matched by top-level subtree signature + name path; compares effective visibility, material type/color/emissive/emissiveIntensity/emissiveMap/map/colorSpace/vertexColors/side/wireframe/blending/opacity, frustumCulled, attribute list):
| comparison | unexpected differences |
|---|---|
| baseline vs **live post-optimize** (main-BJny5w4c.js) | many: meshes rewrapped as `Object3D` + `*_1` child meshes (so `getObjectByName("Circle004")` returns a wrapper), Hologram materials merged into `Hologram.003`, positions/normals quantized (`Int16n`/`Int8n`, including the rig `cs_*` lines), `frustumCulled` flipped. See `site-capture/runs/diff_base_vs_live_post.md` |
| baseline vs **fix-artifacts** | **0**. Expected only: attrs/verts of the 3 rebuilt assets (BCI text, banner, particle-core UV/tangent strip), and the 8 particle-core meshes render-skipped at flow < 0.69 while their shader alpha `uFieldOpacity` = 0 (invisible in both). See `site-capture/runs/diff_base_vs_fix.md` |

**Visual:** `site-capture/runs/side_by_side_base_live_fix.png` (baseline | live | fix). Frames 0–0.625 and 1.0 match. 0.75 differs by design (crossfade f). 0.875 looked different in the single frame, but a 4-frame time series at flow 0.8875 gives matching brightness (base 39.0/27.9/38.0/35.6 vs fix 39.1/28.0/39.2/34.4): it's the shells' time-animated pulse, not a regression (`runs/pulse_0875_base_vs_fix.png`).

| metric | baseline | live post-optimize | fix-artifacts |
|---|---|---|---|
| triangles / frame (max) | 2,629,848 | 922,614 | 1,043,048 (−60%) |
| draw calls (max / mean) | 93 / 81 | 74 / 66 | 80 / 72 |
| startup ready | 16.3 s | 0.85 s | 0.92 s |
| GLB raw total in dist | 129.5 MB | 40.2 MB | 64.7 MB |
| GLB gzip total | 27.3 MB | — | 24.2 MB |
| console errors / failed requests | 2 / 1 | 0 / 0 | 0 / 0 |

Gains reverted for safety: meshopt/quantization/dedup on every GLB (most of the raw size win) and the frustum-culling re-enable. Gains kept: simplified text meshes, particle-core attribute strip, layer-based skipping, progressive loading, the crossfade, and fixes a.

---
# layout-v2 (implements /workspace/site-capture/LAYOUT_PROPOSAL.md)
Checkpoint tags (pushed): `checkpoint-2026-10-11-pre-layout-master` → 2d72475, `checkpoint-2026-10-11-pre-layout-gh-pages` → ed85866 (live bundle main-BrtA3B5n.js).
Rules kept: no GLB asset, material-definition or compression changes; the fix-artifacts state (original GLBs, layer-based auto-hide, culling off) is untouched.

## L1: six sections mapped to scroll ranges, 5-item nav with active state
| | before | after |
|---|---|---|
| DOM sections | `#experience-section` (Overview + all links, flow 0.03–0.63, 3D-projected), `#timeline-section` (built in `#portfolio-flow`, 0.65–0.75), `#projects-section` ticker (0.76–0.92), `#site-footer` icons | `#layout-v2` with 6 fixed sections: **Hero** 0–0.12, **About** 0.12–0.30, **Projects** 0.30–0.55, **Timeline** 0.55–0.75, **Now** 0.75–0.88, **Contact** 0.88–1.0 (`data-range`) |
| content | — | All existing text kept, reorganised. Hero = name from the page title + the Overview tagline; About = the 4 Overview paragraphs; Projects = the Sentinel Construct / 100K Campaign Summary / Biomed Indexing Tool / Resume/PDF Editor links, with trajectory lines from `project-timeline.js`; Now = the 9 "Working on" codenames (de-duplicated, the marquee copy dropped); Contact = the "links listed here" sentence, email/Website/GitHub/LinkedIn/X/Resume |
| nav | 4 items (About, Timeline, Projects, Contact), active = closest marker | 5 items (About, Projects, Timeline, Now, Contact), active = the item whose `data-range` contains the progress (none in the hero), `aria-current`, plus a progress rail |
| controller | `updateFlowSections` projected sections into 3D space | `js/layout-v2.js` driven from `animate()` with the same `flowProgress` as the 3D. The old flow sections no longer exist (`flowSections` is empty, so the old projection code is a no-op). The duplicate timeline summary panel in the nav is no longer rendered |
| Hero/Contact CTAs | — | buttons reuse the menu's `setEffectiveScrollProgress` via `data-scroll-to` |

## L2: type scale, line-length cap, alternating blurred panels, no all-caps paragraphs
| | before | after |
|---|---|---|
| type | Teko everywhere; Overview tagline and ticker in all caps; paragraphs at the default size | H1 64 / H2 40 / H3 22 px (Teko); body 18 px IBM Plex Sans @ 1.6 line height, captions 13 px; uppercase only on small eyebrow labels |
| measure | full-width paragraphs (≈180 characters per line at 1280 px) | `max-width: 68ch` on every paragraph |
| panels | text floated over the particles | one panel per section, `backdrop-filter: blur(14px)` on a 56–68% dark gradient, 40 px padding, 16 px radius |
| columns | everything left/center | Hero center → About **left** → Projects **right** → Timeline **left** → Now **right** → Contact center. Right panels clear the fixed nav (200 px) |
| spacing | ad hoc | 8-px grid: 120 px side padding, 24 px heading→body, 16 px between paragraphs and cards |
| nav | panel tilted `rotateY(-45deg)` | flat panel (readability) |
| fonts | Teko only | Teko + IBM Plex Sans (same Google Fonts request; the CSS already referenced Plex Sans but never loaded it) |

## L2b: style the preload overlay (pre-existing bug)
Before: `#preload-overlay` had no CSS anywhere in the repo, so "Initializing / 100%" stayed visible top-left on the live site after load. After: a full-screen loader (spinner, meter bar, percent) that fades out when main.js adds `.is-hidden`.

## L3: timeline split into "My builds" and "External / org milestones"
| | before | after |
|---|---|---|
| structure | one "Project Lifecycle Projection Matrix" grid: 5 project cards × 10 yearly cells, a "Manual Hook" dev note, plus a duplicate summary in the nav | **Lane A "My builds"**: the 5 projects (Portfolio_2025, Sentinel Construct, Biomed Indexing Tool, Research Systems, Colony Intelligence Framework), each with Now / Next 2 yrs / Long-term. **Lane B "External / org milestones"**: `EXTERNAL_ORG_MILESTONES` (exported, empty by default, each entry needs an `org` tag rendered as an orange pill; shows "None listed.") |
| actual vs planned | not distinguished (`is-current` only on the first year cell) | solid marker = current year (in progress), hollow = planned/projected, with a legend. The data has **no completed (actual) milestones**, so the current-year entry is the only "actual/in progress" one |
| full detail | always shown | "Full 10-year matrix" `<details>` keeps all the original content (year rail, cards with horizons, Manual Hook note). When open it replaces the lanes and scrolls inside the panel (the wheel is consumed while it can scroll) |

## L4: 3D focal object in the empty half; extruded words as faint watermarks
| | before | after |
|---|---|---|
| focal placement | the scene's focal object (core / rig / shells) always sits at screen center, under the text | `camera.setViewOffset` shifts the **projected image** ±22% of the width toward the half without text (About/Timeline → right, Projects/Now → left, Hero/Contact centered). Projection only: no object transform, visibility or material changes (the diffstate world positions and materials are unaffected; only screen/NDC positions move) |
| extruded words | ABOUT / BCI / PROJECT / AGENT text GLBs drawn at their authored opacity, often larger than the DOM headings | per-mesh runtime materials scaled to **15%** of whatever opacity the original code sets (the base is re-read whenever the original code writes a new value), `transparent=true`, `depthWrite=false` so they can't occlude the focal object. GLB files and authored materials are unchanged; the banner ("Because Corporate Agents…") is not a watermark and keeps its look |

## L5: transition rules (6% crossfade bands, reading zones, text after 3D)
| | before | after |
|---|---|---|
| section swaps | hard threshold switch (L1) / old 3D-projected fly-through | each boundary (0.12, 0.30, 0.55, 0.75, 0.88) owns a **6%-of-flow band**. Within the band (u 0→1): 3D focal shift eases over u 0→0.6; outgoing text fades and travels 16 px over u 0→0.45; incoming text fades in over u 0.5→1. **Text always moves after the 3D** (the 3D is 83% done when incoming text starts) |
| reading zones | none | hero 0–0.09 · about 0.15–0.27 · projects 0.33–0.52 · timeline 0.58–0.72 · now 0.78–0.85 · contact 0.91–1.0. Text is static and fully opaque, and no layout-driven 3D change happens there |
| determinism | time-eased view offset (L4) | `computeLayoutFrame(flow)` is a pure function of scroll flow (unit-checked: e.g. 0.105 → hero 0.42, focus 0.083; 0.135 → about 0.50, focus 0.22). Only a light 0.25 per-frame smoothing removes wheel-notch stepping |

## L6: reduced-motion and mobile variants; scrollable long panels
| | before | after |
|---|---|---|
| long text | — | panels scroll internally (`overflow-y:auto`, `overscroll-behavior:contain`). Wheel/touch is consumed by the panel only while it can scroll in that direction, then the page flow resumes (the virtual-touch anchor is kept in sync, so no jump). About uses the wide panel |
| `prefers-reduced-motion` | only capped zoom blur (`visualSafetyActive`) | no layout-driven 3D movement (focus offset 0), no text travel (crossfade only), zoom blur 0, static camera (no pointer parallax, no orbit wobble), no CSS transitions/rail animation |
| mobile ≤ 640 px | desktop layout squeezed; nav a vertical tilted panel on the right | type scale 40/28/18/16/12; text is a bottom sheet (max 56vh, scrollable), 3D focal object shifted up 20% via the view offset; nav = 5-column top bar with a horizontal progress line; **particle draw count halved** (`setDrawRange`) and **extruded words hidden** (watermark factor 0, so auto-hide skips them) |

## L6b: long panels reset to their top when the section hides
Before: a scrolled About panel kept its scroll position, so re-entering showed mid-text without the heading. After: `scrollTop` resets once the section's opacity reaches 0.

## L7: focal placement tuning and overflow hint
Before: a symmetric ±22% shift put the object partly under the fixed nav, and the overflowing Timeline/About panels gave no hint of more content. After: +24% (text left) / −26% (text right), a bottom fade mask on panels with content below, a taller Timeline panel and denser rows.

## layout-v2 verification (9614f16, local Vite build, SwiftShader)
- **Captures** (`site-capture/layout_capture.py`: canvas frame + transparent DOM layer composite, ≤290 s each): desktop 1280×800 and mobile 390×844, before (pre-layout = live main-BrtA3B5n.js) and after, 6 stops (0.05/0.21/0.42/0.65/0.81/0.95). Each stop shows exactly one section with the matching nav item active (none in the hero). **0 console errors, 0 failed requests** in all four runs and both manifest runs.
- **Contact sheets:** `site-capture/runs/layout_v2/contact_sheet_1280x800_before_after.png`, `…/contact_sheet_390x844_before_after.png`. Caveat: the composite doesn't apply the CSS backdrop blur over the canvas.
- **diffstate** (`tools/diffstate.py`, pre-layout vs layout-v2 manifests at identical flows 0…1): **0 unexpected**. Intentional only: the 4 word GLBs (ABOUT_TEXT, AGENT_TEXT, BCI_TEXT, PROJECT_TEXT ×2 meshes) with `mat.op` = 15% of the original value, `transparent` → true, `depthWrite` → false. No visibility differences. World transforms are unchanged; the focal repositioning is a camera view offset (projection only). Report: `site-capture/runs/diff_prelayout_vs_layout_v2.md`.
- **Performance:** max triangles 1,043,048 → 1,043,048 and max draw calls 80 → 80 (unchanged). Startup under SwiftShader is noisy (manifest runs 7.1 s → 15.5 s; layout captures ready at 1.0 s desktop / 4.3 s mobile). There's no new asset loading, so this isn't treated as a regression, but check on real hardware.
- **Mobile variant** (not covered by the desktop diff): particle draw range halved and words hidden (by design).

## Contact email
- Before: `devin@example.com` (placeholder)
- After: `contactform@keemail.me` (owner-provided), index.html

## Spelling
- Before: `VECTOR-MERGE PHYSICS APPROXIAMATOR`
- After: `VECTOR-MERGE PHYSICS APPROXIMATOR` (codespell pass found no other user-facing misspellings)

---
# cards-v3 (content changes; layout and 3D untouched)
Checkpoint tags (pushed): `checkpoint-2026-10-12-pre-cards-master` → c898d06, `checkpoint-2026-10-12-pre-cards-gh-pages` → bec354d (live bundle main-BoWRlhkK.js).

## C1: remove the resume tool button from Contact
Before: Contact had 6 buttons (Email, Website, GitHub, LinkedIn, X, Resume/ PDF Editor). After: 5 buttons, without the resume tool. `resume-tools.html` stays in the repo and in the Vite build (used for revising/injecting project examples and exporting PDFs).

## C2: data-driven project cards (`js/data/projects.js` → `js/project-cards.js`)
| | before | after |
|---|---|---|
| source | 3 hand-written `<article>`s in index.html | one data module: `id, title, status (shipped/in-progress/upcoming/null), date, summary, tags, order, url, links[], media[]`. `media[]` is reserved for a future expand-on-click (not rendered). The cards render into `#v2-project-cards` with the existing panel/card styling plus status badges, date and tags |
| order | Sentinel Construct, Biomed Indexing Tool, Resume/PDF Editor | 1 **Phantom Walk** (shipped, 2026, phantomwalk.com) · 2 **Untitled — 3D Photographic Diffusion** (upcoming) · 3 **Portfolio_2025** (shipped; site + source links) · 4 Sentinel Construct · 5 Biomed Indexing Tool · 6 Research Systems · 7 Colony Intelligence Framework · 8 Resume/ PDF Editor (no badge) |
| facts | — | Summaries for 4–7 are their existing `trajectory` lines from the timeline. "In progress" for 4–7 reflects their current-year entries in the timeline data. Nothing else was added |

## C3: Phantom Walk in the timeline's "My builds" lane as shipped (actual, 2026)
Before: Lane A had 5 projected builds only, with no actual milestones. After: a `SHIPPED_BUILDS` list (derived from `projects.js`, so the title and summary stay consistent with the card) adds **Phantom Walk — Shipped 2026** as the first row, with a distinct green diamond "Shipped (actual)" marker and legend entry. It has no yearly projections, so it isn't added to `PROJECT_LIFECYCLE_PROJECTIONS`: the 10-year matrix, `PROJECT_TIMELINE_KEYFRAME_GUIDE` and their 5×10 shape are unchanged.

## C4: owner photo as a circular avatar in the About card
Before: About had only the eyebrow and heading. After: a 112 px (72 px on mobile) circular bubble next to the heading, with a gradient ring, glow and the same blur as the panel. Alt text "Devin Edwards". Square, face-centered crop (1040 px from the 1264×1568 source) exported to `public/assets/avatar/`: `devin-edwards-256.webp` 4.4 KB, `devin-edwards-512.webp` 20.0 KB (srcset 256w/512w), `devin-edwards-512.jpg` 27.0 KB fallback. All are under 60 KB.

## cards-v3 verification (local Vite build, SwiftShader)
- **Captures** (`tools/layout_capture.py`, ≤290 s each, stops 0.21/0.42/0.65/0.95): desktop 1280×800 and mobile 390×844, before (live c898d06, main-BoWRlhkK.js) and after. **0 console errors, 0 failed requests** in all 4 layout runs and both manifest runs (so the avatar files and the data module load correctly).
- **Contact sheets:** `site-capture/runs/cards_v3/contact_sheet_1280x800_before_after.png`, `…/contact_sheet_390x844_before_after.png`.
- **diffstate** (pre-cards vs cards-v3 manifests, identical flows 0…1): **0 unexpected, 0 intentional**. The 3D scene is byte-for-byte the same in visibility and material state. Report: `site-capture/runs/diff_precards_vs_cards_v3.md`.

## Projects: remove Resume/PDF Editor card
- Before: 8 cards (last: Resume/ PDF Editor -> /resume-tools.html)
- After: 7 cards; resume-tools.html stays in repo/build, unlinked from Projects and Contact

# qa-fixes (2026-10-12), from site-capture/runs/qa_2026-10-12/QA_REPORT.md
Checkpoints: checkpoint-2026-10-12-pre-qa-fixes-master (2dd256d), checkpoint-2026-10-12-pre-qa-fixes-gh-pages (9667312).

## QA-1 (HIGH) mobile pull-to-refresh
- **Before:**
  - touchstart didn't set the touch anchor, so the first touchmove had delta 0 and returned early without calling preventDefault.
  - Chrome then committed to a native scroll or pull-to-refresh, and every later move became cancelable=false (83 "Ignored attempt to cancel" logs).
- **After:**
  - touchstart records the anchor, and window touchmove (passive:false) always calls preventDefault when the event is cancelable. Panels that can scroll still call stopPropagation first.
  - CSS: `html,body{overscroll-behavior:none}`, `#background-canvas{touch-action:none}`, `.v2-panel{touch-action:pan-y}`.

## QA-2 touch momentum
- **Before:** after a fling, the flow stopped dead on release.
- **After:**
  - Touchmove deltas from the last 120 ms give the release velocity.
  - If it's over 0.3 px/ms, the glide is velocity×260 ms, capped at 1.6 viewport heights, and goes through the existing eased `setEffectiveScrollProgress(…, "smooth")`.
  - A new touchstart cancels the glide.

## QA-3 keyboard
- **Before:** the global keydown handler called preventDefault on Space, arrows, PageUp/PageDown, Home and End whatever had focus. Space on a nav button scrolled the page instead of pressing it.
- **After:** `keyBelongsToFocus()` lets the key through when:
  - a modifier key is held or the event was already handled;
  - focus is in a form control or contenteditable element;
  - it's Space on a button, link, summary or role=button/link;
  - focus is inside an element that can scroll (overflow-y auto/scroll), so keys scroll that panel natively.
- **Deviation:** arrow keys on a focused button still drive the page flow. That's the native behaviour, and nav buttons keep focus after a mouse click.

## QA-4 save/restore scroll progress
- **Before:** back/forward or reload always restarted at flow 0. In the QA run, the page was left at 0.425 and came back at 0.
- **After:**
  - The flow is saved 200 ms after the scroll settles, and on pagehide, to `history.state.flow` and `sessionStorage["portfolio.flow"]`.
  - On load it's restored instantly, history.state first; `pageshow` with persisted=true restores it too.
  - `history.scrollRestoration = "manual"`.

## QA-5a focus rings + selectable panel text
- **Before:**
  - `.v2-button`/`.v2-link:focus-visible` used `outline:none`, so the only focus cue was the hover background.
  - `body{user-select:none}` stopped any text being selected.
- **After:**
  - A 2px #e8f2ff outline at offset 3px on the focus-visible state of buttons, links and nav items.
  - `.v2-panel` and everything in it have `user-select:text`; the canvas and site chrome stay unselectable.
- **Note:** the contact email is only a `mailto:` button ("✉ Email"). The address isn't printed as text, so there's nothing visible to copy. I didn't add content.

## QA-5b dragonfire service worker scope
- **Before:** `dragonfire-sw.js` was registered at root scope with a cache-first fetch for every request. After one visit to /dragonfire-protocol.html, it controlled the whole site.
- **After:**
  - Registration uses `{scope:"./dragonfire-protocol"}`, and the page unregisters any old root-scope dragonfire registration.
  - The SW only answers cache-first for navigations to /dragonfire-protocol(.html) and for requests whose client is that page. Everything else goes to the network.
  - The cache was bumped to v2, and activate deletes v1.
  - Dragonfire offline mode is unchanged.

## Styling: scoped grey (replaces html{filter:saturate(0%)})
- **Before:** `html{filter:saturate(0%)}` in css/main.css greyed everything, including the avatar and the status badges, and re-filtered the whole page every frame.
- **After** (css/layout-v2.css "Scoped grey"):
  - **Body children:** `saturate(0%)` on every body child except `#layout-v2`, `#sci-fi-menu` and `.projection-overlay`. The canvas gets its own compositor filter.
  - **Nav and overlay:** their children and ::before/::after are filtered instead of the containers. A filtered ancestor would become the Backdrop Root and the `.menu-panel` blur would lose the scene.
  - **Panels:** a panel with no avatar or badge is filtered as a whole. On the path to an exempt element (About panel, Projects panel, cards, card head/meta), only the topmost exempt-free children are filtered. The containers' own paint uses pre-computed greys (Chrome's `saturate()` = sRGB matrix with Rec.709 weights, verified by pixel test). The values: panel border/gradient, card bg/border, avatar ring/glow.
  - **Exempt:** `.v2-avatar` (colour graded into the file) and `.v2-status` (`filter:saturate(75%)`).
- **Why it matches exactly:** saturate(0) is idempotent and commutes with blur and alpha compositing.
- **Verification:** real-compositor captures at 6 flows × 2 sizes. Max channel spread outside the avatar/badges is 0 before and 0 after. See site-capture/runs/qa_fixes/.

## Styling: avatar cyberpunk-sepia grade (baked)
- **Before:** the plain photo (cards-v3). Originals stay in git history at 2dd256d, and there's a copy in site-capture/runs/qa_fixes/avatar_original_512.jpg.
- **After:** `site-capture/grade_avatar.py` from the 512 px original, with no runtime CSS filter:
  1. warm sepia base (luma toned 1.07/0.86/0.62) at 70% over the photo;
  2. split tone: teal/cyan shadows (−.05,+.045,+.085)·(1−Y)², magenta/neon highlights (+.09,−.035,+.105)·Y²;
  3. saturation baked at 75% (same sRGB matrix as CSS `saturate(0.75)`);
  4. UnsharpMask radius 2, 15%.
- **Files:**

  | File | Size |
  |---|---|
  | devin-edwards-256.webp | 4.8 KB |
  | devin-edwards-512.webp | 20.6 KB |
  | devin-edwards-512.jpg | 28.9 KB |

  All under 60 KB.
- **Before/after image:** site-capture/runs/qa_fixes/avatar_before_after_v2.png

## qa-fixes verification (local Vite builds, SwiftShader; before = checkpoint 2dd256d on :8101, after = qa-fixes on :8102)
- **Touch (390x844):**
  - Pull-down at the top: 12/12 moves cancelable and defaultPrevented, including the first. Before: the first wasn't prevented and the rest were non-cancelable.
  - 0 "Ignored attempt to cancel" logs (83 before).
  - Fling: 0.068 at release → 0.126 after 1.2 s.
  - Touch sync: 397 frames, 0 mismatches. Panel native scroll and orientation are unchanged.
- **Keyboard:**
  - Space on a focused nav button activates it (Contact → 0.95; About from 0.65 → 0.21).
  - Arrow on body still scrolls the flow.
  - Arrow inside the scrollable Projects panel scrolls the panel (scrollTop 0→40) and the flow stays at 0.425.
- **Restore:** reload at 0.65 → 0.65. about:blank + back at 0.425 → 0.425 (Playwright: no bfcache, full reload path).
- **Focus and selection:** `.v2-link:focus-visible` outline is solid 2px; contact text user-select is `text`.
- **Service worker:**
  - after: registration scope /dragonfire-protocol, dragonfire offline reload works, main page not controlled.
  - before: root scope, main page controlled.
- **Sync** (desktop + mobile): 0 section/nav mismatch frames in all runs; all 5 nav targets are correct.
- **Errors:** 0 console errors, 0 warnings, 0 failed requests.
- **Grey:**
  - Max channel spread outside the avatar/badges is 0 before and after, at 12 shots.
  - Full-frame diff mean 0.03–0.36 levels (live canvas animation, blur sampling).
  - Badges at 75% (green/amber). Avatar shows the graded colour.
- **diffstate** (runs/diff_preqa_vs_qa_fixes.md): it reports 90 "unexpected" entries. All 90 are #1/#2 pairing swaps between duplicate-path Circle meshes (load-order dependent). Comparing the per-sample multiset of (path, material, vis, wvis, layer0) for all Circle objects gives 0 differences in 9/9 samples, so there are **0 real 3D differences**.
