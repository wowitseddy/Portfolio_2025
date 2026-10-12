import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
const [,, inp, out] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) for (const s of ['TANGENT','TEXCOORD_0']) if (p.getAttribute(s)) p.setAttribute(s, null);
await doc.transform(prune());
await io.write(out, doc);
