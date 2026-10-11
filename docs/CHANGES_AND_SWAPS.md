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

