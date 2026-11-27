// Gives every bone of a Blender-exported cast model the rest pose City Fun Time expects (2026-11-27): rotation
// identity, scale 1, translation = offset from the parent joint. cft-world copies its figure's joint quaternions straight
// onto these bones, so a bone that rests with any rotation would twist the limb. The mesh does not move: each joint's
// inverse bind matrix is rebuilt so that newJointWorld * newIBM == oldJointWorld * oldIBM (the same skinning at rest).
// Usage: node fix_rest.mjs IN.glb OUT.glb   (NODE_PATH = tools/cast_models/node_modules)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const [inp, out] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);

// --- tiny column-major 4x4 helpers (glTF layout)
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const trs = (t, q, s) => {
  const [x, y, z, w] = q, [sx, sy, sz] = s;
  return [(1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, t[0], t[1], t[2], 1];
};
function inv(m) {  // general 4x4 inverse
  const o = new Array(16), [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11,
    b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30,
    b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
  return o;
}
const local = n => trs(n.getTranslation(), n.getRotation(), n.getScale());
const parentOf = new Map();
const walk = (n, p) => { parentOf.set(n, p); for (const c of n.listChildren()) walk(c, n); };
for (const sc of doc.getRoot().listScenes()) for (const n of sc.listChildren()) walk(n, null);
const world = n => { let m = local(n); for (let p = parentOf.get(n); p; p = parentOf.get(p)) m = mul(local(p), m); return m; };

for (const skin of doc.getRoot().listSkins()) {
  const joints = skin.listJoints(), ibmAcc = skin.getInverseBindMatrices(), ibm = ibmAcc.getArray();
  const oldW = new Map(joints.map(j => [j, world(j)]));
  const skinAtRest = joints.map((j, i) => mul(oldW.get(j), Array.from(ibm.slice(i * 16, i * 16 + 16))));
  // parents first (joints come in hierarchy order from Blender; sort by depth to be safe)
  const depth = j => { let d = 0; for (let p = parentOf.get(j); p; p = parentOf.get(p)) d++; return d; };
  for (const j of [...joints].sort((a, b) => depth(a) - depth(b))) {
    const p = parentOf.get(j), wp = oldW.get(j);
    const pw = p ? world(p) : null;  // the parent is already fixed (its new world)
    const pos = [wp[12], wp[13], wp[14]];
    // the parent's new world is a pure translation for joints, but keep it general for the armature node
    const t = pw ? (() => { const iv = inv(pw); return [0, 1, 2].map(r => iv[r] * pos[0] + iv[4 + r] * pos[1] + iv[8 + r] * pos[2] + iv[12 + r]); })() : pos;
    j.setTranslation(t).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }
  joints.forEach((j, i) => ibm.set(mul(inv(world(j)), skinAtRest[i]), i * 16));
  ibmAcc.setArray(ibm);
}
// meshes skinned to this skeleton: three ignores their own node transform only for the bind; keep them identity
await io.write(out, doc);
const names = doc.getRoot().listSkins()[0].listJoints().map(j => j.getName());
console.log('fixed', out, names.length, 'joints:', names.join(' '));
