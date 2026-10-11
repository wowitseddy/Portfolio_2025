import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup, quantize, meshopt, reorder } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
const [,, inp, out, ratio='0.5', err='0.002', names=''] = process.argv;
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder': MeshoptEncoder});
const doc = await io.read(inp);
const only = names ? names.split(',') : null;
for (const mesh of doc.getRoot().listMeshes()) {
  if (only && !only.includes(mesh.getName())) continue;
  for (const p of mesh.listPrimitives()) {
    for (const s of (process.env.STRIP||'TANGENT,TEXCOORD_0,TEXCOORD_1').split(',')) { const a = p.getAttribute(s); if (a) p.setAttribute(s, null); }
  }
}
await doc.transform(dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: +ratio, error: +err, lockBorder: false }), prune(),
  reorder({ encoder: MeshoptEncoder }), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) console.log(m.getName(), 'verts', p.getAttribute('POSITION').getCount(), 'tris', (p.getIndices()?.getCount()||0)/3);
await io.write(out, doc);
