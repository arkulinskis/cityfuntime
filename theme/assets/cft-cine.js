/* City Fun Time: voiced cinematic missions (2026-11-20). The user: "city-fun-time needs to have cinematic voiced over
   sections for the missions. That would give the missions more gravitas. Using my local text to speech voice all
   missions, and put the sounds in cloudflare. Animate the mission giving too in a way you choose."
   - EVERY MISSION LINE IS VOICED: the intro (when you take a mission), the lines said during it (step `say` with a
     speaker) and the outro. Each cast member has their own Kokoro voice (tools/voice_missions.py renders them on this
     PC; the MP3s live on Cloudflare R2 behind the arkvital-media Worker, under vo/cft/). The clip list is cft-vo.js
     (window.CFT_VO): key -> [file, seconds, mouth envelope], or {gf, bf} for lines that change with who you date.
   - A SCENE: letterbox bars slide in, the HUD fades out, the music dips, and the camera cuts between shots of the
     speaker and you (establishing two-shot, close-up, over your shoulder, low hero angle), drifting slowly during
     each line. The speaker turns to you, gestures and their mouth moves with the voice (W.mouth, pose 'talk'); you
     turn to face them. Subtitles come in word by word with the voice. Intros open with a title card (chapter + mission
     title), outros close with a MISSION COMPLETE stamp, and the first mission of each chapter opens with a narrator
     card over a crane shot. A speaker who isn't nearby calls you instead (phone card, you hold the phone to your ear).
   - CONTROLS: click / tap / Space / Enter / E = next line, Esc or the Skip button = skip the scene. Settings: "Voiced
     missions" (settings.voice) and "Cinematic scenes" (settings.cine; off = the old dialogue box, with the voice).
   - The givers also celebrate when you accept a mission (actor userData.cheerT -> pose 'cheer' in cft-game updateActors).

   CFTCine.speaker / key / paired / introPlace / chapterRaw / chapterSay are pure and also run at build time
   (tools/vo_lines.mjs), so the game and the voice script agree on which clip a line has.
   const Cn = CFTCine.attach(G)   by cft-game.js after G.stunt (G.cine = Cn).
   Cn.play({who, raw, ctx, vplace, kind: 'intro'|'outro'|'say', m, actor}) -> Promise (true)   Cn.playing   Cn.clip(id, raw, place)
   Cn.skip() (tests)   Cn.destroy()
   World hooks (cft-world.js): W.cine {pos, look, fov, face, pose} overrides the camera; W.mouth(fig, 0..1); poses talk,
   cheer, phone. State: save.cine {ch: {chapterId: 1}} (narrator cards seen). Tests: tools/live/cinetest.js (--cine). */
