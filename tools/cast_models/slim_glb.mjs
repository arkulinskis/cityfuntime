// Slims Actor Troop .glb exports for the browser (2026-11-24): drops tangents + normal maps (too fine to see in the
// game), welds, simplifies (meshoptimizer) and quantizes (KHR_mesh_quantization: three's stock GLTFLoader reads it,
// no decoder needed). Usage: node slim_glb.mjs IN_DIR OUT_DIR [ratio]   (env SLIM_ERROR: simplifier error, default 0.0006)
// Needs: npm install @gltf-transform/core@4.1.1 @gltf-transform/functions@4.1.1 @gltf-transform/extensions@4.1.1 meshoptimizer@0.22.0
// (set NODE_PATH to that folder's node_modules, see README.md here).
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, simplify, quantize, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const [inDir, outDir, r] = process.argv.slice(2);
const ratio = r ? +r : 0.55;
fs.mkdirSync(outDir, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
for (const f of fs.readdirSync(inDir).filter(f => f.endsWith('.glb'))) {
  const doc = await io.read(path.join(inDir, f));
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) p.setAttribute('TANGENT', null);
  if (!process.env.KEEP_NORMALS) for (const m of doc.getRoot().listMaterials()) m.setNormalTexture(null);   // the MPFB build keeps its cloth normal maps
  await doc.transform(
    dedup(), weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio, error: +(process.env.SLIM_ERROR || 0.0006) }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8, quantizeWeight: 8 }),
    prune(),
  );
  await io.write(path.join(outDir, f), doc);
  const a = fs.statSync(path.join(inDir, f)).size, b = fs.statSync(path.join(outDir, f)).size;
  console.log(f.padEnd(14), (a / 1e6).toFixed(2), 'MB ->', (b / 1e6).toFixed(2), 'MB');
}
