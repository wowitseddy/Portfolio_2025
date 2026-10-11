# Changes and swaps: optimize-runtime

Baseline: see CHECKPOINT.md. Each entry has one commit, what changed or was swapped, and before → after.

## a. Fix /assets/undefined 404 and updateCursorPosition ReferenceError
- `main.js`: `OUTER_RING_MODEL_SRC` pointed at `decal_ring_outer.glb`, which doesn't exist (only `decal_ring_outer_.glb` does). Vite rewrote the missing URL to `/assets/undefined`. Swapped it to `decal_ring_outer_.glb`, the file the code already used as its fallback.
- `js/hexgrid.js`: removed the `window.onload` handler that referenced the undefined global `updateCursorPosition`. The real handler lives in reticule.js. Added a null guard for `.hex-grid` / `.gradient-mask`.
- Before: 1 failed request (404) plus 1 pageerror on every load. After: 0 / 0 (verified in the localhost capture; see Verification).