(function () {
'use strict';

const C = {};
// FNV-1a over UTF-16 code units, base 36: short and the same in every browser and in node
C.fnv = function (s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
// who says a raw content line ("Rosa: ..." = Rosa, "{kid}: ..." = your kid, otherwise the mission's giver); mirrors cft-ui speakerOf
// kind 'say' (a line during a mission step) without a name in front = the narrator ("The cashier hands you a bag")
C.speaker = function (raw, who, D, kind) {
  const m = /^([^:]{2,24}):\s(.*)$/s.exec(String(raw || ''));
  if (m) {
    const name = m[1].trim().replace(/\s*\([^)]*\)$/, '');   // "Sam (in a text)" = Sam
    if (name === '{kid}') return { id: 'kid', text: m[2] };
    if (name === 'Everyone') return { id: 'everyone', text: m[2] };
    const id = Object.keys(D.CAST).find(k => D.CAST[k].n === name || D.CAST[k].n.split(' ').pop() === name || D.CAST[k].n.split(' ')[0] === name || k === name.toLowerCase());
    if (id) return { id, text: m[2] };
  }
  return { id: kind === 'say' ? 'narrator' : who || null, text: String(raw || '') };
};
C.key = (id, raw, place) => 'k' + C.fnv((id || '') + '|' + raw + '|' + (place || ''));
// lines recorded twice: Sam (a woman or a man, by who you date) and anything with {pt} / {he} / {him} / {his}
C.paired = (id, raw) => id === 'sam' || /\{(pt|he|He|him|his)\}/.test(raw);
// what {place} says at a mission's intro (cft-game talkTo builds the same words)
C.introPlace = function (m, D) {
  const place = m.steps[0] && (m.steps[0].at || m.steps[0].to);
  return place && D.KINDS[place] ? 'a ' + D.KINDS[place].n.toLowerCase() + ' nearby' : 'a spot nearby';
};
const ORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
C.chapterRaw = ch => 'Chapter ' + ch.id + ': ' + ch.n + '. ' + ch.blurb;
C.chapterSay = ch => (ch.id === 10 ? 'And around the block... ' : 'Chapter ' + ORD[ch.id] + '. ' + ch.n + '. ') + ch.blurb;
C.NUM = ORD;

// ------------------------------------------------------------------ the announcer (2026-11-24)
// The user: "every time you get an achievement, or do something, a voice should announce what you did and that you are
// amazing or great. Link it to the notifications that show up when you liberate a store and discover something."
// Every good-news banner (U.banner) gets a voice: first WHAT you did ("Achievement unlocked: Local!", "Mission complete:
// Bread Run!", "Store liberated!"), then a cheer ("You're amazing!"). Lines are pre-voiced with Kokoro like the missions
// (speaker 'announcer', tools/voice_missions.py), so these must stay pure: tools/vo_lines.mjs lists them at build time.
// SHOUT.ev: id -> [what the announcer says, priority]. SHOUT.match turns a banner into an event id (or null = silent).
C.SHOUT = {
  ev: {
    liberated: ['Store liberated! The people are free!', 3], metro: ['Metro station freed!', 3], secret: ['Secret found!', 3],
    dex: ['New discovery for the Dex!', 2], level: ['Level up!', 3], colour: ['The colour is coming back!', 3],
    block: ['Block restored! Full colour!', 3], friend: ['You made a new friend!', 2], crush: ['Somebody has a crush on you!', 2],
    date: ['What a lovely date!', 2], set: ['Sticker set complete!', 3], feat: ['New feat unlocked!', 2],
    borough: ['New borough discovered!', 2], discover: ['New block discovered!', 2], mega: ['Mega figment defeated!', 3],
    boss: ['King Blob is defeated!', 3], rare: ['Rare monster down!', 2], turf: ['This block is yours now!', 3],
    home: ['Welcome to your new home!', 2], biz: ['Grand opening! Your business is open!', 3], crown: ['All hail the new royalty of the streets!', 3],
    shooter: ['New shooter unlocked!', 2], star: ['You were the star of the show!', 2], loot: ['Epic loot!', 2],
    monsters: ['Monster hunter!', 2], rep: ['Your reputation is growing!', 2], ride: ['New ride! Time to cruise!', 2],
    pet: ['A new best friend!', 2], tuned: ['Tuned in! The whole neighbourhood is on your map!', 2], ufo: ['Close encounter!', 1],
    crate: ['Look what was in the crate!', 1], generic: ['Nice work!', 1],
  },
  praise: ["You're amazing!", "You're incredible!", 'Absolute legend!', 'The city loves you!', "You're on fire!", 'Unstoppable!',
    "Who's awesome? You're awesome!", 'Brilliant work!', 'Superstar!', 'You make this city shine!', 'Look at you go!',
    'Hero of the block!', 'Outstanding!', 'Pure greatness!', "You're the best!", 'What a champion!'],
};
C.SHOUT.achRaw = n => 'Achievement unlocked: ' + n + '!';
C.SHOUT.missionRaw = t => 'Mission complete: ' + t + '!';
// banner (title, kind) -> {id, raw, pri} or null. Bad news (fail), plain notices (day) and borough greetings stay silent.
C.SHOUT.match = function (title, kind, D) {
  const t = String(title || ''), k = String(kind || ''), bare = t.replace(/^\S+\s+/, '');
  const ev = id => ({ id, raw: C.SHOUT.ev[id][0], pri: C.SHOUT.ev[id][1] });
  if (k === 'fail' || k === 'day' && !/^🗺️ Discovered/.test(t)) return null;
  if (k === 'ach') { const a = D && D.RPG && D.RPG.ACH.find(x => x.n === bare); return a ? { id: 'ach', raw: C.SHOUT.achRaw(a.n), pri: 4 } : ev('generic'); }
  if (/^🏆 /.test(t) && D) { const m = D.MISSIONS.find(x => x.title === bare); if (m) return { id: 'mission', raw: C.SHOUT.missionRaw(m.title), pri: 4 }; }
  if (/^🚇 .* is free!$/.test(t)) return ev('metro');
  if (/ is free!$/.test(t)) return ev('liberated');
  if (/^🔍 Secret/.test(t)) return ev('secret');
  if (/New in the Dex/.test(t)) return ev('dex');
  if (/^Level \d+!$/.test(t)) return ev('level');
  if (/BLOCK RESTORED/.test(t)) return ev('block');
  if (/in full colour!$/.test(t)) return ev('colour');
  if (/New friend!/.test(t)) return ev('friend');
  if (/likes you!$/.test(t)) return ev('crush');
  if (/lovely date/.test(t)) return ev('date');
  if (/Set complete!/.test(t)) return ev('set');
  if (/^\S+ Feat: /.test(t)) return ev('feat');
  if (/New borough:/.test(t)) return ev('borough');
  if (/^🗺️ Discovered/.test(t)) return ev('discover');
  if (/MEGA DOWN/.test(t)) return ev('mega');
  if (/King Blob is no more/.test(t)) return ev('boss');
  if (/^💀 .* is down!$/.test(t)) return ev('rare');
  if (/ is yours!$/.test(t)) return ev('turf');
  if (/Home sweet home/.test(t)) return ev('home');
  if (/Grand opening/.test(t)) return ev('biz');
  if (/ of the Streets!$/.test(t)) return ev('crown');
  if (/New shooter/.test(t)) return ev('shooter');
  if (/You were the star/.test(t)) return ev('star');
  if (/New best friend/.test(t)) return ev('pet');
  if (/Tuned in/.test(t)) return ev('tuned');
  if (/Close encounter/.test(t)) return ev('ufo');
  if (/It was in the crate|was in the crate/.test(t)) return ev('crate');
  if (/^loot/.test(k)) { const q = +(/q(\d)/.exec(k) || [0, 0])[1]; return q >= 3 ? ev('loot') : null; }
  if (k === 'boro') return null;                       // "Welcome to <borough>" (the new-borough banner matched above)
  if (k === 'level' && /monsters bonked/.test(t + '')) return ev('monsters');
  if (k === 'friend' && /: /.test(t)) return ev('rep');
  if (k === 'done' && /!$/.test(t) && /Press V|ride/i.test(t)) return ev('ride');
  return k === 'done' || k === 'level' || k === 'friend' ? ev('generic') : null;
};
// every line the announcer can say (for tools/vo_lines.mjs)
C.SHOUT.lines = function (D) {
  const out = Object.keys(C.SHOUT.ev).map(id => C.SHOUT.ev[id][0]).concat(C.SHOUT.praise);
  for (const a of D.RPG.ACH) out.push(C.SHOUT.achRaw(a.n));
  for (const m of D.MISSIONS) out.push(C.SHOUT.missionRaw(m.title));
  return [...new Set(out)];
};

C.attach = function (G) {
  const D = G.D, W = G.W, U = G.ui, THREE = W.THREE;
  const Cn = { playing: false };
  const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let scene = null, alive = true;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const testing = () => !!window.CFT_TEST;
  const enabled = () => G.save.settings.cine !== false && (!testing() || !!window.CFT_TEST.cine);
  const voiceOn = () => G.save.settings.voice !== false && !(testing() && window.CFT_TEST.mute !== false);
  // the media Worker's root (ArkMusic.base is its music/ folder): clips are <root>vo/cft/<file>.mp3
  const base = () => window.CFT_VO_BASE || ((window.ArkMusic && window.ArkMusic.base) || 'https://arkvital-media.addanapp.workers.dev/').replace(/music\/?$/, '');
  function st() {
    const s = G.save;
    if (!s.cine || typeof s.cine !== 'object') s.cine = {};
    if (!s.cine.ch || typeof s.cine.ch !== 'object') s.cine.ch = {};
    return s.cine;
  }
  st();

  Cn.clip = function (id, raw, place) {
    const V = window.CFT_VO;
    if (!V || !V.clips) return null;
    let c = V.clips[C.key(id, raw, place)];
    if (c && !Array.isArray(c)) c = c[G.save.pref === 'bf' ? 'bf' : 'gf'] || c.gf;
    return c ? { url: base() + (V.dir || 'vo/cft/') + c[0] + '.mp3', dur: c[1], env: c[2] || '' } : null;
  };

  // ------------------------------------------------------------------ little sounds (Web Audio, no files)
  let actx = null;
  function sfx(kind) {
    if (!G.save.settings.sound || testing()) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime, out = actx.createGain();
      out.connect(actx.destination);
      if (kind === 'whoosh' || kind === 'swish') { // filtered noise sweeping up
        const len = kind === 'whoosh' ? 0.7 : 0.35, buf = actx.createBuffer(1, actx.sampleRate * len, actx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / d.length);
        const src = actx.createBufferSource(), bp = actx.createBiquadFilter();
        src.buffer = buf; bp.type = 'bandpass'; bp.Q.value = 1.4;
        bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(kind === 'whoosh' ? 2600 : 4200, t + len);
        out.gain.value = kind === 'whoosh' ? 0.22 : 0.12;
        src.connect(bp); bp.connect(out); src.start(t);
      } else if (kind === 'boom') { // a low hit under a title card
        const o = actx.createOscillator();
        o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.9);
        out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.5, t + 0.02); out.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
        o.connect(out); o.start(t); o.stop(t + 1.3);
      } else if (kind === 'stamp') { // MISSION COMPLETE: a thump and a bright chord
        const o = actx.createOscillator();
        o.type = 'triangle'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.3);
        out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.45, t + 0.01); out.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.connect(out); o.start(t); o.stop(t + 0.6);
        [523, 659, 784, 1046].forEach((f, i) => {
          const oo = actx.createOscillator(), g = actx.createGain();
          oo.type = 'triangle'; oo.frequency.value = f;
          g.gain.setValueAtTime(0.0001, t + 0.05 + i * 0.03); g.gain.exponentialRampToValueAtTime(0.07, t + 0.08 + i * 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
          oo.connect(g); g.connect(actx.destination); oo.start(t + 0.05 + i * 0.03); oo.stop(t + 1.2);
        });
      } else if (kind === 'ring') { // a phone ringing twice
        [0, 0.42].forEach(dl => [[1318, 0], [1046, 0.09]].forEach(([f, d2]) => {
          for (let k = 0; k < 2; k++) {
            const o = actx.createOscillator(), g = actx.createGain(), s0 = t + dl + d2 + k * 0.18;
            o.type = 'sine'; o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, s0); g.gain.exponentialRampToValueAtTime(0.06, s0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, s0 + 0.08);
            o.connect(g); g.connect(actx.destination); o.start(s0); o.stop(s0 + 0.1);
          }
        }));
      }
    } catch (e) { /* no audio */ }
  }

  // ------------------------------------------------------------------ geometry
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  function headOf(fig) {
    const v = V3(0, 0, 0), h = fig.userData && fig.userData.head;
    if (h) { h.getWorldPosition(v); v.y += 0.12 * (fig.scale.y || 1); } else { fig.getWorldPosition(v); v.y += 1.5; }
    return v;
  }
  function playerHead() { const p = W.player.pos; return V3(p.x, p.y + 1.62, p.z); }
  const flat = v => { v.y = 0; const l = Math.hypot(v.x, v.z) || 1; v.x /= l; v.z /= l; return v; };
  const faceYaw = (from, to) => Math.atan2(to.x - from.x, to.z - from.z) + Math.PI;   // a figure faces along its -z
  // pull the camera in front of a wall that stands between it and what it looks at
  function fit(look, cam) {
    if (!W.rayCast) return { p: cam, hit: false };
    const d = cam.clone().sub(look), len = d.length();
    if (len < 0.3) return { p: cam, hit: false };
    d.divideScalar(len);
    const h = W.rayCast(look.x, look.y, look.z, d.x, d.y, d.z, len, 0.3);
    if (!h) return { p: cam, hit: false };
    return { p: look.clone().addScaledVector(d, Math.max(0.6, h.d - 0.35)), hit: true };
  }
  function groundY(v) { const g = W.surfaceAt ? W.surfaceAt(v.x, v.z) : W.groundAt(v.x, v.z); if (v.y < g + 0.3) v.y = g + 0.3; return v; }

  // A shot = camera from a -> b and look-at from la -> lb over the line, fov fa -> fb.
  function makeShot(kind, S, P, side) {
    const sp = S.fig ? headOf(S.fig) : null, ph = playerHead(), up = y => V3(0, y, 0);
    const toS = sp ? flat(sp.clone().sub(ph)) : flat(V3(Math.sin(W.player.face || 0), 0, Math.cos(W.player.face || 0)));
    const right = V3(-toS.z, 0, toS.x).multiplyScalar(side);   // the side of the line we stay on (the 180-degree rule)
    let s;
    if (kind === 'two' && sp) {
      const M = sp.clone().lerp(ph, 0.5); M.y -= 0.15;
      s = { a: M.clone().addScaledVector(right, 4.8).add(up(1.1)).addScaledVector(toS, -0.8), b: M.clone().addScaledVector(right, 3.7).add(up(0.55)).addScaledVector(toS, -0.4), la: M, lb: M.clone(), fa: 50, fb: 44 };
    } else if (kind === 'close' && sp) {   // the speaker, from just past your shoulder
      const F = toS.clone().negate();
      s = { a: sp.clone().addScaledVector(F, 1.55).addScaledVector(right, 0.5).add(up(-0.05)), b: sp.clone().addScaledVector(F, 1.2).addScaledVector(right, 0.38).add(up(-0.02)), la: sp.clone().add(up(-0.06)), lb: sp.clone().add(up(-0.04)), fa: 36, fb: 32 };
    } else if (kind === 'ots' && sp) {     // over your shoulder at the speaker
      s = { a: ph.clone().addScaledVector(toS, -0.95).addScaledVector(right, 0.55).add(up(0.14)), b: ph.clone().addScaledVector(toS, -0.8).addScaledVector(right, 0.42).add(up(0.1)), la: sp.clone().add(up(-0.1)), lb: sp.clone().add(up(-0.08)), fa: 44, fb: 41 };
    } else if (kind === 'low' && sp) {     // a low hero angle on both of you
      const M = sp.clone().lerp(ph, 0.5), F = toS.clone().negate();
      const a = sp.clone().addScaledVector(F, 2.6).addScaledVector(right, 1.6); a.y = M.y - 1.25;
      const b = sp.clone().addScaledVector(F, 2.2).addScaledVector(right, 1.1); b.y = M.y - 1.15;
      s = { a, b, la: M.clone().add(up(0.15)), lb: M.clone().add(up(0.25)), fa: 54, fb: 50 };
    } else if (kind === 'crane') {         // the chapter card: high above you, rising and turning
      const yaw = (W.player.face || 0) + 0.6 * side;
      s = { a: ph.clone().add(V3(Math.sin(yaw) * 11, 5.5, Math.cos(yaw) * 11)), b: ph.clone().add(V3(Math.sin(yaw + 0.5 * side) * 13, 11, Math.cos(yaw + 0.5 * side) * 13)), la: ph.clone().add(up(-0.6)), lb: ph.clone().add(up(-1)), fa: 55, fb: 50, wide: true };
    } else {                               // 'hero': you, from the front (phone calls, or nobody to look at)
      const F = sp ? toS : flat(V3(-Math.sin(W.player.face || 0), 0, -Math.cos(W.player.face || 0)));
      const r2 = V3(-F.z, 0, F.x).multiplyScalar(side);
      s = { a: ph.clone().addScaledVector(F, 2.1).addScaledVector(r2, 0.9).add(up(-0.05)), b: ph.clone().addScaledVector(F, 1.6).addScaledVector(r2, 0.6).add(up(0)), la: ph.clone().add(up(-0.1)), lb: ph.clone().add(up(-0.06)), fa: 40, fb: 36 };
    }
    s.kind = kind;
    // a tall phone screen sees less from side to side: wide shots step back so both people stay in the frame
    const aspect = (W.renderer && W.renderer.domElement.clientWidth / Math.max(1, W.renderer.domElement.clientHeight)) || (innerWidth / innerHeight);
    if ((kind === 'two' || kind === 'low') && aspect < 1.25) {
      const k = Math.min(2.4, 1.25 / Math.max(0.4, aspect));
      s.a = s.la.clone().add(s.a.clone().sub(s.la).multiplyScalar(k));
      s.b = s.lb.clone().add(s.b.clone().sub(s.lb).multiplyScalar(k));
    }
    for (const k of ['a', 'b']) { const f = fit(k === 'a' ? s.la : s.lb, s[k]); s[k] = groundY(f.p); s.blocked = s.blocked || f.hit; }
    return s;
  }
  // pick the side with a clear view of the speaker (tried once per scene)
  function pickSide(S) {
    if (!S.fig) return 1;
    for (const side of [1, -1]) { const s = makeShot('close', S, null, side); if (!s.blocked) return side; }
    return 1;
  }

  // ------------------------------------------------------------------ the overlay
  function castInfo(id) {
    if (id === 'kid') { const k = G.save.kids && G.save.kids[0]; return { n: k ? k.name : 'Kid', e: '🧒' }; }
    if (id === 'narrator') return { n: '', e: '🎬' };
    const c = D.CAST[id];
    return c ? { n: c.n, e: c.e } : { n: '', e: '💬' };
  }
  function buildOverlay() {
    const ov = U.overlay(
      '<div class="cft-cine" data-cine-root>' +
        '<div class="cft-cine-bar top"><button type="button" class="cft-cine-skip" data-cskip aria-label="Skip the scene">Skip <kbd>Esc</kbd></button></div>' +
        '<div class="cft-cine-card" data-ccard hidden></div>' +
        '<div class="cft-cine-call" data-ccall hidden><div class="cft-cine-ring"><i></i><i></i><i></i><b data-ccface></b></div><div><small>📞 On the phone</small><strong data-ccname></strong></div></div>' +
        '<div class="cft-cine-bar bot"><div class="cft-cine-sub" data-csub aria-live="polite"><b class="cft-cine-who" data-cwho></b><p data-ctext></p></div><span class="cft-cine-next" data-cnext aria-hidden="true">▶</span></div>' +
      '</div>', 'cft-cine-wrap');
    return ov;
  }

  // ------------------------------------------------------------------ playing a scene
  // o: {who, raw: [content lines], ctx (G.text tokens), vplace (the voice's {place}), kind, m, actor (the giver's figure)}
  Cn.play = async function (o) {
    const lines = (o.raw || []).filter(Boolean);
    if (!lines.length && !o.chapter) return true;
    if (scene && enabled()) { const old = scene; Cn.skip(); await old.ended; }   // one scene at a time: the old one wraps up first
    if (!enabled() || scene || !W || !alive) {
      // the old dialogue box (tests, "Cinematic scenes" off), still voiced when there is a clip
      const vo = !testing() && voiceOn() ? new VoiceQueue(lines.map(raw => { const sp = C.speaker(raw, o.who, D, o.kind); return Cn.clip(sp.id, raw, o.vplace); })) : null;
      return U.dialog({ who: o.who, lines: lines.map(l => G.text(l, o.ctx)), onLine: vo ? i => vo.play(i) : null, onClose: vo ? () => vo.stop() : null });
    }
    const sc = scene = { o, lines, i: -1, skipAll: false, next: null, t: 0, side: 1, figs: new Set(), done: false };
    sc.ended = new Promise(r => { sc.endRes = r; });
    Cn.playing = true;
    const ov = sc.ov = buildOverlay(), el = ov.el;
    const $ = s => el.querySelector(s);
    const root = $('[data-cine-root]'), card = $('[data-ccard]'), call = $('[data-ccall]'), sub = $('[data-csub]'), who = $('[data-cwho]'), tx = $('[data-ctext]');
    U.cineMode(true);
    if (window.ArkMusic) window.ArkMusic.duck(0.32);
    sfx('whoosh');
    setTimeout(() => root.classList.add('in'), 20);
    // the people in the scene
    const main = { id: o.who, fig: o.actor || (G.actorOf ? G.actorOf(o.who) : null) };
    if (main.fig && Math.hypot(main.fig.position.x - W.player.pos.x, main.fig.position.z - W.player.pos.z) > 28) main.fig = null;
    // face to face: you step to a set spot 1.6 m in front of them (2026-11-24, the user: the main character stood
    // "weirdly placed", wherever E was pressed: beside them, too close or metres away)
    if (main.fig && W.stageBefore && Math.hypot(main.fig.position.x - W.player.pos.x, main.fig.position.z - W.player.pos.z) < 12) W.stageBefore(main.fig, 1.6);
    sc.side = REDUCED ? 1 : pickSide(main);
    const figOf = id => (id === o.who ? main.fig : (G.actorOf ? G.actorOf(id, 28) : null));
    // input: next line / skip all
    const next = () => { if (sc.next) sc.next(); };
    const skipAll = () => { sc.skipAll = true; next(); };
    el.addEventListener('click', e => { if (e.target.closest('[data-cskip]')) { skipAll(); return; } next(); });
    const key = e => {
      if (!U.isTop(ov)) return;
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); skipAll(); return; }
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { e.preventDefault(); e.stopPropagation(); next(); }
    };
    document.addEventListener('keydown', key, true);
    // the camera + animation loop
    let shot = null, shotT = 0, shotDur = 3, speaker = null, envFn = () => 0, last = performance.now(), raf = 0, pose = null;
    // every frame (requestAnimationFrame; a timer stands in when frames stall, e.g. a hidden or headless tab)
    const loop = now => { if (sc.done) return; raf = requestAnimationFrame(loop); frame(now); };
    const watchdog = setInterval(() => { if (!sc.done && performance.now() - last > 90) frame(performance.now()); }, 50);
    const frame = now => {
      if (sc.done) return;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; sc.t += dt;
      shotT += dt;
      if (shot) {
        const k = REDUCED ? 0 : Math.min(1, shotT / shotDur), e = k * k * (3 - 2 * k);
        const pos = shot.a.clone().lerp(shot.b, e), look = shot.la.clone().lerp(shot.lb, e);
        const tgt = speaker && speaker.fig ? speaker.fig.position : main.fig ? main.fig.position : null;
        // you face whoever talks; on a call (no one here) you turn towards the camera, a little past it
        const face = tgt && pose !== 'phone' ? faceYaw(W.player.pos, tgt) : shot.kind === 'hero' ? faceYaw(W.player.pos, shot.b) + 0.35 * sc.side : null;
        W.cine = { pos, look, fov: shot.fa + (shot.fb - shot.fa) * e, face, pose };
      }
      const env = envFn();
      for (const f of sc.figs) {
        const talking = speaker && f === speaker.fig;
        f.userData.talk = talking ? env : 0;
        W.animate(f, 0, dt, f.userData.cheerT > 0 ? 'cheer' : 'talk');
        if (f.userData.cheerT > 0) f.userData.cheerT -= dt;
        if (W.mouth) W.mouth(f, talking ? env : 0);
      }
      if (sc.callOn) {   // the caller's portrait talks: it bobs with the voice and the rings swell
        call.style.setProperty('--ring', (1 + env * 0.5).toFixed(2));
        call.querySelector('b').style.transform = 'scale(' + (1 + env * 0.12).toFixed(3) + ') rotate(' + (Math.sin(sc.t * 9) * env * 6).toFixed(1) + 'deg)';
      }
      if (sc.words) {
        const n = Math.ceil(sc.words.length * Math.min(1, (sc.lineT() + 0.15) / Math.max(0.6, sc.lineDur * 0.9)));
        for (let i = sc.shown; i < n; i++) sc.words[i].classList.add('on');
        sc.shown = Math.max(sc.shown, n);
      }
    };
    const addFig = f => { if (f && !sc.figs.has(f)) { sc.figs.add(f); f.userData.cine = true; } };
    if (main.fig) addFig(main.fig);
    raf = requestAnimationFrame(loop);
    const setShot = (kind, S, dur) => { shot = makeShot(kind, S, null, sc.side); shotT = 0; shotDur = dur; };
    // wait for a line's time to pass (or a click); resolves 'next' | 'skip'
    const hold = () => testing() && window.CFT_TEST.cineHold;   // screenshots: nothing moves on until a click
    const wait = ms => new Promise(res => { let tm = 0; const done = v => { clearTimeout(tm); sc.next = null; res(v); }; sc.next = () => done('next'); if (!hold()) tm = setTimeout(() => done('time'), ms); });
    const vq = new VoiceQueue([]);
    try {
      // ---- the narrator's chapter card (first mission of a chapter)
      if (o.chapter && !sc.skipAll) {
        const ch = o.chapter, raw = C.chapterRaw(ch), clip = Cn.clip('narrator', raw, '');
        card.hidden = false;
        card.className = 'cft-cine-card chapter';
        card.innerHTML = '<small>' + (ch.id === 10 ? 'Side stories' : 'Chapter ' + C.NUM[ch.id]) + '</small><strong><span>' + esc(ch.e) + '</span> ' + esc(ch.n) + '</strong><p>' + esc(ch.blurb) + '</p>';
        setTimeout(() => card.classList.add('in'), 20);
        sfx('boom');
        speaker = null; pose = null;
        const dur = (clip ? clip.dur : 4.2) + 0.9;
        setShot('crane', main, dur + 1);
        sub.hidden = true;
        const h = voiceOn() ? vq.playClip(clip) : null;
        envFn = () => 0;
        await wait(dur * 1000);
        vq.stop();
        card.classList.remove('in');
        await sleep(REDUCED ? 0 : 260);
        card.hidden = true;
        void h;
      }
      // ---- the intro's title card
      if (o.kind === 'intro' && o.m && !sc.skipAll) {
        const ch = D.CHAPTERS.find(c => c.id === o.m.ch);
        const ci = castInfo(o.who);
        card.hidden = false;
        card.className = 'cft-cine-card title';
        card.innerHTML = '<small>' + esc(ch ? (ch.id === 10 ? 'Around the Block' : 'Chapter ' + ch.id + ' · ' + ch.n) : 'Mission') + '</small><strong>' + esc(o.m.title) + '</strong><em>' + esc(ci.e + ' with ' + ci.n) + '</em>';
        setTimeout(() => card.classList.add('in'), 20);
        sfx('boom');
        setShot(main.fig ? 'two' : 'hero', main, 3.2);
        pose = main.fig ? null : 'phone';
        sub.hidden = true;
        if (await wait(1900) === 'next') { /* clicked: straight to the lines */ }
        card.classList.remove('in');
      }
      // ---- the lines
      const kinds = o.kind === 'outro' ? ['low', 'close', 'ots', 'close', 'two'] : o.kind === 'say' ? ['close', 'ots', 'close', 'low'] : ['close', 'ots', 'close', 'low', 'ots', 'two'];
      let firstLine = true;
      for (let i = 0; i < lines.length && !sc.skipAll; i++) {
        const raw = lines[i], sp = C.speaker(raw, o.who, D, o.kind), ci = castInfo(sp.id);
        const fig = sp.id ? figOf(sp.id) : null;
        if (fig) addFig(fig);
        speaker = { id: sp.id, fig };
        const clip = sp.id && sp.id !== 'everyone' ? Cn.clip(sp.id, raw, o.vplace) : null;
        const text = G.text(sp.text, o.ctx);
        const dur = clip && voiceOn() ? clip.dur : Math.max(2.2, text.length * 0.058);
        // the shot
        if (fig) { setShot(o.kind === 'intro' && firstLine && !o.m ? 'two' : kinds[i % kinds.length], speaker, dur + 0.6); pose = null; sc.callOn = false; call.hidden = true; }
        else if (sp.id && sp.id !== 'everyone' && sp.id !== 'narrator') { // nobody here to look at: a phone call
          if (!sc.callOn) { sfx('ring'); call.hidden = false; setTimeout(() => call.classList.add('in'), 20); }
          sc.callOn = true; pose = 'phone';
          $('[data-ccface]').textContent = ci.e; $('[data-ccname]').textContent = ci.n;
          setShot('hero', { fig: null }, dur + 0.6);
        } else { setShot(main.fig ? 'two' : 'hero', main, dur + 0.6); }
        firstLine = false;
        // subtitles, word by word
        sub.hidden = false;
        who.textContent = ci.n ? ci.e + ' ' + ci.n : '';
        who.hidden = !ci.n;
        who.style.setProperty('--who', colorOf(sp.id));
        tx.innerHTML = text.split(/(\s+)/).map(w => /^\s+$/.test(w) ? w : '<span>' + esc(w) + '</span>').join('');
        sc.words = [...tx.querySelectorAll('span')]; sc.shown = 0;
        sub.classList.remove('pop'); void sub.offsetWidth; sub.classList.add('pop');
        // the voice (or the clock when there's none)
        const t0 = performance.now();
        sc.lineDur = dur;
        sc.lineT = () => (performance.now() - t0) / 1000;
        const h = voiceOn() && clip ? vq.playClip(clip) : null;
        envFn = () => {
          if (h && h.ok()) return h.env();
          const t = sc.lineT();
          return t < dur - 0.2 ? Math.max(0, Math.sin(t * 13) * 0.5 + Math.sin(t * 7.3) * 0.35) : 0;   // no audio: a plausible flap
        };
        const end = await new Promise(res => {
          let tm = 0, settled = false;
          const fin = v => { if (settled) return; settled = true; clearTimeout(tm); sc.next = null; res(v); };
          sc.next = () => { if (sc.words && sc.shown < sc.words.length && !sc.skipAll) { sc.words.forEach(w => w.classList.add('on')); sc.shown = sc.words.length; if (!h || !h.ok()) { fin('next'); return; } } fin('next'); };
          const check = () => { if (settled) return; if (hold()) { tm = setTimeout(check, 200); return; } const t = sc.lineT(); if ((h && h.ok()) ? h.ended() || t > dur + 4 : t > dur + 0.25) { tm = setTimeout(() => fin('time'), 380); return; } tm = setTimeout(check, 60); };
          check();
        });
        void end;
        vq.stop();
        speaker = { id: sp.id, fig };
      }
      envFn = () => 0;
      // ---- the outro's stamp
      if (o.kind === 'outro' && o.m && !sc.skipAll) {
        sub.hidden = true; call.hidden = true; sc.callOn = false; pose = null;
        card.hidden = false;
        card.className = 'cft-cine-card stamp';
        card.innerHTML = '<strong>Mission complete</strong><small>' + esc(o.m.title) + '</small>';
        setTimeout(() => card.classList.add('in'), 20);
        sfx('stamp');
        if (main.fig) main.fig.userData.cheerT = 1.6;
        setShot(main.fig ? 'low' : 'hero', main, 2.2);
        await wait(1700);
      }
    } finally {
      vq.stop();
      sc.done = true;
      cancelAnimationFrame(raf);
      clearInterval(watchdog);
      document.removeEventListener('keydown', key, true);
      for (const f of sc.figs) { f.userData.cine = false; f.userData.talk = 0; if (W.mouth) W.mouth(f, 0); }
      root.classList.remove('in');
      root.classList.add('out');
      if (window.ArkMusic) window.ArkMusic.duck(1);
      await sleep(REDUCED || testing() ? 0 : 280);
      W.cine = null;
      U.cineMode(false);
      ov.close();
      scene = null;
      Cn.playing = false;
      sc.endRes();
      if (G.dirty) G.dirty();
    }
    return true;
  };
  Cn.skip = () => { if (scene) { scene.skipAll = true; if (scene.next) scene.next(); } };
  // the first mission of a chapter opens with the narrator (once per save)
  Cn.chapterFor = function (m) {
    if (!m || !enabled()) return null;
    const ch = D.CHAPTERS.find(c => c.id === m.ch), s = st();
    if (!ch || s.ch[ch.id]) return null;
    s.ch[ch.id] = 1;
    return ch;
  };
  Cn.destroy = () => { alive = false; Cn.skip(); shoutVq.stop(); clearTimeout(shoutT); if (U.banner === shoutBanner) U.banner = rawBanner; };

  // ---- the announcer: every good-news banner is said out loud, then a cheer (C.SHOUT above)
  // One at a time; while a mission scene talks it waits; a backlog keeps only the two most important (and none older than 12 s).
  // Cn.shoutLog = what it said (tests read it, also when voices are muted). settings.announcer false = silent.
  const shoutVq = new VoiceQueue([]), shoutQ = [];
  let shoutBusy = false, shoutT = 0, lastPraise = -1;
  Cn.shoutLog = [];
  const shoutOn = () => G.save.settings.announcer !== false;
  Cn.shout = function (title, kind) {
    if (!alive || !shoutOn()) return null;
    const e = C.SHOUT.match(title, kind, D);
    if (!e) return null;
    let p;
    do { p = Math.floor(Math.random() * C.SHOUT.praise.length); } while (p === lastPraise && C.SHOUT.praise.length > 1);
    lastPraise = p;
    e.praise = C.SHOUT.praise[p]; e.at = Date.now();
    Cn.shoutLog.push({ id: e.id, raw: e.raw, praise: e.praise });
    if (Cn.shoutLog.length > 30) Cn.shoutLog.shift();
    shoutQ.push(e);
    if (shoutQ.length > 2) { shoutQ.sort((a, b) => b.pri - a.pri || b.at - a.at); shoutQ.length = 2; }
    if (!shoutBusy) nextShout();
    return e;
  };
  function nextShout() {
    clearTimeout(shoutT);
    if (!alive) return;
    while (shoutQ.length && Date.now() - shoutQ[0].at > 12000) shoutQ.shift();
    const e = shoutQ.shift();
    if (!e) { shoutBusy = false; return; }
    shoutBusy = true;
    if (Cn.playing) { shoutQ.unshift(e); shoutT = setTimeout(nextShout, 600); return; }   // a mission scene is talking: after it
    const a = Cn.clip('announcer', e.raw, ''), b = Cn.clip('announcer', e.praise, '');
    if (!voiceOn() || (!a && !b)) { shoutT = setTimeout(nextShout, 300); return; }
    if (window.ArkMusic) window.ArkMusic.duck(0.45);
    const done = () => { if (window.ArkMusic && !Cn.playing) window.ArkMusic.duck(1); shoutT = setTimeout(nextShout, 700); };
    const play = (clip, then) => {
      const h = shoutVq.playClip(clip);
      if (!h) { then(); return; }
      const t0 = Date.now(), lim = (clip.dur + 1.5) * 1000;
      const tick = () => { if (!alive) return; if (h.ended() || Date.now() - t0 > lim || Cn.playing) then(); else shoutT = setTimeout(tick, 120); };
      shoutT = setTimeout(tick, 150);
    };
    play(a, () => { shoutT = setTimeout(() => play(b, done), a ? 120 : 0); });
  }
  const rawBanner = U.banner;
  const shoutBanner = function (title, sub, kind, color) { const r = rawBanner.apply(this, arguments); try { Cn.shout(title, kind); } catch (err) { /* never break a banner */ } return r; };
  U.banner = shoutBanner;

  const COLS = { max: '#8fd14f', rosa: '#ff7aa2', kim: '#ff8a5c', okafor: '#b49bff', priya: '#9fb4ff', dmitri: '#6fb7ff', luna: '#3fe0c5', kai: '#ffd23f', jay: '#c79bff',
    noor: '#f4f1ea', benny: '#ffa45c', zoe: '#e58cff', ollie: '#b6e35a', sam: '#ff9ccc', tomas: '#ffffff', bouchard: '#8fb3ff', chad: '#ffd166', mayor: '#ffc21f', kid: '#ffe08a' };
  const colorOf = id => COLS[id] || '#ffc21f';
  return Cn;
};

