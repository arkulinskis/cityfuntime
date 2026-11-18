// Boroughs (2026-11-17), run inside the game page by tools/live/game_test.py (in the full run, or alone with --boro):
// borough names arrive from the zoom-11 map tile, nearby boroughs get different looks, the HUD chip shows where you are,
// walking into another borough shows its banner and counts it (discovery XP, achievements), the map draws the names.
// Results in window.__boroOut, done flag window.__boroDone.
window.__boroOut = []; window.__boroDone = false;
(async () => {
  const out = window.__boroOut, T0 = Date.now();
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m + '  [' + Math.round((Date.now() - T0) / 1000) + 's]');
  const info = m => out.push('INFO ' + m);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const G = window.__cft, W = G.W, U = G.ui, s = G.save;
  const sim = n => G.stepSim(n);
  window.CFT_TEST = Object.assign(window.CFT_TEST || {}, { norender: true, calm: true });
  try {
    U.closeAll();
    for (let i = 0; i < 100 && !W.districts().length; i++) await sleep(300);
    const ds = W.districts();
    ok(ds.length >= 5, ds.length + ' borough / town names from the map (' + ds.filter(d => d.c === 'suburb').slice(0, 6).map(d => d.n).join(', ') + '...)');
    const home = W.districtAt(0, 0);
    ok(!!home && /Plateau/.test(home.n), 'home is in ' + (home && home.n) + ' (' + (home && home.look.n) + ')');
    let clash = 0;
    let twin = Infinity;
    for (const a of ds) for (const b of ds) if (a !== b && a.look === b.look) twin = Math.min(twin, Math.hypot(a.x - b.x, a.z - b.z));
    for (const a of ds) for (const b of ds) if (a !== b && a.look === b.look && Math.hypot(a.x - b.x, a.z - b.z) < 4500) clash++;
    ok(clash === 0, 'neighbouring boroughs never share a look (closest twins ' + (twin / 1000).toFixed(1) + ' km apart, ' + new Set(ds.map(d => d.look.id)).size + ' looks in use)');
    ok(W.LOOKS.every(L => L.css && L.ink && L.rc.length === 2), W.LOOKS.length + ' looks, each with colour, text colour and roofs');

    sim(80);
    const chip = document.querySelector('[data-boro]');
    ok(chip && !chip.hidden && chip.textContent.trim() === home.n, 'HUD chip says "' + (chip && chip.textContent.trim()) + '"');
    ok(chip && getComputedStyle(chip).backgroundColor !== 'rgba(0, 0, 0, 0)', 'HUD chip wears the borough colour (' + (chip && getComputedStyle(chip).backgroundColor) + ')');

    // walk into the nearest other borough: banner, counted, discovery XP
    if (!s.m['c1-couch'] || s.m['c1-couch'].s !== 'done') s.m['c1-couch'] = { s: 'done', done: 1 };
    const other = ds.filter(d => d.c !== 'city' && d.n !== home.n).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    const xp0 = s.xp, n0 = (s.rpg.boros || []).length;
    const spot = W.nearestWalk(other.x, other.z, 400) || other;
    W.teleport(spot.x, spot.z);
    if (U.clearBanners) U.clearBanners();  // earlier suites may have queued achievement banners (the full run)
    for (let i = 0; i < 40 && document.querySelector('.cft-banner'); i++) await sleep(100);
    let banner = null;
    for (let i = 0; i < 200 && !banner; i++) { sim(10); await sleep(100); banner = [...document.querySelectorAll('.cft-banner.boro')].find(b => b.textContent.includes(other.n)); }
    const here = W.districtAt(W.player.pos.x, W.player.pos.z);
    ok(here && here.n === other.n, 'teleported into ' + (here && here.n) + ' (' + (here && here.look.n) + ')');
    ok(!!banner, 'banner: "' + (banner && banner.textContent.slice(0, 90)) + '"');
    ok(banner && banner.style.getPropertyValue('--boro') === other.look.css, 'the banner wears ' + other.look.n);
    ok((s.rpg.boros || []).includes(other.n) && s.rpg.boros.length > n0, 'counted: ' + s.rpg.boros.join(', '));
    ok(s.xp > xp0, 'discovery XP +' + (s.xp - xp0));
    sim(60);
    ok(chip.textContent.trim() === other.n, 'HUD chip now says "' + chip.textContent.trim() + '"');

    // the same borough again later: a welcome banner, no extra count
    W.teleport(0, 0); sim(200); await sleep(200);
    W.teleport(spot.x, spot.z);
    let again = null;
    for (let i = 0; i < 200 && !again; i++) { sim(10); await sleep(100); again = [...document.querySelectorAll('.cft-banner.boro')].find(b => b.textContent.includes('Welcome to ' + other.n)); }
    ok(!!again, 'coming back: "' + (again && again.textContent.slice(0, 80)) + '"');
    ok(s.rpg.boros.filter(n => n === other.n).length === 1, 'not counted twice');

    // achievements and the map
    ok(G.D.RPG.ACH.some(a => a.k === 'boros'), 'borough achievements exist: ' + G.D.RPG.ACH.filter(a => a.k === 'boros').map(a => a.n).join(', '));
    U.phone('map'); await sleep(600);
    ok(!!document.querySelector('[data-bigmap]'), 'big map opens with the borough names drawn');
    U.closeAll();
  } catch (e) { ok(false, 'exception: ' + (e && e.stack || e)); }
  window.__boroDone = true;
})();
