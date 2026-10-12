// Simplify extruded-text GLBs WITHOUT quantization/dedup: float positions, original nodes/materials,
// creased normals baked. Usage: node textfloat.mjs in out ratio error [angleDeg]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import * as THREE from '/workspace/portfolio-2025/node_modules/three/build/three.module.js';
import { toCreasedNormals, mergeVertices } from '/workspace/portfolio-2025/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
const [,, inp, out, ratio, err, deg='35'] = process.argv;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) for (const s of ['TEXCOORD_0','NORMAL']) if (p.getAttribute(s)) p.setAttribute(s, null);
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: +ratio, error: +err, lockBorder: false }));
const buf = doc.getRoot().listBuffers()[0];
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p.getAttribute('POSITION').getArray()), 3));
  g.setIndex(new THREE.BufferAttribute(Uint32Array.from(p.getIndices().getArray()), 1));
  let c = toCreasedNormals(g, (+deg) * Math.PI / 180); c = mergeVertices(c, 1e-6);
  p.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(c.attributes.position.array)).setBuffer(buf));
  p.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(c.attributes.normal.array)).setBuffer(buf));
  p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(c.index.array)).setBuffer(buf));
  console.log(m.getName(), 'verts', c.attributes.position.count, 'tris', c.index.count / 3);
}
// drop orphaned accessors only (no node/material pruning)
for (const a of doc.getRoot().listAccessors()) if (a.listParents().filter(x => x.propertyType !== 'Root').length === 0) a.dispose();
await io.write(out, doc);
