// The start screen's address check (theme/assets/cft-addr.js), offline with canned answers. Node, no browser:
//   node tools/testing/addr_test.js        -> PASS/FAIL lines, exit 1 on a failure. Run by tools/check.py.
// The answers copy what Nominatim and Photon really sent on 2026-11-27 for the cases that went wrong (a random stretch
// of a long street, the same number in another city, "155 k-12" taken for number 12). Live version: addr_live.js.
'use strict';
const path = require('path');
const A = require(path.join(__dirname, '..', '..', 'theme', 'assets', 'cft-addr.js'));
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const nom = (lat, lon, a, extra) => Object.assign({ lat: String(lat), lon: String(lon), address: a, importance: 0.05, addresstype: a.house_number ? 'place' : 'secondary', category: a.house_number ? 'place' : 'highway', name: a.house_number ? '' : a.road, display_name: [a.house_number, a.road, a.suburb, a.city].filter(Boolean).join(', ') }, extra || {});
const pho = (lat, lon, p) => ({ geometry: { coordinates: [lon, lat] }, properties: p });
const MTL = { city: 'Montréal', state: 'Québec', country: 'Canada' };
const FIX = {
  // 1234 Rue Saint-Denis isn't in OpenStreetMap: Nominatim gives stretches of the street, Photon the same number in Laval
  '1234 Rue Saint-Denis, Montréal': {
    nom: [nom(45.5284, -73.5928, Object.assign({ road: 'Rue Saint-Denis', suburb: 'Le Plateau-Mont-Royal' }, MTL)),
      nom(45.5178, -73.5695, Object.assign({ road: 'Rue Saint-Denis', suburb: 'Le Plateau-Mont-Royal' }, MTL))],
    pho: [pho(45.5241, -73.8542, { housenumber: '1234', street: 'Rue Saint-Denis', city: 'Laval', state: 'Québec', country: 'Canada', osm_key: 'place', osm_value: 'house' }),
      pho(45.5537, -73.6690, { name: 'Rue Saint-Denis', city: 'Montréal', osm_key: 'highway', osm_value: 'residential' })],
  },
  '4567 rue Saint-Denis Montreal': {
    nom: [nom(45.52453, -73.58381, Object.assign({ house_number: '4567', road: 'Rue Saint-Denis', suburb: 'Le Plateau-Mont-Royal' }, MTL))],
    pho: [pho(45.524565, -73.5837538, { housenumber: '4567', street: 'Rue Saint-Denis', city: 'Montréal', osm_key: 'place', osm_value: 'house' })],
  },
  '12 Brivibas iela, Riga': {
    nom: [nom(56.9667, 24.1433, { house_number: '155 k-12', road: 'Brīvības iela', city: 'Rīga', country: 'Latvija' }),
      nom(56.9657, 24.1436, { road: 'Brīvības iela', city: 'Rīga', country: 'Latvija' })],
    pho: [pho(56.9667, 24.1433, { housenumber: '155 k 12', street: 'Brīvības iela', city: 'Rīga', osm_key: 'building', osm_value: 'service' })],
  },
  'Mile End': { nom: [nom(45.5236, -73.6005, { suburb: 'Mile End', city: 'Montréal', country: 'Canada' }, { addresstype: 'suburb', category: 'place', name: 'Mile End' })], pho: [] },
};
const get = async url => {
  const q = decodeURIComponent(url.split('q=')[1].split('&')[0]);
  const f = FIX[q];
  if (!f) throw new Error('no fixture for ' + q);
  return url.includes('nominatim') ? f.nom : { features: f.pho };
};

(async () => {
  // parsing
  ok(A.parse('1234 Rue Saint-Denis, Montréal').num === '1234', 'reads the house number in front');
  ok(A.parse('Brīvības iela 12, Rīga').num === '12', 'reads a house number after the street (Riga style)');
  ok(A.parse('Rue Saint-Denis, Montréal, H2X 3K4').num === null, 'a postcode is not a house number');
  ok(A.parse('350 5th Ave, New York, 10118').num === '350', 'the US ZIP at the end is not the house number');
  ok(A.parse('45.52, -73.58').coords.lat === 45.52, 'typed coordinates are coordinates');
  ok(A.sig('Rue St-Denis').join(' ') === 'saint denis', '"St" means Saint, "Rue" says nothing');

  // 1. not Laval, not a random stretch: the number is missing -> street status in the right city
  let r = await A.lookup('1234 Rue Saint-Denis, Montréal', { get, tile: async () => null });
  ok(r.status === 'street', 'a number missing from the map is reported (status ' + r.status + ')');
  ok(r.best.city === 'Montréal', 'the same number in another city (Laval) loses to your city (' + r.best.city + ')');
  ok(/1234/.test(r.note) && /Montréal/.test(r.note), 'the note says which number is missing where: "' + r.note + '"');
  ok(r.list.every(c => c.city !== 'Laval' || c.score < r.best.score), 'Laval is only offered below the pick');

  // 2. the real address
  r = await A.lookup('4567 rue Saint-Denis Montreal', { get, tile: async () => null });
  ok(r.status === 'exact' && Math.abs(r.best.lat - 45.5245) < 0.001, 'a mapped address is exact (' + r.status + ', ' + r.best.short + ')');

  // 3. "155 k-12" is not number 12
  r = await A.lookup('12 Brivibas iela, Riga', { get, tile: async () => null });
  ok(r.status !== 'exact', '"155 k-12" is not taken for number 12 (status ' + r.status + ')');
  ok(/Brīvības iela/.test(r.best.short || '') || r.best.road === 'Brīvības iela', 'still on the right street');

  // 4. a neighbourhood with no number
  r = await A.lookup('Mile End', { get, tile: async () => null });
  ok(r.status === 'place', 'a neighbourhood is a place (' + r.status + ')');

  // 5. between neighbours: 1234 between 1230 and 1240 on the same side (even)
  const pts = [{ n: 1230, t: '1230', lat: 45.5100, lon: -73.5600 }, { n: 1240, t: '1240', lat: 45.5110, lon: -73.5610 }, { n: 1235, t: '1235', lat: 45.5300, lon: -73.6000 }];
  const b = A.between(1234, pts);
  ok(b && Math.abs(b.lat - 45.5104) < 0.00005 && b.lo === '1230' && b.hi === '1240', 'a missing number sits between its neighbours on the same side (' + (b && b.lat.toFixed(5)) + ')');
  const e = A.beyond(1250, pts.slice(0, 2));
  ok(e && e.lat > 45.5110 && e.gap === 10, 'past the last known number it carries on along the street (' + (e && e.lat.toFixed(5)) + ')');

  // 6. the network is down
  let threw = false;
  try { await A.lookup('somewhere', { get: async () => { throw new Error('offline'); } }); } catch (err) { threw = true; }
  ok(threw, 'no search service reachable -> an error the start screen can explain');

  console.log(fails ? 'ADDRESS TEST FAILED (' + fails + ')' : 'ADDRESS TEST PASSED');
  process.exit(fails ? 1 : 0);
})();
