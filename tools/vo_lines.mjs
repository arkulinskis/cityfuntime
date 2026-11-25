// Every spoken mission line, as the voice should say it. Used by tools/voice_missions.py (Kokoro) - not shipped.
//   node tools/vo_lines.mjs            -> JSON on stdout: {lines: [{key, variant, speaker, raw, say}], caps: [...]}
// The clip key comes from cft-cine.js (CFTCine.speaker / CFTCine.key), the same code the game uses to find a clip,
// so a line's voice is found again as long as its text, speaker and voice context ({place} at the intro) are unchanged.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, '..', 'theme', 'assets');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['cft-content.js', 'cft-cine.js']) vm.runInContext(readFileSync(path.join(assets, f), 'utf8'), ctx, { filename: f });
const D = ctx.CFT_DATA, C = ctx.CFTCine;

// Words in capitals: true acronyms keep a spoken form, everything else is shouting and is said as a normal word
// (Kokoro spells out capitals: "FINE" would come out as "F-I-N-E").
const ACR = { DJ: 'DJ', TV: 'TV', OK: 'okay', XP: 'experience', UFO: 'UFO', ID: 'ID', VIP: 'VIP', ATM: 'cash machine', HQ: 'headquarters',
  MR: 'Mister', SUV: 'SUV', BBQ: 'barbecue', DIY: 'do it yourself', CEO: 'boss', PR: 'publicity', GPS: 'map', AI: 'robot brain', WIFI: 'wifi' };
const NUM = ['midnight', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'noon'];
const hour = h => h === 0 ? 'midnight' : h === 12 ? 'noon' : h < 12 ? NUM[h] + ' in the morning' : h < 18 ? NUM[h - 12] + ' in the afternoon' : NUM[h - 12] + ' at night';
const caps = new Set();

function voiceText(text, place, variant) {
  const bf = variant === 'bf';
  let s = text;
  s = s.replace(/And \{name\}:/g, 'And listen:').replace(/,\s*\{name\}/g, '').replace(/\{name\},\s*/g, '').replace(/\{name\}/g, 'friend');
  s = s.replace(/\{kid\}/g, 'our little one');
  s = s.replace(/\{place\}/g, place || 'the spot');
  s = s.replace(/\{pt\}/g, bf ? 'boyfriend' : 'girlfriend').replace(/\{he\}/g, bf ? 'he' : 'she').replace(/\{He\}/g, bf ? 'He' : 'She')
    .replace(/\{him\}/g, bf ? 'him' : 'her').replace(/\{his\}/g, bf ? 'his' : 'her');
  s = s.replace(/\{biz\}/g, 'the business').replace(/\{home\}/g, 'home').replace(/\{street\}/g, 'this street').replace(/\{\w+\}/g, '');
  s = s.replace(/\b(\d{1,2}):00\b/g, (m, h) => hour(+h));
  s = s.replace(/\*[^*]+\*/g, '').replace(/\s*\(or [^)]*\)/g, '').replace(/\s&\s/g, ' and ');   // *stage directions*, "(or tap 📱)"
  s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu, '');
  s = s.replace(/\bM[Rr]\.\s*/g, 'Mister ');
  s = s.replace(/\b[A-Z][A-Z']*[A-Z]\b/g, w => { caps.add(w); return ACR[w] || w.toLowerCase(); });
  s = s.replace(/\.{3,}|…/g, '... ').replace(/\s+/g, ' ').trim();
  s = s.replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  return s.replace(/\bi\b/g, 'I').replace(/\bi'(m|ll|ve|d)\b/g, "I'$1");
}

const out = [], seen = new Set();
function add(id, raw, place, kind) {
  if (!id || id === 'everyone') return;           // a crowd cheering: no voice
  const sp = C.speaker(raw, id, D, kind);
  if (!sp.id || sp.id === 'everyone') return;
  const key = C.key(sp.id, raw, place);
  for (const variant of C.paired(sp.id, raw) ? ['gf', 'bf'] : [null]) {
    const k = key + (variant || '');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ key, variant, speaker: sp.id === 'sam' && variant === 'bf' ? 'sam_b' : sp.id, raw, say: voiceText(sp.text, place, variant) });
  }
}
for (const m of D.MISSIONS) {
  const pl = C.introPlace(m, D);
  for (const l of m.intro || []) add(m.giver, l, pl);
  for (const l of m.outro || []) add(m.giver, l, '');
  for (const s of m.steps) for (const l of s.say || []) add(m.giver, l, '', 'say');
}
for (const ch of D.CHAPTERS) {
  const raw = C.chapterRaw(ch);
  out.push({ key: C.key('narrator', raw, ''), variant: null, speaker: 'narrator', raw, say: voiceText(C.chapterSay(ch), '', null) });
}
// the announcer (C.SHOUT): every good-news banner said out loud, then a cheer
for (const raw of C.SHOUT.lines(D)) out.push({ key: C.key('announcer', raw, ''), variant: null, speaker: 'announcer', raw, say: voiceText(raw, '', null) });
process.stdout.write(JSON.stringify({ lines: out, caps: [...caps].sort() }));
