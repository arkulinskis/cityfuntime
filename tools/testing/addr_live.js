// The start screen's address check against the real services (Nominatim, Photon, OpenFreeMap tiles). Needs internet;
// not run by check.py (the services change and rate-limit). node tools/testing/addr_live.js [an address ...]
'use strict';
const path = require('path');
const A = require(path.join(__dirname, '..', '..', 'theme', 'assets', 'cft-addr.js'));
const TM = require(path.join(__dirname, '..', '..', 'theme', 'assets', 'cft-tiles.js'));
const UA = { 'User-Agent': 'CityFunTime-tests/1.0' };
const get = async url => { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
let tileTpl = null;
const tile = async (x, y) => {
  if (!tileTpl) tileTpl = (await get(TM.TILEJSON)).tiles[0];
  const r = await fetch(tileTpl.replace('{z}', TM.Z).replace('{x}', x).replace('{y}', y), { headers: UA });
  return r.ok ? r.arrayBuffer() : null;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const CASES = [
  { q: '4567 rue Saint-Denis Montreal', status: ['exact'], near: [45.5245, -73.5838, 60] },
  { q: '1234 Rue Saint-Denis, Montréal', status: ['guess', 'street', 'exact'], box: [45.50, 45.56, -73.62, -73.54], notCity: 'Laval' },
  { q: '350 5th Ave, New York', status: ['exact'], near: [40.7484, -73.9857, 80] },
  { q: '12 Brivibas iela, Riga', status: ['guess', 'street', 'exact'], box: [56.94, 56.99, 24.10, 24.18] },
  { q: 'Mile End, Montréal', status: ['place'], box: [45.51, 45.54, -73.62, -73.58] },
];
(async () => {
  const extra = process.argv.slice(2);
  for (const c of extra.length ? extra.map(q => ({ q })) : CASES) {
    const t0 = Date.now();
    const r = await A.lookup(c.q, { get, tile, TM, lang: 'en' });
    const b = r.best || {};
    console.log('  ' + c.q + ' -> ' + r.status + ' ' + (b.short || '') + ' (' + (b.lat || 0).toFixed(5) + ', ' + (b.lon || 0).toFixed(5) + ') ' + (r.note || '') + ' [' + (Date.now() - t0) + ' ms]');
    if (c.status) ok(c.status.includes(r.status), c.q + ': status ' + r.status);
    if (c.near) ok(A.metres(b, { lat: c.near[0], lon: c.near[1] }) < c.near[2], c.q + ': within ' + c.near[2] + ' m of the real door');
    if (c.box) ok(b.lat > c.box[0] && b.lat < c.box[1] && b.lon > c.box[2] && b.lon < c.box[3], c.q + ': in the right part of town');
    if (c.notCity) ok(b.city !== c.notCity, c.q + ': not in ' + c.notCity);
    await sleep(1200);   // Nominatim: one request a second
  }
  console.log(fails ? 'LIVE ADDRESS TEST FAILED (' + fails + ')' : 'LIVE ADDRESS TEST PASSED');
  process.exit(fails ? 1 : 0);
})();
