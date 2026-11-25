// Voiced cinematic missions (2026-11-20), run inside the game page by tools/live/game_test.py (--cine, and last in the full run):
// every mission line has a voice clip in cft-vo.js, paired lines follow who you date, the narrator gets the lines without a
// name, a mission intro plays as a scene (letterbox, HUD hidden, the camera taken over, the giver talking with a moving
// mouth, a title card, word-by-word subtitles), clicks go to the next line and Esc skips, the narrator's chapter card plays
// once per chapter, a speaker who isn't there phones you, the outro ends with MISSION COMPLETE, the giver cheers when you
// accept, and "Cinematic mission scenes" off (or the other test suites) keeps the old dialogue box.
// Results in window.__cineOut, done flag window.__cineDone.
window.__cineOut = []; window.__cineDone = false;
(async () => {
  const out = window.__cineOut, T0 = Date.now();
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m + '  [' + Math.round((Date.now() - T0) / 1000) + 's]');
  const info = m => out.push('INFO ' + m);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const G = window.__cft, W = G.W, U = G.ui, s = G.save, D = G.D, Cn = G.cine, C = window.CFTCine;
  const sim = n => G.stepSim(n);
  window.CFT_TEST = Object.assign(window.CFT_TEST || {}, { norender: true, calm: true, outposts: false });
  delete window.CFT_TEST.cine;
  const $ = q => document.querySelector(q);
  async function drain(choose) {   // the old dialogue box and choices
    for (let i = 0; i < 60; i++) {
      await sleep(70);
      const c = $('.cft-choose'), d = $('.cft-dlg');
      if (c) { const opts = [...c.querySelectorAll('[data-k]')]; const pick = choose ? opts.find(o => choose.test(o.textContent)) : null; (pick || opts[0]).click(); continue; }
      if (d) { const o = d.querySelector('[data-k]:not(.lock)'); if (o) o.click(); else d.click(); continue; }
      if (!$('.cft-ov')) { await sleep(120); if (!$('.cft-ov')) return; }
    }
  }
  const waitFor = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < (ms || 4000)) { if (fn()) return true; await sleep(40); } return !!fn(); };
  const near = who => [...G.rt.actors.values()].find(a => a.who === who);
  const go = (x, z) => { W.teleport(x, z); sim(3); };
  try {
    ok(!!Cn && !!C, 'the cinematic module is attached (G.cine)');
    const V = window.CFT_VO;
    ok(!!V && V.n >= 400, 'the voice clip list is loaded: ' + (V ? V.n + ' clips' : 'none'));

    // ---------- every mission line has a voice
    let lines = 0, missing = [], paired = 0;
    for (const m of D.MISSIONS) {
      const pl = C.introPlace(m, D);
      const each = (raw, place, kind) => { const sp = C.speaker(raw, m.giver, D, kind); if (sp.id === 'everyone') return; lines++; if (C.paired(sp.id, raw)) paired++; if (!Cn.clip(sp.id, raw, place)) missing.push(m.id + ': ' + raw.slice(0, 40)); };
      (m.intro || []).forEach(l => each(l, pl, 'intro'));
      (m.outro || []).forEach(l => each(l, '', 'outro'));
      m.steps.forEach(st => (st.say || []).forEach(l => each(l, '', 'say')));
    }
    ok(missing.length === 0, 'every one of ' + lines + ' mission lines has a voice clip' + (missing.length ? ' (missing: ' + missing.slice(0, 3).join(' | ') + ')' : ''));
    ok(D.CHAPTERS.every(ch => Cn.clip('narrator', C.chapterRaw(ch), '')), 'the narrator reads all ' + D.CHAPTERS.length + ' chapter cards');
    const samLine = D.MISSIONS.find(m => m.giver === 'sam').intro[0];
    s.pref = 'gf'; const fa = Cn.clip('sam', samLine, C.introPlace(D.MISSIONS.find(m => m.giver === 'sam'), D));
    s.pref = 'bf'; const fb = Cn.clip('sam', samLine, C.introPlace(D.MISSIONS.find(m => m.giver === 'sam'), D));
    ok(fa && fb && fa.url !== fb.url, 'Sam has two voices, by who you date (' + paired + ' paired lines)');
    s.pref = 'gf';
    ok(fa && /\/vo\/cft\/[0-9a-f]+\.mp3$/.test(fa.url) && fa.dur > 0.5 && /^[0-9]+$/.test(fa.env), 'a clip = an MP3 on the media Worker + its length + a mouth envelope: ' + (fa && fa.url));
    ok(C.speaker('You grab a coffee.', 'max', D, 'say').id === 'narrator' && C.speaker('Sam (in a text): Hi', 'max', D, 'intro').id === 'sam' && C.speaker('{kid}: Bye!', 'sam', D).id === 'kid', 'speakers: narrator for unnamed step lines, "Sam (in a text)" = Sam, {kid} = your kid');

    // ---------- the other suites (no CFT_TEST.cine) keep the old dialogue box
    U.closeAll(); await drain();
    const pOld = G.cine.play({ who: 'max', raw: ['Testing the old box.'], kind: 'say', m: D.MISSIONS[0] });
    await sleep(150);
    ok(!!$('.cft-dlg') && !$('.cft-cine'), 'without CFT_TEST.cine: the dialogue box, no scene');
    await drain(); await pOld;

    // ---------- a mission intro as a scene
    window.CFT_TEST.cine = true;
    for (const id of G.activeMissions()) G.abandon(id);
    s.cine = { ch: {} };
    const home = G.homeSpot();
    go(home.x + 3, home.z + 3); sim(40);
    const max = near('max');
    ok(!!max, 'Cousin Max stands at home with a mission');
    const open = max && (max.open || [])[0];
    info('open mission at Max: ' + open);
    if (max && open) {
      go(max.obj.position.x + 1.4, max.obj.position.z + 0.3); sim(2);
      G.talkTo(max);
      await waitFor(() => $('.cft-choose'));
      const pick = [...$('.cft-choose').querySelectorAll('[data-k]')].find(b => /📜/.test(b.textContent));
      pick.click();
      ok(await waitFor(() => $('.cft-cine')), 'taking a mission opens a scene');
      ok(document.querySelector('.cft').hasAttribute('data-cine'), 'the HUD fades out (data-cine on the game)');
      await sleep(400);
      ok(getComputedStyle($('.cft-hud')).pointerEvents === 'none' && $('.cft-hud').matches('.cft[data-cine] > *'), 'the HUD is hidden during the scene (faded, not clickable)');
      ok($('.cft-cine').classList.contains('in'), 'letterbox bars slid in');
      const card = $('[data-ccard]');
      ok(card && !card.hidden && /Chapter/.test(card.textContent), 'chapter 1 opens with the narrator card: ' + (card && card.textContent.slice(0, 60)));
      ok(!!W.cine && W.cine.pos && W.cine.look, 'the camera is taken over (W.cine)');
      ok(max.obj.userData.cine === true, 'the giver is in the scene (actor userData.cine)');
      { // 2026-11-24: givers stand outside, at a set spot; you step to a set spot in front of them
        const gp = max.obj.position, pp = W.player.pos, gap = Math.hypot(gp.x - pp.x, gp.z - pp.z);
        ok(W.clearAt(gp.x, gp.z, 0.4) && !W.roofAt(gp.x, gp.z), 'the giver stands outside, not inside a building');
        ok(Math.abs(gap - 1.6) < 0.25 && W.clearAt(pp.x, pp.z, 0.3), 'you stand 1.6 m in front of the giver for the talk (' + gap.toFixed(2) + ' m)');
        ok(Math.abs(gp.y - W.standAt(gp.x, gp.z)) < 0.05, 'the giver\'s feet are on the ground / pavement');
        const all = [...G.rt.actors.values()].filter(a => a.who !== 'boss');
        ok(all.every(a => W.clearAt(a.x, a.z, 0.3)), 'no mission giver is inside a wall (' + all.length + ' givers)');
      }
      ok(Cn.chapterFor(G.D.MISSIONS[0]) === null, 'each chapter card plays only once');
      // skip the chapter card, then the title card
      $('.cft-cine-wrap').click();
      ok(await waitFor(() => /with Cousin Max/.test(card.textContent)), 'then the title card: the mission + who gives it');
      $('.cft-cine-wrap').click();
      ok(await waitFor(() => !$('[data-csub]').hidden && $('[data-ctext]').textContent.length > 10), 'subtitles show the first line');
      ok(/Cousin Max/.test($('[data-cwho]').textContent), 'the subtitle names the speaker');
      await sleep(900);
      const words = [...document.querySelectorAll('[data-ctext] span')];
      ok(words.length > 3 && words.some(w => w.classList.contains('on')) && words.some(w => !w.classList.contains('on')), 'words come in one by one (' + words.filter(w => w.classList.contains('on')).length + '/' + words.length + ' so far)');
      { const u = max.obj.userData;   // a built figure gets a mouth mesh; an Actor Troop model (Max = Marcus) swings its lip bone
        ok(u.modelId ? u.mouthOpen != null : !!u.mouth, 'the giver\'s mouth moves (' + (u.modelId ? 'model ' + u.modelId + ': lip bone' : 'W.mouth made one') + ')'); }
      ok(W.cine.fov < 56, 'a cinematic lens, not the gameplay camera (fov ' + Math.round(W.cine.fov) + ')');
      const t1 = $('[data-ctext]').textContent;
      $('.cft-cine-wrap').click(); await sleep(60); $('.cft-cine-wrap').click();
      ok(await waitFor(() => $('[data-ctext]').textContent !== t1, 2500), 'click: the next line');
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
      ok(await waitFor(() => !$('.cft-cine'), 3000), 'Esc skips the rest of the scene');
      ok(W.cine === null && !document.querySelector('.cft').hasAttribute('data-cine') && max.obj.userData.cine === false, 'after the scene: the camera, the HUD and the giver are back to normal');
      ok(await waitFor(() => $('.cft-choose') && /Let's do it/.test($('.cft-choose').textContent)), 'then the usual "Let\'s do it" choice');
      const yes = [...$('.cft-choose').querySelectorAll('[data-k]')].find(b => /Let's do it/.test(b.textContent));
      yes.click(); await drain();
      ok(G.activeMissions().includes(open), 'the mission is accepted');
      ok(max.obj.userData.cheerT > 0, 'Max cheers (arms up) when you accept');
      sim(10);
      // ---------- the outro: MISSION COMPLETE
      const m = G.D.MISSIONS.find(x => x.id === open);
      const pOut = Cn.play({ who: 'max', raw: m.outro, kind: 'outro', m, actor: max.obj });
      await waitFor(() => $('.cft-cine'));
      for (let i = 0; i < 12 && !/Mission complete/i.test(($('[data-ccard]') || {}).textContent || ''); i++) { $('.cft-cine-wrap') && $('.cft-cine-wrap').click(); await sleep(120); }
      ok(/Mission complete/i.test($('[data-ccard]').textContent), 'the outro ends with a MISSION COMPLETE stamp');
      await pOut;
      ok(!$('.cft-cine') && W.cine === null, 'the stamp goes and play resumes');
    }

    // ---------- someone who isn't here phones you
    go(home.x + 60, home.z + 60); sim(5);
    const pCall = Cn.play({ who: 'sam', raw: ['Sam (in a text): Happy anniversary!! Don\'t you dare forget.'], kind: 'say', m: D.MISSIONS.find(x => x.giver === 'sam') });
    ok(await waitFor(() => $('[data-ccall]') && !$('[data-ccall]').hidden), 'a speaker who isn\'t nearby calls you (phone card)');
    ok(await waitFor(() => W.cine && W.cine.pose === 'phone', 1500), 'you hold the phone to your ear');
    ok(/Sam/.test($('[data-ccname]').textContent), 'the call card shows who is calling');
    Cn.skip(); await pCall;

    // ---------- the narrator for a step line without a name
    const pNar = Cn.play({ who: 'max', raw: ['You grab a coffee. The barista smiles.'], kind: 'say', m: D.MISSIONS[0] });
    await waitFor(() => $('.cft-cine') && !$('[data-csub]').hidden);
    ok($('[data-ccall]').hidden && $('[data-cwho]').hidden, 'a narrated line: no phone call, no name');
    Cn.skip(); await pNar;

    // ---------- the announcer (2026-11-24): good-news banners are said out loud, then a cheer
    {
      const miss = C.SHOUT.lines(D).filter(raw => !Cn.clip('announcer', raw, ''));
      ok(!miss.length, 'every announcer line has a voiced clip (' + C.SHOUT.lines(D).length + ' lines)' + (miss.length ? ': missing ' + miss.slice(0, 3).join(' | ') : ''));
      const said = (title, kind) => { Cn.shoutLog.length = 0; const n = 0; U.banner(title, 'test', kind); return Cn.shoutLog.length > n ? Cn.shoutLog[Cn.shoutLog.length - 1] : null; };
      U.clearBanners();
      const a = D.RPG.ACH[0], m = D.MISSIONS[0];
      let r = said('🏆 ' + a.n, 'ach');
      ok(r && r.id === 'ach' && r.raw.indexOf(a.n) > 0 && C.SHOUT.praise.includes(r.praise), 'an achievement: "' + (r && r.raw) + ' ' + (r && r.praise) + '"');
      r = said('🏆 ' + m.title, 'done'); ok(r && r.id === 'mission' && r.raw.indexOf(m.title) > 0, 'a finished mission is announced by name: "' + (r && r.raw) + '"');
      r = said('🍩 Tom Heartons is free!', 'done'); ok(r && r.id === 'liberated', 'a liberated store: "' + (r && r.raw) + '"');
      r = said('🔍 Secret #2 found!', 'done'); ok(r && r.id === 'secret', 'a secret found');
      r = said('🗺️ Discovered: Rue Test', 'day'); ok(r && r.id === 'discover', 'a new block discovered');
      r = said('Level 7!', 'level'); ok(r && r.id === 'level', 'a level up');
      ok(!said('💫 You blacked out', 'fail') && !said('☀️ Day 4', 'day'), 'bad news and plain notices stay silent');
      const p1 = said('📸 New in the Dex: 👾 Test', 'done'), p2 = said('🚇 Test Station is free!', 'done');
      ok(p1 && p2 && p1.praise !== p2.praise, 'the cheer changes every time');
      s.settings.announcer = false;
      ok(!said('🏆 ' + a.n, 'ach'), '"Announcer" off: silent');
      delete s.settings.announcer;
      U.clearBanners();
    }

    // ---------- the setting
    s.settings.cine = false;
    const pOff = Cn.play({ who: 'max', raw: ['Old school.'], kind: 'say', m: D.MISSIONS[0] });
    await sleep(150);
    ok(!!$('.cft-dlg') && !$('.cft-cine'), '"Cinematic mission scenes" off: the dialogue box');
    await drain(); await pOff;
    delete s.settings.cine;
    U.phone('settings'); await sleep(200);
    ok(!!document.querySelector('[data-set="voice"]') && !!document.querySelector('[data-set="cine"]') && !!document.querySelector('[data-set="announcer"]'), 'Settings has "Voiced missions", "Announcer" and "Cinematic mission scenes"');
    U.closeAll();
  } catch (e) {
    ok(false, 'EXCEPTION ' + (e && e.stack || e));
  } finally {
    delete window.CFT_TEST.cine;
    U.closeAll();
    window.__cineDone = true;
  }
})();
