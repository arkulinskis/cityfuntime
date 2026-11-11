/* City Fun Time: the 3D world. Streams real streets (OpenStreetMap via OpenFreeMap vector tiles, decoded by
   cft-tiles.js) around the player and fills them with life: pedestrians, traffic, pigeons, day and night.
   Grown from City Coin Run's engine. It knows nothing about missions or money: the game (cft-game.js) drives it.

   const W = CFTWorld.create({canvas, quality: 'high'|'low'})
   W.setOrigin(lat, lon)            the world's (0,0); x = east, z = south, metres
   W.frame(dt)                      pump tiles, move the player + life, render
   W.player / W.input / W.cam       the controlled character (game sets W.setRide(spec))
   W.places                         named places from the map: {id, x, z, kind, name, pin:{x,z,yaw}}
   queries: heightAt (building height, 0 = open ground), inside, streetAt, nearestWalk, randomWalkSpot, buildingsNear, wallSpot,
            housenumbersNear, waterNear; terrain: groundAt(x, z) (world y of the ground), surfaceAt (ground or bridge deck),
            elevAt (real metres above sea level, NaN while unknown), terrain()
   builders: person(look), animal(kind), vehicle(kind), label(text, opts), emojiTex(emoji, bg)
   W.drawMinimap(canvas, opts) / W.drawMap(canvas, opts) / W.snapshot(w, h) / W.destroy()

   Hills come from Mapterhorn elevation tiles (Terrarium-encoded WebP, see the terrain section). Every tile, street map or
   hills, is kept in this browser (IndexedDB) and copied to the game's server (window.CFT.tiles.archive), which hands
   it back (CFT.tiles.backup) if a map service stops answering. Without heights for the home spot the world stays flat. */
