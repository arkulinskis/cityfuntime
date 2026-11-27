// Holes in the ground (2026-11-27, the user: "some areas of the city have huge holes, as if map topology data is bad").
// 1. the elevation clean-up (W.cleanHeights): a noisy red channel (+-256 m), no-data pixels and a no-data patch are repaired;
// 2. at six spots: every sub-tile within 600 m is built, none fell back to ground-only, no street tile keeps failing, and
//    no step between two ground grid nodes is a cliff (W.groundCheck: < 8 m over 5 m; real quays reach ~6 m). The synthetic
//    tile runs last so the INFO repair counts are the real tiles'. Run with:
//   python -I tools/live/game_test.py --holes            (CFT_START="lat,lon" for another city)
(async () => {
  const out = [], ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
  const G = window.__cft, W = G.W;
  window.CFT_TEST = Object.assign(window.CFT_TEST || {}, { norender: true, calm: true });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  try {
    G.ui.closeAll();
    // 2. walk the city
    const spots = [[0, 0], [1500, 0], [-1500, 800], [0, -2200], [2500, 2500], [-3000, -1000]];
    for (const [x, z] of spots) {
      W.teleport(x, z);
      let c;
      for (let k = 0; k < 360; k++) {
        W.pumpAt(W.player.pos.x, W.player.pos.z, 200);
        c = W.groundCheck(W.player.pos.x, W.player.pos.z, 600);
        if (c.subs > 0 && !c.unbuilt && !W.isBusy()) break;
        await sleep(250);
      }
      const at = '(' + x + ', ' + z + ')';
      ok(c.subs > 0 && c.unbuilt === 0, at + ' every sub-tile within 600 m is built (' + c.subs + ')');
      ok(c.fallback === 0, at + ' no sub-tile broke the builder' + (c.errors.length ? ': ' + JSON.stringify(c.errors) : ''));
      ok(c.tileErrors === 0, at + ' no street tile keeps failing (' + c.tileErrors + ')');
      ok(c.maxStep < 8, at + ' no cliff in the ground grid (steepest step ' + c.maxStep + ' m over ' + c.gs + ' m' + (c.maxStepAt ? ' at ' + Math.round(c.maxStepAt.x) + ', ' + Math.round(c.maxStepAt.z) : '') + ')');
      out.push('INFO ' + at + ' ' + JSON.stringify({ flat: c.flat, spikes: c.spikes, filled: c.filled, unreadable: c.unreadable }));
    }
    // 1. synthetic tile: a gentle 40 -> 72 m slope, then noise, no-data pixels and a 6 x 6 no-data patch
    const N = 64, px = new Uint8ClampedArray(N * N * 4), truth = new Float32Array(N * N);
    const put = (k, m) => { const v = m + 32768; px[k * 4] = Math.floor(v / 256); px[k * 4 + 1] = Math.floor(v % 256); px[k * 4 + 2] = Math.round((v % 1) * 256); px[k * 4 + 3] = 255; };
    for (let k = 0; k < N * N; k++) { truth[k] = 40 + (k % N) * 0.5; put(k, truth[k]); }
    let noisy = 0;
    for (let k = 0; k < N * N; k += 37) { px[k * 4] += (k & 1) ? 1 : -1; noisy++; }        // canvas noise in the red channel
    for (let k = 5; k < N * N; k += 211) { px[k * 4] = px[k * 4 + 1] = px[k * 4 + 2] = 0; }   // no-data pixels (-32768 m)
    for (let j = 20; j < 26; j++) for (let i = 30; i < 36; i++) { const k = j * N + i; px[k * 4] = px[k * 4 + 1] = px[k * 4 + 2] = 0; }
    const H = W.cleanHeights(px, N);
    let worst = 0;
    for (let k = 0; k < N * N; k++) worst = Math.max(worst, Math.abs(H[k] - truth[k]));
    ok(worst < 2, 'noisy elevation pixels and no-data holes are repaired (worst error ' + worst.toFixed(2) + ' m, ' + H.fixed + ' fixed, ' + noisy + ' noisy)');
    let threw = false;
    try { W.cleanHeights(new Uint8ClampedArray(N * N * 4).fill(255), N); } catch (e) { threw = true; }
    ok(threw, 'an unreadable (all white) elevation tile is refused, not drawn as a 32 km mountain');
  } catch (e) { out.push('FAIL exception ' + (e && e.stack || e)); }
  window.__holeOut = out; window.__holeDone = true;
})();
