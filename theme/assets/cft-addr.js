/* City Fun Time: finding the address you type on the start screen (2026-11-27, the user: "the game doesn't give the right
   address when you are starting a life. can we add a validation that the address is found and make sure it is the right one?").

   What went wrong before: the first hit of one search was taken as is. When OpenStreetMap doesn't have your house number,
   Nominatim answers with *some* stretch of the street (Rue Saint-Denis is 11 km long), and Photon can answer with the same
   number in another city (1234 Rue Saint-Denis, Montréal -> Laval). Now:
     1. Nominatim and Photon are asked together (up to 10 answers each) and every answer is scored against what you typed:
        the house number (+50 same, -15 a different one), the street's words (+30 x how many of them you typed) and the
        other words you typed (city, borough, postcode: +20 when the answer's place has them, -35 when it doesn't).
     2. Same number + your street + your town = 'exact'. A number that isn't on the map is placed between its neighbours on
        the same street (house numbers from the game's own map tiles, same side of the street first): 'guess'. No neighbours
        close enough: the street's best stretch, 'street'. Nothing typed as a number: 'place'.
     3. The start screen (cft-ui U.startScreen) always shows what was found on a small map before you move in; tap the map to
        move the pin onto your building, or pick another answer.
   Works in the browser (window.CFTAddr) and in Node (tools/testing/addr_test.mjs). The network is passed in: opts.get(url)
   -> JSON, opts.tile(x, y) -> ArrayBuffer of a zoom-14 street tile (TileMaker format), so the tests can feed fixtures. */
