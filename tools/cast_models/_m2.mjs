import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f); const r = doc.getRoot();
  const nodes = r.listNodes().filter(n => n.getMesh()).map(n => n.getName() + (n.getSkin() ? '(skin)' : '') + ':' + n.getMesh().listPrimitives().reduce((a, p) => a + p.getIndices().getCount() / 3, 0));
  console.log(f.split('/').pop(), 'meshNodes', nodes.join(' '), '| anims', r.listAnimations().map(a => a.getName() + '=' + Math.max(...a.listSamplers().map(s => s.getInput().getMax([])[0])).toFixed(2)).join(','), '| tex', r.listTextures().map(t => t.getMimeType() + t.getSize()).join(' '), '| joints', r.listSkins()[0]?.listJoints().length);
}