// One voice at a time: plays a clip, says how far it got and how open the mouth is right now.
function VoiceQueue(clips) { this.clips = clips || []; this.cur = null; }
VoiceQueue.prototype.playClip = function (clip) {
  this.stop();
  if (!clip) return null;
  const a = new Audio();
  a.preload = 'auto';
  a.src = clip.url;
  let failed = false, started = false, ended = false;
  a.addEventListener('playing', () => { started = true; });
  a.addEventListener('ended', () => { ended = true; });
  a.addEventListener('error', () => { failed = true; });
  const p = a.play();
  if (p && p.catch) p.catch(() => { failed = true; });
  const env = clip.env || '';
  const h = {
    a,
    ok: () => !failed && (started || a.currentTime > 0 || !a.paused),
    ended: () => ended || failed,
    env: () => { if (!started || ended) return 0; const i = Math.floor(a.currentTime * 20); const c = env.charCodeAt(i); return c >= 48 && c <= 57 ? (c - 48) / 9 : 0; },
  };
  this.cur = h;
  return h;
};
VoiceQueue.prototype.play = function (i) { return this.playClip(this.clips[i]); };
VoiceQueue.prototype.stop = function () { if (this.cur) { try { this.cur.a.pause(); this.cur.a.src = ''; } catch (e) { /* gone */ } this.cur = null; } };

C.VoiceQueue = VoiceQueue;
window.CFTCine = C;
})();