(function (root) {
'use strict';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=10&q=';
const NOMINATIM_REV = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&';
const PHOTON = 'https://photon.komoot.io/api/?limit=10&q=';

// ---------------------------------------------------------------- words
const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/ß/g, 'ss').replace(/[^a-z0-9Ѐ-ӿ]+/g, ' ').trim();
const SAINT = { st: 'saint', ste: 'sainte', sv: 'svetais', mt: 'mount' };
// street-type and filler words: they say nothing about WHICH street (Rue / Avenue / iela / Street...)
const TYPE = new Set(('rue street avenue ave av boulevard blvd bd boul road rd lane ln drive dr chemin ch place pl route rte way court ct ' +
  'crescent cres terrace terr parkway pkwy highway hwy square sq iela prospekts bulvaris laukums gatve strasse str platz weg via viale ' +
  'calle avenida carrer rua ulitsa ulica ul allee impasse quai cours montee cote the de du des la le les d l of and e o y n s w').split(' '));
const tokens = s => norm(s).split(' ').filter(Boolean).map(t => SAINT[t] || t);
const sig = s => tokens(s).filter(t => !TYPE.has(t));
const hnNorm = s => norm(s).replace(/\s+/g, '');
const hnInt = s => { const m = String(s || '').match(/\d+/); return m ? +m[0] : NaN; };

// The house number you typed: the first number in the part with the street (before the first comma), else the first
// number anywhere that isn't a 5-digit postcode at the end. "12a", "1234" count; "H2T 1S5" doesn't.
function parse(q) {
  q = String(q || '').trim();
  const coords = q.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (coords) return { q, coords: { lat: +coords[1], lon: +coords[2] } };
  const segs = q.split(',').map(x => x.trim()).filter(Boolean);
  const isNum = t => /^\d{1,5}[a-z]?$/i.test(t);
  let num = null;
  for (const t of (segs[0] || '').split(/\s+/)) if (isNum(t)) { num = t; break; }
  if (!num) {
    const all = q.split(/[\s,]+/);
    for (let i = 0; i < all.length; i++) if (isNum(all[i]) && !(i === all.length - 1 && /^\d{5}$/.test(all[i]))) { num = all[i]; break; }
  }
  return { q, num, words: tokens(q).filter(t => !num || hnNorm(t) !== hnNorm(num)) };
}

// ---------------------------------------------------------------- answers -> one shape
function fromNominatim(r) {
  const a = r.address || {};
  const road = a.road || a.pedestrian || a.footway || a.path || a.square || a.cycleway || (r.category === 'highway' ? r.name : '') || '';
  const city = a.city || a.town || a.village || a.municipality || a.hamlet || '';
  return { lat: +r.lat, lon: +r.lon, hn: a.house_number || '', road, name: r.name || '', city,
    place: [a.neighbourhood, a.quarter, a.suburb, a.borough, a.city_district, city, a.county, a.state, a.region, a.postcode, a.country].filter(Boolean).join(' '),
    label: r.display_name || '', imp: +r.importance || 0, src: 'nominatim', kind: r.addresstype || r.type || '' };
}
function fromPhoton(f) {
  const p = f.properties || {}, c = f.geometry && f.geometry.coordinates;
  if (!c) return null;
  const road = p.street || (p.osm_key === 'highway' ? p.name : '') || '';
  const city = p.city || p.town || p.village || '';
  return { lat: c[1], lon: c[0], hn: p.housenumber || '', road, name: p.name || '', city,
    place: [p.district, p.locality, city, p.county, p.state, p.postcode, p.country].filter(Boolean).join(' '),
    label: [[p.housenumber, road || p.name].filter(Boolean).join(' '), city, p.state, p.country].filter(Boolean).join(', '),
    imp: 0, src: 'photon', kind: p.osm_value || '' };
}
const shortOf = c => [[c.hn, c.road || c.name].filter(Boolean).join(' '), c.city].filter(Boolean).join(', ');

// ---------------------------------------------------------------- scoring
function score(c, P) {
  const R = sig(c.road || c.name), Q = new Set(P.words);
  const cov = R.length ? R.filter(t => Q.has(t)).length / R.length : 0;
  let s = 30 * cov;
  const hnSame = !!(P.num && c.hn && hnNorm(c.hn) === hnNorm(P.num));
  if (P.num && c.hn) s += hnSame ? 50 : -15;
  // the words that aren't the street: they should be in the answer's town / borough / postcode / country
  const Rs = new Set(R), place = ' ' + norm(c.place) + ' ';
  const left = P.words.filter(t => !Rs.has(t) && !TYPE.has(t) && !(c.hn && hnNorm(t) === hnNorm(c.hn)) && !/^\d{1,5}[a-z]?$/.test(t));
  let placeOk = true;
  if (left.length) {
    const hit = left.filter(t => place.includes(' ' + t + ' ') || place.includes(' ' + t)).length / left.length;
    if (hit >= 0.5) s += 20 * hit; else { s -= 35; placeOk = false; }
  }
  s += 5 * Math.min(1, c.imp);
  c.score = Math.round(s * 10) / 10; c.cov = cov; c.hnSame = hnSame; c.placeOk = placeOk;
  c.exact = hnSame && cov >= 0.5 && placeOk;
  return c;
}
const metres = (a, b) => { const k = Math.PI / 180, x = (b.lon - a.lon) * k * Math.cos((a.lat + b.lat) / 2 * k), y = (b.lat - a.lat) * k; return 6371000 * Math.hypot(x, y); };
// best first; answers within 80 m of a better one with the same number + street are dropped
function rank(list, P) {
  const out = [];
  for (const c of list.map(c => score(c, P)).sort((a, b) => b.score - a.score)) {
    if (out.some(o => metres(o, c) < 80 && hnNorm(o.hn) === hnNorm(c.hn) && norm(o.road) === norm(c.road))) continue;
    out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------- a number between its neighbours
// House numbers of `road` from the game's zoom-14 tiles around the street's stretches: a number belongs to the street when
// the nearest named street within NEAR_M is that street. Up to MAX_TILES tiles: the seeds, then the next tile toward the
// number when everything found so far is on one side of it.
const NEAR_M = 45, MAX_TILES = 8;
async function streetNumbers(road, seeds, tile, TM) {
  const want = norm(road), found = new Map(), seen = new Set();
  const queue = [];
  const add = (lat, lon) => { const x = Math.floor(TM.lonToX(lon)), y = Math.floor(TM.latToY(lat)), k = x + '/' + y; if (!seen.has(k)) { seen.add(k); queue.push([x, y]); } };
  for (const s of seeds.slice(0, 4)) add(s.lat, s.lon);
  let fetched = 0;
  const pull = async () => {
    while (queue.length && fetched < MAX_TILES) {
      const [x, y] = queue.shift();
      fetched++;
      let buf;
      try { buf = await tile(x, y); } catch (e) { continue; }
      if (!buf || !buf.byteLength) continue;
      const rec = TM.process(buf, x, y), lines = [], hns = [];
      for (const sb of rec.subs) { for (const nm of sb.nm) lines.push(nm); for (let i = 0; i < sb.hn.length; i += 3) hns.push(sb.hn[i], sb.hn[i + 1], sb.hn[i + 2]); }
      const mpu = metres({ lat: TM.yToLat(y + 0.5), lon: TM.xToLon(x) }, { lat: TM.yToLat(y + 0.5), lon: TM.xToLon(x + 1) }) / TM.EXT;
      for (let i = 0; i < hns.length; i += 3) {
        const px = hns[i], py = hns[i + 1];
        let best = Infinity, name = '';
        for (const ln of lines) {
          const p = ln.p;
          for (let j = 0; j + 3 < p.length; j += 2) {
            const dx = p[j + 2] - p[j], dy = p[j + 3] - p[j + 1], L = dx * dx + dy * dy;
            let t = L ? ((px - p[j]) * dx + (py - p[j + 1]) * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
            const d = Math.hypot(px - p[j] - t * dx, py - p[j + 1] - t * dy);
            if (d < best) { best = d; name = ln.n; }
          }
        }
        if (best * mpu > NEAR_M || norm(name) !== want) continue;
        const n = hnInt(hns[i + 2]);
        if (n === n && !found.has(hns[i + 2])) found.set(hns[i + 2], { n, t: hns[i + 2], lat: TM.yToLat(y + py / TM.EXT), lon: TM.xToLon(x + px / TM.EXT) });
      }
    }
  };
  return { found, add, pull };
}
function between(target, pts) {
  const par = pts.filter(p => p.n % 2 === target % 2);
  for (const list of [par, pts]) {
    const lo = list.filter(p => p.n < target).sort((a, b) => b.n - a.n)[0], hi = list.filter(p => p.n > target).sort((a, b) => a.n - b.n)[0];
    if (lo && hi && hi.n - lo.n <= 400 && metres(lo, hi) < 1500) {
      const f = (target - lo.n) / (hi.n - lo.n);
      return { lat: lo.lat + (hi.lat - lo.lat) * f, lon: lo.lon + (hi.lon - lo.lon) * f, lo: lo.t, hi: hi.t };
    }
  }
  return null;
}
// the two nearest numbers on one side: carry on along the line they make (only a little way)
function beyond(target, pts) {
  const par = pts.filter(p => p.n % 2 === target % 2), list = par.length >= 2 ? par : pts;
  const s = list.slice().sort((a, b) => Math.abs(a.n - target) - Math.abs(b.n - target));
  const a = s[0], b = s.find(p => p.n !== a.n && metres(p, a) > 8);
  if (!a || !b) return null;
  const per = metres(a, b) / Math.abs(a.n - b.n), dist = Math.abs(target - a.n) * per;
  const dir = Math.sign(a.n - b.n) === Math.sign(target - a.n) ? 1 : -1, f = dir * dist / metres(a, b);
  return { lat: a.lat + (a.lat - b.lat) * f, lon: a.lon + (a.lon - b.lon) * f, near: a.t, gap: Math.abs(target - a.n), dist };
}
async function interpolate(num, road, seeds, opts) {
  const TM = opts.TM || root.TileMaker, target = hnInt(num);
  if (!TM || !opts.tile || !road || target !== target) return null;
  const sn = await streetNumbers(road, seeds, opts.tile, TM);
  await sn.pull();
  for (let round = 0; round < 4; round++) {
    const pts = [...sn.found.values()];
    const exact = pts.find(p => hnNorm(p.t) === hnNorm(num));
    if (exact) return { lat: exact.lat, lon: exact.lon, how: 'tiles', exact: true };
    const b = between(target, pts);
    if (b) return Object.assign(b, { how: 'between' });
    const e = beyond(target, pts);
    if (!e) return null;
    if (e.gap <= 60 && e.dist <= 400) return Object.assign(e, { how: 'beyond' });
    if (e.dist > 6000) return null;
    sn.add(e.lat, e.lon);   // further along the street: fetch the tile there and look again
    await sn.pull();
  }
  return null;
}

// ---------------------------------------------------------------- the lookup
// -> { status: 'coords' | 'exact' | 'guess' | 'street' | 'place' | 'none', best, list, parsed, note }
async function lookup(q, opts) {
  opts = opts || {};
  const P = parse(q);
  if (P.coords) return { status: 'coords', parsed: P, best: { lat: P.coords.lat, lon: P.coords.lon, label: P.q, short: P.q }, list: [] };
  const get = opts.get, lang = opts.lang ? '&accept-language=' + encodeURIComponent(opts.lang) : '';
  const [nom, pho] = await Promise.allSettled([get(NOMINATIM + encodeURIComponent(P.q) + lang), get(PHOTON + encodeURIComponent(P.q))]);
  if (nom.status === 'rejected' && pho.status === 'rejected') throw new Error('address search unreachable');
  const raw = [];
  if (nom.status === 'fulfilled' && Array.isArray(nom.value)) for (const r of nom.value) raw.push(fromNominatim(r));
  if (pho.status === 'fulfilled' && pho.value && pho.value.features) for (const f of pho.value.features) { const c = fromPhoton(f); if (c) raw.push(c); }
  const list = rank(raw.filter(c => c.lat === c.lat && c.lon === c.lon), P);
  if (!list.length) return { status: 'none', parsed: P, best: null, list: [] };
  let best = list[0], status, note = '';
  if (!P.num) status = 'place';
  else if (best.exact) status = 'exact';
  else {
    // your number isn't on the map as an address: find its street (the best answer that is your street in your town)
    const st = list.find(c => c.cov >= 0.5 && c.placeOk && c.road) || best;
    const seeds = list.filter(c => c.road && norm(c.road) === norm(st.road) && metres(c, st) < 15000);
    let g = null;
    try { g = await interpolate(P.num, st.road, seeds.length ? seeds : [st], opts); } catch (e) { g = null; }
    const town = st.city || '';
    if (g) {
      status = g.exact ? 'exact' : 'guess';
      best = Object.assign({}, st, { lat: g.lat, lon: g.lon, hn: P.num, exact: !!g.exact, guess: !g.exact, how: g.how });
      note = g.exact ? '' : g.how === 'between' ? 'between numbers ' + g.lo + ' and ' + g.hi : 'next to number ' + g.near;
    } else {
      status = 'street';
      best = Object.assign({}, st, { hn: '' });
      note = 'number ' + P.num + ' isn\'t on the map' + (st.road ? ' on ' + st.road : '') + (town ? ' in ' + town : '');
    }
  }
  best.short = shortOf(best) || P.q;
  // the long line under it: the answer's own full address only when it IS that answer (a guess borrowed a stretch of street)
  if (status === 'guess' || status === 'street') best.label = [best.road, best.city].filter(Boolean).join(', ');
  best.label = best.label || best.short;
  // other answers worth offering: a different place (150 m+ away) with a different name; no second copy of a street
  const others = [], names = new Set([norm(best.short)]);
  for (const c of list) {
    if (others.length >= 4) break;
    if (c === best || metres(c, best) <= 150) continue;
    c.short = shortOf(c) || c.label;
    const k = norm(c.short);
    if (names.has(k) || (!c.hn && best.road && norm(c.road) === norm(best.road))) continue;
    names.add(k); others.push(c);
  }
  return { status, parsed: P, best, list: others, note };
}
// The address at a spot (after you move the pin): "1240 Rue Saint-Denis, Montréal", or null
async function reverse(lat, lon, opts) {
  try {
    const r = await opts.get(NOMINATIM_REV + 'lat=' + lat.toFixed(6) + '&lon=' + lon.toFixed(6) + (opts.lang ? '&accept-language=' + encodeURIComponent(opts.lang) : ''));
    if (!r || r.error) return null;
    const c = fromNominatim(r);
    return shortOf(c) || null;
  } catch (e) { return null; }
}

const CFTAddr = { parse, score, rank, lookup, reverse, interpolate, between, beyond, norm, sig, metres, fromNominatim, fromPhoton };
if (typeof module !== 'undefined' && module.exports) module.exports = CFTAddr;
else root.CFTAddr = CFTAddr;
})(typeof window !== 'undefined' ? window : globalThis);
