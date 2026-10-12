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

