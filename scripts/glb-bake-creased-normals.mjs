// Bake creased normals offline into meshes that lack NORMAL (after weld/simplify).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, quantize, meshopt, reorder, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from '/workspace/portfolio-2025/node_modules/three/build/three.module.js';
import { toCreasedNormals } from '/workspace/portfolio-2025/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
const [,, inp, out, deg='35'] = process.argv;
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder});
const doc = await io.read(inp);
// dequantize to float first
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
  if (p.getAttribute('NORMAL')) continue;
  const pos = p.getAttribute('POSITION'); const n = pos.getCount(); const arr = new Float32Array(n*3); const el=[0,0,0];
  for (let i=0;i<n;i++){pos.getElement(i,el);arr.set(el,i*3);}
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr,3));
  if (p.getIndices()) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(p.getIndices().getArray()),1));
  const c = toCreasedNormals(g, (+deg)*Math.PI/180);
  const buf = doc.getRoot().listBuffers()[0];
  const P = doc.createAccessor().setType('VEC3').setArray(new Float32Array(c.attributes.position.array)).setBuffer(buf);
  const N = doc.createAccessor().setType('VEC3').setArray(new Float32Array(c.attributes.normal.array)).setBuffer(buf);
  p.setAttribute('POSITION', P).setAttribute('NORMAL', N).setIndices(null);
  console.log(m.getName(), 'baked creased normals, tris', c.attributes.position.count/3);
}
await doc.transform(weld(), prune(), reorder({encoder: MeshoptEncoder}), quantize(), meshopt({encoder: MeshoptEncoder, level:'medium'}));
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) console.log(m.getName(),'verts',p.getAttribute('POSITION').getCount(),'tris',(p.getIndices()?.getCount()||0)/3);
await io.write(out, doc);
