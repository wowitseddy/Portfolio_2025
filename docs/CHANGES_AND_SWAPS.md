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