(function () {
'use strict';

const CELL = 1.5, CH = 32, BUCKET = 25;
const SHOW_R = 600, HIDE_R = 900, LOAD_R = 850;
const GRAV = 26;
const EXAG = 1.5;  // hills are drawn 1.5x taller than real, so gentle slopes still show
const TERRAIN_URL = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp', TZ = 15, TZ_MIN = 8;
const EMOJI_FONT = "'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji','Twemoji Mozilla',sans-serif";

function hash(n) { n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
const signedArea = p => { let a = 0; for (let i = 0, n = p.length / 2; i < n; i++) { const j = (i + 1) % n; a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1]; } return a / 2; };
const reversed = p => { const q = []; for (let i = p.length / 2 - 1; i >= 0; i--) q.push(p[2 * i], p[2 * i + 1]); return q; };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function create(opts) {
  const THREE = window.THREE, TM = window.TileMaker;
  const canvas = opts.canvas;
  const LOW = opts.quality === 'low';
  const GS = LOW ? 8 : 5;  // terrain grid spacing in metres (the ground mesh and groundAt share it)
  const listeners = [];
  const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); listeners.push([el, ev, fn, o]); };

  // ---------------------------------------------------------------- renderer + scene
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOW ? 1 : 1.75));
  renderer.shadowMap.enabled = !LOW;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const skyCol = new THREE.Color(0xaecde9);
  scene.background = skyCol.clone();
  scene.fog = new THREE.Fog(0xaecde9, 120, 600);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 2000);
  const hemi = new THREE.HemisphereLight(0xe4f0ff, 0x6e685d, 0.66);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 0.66);
  sun.castShadow = !LOW;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 1, far: 1400 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(-0.42, 0.78, 0.46).normalize();
  const sunPos = new THREE.Vector3(-0.42, 0.78, 0.46).normalize(); // where the sun is drawn (it sets; sunDir, the light, never goes flat)
  const nightLight = new THREE.PointLight(0xffd9a0, 0, 46, 1.4);    // at night a warm glow walks with you, as if every lamp you pass lit you
  scene.add(nightLight);
  // Far fallback floor, kept below the lowest loaded hill (each sub-tile has its own terrain mesh)
  const GROUND_COL = 0x96938b;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: GROUND_COL }));
  ground.receiveShadow = true;
  scene.add(ground);
  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  // ---------------------------------------------------------------- sky: gradient dome, sun, moon, stars, drifting clouds
  const skyTop = new THREE.Color(0x4f8fe0);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: skyTop }, low: { value: skyCol } },
    vertexShader: 'varying float h; void main() { h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 low; varying float h; void main() { float t = smoothstep(0.02, 0.62, h); gl_FragColor = vec4(mix(low, top, t), 1.0); }',
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1700, 24, 12), skyMat);
  skyDome.renderOrder = -10; skyDome.frustumCulled = false;
  scene.add(skyDome);
  function discTex(inner, outer) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, inner); gr.addColorStop(0.32, inner); gr.addColorStop(0.42, outer); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex('#fffbe6', 'rgba(255,214,120,.55)'), transparent: true, depthWrite: false, fog: false }));
  sunSprite.scale.set(260, 260, 1);
  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex('#f4f6ff', 'rgba(190,205,255,.35)'), transparent: true, depthWrite: false, fog: false }));
  moonSprite.scale.set(150, 150, 1);
  scene.add(sunSprite, moonSprite);
  const starGeo = new THREE.BufferGeometry();
  {
    const sp = [];
    for (let i = 0; i < (LOW ? 220 : 520); i++) {
      const a = hash(i * 3 + 1) * Math.PI * 2, e = 0.08 + hash(i * 3 + 2) * 1.45, r = 1500;
      sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  }
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5, transparent: true, opacity: 0.93, fog: false, depthWrite: false });
  const clouds = [];
  {
    const puff = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < (LOW ? 7 : 16); i++) {
      const g = new THREE.Group(), n = 4 + Math.floor(hash(i * 11 + 5) * 4);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(puff, cloudMat), s = 16 + hash(i * 31 + k * 7) * 22;
        m.scale.set(s * 1.5, s * 0.55, s);
        m.position.set((k - n / 2) * 20 + hash(i + k * 13) * 10, hash(i * 5 + k) * 7, (hash(i * 17 + k * 3) - 0.5) * 26);
        g.add(m);
      }
      g.userData = { x: (hash(i * 7 + 1) - 0.5) * 2200, z: (hash(i * 7 + 2) - 0.5) * 2200, y: 170 + hash(i * 7 + 3) * 130, v: 2.5 + hash(i * 7 + 4) * 3 };
      scene.add(g); clouds.push(g);
    }
  }
  function updateSky(dt) {
    const c = camera.position;
    skyDome.position.copy(c); stars.position.copy(c);
    sunSprite.position.set(c.x + sunPos.x * 1400, c.y + sunPos.y * 1400, c.z + sunPos.z * 1400);
    moonSprite.position.set(c.x - sunPos.x * 1400, c.y + Math.max(0.25, -sunPos.y + 0.5) * 1100, c.z - sunPos.z * 1400);
    for (const g of clouds) {
      const u = g.userData;
      u.x += u.v * dt;
      if (u.x - player.pos.x > 1100) u.x -= 2200; else if (u.x - player.pos.x < -1100) u.x += 2200;
      if (u.z - player.pos.z > 1100) u.z -= 2200; else if (u.z - player.pos.z < -1100) u.z += 2200;
      g.position.set(u.x, u.y, u.z);
    }
  }

  function resize() {
    const r = canvas.getBoundingClientRect(), w = Math.max(1, r.width), h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  on(window, 'resize', resize);

  // ---------------------------------------------------------------- materials, textures
  const cssCtx = document.createElement('canvas').getContext('2d');
  function cssColor(s) {
    if (!s) return null;
    if (/^[0-9a-f]{6}$/i.test(s)) s = '#' + s;
    cssCtx.fillStyle = '#010203'; cssCtx.fillStyle = s;
    return cssCtx.fillStyle === '#010203' ? null : cssCtx.fillStyle;
  }
  // 4x4 windows per texture so night lights can vary window by window
  function windowTextures() {
    const day = document.createElement('canvas'), night = document.createElement('canvas');
    day.width = day.height = night.width = night.height = 256;
    const g = day.getContext('2d'), n = night.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
    n.fillStyle = '#000000'; n.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const x = i * 64, y = j * 64, r = hash(i * 7 + j * 13 + 3);
      g.fillStyle = '#e4e2de'; g.fillRect(x, y + 54, 64, 10);           // floor band
      g.fillStyle = '#f3f1ec'; g.fillRect(x + 11, y + 9, 42, 40);        // frame
      g.fillStyle = '#6f86a6'; g.fillRect(x + 14, y + 12, 36, 34);       // glass
      g.fillStyle = '#a9c0db'; g.fillRect(x + 14, y + 12, 36, 9);        // sky reflection
      g.fillStyle = '#8ea6c4'; g.fillRect(x + 14, y + 21, 14, 25);
      if (r > 0.72) { g.fillStyle = ['#e9c9a8', '#c9d9e9', '#e7b4c0', '#cfe3c0'][(i + j) % 4]; g.fillRect(x + 14, y + 12, 36, 14); } // blinds / curtains
      g.fillStyle = '#f3f1ec'; g.fillRect(x + 31, y + 12, 2, 34); g.fillRect(x + 14, y + 28, 36, 2);
      g.fillStyle = '#d6d2ca'; g.fillRect(x + 9, y + 47, 46, 4);         // sill
      if (r < 0.46) {
        n.fillStyle = r < 0.05 ? '#9fd0ff' : r < 0.09 ? '#ffa8d0' : hash(i + j * 5) < 0.5 ? '#ffd27a' : '#ffe9b0'; // a TV, a neon, lamps
        n.fillRect(x + 14, y + 12, 36, 34);
        n.fillStyle = 'rgba(0,0,0,.35)'; n.fillRect(x + 31, y + 12, 2, 34); n.fillRect(x + 14, y + 28, 36, 2);
      }
    }
    const mk = c => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t; };
    return [mk(day), mk(night)];
  }
  const [winDay, winNight] = windowTextures();
  const FLOOR_H = 3.3, WIN_W = 3.6;
  const MAT = {
    walls: new THREE.MeshLambertMaterial({ map: winDay, emissiveMap: winNight, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true }),
    plain: new THREE.MeshLambertMaterial({ vertexColors: true }),
    terrain: new THREE.MeshLambertMaterial({ color: GROUND_COL }),
    // parks, water, roads draped on the hills: pulled towards the camera so they never flicker into the ground
    drape: new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    trunk: new THREE.MeshLambertMaterial({ color: 0x6b4f37 }),
    crown: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    vc: new THREE.MeshLambertMaterial({ vertexColors: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    bulb: new THREE.MeshBasicMaterial({ color: 0x9a9a8c }),          // street-lamp heads: grey by day, warm at night (setClock)
    pool: new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    signal: new THREE.MeshBasicMaterial({ color: 0xffffff }),        // traffic-light lamps, coloured per instance
    // instanced street furniture has its own materials: three r149 keeps one shader per material, so a material
    // shared by tinted and untinted instances would draw every parked car white
    prop: new THREE.MeshLambertMaterial({ vertexColors: true }),
    tint: new THREE.MeshLambertMaterial({ vertexColors: true }),
  };
  const TRUNK_G = new THREE.CylinderGeometry(0.14, 0.2, 2.6, 6).translate(0, 1.3, 0);
  const CROWN_G = new THREE.IcosahedronGeometry(1.7, 0).translate(0, 3.9, 0);
  const CAR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service', 'track']);
  const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary']);
  const ROAD_STYLE = {
    car: { col: new THREE.Color(0x46484d), y: 0.08 }, service: { col: new THREE.Color(0x56585c), y: 0.075 },
    pedestrian: { col: new THREE.Color(0xc4baa6), y: 0.065 }, footway: { col: new THREE.Color(0xbab5ab), y: 0.05 },
    steps: { col: new THREE.Color(0xa69d8f), y: 0.055 }, cycleway: { col: new THREE.Color(0x6e7c74), y: 0.06 },
  };
  const roadStyle = t => (t === 'service' || t === 'track') ? ROAD_STYLE.service : CAR.has(t) ? ROAD_STYLE.car : (ROAD_STYLE[t] || ROAD_STYLE.footway);
  const AREA = {
    plaza: [0xb9b2a4, 0.012, '#d9d3c6'], grass: [0x76a457, 0.018, '#bfe0a6'], cemetery: [0x7f9f6a, 0.018, '#c4dcb4'],
    park: [0x6c9a4e, 0.024, '#b4d89b'], wood: [0x4f7f3a, 0.03, '#9cc988'], pitch: [0x5f9e48, 0.036, '#a9d68f'],
    playground: [0xc4a679, 0.036, '#e5d4b3'], sand: [0xd8c9a0, 0.036, '#efe4c4'], water: [0x4f8fbf, 0.045, '#9fcff0'],
  };

  // Merges coloured primitives into one vertex-coloured geometry (people, cars, props).
  const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  class Merge {
    constructor() { this.p = []; this.n = []; this.c = []; }
    add(geo, color, x, y, z, rx, ry, rz, sx, sy, sz) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      _m4.compose(_v.set(x || 0, y || 0, z || 0), _q.setFromEuler(_e.set(rx || 0, ry || 0, rz || 0)), _s.set(sx || 1, sy || 1, sz || 1));
      const nm = new THREE.Matrix3().getNormalMatrix(_m4);
      const P = g.attributes.position, N = g.attributes.normal;
      _c.set(color);
      const pv = new THREE.Vector3(), nv = new THREE.Vector3();
      for (let i = 0; i < P.count; i++) {
        pv.fromBufferAttribute(P, i).applyMatrix4(_m4); nv.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
        this.p.push(pv.x, pv.y, pv.z); this.n.push(nv.x, nv.y, nv.z); this.c.push(_c.r, _c.g, _c.b);
      }
      return this;
    }
    box(w, h, d, color, x, y, z, rx, ry, rz) { return this.add(UNIT_BOX, color, x, y, z, rx, ry, rz, w, h, d); }
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.computeBoundingSphere();
      return g;
    }
    mesh(mat) { const m = new THREE.Mesh(this.build(), mat || MAT.vc); m.castShadow = !LOW; return m; }
  }
  const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 12).toNonIndexed();
  const SPHERE = new THREE.IcosahedronGeometry(0.5, 1).toNonIndexed();
  const CONE = new THREE.ConeGeometry(0.5, 1, 10).toNonIndexed();
  const CYL8 = new THREE.CylinderGeometry(0.5, 0.5, 1, 8).toNonIndexed(), CYL6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6).toNonIndexed(); // poles and parked cars' wheels: there are thousands

  // ---------------------------------------------------------------- street furniture: shared shapes, drawn as instances per sub-tile
  // Everything faces -z (a lamp's arm, a bench's seat, a parked car's nose). SHARED geometries are never disposed with a sub-tile.
  const SHARED = new Set([TRUNK_G, CROWN_G]);
  const shared = g => { SHARED.add(g); return g; };
  const propGeo = fn => { const m = new Merge(); fn(m); return shared(m.build()); };
  const PROP = {
    lamp: propGeo(m => { m.add(CYL6, 0x3a3f4a, 0, 2.7, 0, 0, 0, 0, 0.15, 5.4, 0.15); m.add(CYL6, 0x2a2e37, 0, 0.18, 0, 0, 0, 0, 0.34, 0.36, 0.34); m.box(0.1, 0.1, 1.5, 0x3a3f4a, 0, 5.36, -0.7); m.box(0.4, 0.14, 0.66, 0x2a2e37, 0, 5.32, -1.35); }),
    bulb: shared(new THREE.BoxGeometry(0.3, 0.08, 0.54).translate(0, 5.22, -1.35)),
    pool: shared(new THREE.CircleGeometry(5.5, 18).rotateX(-Math.PI / 2).translate(0, 0.16, -1.35)),
    bench: propGeo(m => { m.box(1.7, 0.08, 0.5, 0x9a6a3c, 0, 0.48, 0); m.box(1.7, 0.5, 0.07, 0x9a6a3c, 0, 0.82, 0.24, -0.15); m.box(0.08, 0.48, 0.5, 0x33373f, -0.75, 0.24, 0); m.box(0.08, 0.48, 0.5, 0x33373f, 0.75, 0.24, 0); }),
    hydrant: propGeo(m => { m.add(CYL8, 0xe23b2e, 0, 0.36, 0, 0, 0, 0, 0.3, 0.72, 0.3); m.box(0.24, 0.16, 0.24, 0xe23b2e, 0, 0.8, 0); m.add(CYL6, 0xf2b134, 0, 0.5, 0, 0, 0, Math.PI / 2, 0.16, 0.5, 0.16); m.add(CYL8, 0xc22d22, 0, 0.05, 0, 0, 0, 0, 0.4, 0.1, 0.4); }),
    bin: propGeo(m => { m.add(CYL8, 0x2f8f5b, 0, 0.5, 0, 0, 0, 0, 0.56, 1.0, 0.56); m.add(CYL8, 0x226b44, 0, 1.03, 0, 0, 0, 0, 0.62, 0.08, 0.62); m.box(0.36, 0.12, 0.04, 0x1f1a3d, 0, 0.8, -0.28); }),
    box: propGeo(m => { m.box(0.5, 0.95, 0.44, 0x2b6cb0, 0, 0.62, 0); m.add(CYL8, 0x2b6cb0, 0, 1.08, 0, 0, 0, Math.PI / 2, 0.44, 0.5, 0.44); m.box(0.07, 0.3, 0.07, 0x33373f, -0.18, 0.15, 0); m.box(0.07, 0.3, 0.07, 0x33373f, 0.18, 0.15, 0); m.box(0.3, 0.05, 0.02, 0xf4f1ea, 0, 0.95, -0.23); }),
    // parked cars are white where the paint goes: each instance tints its own (glass and tyres are dark, so they stay dark)
    car: propGeo(m => carBody(m, 3.9, 1.75, 0.75, 0.62, 2.15, 0.15, 0xffffff)),
    van: propGeo(m => carBody(m, 4.5, 1.9, 1.0, 0.8, 3.0, 0.45, 0xffffff)),
    sigPole: propGeo(m => { m.add(CYL, 0x33373f, 0, 2.0, 0, 0, 0, 0, 0.18, 4.0, 0.18); m.box(0.54, 1.56, 0.36, 0x1f2229, 0, 4.2, 0); m.box(0.7, 0.08, 0.5, 0xf2b134, 0, 5.02, 0); m.add(CYL, 0x1f2229, 0, 0.14, 0, 0, 0, 0, 0.44, 0.28, 0.44); }),
    sigLamp: shared(new THREE.SphereGeometry(0.19, 10, 8)),
  };
  function carBody(m, L, Wd, H, cabH, cabL, cabZ, col) {
    const dark = 0x222428, glass = 0x2d3d52, base = 0.32;
    m.box(Wd, H, L, col, 0, base + H / 2, 0);
    m.box(Wd * 0.88, cabH, cabL, glass, 0, base + H + cabH / 2, cabZ);
    m.box(Wd * 0.9, 0.06, cabL * 0.9, col, 0, base + H + cabH + 0.03, cabZ);
    for (const [x, z] of [[-Wd / 2, -L * 0.33], [Wd / 2, -L * 0.33], [-Wd / 2, L * 0.33], [Wd / 2, L * 0.33]]) m.add(CYL6, dark, x, 0.34, z, 0, 0, Math.PI / 2, 0.68, 0.26, 0.68);
  }
  const CULL = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 420), cullGeos = new Map();
  function cullGeo(g) {
    let c = cullGeos.get(g);
    if (!c) {
      c = new THREE.BufferGeometry();
      for (const k of Object.keys(g.attributes)) c.setAttribute(k, g.attributes[k]);
      if (g.index) c.setIndex(g.index);
      c.boundingSphere = CULL;
      cullGeos.set(g, shared(c));
    }
    return c;
  }
  const CAR_TINT = [0xe8453c, 0x2b6cb0, 0xf4f1ea, 0x3a4150, 0xf2b134, 0x3aa6b9, 0xb9c0c8, 0x2f9e6e, 0x7b52c7, 0xff8a3d, 0xef6aa5, 0x8a5a2b];
  const BIG = new Set(['tertiary', 'secondary', 'primary', 'trunk']);

  // ---------------------------------------------------------------- flat-shaded city geometry
  class Geo {
    constructor(withUV) { this.p = []; this.n = []; this.c = []; this.uv = withUV ? [] : null; }
    vert(x, y, z, nx, ny, nz, col, u, v) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col.r, col.g, col.b); if (this.uv) this.uv.push(u, v); }
    flat(ax, az, bx, bz, cx, cz, y, col, down) {
      const up = (bz - az) * (cx - ax) - (bx - ax) * (cz - az) > 0;
      if (up === !!down) { let t = bx; bx = cx; cx = t; t = bz; bz = cz; cz = t; }
      const ny = down ? -1 : 1;
      this.vert(ax, y, az, 0, ny, 0, col, 0, 0); this.vert(bx, y, bz, 0, ny, 0, col, 0, 0); this.vert(cx, y, cz, 0, ny, 0, col, 0, 0);
    }
    quadFlat(x1, z1, x2, z2, x3, z3, x4, z4, y, col) { this.flat(x1, z1, x2, z2, x3, z3, y, col); this.flat(x1, z1, x3, z3, x4, z4, y, col); }
    tri(a, b, c, col, rx, ry, rz) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      if (nx * rx + ny * ry + nz * rz < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
      this.vert(a[0], a[1], a[2], nx, ny, nz, col, 0, 0); this.vert(b[0], b[1], b[2], nx, ny, nz, col, 0, 0); this.vert(c[0], c[1], c[2], nx, ny, nz, col, 0, 0);
    }
    polygon(outer, holes, y, col, down) {
      const toV = p => { const a = []; for (let i = 0; i < p.length; i += 2) a.push(new THREE.Vector2(p[i], p[i + 1])); return a; };
      const contour = toV(outer);
      if (contour.length < 3) return;
      const hv = (holes || []).map(toV).filter(h => h.length >= 3);
      let tris;
      try { tris = THREE.ShapeUtils.triangulateShape(contour, hv); } catch (e) { return; }
      const all = contour.concat(...hv);
      for (const t of tris) { const a = all[t[0]], b = all[t[1]], c = all[t[2]]; if (a && b && c) this.flat(a.x, a.y, b.x, b.y, c.x, c.y, y, col, down); }
    }
    // Draped on the hills: hf(x, z) gives the surface height (groundAt, or a bridge deck), lift raises the layer above it.
    // Triangles longer than maxE are split so they follow the slope.
    dvert(x, z, hf, lift, col) {
      if (hf === groundAt) { const y = groundFace(x, z) + lift; this.vert(x, y, z, _n[0], _n[1], _n[2], col, 0, 0); }
      else this.vert(x, hf(x, z) + lift, z, 0, 1, 0, col, 0, 0);
    }
    dtri(ax, az, bx, bz, cx, cz, hf, lift, col, maxE) {
      if (maxE) {
        const ab = Math.hypot(bx - ax, bz - az), bc = Math.hypot(cx - bx, cz - bz), ca = Math.hypot(ax - cx, az - cz), m = Math.max(ab, bc, ca);
        if (m > maxE) {
          if (m === ab) { const mx = (ax + bx) / 2, mz = (az + bz) / 2; this.dtri(ax, az, mx, mz, cx, cz, hf, lift, col, maxE); this.dtri(mx, mz, bx, bz, cx, cz, hf, lift, col, maxE); }
          else if (m === bc) { const mx = (bx + cx) / 2, mz = (bz + cz) / 2; this.dtri(ax, az, bx, bz, mx, mz, hf, lift, col, maxE); this.dtri(ax, az, mx, mz, cx, cz, hf, lift, col, maxE); }
          else { const mx = (cx + ax) / 2, mz = (cz + az) / 2; this.dtri(ax, az, bx, bz, mx, mz, hf, lift, col, maxE); this.dtri(mx, mz, bx, bz, cx, cz, hf, lift, col, maxE); }
          return;
        }
      }
      if ((bz - az) * (cx - ax) - (bx - ax) * (cz - az) <= 0) { let t = bx; bx = cx; cx = t; t = bz; bz = cz; cz = t; }
      this.dvert(ax, az, hf, lift, col); this.dvert(bx, bz, hf, lift, col); this.dvert(cx, cz, hf, lift, col);
    }
    dquad(x1, z1, x2, z2, x3, z3, x4, z4, hf, lift, col) { this.dtri(x1, z1, x2, z2, x3, z3, hf, lift, col); this.dtri(x1, z1, x3, z3, x4, z4, hf, lift, col); }
    dpolygon(outer, holes, hf, lift, col, maxE) {
      const toV = p => { const a = []; for (let i = 0; i < p.length; i += 2) a.push(new THREE.Vector2(p[i], p[i + 1])); return a; };
      const contour = toV(outer);
      if (contour.length < 3) return;
      const hv = (holes || []).map(toV).filter(h => h.length >= 3);
      let tris;
      try { tris = THREE.ShapeUtils.triangulateShape(contour, hv); } catch (e) { return; }
      const all = contour.concat(...hv);
      for (const t of tris) { const a = all[t[0]], b = all[t[1]], c = all[t[2]]; if (a && b && c) this.dtri(a.x, a.y, b.x, b.y, c.x, c.y, hf, lift, col, maxE); }
    }
    get empty() { return this.p.length === 0; }
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.computeBoundingSphere();
      return g;
    }
  }

  // ---------------------------------------------------------------- state
  const W = { THREE, scene, camera, renderer, places: [], placeIds: new Set(), onPlace: null };
  let origin = null, gen = 0;
  const tiles = new Map();
  let allSubs = [], inflight = 0;
  const buckets = new Map(), nameBuckets = new Map(), hchunks = new Map(), rchunks = new Map(), segBuckets = new Map(), bridgeBuckets = new Map();
  const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), vy: 0, grounded: true, face: 0, phase: 0, speed: 0, heading: 0, moved: 0, footMoved: 0, slope: 0, pitch: 0 };
  const cam = { yaw: 0, pitch: 0.32, dist: 7.5, cur: 7.5, lookT: 0, shake: 0 };
  const input = { f: 0, b: 0, l: 0, r: 0, sprint: false, jump: false, jx: 0, jy: 0 };
  let ride = { mode: 'foot', walk: 6.2, run: 12.5, jump: 8.5, radius: 0.4, kind: null };
  W.player = player; W.cam = cam; W.input = input; W.controls = { enabled: true, look: true };
  W.TOUCH = matchMedia('(pointer: coarse)').matches;

  // ---------------------------------------------------------------- tile sources (IndexedDB cache, then OpenFreeMap / Mapterhorn,
  // then the game server's backup copy). Keys: street tiles '14/x/y' (IndexedDB) = 'v/14/x/y' (server); hills 't/z/x/y'.
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise(res => {
      try {
        const r = indexedDB.open('cityfuntime', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('tiles');
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(null);
      } catch (e) { res(null); }
    });
    return dbp;
  }
  async function idb(mode, k, v) {
    const d = await db();
    if (!d) return null;
    return new Promise(res => {
      try {
        const st = d.transaction('tiles', mode).objectStore('tiles');
        const q = mode === 'readonly' ? st.get(k) : st.put(v, k);
        q.onsuccess = () => res(q.result || null);
        q.onerror = () => res(null);
      } catch (e) { res(null); }
    });
  }
  let urlPromise = null;
  function tileUrl() {
    if (!urlPromise) urlPromise = (async () => {
      let cached = null;
      try { cached = JSON.parse(localStorage.getItem('cityfuntime.tileurl') || 'null'); } catch (e) { /* ignore */ }
      if (cached && Date.now() - cached.t < 86400000) return cached.u;
      try {
        const j = await (await fetch(TM.TILEJSON)).json();
        try { localStorage.setItem('cityfuntime.tileurl', JSON.stringify({ u: j.tiles[0], t: Date.now() })); } catch (e) { /* private mode */ }
        return j.tiles[0];
      } catch (e) {
        urlPromise = null;
        if (cached) return cached.u;
        throw new Error('cannot reach the map server');
      }
    })();
    return urlPromise;
  }
  function fetchT(url, ms) { // fetch that gives up after ms (a hanging map server must not freeze the loading screen)
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tm = ctl ? setTimeout(() => ctl.abort(), ms || 10000) : null;
    return fetch(url, ctl ? { signal: ctl.signal } : {}).finally(() => clearTimeout(tm));
  }
  // Upstream first; if it can't be reached, the server's copy. Resolves to an ArrayBuffer (empty = no tile there).
  async function fetchTile(akey, url) {
    try {
      const res = await fetchT(await url());
      if (res.status === 404 || res.status === 204) return { buf: new ArrayBuffer(0), up: true };
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return { buf: await res.arrayBuffer(), up: true };
    } catch (err) {
      const b = await fromBackup(akey);
      if (b === undefined) throw err;
      return { buf: b || new ArrayBuffer(0), up: false };
    }
  }
  async function tileBuffer(x, y) {
    const k = TM.key(x, y), ak = 'v/' + k;
    const hit = await idb('readonly', k);
    if (hit) { queueArchive(ak); return hit; }
    const r = await fetchTile(ak, async () => (await tileUrl()).replace('{z}', TM.Z).replace('{x}', x).replace('{y}', y));
    idb('readwrite', k, r.buf);
    if (r.up) queueArchive(ak);
    return r.buf;
  }

  // The server's backup copy (window.CFT.tiles, set up by the page). undefined = not there, null = "no tile here".
  const b64buf = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  async function fromBackup(key) {
    const hooks = window.CFT && window.CFT.tiles;
    if (!hooks) return undefined;
    try {
      const r = await hooks.backup(key);
      if (!r || !r.found) return undefined;
      return r.missing ? null : b64buf(r.data);
    } catch (e) { return undefined; }
  }
  // Tiles this player loaded get copied to the server in small batches (it fetches them itself and keeps them).
  const ARCH_KEY = 'cityfuntime.archived', archQueue = new Set();
  let archived = null, archTimer = null, archFull = false;
  function archivedSet() {
    if (!archived) { try { archived = new Set(JSON.parse(localStorage.getItem(ARCH_KEY) || '[]')); } catch (e) { archived = new Set(); } }
    return archived;
  }
  function queueArchive(key) {
    if (archFull || !(window.CFT && window.CFT.tiles) || archivedSet().has(key)) return;
    archQueue.add(key);
    if (!archTimer) archTimer = setTimeout(flushArchive, 4000);
  }
  async function flushArchive() {
    archTimer = null;
    const hooks = window.CFT && window.CFT.tiles, keys = [...archQueue].slice(0, 8);
    keys.forEach(k => archQueue.delete(k));
    if (!hooks || !keys.length) return;
    try {
      const r = await hooks.archive(keys);
      if (r && r.full) archFull = true;
      const set = archivedSet();
      for (const k of (r && r.have) || []) set.add(k);
      try { localStorage.setItem(ARCH_KEY, JSON.stringify([...set].slice(-6000))); } catch (e) { /* private mode */ }
    } catch (e) { /* best effort: tried again next session */ }
    if (archQueue.size && !archFull && !destroyed) archTimer = setTimeout(flushArchive, 1500);
  }
  let destroyed = false;

  // ---------------------------------------------------------------- terrain (Mapterhorn elevation tiles)
  // Terrarium WebP, 512 px: metres = R * 256 + G + B / 256 - 32768. Zoom 15 (about 1.7 m a pixel) where the country
  // has detailed data, else the best lower zoom (404 -> parent tile). Decoded to 256 x 256 (2 x 2 averages).
  // Ground height = (elevation - elevation at home) x EXAG, on a GS-metre grid of triangles (the same ones the
  // terrain meshes use, so things placed with groundAt sit exactly on the drawn ground).
  const terr = { h0: null, off: false, tiles: new Map(), src: new Map(), inflight: 0, minY: 0, homeKey: '', hx: 0, hy: 0 };
  const nodes = new Map();
  const to15 = (x, z) => [(origin.gx0 + x / origin.M) * 2, (origin.gy0 + z / origin.M) * 2];
  async function terrainBuffer(z, x, y) { // ArrayBuffer, or null when there is no tile at this zoom
    const k = 't/' + z + '/' + x + '/' + y;
    const hit = await idb('readonly', k);
    if (hit) { queueArchive(k); return hit.byteLength ? hit : null; }
    const r = await fetchTile(k, async () => TERRAIN_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y));
    idb('readwrite', k, r.buf);
    if (r.up) queueArchive(k);
    return r.buf.byteLength ? r.buf : null;
  }
  async function decodeTerrain(buf) {
    const blob = new Blob([buf], { type: 'image/webp' });
    let img;
    try { img = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); }
    catch (e) {
      const url = URL.createObjectURL(blob);
      try { img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('bad terrain image')); im.src = url; }); }
      finally { URL.revokeObjectURL(url); }
    }
    const N = img.width, c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    if (img.close) img.close();
    const d = g.getImageData(0, 0, N, N).data, n = N >> 1, h = new Float32Array(n * n);
    const px = o => d[o] * 256 + d[o + 1] + d[o + 2] / 256 - 32768;
    let mn = Infinity;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const o = (2 * j * N + 2 * i) * 4, v = (px(o) + px(o + 4) + px(o + N * 4) + px(o + N * 4 + 4)) / 4;
      h[j * n + i] = v; if (v < mn) mn = v;
    }
    return { h, n, min: mn };
  }
  function terrainSource(z, x, y) { // the best tile covering z/x/y: {h, n, min, z, x, y} or null (no heights at all)
    const k = z + '/' + x + '/' + y;
    let p = terr.src.get(k);
    if (!p) {
      p = (async () => {
        const buf = await terrainBuffer(z, x, y);
        if (buf) return Object.assign(await decodeTerrain(buf), { z, x, y });
        return z > TZ_MIN ? terrainSource(z - 1, x >> 1, y >> 1) : null;
      })();
      p.catch(() => terr.src.delete(k));
      terr.src.set(k, p);
    }
    return p;
  }
  function requestTerrain(tx, ty) {
    const k = tx + '/' + ty, g = gen, old = terr.tiles.get(k);
    const t = { k, tx, ty, state: 'loading', src: null, tries: old ? old.tries : 0 };
    terr.tiles.set(k, t);
    terr.inflight++;
    terrainSource(TZ, tx, ty).then(src => {
      if (g !== gen) return;
      t.src = src; t.state = src ? 'ready' : 'flat';
      onTerrain(t);
    }).catch(err => {
      if (g !== gen) return;
      console.warn('terrain', k, err);
      t.tries++;
      if (t.tries >= 2) { t.state = 'flat'; onTerrain(t); } // give up: this square stays at home height
      else { t.state = 'error'; t.retryAt = performance.now() + 2500; }
    }).finally(() => { if (g === gen) terr.inflight--; });
  }
  function onTerrain(t) {
    if (terr.h0 == null && !terr.off && t.k === terr.homeKey) {
      if (t.state === 'ready') { terr.h0 = sampleRaw(t, terr.hx, terr.hy); for (const q of terr.tiles.values()) lowest(q); }
      else terr.off = true; // no heights for home: the whole world stays flat
    } else lowest(t);
  }
  function lowest(t) { if (t.state === 'ready' && terr.h0 != null) terr.minY = Math.min(terr.minY, (t.src.min - terr.h0) * EXAG); }
  function sampleRaw(t, gx, gy) { // bilinear, in metres; gx, gy are zoom-15 tile coordinates
    const s = t.src, f = Math.pow(2, TZ - s.z), n = s.n;
    let u = (gx / f - s.x) * n - 0.5, v = (gy / f - s.y) * n - 0.5;
    u = u < 0 ? 0 : u > n - 1.001 ? n - 1.001 : u; v = v < 0 ? 0 : v > n - 1.001 ? n - 1.001 : v;
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, h = s.h, o = j * n + i;
    return (h[o] * (1 - fu) + h[o + 1] * fu) * (1 - fv) + (h[o + n] * (1 - fu) + h[o + n + 1] * fu) * fv;
  }
  function elevAt(x, z) { // real metres above sea level, NaN while unknown
    if (!origin) return NaN;
    const [gx, gy] = to15(x, z), t = terr.tiles.get(Math.floor(gx) + '/' + Math.floor(gy));
    if (!t) return NaN;
    if (t.state === 'ready') return sampleRaw(t, gx, gy);
    return t.state === 'flat' && terr.h0 != null ? terr.h0 : NaN;
  }
  function node(i, j) { // ground height at grid node (i, j), cached once known
    const k = ckey(i, j), idx = (j - Math.floor(j / CH) * CH) * CH + (i - Math.floor(i / CH) * CH);
    let a = nodes.get(k);
    if (a && a[idx] === a[idx]) return a[idx];
    const e = elevAt(i * GS, j * GS);
    if (e !== e) return 0;
    if (!a) { a = new Float32Array(CH * CH).fill(NaN); nodes.set(k, a); }
    return (a[idx] = (e - terr.h0) * EXAG);
  }
  function groundAt(x, z) {
    if (terr.h0 == null) return 0;
    const fx = x / GS, fz = z / GS, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = node(i, j), d = node(i + 1, j + 1);
    if (u >= v) { const b = node(i + 1, j); return a + u * (b - a) + v * (d - b); }
    const c = node(i, j + 1);
    return a + v * (c - a) + u * (d - c);
  }
  const _n = [0, 1, 0];
  // groundAt plus the slope of that triangle in _n (one lookup for draped geometry)
  function groundFace(x, z) {
    if (terr.h0 == null) { _n[0] = 0; _n[1] = 1; _n[2] = 0; return 0; }
    const fx = x / GS, fz = z / GS, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = node(i, j), d = node(i + 1, j + 1);
    let h, sx, sz;
    if (u >= v) { const b = node(i + 1, j); h = a + u * (b - a) + v * (d - b); sx = b - a; sz = d - b; }
    else { const c = node(i, j + 1); h = a + v * (c - a) + u * (d - c); sx = d - c; sz = c - a; }
    const l = Math.hypot(sx, GS, sz);
    _n[0] = -sx / l; _n[1] = GS / l; _n[2] = -sz / l;
    return h;
  }
  function normalAt(x, z) {
    if (terr.h0 == null) { _n[0] = 0; _n[1] = 1; _n[2] = 0; return _n; }
    const dx = groundAt(x - GS, z) - groundAt(x + GS, z), dz = groundAt(x, z - GS) - groundAt(x, z + GS), l = Math.hypot(dx, 2 * GS, dz);
    _n[0] = dx / l; _n[1] = 2 * GS / l; _n[2] = dz / l;
    return _n;
  }
  // Bridges keep a straight deck between their two ends instead of dipping into the valley.
  function deckFn(rd) {
    const e = rd.be;
    if (!e) return groundAt;
    return (x, z) => {
      const dx = e[2] - e[0], dz = e[3] - e[1], L2 = dx * dx + dz * dz || 1;
      let t = ((x - e[0]) * dx + (z - e[1]) * dz) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const g1 = groundAt(e[0], e[1]);
      return Math.max(g1 + (groundAt(e[2], e[3]) - g1) * t, groundAt(x, z));
    };
  }
  function deckAt(x, z) { // NaN when (x, z) is not on a bridge
    const list = bridgeBuckets.get(bkey(x, z));
    if (!list) return NaN;
    let best = NaN;
    for (const b of list) {
      const dx = b.x2 - b.x1, dz = b.z2 - b.z1, L = dx * dx + dz * dz;
      let t = L > 0 ? ((x - b.x1) * dx + (z - b.z1) * dz) / L : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (Math.hypot(x - b.x1 - t * dx, z - b.z1 - t * dz) > b.hw + 0.4) continue;
      const y = b.fn(x, z);
      if (!(y <= best)) best = y;
    }
    return best;
  }
  // The ground, or a bridge deck when you're on it (y = your height: under a bridge you stay on the ground).
  function surfaceAt(x, z, y) {
    const g = groundAt(x, z);
    if (!bridgeBuckets.size) return g;
    const d = deckAt(x, z);
    return d > g + 0.25 && (y == null || y > d - 1.6) ? d : g;
  }
  // Every hills tile under this sub-tile is loaded (or given up). With fetch, the missing ones are requested:
  // a sub-tile reaches further than the prefetch radius (it's built when its nearest edge is within SHOW_R).
  function terrainReady(s, fetch) {
    if (terr.off) return true;
    let ok = terr.h0 != null;
    const a = to15(s.x0 - 2 * GS, s.z0 - 2 * GS), b = to15(s.x1 + 2 * GS, s.z1 + 2 * GS), now = performance.now();
    for (let tx = Math.floor(a[0]); tx <= Math.floor(b[0]); tx++) for (let ty = Math.floor(a[1]); ty <= Math.floor(b[1]); ty++) {
      const t = terr.tiles.get(tx + '/' + ty);
      if (t && (t.state === 'ready' || t.state === 'flat')) continue;
      ok = false;
      if (fetch && terr.inflight < 6 && (!t || (t.state === 'error' && now > t.retryAt))) requestTerrain(tx, ty);
    }
    return ok;
  }
  function pumpTerrain(px, pz) {
    if (terr.off) return;
    const M15 = origin.M / 2, [gx, gy] = to15(px, pz), r = LOAD_R / M15, now = performance.now(), want = [];
    for (let x = Math.floor(gx - r); x <= Math.floor(gx + r); x++) for (let y = Math.floor(gy - r); y <= Math.floor(gy + r); y++) {
      const d = M15 * Math.hypot(Math.max(x - gx, 0, gx - x - 1), Math.max(y - gy, 0, gy - y - 1));
      if (d <= LOAD_R) want.push([d, x, y]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, x, y] of want) {
      if (terr.inflight >= 4) break;
      const t = terr.tiles.get(x + '/' + y);
      if (!t || (t.state === 'error' && now > t.retryAt)) requestTerrain(x, y);
    }
    // forget decoded tiles far away (their grid heights stay cached; they reload from this browser if needed)
    if (terr.tiles.size > 40) for (const t of terr.tiles.values()) {
      if (t.state !== 'ready' || t.k === terr.homeKey) continue;
      if (M15 * Math.hypot(t.tx + 0.5 - gx, t.ty + 0.5 - gy) > 3000) { terr.tiles.delete(t.k); terr.src.delete(TZ + '/' + t.tx + '/' + t.ty); }
    }
  }

  // ---------------------------------------------------------------- tile streaming
  function requestTile(x, y) {
    const k = TM.key(x, y), g = gen;
    const M = origin.M, ox = (x - origin.gx0) * M, oz = (y - origin.gy0) * M;
    const t = { k, x, y, state: 'loading', ox, oz, s: M / TM.EXT, subs: [], tries: (tiles.get(k) || {}).tries || 0 };
    tiles.set(k, t);
    inflight++;
    tileBuffer(x, y).then(buf => {
      if (g !== gen) return;
      const rec = TM.process(buf, x, y);
      const n = TM.SUB, w = M / n;
      t.subs = rec.subs.map((r, i) => ({ tile: t, idx: i, rec: r, x0: ox + (i % n) * w, z0: oz + Math.floor(i / n) * w,
        x1: ox + (i % n + 1) * w, z1: oz + (Math.floor(i / n) + 1) * w, reg: false, group: null }));
      allSubs.push(...t.subs);
      t.state = 'ready';
    }).catch(err => {
      if (g !== gen) return;
      console.warn('tile', k, err);
      t.state = 'error'; t.tries++;
      t.retryAt = performance.now() + Math.min(30000, 3000 * t.tries);
    }).finally(() => { if (g === gen) inflight--; });
  }
  const rectDist = (s, x, z) => Math.hypot(Math.max(s.x0 - x, 0, x - s.x1), Math.max(s.z0 - z, 0, z - s.z1));
  let busy = false;
  function pumpTiles(px, pz, budget) {
    const M = origin.M, gx = origin.gx0 + px / M, gy = origin.gy0 + pz / M, rt = LOAD_R / M;
    const want = [];
    for (let x = Math.floor(gx - rt); x <= Math.floor(gx + rt); x++) for (let y = Math.floor(gy - rt); y <= Math.floor(gy + rt); y++) {
      const d = M * Math.hypot(Math.max(x - gx, 0, gx - x - 1), Math.max(y - gy, 0, gy - y - 1));
      if (d <= LOAD_R) want.push([d, x, y]);
    }
    want.sort((a, b) => a[0] - b[0]);
    const now = performance.now();
    for (const [, x, y] of want) {
      if (inflight >= 3) break;
      const t = tiles.get(TM.key(x, y));
      if (!t || (t.state === 'error' && now > t.retryAt)) requestTile(x, y);
    }
    pumpTerrain(px, pz);
    ground.position.y = terr.minY - 1.5;
    const t0 = performance.now();
    const near = allSubs.map(s => [rectDist(s, px, pz), s]).sort((a, b) => a[0] - b[0]);
    for (const [d, s] of near) {
      if (d < SHOW_R) {
        if (performance.now() - t0 > budget) continue;
        if (!s.reg) registerSub(s);
        if (!s.group && terrainReady(s, true)) { const b0 = performance.now(); buildSub(s); W.stats.builds++; W.stats.buildMs += performance.now() - b0; W.stats.maxMs = Math.max(W.stats.maxMs, performance.now() - b0); }
      } else if (d > HIDE_R && s.group) dropSub(s);
    }
    busy = near.some(([d, s]) => d < SHOW_R && !s.group);
    if (!busy) for (const t of tiles.values()) {
      if (t.state === 'ready') continue;
      if (Math.hypot(Math.max(t.ox - px, 0, px - t.ox - M), Math.max(t.oz - pz, 0, pz - t.oz - M)) < SHOW_R) { busy = true; break; }
    }
  }
  W.isBusy = () => busy;
  W.stats = { builds: 0, buildMs: 0, maxMs: 0 }; // how long turning sub-tiles into 3D takes (tests, tuning)
  // Registers (physics + data, no 3D) every loaded sub-tile within r of a point. Used to look further than SHOW_R.
  W.registerAround = (x, z, r) => { for (const s of allSubs) if (!s.reg && rectDist(s, x, z) < r) registerSub(s); };
  W.loadStatus = (x, z, r) => {
    const near = allSubs.filter(s => rectDist(s, x, z) < r);
    const all = [...tiles.values()], hills = [...terr.tiles.values()];
    return { built: near.filter(s => s.group).length, total: near.length, pending: all.filter(t => t.state === 'loading').length,
      errors: all.filter(t => t.state === 'error').length, hills: hills.filter(t => t.state === 'loading' || t.state === 'error').length };
  };

  // ---------------------------------------------------------------- grids
  const ckey = (i, j) => Math.floor(i / CH) * 1e6 + Math.floor(j / CH);
  function gridSet(map, Type, i, j, v) {
    const k = ckey(i, j);
    let a = map.get(k);
    if (!a) map.set(k, a = new Type(CH * CH));
    const idx = (j - Math.floor(j / CH) * CH) * CH + (i - Math.floor(i / CH) * CH);
    if (a[idx] < v) a[idx] = v;
  }
  function gridGet(map, x, z) {
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    const a = map.get(ckey(i, j));
    return a ? a[(j - Math.floor(j / CH) * CH) * CH + (i - Math.floor(i / CH) * CH)] : 0;
  }
  const heightAt = (x, z) => gridGet(hchunks, x, z);
  const roadAt = (x, z) => gridGet(rchunks, x, z);
  function rasterize(rings, fn) {
    let zmin = Infinity, zmax = -Infinity;
    for (const p of rings) for (let i = 1; i < p.length; i += 2) { zmin = Math.min(zmin, p[i]); zmax = Math.max(zmax, p[i]); }
    const j0 = Math.ceil(zmin / CELL - 0.5), j1 = Math.floor(zmax / CELL - 0.5), xs = [];
    for (let j = j0; j <= j1; j++) {
      const zc = (j + 0.5) * CELL;
      xs.length = 0;
      for (const p of rings) {
        const n = p.length / 2;
        for (let i = 0, k = n - 1; i < n; k = i++) {
          const zi = p[2 * i + 1], zk = p[2 * k + 1];
          if ((zi > zc) !== (zk > zc)) xs.push(p[2 * i] + (zc - zi) / (zk - zi) * (p[2 * k] - p[2 * i]));
        }
      }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) {
        const i0 = Math.ceil(xs[q] / CELL - 0.5), i1 = Math.floor(xs[q + 1] / CELL - 0.5);
        for (let i = i0; i <= i1; i++) fn(i, j);
      }
    }
  }
  const bkey = (x, z) => Math.floor(x / BUCKET) * 1e6 + Math.floor(z / BUCKET);
  function addToBuckets(map, x0, z0, x1, z1, item) {
    for (let i = Math.floor(x0 / BUCKET); i <= Math.floor(x1 / BUCKET); i++)
      for (let j = Math.floor(z0 / BUCKET); j <= Math.floor(z1 / BUCKET); j++) {
        const k = i * 1e6 + j;
        let l = map.get(k);
        if (!l) map.set(k, l = []);
        l.push(item);
      }
  }
  function inRings(rings, x, z) {
    let inside = false;
    for (const p of rings) for (let i = 0, n = p.length / 2, k = n - 1; i < n; k = i++) {
      const zi = p[2 * i + 1], zk = p[2 * k + 1];
      if ((zi > z) !== (zk > z) && x < (p[2 * k] - p[2 * i]) * (z - zi) / (zk - zi) + p[2 * i]) inside = !inside;
    }
    return inside;
  }

  // ---------------------------------------------------------------- sub-tile: data
  function registerSub(s) {
    const { ox, oz, s: k } = s.tile, r = s.rec;
    const conv = p => { const o = new Array(p.length); for (let i = 0; i < p.length; i += 2) { o[i] = ox + p[i] * k; o[i + 1] = oz + p[i + 1] * k; } return o; };
    s.buildings = r.b.map((b, bi) => {
      let p = conv(b.p);
      if (signedArea(p) > 0) p = reversed(p);
      const hs = b.hs ? b.hs.map(h => { const q = conv(h); return signedArea(q) < 0 ? reversed(q) : q; }) : null;
      const rings = hs ? [p, ...hs] : [p];
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, cx = 0, cz = 0;
      for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]); cx += p[i]; cz += p[i + 1]; }
      const bd = { id: s.tile.k + ':' + s.idx + ':' + bi, p, hs, rings, h: b.h, m: b.m, c: b.c, r: b.r, g: b.g, x0, x1, z0, z1,
        cx: cx / (p.length / 2), cz: cz / (p.length / 2), area: Math.abs(signedArea(p)) };
      if (b.m < 2.5) {
        addToBuckets(buckets, x0 - 1, z0 - 1, x1 + 1, z1 + 1, bd);
        const top = b.h + (b.g || 0);
        rasterize(rings, (i, j) => gridSet(hchunks, Float32Array, i, j, top));
      }
      return bd;
    });
    s.roads = r.r.map(rd => ({ t: rd.t, w: rd.w, k: rd.k, br: rd.br, p: conv(rd.p), be: rd.be ? conv(rd.be) : null }));
    s.walk = []; s.walkLen = 0;
    for (const rd of s.roads) {
      const p = rd.p, hw = rd.w / 2 + 0.4;
      if (rd.br) rd.deck = deckFn(rd);
      for (let i = 0; i + 3 < p.length; i += 2) {
        const x1 = p[i], z1 = p[i + 1], x2 = p[i + 2], z2 = p[i + 3], L = Math.hypot(x2 - x1, z2 - z1);
        if (L < 0.01) continue;
        if (rd.br) addToBuckets(bridgeBuckets, Math.min(x1, x2) - hw, Math.min(z1, z2) - hw, Math.max(x1, x2) + hw, Math.max(z1, z2) + hw, { x1, z1, x2, z2, hw: rd.w / 2, fn: rd.deck });
        if (rd.k) {
          s.walkLen += L;
          const sg = { x1, z1, x2, z2, L, w: rd.w, t: rd.t, car: CAR.has(rd.t) && rd.w >= 5, acc: s.walkLen, br: rd.br ? 1 : 0 };
          s.walk.push(sg);
          addToBuckets(segBuckets, x1, z1, x1, z1, sg);
          addToBuckets(segBuckets, x2, z2, x2, z2, sg);
        }
        const nx = -(z2 - z1) / L, nz = (x2 - x1) / L;
        rasterize([[x1 + nx * hw, z1 + nz * hw, x2 + nx * hw, z2 + nz * hw, x2 - nx * hw, z2 - nz * hw, x1 - nx * hw, z1 - nz * hw]],
          (i, j) => gridSet(rchunks, Uint8Array, i, j, 1));
      }
    }
    for (const nm of r.nm) {
      const p = conv(nm.p);
      for (let i = 0; i + 3 < p.length; i += 2) {
        const sg = { x1: p[i], z1: p[i + 1], x2: p[i + 2], z2: p[i + 3], name: nm.n, car: nm.c };
        addToBuckets(nameBuckets, Math.min(sg.x1, sg.x2) - 12, Math.min(sg.z1, sg.z2) - 12, Math.max(sg.x1, sg.x2) + 12, Math.max(sg.z1, sg.z2) + 12, sg);
      }
    }
    s.areas = r.a.map(a => ({ k: a.k, p: conv(a.p), hs: a.hs ? a.hs.map(conv) : null }));
    s.water = r.wa.map(a => ({ k: 'water', p: conv(a.p), hs: a.hs ? a.hs.map(conv) : null }));
    s.hn = [];
    for (let i = 0; i < r.hn.length; i += 3) s.hn.push({ x: ox + r.hn[i] * k, z: oz + r.hn[i + 1] * k, t: r.hn[i + 2] });
    s.trees = plantTrees(s);
    s.reg = true;
    for (const sg of s.walk) if (sg.car) { sg.n1 = nodeAt(sg.x1, sg.z1, sg, 1); sg.n2 = nodeAt(sg.x2, sg.z2, sg, 2); }
    s.props = layProps(s);
    // Named places: pin each to the nearest street point so people stand outside, not inside the walls
    const po = r.po || [];
    for (let i = 0; i < po.length; i += 4) {
      const id = s.tile.k + ':' + s.idx + ':' + (i / 4);
      const x = ox + po[i] * k, z = oz + po[i + 1] * k;
      if (W.placeIds.has(id)) continue;
      const pin = nearestWalkLocal(x, z, 45, s);
      if (!pin) continue;
      const pl = { id, x, z, kind: po[i + 2], name: po[i + 3], pin };
      // a made-up shop that was put here before this tile arrived makes room for the real place
      for (let q = W.places.length - 1; q >= 0; q--) { const o = W.places[q]; if (o.made && Math.hypot(o.x - x, o.z - z) < 16) { o.gone = true; W.places.splice(q, 1); } }
      W.placeIds.add(id); W.places.push(pl);
      if (W.onPlace) W.onPlace(pl);
    }
    // Made-up shops in real buildings, so every street has signs and somewhere to go. The game names them
    // (W.makeShop(seed) -> {kind, name}); the same building always gets the same shop.
    if (W.makeShop) {
      const made = [];
      s.buildings.forEach((b, bi) => {
        if (made.length >= 14 || b.m >= 2.5 || b.h < 3 || b.area < 70 || b.area > 2600) return;
        const seed = Math.imul(s.tile.x, 73856093) ^ Math.imul(s.tile.y, 19349663) ^ Math.imul(Math.round(r.b[bi].p[0] * 4) + 1, 83492791) ^ Math.round(r.b[bi].p[1] * 4);
        if (hash(seed) > 0.24) return;
        const id = 'm:' + s.tile.k + ':' + s.idx + ':' + bi;
        if (W.placeIds.has(id)) return;
        if (realNear(b.cx, b.cz, 16)) return;
        if (made.some(q => Math.hypot(q.x - b.cx, q.z - b.cz) < 26)) return;
        const pin = nearestWalkLocal(b.cx, b.cz, 26, s);
        if (!pin) return;
        const shop = W.makeShop(seed);
        if (!shop) return;
        const pl = { id, x: b.cx, z: b.cz, kind: shop.kind, name: shop.name, pin, virtual: true, made: true };
        made.push(pl); W.placeIds.add(id); W.places.push(pl);
        if (W.onPlace) W.onPlace(pl);
      });
    }
  }
  // Is a real place from the map within r of (x, z)? Looks at every loaded sub-tile, registered or not.
  function realNear(x, z, r) {
    for (const s of allSubs) {
      if (rectDist(s, x, z) > r) continue;
      const po = s.rec.po || [], t = s.tile;
      for (let i = 0; i < po.length; i += 4) if (Math.hypot(t.ox + po[i] * t.s - x, t.oz + po[i + 1] * t.s - z) < r) return true;
    }
    return false;
  }
  // Street corners: where three or more driveable segments meet, and a bigger road is one of them, there's a traffic light.
  const snodes = new Map(), sigList = [];
  function nodeAt(x, z, sg, end) {
    const ci = Math.round(x / 4), cj = Math.round(z / 4);
    let n = null;
    for (let i = -1; i <= 1 && !n; i++) for (let j = -1; j <= 1 && !n; j++) {
      const l = snodes.get((ci + i) * 1e6 + cj + j);
      if (l) for (const q of l) if (Math.hypot(q.x - x, q.z - z) < 2.5) { n = q; break; }
    }
    if (!n) { n = { x, z, ends: [], sig: null }; const key = ci * 1e6 + cj; let l = snodes.get(key); if (!l) snodes.set(key, l = []); l.push(n); }
    n.ends.push({ sg, end });
    if (n.sig) groupEnds(n); else trySignal(n);
    return n;
  }
  const endAngle = e => Math.atan2(e.sg.x2 - e.sg.x1, e.sg.z2 - e.sg.z1);
  function trySignal(n) {
    if (n.ends.length < 3 || n.ends.some(e => e.sg.br)) return;
    const big = n.ends.filter(e => BIG.has(e.sg.t));
    if (big.length < 2 || (n.ends.length < 4 && !big.some(e => MAJOR.has(e.sg.t)))) return;
    for (const q of sigList) if (Math.hypot(q.x - n.x, q.z - n.z) < 75) return;
    n.sig = { a0: endAngle(big[0]), off: hash(Math.round(n.x) * 31 + Math.round(n.z) * 17) * 18, obj: null, last: '' };
    sigList.push(n);
    groupEnds(n);
  }
  function groupEnds(n) {
    for (const e of n.ends) { e.grp = Math.abs(Math.cos(endAngle(e) - n.sig.a0)) > 0.62 ? 0 : 1; if (e.end === 1) e.sg.g1 = e.grp; else e.sg.g2 = e.grp; }
    if (n.sig.obj) n.sig.stale = true; // a neighbouring sub-tile brought another road: redraw the corner
  }
  // 0 red, 1 yellow, 2 green. Group 0 = the first big road's direction, group 1 = the crossing one. An 18-second cycle.
  function sigState(n, grp) { const ph = (life.t + n.sig.off) % 18; return grp === 0 ? (ph < 7 ? 2 : ph < 9 ? 1 : 0) : (ph < 9 ? 0 : ph < 16 ? 2 : 1); }
  W.signals = () => sigList;
  W.signalState = sigState;
  // Lamps, benches, hydrants, bins, mailboxes and parked cars for one sub-tile: flat lists [x, z, yaw, ...]
  const carBuckets = new Map();
  function layProps(s) {
    const P = { lamp: [], bench: [], hydrant: [], bin: [], box: [], car: [], van: [] };
    let seed = (s.tile.x * 613 + s.tile.y * 271 + s.idx * 97) | 0;
    const rnd = () => hash(seed++);
    const free = (x, z) => !heightAt(x, z) && !heightAt(x + 0.8, z) && !heightAt(x - 0.8, z) && !heightAt(x, z + 0.8) && !heightAt(x, z - 0.8);
    for (const rd of s.roads) {
      if (rd.br || !(rd.t === 'residential' || BIG.has(rd.t))) continue;
      const p = rd.p, hw = rd.w / 2;
      let acc = rnd() * 30, side = rnd() < 0.5 ? 1 : -1;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const x1 = p[i], z1 = p[i + 1], x2 = p[i + 2], z2 = p[i + 3], L = Math.hypot(x2 - x1, z2 - z1);
        if (L < 1) continue;
        const ux = (x2 - x1) / L, uz = (z2 - z1) / L;
        for (let d = 34 - (acc % 34); d < L; d += 34) { // a lamp every 34 m, on alternating sides, its arm over the road
          side = -side;
          const x = x1 + ux * d - uz * (hw + 0.9) * side, z = z1 + uz * d + ux * (hw + 0.9) * side;
          if (free(x, z)) P.lamp.push(x, z, Math.atan2(-uz * side, ux * side));
        }
        acc += L;
        for (let d = 5 + rnd() * 14; d < L - 4; d += 18 + rnd() * 26) {
          const sd = rnd() < 0.5 ? 1 : -1, q = rnd();
          const x = x1 + ux * d - uz * (hw + 1.4) * sd, z = z1 + uz * d + ux * (hw + 1.4) * sd;
          if (!free(x, z) || roadAt(x, z)) continue;
          (q < 0.3 ? P.bench : q < 0.58 ? P.bin : q < 0.82 ? P.hydrant : P.box).push(x, z, Math.atan2(-uz * sd, ux * sd));
        }
        if (rd.w >= 9 && L > 24 && !MAJOR.has(rd.t)) for (const sd of [1, -1]) { // cars parked along the kerb, nose with the traffic
          if (rnd() < 0.3) continue;
          for (let d = 10 + rnd() * 5; d < L - 10; d += 5.7) {
            if (rnd() < (LOW ? 0.8 : 0.55)) continue;
            const x = x1 + ux * d - uz * (hw - 0.95) * sd, z = z1 + uz * d + ux * (hw - 0.95) * sd;
            const yaw = Math.atan2(-ux * sd, -uz * sd), tint = CAR_TINT[Math.floor(rnd() * CAR_TINT.length)];
            const pc = { x, z, yaw, ux, uz, van: rnd() < 0.2 };
            (pc.van ? P.van : P.car).push(x, z, yaw, tint);
            addToBuckets(carBuckets, x - 2.5, z - 2.5, x + 2.5, z + 2.5, pc);
          }
        }
      }
    }
    return P;
  }
  // A parked car at (x, z)? (within its footprint, with a margin R)
  function carAt(x, z, R) {
    const list = carBuckets.get(bkey(x, z));
    if (!list) return null;
    for (const c of list) {
      const dx = x - c.x, dz = z - c.z, along = dx * c.ux + dz * c.uz, across = -dx * c.uz + dz * c.ux;
      if (Math.abs(along) < (c.van ? 2.25 : 1.95) + R && Math.abs(across) < 0.92 + R) return c;
    }
    return null;
  }
  W.carAt = carAt;
  // Nearest walk point using the sub-tile and its registered neighbours.
  function nearestWalkLocal(x, z, maxD, s0) {
    let best = null, bd = maxD;
    for (const s of allSubs) {
      if (!s.reg || (s !== s0 && rectDist(s, x, z) > maxD)) continue;
      for (const sg of s.walk) {
        const dx = sg.x2 - sg.x1, dz = sg.z2 - sg.z1, L = dx * dx + dz * dz;
        let t = L > 0 ? ((x - sg.x1) * dx + (z - sg.z1) * dz) / L : 0;
        t = Math.max(0, Math.min(1, t));
        const px = sg.x1 + t * dx, pz = sg.z1 + t * dz, d = Math.hypot(px - x, pz - z) + (sg.car ? 0 : 4);
        if (d < bd) { bd = d; best = { x: px, z: pz, yaw: Math.atan2(x - px, z - pz), seg: sg }; }
      }
    }
    if (best) { // stand at the kerb on the building's side
      const d = Math.hypot(x - best.x, z - best.z), off = Math.min(best.seg.w / 2 + 0.6, d * 0.6);
      if (d > 0.5) { const nx = best.x + (x - best.x) / d * off, nz = best.z + (z - best.z) / d * off; if (!heightAt(nx, nz)) { best.x = nx; best.z = nz; } }
      best.yaw = Math.atan2(-(x - best.x), -(z - best.z));
      delete best.seg;
    }
    return best;
  }

  function plantTrees(s) {
    const out = [];
    const ok = (x, z) => heightAt(x, z) === 0 && heightAt(x + 2, z) === 0 && heightAt(x - 2, z) === 0 && heightAt(x, z + 2) === 0 && heightAt(x, z - 2) === 0 &&
      !roadAt(x, z) && !roadAt(x + 1, z) && !roadAt(x - 1, z) && !roadAt(x, z + 1) && !roadAt(x, z - 1);
    let seed = (s.tile.x * 131 + s.tile.y * 977 + Math.round(s.x0)) | 0;
    const rnd = () => hash(seed++);
    for (const rd of s.roads) {
      if (!(rd.t === 'residential' || rd.t === 'tertiary' || rd.t === 'secondary' || rd.t === 'primary')) continue;
      const p = rd.p, off = rd.w / 2 + 2.2;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const x1 = p[i], z1 = p[i + 1], x2 = p[i + 2], z2 = p[i + 3], L = Math.hypot(x2 - x1, z2 - z1);
        if (L < 8) continue;
        const ux = (x2 - x1) / L, uz = (z2 - z1) / L;
        for (let d = 6 + rnd() * 6; d < L - 6; d += 11 + rnd() * 6) for (const side of [-1, 1]) {
          if (rnd() < 0.3) continue;
          const x = x1 + ux * d - uz * off * side, z = z1 + uz * d + ux * off * side;
          if (ok(x, z)) out.push(x, z);
        }
      }
    }
    for (const a of s.areas) {
      const dens = a.k === 'wood' ? 1 / 90 : a.k === 'park' || a.k === 'cemetery' ? 1 / 350 : 0;
      if (!dens) continue;
      const p = a.p;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]); }
      const n = Math.min(LOW ? 200 : 600, Math.abs(signedArea(p)) * dens);
      for (let t = 0; t < n * 1.6 && out.length < 3000; t++) {
        const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
        if (inRings([p].concat(a.hs || []), x, z) && ok(x, z)) out.push(x, z);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- sub-tile: 3D + minimap
  // The ground under one sub-tile: a grid of GS-metre cells. A cell belongs to the sub-tile holding its corner,
  // so neighbouring meshes share edges exactly. Triangles (i,j)-(i+1,j)-(i+1,j+1) and (i,j)-(i+1,j+1)-(i,j+1), as in groundAt.
  function groundMesh(s) {
    const i0 = Math.ceil(s.x0 / GS), i1 = Math.ceil(s.x1 / GS), j0 = Math.ceil(s.z0 / GS), j1 = Math.ceil(s.z1 / GS);
    const ni = i1 - i0, nj = j1 - j0;
    if (ni <= 0 || nj <= 0) return null;
    const W1 = ni + 1, nv = W1 * (nj + 1), pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3);
    let p = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = node(i - 1, j) - node(i + 1, j), dz = node(i, j - 1) - node(i, j + 1), l = Math.hypot(dx, 2 * GS, dz);
      pos[p] = i * GS; pos[p + 1] = node(i, j); pos[p + 2] = j * GS;
      nrm[p] = dx / l; nrm[p + 1] = 2 * GS / l; nrm[p + 2] = dz / l;
      p += 3;
    }
    const idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni * nj * 6);
    let q = 0;
    for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
      const a = j * W1 + i, b = a + 1, c = a + W1 + 1, d = a + W1;
      idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = a; idx[q++] = d; idx[q++] = c;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, MAT.terrain);
    m.receiveShadow = true;
    return m;
  }
  // Where a building stands: its walls start at the lowest ground under it (so no gap on a slope) and its floors
  // count from a little above that.
  function buildingBase(b) {
    let lo = Infinity, hi = -Infinity;
    const p = b.p;
    for (let i = 0; i < p.length; i += 2) { const g = groundAt(p[i], p[i + 1]); if (g < lo) lo = g; if (g > hi) hi = g; }
    const c = groundAt(b.cx, b.cz); if (c < lo) lo = c; if (c > hi) hi = c;
    if (lo === Infinity) lo = hi = 0;
    b.lo = lo; b.base = lo + Math.min(hi - lo, 6) * 0.5;
    return b;
  }
  function buildSub(s) {
    const group = new THREE.Group();
    const gm = groundMesh(s);
    if (gm) group.add(gm);
    const flat = new Geo(false), col = new THREE.Color();
    for (const a of s.areas.concat(s.water)) {
      const st = AREA[a.k] || AREA.grass;
      col.setHex(st[0]);
      flat.dpolygon(a.p, a.hs, groundAt, st[1] + 0.03, col, 2 * GS);
    }
    for (const r of s.roads) {
      const st = roadStyle(r.t), hw = r.w / 2, p = r.p, n = p.length / 2;
      const lift = st.y + 0.03 + (r.br ? 0.006 : 0), hf = r.deck || groundAt;
      const marking = MAJOR.has(r.t) || r.t === 'tertiary';
      for (let i = 0; i < n - 1; i++) {
        const x1 = p[2 * i], z1 = p[2 * i + 1], x2 = p[2 * i + 2], z2 = p[2 * i + 3];
        const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz);
        if (L < 0.01) continue;
        const nx = -dz / L * hw, nz = dx / L * hw, k = Math.max(1, Math.ceil(L / GS));
        for (let q = 0; q < k; q++) { // short pieces so the road follows the slope
          const ax = x1 + dx * q / k, az = z1 + dz * q / k, bx = x1 + dx * (q + 1) / k, bz = z1 + dz * (q + 1) / k;
          flat.dquad(ax + nx, az + nz, bx + nx, bz + nz, bx - nx, bz - nz, ax - nx, az - nz, hf, lift, st.col);
        }
        if (marking) dashes(flat, x1, z1, dx / L, dz / L, L, hf, lift + 0.012);
      }
      for (let i = 0; i < n; i++) {
        if (i > 0 && i < n - 1) {
          const ax = p[2 * i] - p[2 * i - 2], az = p[2 * i + 1] - p[2 * i - 1], bx = p[2 * i + 2] - p[2 * i], bz = p[2 * i + 3] - p[2 * i + 1];
          if ((ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz) + 1e-9) > 0.985) continue;
        }
        disk(flat, p[2 * i], p[2 * i + 1], hw, hf, lift - 0.002, st.col);
      }
    }
    if (!flat.empty) { const m = new THREE.Mesh(flat.build(), MAT.drape); m.receiveShadow = true; group.add(m); }
    const walls = new Geo(true), roofs = new Geo(false);
    const wc = new THREE.Color(), rc = new THREE.Color(), gray = new THREE.Color(0x8c8b88), hsl = {}, gfc = new THREE.Color(), shopfront = new THREE.Color(0x3b3344);
    s.buildings.forEach((b, idx) => {
      buildingBase(b);
      const y0 = b.m > 0.5 ? b.base + b.m : b.lo - 0.4, top = b.base + b.h;
      wc.set(cssColor(b.c) || '#b0a490');
      wc.getHSL(hsl);
      if (hsl.l < 0.3 || hsl.l > 0.85) wc.setHSL(hsl.h, hsl.s, Math.min(0.85, Math.max(0.3, hsl.l)));
      wc.getHSL(hsl);
      wc.setHSL(hsl.h, Math.min(0.9, hsl.s * 1.25 + 0.04), hsl.l); // a little more colour than the map's: sticker-book streets
      wc.multiplyScalar(0.82 + hash(idx + Math.round(b.x0)) * 0.18);
      // the street floor is a darker band (shopfronts), when the building is tall enough to have one
      const gf = b.m <= 0.5 && b.h > 6.2 ? gfc.copy(wc).lerp(shopfront, 0.38) : null;
      for (const ring of b.rings) addWalls(walls, ring, y0, top, wc, b.base, gf);
      const rcs = cssColor(b.r);
      if (rcs) rc.set(rcs); else rc.copy(wc).lerp(gray, 0.55).multiplyScalar(0.85);
      if (b.g) gable(roofs, b.p, top, b.g, rc, wc);
      else {
        roofs.polygon(b.p, b.hs, top, rc);
        roofClutter(roofs, b, top, idx);
      }
      if (b.m > 0.5) roofs.polygon(b.p, b.hs, y0, rc, true);
    });
    for (const [geo, mat] of [[walls, MAT.walls], [roofs, MAT.plain]]) {
      if (geo.empty) continue;
      const m = new THREE.Mesh(geo.build(), mat);
      m.castShadow = m.receiveShadow = !LOW;
      group.add(m);
    }
    // Trees, street furniture and parked cars are instanced per sub-tile. three r149 never culls an InstancedMesh, so
    // each one sits at the sub-tile's centre with a bounding sphere the size of the sub-tile (cullGeo): out of view, not drawn.
    const ccx = (s.x0 + s.x1) / 2, ccz = (s.z0 + s.z1) / 2, ccy = groundAt(ccx, ccz);
    const culled = im => { im.position.set(ccx, ccy, ccz); im.frustumCulled = true; group.add(im); return im; };
    const n = s.trees.length / 2;
    if (n) {
      const trunks = new THREE.InstancedMesh(cullGeo(TRUNK_G), MAT.trunk, n), crowns = new THREE.InstancedMesh(cullGeo(CROWN_G), MAT.crown, n);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const sx = s.trees[2 * i], sz = s.trees[2 * i + 1], hh = Math.round(sx * 7 + sz * 13), size = 0.75 + hash(hh) * 0.6;
        e.set(0, hash(hh + 1) * 6.28, 0); q.setFromEuler(e); sc.set(size, size * (0.9 + hash(hh + 2) * 0.3), size);
        v.set(sx - ccx, groundAt(sx, sz) - 0.1 - ccy, sz - ccz); m.compose(v, q, sc);
        trunks.setMatrixAt(i, m); crowns.setMatrixAt(i, m);
        c.setHSL(0.24 + hash(hh + 3) * 0.08, 0.45 + hash(hh + 4) * 0.2, 0.3 + hash(hh + 5) * 0.12);
        crowns.setColorAt(i, c);
      }
      crowns.castShadow = trunks.castShadow = !LOW;
      culled(trunks); culled(crowns);
    }
    const pr = s.props || {};
    const inst = (geo, mat, list, stride, shadow) => {
      const cnt = list.length / stride;
      if (!cnt) return null;
      const im = new THREE.InstancedMesh(cullGeo(geo), mat, cnt), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
      for (let i = 0; i < cnt; i++) {
        const x = list[i * stride], z = list[i * stride + 1], yaw = list[i * stride + 2];
        let pitch = 0;
        if (stride === 4) { const fx = -Math.sin(yaw), fz = -Math.cos(yaw); pitch = Math.atan((groundAt(x + fx * 1.6, z + fz * 1.6) - groundAt(x - fx * 1.6, z - fz * 1.6)) / 3.2); c.setHex(list[i * stride + 3]); im.setColorAt(i, c); }
        e.set(pitch, yaw, 0); q.setFromEuler(e); v.set(x - ccx, groundAt(x, z) - ccy, z - ccz); m.compose(v, q, one);
        im.setMatrixAt(i, m);
      }
      im.castShadow = !!shadow && !LOW; im.receiveShadow = false;
      return culled(im);
    };
    for (const kind of ['lamp', 'bench', 'hydrant', 'bin', 'box']) if (pr[kind]) inst(PROP[kind], MAT.prop, pr[kind], 3, true);
    if (pr.lamp) { inst(PROP.bulb, MAT.bulb, pr.lamp, 3, false); const pool = inst(PROP.pool, MAT.pool, pr.lamp, 3, false); if (pool) pool.renderOrder = 2; }
    if (pr.car) inst(PROP.car, MAT.tint, pr.car, 4, true);
    if (pr.van) inst(PROP.van, MAT.tint, pr.van, 4, true);
    worldGroup.add(group);
    s.group = group;
    if (!s.canvas) s.canvas = drawSubMap(s);
  }
  function dropSub(s) {
    worldGroup.remove(s.group);
    s.group.traverse(o => { if (o.geometry && !SHARED.has(o.geometry)) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
    s.group = null;
  }
  // base = the height floors count from (window rows line up with it); gcol = the street floor's colour (or none)
  function addWalls(geo, p, y0, y1, col, base, gcol) {
    base = base || 0;
    const n = p.length / 2, ys = gcol ? base + FLOOR_H : y0;
    let u = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x1 = p[2 * i], z1 = p[2 * i + 1], x2 = p[2 * j], z2 = p[2 * j + 1];
      const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz);
      if (L < 0.01) continue;
      let u0, u1;
      if (L < 2.5) { u0 = u; u1 = u + L / WIN_W; u = u1; } else { u0 = (i % 4); u1 = u0 + Math.max(1, Math.round(L / WIN_W)); u = 0; }
      u0 /= 4; u1 /= 4;
      const nx = -dz / L, nz = dx / L, v0 = (y0 - base) / FLOOR_H / 4, vs = (ys - base) / FLOOR_H / 4, v1 = (y1 - base) / FLOOR_H / 4;
      if (gcol) {
        geo.vert(x1, y0, z1, nx, 0, nz, gcol, u0, v0); geo.vert(x2, y0, z2, nx, 0, nz, gcol, u1, v0); geo.vert(x2, ys, z2, nx, 0, nz, gcol, u1, vs);
        geo.vert(x1, y0, z1, nx, 0, nz, gcol, u0, v0); geo.vert(x2, ys, z2, nx, 0, nz, gcol, u1, vs); geo.vert(x1, ys, z1, nx, 0, nz, gcol, u0, vs);
      }
      geo.vert(x1, ys, z1, nx, 0, nz, col, u0, vs); geo.vert(x2, ys, z2, nx, 0, nz, col, u1, vs); geo.vert(x2, y1, z2, nx, 0, nz, col, u1, v1);
      geo.vert(x1, ys, z1, nx, 0, nz, col, u0, vs); geo.vert(x2, y1, z2, nx, 0, nz, col, u1, v1); geo.vert(x1, y1, z1, nx, 0, nz, col, u0, v1);
    }
  }
  // An upright box in a flat-shaded Geo (roof huts, tanks, antennas)
  function gbox(geo, x, z, y0, y1, hw, hd, col, top) {
    const c = [[x - hw, z - hd], [x + hw, z - hd], [x + hw, z + hd], [x - hw, z + hd]];
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4], nx = i === 1 ? 1 : i === 3 ? -1 : 0, nz = i === 0 ? -1 : i === 2 ? 1 : 0;
      geo.vert(a[0], y0, a[1], nx, 0, nz, col, 0, 0); geo.vert(b[0], y1, b[1], nx, 0, nz, col, 0, 0); geo.vert(b[0], y0, b[1], nx, 0, nz, col, 0, 0);
      geo.vert(a[0], y0, a[1], nx, 0, nz, col, 0, 0); geo.vert(a[0], y1, a[1], nx, 0, nz, col, 0, 0); geo.vert(b[0], y1, b[1], nx, 0, nz, col, 0, 0);
    }
    geo.quadFlat(c[0][0], c[0][1], c[1][0], c[1][1], c[2][0], c[2][1], c[3][0], c[3][1], y1, top || col);
  }
  // Rooftop huts, water tanks, vents and, on towers, an antenna: only on big flat roofs
  const ROOF_COLS = [0x9aa0a6, 0x7c8288, 0xb7b1a4, 0x6f7a86, 0xa8734a].map(h => new THREE.Color(h));
  const TANK_COL = new THREE.Color(0x8a5a3a), TANK_TOP = new THREE.Color(0x6b4428), MAST_COL = new THREE.Color(0xd9d9d9), MAST_RED = new THREE.Color(0xe23b2e);
  function roofClutter(geo, b, top, idx) {
    if (LOW || b.area < 170 || b.h < 8) return;
    const sx = (b.x1 - b.x0) * 0.3, sz = (b.z1 - b.z0) * 0.3, n = Math.min(4, 1 + Math.floor(b.area / 500));
    const fits = (x, z, r) => inRings(b.rings, x, z) && inRings(b.rings, x + r, z + r) && inRings(b.rings, x - r, z + r) && inRings(b.rings, x + r, z - r) && inRings(b.rings, x - r, z - r);
    for (let k = 0; k < n; k++) {
      const hh = idx * 7 + k * 13 + Math.round(b.cx);
      const x = b.cx + (hash(hh) - 0.5) * 2 * sx, z = b.cz + (hash(hh + 1) - 0.5) * 2 * sz, q = hash(hh + 2);
      if (!fits(x, z, 2.2)) continue;
      if (q < 0.3) { gbox(geo, x, z, top, top + 0.5, 0.12, 0.12, ROOF_COLS[1]); gbox(geo, x + 1.2, z, top, top + 0.5, 0.12, 0.12, ROOF_COLS[1]); gbox(geo, x + 0.6, z, top + 0.5, top + 2.3, 1.0, 1.0, TANK_COL, TANK_TOP); } // water tank on legs
      else if (q < 0.65) gbox(geo, x, z, top, top + 1.1 + hash(hh + 3) * 0.5, 1.4, 0.9, ROOF_COLS[Math.floor(hash(hh + 4) * 4)]);  // AC unit
      else gbox(geo, x, z, top, top + 2.6, 1.5, 1.8, ROOF_COLS[2 + Math.floor(hash(hh + 5) * 3)]);                               // stair hut
    }
    if (b.h > 38 && fits(b.cx, b.cz, 1)) { gbox(geo, b.cx, b.cz, top, top + 9, 0.14, 0.14, MAST_COL); gbox(geo, b.cx, b.cz, top + 9, top + 9.5, 0.2, 0.2, MAST_RED); }
  }
  function gable(geo, p, y, rh, rc, wc) {
    const P = i => [p[2 * (i % 4)], p[2 * (i % 4) + 1]];
    const s = Math.hypot(p[2] - p[0], p[3] - p[1]) >= Math.hypot(p[4] - p[2], p[5] - p[3]) ? 0 : 1;
    const A = P(s), B = P(s + 1), C = P(s + 2), D = P(s + 3);
    const top = y + rh;
    const m1 = [(D[0] + A[0]) / 2, top, (D[1] + A[1]) / 2], m2 = [(B[0] + C[0]) / 2, top, (B[1] + C[1]) / 2];
    const v = q => [q[0], y, q[1]];
    geo.tri(v(A), v(B), m2, rc, 0, 1, 0); geo.tri(v(A), m2, m1, rc, 0, 1, 0);
    geo.tri(v(C), v(D), m1, rc, 0, 1, 0); geo.tri(v(C), m1, m2, rc, 0, 1, 0);
    const out = (a, b) => [-(b[1] - a[1]), 0, b[0] - a[0]];
    const o1 = out(B, C), o2 = out(D, A);
    geo.tri(v(B), v(C), m2, wc, o1[0], 0, o1[2]);
    geo.tri(v(D), v(A), m1, wc, o2[0], 0, o2[2]);
  }
  const dashCol = new THREE.Color(0xe9e2c4);
  function dashes(geo, x, z, ux, uz, L, hf, lift) {
    const hw = 0.09, nx = -uz * hw, nz = ux * hw;
    for (let s = 2; s + 3 < L; s += 9) {
      const ax = x + ux * s, az = z + uz * s, bx = ax + ux * 3, bz = az + uz * 3;
      geo.dquad(ax + nx, az + nz, bx + nx, bz + nz, bx - nx, bz - nz, ax - nx, az - nz, hf, lift, dashCol);
    }
  }
  function disk(geo, x, z, r, hf, lift, col) {
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, b = (i + 1) / 8 * Math.PI * 2;
      geo.dtri(x, z, x + Math.cos(a) * r, z + Math.sin(a) * r, x + Math.cos(b) * r, z + Math.sin(b) * r, hf, lift, col, GS);
    }
  }
  const MM_MARGIN = 40;
  function drawSubMap(s) {
    const c = document.createElement('canvas');
    const x0 = s.x0 - MM_MARGIN, z0 = s.z0 - MM_MARGIN;
    c.width = Math.ceil(s.x1 - s.x0 + 2 * MM_MARGIN); c.height = Math.ceil(s.z1 - s.z0 + 2 * MM_MARGIN);
    const g = c.getContext('2d');
    const path = (p, close) => { for (let i = 0; i < p.length; i += 2) { const X = p[i] - x0, Z = p[i + 1] - z0; if (i) g.lineTo(X, Z); else g.moveTo(X, Z); } if (close) g.closePath(); };
    for (const a of s.areas.concat(s.water)) { g.fillStyle = (AREA[a.k] || AREA.grass)[2]; g.beginPath(); path(a.p, true); for (const h of a.hs || []) path(h, true); g.fill('evenodd'); }
    g.lineCap = g.lineJoin = 'round';
    const pass = (filter, color, width) => { g.strokeStyle = color; for (const r of s.roads) { if (!filter(r)) continue; g.lineWidth = width(r); g.beginPath(); path(r.p); g.stroke(); } };
    pass(r => !CAR.has(r.t), '#f7f4ee', () => 2);
    pass(r => CAR.has(r.t) && !MAJOR.has(r.t), '#ffffff', r => Math.max(2, r.w));
    pass(r => MAJOR.has(r.t), '#ffe7a3', r => Math.max(2.5, r.w));
    g.fillStyle = '#cbc3b4'; g.strokeStyle = '#b3a998'; g.lineWidth = 1;
    for (const b of s.buildings) { if (b.m >= 2.5) continue; g.beginPath(); for (const r of b.rings) path(r, true); g.fill('evenodd'); g.stroke(); }
    return c;
  }

  // ---------------------------------------------------------------- queries
  function collide(pos, R) {
    R = R || ride.radius;
    let hit = false;
    for (let it = 0; it < 3; it++) {
      const list = buckets.get(bkey(pos.x, pos.z));
      if (!list) return hit;
      let moved = false;
      for (const b of list) {
        if (pos.x < b.x0 - R || pos.x > b.x1 + R || pos.z < b.z0 - R || pos.z > b.z1 + R) continue;
        let inside = false, best = Infinity, bx = 0, bz = 0;
        for (const p of b.rings) {
          const n = p.length / 2;
          for (let i = 0, k = n - 1; i < n; k = i++) {
            const x1 = p[2 * k], z1 = p[2 * k + 1], x2 = p[2 * i], z2 = p[2 * i + 1];
            if ((z2 > pos.z) !== (z1 > pos.z) && pos.x < (x1 - x2) * (pos.z - z2) / (z1 - z2) + x2) inside = !inside;
            const dx = x2 - x1, dz = z2 - z1, L = dx * dx + dz * dz;
            let t = L > 0 ? ((pos.x - x1) * dx + (pos.z - z1) * dz) / L : 0;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const cx = x1 + t * dx, cz = z1 + t * dz, dd = (pos.x - cx) ** 2 + (pos.z - cz) ** 2;
            if (dd < best) { best = dd; bx = cx; bz = cz; }
          }
        }
        const dist = Math.sqrt(best) || 1e-6;
        if (inside) { pos.x = bx + (bx - pos.x) / dist * (R + 0.01); pos.z = bz + (bz - pos.z) / dist * (R + 0.01); moved = hit = true; }
        else if (dist < R) { pos.x = bx + (pos.x - bx) / dist * R; pos.z = bz + (pos.z - bz) / dist * R; moved = hit = true; }
      }
      if (!moved) return hit;
    }
    return hit;
  }
  function streetAt(x, z) {
    const list = nameBuckets.get(bkey(x, z));
    if (!list) return '';
    let best = 14, name = '';
    for (const s of list) {
      const dx = s.x2 - s.x1, dz = s.z2 - s.z1, L = dx * dx + dz * dz;
      let t = L > 0 ? ((x - s.x1) * dx + (z - s.z1) * dz) / L : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - s.x1 - t * dx, z - s.z1 - t * dz) + (s.car ? 0 : 3);
      if (d < best) { best = d; name = s.name; }
    }
    return name;
  }
  function nearestWalk(x, z, maxD, carOnly) {
    let best = null, bd = maxD || 300;
    for (const s of allSubs) {
      if (!s.reg || rectDist(s, x, z) > bd) continue;
      for (const sg of s.walk) {
        if (carOnly && !sg.car) continue;
        const dx = sg.x2 - sg.x1, dz = sg.z2 - sg.z1, L = dx * dx + dz * dz;
        let t = L > 0 ? ((x - sg.x1) * dx + (z - sg.z1) * dz) / L : 0;
        t = Math.max(0, Math.min(1, t));
        const px = sg.x1 + t * dx, pz = sg.z1 + t * dz, d = Math.hypot(px - x, pz - z) + (sg.car ? 0 : 3);
        if (d < bd && !heightAt(px, pz)) { bd = d; best = { x: px, z: pz, yaw: Math.atan2(-dx, -dz), car: sg.car, w: sg.w, dist: d }; }
      }
    }
    return best;
  }
  // A random point on a street between minD and maxD from (cx, cz); optional filter(x, z).
  function randomWalkSpot(cx, cz, minD, maxD, filter, rnd) {
    rnd = rnd || Math.random;
    const subs = allSubs.filter(s => s.reg && s.walkLen > 0 && rectDist(s, cx, cz) < maxD);
    if (!subs.length) return null;
    const total = subs.reduce((a, s) => a + s.walkLen, 0);
    for (let a = 0; a < 200; a++) {
      let r = rnd() * total, s = subs[0];
      for (const q of subs) { if (r < q.walkLen) { s = q; break; } r -= q.walkLen; }
      const rr = rnd() * s.walkLen, ws = s.walk;
      let lo = 0, hi = ws.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (ws[mid].acc < rr) lo = mid + 1; else hi = mid; }
      const sg = ws[lo], t = rnd();
      const dx = sg.x2 - sg.x1, dz = sg.z2 - sg.z1, L = Math.hypot(dx, dz) || 1, off = (rnd() - 0.5) * sg.w * 0.5;
      const x = sg.x1 + dx * t - dz / L * off, z = sg.z1 + dz * t + dx / L * off;
      const d = Math.hypot(x - cx, z - cz);
      if (d < minD || d > maxD) continue;
      if (heightAt(x, z) || heightAt(x + 1.5, z) || heightAt(x - 1.5, z) || heightAt(x, z + 1.5) || heightAt(x, z - 1.5)) continue;
      if (filter && !filter(x, z, sg)) continue;
      return { x, z, yaw: Math.atan2(-dx, -dz), car: sg.car };
    }
    return null;
  }
  function buildingsNear(x, z, r) {
    const out = [];
    for (const s of allSubs) {
      if (!s.reg || rectDist(s, x, z) > r) continue;
      for (const b of s.buildings) if (b.m < 2.5 && Math.hypot(b.cx - x, b.cz - z) < r) out.push(b);
    }
    return out;
  }
  // A point on the outside wall of building b that faces the nearest street: {x, z, nx, nz, street:{x,z,yaw}}
  function wallSpot(b) {
    const st = nearestWalk(b.cx, b.cz, 80);
    if (!st) return null;
    const p = b.p, n = p.length / 2;
    let best = null, bd = Infinity;
    for (let i = 0, k = n - 1; i < n; k = i++) {
      const x1 = p[2 * k], z1 = p[2 * k + 1], x2 = p[2 * i], z2 = p[2 * i + 1];
      const dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz;
      if (L2 < 9) continue;
      let t = ((st.x - x1) * dx + (st.z - z1) * dz) / L2;
      t = Math.max(0.2, Math.min(0.8, t));
      const cx = x1 + t * dx, cz = z1 + t * dz, d = Math.hypot(cx - st.x, cz - st.z);
      if (d < bd) { const L = Math.sqrt(L2); bd = d; best = { x: cx, z: cz, nx: dz / L, nz: -dx / L }; }
    }
    if (!best) return null;
    // the outward normal points away from the centroid
    if ((best.x - b.cx) * best.nx + (best.z - b.cz) * best.nz < 0) { best.nx = -best.nx; best.nz = -best.nz; }
    best.street = st;
    return best;
  }
  function housenumbersNear(x, z, r) {
    const out = [];
    for (const s of allSubs) {
      if (!s.reg || rectDist(s, x, z) > r) continue;
      for (const h of s.hn) if (Math.hypot(h.x - x, h.z - z) < r) out.push(h);
    }
    return out;
  }
  function waterNear(x, z, r) { // nearest street point next to water or a park area, {x, z, kind}
    let best = null, bd = r;
    for (const s of allSubs) {
      if (!s.reg || rectDist(s, x, z) > r) continue;
      for (const a of s.water) for (let i = 0; i < a.p.length; i += 8) {
        const d = Math.hypot(a.p[i] - x, a.p[i + 1] - z);
        if (d < bd) { const w = nearestWalk(a.p[i], a.p[i + 1], 60); if (w) { bd = d; best = { x: w.x, z: w.z, kind: 'water' }; } }
      }
    }
    return best;
  }
  function areaNear(x, z, r, kinds) {
    let best = null, bd = r;
    for (const s of allSubs) {
      if (!s.reg || rectDist(s, x, z) > r) continue;
      for (const a of s.areas) {
        if (!kinds.includes(a.k) || Math.abs(signedArea(a.p)) < 1500) continue;
        const d = Math.hypot(a.p[0] - x, a.p[1] - z);
        if (d < bd) { const w = nearestWalk(a.p[0], a.p[1], 60); if (w) { bd = d; best = { x: w.x, z: w.z, kind: a.k }; } }
      }
    }
    return best;
  }
  Object.assign(W, { heightAt, roadAt, collide, streetAt, nearestWalk, randomWalkSpot, buildingsNear, wallSpot, housenumbersNear, waterNear, areaNear,
    groundAt, surfaceAt, elevAt, normalAt,
    terrain: () => ({ on: !terr.off && terr.h0 != null, off: terr.off, h0: terr.h0, exag: EXAG, grid: GS, tiles: terr.tiles.size, inflight: terr.inflight }),
    terrainReady: s => terrainReady(s), to15: (x, z) => to15(x, z),
    terrainTiles: () => terr.tiles,
    inside: (x, z) => (buckets.get(bkey(x, z)) || []).some(b => b.m < 2.5 && inRings(b.rings, x, z)), subs: () => allSubs, tiles: () => tiles });

  // ---------------------------------------------------------------- builders: people, animals, vehicles, labels
  const SKINS = [0xf1c9a5, 0xe9b98f, 0xd39d6c, 0xb57b4a, 0x8d5a33, 0x6b4126, 0xf6d7c0];
  const HAIRS = [0x2b1a10, 0x3a2618, 0x6b4423, 0xb98545, 0xe1c06a, 0x1d1d1d, 0x8a8a8a, 0xb24a2a, 0xd9d4cc];
  const CLOTH = [0xe8453c, 0x2b6cb0, 0x2f9e6e, 0xf2b134, 0x7b52c7, 0xef6aa5, 0x1f2937, 0xf4f1ea, 0x3aa6b9, 0xff8a3d, 0x6d8b3a, 0x9b2c4f];
  const PANTS = [0x2b4c7e, 0x1f2937, 0x5b4636, 0x6b7280, 0x2d3a2e, 0x8a6e4b, 0x24324a, 0xc2b59b];
  const SHOES = [0xf2f2f2, 0x222222, 0xe8453c, 0x2b6cb0, 0x8a5a2b, 0xf2b134, 0x3a3f4a];
  W.randomLook = function (seed) {
    const r = i => hash(seed * 31 + i);
    const pick = (a, i) => a[Math.floor(r(i) * a.length) % a.length];
    return { skin: pick(SKINS, 1), hair: pick(HAIRS, 2), shirt: pick(CLOTH, 3), pants: pick(PANTS, 4), shoe: pick(SHOES, 5),
      long: r(6) < 0.4, dress: r(7) < 0.15, hat: r(8) < 0.12 ? pick(CLOTH, 9) : null, bag: r(10) < 0.25 ? pick(CLOTH, 11) : null, h: 0.92 + r(12) * 0.16,
      hs: Math.floor(r(13) * 24), sleeve: r(14) < 0.45 ? 'short' : 'long', shorts: r(15) < 0.14, glasses: r(16) < 0.14, beard: r(17) < 0.1 && r(6) >= 0.4,
      stripes: r(18) < 0.16 ? pick(CLOTH, 19) : null, logo: r(20) < 0.2 ? pick(CLOTH, 21) : null, phones: r(22) < 0.07 ? pick(CLOTH, 23) : null,
      build: 0.92 + r(24) * 0.2, scarf: r(25) < 0.06 ? pick(CLOTH, 26) : null, collar: r(27) < 0.2 };
  };
  // The shapes people are made of (rounded, smooth-shaded). Fewer facets on low quality.
  // Three levels of roundness: you and the story's cast get the smoothest, the dozens of passers-by a lighter one.
  const prims = (su, sv, mu, mv, cs, cr, du, dv, rr) => ({
    sph: new THREE.SphereGeometry(0.5, su, sv).toNonIndexed(), sm: new THREE.SphereGeometry(0.5, mu, mv).toNonIndexed(),
    cap: new THREE.CapsuleGeometry(0.5, 1, cs, cr).toNonIndexed(),                                  // 2 tall, 1 wide
    dome: new THREE.SphereGeometry(0.5, du, dv, 0, Math.PI * 2, 0, Math.PI * 0.46).toNonIndexed(),
    skirt: new THREE.CylinderGeometry(0.3, 0.5, 1, rr).toNonIndexed(), ring: new THREE.CylinderGeometry(0.5, 0.5, 1, rr, 1, true).toNonIndexed() });
  const PRIM_HI = prims(16, 12, 10, 7, 4, 12, 16, 6, 14), PRIM_MID = prims(10, 7, 6, 4, 2, 8, 10, 4, 10), PRIM_LO = prims(8, 5, 5, 3, 1, 6, 8, 3, 8);
  const shade = (c, k) => { _c.set(c).multiplyScalar(k); return _c.getHex(); };
  const LONG_HAIR = [1, 3, 6, 2, 1, 6], SHORT_HAIR = [0, 4, 5, 0, 8, 0, 7, 4];
  W.HAIR_STYLES = ['Short', 'Long', 'Bun', 'Ponytail', 'Curly', 'Spiky', 'Bob', 'Thin on top', 'Side part'];
  // A person, facing -z. Rounded body, a face (eyes, brows, nose, mouth, ears), nine hair styles, and joints: the body
  // group holds a head and four limbs, each limb a pivot with a second pivot (knee / elbow) inside, so people can walk,
  // run, sit, pedal, wave and dance. userData: {body, head, legL, legR, kneeL, kneeR, armL, armR, elbowL, elbowR, handL, handR}.
  // look: {skin, hair, shirt, pants, shoe, h, build, style | long + hs, sleeve: 'short' | 'long' | 'none', shorts, dress,
  //   hat, beanie, crown, glasses, beard, bag, apron, cape, coat, scarf, stripes, logo, phones, collar, tie, mood: 'angry'}.
  // npc: true = only the big parts cast shadows (the streets hold dozens of people).
  W.person = function (look, npc) {
    look = look || W.randomLook(Math.random() * 1e6 | 0);
    const { sph: P_SPH, sm: P_SM, cap: P_CAP, dome: P_DOME, skirt: P_SKIRT, ring: P_RING } = npc ? (LOW ? PRIM_LO : PRIM_MID) : (LOW ? PRIM_MID : PRIM_HI);
    const g = new THREE.Group(), body = new THREE.Group();
    g.add(body);
    const skin = look.skin, hair = look.hair, shirt = look.coat || look.shirt, pants = look.pants, shoe = look.shoe == null ? 0x222222 : look.shoe;
    const kid = (look.h || 1) < 0.78;
    const part = (m, shadow) => { const mesh = m.mesh(); mesh.castShadow = !LOW && (shadow || !npc); return mesh; };
    // ---- torso
    const t = new Merge();
    t.add(P_SPH, look.dress ? shirt : pants, 0, 0.93, 0, 0, 0, 0, 0.44, 0.3, 0.3);                    // hips
    t.add(P_CAP, shirt, 0, 1.2, 0, 0, 0, 0, 0.47, 0.31, 0.3);                                         // chest
    t.add(P_SPH, shirt, 0, 1.41, 0, 0, 0, 0, 0.6, 0.2, 0.3);                                          // shoulders
    t.add(CYL8, skin, 0, 1.53, 0, 0, 0, 0, 0.14, 0.12, 0.14);                                         // neck
    if (look.dress) t.add(P_SKIRT, shirt, 0, 0.74, 0, 0, 0, 0, 0.72, 0.46, 0.6);
    else if (!look.coat) t.add(P_RING, shade(pants, 0.55), 0, 1.0, 0, 0, 0, 0, 0.455, 0.05, 0.31);    // belt
    if (look.coat) t.add(P_SKIRT, look.coat, 0, 0.84, 0, 0, 0, 0, 0.66, 0.42, 0.52);
    if (look.stripes) for (const y of [1.1, 1.24]) t.add(P_RING, look.stripes, 0, y, 0, 0, 0, 0, 0.482, 0.055, 0.312);
    if (look.logo && !look.apron && !look.tie) t.add(P_SM, look.logo, 0, 1.27, -0.148, 0, 0, 0, 0.13, 0.13, 0.03);
    if (look.collar || look.tie) { t.box(0.1, 0.07, 0.05, 0xf4f1ea, -0.07, 1.47, -0.13, 0, 0, 0.5); t.box(0.1, 0.07, 0.05, 0xf4f1ea, 0.07, 1.47, -0.13, 0, 0, -0.5); }
    if (look.tie) { t.box(0.06, 0.3, 0.02, look.tie, 0, 1.28, -0.158); t.box(0.08, 0.06, 0.03, look.tie, 0, 1.44, -0.15); }
    if (look.apron) { t.box(0.4, 0.62, 0.03, look.apron, 0, 1.05, -0.158); t.box(0.3, 0.04, 0.03, look.apron, 0, 1.4, -0.14); }
    if (look.cape) t.box(0.52, 0.85, 0.04, look.cape, 0, 1.08, 0.18, -0.08);
    if (look.scarf) { t.add(P_RING, look.scarf, 0, 1.51, 0, 0, 0, 0, 0.3, 0.1, 0.3); t.box(0.1, 0.3, 0.04, look.scarf, 0.08, 1.36, -0.15); }
    if (look.bag) { // a backpack, with straps
      t.add(P_CAP, look.bag, 0, 1.2, 0.21, 0, 0, 0, 0.34, 0.2, 0.2);
      t.add(P_SM, shade(look.bag, 0.75), 0, 1.12, 0.31, 0, 0, 0, 0.22, 0.16, 0.06);
      t.box(0.05, 0.44, 0.02, shade(look.bag, 0.75), -0.15, 1.25, -0.15); t.box(0.05, 0.44, 0.02, shade(look.bag, 0.75), 0.15, 1.25, -0.15);
    }
    body.add(part(t, true));
    // ---- head (its own group: it can turn and nod)
    const head = new THREE.Group();
    head.position.set(0, 1.56, 0);
    if (kid) head.scale.setScalar(1.22);
    body.add(head);
    const hm = new Merge(), dark = 0x1c1a24;
    hm.add(P_SPH, skin, 0, 0.175, 0, 0, 0, 0, 0.38, 0.4, 0.38);
    hm.add(P_SM, skin, -0.188, 0.15, 0.01, 0, 0, 0, 0.06, 0.1, 0.07); hm.add(P_SM, skin, 0.188, 0.15, 0.01, 0, 0, 0, 0.06, 0.1, 0.07);     // ears
    hm.add(P_SM, shade(skin, 0.9), 0, 0.118, -0.192, 0, 0, 0, 0.055, 0.055, 0.06);                                                         // nose
    const angry = look.mood === 'angry';
    for (const sx of [-1, 1]) {
      hm.add(P_SM, 0xffffff, sx * 0.08, 0.18, -0.166, 0, 0, 0, 0.1, 0.115, 0.05);                                                          // eye
      hm.add(P_SM, dark, sx * 0.08, 0.178, -0.186, 0, 0, 0, 0.055, 0.07, 0.03);                                                            // pupil
      hm.add(P_SM, 0xffffff, sx * 0.08 + 0.014, 0.196, -0.198, 0, 0, 0, 0.018, 0.018, 0.01);                                               // glint
      hm.box(0.09, 0.022, 0.02, shade(hair, 0.8), sx * 0.082, angry ? 0.25 : 0.262, -0.162, 0, 0, angry ? sx * 0.45 : -sx * 0.1);          // brow
    }
    if (look.beard) {
      hm.add(P_SPH, hair, 0, 0.0, -0.06, 0, 0, 0, 0.35, 0.2, 0.3);
      hm.box(0.14, 0.03, 0.03, hair, 0, 0.076, -0.187);
    } else if (angry) hm.box(0.1, 0.025, 0.02, 0x7a2a2a, 0, 0.046, -0.158);
    else { hm.box(0.09, 0.022, 0.02, 0x8a3a3a, 0, 0.048, -0.158); hm.box(0.03, 0.02, 0.02, 0x8a3a3a, -0.055, 0.057, -0.152, 0, 0, -0.6); hm.box(0.03, 0.02, 0.02, 0x8a3a3a, 0.055, 0.057, -0.152, 0, 0, 0.6); }
    if (look.glasses) {
      for (const sx of [-1, 1]) { hm.box(0.13, 0.014, 0.014, dark, sx * 0.083, 0.236, -0.205); hm.box(0.13, 0.014, 0.014, dark, sx * 0.083, 0.124, -0.205); hm.box(0.014, 0.112, 0.014, dark, sx * 0.02, 0.18, -0.205); hm.box(0.014, 0.112, 0.014, dark, sx * 0.146, 0.18, -0.205); hm.box(0.014, 0.014, 0.21, dark, sx * 0.183, 0.19, -0.1); }
      hm.box(0.04, 0.014, 0.014, dark, 0, 0.19, -0.205);
    }
    // hair: style 0 short, 1 long, 2 bun, 3 ponytail, 4 curly, 5 spiky, 6 bob, 7 thin on top, 8 side part
    const style = look.style != null ? look.style : (look.long ? LONG_HAIR[(look.hs || 0) % LONG_HAIR.length] : SHORT_HAIR[(look.hs || 0) % SHORT_HAIR.length]);
    const covered = look.hat || look.beanie;
    if (style === 4) hm.add(P_SPH, hair, 0, 0.26, 0.035, 0, 0, 0, covered ? 0.44 : 0.53, covered ? 0.38 : 0.48, 0.49);
    else if (style === 7) { hm.add(P_SM, hair, -0.175, 0.2, 0.04, 0, 0, 0, 0.1, 0.17, 0.26); hm.add(P_SM, hair, 0.175, 0.2, 0.04, 0, 0, 0, 0.1, 0.17, 0.26); hm.add(P_SM, hair, 0, 0.16, 0.16, 0, 0, 0, 0.32, 0.22, 0.1); }
    else {
      hm.add(P_DOME, hair, 0, 0.17, 0.012, 0.5, 0, 0, 0.405, 0.44, 0.415);                              // the cap of hair, tipped back off the forehead
      if (!covered && style !== 5) hm.add(P_SM, hair, style === 8 ? -0.05 : 0, 0.325, -0.105, 0.55, 0, style === 8 ? 0.35 : 0, 0.33, 0.1, 0.2);   // a fringe
    }
    if (style === 1) { hm.add(P_CAP, hair, 0, 0, 0.14, 0.12, 0, 0, 0.38, 0.27, 0.16); hm.add(P_CAP, hair, -0.18, 0.06, 0.03, 0, 0, 0, 0.09, 0.2, 0.17); hm.add(P_CAP, hair, 0.18, 0.06, 0.03, 0, 0, 0, 0.09, 0.2, 0.17); }
    if (style === 2) hm.add(P_SM, hair, 0, 0.39, 0.1, 0, 0, 0, 0.18, 0.17, 0.18);
    if (style === 3) { hm.add(P_SM, hair, 0, 0.31, 0.2, 0, 0, 0, 0.1, 0.1, 0.1); hm.add(P_CAP, hair, 0, 0.14, 0.29, 0.5, 0, 0, 0.1, 0.18, 0.1); }
    if (style === 5 && !covered) for (let k = 0; k < 5; k++) hm.add(CONE, hair, 0, 0.405 - Math.abs(k - 2) * 0.012, -0.12 + k * 0.068, -0.5 + k * 0.25, 0, 0, 0.12, 0.18, 0.12);
    if (style === 6) hm.add(P_CAP, hair, 0, 0.12, 0.075, 0, 0, 0, 0.45, 0.2, 0.31);
    if (look.hat) { hm.add(P_DOME, look.hat, 0, 0.235, 0.005, 0.1, 0, 0, 0.425, 0.39, 0.435); hm.add(P_SM, look.hat, 0, 0.272, -0.25, 0.1, 0, 0, 0.31, 0.035, 0.27); hm.add(P_SM, shade(look.hat, 0.7), 0, 0.43, 0.03, 0, 0, 0, 0.05, 0.03, 0.05); }
    if (look.beanie) { hm.add(P_DOME, look.beanie, 0, 0.21, 0.01, 0.3, 0, 0, 0.432, 0.46, 0.44); hm.add(P_RING, shade(look.beanie, 0.8), 0, 0.272, 0.012, 0.3, 0, 0, 0.437, 0.08, 0.445); hm.add(P_SM, 0xf4f1ea, 0, 0.46, 0.05, 0, 0, 0, 0.1, 0.1, 0.1); }
    if (look.crown) { // a cardboard crown, worn with pride
      hm.add(P_RING, 0xf2c14e, 0, 0.385, 0.01, 0, 0, 0, 0.32, 0.1, 0.32);
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; hm.add(CONE, 0xf2c14e, Math.sin(a) * 0.145, 0.475, 0.01 - Math.cos(a) * 0.145, 0, 0, 0, 0.09, 0.12, 0.09); }
      hm.add(P_SM, 0xe8453c, 0, 0.385, -0.155, 0, 0, 0, 0.06, 0.06, 0.03);
    }
    if (look.phones) { hm.add(P_RING, 0x24262e, 0, 0.2, 0.01, 0, 0, Math.PI / 2, 0.44, 0.04, 0.42); for (const sx of [-1, 1]) hm.add(P_SM, look.phones, sx * 0.21, 0.15, 0.01, 0, 0, 0, 0.07, 0.15, 0.15); }
    head.add(part(hm, true));
    // ---- limbs: a pivot at the hip / shoulder, a second one at the knee / elbow
    const limb = (x, y, upper, lower, lenA, lenB, wA, wB, end) => {
      const pivot = new THREE.Group(); pivot.position.set(x, y, 0); body.add(pivot);
      const a = new Merge();
      a.add(P_CAP, upper, 0, -lenA / 2 + wA * 0.2, 0, 0, 0, 0, wA, (lenA + wA * 0.6) / 2, wA);
      pivot.add(part(a, true));
      const joint = new THREE.Group(); joint.position.set(0, -lenA, 0); pivot.add(joint);
      const b = new Merge();
      b.add(P_CAP, lower, 0, -lenB / 2 + wB * 0.15, 0, 0, 0, 0, wB, (lenB + wB * 0.5) / 2, wB);
      end(b, lenB);
      joint.add(part(b, false));
      const tip = new THREE.Group(); tip.position.set(0, -lenB, 0); joint.add(tip);
      return [pivot, joint, tip];
    };
    const bare = look.dress || look.shorts, legC = look.dress ? skin : pants;
    const foot = (m, len) => { m.add(P_SM, shoe, 0, -len - 0.002, -0.06, 0, 0, 0, 0.21, 0.14, 0.34); m.box(0.185, 0.035, 0.3, shade(shoe, 0.5), 0, -len - 0.054, -0.055); if (bare) m.add(P_RING, 0xf4f1ea, 0, -len + 0.09, 0, 0, 0, 0, 0.17, 0.08, 0.17); };
    const hand = (m, len) => { m.add(P_SM, skin, 0, -len - 0.02, 0, 0, 0, 0, 0.13, 0.15, 0.12); if (look.sleeve !== 'short' && look.sleeve !== 'none' && !look.dress) m.add(P_RING, shade(shirt, 0.8), 0, -len + 0.06, 0, 0, 0, 0, 0.135, 0.04, 0.135); };
    const [legL, kneeL] = limb(-0.12, 0.9, legC, bare ? skin : pants, 0.42, 0.42, 0.225, 0.185, foot);
    const [legR, kneeR] = limb(0.12, 0.9, legC, bare ? skin : pants, 0.42, 0.42, 0.225, 0.185, foot);
    const up = look.sleeve === 'none' ? skin : shirt, low = look.sleeve === 'long' || (look.sleeve == null && !look.dress) || look.coat ? shirt : skin;
    const [armL, elbowL, handL] = limb(-0.315, 1.42, up, low, 0.29, 0.28, 0.15, 0.125, hand);
    const [armR, elbowR, handR] = limb(0.315, 1.42, up, low, 0.29, 0.28, 0.15, 0.125, hand);
    armL.rotation.z = -0.08; armR.rotation.z = 0.08;
    g.userData = { body, head, legL, legR, kneeL, kneeR, armL, armR, elbowL, elbowR, handL, handR, phase: Math.random() * 6, kind: 'person', kid };
    body.scale.x = look.build || 1;
    g.scale.setScalar(look.h || 1);
    return g;
  };
  // Walk / run / idle and the poses (sit, ground, ride, pedal, air, wave, dance) for anything made by W.person or W.animal.
  // Limbs hang down, so a positive rotation.x swings them forward; knees bend back (negative), elbows forward (positive).
  W.animate = function (g, speed, dt, pose) {
    const u = g.userData;
    if (u.kind === 'animal') {
      u.phase += dt * (4 + speed * 3);
      const a = Math.min(1, speed / 2) * 0.6;
      u.legs.forEach((l, i) => { l.rotation.x = Math.sin(u.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * a; });
      if (u.tail) u.tail.rotation.y = Math.sin(u.phase * 1.7) * 0.6;
      if (u.head && speed < 0.1) u.head.rotation.x = Math.max(0, Math.sin(u.phase * 0.5)) * 0.5;
      return;
    }
    const L = u.legL.rotation, R = u.legR.rotation, KL = u.kneeL.rotation, KR = u.kneeR.rotation, AL = u.armL.rotation, AR = u.armR.rotation, EL = u.elbowL.rotation, ER = u.elbowR.rotation, B = u.body, H = u.head.rotation;
    L.z = R.z = 0; AL.z = -0.08; AR.z = 0.08; EL.z = ER.z = 0; B.rotation.set(0, 0, 0); H.x = H.y = H.z = 0; B.position.y = 0;
    if (pose === 'sit') { L.x = R.x = 1.45; KL.x = KR.x = -1.45; B.position.y = -0.45; AL.x = AR.x = 0.35; EL.x = ER.x = 0.5; return; }
    if (pose === 'ground') { // on a blanket, legs crossed, hands in the lap
      u.phase += dt;
      L.x = R.x = 1.4; L.z = -0.55; R.z = 0.55; KL.x = KR.x = -2.0; B.position.y = -0.74; B.rotation.x = -0.06;
      AL.x = AR.x = 0.5; AL.z = -0.2; AR.z = 0.2; EL.x = ER.x = 0.9; H.y = Math.sin(u.phase * 0.5) * 0.35; H.x = Math.sin(u.phase * 0.31) * 0.08;
      return;
    }
    if (pose === 'ride') { L.x = 0.3; R.x = 0.12; KL.x = -0.5; KR.x = -0.35; AL.x = 0.25; AR.x = 0.25; AL.z = -0.45; AR.z = 0.45; EL.x = ER.x = 0.4; B.rotation.x = -0.12; B.position.y = -0.03; return; }
    if (pose === 'pedal') {
      u.phase += dt * (2 + speed);
      const s = Math.sin(u.phase);
      L.x = 1.0 + s * 0.42; R.x = 1.0 - s * 0.42; KL.x = -1.25 - s * 0.45; KR.x = -1.25 + s * 0.45;
      AL.x = AR.x = 1.05; EL.x = ER.x = 0.25; B.position.y = -0.3; B.rotation.x = -0.28; H.x = 0.2;
      return;
    }
    if (pose === 'air') { L.x = 0.75; KL.x = -1.0; R.x = -0.3; KR.x = -0.55; AL.x = 2.5; AR.x = 2.7; AL.z = -0.35; AR.z = 0.35; EL.x = ER.x = 0.3; return; }
    if (pose === 'wave') {
      u.phase += dt * 6;
      const s = Math.sin(u.phase);
      L.x = R.x = KL.x = KR.x = 0; AL.x = 0; EL.x = 0.15;
      AR.x = 0; AR.z = 2.5 + s * 0.12; ER.x = 0; ER.z = 0.55 + s * 0.45; H.z = -0.08; H.y = 0;
      return;
    }
    if (pose === 'dance') {
      u.phase += dt * 7;
      const s = Math.sin(u.phase), c = Math.cos(u.phase);
      AL.x = 2.3 + s * 0.7; AR.x = 2.3 - s * 0.7; AL.z = -0.3; AR.z = 0.3; EL.x = 0.7 + c * 0.4; ER.x = 0.7 - c * 0.4;
      L.x = s * 0.4; R.x = -s * 0.4; KL.x = -Math.max(0, c) * 0.9; KR.x = -Math.max(0, -c) * 0.9;
      B.position.y = Math.abs(s) * 0.12; B.rotation.y = s * 0.3; H.z = s * 0.15;
      return;
    }
    // walking and running: legs swing, the knee of the leg coming forward folds, arms counter-swing with bent elbows
    u.phase += dt * (3 + speed * 1.25);
    const run = Math.min(1, Math.max(0, (speed - 6) / 5)), amp = Math.min(1, speed / 6) * (0.75 + run * 0.3);
    const s = Math.sin(u.phase), c = Math.cos(u.phase);
    L.x = s * amp; R.x = -s * amp;
    KL.x = -(Math.max(0, c) * (1.0 + run * 0.7) + 0.08) * amp; KR.x = -(Math.max(0, -c) * (1.0 + run * 0.7) + 0.08) * amp;
    AL.x = -s * amp * (0.8 + run * 0.4); AR.x = s * amp * (0.8 + run * 0.4);
    EL.x = 0.12 + amp * (0.35 + run * 0.9) + Math.max(0, -s) * amp * 0.3; ER.x = 0.12 + amp * (0.35 + run * 0.9) + Math.max(0, s) * amp * 0.3;
    B.position.y = Math.abs(c) * 0.06 * amp;
    B.rotation.x = -Math.min(0.3, speed / 36);
    B.rotation.y = -s * amp * 0.12;
    H.y = s * amp * 0.1;
    if (amp < 0.05) { // standing: breathing, a look around now and then
      const k = Math.sin(u.phase * 0.5);
      AL.z = -0.08 - k * 0.012; AR.z = 0.08 + k * 0.012; EL.x = ER.x = 0.14;
      H.y = Math.sin(u.phase * 0.17) * 0.3; H.x = Math.sin(u.phase * 0.11) * 0.06;
    }
  };
  // Animals: dog, cat, pigeon, duck
  W.animal = function (kind, color) {
    const g = new THREE.Group(), body = new Merge();
    const c = color || (kind === 'dog' ? 0xc8894a : kind === 'cat' ? 0x6b6b6b : kind === 'duck' ? 0x8a6a3a : 0x8b8f9c);
    const legs = [];
    let head = null, tail = null;
    if (kind === 'pigeon' || kind === 'duck') {
      const s = kind === 'duck' ? 1.4 : 1;
      body.box(0.16 * s, 0.14 * s, 0.26 * s, c, 0, 0.14 * s, 0);
      body.box(0.1 * s, 0.1 * s, 0.1 * s, kind === 'duck' ? 0x2f6b3a : 0x5c6f8a, 0, 0.25 * s, -0.12 * s);
      body.box(0.04 * s, 0.03 * s, 0.07 * s, 0xe0a030, 0, 0.24 * s, -0.2 * s);
      body.box(0.12 * s, 0.03 * s, 0.12 * s, c, 0, 0.16 * s, 0.17 * s);
      const m = body.mesh(); g.add(m);
      g.userData = { kind: 'animal', legs: [], phase: Math.random() * 6, bird: true, head: m };
      return g;
    }
    const L = kind === 'cat' ? 0.45 : 0.62, H = kind === 'cat' ? 0.2 : 0.28, legH = kind === 'cat' ? 0.18 : 0.26;
    body.box(0.26, H, L, c, 0, legH + H / 2, 0);
    g.add(body.mesh());
    const hm = new Merge();
    hm.box(0.24, 0.22, 0.24, c, 0, 0, -0.08);
    hm.box(0.12, 0.1, 0.14, kind === 'cat' ? c : 0x3a2a1a, 0, -0.05, -0.24);
    hm.box(0.06, kind === 'cat' ? 0.1 : 0.14, 0.04, kind === 'cat' ? c : 0x7a4a2a, -0.08, 0.15, -0.04);
    hm.box(0.06, kind === 'cat' ? 0.1 : 0.14, 0.04, kind === 'cat' ? c : 0x7a4a2a, 0.08, 0.15, -0.04);
    hm.box(0.04, 0.04, 0.02, 0x111111, -0.06, 0.04, -0.21); hm.box(0.04, 0.04, 0.02, 0x111111, 0.06, 0.04, -0.21);
    head = new THREE.Group(); head.position.set(0, legH + H + 0.05, -L / 2); head.add(hm.mesh()); g.add(head);
    const tm = new Merge(); tm.box(0.06, 0.06, kind === 'cat' ? 0.34 : 0.24, c, 0, 0, 0.12, kind === 'cat' ? -0.6 : -0.5);
    tail = new THREE.Group(); tail.position.set(0, legH + H * 0.8, L / 2); tail.add(tm.mesh()); g.add(tail);
    for (const [x, z] of [[-0.09, -L / 2 + 0.07], [0.09, -L / 2 + 0.07], [-0.09, L / 2 - 0.07], [0.09, L / 2 - 0.07]]) {
      const p = new THREE.Group(); p.position.set(x, legH, z);
      const lm = new Merge(); lm.box(0.07, legH, 0.07, c, 0, -legH / 2, 0); p.add(lm.mesh()); g.add(p); legs.push(p);
    }
    g.userData = { kind: 'animal', legs, head, tail, phase: Math.random() * 6 };
    return g;
  };
  // Monsters (cartoon ones: you bonk them, they pop into coins). Each has googly eyes and its own wobble.
  // kind: slime | bin | cone | sock | pigeon | goose | blob (the big purple boss). W.animateMonster(g, dt, speed) moves it.
  const eye = (m, x, y, z, r) => { m.add(SPHERE, 0xffffff, x, y, z, 0, 0, 0, r, r, r); m.add(SPHERE, 0x111111, x, y, z - r * 0.36, 0, 0, 0, r * 0.5, r * 0.5, r * 0.4); };
  const slimeMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.86 });
  W.monster = function (kind) {
    const g = new THREE.Group(), body = new THREE.Group(), m = new Merge();
    g.add(body);
    let mat = MAT.vc, h = 1, lid = null;
    if (kind === 'slime' || kind === 'blob') {
      const c = kind === 'blob' ? 0x9b5cf6 : [0x4ade80, 0x38bdf8, 0xf472b6, 0xfacc15][Math.random() * 4 | 0];
      m.add(SPHERE, c, 0, 0.5, 0, 0, 0, 0, 1.3, 1.0, 1.3);
      m.add(SPHERE, c, 0, 0.18, 0, 0, 0, 0, 1.5, 0.4, 1.5);
      eye(m, -0.24, 0.72, -0.5, 0.26); eye(m, 0.24, 0.72, -0.5, 0.26);
      m.box(0.34, 0.06, 0.06, 0x111111, 0, 0.42, -0.62);
      if (kind === 'blob') { m.box(0.5, 0.12, 0.5, 0xf2c14e, 0, 1.04, 0); for (const cx of [-0.2, 0, 0.2]) m.box(0.1, 0.2, 0.1, 0xf2c14e, cx, 1.18, -0.2); }
      mat = slimeMat; h = kind === 'blob' ? 3 : 1;
    } else if (kind === 'bin') {
      m.add(CYL, 0x5d6b78, 0, 0.62, 0, 0, 0, 0, 0.8, 1.0, 0.8);
      m.box(0.16, 0.2, 0.28, 0x2f8f5b, -0.22, 0.1, -0.05); m.box(0.16, 0.2, 0.28, 0x2f8f5b, 0.22, 0.1, -0.05);
      eye(m, -0.18, 1.0, -0.36, 0.2); eye(m, 0.18, 1.0, -0.36, 0.2);
      m.box(0.4, 0.05, 0.05, 0x111111, 0, 0.7, -0.41); for (const tx of [-0.12, 0, 0.12]) m.box(0.07, 0.09, 0.04, 0xffffff, tx, 0.65, -0.42);
      const lm = new Merge(); lm.add(CYL, 0x48535e, 0, 0.05, 0.42, 0, 0, 0, 0.9, 0.1, 0.9); lm.box(0.2, 0.08, 0.08, 0x2a3138, 0, 0.14, 0.42);
      lid = new THREE.Group(); lid.position.set(0, 1.13, -0.42); lid.add(lm.mesh()); body.add(lid);
      h = 1.25;
    } else if (kind === 'cone') {
      m.add(CONE, 0xff7a1a, 0, 0.75, 0, 0, 0, 0, 0.8, 1.3, 0.8); m.box(0.9, 0.1, 0.9, 0xff7a1a, 0, 0.15, 0);
      m.add(CYL, 0xffffff, 0, 0.62, 0, 0, 0, 0, 0.56, 0.16, 0.56);
      eye(m, -0.14, 0.92, -0.2, 0.17); eye(m, 0.14, 0.92, -0.2, 0.17);
      m.box(0.12, 0.14, 0.2, 0x333333, -0.2, 0.05, -0.1); m.box(0.12, 0.14, 0.2, 0x333333, 0.2, 0.05, -0.1);
      h = 1.2;
    } else if (kind === 'sock') {
      m.box(0.5, 1.2, 0.34, 0xf4f1ea, 0, 1.1, 0); m.box(0.5, 0.34, 0.72, 0xf4f1ea, 0, 0.45, -0.18);
      m.box(0.52, 0.12, 0.36, 0xe8453c, 0, 1.55, 0); m.box(0.52, 0.12, 0.36, 0x2b6cb0, 0, 1.35, 0);
      eye(m, -0.13, 1.1, -0.2, 0.18); eye(m, 0.13, 1.1, -0.2, 0.18);
      m.box(0.2, 0.2, 0.04, 0x111111, 0, 0.82, -0.18);
      h = 1.8;
    } else { // pigeon (a very large one) and goose (a very angry one)
      const goose = kind === 'goose', c = goose ? 0xf4f1ea : 0x8b8f9c;
      m.add(SPHERE, c, 0, 0.75, 0.05, 0, 0, 0, 0.9, 0.8, 1.3);
      m.box(0.5, 0.1, 0.5, c, 0, 0.72, 0.75, 0.3);
      if (goose) { m.box(0.2, 0.9, 0.2, c, 0, 1.4, -0.5, 0.25); m.box(0.3, 0.26, 0.34, c, 0, 1.9, -0.62); m.box(0.16, 0.1, 0.34, 0xff8a1a, 0, 1.86, -0.92); eye(m, -0.14, 1.96, -0.74, 0.1); eye(m, 0.14, 1.96, -0.74, 0.1); }
      else { m.add(SPHERE, 0x5c6f8a, 0, 1.3, -0.5, 0, 0, 0, 0.6, 0.6, 0.6); m.box(0.14, 0.1, 0.26, 0xe0a030, 0, 1.26, -0.86); eye(m, -0.2, 1.4, -0.7, 0.18); eye(m, 0.2, 1.4, -0.7, 0.18); m.box(0.5, 0.06, 0.06, 0x333333, 0, 1.56, -0.74, 0, 0, 0.3); }
      m.box(0.08, 0.36, 0.08, 0xe0a030, -0.2, 0.18, 0); m.box(0.08, 0.36, 0.08, 0xe0a030, 0.2, 0.18, 0);
      h = goose ? 2.1 : 1.7;
    }
    const mesh = m.mesh(mat);
    body.add(mesh);
    g.userData = { kind: 'monster', mkind: kind, body, lid, phase: Math.random() * 6, h, hurt: 0 };
    return g;
  };
  W.animateMonster = function (g, dt, speed) {
    const u = g.userData, b = u.body;
    u.phase += dt * (3 + speed * 1.6);
    const s = Math.sin(u.phase), k = u.mkind;
    if (k === 'slime' || k === 'blob') { const q = 1 + s * 0.14; b.scale.set(1 / Math.sqrt(q), q, 1 / Math.sqrt(q)); b.position.y = Math.max(0, s) * (speed > 0.3 ? 0.5 : 0.08); }
    else if (k === 'sock') { b.position.y = 0.25 + s * 0.14; b.rotation.z = s * 0.14; }
    else if (k === 'bin') { b.rotation.z = s * 0.1 * Math.min(1, speed); b.position.y = Math.abs(s) * 0.08 * Math.min(1, speed); if (u.lid) u.lid.rotation.x = -Math.max(0, Math.sin(u.phase * 0.7)) * 0.7; }
    else { b.rotation.z = s * 0.12 * Math.min(1, speed + 0.2); b.position.y = Math.abs(s) * 0.1 * Math.min(1, speed + 0.2); }
    if (u.hurt > 0) { u.hurt -= dt; const f = 1 + Math.sin(u.hurt * 40) * 0.12; g.scale.setScalar((u.size || 1) * f); } else g.scale.setScalar(u.size || 1);
  };
  // Things to hold (and swing). W.setWeapon(kind | null) puts one in the player's right hand, W.swing() swings it.
  W.propMesh = function (kind) {
    const m = new Merge();
    switch (kind) {
      case 'baguette': m.box(0.1, 0.1, 0.9, 0xd9a05b, 0, 0, -0.4); for (const z of [-0.2, -0.45, -0.7]) m.box(0.11, 0.02, 0.05, 0xb97a3a, 0, 0.05, z, 0, 0.5); break;
      case 'chicken': m.box(0.16, 0.2, 0.5, 0xf7d94c, 0, 0, -0.3); m.box(0.12, 0.14, 0.16, 0xf7d94c, 0, 0.1, -0.6); m.box(0.05, 0.1, 0.1, 0xe8453c, 0, 0.2, -0.6); m.box(0.05, 0.04, 0.1, 0xff8a1a, 0, 0.08, -0.72); m.box(0.05, 0.05, 0.22, 0xff8a1a, 0, -0.08, 0); break;
      case 'pillow': m.box(0.5, 0.2, 0.7, 0xf4f1ea, 0, 0, -0.45); m.box(0.52, 0.06, 0.2, 0x9fc3dd, 0, 0, -0.45); break;
      case 'noodle': m.add(CYL, 0x35e06a, 0, 0, -0.65, Math.PI / 2, 0, 0, 0.14, 1.5, 0.14); break;
      case 'fish': m.box(0.08, 0.26, 0.8, 0x8fb6c9, 0, 0, -0.45); m.box(0.06, 0.34, 0.2, 0x6f96a9, 0, 0, -0.02); m.box(0.09, 0.06, 0.06, 0x111111, 0, 0.05, -0.76); break;
      case 'plunger': m.add(CYL, 0x9a6a3c, 0, 0, -0.45, Math.PI / 2, 0, 0, 0.06, 0.9, 0.06); m.add(CONE, 0xc0392b, 0, 0, -0.95, -Math.PI / 2, 0, 0, 0.34, 0.24, 0.34); break;
      case 'guitar': m.box(0.36, 0.08, 0.5, 0xe8453c, 0, 0, -0.75); m.box(0.08, 0.05, 0.75, 0x5b4636, 0, 0, -0.22); m.box(0.14, 0.06, 0.16, 0x1f1a3d, 0, 0, 0.18); break;
      case 'blower': m.box(0.24, 0.26, 0.4, 0xf2b134, 0, 0, -0.15); m.add(CYL, 0x33373f, 0, -0.02, -0.7, Math.PI / 2, 0, 0, 0.16, 0.8, 0.16); m.box(0.06, 0.16, 0.2, 0x1f1a3d, 0, 0.2, -0.1); break;
      case 'bubble': m.box(0.12, 0.2, 0.34, 0xff5c8a, 0, 0, -0.18); m.add(CYL, 0x9fe3d0, 0, 0.04, -0.46, Math.PI / 2, 0, 0, 0.2, 0.24, 0.2); m.box(0.08, 0.2, 0.1, 0xff5c8a, 0, -0.14, -0.06); break;
      case 'sign': m.box(0.05, 0.9, 0.05, 0x9a6a3c, 0, 0.3, 0); m.box(0.7, 0.45, 0.04, 0xc9a26a, 0, 0.9, 0); break;
      case 'cup': m.add(CYL, 0xf4f1ea, 0, 0.09, 0, 0, 0, 0, 0.16, 0.18, 0.16); break;
      case 'blanket': m.box(0.9, 0.06, 1.3, 0x7b52c7, 0, 0.03, 0); m.box(0.9, 0.065, 0.2, 0xf2b134, 0, 0.03, -0.3); m.box(0.9, 0.065, 0.2, 0xf2b134, 0, 0.03, 0.3); break;
      case 'cart': m.box(0.7, 0.5, 1.0, 0xb9c0c8, 0, 0.75, 0); m.box(0.6, 0.3, 0.9, 0x8a5a2b, 0, 1.0, 0); m.box(0.7, 0.05, 0.05, 0xe8453c, 0, 1.05, 0.6); for (const [x, z] of [[-0.3, -0.4], [0.3, -0.4], [-0.3, 0.4], [0.3, 0.4]]) m.add(CYL, 0x222428, x, 0.12, z, 0, 0, Math.PI / 2, 0.24, 0.08, 0.24); m.box(0.04, 0.4, 0.04, 0xb9c0c8, -0.3, 0.35, 0); m.box(0.04, 0.4, 0.04, 0xb9c0c8, 0.3, 0.35, 0); break;
      case 'peel': m.box(0.3, 0.05, 0.12, 0xf7d94c, 0, 0.04, 0, 0, 0.5); m.box(0.3, 0.05, 0.12, 0xf7d94c, 0, 0.04, 0, 0, -0.6); m.box(0.12, 0.12, 0.12, 0xe9c63a, 0, 0.1, 0); break;
      case 'pad': m.add(CYL, 0x1f1a3d, 0, 0.1, 0, 0, 0, 0, 2.0, 0.2, 2.0); m.add(CYL, 0xff5c8a, 0, 0.22, 0, 0, 0, 0, 1.7, 0.08, 1.7); m.add(CYL, 0xffc21f, 0, 0.27, 0, 0, 0, 0, 0.9, 0.06, 0.9); break;
      case 'ufo': m.add(SPHERE, 0xb9c0c8, 0, 0, 0, 0, 0, 0, 5, 1.0, 5); m.add(SPHERE, 0x9fe3d0, 0, 0.5, 0, 0, 0, 0, 2.2, 1.6, 2.2); for (let i = 0; i < 8; i++) m.add(SPHERE, [0xff5c8a, 0xffc21f, 0x35e06a][i % 3], Math.cos(i * 0.785) * 2.1, -0.15, Math.sin(i * 0.785) * 2.1, 0, 0, 0, 0.4, 0.3, 0.4); break;
      case 'crate': m.box(0.9, 0.9, 0.9, 0xc9a26a, 0, 0.45, 0); m.box(0.94, 0.12, 0.94, 0xe8453c, 0, 0.45, 0); m.box(0.12, 0.94, 0.94, 0xe8453c, 0, 0.45, 0); break;
      case 'chute': m.add(SPHERE, 0xff5c8a, 0, 2.6, 0, 0, 0, 0, 2.4, 1.3, 2.4); m.box(0.03, 2.1, 0.03, 0xf4f1ea, -0.6, 1.5, 0, 0, 0, 0.3); m.box(0.03, 2.1, 0.03, 0xf4f1ea, 0.6, 1.5, 0, 0, 0, -0.3); break;
      case 'pin': m.add(CYL, 0xc9a26a, 0, 0, -0.4, Math.PI / 2, 0, 0, 0.12, 0.6, 0.12); m.add(CYL, 0x9a6a3c, 0, 0, -0.02, Math.PI / 2, 0, 0, 0.05, 0.2, 0.05); m.add(CYL, 0x9a6a3c, 0, 0, -0.78, Math.PI / 2, 0, 0, 0.05, 0.2, 0.05); break;
      default: m.box(0.1, 0.1, 0.6, 0x9a6a3c, 0, 0, -0.3); break;
    }
    return m.mesh();
  };
  // Vehicles: skateboard, kickscooter, bike, moped, car, suv, sports (+ taxi, van, bus, truck, police in traffic). Facing -z.
  W.vehicle = function (kind, color) {
    const m = new Merge(), col = color || 0xe8453c, dark = 0x222428, glass = 0x9fc3dd, chrome = 0xcfd3d6;
    const wheel = (x, y, z, r, w) => m.add(CYL, dark, x, y, z, 0, 0, Math.PI / 2, r * 2, w, r * 2);
    if (kind === 'skateboard') { m.box(0.26, 0.05, 0.86, col, 0, 0.12, 0); wheel(-0.09, 0.05, -0.28, 0.05, 0.05); wheel(0.09, 0.05, -0.28, 0.05, 0.05); wheel(-0.09, 0.05, 0.28, 0.05, 0.05); wheel(0.09, 0.05, 0.28, 0.05, 0.05); }
    else if (kind === 'kickscooter') { m.box(0.16, 0.05, 0.8, col, 0, 0.12, 0); m.box(0.05, 1.0, 0.05, chrome, 0, 0.6, -0.4); m.box(0.5, 0.05, 0.05, dark, 0, 1.1, -0.4); wheel(0, 0.08, -0.4, 0.08, 0.06); wheel(0, 0.08, 0.38, 0.08, 0.06); }
    else if (kind === 'bike') { wheel(0, 0.34, -0.52, 0.34, 0.05); wheel(0, 0.34, 0.52, 0.34, 0.05); m.box(0.05, 0.05, 0.95, col, 0, 0.62, 0, -0.1); m.box(0.05, 0.6, 0.05, col, 0, 0.55, 0.2, 0.2); m.box(0.05, 0.6, 0.05, col, 0, 0.62, -0.45, -0.2); m.box(0.2, 0.06, 0.26, dark, 0, 0.92, 0.22); m.box(0.56, 0.05, 0.05, dark, 0, 1.0, -0.5); }
    else if (kind === 'moped') { wheel(0, 0.25, -0.62, 0.25, 0.12); wheel(0, 0.25, 0.55, 0.25, 0.12); m.box(0.36, 0.3, 0.9, col, 0, 0.5, 0.15); m.box(0.32, 0.12, 0.5, dark, 0, 0.72, 0.2); m.box(0.4, 0.75, 0.16, col, 0, 0.7, -0.5, -0.25); m.box(0.62, 0.05, 0.06, chrome, 0, 1.12, -0.62); m.box(0.18, 0.12, 0.05, 0xfff3b0, 0, 0.95, -0.66); }
    else { // cars, and the traffic-only kinds: taxi, van, bus, (ice cream) truck, police
      const big = kind === 'bus', tall = kind === 'van' || kind === 'truck';
      const body = kind === 'taxi' ? 0xf7c21a : kind === 'police' ? 0xf4f1ea : kind === 'truck' ? 0xffd1e3 : kind === 'bus' ? [0x2b6cb0, 0xe8453c, 0x2f9e6e][Math.floor(Math.random() * 3)] : col;
      const L = big ? 7.6 : tall ? 4.7 : kind === 'sports' ? 4.3 : kind === 'suv' ? 4.6 : 3.9, Wd = big ? 2.3 : tall ? 1.95 : kind === 'suv' ? 1.9 : 1.75;
      const H = big ? 1.1 : tall ? 1.0 : kind === 'sports' ? 0.55 : kind === 'suv' ? 0.95 : 0.75, base = 0.32;
      m.box(Wd, H, L, body, 0, base + H / 2, 0);
      const cabL = big ? L * 0.94 : tall ? L * 0.7 : kind === 'sports' ? 1.7 : L * 0.55, cabH = big ? 1.15 : tall ? 0.95 : kind === 'sports' ? 0.42 : kind === 'suv' ? 0.7 : 0.62;
      const cabZ = big ? 0 : tall ? 0.5 : kind === 'sports' ? 0.3 : 0.15;
      m.box(Wd * (big || tall ? 0.97 : 0.88), cabH, cabL, kind === 'truck' ? 0xfdf6e8 : glass, 0, base + H + cabH / 2, cabZ);
      m.box(Wd * (big || tall ? 0.99 : 0.9), 0.06, cabL * (big ? 1 : 0.9), body, 0, base + H + cabH + 0.03, cabZ);
      if (tall) m.box(Wd * 0.86, cabH * 0.6, 0.06, glass, 0, base + H + cabH * 0.55, cabZ - cabL / 2 - 0.02);
      if (big) for (let k = -3; k <= 3; k++) { m.box(0.06, cabH, 0.14, body, -Wd * 0.49, base + H + cabH / 2, k * 1.0); m.box(0.06, cabH, 0.14, body, Wd * 0.49, base + H + cabH / 2, k * 1.0); }
      if (kind === 'taxi') { m.box(0.5, 0.16, 0.24, 0x1f1a3d, 0, base + H + cabH + 0.14, cabZ); for (let k = -3; k <= 3; k++) m.box(0.02, 0.12, 0.26, k % 2 ? 0x1f1a3d : 0xf4f1ea, Wd / 2 + 0.005, base + H * 0.75, k * 0.3); }
      if (kind === 'police') { m.box(Wd * 1.01, 0.22, L * 0.5, 0x24324a, 0, base + H * 0.55, 0); }
      if (kind === 'truck') { m.add(CONE, 0xd9a05b, 0, base + H + cabH + 0.55, cabZ, Math.PI, 0, 0, 0.5, 0.9, 0.5); m.add(SPHERE, 0xff8fb8, 0, base + H + cabH + 1.12, cabZ, 0, 0, 0, 0.62, 0.62, 0.62); m.box(1.5, 0.5, 0.05, 0x9fe3d0, Wd / 2 + 0.03, base + H + cabH * 0.5, cabZ + 0.3, 0, Math.PI / 2); }
      if (kind === 'sports') m.box(Wd * 0.9, 0.05, 0.3, dark, 0, base + H + 0.25, L / 2 - 0.2);
      for (const [x, z] of [[-Wd / 2, -L * 0.33], [Wd / 2, -L * 0.33], [-Wd / 2, L * 0.33], [Wd / 2, L * 0.33]]) wheel(x, 0.34, z, 0.34, 0.26);
      // lights are their own unlit mesh, so they shine at night
      const lm = new Merge();
      lm.box(Wd * 0.2, 0.14, 0.05, 0xfff6c8, -Wd * 0.32, base + H * 0.6, -L / 2 - 0.02); lm.box(Wd * 0.2, 0.14, 0.05, 0xfff6c8, Wd * 0.32, base + H * 0.6, -L / 2 - 0.02);
      lm.box(Wd * 0.2, 0.12, 0.05, 0xff2a2a, -Wd * 0.32, base + H * 0.6, L / 2 + 0.02); lm.box(Wd * 0.2, 0.12, 0.05, 0xff2a2a, Wd * 0.32, base + H * 0.6, L / 2 + 0.02);
      if (kind === 'police') { lm.box(0.3, 0.14, 0.2, 0xff3b30, -0.22, base + H + cabH + 0.12, cabZ); lm.box(0.3, 0.14, 0.2, 0x3b82f6, 0.22, base + H + cabH + 0.12, cabZ); }
      if (kind === 'taxi') lm.box(0.4, 0.1, 0.02, 0xfff1a8, 0, base + H + cabH + 0.14, cabZ - 0.13);
      const lights = new THREE.Mesh(lm.build(), MAT.glow);
      const mesh0 = m.mesh(), g0 = new THREE.Group(); g0.add(mesh0, lights);
      g0.userData = { kind: 'vehicle', vkind: kind };
      return g0;
    }
    const mesh = m.mesh(); const g = new THREE.Group(); g.add(mesh);
    g.userData = { kind: 'vehicle', vkind: kind };
    return g;
  };
  // Canvas textures for emoji tokens and text labels (cached)
  const texCache = new Map();
  W.emojiTex = function (emoji, bg, ring) {
    const key = 'e|' + emoji + '|' + bg + '|' + ring;
    if (texCache.has(key)) return texCache.get(key);
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    if (bg) { g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fillStyle = bg; g.fill(); if (ring) { g.lineWidth = 8; g.strokeStyle = ring; g.stroke(); } }
    g.font = (bg ? 72 : 96) + 'px ' + EMOJI_FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(emoji, 64, 70);
    const t = new THREE.CanvasTexture(c);
    texCache.set(key, t);
    return t;
  };
  W.label = function (text, o) {
    o = o || {};
    const key = 'l|' + text + '|' + (o.bg || '') + '|' + (o.fg || '') + '|' + (o.size || 40) + '|' + (o.stroke || '');
    let tex = texCache.get(key);
    if (!tex) {
      const c = document.createElement('canvas'), g = c.getContext('2d'), size = o.size || 40;
      g.font = '700 ' + size + 'px Nunito, system-ui, ' + EMOJI_FONT;
      const w = Math.min(900, Math.ceil(g.measureText(text).width) + size * 0.9), h = Math.round(size * 1.45);
      c.width = w; c.height = h;
      g.fillStyle = o.bg || 'rgba(31,26,61,.86)';
      g.beginPath(); if (g.roundRect) g.roundRect(0, 0, w, h, h * 0.3); else g.rect(0, 0, w, h); g.fill();
      if (o.border) { g.lineWidth = 4; g.strokeStyle = o.border; g.stroke(); }
      g.font = '700 ' + size + 'px Nunito, system-ui, ' + EMOJI_FONT; g.fillStyle = o.fg || '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (o.stroke) { g.lineWidth = size * 0.2; g.lineJoin = 'round'; g.strokeStyle = o.stroke; g.strokeText(text, w / 2, h / 2 + size * 0.05, w - 8); }
      g.fillText(text, w / 2, h / 2 + size * 0.05, w - 8);
      tex = new THREE.CanvasTexture(c);
      tex.userData = { aspect: w / h };
      texCache.set(key, tex);
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: o.depthTest !== false, fog: false }));
    const hgt = o.height || 0.8;
    sp.scale.set(hgt * tex.userData.aspect, hgt, 1);
    sp.userData.h = hgt;
    if (o.depthTest === false) sp.renderOrder = 20;
    return sp;
  };
  W.emojiSprite = function (emoji, size, bg, ring) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: W.emojiTex(emoji, bg, ring), transparent: true, depthWrite: false, fog: false }));
    sp.scale.set(size || 1, size || 1, 1);
    return sp;
  };
  // Speech bubble above an object for a few seconds
  const bubbles = [];
  W.say = function (obj, text, secs) {
    const old = bubbles.find(b => b.obj === obj);
    if (old) { obj.remove(old.sp); bubbles.splice(bubbles.indexOf(old), 1); }
    const sp = W.label(text, { bg: 'rgba(255,255,255,.95)', fg: '#1f1a3d', size: 34, height: 0.55, border: '#1f1a3d' });
    sp.position.set(0, 2.45, 0);
    obj.add(sp);
    bubbles.push({ obj, sp, t: secs || 3 });
  };

  // ---------------------------------------------------------------- the player's character + ride
  const avatar = new THREE.Group();
  avatar.rotation.order = 'YXZ'; // yaw, then the slope tilt for rides
  scene.add(avatar);
  W.avatar = avatar;
  let body = null, rideMesh = null;
  W.setLook = function (look) {
    if (body) { avatar.remove(body); }
    body = W.person(look);
    avatar.add(body);
    body.traverse(o => { if (o.isMesh) o.castShadow = !LOW; });
    applyRidePose();
    holdWeapon();
  };
  let weaponKind = null, weaponMesh = null, swingT = 0;
  function holdWeapon() {
    if (weaponMesh && weaponMesh.parent) weaponMesh.parent.remove(weaponMesh);
    weaponMesh = null;
    if (!weaponKind || !body) return;
    weaponMesh = W.propMesh(weaponKind);
    weaponMesh.position.set(0, -0.03, -0.02);
    weaponMesh.rotation.x = 0.3;
    body.userData.handR.add(weaponMesh);
  }
  W.setWeapon = function (kind) { weaponKind = kind || null; holdWeapon(); };
  W.swing = function () { swingT = 0.3; };
  W.swinging = () => swingT > 0;
  function applyRidePose() {
    if (!body) return;
    const k = ride.kind;
    body.visible = !(k === 'car' || k === 'suv' || k === 'sports');
    body.position.set(0, k === 'skateboard' || k === 'kickscooter' ? 0.15 : k === 'moped' ? 0.1 : k === 'bike' ? 0.32 : 0, k === 'moped' ? 0.15 : 0);
  }
  // spec: {kind: null|'skateboard'|..., mode: 'foot'|'ride'|'drive', walk, run, jump, radius, turn, accel}
  W.setRide = function (spec) {
    ride = Object.assign({ mode: 'foot', walk: 6.2, run: 12.5, jump: 8.5, radius: 0.4, turn: 1.9, accel: 9 }, spec || {});
    if (rideMesh) { avatar.remove(rideMesh); rideMesh = null; }
    if (ride.kind) { rideMesh = W.vehicle(ride.kind, ride.color); avatar.add(rideMesh); }
    player.heading = player.face;
    applyRidePose();
  };
  W.ride = () => ride;

  // Followers (partner, kids, friends, pets) trail the player along a breadcrumb path
  const trail = [];
  let followers = [];
  W.setFollowers = function (list) { // list of THREE groups (from W.person / W.animal) with userData.followSpeed optional
    for (const f of followers) scene.remove(f.obj);
    followers = list.map((obj, i) => ({ obj, i, speed: 0 }));
    for (const f of followers) { const x = player.pos.x + 1 + f.i, z = player.pos.z + 1; f.obj.position.set(x, groundAt(x, z), z); scene.add(f.obj); }
  };
  W.followers = () => followers;
  function updateFollowers(dt) {
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(last.x - player.pos.x, last.z - player.pos.z) > 0.6) { trail.push({ x: player.pos.x, z: player.pos.z }); if (trail.length > 160) trail.shift(); }
    const inCar = ride.mode === 'drive';
    followers.forEach((f, idx) => {
      f.obj.visible = !inCar;
      const want = 2.2 + idx * 1.5;
      let acc = 0, tx = player.pos.x, tz = player.pos.z;
      for (let i = trail.length - 1; i > 0; i--) {
        const a = trail[i], b = trail[i - 1], d = Math.hypot(a.x - b.x, a.z - b.z);
        if (acc + d >= want) { const t = (want - acc) / d; tx = a.x + (b.x - a.x) * t; tz = a.z + (b.z - a.z) * t; break; }
        acc += d; tx = b.x; tz = b.z;
      }
      const p = f.obj.position, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      const maxSp = f.obj.userData.maxSpeed || 14;
      if ((d > 40 && !f.obj.userData.maxSpeed) || d > 120 || inCar) { p.x = tx; p.z = tz; f.speed = 0; }
      else {
        const sp = Math.min(d * 3, maxSp);
        if (d > 0.05) { p.x += dx / d * sp * dt; p.z += dz / d * sp * dt; f.obj.rotation.y += angDiff(Math.atan2(-dx, -dz), f.obj.rotation.y) * Math.min(1, dt * 8); }
        f.speed = d > 0.15 ? sp : 0;
      }
      p.y = surfaceAt(p.x, p.z, player.pos.y + 0.6);
      W.animate(f.obj, f.speed, dt);
    });
  }

  // ---------------------------------------------------------------- movement
  W.lastHit = 0;
  // Rise per metre at the player along (dx, dz): + uphill, - downhill.
  function slopeAlong(dx, dz) {
    const L = Math.hypot(dx, dz);
    if (L < 1e-4 || terr.h0 == null) return 0;
    const ux = dx / L * 1.5, uz = dz / L * 1.5, x = player.pos.x, z = player.pos.z;
    return (groundAt(x + ux, z + uz) - groundAt(x - ux, z - uz)) / 3;
  }
  // Hills change your speed: a lot on boards, scooters and bikes, a little in cars and on foot.
  function slopeMul(sl) {
    const k = ride.mode === 'ride' ? [2.2, 0.55, 1.45] : ride.mode === 'drive' ? [0.9, 0.75, 1.2] : [0.6, 0.8, 1.15];
    return Math.max(k[1], Math.min(k[2], 1 - sl * k[0]));
  }
  function updatePlayer(dt) {
    const ctl = W.controls.enabled;
    const fwdIn = ctl ? input.f - input.b + input.jy : 0, sideIn = ctl ? input.r - input.l + input.jx : 0;
    const sx = player.pos.x, sz = player.pos.z;
    if (ride.mode === 'drive') {
      const boost = ctl && (input.sprint || Math.abs(input.jy) > 0.95);
      const hx = -Math.sin(player.heading), hz = -Math.cos(player.heading), back = player.speed < 0 ? -1 : 1;
      player.slope = slopeAlong(hx * back, hz * back);
      const top = (boost ? ride.run : ride.walk) * (W.speedMul || 1) * slopeMul(player.slope);
      const target = fwdIn > 0 ? top * Math.min(1, fwdIn) : fwdIn < 0 ? -top * 0.35 * Math.min(1, -fwdIn) : 0;
      const rate = (Math.sign(target - player.speed) === Math.sign(player.speed) || player.speed === 0) ? ride.accel : ride.accel * 2;
      player.speed += Math.max(-rate * dt, Math.min(rate * dt, target - player.speed));
      if (!fwdIn) player.speed *= Math.exp(-0.8 * dt);
      const steer = Math.max(-1, Math.min(1, sideIn));
      player.heading -= steer * ride.turn * dt * Math.max(-1, Math.min(1, player.speed / 6));
      player.vel.set(-Math.sin(player.heading) * player.speed, 0, -Math.cos(player.heading) * player.speed);
      player.pos.x += player.vel.x * dt; player.pos.z += player.vel.z * dt;
      if (collide(player.pos, ride.radius)) { player.speed *= 0.6; if (Math.abs(player.speed) > 4) W.lastHit = performance.now(); }
      const pc = carAt(player.pos.x, player.pos.z, ride.radius * 0.5);
      if (pc) { // squeeze past parked cars
        const dx = player.pos.x - pc.x, dz = player.pos.z - pc.z, across = -dx * pc.uz + dz * pc.ux, sd = across >= 0 ? 1 : -1, push = (0.95 + ride.radius * 0.5 - Math.abs(across)) * sd;
        player.pos.x += -pc.uz * push; player.pos.z += pc.ux * push; player.speed *= 0.97;
      }
      player.face = player.heading;
      if (performance.now() - cam.lookT > 1500) cam.yaw += angDiff(player.heading, cam.yaw) * Math.min(1, dt * 2.5);
      player.pos.y = surfaceAt(player.pos.x, player.pos.z, player.pos.y + 0.6); player.grounded = true;
      player.pitch += (Math.atan(slopeAlong(hx, hz)) - player.pitch) * Math.min(1, dt * 8);
    } else {
      const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
      let fwd = fwdIn, side = sideIn;
      const len = Math.hypot(fwd, side);
      if (len > 1) { fwd /= len; side /= len; }
      const running = ctl && !W.noRun && (input.sprint || Math.hypot(input.jx, input.jy) > 0.92);
      const dirX = -sy * fwd + cy * side, dirZ = -cy * fwd - sy * side;
      player.slope = slopeAlong(dirX, dirZ);
      const speed = (running ? ride.run : ride.walk) * (W.speedMul || 1) * slopeMul(player.slope);
      const tx = dirX * speed, tz = dirZ * speed;
      const k = 1 - Math.exp(-(player.grounded ? (ride.mode === 'ride' ? 5.5 : 15) : 3.5) * dt);
      player.vel.x += (tx - player.vel.x) * k; player.vel.z += (tz - player.vel.z) * k;
      player.pos.x += player.vel.x * dt; player.pos.z += player.vel.z * dt;
      collide(player.pos, ride.radius);
      if (ctl && input.jump && ride.jump > 0) {
        if (player.grounded) { player.vy = ride.jump; player.grounded = false; player.jumps = 1; }
        else if ((player.jumps || 0) < 2) { // a second jump in the air
          player.vy = ride.jump * 0.92; player.jumps = 2;
          W.burst(player.pos.x, player.pos.y + 0.2, player.pos.z, '💨', 4, { up: 0.5, spread: 1.6, size: 0.5, life: 0.5 });
          if (W.onJump2) W.onJump2();
        }
      }
      player.vy -= GRAV * dt;
      player.pos.y += player.vy * dt;
      // stay on the ground going downhill (instead of hopping), land when falling onto it
      const gy = surfaceAt(player.pos.x, player.pos.z, player.pos.y + 0.6), hs0 = Math.hypot(player.vel.x, player.vel.z);
      // parked cars: walk around them, or land on the roof and bounce
      const pc = carAt(player.pos.x, player.pos.z, 0.3);
      if (pc) {
        if (player.vy < -1 && player.pos.y - gy < 1.7 && player.pos.y - gy > 0.8) {
          player.vy = 12.5; player.jumps = 1; player.grounded = false;
          W.burst(player.pos.x, gy + 1.5, player.pos.z, '⭐', 5, { spread: 2.5, size: 0.45 });
          if (W.onBounce) W.onBounce(pc);
        } else if (player.pos.y - gy < 0.8) {
          const dx = player.pos.x - pc.x, dz = player.pos.z - pc.z, across = -dx * pc.uz + dz * pc.ux, sd = across >= 0 ? 1 : -1, push = (1.22 - Math.abs(across)) * sd;
          player.pos.x += -pc.uz * push; player.pos.z += pc.ux * push;
        }
      }
      const wasAir = !player.grounded;
      if (player.pos.y <= gy || (player.grounded && player.vy <= 0 && player.pos.y - gy < 0.35 + hs0 * dt * 2)) { player.pos.y = gy; player.vy = 0; player.grounded = true; }
      else player.grounded = false;
      if (wasAir && player.grounded) { player.jumps = 0; if (player.fell > 0.45) W.burst(player.pos.x, gy + 0.1, player.pos.z, '💨', 3, { up: 0.3, spread: 2, size: 0.45, life: 0.45 }); player.fell = 0; }
      if (!player.grounded) player.fell = (player.fell || 0) + dt;
      const tilt = ride.mode === 'ride' && player.grounded ? Math.atan(slopeAlong(-Math.sin(player.face), -Math.cos(player.face))) : 0;
      player.pitch += (tilt - player.pitch) * Math.min(1, dt * 8);
      const hs = Math.hypot(player.vel.x, player.vel.z);
      player.speed = hs;
      if (hs > 0.3) { const da = angDiff(Math.atan2(-player.vel.x, -player.vel.z), player.face); player.face += da * Math.min(1, dt * (ride.mode === 'ride' ? 6 : 14)); }
      player.running = running && hs > 1;
    }
    input.jump = false;
    const moved = Math.hypot(player.pos.x - sx, player.pos.z - sz);
    if (moved < 5) { player.moved += moved; if (!ride.kind) player.footMoved += moved; }
    // pose
    if (body) {
      const k = ride.kind;
      if (!player.grounded) W.animate(body, 0, dt, 'air');
      else if (k === 'bike') W.animate(body, Math.abs(player.speed), dt, 'pedal');
      else if (k === 'moped') W.animate(body, 0, dt, 'sit');
      else if (k === 'skateboard' || k === 'kickscooter') { W.animate(body, 0, dt, 'ride'); body.rotation.y = k === 'skateboard' ? Math.PI / 2 * 0.9 : 0; }
      else { body.rotation.y = 0; W.animate(body, Math.abs(player.speed), dt, W.pose || null); }
      if (k !== 'skateboard') body.rotation.y = 0;
      if (swingT > 0) { // an overhead smash: up fast, down hard
        swingT -= dt;
        const t = 1 - Math.max(0, swingT) / 0.3;
        body.userData.armR.rotation.x = t < 0.3 ? 0.5 + t / 0.3 * 2.5 : 3.0 - (t - 0.3) / 0.7 * 2.3;   // up over the head, then down in front
        body.userData.armR.rotation.z = 0.08;
        body.userData.elbowR.rotation.x = t < 0.3 ? 1.0 : 0.15;
      }
    }
    avatar.position.copy(player.pos);
    avatar.rotation.y = player.face;
    avatar.rotation.x = player.pitch;
  }
  W.teleport = function (x, z, yaw) {
    player.pos.set(x, surfaceAt(x, z), z); player.vel.set(0, 0, 0); player.vy = 0; player.speed = 0; player.grounded = true; player.pitch = 0;
    if (yaw != null) { player.face = player.heading = yaw; cam.yaw = yaw; }
    trail.length = 0;
    for (const f of followers) f.obj.position.set(x + 1, groundAt(x + 1, z + 1), z + 1);
    cam.cur = cam.dist;
  };

  function updateCamera(dt) {
    const target = _v.set(player.pos.x, player.pos.y + (ride.mode === 'drive' ? 1.4 : 1.6), player.pos.z);
    const dist = W.showOff ? 3.4 : cam.dist * (ride.mode === 'drive' ? 1.35 : 1);
    const cp = Math.cos(cam.pitch);
    const dx = Math.sin(cam.yaw) * cp, dy = Math.sin(cam.pitch), dz = Math.cos(cam.yaw) * cp;
    let maxD = dist;
    for (let i = 1; i <= 18; i++) { // pull the camera in when a wall or a hill is in the way
      const t = i / 18 * dist, x = target.x + dx * t, z = target.z + dz * t, y = target.y + dy * t, g = groundAt(x, z), hb = heightAt(x, z);
      if ((hb && g + hb > y - 0.4) || g > y - 0.5) { maxD = Math.max(0.8, t - 0.7); break; }
    }
    cam.cur = maxD < cam.cur ? maxD : cam.cur + (maxD - cam.cur) * (1 - Math.exp(-3 * dt));
    const cx = target.x + dx * cam.cur, cz = target.z + dz * cam.cur;
    camera.position.set(cx, Math.max(groundAt(cx, cz) + 0.45, target.y + dy * cam.cur), cz);
    if (cam.shake > 0.001) { // a bonk, a landing, a monster: the view jolts and settles
      camera.position.x += (Math.random() - 0.5) * cam.shake; camera.position.y += (Math.random() - 0.5) * cam.shake * 0.7; camera.position.z += (Math.random() - 0.5) * cam.shake;
      cam.shake *= Math.exp(-9 * dt);
    }
    camera.lookAt(target);
    // the view widens a little when you go fast
    const sp = Math.abs(ride.mode === 'drive' ? player.speed : Math.hypot(player.vel.x, player.vel.z));
    const fov = 62 + Math.max(0, Math.min(13, (sp - 7) * 0.85));
    if (Math.abs(fov - camera.fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
    avatar.visible = cam.cur > 1.1;
    if (W.showOff) { avatar.rotation.y = cam.yaw + Math.PI + Math.sin(performance.now() / 1400) * 0.5; avatar.rotation.x = 0; if (body && !ride.kind) W.animate(body, 0, dt); }
    const snap = 240 / 2048;
    const px = Math.round(player.pos.x / snap) * snap, pz = Math.round(player.pos.z / snap) * snap, py = Math.round(player.pos.y / snap) * snap;
    sun.target.position.set(px, py, pz);
    nightLight.position.set(player.pos.x, player.pos.y + 7, player.pos.z);
    sun.position.set(px + sunDir.x * 600, py + sunDir.y * 600, pz + sunDir.z * 600);
    ground.position.x = Math.round(px / 100) * 100; ground.position.z = Math.round(pz / 100) * 100;
  }

  // ---------------------------------------------------------------- day and night
  const SKY = [[0, 0x0d1236], [4.5, 0x151c48], [6, 0x6e5a8f], [7, 0xf3b58d], [8.5, 0xaecde9], [16.5, 0xaecde9], [18.5, 0xf6a46c], [19.6, 0x9a5d8f], [20.8, 0x2a2660], [22, 0x0d1236], [24, 0x0d1236]];
  const SKY_TOP = [[0, 0x040618], [4.5, 0x0a1030], [6, 0x2b3f86], [7.2, 0x4f86d8], [9, 0x3f84e6], [16.5, 0x3f84e6], [18.5, 0x4a5fb0], [19.8, 0x2a2a70], [21, 0x0a1030], [22, 0x040618], [24, 0x040618]];
  const ca = new THREE.Color(), cb = new THREE.Color();
  W.night = 0;
  W.setClock = function (h) {
    h = ((h % 24) + 24) % 24;
    let i = 0;
    while (i < SKY.length - 2 && SKY[i + 1][0] <= h) i++;
    const t = (h - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0]);
    ca.setHex(SKY[i][1]); cb.setHex(SKY[i + 1][1]);
    skyCol.copy(ca).lerp(cb, t);
    scene.background.copy(skyCol);
    scene.fog.color.copy(skyCol);
    const day = smooth(5.5, 8, h) * (1 - smooth(18.3, 21, h));
    W.night = 1 - day;
    hemi.intensity = 0.4 + 0.3 * day;
    hemi.color.setHex(day > 0.5 ? 0xe4f0ff : 0xa9b6f0);
    sun.intensity = 0.16 + 0.56 * day;
    sun.color.setHex(day < 0.15 ? 0x9fb4ff : h < 9 || h > 17 ? 0xffc79a : 0xfff0d8);  // moonlight is blue
    const a = (h - 6) / 12 * Math.PI;  // sun travels east -> west
    sunDir.set(Math.cos(a) * 0.6, Math.max(0.25, Math.sin(Math.max(0.2, Math.min(Math.PI - 0.2, a)))), 0.46).normalize();
    MAT.walls.emissiveIntensity = Math.max(0, (W.night - 0.3) * 1.3);
    scene.fog.near = 120 - W.night * 40; scene.fog.far = 600 - W.night * 180;
    // the dome: deep blue overhead by day, almost black at night, the horizon keeps the fog colour
    i = 0;
    while (i < SKY_TOP.length - 2 && SKY_TOP[i + 1][0] <= h) i++;
    const tt = (h - SKY_TOP[i][0]) / (SKY_TOP[i + 1][0] - SKY_TOP[i][0]);
    ca.setHex(SKY_TOP[i][1]); cb.setHex(SKY_TOP[i + 1][1]);
    skyTop.copy(ca).lerp(cb, tt);
    sunPos.set(Math.cos(a) * 0.75, Math.sin(a), 0.42).normalize();
    sunSprite.visible = sunPos.y > -0.12;
    sunSprite.material.color.setHex(h < 8 || h > 17.2 ? 0xffb37a : 0xffffff);
    moonSprite.visible = W.night > 0.35;
    moonSprite.material.opacity = Math.min(1, (W.night - 0.35) * 2.5);
    starMat.opacity = Math.max(0, (W.night - 0.45) * 1.8);
    stars.visible = starMat.opacity > 0.01;
    cloudMat.color.setRGB(1, 1, 1).lerp(skyCol, 0.25 + W.night * 0.45).multiplyScalar(1 - W.night * 0.45);
    // street lamps, light pools and lit shop signs
    const glow = smooth(0.35, 0.75, W.night);
    MAT.bulb.color.setHex(0x9a9a8c).lerp(cb.setHex(0xfff0b8), glow);
    MAT.pool.opacity = glow * 0.42;
    nightLight.intensity = glow * 1.15;
    cloudMat.opacity = 0.93 - W.night * 0.6;
    cloudMat.emissive.copy(cloudMat.color); cloudMat.emissiveIntensity = 0.5 * (1 - W.night);
    MAT.pool.visible = glow > 0.02;
    W.glow = glow;
  };

  // ---------------------------------------------------------------- ambient life: pedestrians, traffic, pigeons
  const life = { peds: [], cars: [], birds: [], max: LOW ? 22 : 44, maxCars: LOW ? 9 : 20, flocks: LOW ? 1 : 3, t: 0 };
  W.life = life;
  const laneOff = sg => Math.max(1.3, Math.min(3.2, sg.w * 0.25 - 0.6)); // moving cars keep clear of the parked ones
  function nextSegs(x, z, not, carOnly) {
    const out = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = segBuckets.get((Math.floor(x / BUCKET) + i) * 1e6 + Math.floor(z / BUCKET) + j);
      if (!list) continue;
      for (const sg of list) {
        if (sg === not || (carOnly && !sg.car)) continue;
        if (Math.hypot(sg.x1 - x, sg.z1 - z) < 2.5) out.push([sg, 1]);
        else if (Math.hypot(sg.x2 - x, sg.z2 - z) < 2.5) out.push([sg, -1]);
      }
    }
    return out;
  }
  function segPoint(a) { // agent {sg, dir, t, off} -> world point (y on the ground, or the deck on a bridge) + direction
    const sg = a.sg, ux = (sg.x2 - sg.x1) / sg.L * a.dir, uz = (sg.z2 - sg.z1) / sg.L * a.dir;
    const sx = a.dir > 0 ? sg.x1 : sg.x2, sz = a.dir > 0 ? sg.z1 : sg.z2;
    const x = sx + ux * a.t - uz * a.off, z = sz + uz * a.t + ux * a.off;
    return { x, z, y: sg.br ? surfaceAt(x, z) : groundAt(x, z), ux, uz };
  }
  // Moves an agent along the street graph. choose(options) picks the next segment (default random).
  function advance(a, dist, carOnly, choose) {
    a.t += dist;
    let guard = 0;
    while (a.t > a.sg.L && guard++ < 4) {
      const over = a.t - a.sg.L;
      const ex = a.dir > 0 ? a.sg.x2 : a.sg.x1, ez = a.dir > 0 ? a.sg.z2 : a.sg.z1;
      let opts = nextSegs(ex, ez, a.sg, carOnly);
      if (!opts.length) { a.dir = -a.dir; a.t = over; continue; }
      const pick = choose ? choose(opts, ex, ez) : opts[Math.floor(Math.random() * opts.length)];
      a.sg = pick[0]; a.dir = pick[1]; a.t = over;
    }
  }
  W.agentOn = function (x, z, carOnly) { // an agent state on the street nearest (x, z)
    let best = null, bd = 60;
    for (const s of allSubs) {
      if (!s.reg || rectDist(s, x, z) > bd) continue;
      for (const sg of s.walk) {
        if (carOnly && !sg.car) continue;
        const dx = sg.x2 - sg.x1, dz = sg.z2 - sg.z1;
        let t = ((x - sg.x1) * dx + (z - sg.z1) * dz) / (sg.L * sg.L);
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(sg.x1 + t * dx - x, sg.z1 + t * dz - z);
        if (d < bd) { bd = d; best = { sg, dir: 1, t: t * sg.L, off: 0 }; }
      }
    }
    return best;
  };
  W.agentAdvance = advance; W.agentPoint = segPoint;
  function spawnPed(minD) {
    const p = randomWalkSpot(player.pos.x, player.pos.z, minD, 125);
    if (!p) return;
    const a = W.agentOn(p.x, p.z, false);
    if (!a) return;
    a.dir = Math.random() < 0.5 ? 1 : -1;
    a.t = a.dir > 0 ? a.t : a.sg.L - a.t;
    const side = Math.random() < 0.5 ? 1 : -1;
    a.off = a.sg.car ? side * (a.sg.w / 2 + 0.9) : side * 0.4 * Math.random();
    const look = W.randomLook(Math.random() * 1e6 | 0);
    // the street's cast: mostly strollers, plus joggers, kids, slow elders, skaters and (on roads) cyclists
    const q = Math.random();
    let type = 'walk', speed = 1.1 + Math.random() * 0.7, wheels = null;
    if (q < 0.12) { type = 'jog'; speed = 3 + Math.random() * 1.2; look.hat = look.hat || 0xff6b4a; look.bag = null; look.dress = false; }
    else if (q < 0.2) { type = 'kid'; speed = 1.5 + Math.random() * 0.8; look.h = 0.56 + Math.random() * 0.12; look.bag = null; }
    else if (q < 0.27) { type = 'elder'; speed = 0.65 + Math.random() * 0.2; look.hair = 0xd9d4cc; look.glasses = true; look.h = 0.9; }
    else if (q < 0.33) { type = 'skate'; speed = 4 + Math.random() * 1.5; wheels = 'skateboard'; look.dress = false; }
    else if (q < 0.41) { type = 'bike'; speed = 4.8 + Math.random() * 1.6; wheels = 'bike'; look.dress = false; look.hat = 0xf2b134; }
    const fig = W.person(look, true);
    let obj = fig;
    if (wheels) { // the figure stands on (or sits over) its wheels inside a holder that does the moving
      obj = new THREE.Group();
      fig.position.y = wheels === 'bike' ? 0.32 : 0.15;
      if (wheels === 'skateboard') fig.rotation.y = Math.PI / 2 * 0.9;
      obj.add(fig, W.vehicle(wheels, CAR_TINT[Math.random() * CAR_TINT.length | 0]));
    }
    const ped = { a, obj, fig, speed, pause: 0, look, id: Math.random() * 1e9 | 0, dog: null, chatted: 0, type };
    if (type === 'walk' && Math.random() < 0.14) { ped.dog = W.animal('dog', [0xc8894a, 0x2b2b2b, 0xf0e6d6, 0x8a5a2b, 0xd9b38c][Math.random() * 5 | 0]); scene.add(ped.dog); }
    if (type === 'walk' && Math.random() < 0.15) ped.pause = 3 + Math.random() * 6;
    scene.add(obj);
    life.peds.push(ped);
  }
  const TRAFFIC = ['car', 'car', 'car', 'car', 'suv', 'suv', 'sports', 'taxi', 'taxi', 'van', 'van', 'bus', 'truck', 'police'];
  function spawnCar(minD) {
    const p = randomWalkSpot(player.pos.x, player.pos.z, minD, 190, (x, z, sg) => sg.car && sg.w >= 7);
    if (!p) return;
    const a = W.agentOn(p.x, p.z, true);
    if (!a) return;
    a.dir = Math.random() < 0.5 ? 1 : -1;
    a.t = a.dir > 0 ? a.t : a.sg.L - a.t;
    a.off = laneOff(a.sg);
    for (const o of life.cars) if (Math.hypot(o.obj.position.x - p.x, o.obj.position.z - p.z) < 9) return; // not on top of another car
    const kind = TRAFFIC[Math.random() * TRAFFIC.length | 0];
    const obj = W.vehicle(kind, CAR_TINT[Math.random() * CAR_TINT.length | 0]);
    obj.rotation.order = 'YXZ';
    const q = segPoint(a);
    obj.position.set(q.x, q.y, q.z); obj.rotation.y = Math.atan2(-q.ux, -q.uz);
    scene.add(obj);
    life.cars.push({ a, obj, kind, len: kind === 'bus' ? 7.6 : kind === 'truck' || kind === 'van' ? 4.8 : 4.1, speed: 0, max: (kind === 'bus' || kind === 'truck' ? 6 : kind === 'sports' ? 11 : 7.5) + Math.random() * 4, honk: 0 });
  }
  function spawnFlock() {
    const p = randomWalkSpot(player.pos.x, player.pos.z, 25, 110, (x, z, sg) => !sg.car);
    if (!p) return;
    const n = 4 + (Math.random() * 5 | 0), birds = [];
    for (let i = 0; i < n; i++) {
      const b = W.animal(Math.random() < 0.08 ? 'duck' : 'pigeon');
      const bx = p.x + (Math.random() - 0.5) * 4, bz = p.z + (Math.random() - 0.5) * 4;
      b.position.set(bx, groundAt(bx, bz), bz);
      b.rotation.y = Math.random() * 6.28;
      scene.add(b);
      birds.push({ obj: b, vy: 0, vx: 0, vz: 0, fly: 0, t: Math.random() * 5 });
    }
    life.birds.push({ x: p.x, z: p.z, birds, gone: 0 });
  }
  function removeObj(o) { scene.remove(o); o.traverse(c => { if (c.isMesh && c.geometry && !SHARED.has(c.geometry)) c.geometry.dispose(); }); }
  W.removeObj = removeObj;

  // Traffic lights in 3D: a pole and a three-lamp head for every road into the corner, plus zebra crossings.
  const SIG_COL = [[0xff3b30, 0x3a1210], [0xffc21f, 0x3a2c0a], [0x35e06a, 0x0d3318]].map(p => p.map(h => new THREE.Color(h)));
  function buildSignal(n) {
    const g = new THREE.Group(), ends = n.ends, cnt = ends.length;
    const poles = new THREE.InstancedMesh(PROP.sigPole, MAT.prop, cnt), lamps = new THREE.InstancedMesh(PROP.sigLamp, MAT.signal, cnt * 3);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const zebra = new Geo(false), white = new THREE.Color(0xf4f1ea);
    ends.forEach((en, i) => {
      const sg = en.sg, s = en.end === 1 ? -1 : 1;
      const ux = (sg.x2 - sg.x1) / sg.L * s, uz = (sg.z2 - sg.z1) / sg.L * s; // towards the corner
      const back = Math.min(8, sg.L * 0.8), hw = sg.w / 2;
      let x = n.x - ux * back - uz * (hw + 0.7), z = n.z - uz * back + ux * (hw + 0.7);
      if (heightAt(x, z)) { x = n.x - ux * back - uz * (hw - 0.4); z = n.z - uz * back + ux * (hw - 0.4); }
      const yaw = Math.atan2(ux, uz), gy = groundAt(x, z);
      e.set(0, yaw, 0); q.setFromEuler(e); v.set(x, gy, z); m.compose(v, q, one); poles.setMatrixAt(i, m);
      for (let k = 0; k < 3; k++) { // red on top; the head faces the cars coming in
        v.set(x - Math.sin(yaw) * 0.2, gy + 4.7 - k * 0.5, z - Math.cos(yaw) * 0.2); m.compose(v, q, one); lamps.setMatrixAt(i * 3 + k, m);
        lamps.setColorAt(i * 3 + k, SIG_COL[k][1]);
      }
      // zebra crossing in front of the stop line
      const cb = Math.min(5.5, sg.L * 0.5), cx = n.x - ux * cb, cz = n.z - uz * cb, nb = Math.max(3, Math.floor((sg.w - 1) / 1.1));
      for (let b = 0; b < nb; b++) {
        const o = (b - (nb - 1) / 2) * 1.1, ax = cx - uz * o, az = cz + ux * o, hx = -uz * 0.3, hz = ux * 0.3;
        zebra.dquad(ax - hx - ux * 1.3, az - hz - uz * 1.3, ax + hx - ux * 1.3, az + hz - uz * 1.3, ax + hx + ux * 1.3, az + hz + uz * 1.3, ax - hx + ux * 1.3, az - hz + uz * 1.3, groundAt, 0.135, white);
      }
    });
    poles.castShadow = !LOW;
    g.add(poles, lamps);
    if (!zebra.empty) { const zm = new THREE.Mesh(zebra.build(), MAT.drape); zm.receiveShadow = true; zm.renderOrder = 1; g.add(zm); }
    scene.add(g);
    n.sig.obj = g; n.sig.lamps = lamps; n.sig.last = ''; n.sig.stale = false;
  }
  function dropSignal(n) {
    if (!n.sig.obj) return;
    scene.remove(n.sig.obj);
    n.sig.obj.traverse(o => { if (o.geometry && !SHARED.has(o.geometry)) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
    n.sig.obj = null; n.sig.lamps = null;
  }
  function updateSignals(px, pz, slow) {
    for (const n of sigList) {
      const d = Math.hypot(n.x - px, n.z - pz);
      if (slow) {
        if (n.sig.obj && (d > 330 || n.sig.stale)) dropSignal(n);
        if (!n.sig.obj && d < 280 && (terr.h0 != null || terr.off)) buildSignal(n);
      }
      if (!n.sig.obj) continue;
      const a = sigState(n, 0), b = sigState(n, 1), key = a + '' + b;
      if (key === n.sig.last) continue;
      n.sig.last = key;
      n.ends.forEach((en, i) => { const st = en.grp === 0 ? a : b; for (let k = 0; k < 3; k++) n.sig.lamps.setColorAt(i * 3 + k, SIG_COL[k][(k === 0 && st === 0) || (k === 1 && st === 1) || (k === 2 && st === 2) ? 0 : 1]); });
      n.sig.lamps.instanceColor.needsUpdate = true;
    }
  }

  // Shop signs: every place near you gets a board on its wall (or a post, when there's no wall), an awning and a
  // round blade sign you can read from down the street. The game says what goes on them: W.signInfo(place) -> {e, name, col}.
  const signs = new Map();
  let signTex = 0;
  function wallFor(pl) {
    let best = null, bd = 30;
    for (const b of buildingsNear(pl.x, pl.z, 60)) {
      if (Math.hypot(b.cx - pl.x, b.cz - pl.z) > 30 + Math.sqrt(b.area)) continue;
      const own = inRings(b.rings, pl.x, pl.z) ? 0 : 9, p = b.p, n = p.length / 2;
      for (let i = 0, k = n - 1; i < n; k = i++) {
        const x1 = p[2 * k], z1 = p[2 * k + 1], x2 = p[2 * i], z2 = p[2 * i + 1];
        const dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz;
        if (L2 < 12) continue;
        let t = ((pl.pin.x - x1) * dx + (pl.pin.z - z1) * dz) / L2;
        t = Math.max(0.22, Math.min(0.78, t));
        const cx = x1 + t * dx, cz = z1 + t * dz, d = Math.hypot(cx - pl.pin.x, cz - pl.pin.z) + own;
        if (d < bd) {
          const L = Math.sqrt(L2);
          let nx = dz / L, nz = -dx / L;
          if (inRings(b.rings, cx + nx * 0.7, cz + nz * 0.7)) { nx = -nx; nz = -nz; }
          bd = d; best = { x: cx, z: cz, nx, nz, w: Math.min(4.4, L * 0.72), h: b.h, base: b.base || 0 };
        }
      }
    }
    return best;
  }
  function buildSign(pl, info) {
    const w = wallFor(pl), g = new THREE.Group();
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const cg = c.getContext('2d');
    cg.fillStyle = info.col; cg.fillRect(0, 0, 512, 128);
    cg.fillStyle = 'rgba(255,255,255,.16)'; cg.fillRect(0, 0, 512, 10); cg.fillStyle = 'rgba(0,0,0,.22)'; cg.fillRect(0, 116, 512, 12);
    cg.textBaseline = 'middle';
    cg.font = '78px ' + EMOJI_FONT; cg.fillText(info.e, 12, 66);
    cg.fillStyle = info.fg || '#ffffff'; cg.font = '800 54px Fredoka, Nunito, system-ui';
    cg.fillText(info.name, 118, 64, 380);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const face = new THREE.MeshBasicMaterial({ map: tex }), edge = new THREE.MeshLambertMaterial({ color: new THREE.Color(info.col).multiplyScalar(0.55) });
    const bw = w ? Math.max(2.4, w.w) : 3.0;
    const board = new THREE.Mesh(new THREE.BoxGeometry(bw, bw * 0.25, 0.14), [edge, edge, edge, edge, face, face]);
    const blade = W.emojiSprite(info.e, 1.25, '#ffffff', info.col);
    if (w) {
      const gy = groundAt(w.x + w.nx * 1.2, w.z + w.nz * 1.2), top = Math.max(gy + 2.9, Math.min(gy + 3.6, w.base + w.h - 0.5));
      g.position.set(w.x + w.nx * 0.12, gy, w.z + w.nz * 0.12);
      g.rotation.y = Math.atan2(w.nx, w.nz);
      board.position.set(0, top - gy, 0.08);
      if (w.h > 4.4) { // a striped awning under the board
        const aw = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.3, 0.07, 1.25), new THREE.MeshLambertMaterial({ map: awningTex(info.col) }));
        aw.position.set(0, top - gy - bw * 0.125 - 0.42, 0.62); aw.rotation.x = 0.36; aw.castShadow = !LOW;
        g.add(aw);
      }
      blade.position.set(bw / 2 + 0.1, top - gy + 0.95, 0.85);
    } else { // no wall close by (a park, a metro entrance): a sign on two posts by the street
      const gy = groundAt(pl.pin.x, pl.pin.z);
      g.position.set(pl.pin.x, gy, pl.pin.z);
      g.rotation.y = (pl.pin.yaw || 0) + Math.PI;
      board.position.set(0, 2.5, 0);
      for (const sx of [-bw / 2 + 0.15, bw / 2 - 0.15]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 0.12), edge); post.position.set(sx, 1.25, 0); g.add(post); }
      blade.position.set(0, 3.6, 0);
    }
    g.add(board, blade);
    scene.add(g);
    signTex++;
    return { obj: g, tex, mats: [face, edge], pl };
  }
  const awnings = new Map();
  function awningTex(col) {
    if (awnings.has(col)) return awnings.get(col);
    const c = document.createElement('canvas'); c.width = 64; c.height = 8;
    const g = c.getContext('2d');
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#fdf6e8' : col; g.fillRect(i * 8, 0, 8, 8); }
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter;
    awnings.set(col, t);
    return t;
  }
  function dropSign(id) {
    const s = signs.get(id);
    if (!s) return;
    scene.remove(s.obj);
    s.obj.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (!Array.isArray(o.material)) o.material.dispose(); } else if (o.isSprite) o.material.dispose(); });
    s.tex.dispose(); s.mats.forEach(m => m.dispose());
    signs.delete(id);
  }
  function updateSigns(px, pz) {
    if (!W.signInfo) return;
    for (const [id, s] of signs) if (Math.hypot(s.pl.pin.x - px, s.pl.pin.z - pz) > 230 || s.pl.gone) dropSign(id);
    if (signs.size >= (LOW ? 40 : 90)) return;
    const list = W.signList ? W.signList() : W.places;
    let made = 0;
    for (const pl of list) {
      if (signs.has(pl.id) || Math.hypot(pl.pin.x - px, pl.pin.z - pz) > 170 || (pl.noSign && life.t < pl.noSign)) continue;
      const info = W.signInfo(pl);
      if (!info) { pl.noSign = life.t + 20; continue; }
      signs.set(pl.id, buildSign(pl, info));
      if (++made >= 4) break;
    }
  }
  W.signs = () => signs;
  W.refreshSign = id => dropSign(id);

  let lifeTimer = 0, lifeSlow = 0;
  function updateLife(dt) {
    const px = player.pos.x, pz = player.pos.z;
    life.t += dt;
    lifeTimer -= dt;
    lifeSlow -= dt;
    updateSignals(px, pz, lifeSlow <= 0);
    if (lifeSlow <= 0) lifeSlow = 0.7;
    if (lifeTimer <= 0) {
      lifeTimer = 0.5;
      updateSigns(px, pz);
      for (let i = life.peds.length - 1; i >= 0; i--) {
        const p = life.peds[i];
        if (Math.hypot(p.obj.position.x - px, p.obj.position.z - pz) > 165 && !p.keep) { removeObj(p.obj); if (p.dog) removeObj(p.dog); life.peds.splice(i, 1); }
      }
      for (let i = life.cars.length - 1; i >= 0; i--) {
        const c = life.cars[i];
        if (Math.hypot(c.obj.position.x - px, c.obj.position.z - pz) > 230) { removeObj(c.obj); life.cars.splice(i, 1); }
      }
      for (let i = life.birds.length - 1; i >= 0; i--) {
        const f = life.birds[i];
        if (f.gone > 4 || Math.hypot(f.x - px, f.z - pz) > 170) { f.birds.forEach(b => removeObj(b.obj)); life.birds.splice(i, 1); }
      }
      // busy by day, quieter late at night (that's when the monsters come out)
      const mul = (W.lifeMul == null ? 1 : W.lifeMul) * (1 - 0.45 * smooth(0.75, 1, W.night));
      for (let k = 0; k < 3 && life.peds.length < life.max * mul; k++) spawnPed(life.peds.length < 10 ? 12 : 38);
      for (let k = 0; k < 2 && life.cars.length < life.maxCars * mul; k++) spawnCar(life.cars.length < 5 ? 35 : 70);
      if (life.birds.length < life.flocks) spawnFlock();
    }
    for (const p of life.peds) {
      if (p.ctl) continue; // the game is moving this one (a flash mob, a chase, a date)
      if (p.hold > 0) { p.hold -= dt; W.animate(p.fig, 0, dt, p.holdPose || (p.type === 'bike' ? 'pedal' : null)); continue; }
      if (p.pause > 0) { p.pause -= dt; W.animate(p.fig, 0, dt); if (p.dog) W.animate(p.dog, 0, dt); continue; }
      if (p.type === 'walk' && Math.random() < dt * 0.01) p.pause = 2 + Math.random() * 5;
      advance(p.a, p.speed * dt, false);
      const pt = segPoint(p.a);
      // keep peds out of walls: pull toward the street centre if the sidewalk spot is inside a building
      if (heightAt(pt.x, pt.z)) { p.a.off *= 0.9; }
      p.obj.position.set(pt.x, pt.y, pt.z);
      p.obj.rotation.y += angDiff(Math.atan2(-pt.ux, -pt.uz), p.obj.rotation.y) * Math.min(1, dt * 6);
      W.animate(p.fig, p.speed, dt, p.type === 'skate' ? 'ride' : p.type === 'bike' ? 'pedal' : null);
      if (p.dog) {
        const dx = pt.x - pt.ux * 1.3 + pt.uz * 0.5, dz = pt.z - pt.uz * 1.3 - pt.ux * 0.5;
        p.dog.position.set(dx, p.a.sg.br ? pt.y : groundAt(dx, dz), dz);
        p.dog.rotation.y = p.obj.rotation.y;
        W.animate(p.dog, p.speed, dt);
      }
    }
    for (const c of life.cars) {
      const pt = segPoint(c.a);
      // stop for the player or a car ahead
      let block = false;
      const ah = c.len / 2 + 2, ax = pt.x + pt.ux * ah, az = pt.z + pt.uz * ah;
      if (Math.hypot(ax - px, az - pz) < 4.2 && player.pos.y - pt.y < 2) block = true;
      if (!block) for (const o of life.cars) { if (o !== c && Math.hypot(o.obj.position.x - ax, o.obj.position.z - az) < 1.5 + o.len / 2) { block = true; break; } }
      if (block && c.honk <= 0 && Math.hypot(ax - px, az - pz) < 4.2) { c.honk = 6; W.say(c.obj, ['Beep beep!', 'Honk!', 'Coming through!', 'Hey, the road!', 'Move it, pal!', 'HOOOONK!'][Math.random() * 6 | 0], 1.6); if (W.onHonk) W.onHonk(c); }
      // traffic lights: stop at the line on red (and on yellow, unless already crossing)
      if (!block) {
        const sg = c.a.sg, node = c.a.dir > 0 ? sg.n2 : sg.n1, left = sg.L - c.a.t;
        if (node && node.sig && left < 16 && left > 6) { const st = sigState(node, c.a.dir > 0 ? sg.g2 : sg.g1); if (st === 0 || (st === 1 && left > 10)) { block = true; c.waiting = true; } }
      }
      if (!block) c.waiting = false;
      const want = block ? 0 : c.max;
      c.speed += Math.max(-14 * dt, Math.min(5 * dt, want - c.speed));
      c.honk -= dt;
      c.a.off += (laneOff(c.a.sg) - c.a.off) * Math.min(1, dt * 5);
      advance(c.a, c.speed * dt, true);
      const q = segPoint(c.a);
      c.obj.position.set(q.x, q.y, q.z);
      c.obj.rotation.y += angDiff(Math.atan2(-q.ux, -q.uz), c.obj.rotation.y) * Math.min(1, dt * 5);
      if (!c.a.sg.br) c.obj.rotation.x = Math.atan((groundAt(q.x + q.ux * 1.8, q.z + q.uz * 1.8) - groundAt(q.x - q.ux * 1.8, q.z - q.uz * 1.8)) / 3.6);
    }
    for (const f of life.birds) {
      const near = Math.hypot(f.x - px, f.z - pz) < 5.5 || f.gone > 0;
      if (near && !f.gone) { f.gone = 0.01; f.birds.forEach(b => { b.fly = 1; b.vx = (Math.random() - 0.5) * 6; b.vz = (Math.random() - 0.5) * 6; b.vy = 4 + Math.random() * 3; }); W.onBirds && W.onBirds(f); }
      if (f.gone) f.gone += dt;
      for (const b of f.birds) {
        if (b.fly) { b.obj.position.x += b.vx * dt; b.obj.position.z += b.vz * dt; b.obj.position.y += b.vy * dt; b.vy += 1.5 * dt; b.obj.rotation.z = Math.sin(performance.now() / 50) * 0.3; }
        else { b.t += dt; b.obj.userData.head.rotation.x = Math.max(0, Math.sin(b.t * 3)) * 0.5; if (Math.random() < dt * 0.4) b.obj.rotation.y += (Math.random() - 0.5) * 2; }
      }
    }
  }
  W.nearestPed = function (x, z, r) {
    let best = null, bd = r;
    for (const p of life.peds) { const d = Math.hypot(p.obj.position.x - x, p.obj.position.z - z); if (d < bd) { bd = d; best = p; } }
    return best;
  };
  W.holdPed = function (p, secs, pose) { p.hold = secs; p.holdPose = pose; p.obj.rotation.y = Math.atan2(player.pos.x - p.obj.position.x, player.pos.z - p.obj.position.z) + Math.PI; };

  // ---------------------------------------------------------------- input (movement + camera)
  const KEYS = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
  on(window, 'keydown', e => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (KEYS[e.code]) { input[KEYS[e.code]] = 1; if (W.controls.enabled) e.preventDefault(); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = true;
    if (e.code === 'Space' && W.controls.enabled) { if (!e.repeat) input.jump = true; e.preventDefault(); }
  });
  on(window, 'keyup', e => {
    if (KEYS[e.code]) input[KEYS[e.code]] = 0;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = false;
  });
  on(window, 'blur', () => { input.f = input.b = input.l = input.r = 0; input.sprint = false; });
  function look(dx, dy, s) { cam.yaw -= dx * s; cam.pitch = Math.max(-0.15, Math.min(1.35, cam.pitch + dy * s)); cam.lookT = performance.now(); }
  let drag = null;
  const lockSupported = 'requestPointerLock' in canvas && !W.TOUCH;
  W.lock = function () { if (!lockSupported) return; try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } };
  W.unlock = function () { if (document.pointerLockElement === canvas) document.exitPointerLock(); };
  W.isLocked = () => document.pointerLockElement === canvas;
  on(canvas, 'mousedown', e => {
    if (!W.controls.enabled) return;
    if (lockSupported && document.pointerLockElement !== canvas && W.wantLock !== false) W.lock();
    drag = { x: e.clientX, y: e.clientY };
  });
  on(window, 'mouseup', () => { drag = null; });
  on(window, 'mousemove', e => {
    if (!W.controls.enabled) return;
    if (document.pointerLockElement === canvas) look(e.movementX, e.movementY, 0.0024);
    else if (drag) { look(e.clientX - drag.x, e.clientY - drag.y, 0.005); drag.x = e.clientX; drag.y = e.clientY; }
  });
  on(canvas, 'wheel', e => { cam.dist = Math.max(2.5, Math.min(30, cam.dist * (e.deltaY > 0 ? 1.12 : 1 / 1.12))); e.preventDefault(); }, { passive: false });
  // Touch: left half = joystick, right half = look. The game supplies the joystick elements.
  const touches = {};
  W.touchUI = { joy: null, knob: null };
  on(canvas, 'touchstart', e => {
    if (!W.controls.enabled) return;
    for (const t of e.changedTouches) {
      if (t.clientX < window.innerWidth * 0.45 && !Object.values(touches).some(v => v.joy)) {
        touches[t.identifier] = { joy: true, ox: t.clientX, oy: t.clientY };
        const j = W.touchUI.joy;
        if (j) { j.style.display = 'block'; j.style.left = t.clientX + 'px'; j.style.top = t.clientY + 'px'; }
      } else touches[t.identifier] = { joy: false, x: t.clientX, y: t.clientY };
    }
    e.preventDefault();
  }, { passive: false });
  on(canvas, 'touchmove', e => {
    for (const t of e.changedTouches) {
      const s = touches[t.identifier];
      if (!s) continue;
      if (s.joy) {
        let dx = t.clientX - s.ox, dy = t.clientY - s.oy;
        const d = Math.hypot(dx, dy), max = 55;
        if (d > max) { dx *= max / d; dy *= max / d; }
        input.jx = dx / max; input.jy = -dy / max;
        if (W.touchUI.knob) W.touchUI.knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      } else { look(t.clientX - s.x, t.clientY - s.y, 0.006); s.x = t.clientX; s.y = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  const endTouch = e => {
    for (const t of e.changedTouches) {
      const s = touches[t.identifier];
      if (s && s.joy) { input.jx = input.jy = 0; if (W.touchUI.joy) W.touchUI.joy.style.display = 'none'; if (W.touchUI.knob) W.touchUI.knob.style.transform = ''; }
      delete touches[t.identifier];
    }
  };
  on(canvas, 'touchend', endTouch);
  on(canvas, 'touchcancel', endTouch);

  // ---------------------------------------------------------------- origin, frame, maps
  W.setOrigin = function (lat, lon) {
    gen++;
    for (const s of allSubs) if (s.group) dropSub(s);
    tiles.clear(); allSubs = []; inflight = 0;
    buckets.clear(); nameBuckets.clear(); hchunks.clear(); rchunks.clear(); segBuckets.clear(); bridgeBuckets.clear();
    terr.tiles.clear(); terr.src.clear(); nodes.clear(); terr.inflight = 0; terr.h0 = null; terr.off = false; terr.minY = 0;
    W.places.length = 0; W.placeIds.clear();
    for (const n of sigList) dropSignal(n);
    snodes.clear(); sigList.length = 0; carBuckets.clear();
    for (const id of [...signs.keys()]) dropSign(id);
    for (const p of life.peds) { removeObj(p.obj); if (p.dog) removeObj(p.dog); }
    for (const c of life.cars) removeObj(c.obj);
    for (const f of life.birds) f.birds.forEach(b => removeObj(b.obj));
    life.peds = []; life.cars = []; life.birds = [];
    origin = { lat, lon, gx0: TM.lonToX(lon), gy0: TM.latToY(lat), M: 40075016.686 * Math.cos(lat * Math.PI / 180) / (1 << TM.Z) };
    CULL.radius = origin.M / TM.SUB * 0.75 + 60; // a sub-tile's half diagonal, plus room for hills
    W.origin = origin;
    // hills: the tile under home first (its height is the world's y = 0)
    const [hx, hy] = to15(0, 0);
    terr.hx = hx; terr.hy = hy; terr.homeKey = Math.floor(hx) + '/' + Math.floor(hy);
    requestTerrain(Math.floor(hx), Math.floor(hy));
  };
  W.toXZ = (lat, lon) => ({ x: (TM.lonToX(lon) - origin.gx0) * origin.M, z: (TM.latToY(lat) - origin.gy0) * origin.M });
  W.toLL = (x, z) => ({ lat: TM.yToLat(origin.gy0 + z / origin.M), lon: TM.xToLon(origin.gx0 + x / origin.M) });
  W.pump = (budget) => { if (origin) pumpTiles(player.pos.x, player.pos.z, budget == null ? 6 : budget); };
  W.pumpAt = (x, z, budget) => { if (origin) pumpTiles(x, z, budget); };

  let snapReq = null;
  // Renders now and returns a small JPEG (data URL) of the view
  W.snapshot = (w, h) => new Promise(res => { snapReq = { w: w || 320, h: h || 180, res }; updateCamera(0.016); updateSky(0); renderer.render(scene, camera); takeSnap(); });
  function takeSnap() {
    if (!snapReq) return;
    const c = document.createElement('canvas'); c.width = snapReq.w; c.height = snapReq.h;
    const g = c.getContext('2d'), sw = canvas.width, sh = canvas.height, ar = c.width / c.height;
    let cw = sw, chh = sw / ar; if (chh > sh) { chh = sh; cw = sh * ar; }
    g.drawImage(canvas, (sw - cw) / 2, (sh - chh) / 2, cw, chh, 0, 0, c.width, c.height);
    const r = snapReq; snapReq = null;
    try { r.res(c.toDataURL('image/jpeg', 0.72)); } catch (e) { r.res(null); }
  }
  W.frame = function (dt, opts) {
    if (!origin) return;
    opts = opts || {};
    if (opts.simulate !== false) updatePlayer(dt);
    pumpTiles(player.pos.x, player.pos.z, opts.budget || 6);
    if (opts.life !== false) updateLife(dt);
    updateFollowers(dt);
    for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; b.t -= dt; if (b.t <= 0) { b.obj.remove(b.sp); b.sp.material.dispose(); bubbles.splice(i, 1); } }
    updateFx(dt);
    updateCamera(dt);
    updateSky(dt);
    if (opts.render === false) return;
    renderer.render(scene, camera);
  };

  // ---------------------------------------------------------------- little effects: bursts of emoji, comic words
  const fx = [];
  // W.burst(x, y, z, '⭐', 8, {spread, up, size, life, grav}): emoji fly out and fade
  W.burst = function (x, y, z, emoji, n, o) {
    o = o || {};
    n = LOW ? Math.ceil(n / 2) : n;
    for (let i = 0; i < n && fx.length < 160; i++) {
      const sp = W.emojiSprite(emoji, o.size || 0.55), a = Math.random() * 6.283, r = (o.spread == null ? 3 : o.spread) * (0.4 + Math.random() * 0.6);
      sp.position.set(x, y, z);
      scene.add(sp);
      fx.push({ sp, vx: Math.cos(a) * r, vz: Math.sin(a) * r, vy: (o.up == null ? 4.5 : o.up) * (0.6 + Math.random() * 0.7), g: o.grav == null ? 9 : o.grav, t: 0, life: (o.life || 0.9) * (0.75 + Math.random() * 0.5), s: o.size || 0.55 });
    }
  };
  // W.pop(x, y, z, 'BONK!', '#ffc21f'): a comic word that rises and fades
  W.pop = function (x, y, z, text, color, size) {
    if (fx.length >= 170) return;
    const sp = W.label(text, { bg: 'rgba(31,26,61,.0)', fg: color || '#ffc21f', stroke: '#1f1a3d', size: 64, height: size || 1.0, depthTest: false });
    sp.position.set(x, y, z);
    scene.add(sp);
    fx.push({ sp, vx: 0, vz: 0, vy: 1.6, g: 0, t: 0, life: 1.0, s: 0, word: true, w: sp.scale.x, h: sp.scale.y });
  };
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { scene.remove(f.sp); f.sp.material.dispose(); fx.splice(i, 1); continue; }
      f.vy -= f.g * dt;
      f.sp.position.x += f.vx * dt; f.sp.position.y += f.vy * dt; f.sp.position.z += f.vz * dt;
      f.sp.material.opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      if (f.word) { const s = k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.5); f.sp.scale.set(f.w * s, f.h * s, 1); }
    }
  }
  W.shake = a => { cam.shake = Math.max(cam.shake || 0, a); };
  W.render = () => { updateCamera(0.016); updateSky(0); renderer.render(scene, camera); };
  W.resize = resize;

  // Rotating minimap. opts: {radius, markers:[{x,z,color,emoji,r,ring,edge}], rects:[{x0,z0,x1,z1,fill,stroke}], heading}
  W.drawMinimap = function (mm, o) {
    const g = mm.getContext('2d'), S = mm.width, R = S / 2;
    const k = R / o.radius, px = player.pos.x, pz = player.pos.z, yaw = cam.yaw;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#e6e2d9'; g.fillRect(0, 0, S, S);
    g.save();
    g.translate(R, R); g.rotate(yaw); g.scale(k, k); g.translate(-px, -pz);
    const reach = o.radius * 1.5;
    for (const s of allSubs) if (s.canvas && rectDist(s, px, pz) < reach) g.drawImage(s.canvas, s.x0 - MM_MARGIN, s.z0 - MM_MARGIN, s.canvas.width, s.canvas.height);
    for (const r of o.rects || []) {
      if (Math.hypot(Math.max(r.x0 - px, 0, px - r.x1), Math.max(r.z0 - pz, 0, pz - r.z1)) > reach) continue;
      g.fillStyle = r.fill; g.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
      if (r.stroke) { g.strokeStyle = r.stroke; g.lineWidth = 2 / k; g.strokeRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0); }
    }
    g.restore();
    const sy = Math.sin(yaw), cy = Math.cos(yaw), dpr = S / 210;
    const toScreen = (x, z) => { const dx = x - px, dz = z - pz; return [(dx * cy - dz * sy) * k, (dx * sy + dz * cy) * k]; };
    for (const mk of o.markers || []) {
      let [sx, sz] = toScreen(mk.x, mk.z);
      const d = Math.hypot(sx, sz), lim = R - 10 * dpr, edge = d > lim;
      if (edge && !mk.edge) continue;
      if (edge) { sx *= lim / d; sz *= lim / d; }
      const x = R + sx, y = R + sz, r = (mk.r || 5) * dpr * (edge ? 0.8 : 1);
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = mk.color || '#ffc400'; g.fill();
      g.lineWidth = 1.5 * dpr; g.strokeStyle = mk.ring || 'rgba(0,0,0,.55)'; g.stroke();
      if (mk.emoji && r > 5 * dpr) { g.font = Math.round(r * 1.25) + 'px ' + EMOJI_FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(mk.emoji, x, y + 0.5 * dpr); }
    }
    g.save(); g.translate(R, R);
    g.rotate(yaw - player.face);
    g.beginPath(); g.moveTo(0, -9 * dpr); g.lineTo(6.5 * dpr, 7 * dpr); g.lineTo(0, 3.5 * dpr); g.lineTo(-6.5 * dpr, 7 * dpr); g.closePath();
    g.fillStyle = '#6b4eff'; g.fill(); g.lineWidth = 2 * dpr; g.strokeStyle = '#fff'; g.stroke();
    g.restore();
    const [nx, ny] = toScreen(px, pz - 1e6), nd = Math.hypot(nx, ny) || 1, nr = R - 12 * dpr;
    g.font = '800 ' + (12 * dpr) + 'px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#1f1a3d'; g.beginPath(); g.arc(R + nx / nd * nr, R + ny / nd * nr, 8 * dpr, 0, 6.29); g.fill();
    g.fillStyle = '#fff'; g.fillText('N', R + nx / nd * nr, R + ny / nd * nr + 0.5);
  };
  // North-up big map. o: {cx, cz, scale (px per m), markers, rects}
  W.drawMap = function (cv, o) {
    const g = cv.getContext('2d'), Wd = cv.width, H = cv.height, k = o.scale;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#e6e2d9'; g.fillRect(0, 0, Wd, H);
    g.save();
    g.translate(Wd / 2, H / 2); g.scale(k, k); g.translate(-o.cx, -o.cz);
    const hw = Wd / 2 / k, hh = H / 2 / k;
    for (const s of allSubs) {
      if (!s.reg || s.x1 < o.cx - hw - 50 || s.x0 > o.cx + hw + 50 || s.z1 < o.cz - hh - 50 || s.z0 > o.cz + hh + 50) continue;
      if (!s.canvas) s.canvas = drawSubMap(s);
      g.drawImage(s.canvas, s.x0 - MM_MARGIN, s.z0 - MM_MARGIN, s.canvas.width, s.canvas.height);
    }
    for (const r of o.rects || []) { g.fillStyle = r.fill; g.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0); if (r.stroke) { g.strokeStyle = r.stroke; g.lineWidth = 2 / k; g.strokeRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0); } if (r.label && k > 0.25) { g.font = '700 ' + (12 / k) + 'px Nunito, system-ui'; g.fillStyle = 'rgba(31,26,61,.75)'; g.textAlign = 'center'; g.fillText(r.label, (r.x0 + r.x1) / 2, r.z0 + 16 / k); } }
    g.restore();
    const dpr = Math.max(1, Wd / 600);
    for (const mk of (o.markers || [])) {
      const x = Wd / 2 + (mk.x - o.cx) * k, y = H / 2 + (mk.z - o.cz) * k;
      if (x < -20 || y < -20 || x > Wd + 20 || y > H + 20) continue;
      const r = (mk.r || 6) * dpr;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = mk.color || '#ffc400'; g.fill();
      g.lineWidth = 1.5 * dpr; g.strokeStyle = mk.ring || 'rgba(0,0,0,.55)'; g.stroke();
      if (mk.emoji) { g.font = Math.round(r * 1.25) + 'px ' + EMOJI_FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(mk.emoji, x, y + 0.5); }
    }
    const x = Wd / 2 + (player.pos.x - o.cx) * k, y = H / 2 + (player.pos.z - o.cz) * k;
    g.save(); g.translate(x, y); g.rotate(-player.face);
    g.beginPath(); g.moveTo(0, -10 * dpr); g.lineTo(7 * dpr, 8 * dpr); g.lineTo(0, 4 * dpr); g.lineTo(-7 * dpr, 8 * dpr); g.closePath();
    g.fillStyle = '#6b4eff'; g.fill(); g.lineWidth = 2 * dpr; g.strokeStyle = '#fff'; g.stroke(); g.restore();
  };

  W.destroy = function () {
    for (const [el, ev, fn, o] of listeners) el.removeEventListener(ev, fn, o);
    W.unlock();
    try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* ignore */ }
    gen++;
    destroyed = true;
    if (archTimer) { clearTimeout(archTimer); archTimer = null; flushArchive(); } // hand over the last batch
  };
  W.setClock(10);
  resize();
  return W;
}

window.CFTWorld = { create };
})();
