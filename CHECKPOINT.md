# Checkpoint: pre-optimize (2026-10-11)

Created before the `optimize-runtime` work. Nothing below has been deployed.

| Ref | Tag (pushed to origin) | Commit |
|---|---|---|
| master (source) | `checkpoint-2026-10-11-pre-optimize-master` | `236170aa8b826057b25b2fb07c2c3244ba87c9ee` |
| gh-pages (live, www.devinedwards.info) | `checkpoint-2026-10-11-pre-optimize-gh-pages` | `7678b3749d5c45202bde44c1e5f414d86259593a` |

Full backup (working tree + .git + node_modules): `/workspace/checkpoints/portfolio-2025-pre-optimize-20261011-180453.tar.gz`
sha256: `95d0a08500d9a90a6132184918f202c19dc76e42bf8f0132fe9be741412c7bd6`

## Baseline metrics (live site, /workspace/site-capture, 2026-10-11)
- About 2.63M triangles and 93 draw calls per frame (80 after warm-up); 14 textures, 26 programs, 465 Object3Ds (344 bones).
- `particle_core_wireframe.glb`: 13.7 MB transferred (66.5 MB raw in git), 17.2 s load.
- About 26 MB of GLBs transferred (raw GLBs in assets/GLTF ≈ 128 MB).
- Hard visual cut between 37% and 42% scroll (particle core → wireframe shells, no blend).
- `GET /assets/undefined` → 404.
- `ReferenceError: updateCursorPosition is not defined`.
- 31–33 heavy objects drawn while offscreen; 32 rig-helper lines drawn at opacity 0.

## Rollback
```bash
# Discard the branch locally (master and gh-pages were never changed):
git checkout master && git branch -D optimize-runtime
# If gh-pages was ever deployed from this work, restore live:
git push --force origin checkpoint-2026-10-11-pre-optimize-gh-pages^{commit}:refs/heads/gh-pages
# If master was ever changed:
git push --force origin checkpoint-2026-10-11-pre-optimize-master^{commit}:refs/heads/master
# Full restore from tarball:
sha256sum -c /workspace/checkpoints/portfolio-2025-pre-optimize-20261011-180453.tar.gz.sha256 --ignore-missing
mv /workspace/portfolio-2025 /workspace/portfolio-2025.bad && tar xzf /workspace/checkpoints/portfolio-2025-pre-optimize-20261011-180453.tar.gz -C /workspace
```
