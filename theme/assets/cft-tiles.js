/* City Fun Time map tiles (adapted from City Coin Run's tiles.js): decodes OpenMapTiles vector tiles (from OpenFreeMap, built from OpenStreetMap)
   into compact records the game turns into 3D. Works in the browser and in Node.
   Tiles are zoom-14 Web-Mercator tiles (about 1.7 km wide at Montréal). Each one is split
   into SUB x SUB sub-tiles so only the area near the runner is turned into 3D.
   Coordinates in records are tile-local units: 0..4096 across the tile. */
(function (root) {
'use strict';
const Z = 14, EXT = 4096, SUB = 4, VERSION = 5;
const TILEJSON = 'https://tiles.openfreemap.org/planet';

// ---------------------------------------------------------------- tile maths
const lonToX = lon => (lon + 180) / 360 * (1 << Z);
const latToY = lat => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * (1 << Z); };
const xToLon = x => x / (1 << Z) * 360 - 180;
const yToLat = y => { const n = Math.PI - 2 * Math.PI * y / (1 << Z); return 180 / Math.PI * Math.atan(Math.sinh(n)); };
const key = (x, y) => Z + '/' + x + '/' + y;

// ---------------------------------------------------------------- protobuf / MVT decoding
function Reader(buf) { this.b = buf; this.p = 0; }
Reader.prototype.varint = function () {
  let r = 0, s = 0, b;
  do { b = this.b[this.p++]; if (s < 28) r |= (b & 0x7f) << s; else r += (b & 0x7f) * Math.pow(2, s); s += 7; } while (b & 0x80);
  return r >>> 0 === r ? r : r; // may exceed 2^31 for large ids; fine for our use
};
Reader.prototype.skip = function (wt) {
  if (wt === 0) this.varint();
  else if (wt === 1) this.p += 8;
  else if (wt === 2) { const l = this.varint(); this.p += l; }
  else if (wt === 5) this.p += 4;
  else throw new Error('bad wire type ' + wt);
};
const td = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
Reader.prototype.string = function () { const l = this.varint(); const s = td.decode(this.b.subarray(this.p, this.p + l)); this.p += l; return s; };
Reader.prototype.packed = function () {
  const l = this.varint(), end = this.p + l, out = [];
  while (this.p < end) out.push(this.varint());
  return out;
};

function readValue(r, end) {
  let v = null;
  while (r.p < end) {
    const tag = r.varint(), f = tag >> 3, wt = tag & 7;
    if (f === 1) v = r.string();
    else if (f === 2) { v = new DataView(r.b.buffer, r.b.byteOffset + r.p, 4).getFloat32(0, true); r.p += 4; }
    else if (f === 3) { v = new DataView(r.b.buffer, r.b.byteOffset + r.p, 8).getFloat64(0, true); r.p += 8; }
    else if (f === 4 || f === 5) v = r.varint();
    else if (f === 6) { const n = r.varint(); v = (n >>> 1) ^ -(n & 1); }
    else if (f === 7) v = !!r.varint();
    else r.skip(wt);
  }
  return v;
}

// Returns { layerName: { extent, features: [{ type, props, geom }] } } for the wanted layers.
function decode(buf, wanted) {
  const r = new Reader(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
  const layers = {};
  while (r.p < r.b.length) {
    const tag = r.varint();
    if (tag >> 3 !== 3 || (tag & 7) !== 2) { r.skip(tag & 7); continue; }
    const len = r.varint(), end = r.p + len;
    const start = r.p;
    // first pass: name
    let name = null;
    while (r.p < end) { const t = r.varint(); if (t >> 3 === 1) { name = r.string(); break; } r.skip(t & 7); }
    if (!wanted.has(name)) { r.p = end; continue; }
    r.p = start;
    const keys = [], values = [], feats = [];
    let extent = 4096;
    while (r.p < end) {
      const t = r.varint(), f = t >> 3;
      if (f === 1) r.string();
      else if (f === 2) { const l = r.varint(); feats.push([r.p, r.p + l]); r.p += l; }
      else if (f === 3) keys.push(r.string());
      else if (f === 4) { const l = r.varint(); values.push(readValue(r, r.p + l)); }
      else if (f === 5) extent = r.varint();
      else r.skip(t & 7);
    }
    const features = [];
    for (const [fs, fe] of feats) {
      r.p = fs;
      let type = 0, tags = null, geom = null;
      while (r.p < fe) {
        const t = r.varint(), f = t >> 3;
        if (f === 2) tags = r.packed();
        else if (f === 3) type = r.varint();
        else if (f === 4) geom = r.packed();
        else r.skip(t & 7);
      }
      const props = {};
      if (tags) for (let i = 0; i + 1 < tags.length; i += 2) props[keys[tags[i]]] = values[tags[i + 1]];
      features.push({ type, props, geom });
    }
    layers[name] = { extent, features };
    r.p = end;
  }
  return layers;
}

// Geometry -> array of parts; each part is a flat [x,y,...] array (rings are not closed).
function geometry(cmds, scale) {
  const parts = [];
  let x = 0, y = 0, cur = null, i = 0;
  while (i < cmds.length) {
    const c = cmds[i++], id = c & 7, n = c >> 3;
    if (id === 1 || id === 2) {
      for (let k = 0; k < n; k++) {
        const dx = cmds[i++], dy = cmds[i++];
        x += (dx >>> 1) ^ -(dx & 1); y += (dy >>> 1) ^ -(dy & 1);
        if (id === 1) { cur = []; parts.push(cur); }
        cur.push(x * scale, y * scale);
      }
    }
    // ClosePath (7): rings are stored open
  }
  return parts;
}
const ringArea = p => { let a = 0; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += p[j] * p[i + 1] - p[i] * p[j + 1]; return a / 2; };

// Groups polygon rings into [outer, ...holes] (MVT: outer rings have positive area, y down).
function polygons(parts) {
  const polys = [];
  for (const ring of parts) {
    if (ring.length < 6) continue;
    const a = ringArea(ring);
    if (a > 0 || !polys.length) polys.push([ring]);
    else polys[polys.length - 1].push(ring);
  }
  return polys;
}

// Sutherland-Hodgman clip of a flat ring to [x0,x1] x [y0,y1].
function clipRing(pts, x0, y0, x1, y1) {
  let poly = pts;
  const planes = [[0, x0, 1], [0, x1, -1], [1, y0, 1], [1, y1, -1]];
  for (const [ax, v, sd] of planes) {
    const n = poly.length / 2;
    if (n < 3) return null;
    let allIn = true;
    for (let i = 0; i < n; i++) if ((poly[2 * i + ax] - v) * sd < 0) { allIn = false; break; }
    if (allIn) continue;
    const out = [];
    for (let i = 0; i < n; i++) {
      const j = (i + n - 1) % n;
      const cx = poly[2 * i], cy = poly[2 * i + 1], px = poly[2 * j], py = poly[2 * j + 1];
      const cin = ((ax ? cy : cx) - v) * sd >= 0, pin = ((ax ? py : px) - v) * sd >= 0;
      if (cin !== pin) {
        const t = (v - (ax ? py : px)) / ((ax ? cy : cx) - (ax ? py : px));
        out.push(px + t * (cx - px), py + t * (cy - py));
      }
      if (cin) out.push(cx, cy);
    }
    poly = out;
  }
  if (poly.length < 6) return null;
  return poly.map(v => Math.round(v * 10) / 10);
}
function clipPoly(rings, x0, y0, x1, y1) {
  const outer = clipRing(rings[0], x0, y0, x1, y1);
  if (!outer || Math.abs(ringArea(outer)) < 0.5) return null;
  const out = [outer];
  for (let i = 1; i < rings.length; i++) { const h = clipRing(rings[i], x0, y0, x1, y1); if (h) out.push(h); }
  return out;
}

// ---------------------------------------------------------------- tile -> record
const ROAD = { // class -> [type, width, coins allowed]
  motorway: ['motorway', 16, 0], trunk: ['trunk', 14, 0], primary: ['primary', 14, 1], secondary: ['secondary', 12, 1],
  tertiary: ['tertiary', 11, 1], minor: ['residential', 9, 1], service: ['service', 5, 1], track: ['track', 4, 1],
  busway: ['service', 7, 1], bus_guideway: ['service', 6, 0], pier: ['pedestrian', 5, 1],
};
const PATH = { footway: 3, sidewalk: 3, crossing: 3, cycleway: 3, steps: 3, pedestrian: 8, path: 2.5, bridleway: 3, corridor: 0, platform: 0 };
const PARK_KINDS = { grass: 'grass', wood: 'wood', forest: 'wood', park: 'park', garden: 'park', cemetery: 'cemetery',
  pitch: 'pitch', playground: 'playground', nature_reserve: 'wood', scrub: 'wood', farmland: 'grass', meadow: 'grass',
  sand: 'sand', beach: 'sand', golf_course: 'grass', recreation_ground: 'grass', village_green: 'grass', wetland: 'grass', stadium: 'pitch' };
const PAL = {
  house: ['#ddd0b6', '#e8e1d2', '#b98d6b', '#a8644a', '#cbc4ba', '#a9b8bf', '#ece3c9', '#c7b299', '#8f6b55'],
  brick: ['#a0573f', '#8c4a36', '#b5683f', '#9a5a45', '#7d4a3a', '#a86a50'],
  stone: ['#c9b79c', '#d8cfbf', '#b9a58c', '#9c8f80', '#e0d6c4', '#c8bda8', '#a89c8c', '#bfb6a6'],
  glass: ['#7f97ad', '#a9b6c2', '#5d7488', '#c5ced6', '#93a1ab', '#8ea3b5'],
  roof: ['#5d5853', '#4f4a46', '#6b5146', '#575c61', '#7a4e3e', '#3f4246'],
};
function hash(n) { n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
const pick = (a, r) => a[Math.floor(r * a.length) % a.length];
const centroid = p => { let x = 0, y = 0; for (let i = 0; i < p.length; i += 2) { x += p[i]; y += p[i + 1]; } return [x / (p.length / 2), y / (p.length / 2)]; };

// metresPerUnit: ground metres per tile unit (for size-based height guesses)
function process(buf, tx, ty) {
  const L = decode(buf, new Set(['building', 'transportation', 'transportation_name', 'park', 'landcover', 'landuse', 'water', 'housenumber', 'poi']));
  const latMid = yToLat(ty + 0.5);
  const mpu = 40075016.7 * Math.cos(latMid * Math.PI / 180) / (1 << Z) / EXT;
  const S = EXT / SUB;
  const subs = [];
  for (let i = 0; i < SUB * SUB; i++) subs.push({ b: [], r: [], a: [], wa: [], nm: [], hn: [], po: [] });
  const subOf = (x, y) => {
    const i = Math.min(SUB - 1, Math.max(0, Math.floor(x / S))), j = Math.min(SUB - 1, Math.max(0, Math.floor(y / S)));
    return subs[j * SUB + i];
  };
  const inTile = (x, y) => x >= 0 && x < EXT && y >= 0 && y < EXT;
  const each = (name, fn) => { const l = L[name]; if (!l) return; const sc = EXT / l.extent; for (const f of l.features) if (f.geom) fn(f, geometry(f.geom, sc)); };

  // Buildings
  let bid = (tx * 7919 + ty * 104729) | 0;
  each('building', (f, parts) => {
    const pr = f.props;
    if (pr.hide_3d) return;  // outline drawn by its building:parts
    for (const rings of polygons(parts)) {
      bid++;
      const [cx, cy] = centroid(rings[0]);
      if (!inTile(cx, cy)) continue;
      const poly = clipPoly(rings, 0, 0, EXT, EXT);
      if (!poly) continue;
      const areaM = Math.abs(ringArea(poly[0])) * mpu * mpu;
      let h = +pr.render_height || 0, m = +pr.render_min_height || 0;
      const r = hash(bid);
      const guessed = !h || h === 5; // OpenMapTiles uses 5 m when the map has no height
      let house = false;
      if (guessed) {
        if (areaM < 40) h = 3;
        else if (areaM < 260) { h = 6.5 + r * 3; house = true; }
        else if (areaM < 700) h = (2 + Math.floor(r * 3)) * 3.2 + 1;
        else if (areaM < 3000) h = (3 + Math.floor(r * 4)) * 3.2 + 1;
        else h = (2 + Math.floor(r * 4)) * 3.2 + 1;
      }
      if (m >= h) m = 0;
      const rec = { h: Math.round(h * 10) / 10, m: Math.round(m * 10) / 10, p: poly[0] };
      if (poly.length > 1) rec.hs = poly.slice(1);
      let c = pr.colour;
      // OpenMapTiles fills in a light default colour; vary those so streets are not uniform
      if (!c || /^#(f[0-9a-f]){3}$|^#e[0-9a-f]e[0-9a-f]e[0-9a-f]$/i.test(c) || c.toLowerCase() === '#f2eae2' || c.toLowerCase() === '#e0d8d0')
        c = pick(h > 45 ? PAL.glass : house ? PAL.house : (r < 0.45 ? PAL.brick : PAL.stone), hash(bid + 7));
      rec.c = c;
      if (house && poly.length === 1 && poly[0].length === 8 && m === 0) { rec.g = Math.round((2 + r * 1.2) * 10) / 10; rec.r = pick(PAL.roof, hash(bid + 3)); }
      else if (house) rec.r = pick(PAL.roof, hash(bid + 3));
      subOf(cx, cy).b.push(rec);
    }
  });

  // Roads and paths
  each('transportation', (f, parts) => {
    const pr = f.props;
    let type, w, coins;
    if (pr.class === 'path') {
      const sc = pr.subclass || 'path';
      w = PATH[sc] != null ? PATH[sc] : 2.5;
      if (!w) return;
      type = sc === 'pedestrian' ? 'pedestrian' : sc === 'steps' ? 'steps' : sc === 'cycleway' ? 'cycleway' : 'footway';
      coins = 1;
    } else if (ROAD[pr.class]) {
      [type, w, coins] = ROAD[pr.class];
      if (pr.ramp) w = 8;
    } else return;
    const tunnel = pr.brunnel === 'tunnel' || pr.indoor || (+pr.layer || 0) < 0;
    if (tunnel) return;
    if (f.type === 3) { // pedestrian areas
      for (const rings of polygons(parts)) addArea(subs, S, rings, 'plaza');
      return;
    }
    for (const line of parts) splitLine(line, S, subOf, (sub, pts) => {
      const rd = { t: type, w, p: pts };
      if (coins) rd.k = 1;
      if (pr.brunnel === 'bridge') rd.br = 1;
      sub.r.push(rd);
    });
  });

  each('transportation_name', (f, parts) => {
    const name = f.props['name:latin'] || f.props.name;
    if (!name || f.type !== 2) return;
    const car = f.props.class !== 'path';
    for (const line of parts) splitLine(line, S, subOf, (sub, pts) => sub.nm.push({ n: name, c: car ? 1 : 0, p: pts }));
  });

  each('landcover', (f, parts) => { const k = PARK_KINDS[f.props.subclass] || PARK_KINDS[f.props.class]; if (k && f.type === 3) for (const rings of polygons(parts)) addArea(subs, S, rings, k); });
  each('landuse', (f, parts) => { const k = PARK_KINDS[f.props.class]; if (k && f.type === 3) for (const rings of polygons(parts)) addArea(subs, S, rings, k); });
  each('park', (f, parts) => { if (f.type === 3) for (const rings of polygons(parts)) addArea(subs, S, rings, 'park'); });
  each('water', (f, parts) => {
    if (f.type !== 3 || f.props.brunnel === 'tunnel') return;
    for (const rings of polygons(parts)) addArea(subs, S, rings, 'water');
  });
  each('housenumber', (f, parts) => {
    const hn = f.props.housenumber;
    if (!hn) return;
    for (const pt of parts) if (inTile(pt[0], pt[1])) subOf(pt[0], pt[1]).hn.push(Math.round(pt[0] * 10) / 10, Math.round(pt[1] * 10) / 10, String(hn));
  });

  // Named places (cafés, shops, schools...) -> flat [x, y, kind, name, ...] per sub-tile
  each('poi', (f, parts) => {
    const pr = f.props, kind = poiKind(pr.class, pr.subclass);
    if (!kind) return;
    const name = String(pr['name:latin'] || pr.name || '').slice(0, 48);
    if (!name && kind !== 'metro') return;
    for (const pt of parts) if (inTile(pt[0], pt[1])) subOf(pt[0], pt[1]).po.push(Math.round(pt[0]), Math.round(pt[1]), kind, name);
  });

  return { k: key(tx, ty), v: VERSION, x: tx, y: ty, subs };
}

// OpenMapTiles poi class/subclass -> the game's place kinds (null = not used)
const POI_CLASS = {
  cafe: 'cafe', restaurant: 'restaurant', fast_food: 'fastfood', bakery: 'bakery', ice_cream: 'icecream',
  bar: 'lounge', beer: 'lounge', grocery: 'grocery', clothing_store: 'clothes', pharmacy: 'pharmacy',
  school: 'school', college: 'school', kindergarten: 'school', park: 'park', garden: 'park', playground: 'park',
  cinema: 'cinema', theatre: 'cinema', museum: 'museum', hospital: 'clinic', doctors: 'clinic', dentist: 'clinic',
  bank: 'bank', hairdresser: 'salon', bicycle: 'bike', car: 'garage', town_hall: 'community',
  sports_centre: 'gym', fitness_centre: 'gym', stadium: 'stadium', attraction: 'landmark', monument: 'landmark',
  castle: 'landmark', music: 'music', jewelry: 'jewelry', toys: 'toys', pet: 'pet', veterinary: 'pet',
  florist: 'flowers', garden_centre: 'flowers', furniture: 'furniture', laundry: 'laundry', alcohol_shop: null,
};
const SHOP_SUB = {
  convenience: 'grocery', supermarket: 'grocery', greengrocer: 'grocery', deli: 'grocery', butcher: 'grocery',
  florist: 'flowers', garden_centre: 'flowers', books: 'books', electronics: 'tech', mobile_phone: 'tech', computer: 'tech',
  video_games: 'tech', beauty: 'salon', cosmetics: 'salon', hairdresser: 'salon', jewelry: 'jewelry', toys: 'toys',
  pet: 'pet', furniture: 'furniture', interior_decoration: 'furniture', gift: 'gift', shoes: 'clothes', clothes: 'clothes',
  boutique: 'clothes', fashion: 'clothes', sports: 'clothes', bicycle: 'bike', music: 'music', musical_instrument: 'music',
  chocolate: 'bakery', confectionery: 'bakery', pastry: 'bakery', car: 'garage', car_repair: 'garage', hardware: 'hardware',
  doityourself: 'hardware', laundry: 'laundry', dry_cleaning: 'laundry', mall: 'gift', department_store: 'clothes',
};
function poiKind(cls, sub) {
  if (cls === 'shop' || SHOP_SUB[sub] && cls !== 'library') return SHOP_SUB[sub] || null;
  if (cls === 'library') return sub === 'books' ? 'books' : 'library';
  if (cls === 'art_gallery') return sub === 'artwork' ? null : 'museum';
  if (cls === 'bar') return 'lounge';
  if (cls === 'post') return sub === 'post_office' ? 'post' : null;
  if (cls === 'lodging') return sub === 'hotel' ? 'hotel' : null;
  if (cls === 'fuel') return sub === 'fuel' ? 'garage' : null;
  if (cls === 'entrance') return sub === 'subway_entrance' ? 'metro' : null;
  if (cls === 'railway') return sub === 'subway' || sub === 'station' || sub === 'halt' ? 'metro' : null;
  if (cls === 'attraction') return sub === 'viewpoint' || sub === 'attraction' ? 'landmark' : null;
  return POI_CLASS[cls] || null;
}

function addArea(subs, S, rings, kind) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const o = rings[0];
  for (let i = 0; i < o.length; i += 2) { x0 = Math.min(x0, o[i]); x1 = Math.max(x1, o[i]); y0 = Math.min(y0, o[i + 1]); y1 = Math.max(y1, o[i + 1]); }
  const i0 = Math.max(0, Math.floor(x0 / S)), i1 = Math.min(SUB - 1, Math.floor(x1 / S));
  const j0 = Math.max(0, Math.floor(y0 / S)), j1 = Math.min(SUB - 1, Math.floor(y1 / S));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const poly = clipPoly(rings, i * S, j * S, (i + 1) * S, (j + 1) * S);
    if (!poly) continue;
    const rec = { k: kind, p: poly[0] };
    if (poly.length > 1) rec.hs = poly.slice(1);
    (kind === 'water' ? subs[j * SUB + i].wa : subs[j * SUB + i].a).push(rec);
  }
}

// Keeps the segments whose midpoint is inside the tile, grouped into polylines per sub-tile.
function splitLine(line, S, subOf, emit) {
  let cur = null, curSub = null;
  for (let i = 0; i + 3 < line.length; i += 2) {
    const mx = (line[i] + line[i + 2]) / 2, my = (line[i + 1] + line[i + 3]) / 2;
    if (mx < 0 || mx >= EXT || my < 0 || my >= EXT) { cur = null; continue; }
    const sub = subOf(mx, my);
    if (!cur || sub !== curSub) { cur = [line[i], line[i + 1]]; curSub = sub; emit(sub, cur); }
    cur.push(line[i + 2], line[i + 3]);
  }
}

const TileMaker = { Z, EXT, SUB, VERSION, TILEJSON, lonToX, latToY, xToLon, yToLat, key, decode, process, poiKind };
if (typeof module !== 'undefined' && module.exports) module.exports = TileMaker;
else root.TileMaker = TileMaker;
})(typeof window !== 'undefined' ? window : globalThis);
