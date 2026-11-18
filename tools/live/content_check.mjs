// Checks theme/assets/cft-content.js: every mission's references (requirements, givers, items, place kinds, pickups,
// rewards, quizzes), shop lists, and that every story mission can actually be reached.
//   node tools/live/content_check.mjs          -> "CONTENT OK (153 missions)" or a list of problems
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
globalThis.window = {};
createRequire(import.meta.url)(path.join(root, 'theme', 'assets', 'cft-content.js'));
const D = globalThis.window.CFT_DATA;
const bad = [];
const ids = new Set(D.MISSIONS.map(m => m.id));
if (ids.size !== D.MISSIONS.length) bad.push('duplicate mission ids');
const TARGETS = ['giver', 'who', 'home', 'here', 'addr', 'tall', 'water', 'spot', 'hilltop'];
const STICKER_IDS = new Set();
for (const s of D.STICKER_SETS) for (const [id] of s.items) { if (STICKER_IDS.has(id)) bad.push('duplicate sticker id ' + id); STICKER_IDS.add(id); }
const DOS = new Set(['go', 'talk', 'collect', 'deliver', 'buy', 'have', 'stat', 'level', 'own', 'pay', 'escort', 'chase', 'race', 'photo', 'visit', 'dance', 'quiz', 'sleep', 'walk', 'chat', 'tag', 'defend', 'rush', 'count']);
const COUNTERS = new Set(['secrets', 'fires_out', 'megas', 'zaps', 'walljumps', 'bestchain', 'stomps',  // the campaign update
  'shots', 'bonk_gull', 'dex', 'airtime', 'hoops', 'rankA', 'rankS', 'rankSS', 'rankSSS', 'farts', 'pinatas', 'launches', 'reflects', 'cushions', 'aura',  // the chaos update
  'bonks', 'helped', 'flirts', 'escapes', 'slides', 'bounces', 'ufos', 'boss', 'sweet', 'crowned', 'weapons', 'pranks', 'dates', 'jokes',
  'blocks', 'parries', 'lib_hearton', 'lib_grocery', 'liberated', 'smash', 'borrowed', 'carsmash', 'maincharacter']);
const OWN = new Set(['apt', 'biz', 'bizid', 'turf', 'friends', 'kids', 'managers', 'upgrades', 'stickers', 'sets']);
const kind = (k, where) => { if (k && !D.KINDS[k] && !TARGETS.includes(k)) bad.push(where + ': unknown place ' + k); };
for (const m of D.MISSIONS) {
  const w = m.id;
  for (const r of m.req.m || []) if (!ids.has(r)) bad.push(w + ': requires unknown ' + r);
  if (!D.CAST[m.giver]) bad.push(w + ': unknown giver ' + m.giver);
  kind(m.at, w);
  if (!m.intro || !m.intro.length) bad.push(w + ': no intro');
  m.steps.forEach((s, i) => {
    const at = w + ' step ' + (i + 1);
    if (!DOS.has(s.do)) bad.push(at + ': unknown step ' + s.do);
    if (!s.text) bad.push(at + ': no text');
    if (s.item && !D.ITEMS[s.item]) bad.push(at + ': unknown item ' + s.item);
    if (s.who && s.who !== 'kid' && !D.CAST[s.who]) bad.push(at + ': unknown person ' + s.who);
    if (s.do === 'collect' && !D.PICKUPS[s.what]) bad.push(at + ': unknown pickup ' + s.what);
    if (s.do === 'own' && !OWN.has(s.what)) bad.push(at + ': unknown own ' + s.what);
    if (s.do === 'own' && s.what === 'bizid' && !D.BUSINESSES.some(b => b.id === s.id)) bad.push(at + ': unknown business ' + s.id);
    if (s.do === 'quiz' && !(s.qs && s.qs.length >= s.need)) bad.push(at + ': quiz too short');
    if (s.do === 'stat' && s.stat !== 'happy' && !D.STATS.some(x => x.id === s.stat)) bad.push(at + ': unknown stat ' + s.stat);
    if (s.to === 'who' && !s.who) bad.push(at + ': to who needs who');
    if (s.do === 'count' && !(COUNTERS.has(s.key) && s.n > 0)) bad.push(at + ': count needs a known key and n');
    [s.to, s.at, s.of].forEach(k => kind(k, at));
    (s.kinds || []).forEach(k => kind(k, at));
    if (s.ask) s.ask.opts.forEach(o => { if (o.length !== 4) bad.push(at + ': answer needs [text, need, reply, good]'); });
  });
  const r = m.reward || {};
  for (const k of Object.keys(r.items || {})) if (!D.ITEMS[k]) bad.push(w + ': reward item ' + k);
  for (const k of Object.keys(r.rel || {})) if (!D.CAST[k]) bad.push(w + ': reward person ' + k);
  for (const k of Object.keys(r.stats || {})) if (!D.STATS.some(x => x.id === k)) bad.push(w + ': reward stat ' + k);
  if (r.sticker && !STICKER_IDS.has(r.sticker)) bad.push(w + ': reward sticker ' + r.sticker);
  if (r.friend && !D.FRIENDS.includes(r.friend) && r.friend !== 'bouchard') bad.push(w + ': friend ' + r.friend + ' has no perk');
}
for (const k of Object.keys(D.KINDS)) for (const it of D.KINDS[k].sells) if (!D.ITEMS[it]) bad.push('KINDS.' + k + ' sells unknown ' + it);
for (const [id, it] of Object.entries(D.ITEMS)) if (it.type === 'vehicle' && !D.VEHICLES[id]) bad.push('vehicle without speeds: ' + id);
// the wacky update: weapons, monsters, made-up shops, signs, events, street folk
const MESHES = new Set(['baguette', 'chicken', 'pillow', 'noodle', 'fish', 'plunger', 'guitar', 'blower', 'bubble',
  'straw', 'launcher', 'cannon', 'boomer', 'sniper', 'popper', 'grenade', 'potato', 'chickenl', 'gnomezooka']);  // the chaos update's ranged weapons
const PROJ = new Set(['spit', 'balloon', 'confetti', 'boomerang', 'whoopee', 'tshirt', 'chicken', 'mustard', 'potato', 'gnome', 'tomato', 'poop', 'lag']);  // cft-chaos.js projMesh
for (const [id, it] of Object.entries(D.ITEMS)) {
  if (!it.weapon) continue;
  if (it.slot !== 'weapon' || it.type !== 'gear') bad.push(id + ': a weapon must be gear for the weapon slot');
  if (!MESHES.has(it.weapon.mesh)) bad.push(id + ': no 3D shape called ' + it.weapon.mesh);
  if (!(it.weapon.dmg > 0 && it.weapon.reach > 0 && it.weapon.word)) bad.push(id + ': weapon needs dmg, reach, word');
  if (!Object.values(D.KINDS).some(k => k.sells.includes(id))) bad.push(id + ': no shop sells it');
}
// the wardrobe (2026-11-17): every piece of shop gear names a body-part slot, and every slot has something to choose
const WEAR = new Set((D.WEAR_SLOTS || []).map(x => x.id));
for (const [id, it] of Object.entries(D.ITEMS)) if (it.type === 'gear' && !WEAR.has(it.slot)) bad.push(id + ': gear slot ' + it.slot + ' is not in D.WEAR_SLOTS');
for (const sl of WEAR) { if (!Object.values(D.ITEMS).some(it => it.type === 'gear' && it.slot === sl) && !(D.RPG.GEAR[sl] || []).length) bad.push('wardrobe slot ' + sl + ': nothing fits it'); if (!D.RPG.SLOT_NAMES[sl]) bad.push('wardrobe slot ' + sl + ': no name in D.RPG.SLOT_NAMES'); }
for (const sl of Object.keys(D.RPG.GEAR)) if (!WEAR.has(sl)) bad.push('loot gear slot ' + sl + ' has no wardrobe slot');
for (const [id, it] of Object.entries(D.ITEMS)) if (it.type === 'gear' && !Object.values(D.KINDS).some(k => k.sells.includes(id)) && !it.weapon) bad.push(id + ': no shop sells this gear');
if (Object.keys(D.MONSTERS).length < 15) bad.push('fewer than 15 monster types');
for (const [k, m] of Object.entries(D.MONSTERS)) {
  if (!(m.atk > 0)) bad.push('monster ' + k + ': needs atk');
  if (!(D.MONSTER_LOCAL[k] && D.MONSTER_LOCAL[k].length >= 3)) bad.push('monster ' + k + ': needs local names');
  for (const c of D.CITIES) if (!(D.CITY_MONSTERS[c.id] || {})[k]) bad.push('monster ' + k + ': no name in ' + c.n);
}
for (const k of Object.keys(D.GUARDIANS)) if (!D.MONSTERS[k]) bad.push('guardian kind ' + k + ' is not a monster');
for (const slot of ['weapon', 'head', 'body', 'feet']) for (const b of D.RPG.GEAR[slot]) if (slot === 'weapon' ? !(D.ITEMS[b.id] && D.ITEMS[b.id].weapon) : !b.e) bad.push('gear ' + slot + ' ' + b.id + ': bad base');
for (const [k, m] of Object.entries(D.MONSTERS)) { if (!(m.hp > 0 && m.speed > 0 && m.speed < D.WALK.run && m.coins && m.steal)) bad.push('monster ' + k + ': needs hp, speed below your sprint, coins, steal'); }
for (const [k] of D.SHOP_MIX) { if (!D.KINDS[k]) bad.push('SHOP_MIX: unknown kind ' + k); else if (!D.shopName(k, 0.5) || !D.shopName(k, 0.123)) bad.push('SHOP_MIX: no name for ' + k); }
for (const k of Object.keys(D.KINDS)) if (!D.SIGN_COLS[k]) bad.push('no sign colour for ' + k);
for (const [biz, k] of Object.entries(D.RIVALS)) { if (!D.BUSINESSES.some(b => b.id === biz)) bad.push('RIVALS: unknown business ' + biz); if (!D.KINDS[k]) bad.push('RIVALS: unknown kind ' + k); }
for (const k of Object.keys(D.KEEPER_LINES)) if (k !== 'any' && !D.KINDS[k]) bad.push('KEEPER_LINES: unknown kind ' + k);
if (new Set(D.STREETFOLK.map(f => f.id)).size !== D.STREETFOLK.length) bad.push('duplicate street folk ids');
for (const f of D.STREETFOLK) if (!(f.n && f.e && f.hi && f.story && f.story.length >= 2)) bad.push('street folk ' + f.id + ': needs n, e, hi and two stories');
for (const f of D.FORTUNES) if (!['coins', 'goose', 'charm', 'slimes', 'sticker', 'ufo', 'speed', 'peels'].includes(f.do)) bad.push('fortune does unknown ' + f.do);
for (const e of D.EVENTS) if (!['moneyrain', 'flashmob', 'ufo', 'goose', 'slimes', 'crate', 'dogs', 'pigeonzilla'].concat(e.chaos ? ['ohio', 'glitch', 'catsdogs', 'cheese', 'sixseven', 'balloons'] : []).includes(e.id)) bad.push('unknown event ' + e.id);
// the chaos update: ranged weapons and shooters need a projectile cft-chaos.js can draw; flying gear a known mode; every Dex creature an id, name, emoji
for (const [id, it] of Object.entries(D.ITEMS)) { if (it.weapon && it.weapon.ranged === 'proj' && !(PROJ.has(it.weapon.proj) && it.weapon.rate > 0 && it.weapon.speed > 0)) bad.push(id + ': ranged weapon needs a known proj, rate, speed'); if (it.fly && !['jet', 'glide'].includes(it.fly)) bad.push(id + ': unknown fly ' + it.fly); }
for (const [k, m] of Object.entries(D.MONSTERS)) if (m.ranged && !(PROJ.has(m.ranged.proj) && m.ranged.r > 0 && m.ranged.cd && m.ranged.dmg > 0)) bad.push('monster ' + k + ': ranged needs proj, r, cd, dmg');
if (D.CHAOS) { const ids = new Set(); for (const c of D.CHAOS.BRAINROT.concat(D.CHAOS.CRITTERS)) { if (!c.id || !c.n || !c.e || !(c.say && c.say.length)) bad.push('dex creature needs id, n, e, say: ' + c.id); if (ids.has(c.id)) bad.push('dex id twice: ' + c.id); ids.add(c.id); } }
for (const s of D.STICKER_SETS) if (s.items.length !== 6) bad.push('sticker set ' + s.id + ' needs 6 stickers');
// every mission reachable: walk the requirement graph (stats/levels/partner assumed reachable)
const done = new Set();
for (let pass = 0; pass < 200; pass++) {
  let n = 0;
  for (const m of D.MISSIONS) if (!done.has(m.id) && (m.req.m || []).every(r => done.has(r))) { done.add(m.id); n++; }
  if (!n) break;
}
for (const m of D.MISSIONS) if (!done.has(m.id)) bad.push(m.id + ': can never unlock');
console.log(bad.length ? bad.join('\n') + '\n' + bad.length + ' PROBLEM(S)' : 'CONTENT OK (' + D.MISSIONS.length + ' missions)');
process.exit(bad.length ? 1 : 0);
