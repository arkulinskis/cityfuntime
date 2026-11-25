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
  // high quality: post-processing (cft-post.js: ambient occlusion, bloom, filmic grade). P.level drops itself when slow.
  const POST = !LOW && !opts.nopost && !/[?&]nopost=1/.test(location.search) && window.CFTPost && renderer.capabilities.isWebGL2 ? window.CFTPost.create(renderer) : null;
  if (POST) canvas.classList.add('cft-post');
  // high quality: detailed procedural materials + sky reflections (cft-gfx.js)
  const GFX = !LOW && window.CFTGfx ? window.CFTGfx.create(THREE, renderer) : null;
  const scene = new THREE.Scene();
  const skyCol = new THREE.Color(0xaecde9);
  scene.background = skyCol.clone();
  scene.fog = new THREE.Fog(0xaecde9, 120, 600);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 2000);
  const hemi = new THREE.HemisphereLight(0xe4f0ff, 0x6e685d, 0.66);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 0.66);
  sun.castShadow = !LOW;
  // sharper shadows where the GPU allows (2026-11-17 graphics pass): 4096 on big GPUs, 2048 elsewhere
  const SHADOW = !LOW && renderer.capabilities.maxTextureSize >= 8192 ? 4096 : 2048;
  sun.shadow.mapSize.set(SHADOW, SHADOW);
  Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 1, far: 1400 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  // a cool fill light from the other side, so walls in shade still show their shape (no shadows: cheap)
  const fill = new THREE.DirectionalLight(0xbcd2ff, LOW ? 0 : 0.22);
  fill.position.set(0.5, 0.35, -0.6);
  scene.add(fill);
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
    if (POST) POST.setSize(canvas.width, canvas.height);
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
  // 4x4 windows per texture so night lights can vary window by window. Drawn at 512 px (2026-11-17): recessed frames
  // with a shadow edge, glass with a sky gradient and a glint, sills, the odd plant and balcony rail.
  function windowTextures() {
    const day = document.createElement('canvas'), night = document.createElement('canvas'), S = LOW ? 256 : 512, u = S / 256;
    day.width = day.height = night.width = night.height = S;
    const g = day.getContext('2d'), n = night.getContext('2d');
    g.scale(u, u); n.scale(u, u);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
    n.fillStyle = '#000000'; n.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const x = i * 64, y = j * 64, r = hash(i * 7 + j * 13 + 3);
      g.fillStyle = '#f6f4f0'; g.fillRect(x, y, 64, 54);                 // wall (tinted by the building colour)
      g.fillStyle = 'rgba(0,0,0,.035)'; for (let k = 0; k < 54; k += 6) g.fillRect(x, y + k, 64, 1);  // faint courses of brick / panels
      g.fillStyle = '#e4e2de'; g.fillRect(x, y + 54, 64, 10);           // floor band
      g.fillStyle = '#d2cfc8'; g.fillRect(x, y + 54, 64, 1.5);
      g.fillStyle = '#cfcac0'; g.fillRect(x + 10, y + 8, 44, 42);        // recess shadow
      g.fillStyle = '#f3f1ec'; g.fillRect(x + 11, y + 9, 42, 40);        // frame
      const gr = g.createLinearGradient(0, y + 12, 0, y + 46);
      gr.addColorStop(0, '#b9d0ea'); gr.addColorStop(0.45, '#7f97b8'); gr.addColorStop(1, '#5d7393');
      g.fillStyle = gr; g.fillRect(x + 14, y + 12, 36, 34);              // glass with the sky in it
      g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(x + 16, y + 44); g.lineTo(x + 27, y + 14); g.lineTo(x + 32, y + 14); g.lineTo(x + 21, y + 44); g.fill(); // glint
      g.fillStyle = 'rgba(20,30,50,.28)'; g.fillRect(x + 14, y + 12, 36, 2.5); g.fillRect(x + 14, y + 12, 2.5, 34); // the frame's shadow on the glass
      if (r > 0.72) { g.fillStyle = ['#e9c9a8', '#c9d9e9', '#e7b4c0', '#cfe3c0'][(i + j) % 4]; g.fillRect(x + 14, y + 12, 36, 14); g.fillStyle = 'rgba(0,0,0,.08)'; for (let k = 0; k < 14; k += 2.5) g.fillRect(x + 14, y + 12 + k, 36, 0.8); } // blinds / curtains
      g.fillStyle = '#f3f1ec'; g.fillRect(x + 31, y + 12, 2, 34); g.fillRect(x + 14, y + 28, 36, 2);
      g.fillStyle = '#d6d2ca'; g.fillRect(x + 9, y + 47, 46, 4);         // sill
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + 9, y + 51, 46, 1.5);
      if (r > 0.86) { g.fillStyle = '#4f8a3a'; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + 17 + k * 7.5, y + 45, 3.2, 0, 6.3); g.fill(); } g.fillStyle = '#b5523b'; g.fillRect(x + 13, y + 46, 38, 2.5); } // window box
      else if (r > 0.6 && r < 0.66) { g.fillStyle = '#3a3f4a'; g.fillRect(x + 9, y + 38, 46, 1.5); for (let k = 0; k <= 46; k += 4.6) g.fillRect(x + 9 + k, y + 38, 1, 9); } // a little railing
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
    walls: GFX ? GFX.wallMaterial() : new THREE.MeshLambertMaterial({ map: winDay, emissiveMap: winNight, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true }),
    plain: GFX ? GFX.roofMaterial() : new THREE.MeshLambertMaterial({ vertexColors: true }),
    terrain: new THREE.MeshLambertMaterial({ vertexColors: true }),   // photo-textured (groundify, below)
    // parks, water, roads draped on the hills: pulled towards the camera so they never flicker into the ground
    drape: new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    trunk: new THREE.MeshLambertMaterial({ color: 0x6b4f37 }),
    crown: GFX ? GFX.pbr({ vertexColors: false, leaf: true }) : new THREE.MeshLambertMaterial({ color: 0xffffff }),
    vc: GFX ? GFX.pbr() : new THREE.MeshLambertMaterial({ vertexColors: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    bulb: new THREE.MeshBasicMaterial({ color: 0x9a9a8c }),          // street-lamp heads: grey by day, warm at night (setClock)
    pool: new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    signal: new THREE.MeshBasicMaterial({ color: 0xffffff }),        // traffic-light lamps, coloured per instance
    // instanced street furniture has its own materials: three r149 keeps one shader per material, so a material
    // shared by tinted and untinted instances would draw every parked car white
    prop: GFX ? GFX.pbr() : new THREE.MeshLambertMaterial({ vertexColors: true }),
    tint: GFX ? GFX.pbr() : new THREE.MeshLambertMaterial({ vertexColors: true }),
    // a soft glow around every street-lamp head at night (additive, so it reads as bloom without post-processing)
    wreck: new THREE.MeshLambertMaterial({ color: 0x2b2a2e }),
    halo: new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  };

  // ---------------------------------------------------------------- ground textures (2026-11-17)
  // Photo textures on every floor surface: Poly Haven CC0 photos (theme/assets/ground-*.jpg, 1024 px, AO baked in; the
  // sources are listed in the guide). They sit in one texture array (WebGL2), so a sub-tile's whole drape mesh stays one
  // draw call. Each drape/terrain vertex carries `glayer` (TEX index, -1 = plain colour, e.g. water) and `guv`, ground
  // coordinates in metres (world x/z, or along the street for pavement slabs). The vertex colour stays the surface's
  // colour: the shader divides the photo by its average colour, so it adds detail and keeps the palette, then mixes in
  // `real` of the photo's own hues. m = metres one photo covers (their real size), k = how strong the detail is.
  // Without WebGL2, or until the photos load, the ground looks as it did before (plain colours).
  const TEX = [
    { f: 'asphalt', m: 7.0, k: 1.0, real: 0, draw: cartoonRoad },  // 0 car roads, service lanes, cycleways, road paint (drawn, not a photo)
    { f: 'sidewalk', m: 6.0, k: 1.0, real: 0.5, draw: cartoonPavement },  // 1 pavements + kerbs: drawn cartoon slabs laid along the street (4 x 4 of 1.5 m)
    { f: 'grass', m: 2.4, k: 0.95, real: 0.4 },     // 2 grass, parks, pitches, cemeteries
    { f: 'forest', m: 3.0, k: 0.9, real: 0.45 },    // 3 woods
    { f: 'bricks', m: 2.4, k: 0.9, real: 0.5 },     // 4 plazas, pedestrian streets, steps
    { f: 'sand', m: 1.8, k: 0.9, real: 0.35 },      // 5 sand, playgrounds
    { f: 'ground', m: 2.6, k: 0.85, real: 0.3 },    // 6 the terrain between everything (yards, lots)
    { f: 'path', m: 2.0, k: 0.9, real: 0.2 },       // 7 footways, park paths (plain concrete, no slab joints)
  ];
  const TL = { asphalt: 0, sidewalk: 1, grass: 2, forest: 3, bricks: 4, sand: 5, ground: 6, path: 7, none: -1 };
  const NT = TEX.length, TERRAIN_COL = new THREE.Color(0x8f9282);  // a touch greener than the far floor: yards
  const blankArr = new THREE.DataArrayTexture(new Uint8Array(4 * NT).fill(255), 1, 1, NT);
  blankArr.needsUpdate = true;
  const GU = {
    groundTex: { value: blankArr }, gOn: { value: 0 },
    gMean: { value: TEX.map(() => new THREE.Vector3(1, 1, 1)) },
    gScale: { value: TEX.map(t => 1 / t.m) }, gK: { value: TEX.map(t => t.k) }, gReal: { value: TEX.map(t => t.real) },
  };
  function groundify(mat) {
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, GU);
      sh.vertexShader = 'attribute float glayer;\nattribute vec2 guv;\nvarying float vGL;\nvarying vec2 vGUV;\n' +
        sh.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\n\tvGL = glayer; vGUV = guv;');
      sh.fragmentShader = `uniform highp sampler2DArray groundTex;
uniform float gOn; uniform vec3 gMean[${NT}]; uniform float gScale[${NT}]; uniform float gK[${NT}]; uniform float gReal[${NT}];
varying float vGL; varying vec2 vGUV;
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
	if (gOn > 0.5 && vGL > -0.5) {
		int L = int(vGL + 0.5);
		vec2 uv = vGUV * gScale[L];
		vec3 m = gMean[L];
		vec3 t = texture(groundTex, vec3(uv, float(L))).rgb;
		// big soft patches (the same photo, ~14x larger and turned) so wide lawns and long roads don't repeat
		vec3 big = texture(groundTex, vec3(mat2(0.8, -0.6, 0.6, 0.8) * uv * 0.071 + 0.37, float(L))).rgb / m;
		float patchy = mix(1.0, dot(big, vec3(0.3333)), 0.55);
		vec3 base = diffuseColor.rgb;
		vec3 detail = mix(vec3(1.0), t / m, gK[L]) * patchy;
		vec3 photo = t * (dot(base, vec3(0.3333)) / max(dot(m, vec3(0.3333)), 0.02)) * patchy;
		diffuseColor.rgb = mix(base * detail, photo, gReal[L]);
	}`);
    };
    mat.customProgramCacheKey = () => 'cft-ground';
  }
  groundify(MAT.terrain); groundify(MAT.drape);
  // Loads the photos into the texture array (512 px on low quality) and measures each photo's average colour.
  function loadGround() {
    if (!renderer.capabilities.isWebGL2) return;
    const S = LOW ? 512 : 1024;
    const load = t => t.draw ? Promise.resolve(t.draw(S)) : new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = '_/theme/ground-' + t.f + '.jpg?v=1'; });
    Promise.all(TEX.map(load)).then(ims => {
      if (destroyed || ims.some(im => !im)) return;
      const cv = document.createElement('canvas'); cv.width = cv.height = S;
      const g = cv.getContext('2d', { willReadFrequently: true }), data = new Uint8Array(S * S * 4 * NT);
      ims.forEach((im, i) => {
        g.drawImage(im, 0, 0, S, S);
        const px = g.getImageData(0, 0, S, S).data;
        data.set(px, i * S * S * 4);
        let r = 0, gg = 0, b = 0, n = 0;
        for (let k = 0; k < px.length; k += 4 * 7) { r += px[k]; gg += px[k + 1]; b += px[k + 2]; n++; }
        GU.gMean.value[i].set(r / n / 255, gg / n / 255, b / n / 255);
      });
      const tex = new THREE.DataArrayTexture(data, S, S, NT);
      tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
      tex.anisotropy = Math.min(LOW ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
      tex.needsUpdate = true;
      GU.groundTex.value = tex; GU.gOn.value = 1;
      W.groundTextures = true;
    });
  }
  // The road surface as a cartoon (2026-11-20, the photo felt too serious): flat slate with soft blotches, rounded
  // pebbles and a few chunky outlined cracks and tar patches. Drawn once on a canvas, seamless (every shape is drawn
  // again one tile over on each side). The shader divides by its average colour, so roads keep ROAD_STYLE's colours.
  function cartoonRoad(S) {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), u = S / 512;
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const wrap = fn => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.save(); g.translate(ox, oy); fn(); g.restore(); } };
    g.fillStyle = '#6c7180'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 9; i++) { // big soft blotches, a shade lighter or darker
      const x = rnd() * S, y = rnd() * S, r = (60 + rnd() * 90) * u, lt = rnd() < 0.5;
      wrap(() => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, lt ? 'rgba(150,156,175,0.35)' : 'rgba(60,64,78,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); });
    }
    g.lineJoin = g.lineCap = 'round';
    for (let i = 0; i < 4; i++) { // tar patches: rounded blobs, darker, outlined
      const x = rnd() * S, y = rnd() * S, w = (26 + rnd() * 30) * u, h = (14 + rnd() * 16) * u, a = rnd() * Math.PI;
      wrap(() => { g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); g.fillStyle = '#585d6c'; g.fill(); g.lineWidth = 3 * u; g.strokeStyle = '#3a3e4b'; g.stroke(); g.restore(); });
    }
    for (let i = 0; i < 5; i++) { // cracks: a zigzag with a dark line and a light edge
      const pts = [[rnd() * S, rnd() * S]];
      let a = rnd() * Math.PI * 2;
      for (let j = 0; j < 4; j++) { a += (rnd() - 0.5) * 1.6; const l = (14 + rnd() * 18) * u, q = pts[pts.length - 1]; pts.push([q[0] + Math.cos(a) * l, q[1] + Math.sin(a) * l]); }
      const line = (dx, dy) => { g.beginPath(); pts.forEach((p, j) => j ? g.lineTo(p[0] + dx, p[1] + dy) : g.moveTo(p[0] + dx, p[1] + dy)); g.stroke(); };
      wrap(() => { g.lineWidth = 2.5 * u; g.strokeStyle = 'rgba(170,176,194,0.7)'; line(1.5 * u, 1.5 * u); g.lineWidth = 4 * u; g.strokeStyle = '#33363f'; line(0, 0); });
    }
    for (let i = 0; i < 70; i++) { // pebbles: little rounded stones with an outline and a shine
      const x = rnd() * S, y = rnd() * S, r = (2.5 + rnd() * 4.5) * u, a = rnd() * Math.PI, lt = rnd() < 0.7;
      wrap(() => {
        g.beginPath(); g.ellipse(x, y, r * 1.3, r, a, 0, Math.PI * 2);
        g.fillStyle = lt ? '#9097aa' : '#555a68'; g.fill(); g.lineWidth = 1.6 * u; g.strokeStyle = '#3a3e4b'; g.stroke();
        if (lt) { g.beginPath(); g.arc(x - r * 0.35, y - r * 0.35, r * 0.35, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fill(); }
      });
    }
    return c;
  }
  // The pavement as a cartoon (2026-11-23, the user: the photo "looks uninviting, needs to be more friendly"): warm cream
  // slabs with soft bevels and rounded corners, little grass tufts and flowers in the joints, and the odd chalk doodle
  // (heart, star, smiley, sun, hopscotch squares). 4 x 4 slabs per tile (TEX m = 6 m), seamless: the joints sit on the
  // tile edges and anything crossing an edge is drawn again one tile over. real = 0.5 lets the chalk colours show.
  function cartoonPavement(S) {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), u = S / 512, N = 4, cell = S / N, j = 5 * u;   // j = half a joint
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const wrap = fn => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.save(); g.translate(ox, oy); fn(); g.restore(); } };
    const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    g.lineJoin = g.lineCap = 'round';
    g.fillStyle = '#b3a58f'; g.fillRect(0, 0, S, S);   // the joints
    const tones = ['#e9dfcc', '#e4d8c2', '#ede4d3', '#e6d6c4', '#e2dccb', '#eadbc8'];
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
      const x = a * cell + j, y = b * cell + j, w = cell - 2 * j, r = 14 * u;
      rr(x, y, w, w, r); g.fillStyle = tones[Math.floor(rnd() * tones.length)]; g.fill();
      // soft bevel: light from the top-left, a shade along the bottom-right
      g.save(); rr(x, y, w, w, r); g.clip();
      g.lineWidth = 7 * u; g.strokeStyle = 'rgba(255,255,255,0.55)'; rr(x + 2 * u, y + 2 * u, w + 6 * u, w + 6 * u, r); g.stroke();
      g.strokeStyle = 'rgba(120,98,70,0.22)'; rr(x - 6 * u, y - 6 * u, w + 4 * u, w + 4 * u, r); g.stroke();
      for (let k = 0; k < 26; k++) {   // speckles, like terrazzo
        g.beginPath(); g.arc(x + rnd() * w, y + rnd() * w, (1 + rnd() * 1.8) * u, 0, Math.PI * 2);
        g.fillStyle = rnd() < 0.5 ? 'rgba(150,128,100,0.35)' : 'rgba(255,255,255,0.6)'; g.fill();
      }
      g.restore();
      g.lineWidth = 2 * u; g.strokeStyle = 'rgba(110,92,70,0.45)'; rr(x, y, w, w, r); g.stroke();   // a friendly outline
    }
    // grass tufts and tiny flowers in the joints
    const FLOWER = ['#ffffff', '#ffd23f', '#ff8fb8', '#b48cff'];
    for (let i = 0; i < 18; i++) {
      const along = rnd() < 0.5, line = Math.floor(rnd() * N) * cell, t = rnd() * S;
      const x = along ? t : line, y = along ? line : t;
      wrap(() => {
        g.strokeStyle = '#5fa24a'; g.lineWidth = 2.4 * u;
        for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x + k * 2 * u, y); g.quadraticCurveTo(x + k * 3 * u, y - 6 * u, x + k * 5 * u, y - (9 + rnd() * 5) * u); g.stroke(); }
        if (rnd() < 0.55) {
          const fx = x + (rnd() - 0.5) * 6 * u, fy = y - 9 * u, col = FLOWER[Math.floor(rnd() * FLOWER.length)];
          for (let k = 0; k < 5; k++) { const an = k / 5 * Math.PI * 2; g.beginPath(); g.arc(fx + Math.cos(an) * 3.2 * u, fy + Math.sin(an) * 3.2 * u, 2.6 * u, 0, Math.PI * 2); g.fillStyle = col; g.fill(); }
          g.beginPath(); g.arc(fx, fy, 2 * u, 0, Math.PI * 2); g.fillStyle = col === '#ffd23f' ? '#e8853c' : '#ffc21f'; g.fill();
        }
      });
    }
    // chalk doodles, each inside one slab (so they never cross a tile edge)
    const chalk = (col, w) => { g.strokeStyle = col; g.lineWidth = (w || 4) * u; g.globalAlpha = 0.8; };
    const slab = (a, b) => [a * cell + cell / 2, b * cell + cell / 2];
    const doodles = [
      (x, y) => { chalk('#ff6fa8'); g.beginPath(); g.moveTo(x, y + 22 * u); g.bezierCurveTo(x - 34 * u, y - 4 * u, x - 18 * u, y - 30 * u, x, y - 12 * u); g.bezierCurveTo(x + 18 * u, y - 30 * u, x + 34 * u, y - 4 * u, x, y + 22 * u); g.stroke(); },
      (x, y) => { chalk('#f2b500'); g.beginPath(); for (let k = 0; k <= 10; k++) { const an = -Math.PI / 2 + k * Math.PI / 5, r = (k % 2 ? 11 : 26) * u; g.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r); } g.stroke(); },
      (x, y) => { chalk('#4f9fe8'); g.beginPath(); g.arc(x, y, 24 * u, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(x, y + 2 * u, 13 * u, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke(); g.beginPath(); g.arc(x - 8 * u, y - 7 * u, 2 * u, 0, Math.PI * 2); g.arc(x + 8 * u, y - 7 * u, 2 * u, 0, Math.PI * 2); g.stroke(); },
      (x, y) => { chalk('#ff9a3c'); g.beginPath(); g.arc(x, y, 13 * u, 0, Math.PI * 2); g.stroke(); for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4; g.beginPath(); g.moveTo(x + Math.cos(an) * 19 * u, y + Math.sin(an) * 19 * u); g.lineTo(x + Math.cos(an) * 28 * u, y + Math.sin(an) * 28 * u); g.stroke(); } },
      (x, y) => { chalk('#ffffff', 3.5); const q = 22 * u; [[0, -1.5], [0, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, 1.5]].forEach(([dx, dy], k) => { g.strokeRect(x + dx * q - q / 2, y + dy * q - q / 2, q, q); g.font = 'bold ' + Math.round(13 * u) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff'; g.fillText(String(k + 1), x + dx * q, y + dy * q); }); },
    ];
    const used = new Set();
    doodles.forEach(fn => {
      let a, b; do { a = Math.floor(rnd() * N); b = Math.floor(rnd() * N); } while (used.has(a * N + b));
      used.add(a * N + b);
      const [x, y] = slab(a, b);
      g.save(); g.translate(x, y); g.rotate((rnd() - 0.5) * 0.8); fn(0, 0); g.restore();
    });
    g.globalAlpha = 1;
    return c;
  }
  const CAR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service', 'track']);
  const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary']);
  const ROAD_STYLE = {
    car: { col: new THREE.Color(0x4a4f60), y: 0.08, l: TL.asphalt }, service: { col: new THREE.Color(0x5a5e6c), y: 0.075, l: TL.asphalt },
    pedestrian: { col: new THREE.Color(0xc4baa6), y: 0.065, l: TL.bricks }, footway: { col: new THREE.Color(0xbab5ab), y: 0.05, l: TL.path },
    steps: { col: new THREE.Color(0xa69d8f), y: 0.055, l: TL.bricks }, cycleway: { col: new THREE.Color(0x6e7c74), y: 0.06, l: TL.asphalt },
  };
  const roadStyle = t => (t === 'service' || t === 'track') ? ROAD_STYLE.service : CAR.has(t) ? ROAD_STYLE.car : (ROAD_STYLE[t] || ROAD_STYLE.footway);
  // [3D colour, lift, minimap colour, ground photo]
  const AREA = {
    plaza: [0xb9b2a4, 0.012, '#d9d3c6', TL.bricks], grass: [0x76a457, 0.018, '#bfe0a6', TL.grass], cemetery: [0x7f9f6a, 0.018, '#c4dcb4', TL.grass],
    park: [0x6c9a4e, 0.024, '#b4d89b', TL.grass], wood: [0x4f7f3a, 0.03, '#9cc988', TL.forest], pitch: [0x5f9e48, 0.036, '#a9d68f', TL.grass],
    playground: [0xc4a679, 0.036, '#e5d4b3', TL.sand], sand: [0xd8c9a0, 0.036, '#efe4c4', TL.sand], water: [0x4f8fbf, 0.045, '#9fcff0', TL.none],
  };

  // Merges coloured primitives into one vertex-coloured geometry (people, cars, props).
  const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  // Surface classes (2026-11-19, read by cft-gfx.js pbr materials): 0 matte, 1 car paint, 2 glass, 3 metal, 4 skin, 5 wet /
  // eyes, 6 cloth, 7 hair, 8 leaves, 9 plastic. m.as(k) sets the class for what follows (null = look it up); m.kOf =
  // {hexColour: class} (or the builder-wide KOF while W.person runs) picks it by colour.
  let KOF = null;
  class Merge {
    constructor() { this.p = []; this.n = []; this.c = []; this.mk = []; this.k = null; this.kOf = null; }
    as(k) { this.k = k; return this; }
    kFor(hex) { if (this.k != null) return this.k; const t = this.kOf || KOF; return (t && t[hex]) || 0; }
    add(geo, color, x, y, z, rx, ry, rz, sx, sy, sz) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      _m4.compose(_v.set(x || 0, y || 0, z || 0), _q.setFromEuler(_e.set(rx || 0, ry || 0, rz || 0)), _s.set(sx || 1, sy || 1, sz || 1));
      const nm = new THREE.Matrix3().getNormalMatrix(_m4);
      const P = g.attributes.position, N = g.attributes.normal;
      _c.set(color);
      const k = this.kFor(_c.getHex());
      const pv = new THREE.Vector3(), nv = new THREE.Vector3();
      for (let i = 0; i < P.count; i++) {
        pv.fromBufferAttribute(P, i).applyMatrix4(_m4); nv.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
        this.p.push(pv.x, pv.y, pv.z); this.n.push(nv.x, nv.y, nv.z); this.c.push(_c.r, _c.g, _c.b); this.mk.push(k);
      }
      return this;
    }
    box(w, h, d, color, x, y, z, rx, ry, rz) { return this.add(UNIT_BOX, color, x, y, z, rx, ry, rz, w, h, d); }
    addRaw(geo) { // a non-indexed geometry with its own vertex colours, as is
      const P = geo.attributes.position, N = geo.attributes.normal, C = geo.attributes.color;
      const t = this.kOf || KOF, k = this.k != null ? this.k : (t && t.raw) || 0;
      for (let i = 0; i < P.count; i++) { this.p.push(P.getX(i), P.getY(i), P.getZ(i)); this.n.push(N.getX(i), N.getY(i), N.getZ(i)); this.c.push(C.getX(i), C.getY(i), C.getZ(i)); this.mk.push(k); }
      return this;
    }
    addMerge(o, x, y, z, sx, sy, sz) { // another Merge, scaled (sx, sy, sz) then moved by (x, y, z)
      for (let i = 0; i < o.p.length; i += 3) {
        this.p.push(o.p[i] * sx + x, o.p[i + 1] * sy + y, o.p[i + 2] * sz + z);
        const nx = o.n[i] / sx, ny = o.n[i + 1] / sy, nz = o.n[i + 2] / sz, l = Math.hypot(nx, ny, nz) || 1;
        this.n.push(nx / l, ny / l, nz / l); this.c.push(o.c[i], o.c[i + 1], o.c[i + 2]); this.mk.push(o.mk[i / 3] || 0);
      }
      return this;
    }
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      if (GFX && this.mk.some(v => v)) g.setAttribute('mk', new THREE.Float32BufferAttribute(this.mk, 1));
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
  //
  // Trees (realism pass, 2026-11-17): four kinds, TREE[k] = {trunk, crown}, picked per spot by treeKind(): 0 broadleaf (maple,
  // oak: a fork of limbs under a wide dome), 1 linden (a tall oval), 2 spruce (jagged tiers), 3 birch (white bark with dark
  // marks, two stems, an airy crown). Crowns are lumpy leaf clumps (leafShell) whose normals point out from the crown's centre,
  // so light falls on them softly like on real foliage, darker underneath and inside. MAT.crown tints the leaves per instance;
  // MAT.trunk keeps the bark's own vertex colours. Bushes (BUSH: round, flowering, a topiary duck) fill gaps on residential
  // streets and in parks. Low quality keeps the old single tree for every kind and no bushes.
  const lumpy = (x, y, z) => Math.sin(x * 2.3 + y * 1.1) * Math.sin(y * 2.9 + z * 1.7) * Math.sin(z * 2.1 + x * 2.7) + 0.45 * Math.sin(x * 5.3 - z * 4.1 + y * 3.7);
  const LEAF = [new THREE.IcosahedronGeometry(1, 0), new THREE.IcosahedronGeometry(1, 1)];  // already non-indexed
  const CONE12 = new THREE.ConeGeometry(1, 1, 12, 1).toNonIndexed();
  // geo's vertices put at (x, y, z) scaled (sx, sy, sz), pushed in and out by lumpy noise (amt). crown = [cx, cy, cz, R, y0, y1]:
  // the crown's centre and radius (normals point away from it) and the heights where the shading goes from dark to light.
  function leafShell(m, geo, col, x, y, z, sx, sy, sz, amt, crown, seed) {
    const P = geo.attributes.position, cx = crown[0], cy = crown[1], cz = crown[2], R = crown[3], y0 = crown[4], y1 = crown[5];
    _c.set(col); const cr = _c.r, cg = _c.g, cb = _c.b;
    for (let i = 0; i < P.count; i++) {
      const px = P.getX(i), py = P.getY(i), pz = P.getZ(i);
      const n = 1 + amt * lumpy(px * 1.9 + seed, py * 1.9 - seed * 0.7, pz * 1.9 + seed * 1.3);
      const wx = x + px * sx * n, wy = y + py * sy * n, wz = z + pz * sz * n;
      const nx = (wx - cx) / R + px * 0.6, ny = (wy - cy) / R * 1.3 + py * 0.6 + 0.2, nz = (wz - cz) / R + pz * 0.6, l = Math.hypot(nx, ny, nz) || 1;
      const h = Math.min(1, Math.max(0, (wy - y0) / (y1 - y0))), out = Math.min(1, Math.hypot(wx - cx, (wy - cy) * 1.2, wz - cz) / R);
      const s = Math.min(1.08, 0.42 + 0.36 * h + 0.3 * out);
      m.p.push(wx, wy, wz); m.n.push(nx / l, ny / l, nz / l); m.c.push(Math.min(1, cr * s), Math.min(1, cg * s), Math.min(1, cb * s));
    }
  }
  // A tapered piece (TAPER) or a square stick (STICK) from a to b, r wide at a: tree limbs, car pillars, antlers...
  const TAPER = new THREE.CylinderGeometry(0.62, 1, 1, 7, 1).translate(0, 0.5, 0).toNonIndexed();
  const STICK = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0).toNonIndexed();
  const _up = new THREE.Vector3(0, 1, 0), _bd = new THREE.Vector3(), _bq = new THREE.Quaternion(), _be = new THREE.Euler();
  function seg(m, geo, col, ax, ay, az, bx, by, bz, r, r2) {
    _bd.set(bx - ax, by - ay, bz - az); const len = _bd.length(); if (len < 1e-4) return;
    _bd.multiplyScalar(1 / len); _bq.setFromUnitVectors(_up, _bd); _be.setFromQuaternion(_bq);
    m.add(geo, col, ax, ay, az, _be.x, _be.y, _be.z, r, len, r2 || r);
  }
  const BARK = 0x6e5442, BARK_D = 0x56412f, BIRCH = 0xe9e5dc;
  const TREE = (() => {
    if (LOW) return [{ trunk: new THREE.CylinderGeometry(0.14, 0.2, 2.6, 6).translate(0, 1.3, 0), crown: new THREE.IcosahedronGeometry(1.7, 0).translate(0, 3.9, 0) }];
    const out = [], r = k => hash(9001 + k), W1 = 0xffffff;
    const tree = (fnT, fnC) => { const t = new Merge(), c = new Merge(); fnT(t); fnC(c); out.push({ trunk: t.build(), crown: c.build() }); };
    // 0 broadleaf: a sturdy trunk forking into five limbs, a wide dome of clumps
    tree(t => {
      t.add(CONE, BARK_D, 0, 0.2, 0, 0, 0, 0, 0.72, 0.42, 0.72);
      seg(t, TAPER, BARK, 0, 0, 0, 0.06, 2.5, 0.02, 0.25);
      for (let k = 0; k < 5; k++) { const a = k * 1.257 + 0.3; seg(t, TAPER, BARK, 0.05, 2.3, 0.02, Math.cos(a) * 1.3, 3.7 + r(k) * 0.6, Math.sin(a) * 1.3, 0.13); }
      seg(t, TAPER, BARK, 0.05, 2.4, 0, 0.1, 4.7, -0.05, 0.13);
    }, c => {
      const cr = [0, 4.6, 0, 2.6, 3.0, 6.6];
      leafShell(c, LEAF[0], W1, 0, 4.5, 0, 1.55, 1.3, 1.55, 0.15, cr, 1);
      for (let k = 0; k < 6; k++) { const a = k * 1.047 + 0.26, s = 1.05 + r(10 + k) * 0.25; leafShell(c, LEAF[1], W1, Math.cos(a) * 1.45, 4.05 + (k % 2) * 0.75, Math.sin(a) * 1.45, s, s * 0.82, s, 0.22, cr, k * 3.1); }
      leafShell(c, LEAF[1], W1, 0.15, 5.55, -0.1, 1.15, 0.9, 1.15, 0.22, cr, 7);
    });
    // 1 linden: a straight trunk, a tall oval crown
    tree(t => {
      t.add(CONE, BARK_D, 0, 0.16, 0, 0, 0, 0, 0.55, 0.32, 0.55);
      seg(t, TAPER, BARK, 0, 0, 0, 0, 3.2, 0, 0.2);
      seg(t, TAPER, BARK, 0, 3.0, 0, 0.05, 6.0, 0.05, 0.12);
      for (let k = 0; k < 3; k++) { const a = k * 2.09 + 0.5; seg(t, TAPER, BARK, 0, 2.8, 0, Math.cos(a) * 0.85, 4.1, Math.sin(a) * 0.85, 0.08); }
    }, c => {
      const cr = [0, 5.0, 0, 2.0, 2.9, 7.4];
      leafShell(c, LEAF[0], W1, 0, 5.0, 0, 1.25, 1.9, 1.25, 0.12, cr, 2);
      for (let k = 0; k < 6; k++) { const a = k * 1.047 + (k % 2) * 0.5, up = k % 2, s = 0.92 + r(20 + k) * 0.2; leafShell(c, LEAF[1], W1, Math.cos(a) * (up ? 0.8 : 0.95), up ? 5.5 : 4.0, Math.sin(a) * (up ? 0.8 : 0.95), s, s * 1.05, s, 0.2, cr, k * 2.3 + 1); }
      leafShell(c, LEAF[1], W1, 0.05, 6.6, 0, 0.75, 0.8, 0.75, 0.2, cr, 9);
    });
    // 2 spruce: seven jagged tiers on a thin trunk
    tree(t => {
      t.add(CONE, BARK_D, 0, 0.12, 0, 0, 0, 0, 0.5, 0.24, 0.5);
      seg(t, TAPER, BARK, 0, 0, 0, 0, 6.6, 0, 0.19);
    }, c => {
      const cr = [0, 3.8, 0, 2.3, 0.8, 7.8];
      for (let k = 0; k < 7; k++) { const rr = 1.85 * (1 - k / 7.6) + 0.22; leafShell(c, CONE12, W1, 0, 1.55 + k * 0.84, 0, rr, 1.55, rr, 0.13, cr, k * 1.7); }
      leafShell(c, CONE12, W1, 0, 7.6, 0, 0.3, 1.0, 0.3, 0.05, cr, 11);
    });
    // 3 birch: two white stems with dark marks, small airy clumps
    tree(t => {
      seg(t, TAPER, BIRCH, 0, 0, 0, 0.25, 5.4, 0.05, 0.13);
      seg(t, TAPER, BIRCH, 0.05, 0.25, 0, -0.6, 4.7, 0.25, 0.09);
      for (let k = 0; k < 9; k++) { // the dark marks on the bark
        const f = 0.08 + k * 0.1, a = r(40 + k) * 6.28, rr = 0.13 * (1 - f * 0.38) + 0.004;
        t.box(0.07 + r(50 + k) * 0.05, 0.03, 0.025, 0x2e2b28, 0.25 * f + Math.cos(a) * rr, 5.4 * f, 0.05 * f + Math.sin(a) * rr, 0, -a + Math.PI / 2, 0);
      }
      seg(t, TAPER, BIRCH, 0.2, 4.0, 0.04, 0.9, 5.2, -0.3, 0.05); seg(t, TAPER, BIRCH, -0.45, 3.8, 0.2, -1.0, 4.9, 0.5, 0.045);
    }, c => {
      const cr = [-0.1, 4.8, 0.1, 1.9, 3.0, 6.8];
      for (let k = 0; k < 8; k++) { const a = k * 2.4, d = 0.35 + r(60 + k) * 0.65, s = 0.6 + r(70 + k) * 0.22; leafShell(c, LEAF[1], W1, -0.1 + Math.cos(a) * d, 3.55 + k * 0.4, 0.1 + Math.sin(a) * d, s, s * 0.85, s, 0.3, cr, k * 1.9 + 3); }
    });
    return out;
  })();
  if (!LOW) { MAT.crown.vertexColors = true; MAT.trunk.vertexColors = true; MAT.trunk.color.setHex(0xffffff); }
  // Level of detail (high quality): beyond LOD_R metres from you a sub-tile swaps its trees and parked cars for light stand-ins
  // (TREE_LO, PROP.carLo / vanLo) and hides its bushes (updateLod). The full models only where you can see them.
  const LOD_R = 140;
  const TREE_LO = LOW ? null : (() => {
    const W1 = 0xffffff, out = [], CONE6 = new THREE.ConeGeometry(1, 1, 7, 1).toNonIndexed();
    const tree = (fnT, fnC) => { const t = new Merge(), c = new Merge(); fnT(t); fnC(c); out.push({ trunk: t.build(), crown: c.build() }); };
    tree(t => seg(t, TAPER, BARK, 0, 0, 0, 0.05, 3.6, 0, 0.25), c => { const cr = [0, 4.6, 0, 2.6, 3.0, 6.6]; leafShell(c, LEAF[0], W1, 0, 4.5, 0, 2.35, 1.85, 2.35, 0.12, cr, 1); leafShell(c, LEAF[0], W1, 0.4, 5.5, 0.1, 1.4, 1.0, 1.4, 0.12, cr, 2); });
    tree(t => seg(t, TAPER, BARK, 0, 0, 0, 0, 3.8, 0, 0.2), c => { const cr = [0, 5.0, 0, 2.0, 2.9, 7.4]; leafShell(c, LEAF[0], W1, 0, 5.0, 0, 1.65, 2.4, 1.65, 0.1, cr, 3); leafShell(c, LEAF[0], W1, 0, 6.5, 0, 0.9, 0.8, 0.9, 0.1, cr, 4); });
    tree(t => seg(t, TAPER, BARK, 0, 0, 0, 0, 2.0, 0, 0.19), c => { const cr = [0, 3.8, 0, 2.3, 0.8, 7.8]; leafShell(c, CONE6, W1, 0, 2.3, 0, 1.95, 2.8, 1.95, 0.08, cr, 5); leafShell(c, CONE6, W1, 0, 4.4, 0, 1.4, 2.6, 1.4, 0.08, cr, 6); leafShell(c, CONE6, W1, 0, 6.4, 0, 0.8, 2.6, 0.8, 0.05, cr, 7); });
    tree(t => { seg(t, TAPER, BIRCH, 0, 0, 0, 0.25, 4.6, 0.05, 0.13); seg(t, TAPER, BIRCH, 0.05, 0.25, 0, -0.55, 4.0, 0.25, 0.09); }, c => { const cr = [-0.1, 4.8, 0.1, 1.9, 3.0, 6.8]; leafShell(c, LEAF[0], W1, 0.1, 4.6, 0, 1.2, 1.4, 1.2, 0.18, cr, 8); leafShell(c, LEAF[0], W1, -0.5, 5.6, 0.3, 0.9, 1.0, 0.9, 0.18, cr, 9); });
    return out;
  })();
  // Which tree grows here: wood = mostly spruce, park = a mix, street = broadleaf and linden with the odd birch. Low: one kind.
  function treeKind(x, z, where) {
    if (LOW) return 0;
    const q = hash(Math.round(x * 3.1) * 7919 + Math.round(z * 2.7) * 104729);
    if (where === 'wood') return q < 0.42 ? 2 : q < 0.75 ? 0 : q < 0.9 ? 3 : 1;
    if (where === 'park') return q < 0.38 ? 0 : q < 0.6 ? 1 : q < 0.8 ? 3 : 2;
    return q < 0.5 ? 0 : q < 0.82 ? 1 : q < 0.95 ? 3 : 2;
  }
  // Bushes: 0 round, 1 flowering (FLOWERS = its blossoms, untinted), 2 a topiary duck (parks only). High quality only.
  const BUSH = LOW ? null : (() => {
    const W1 = 0xffffff, cr = [0, 0.45, 0, 0.95, 0.0, 1.15];
    const round = s => { const m = new Merge(); leafShell(m, LEAF[1], W1, 0, 0.5 * s, 0, 0.75, 0.56 * s, 0.75, 0.18, cr, 1); leafShell(m, LEAF[1], W1, 0.45, 0.42 * s, 0.2, 0.55, 0.45 * s, 0.55, 0.2, cr, 2); leafShell(m, LEAF[1], W1, -0.42, 0.45 * s, -0.25, 0.6, 0.48 * s, 0.6, 0.2, cr, 3); return m.build(); };
    const duck = new Merge(), dc = [0, 0.8, 0, 1.0, 0.1, 1.5];
    leafShell(duck, LEAF[1], W1, 0, 0.6, 0.05, 0.55, 0.45, 0.8, 0.07, dc, 4);
    leafShell(duck, LEAF[1], W1, 0, 1.18, -0.45, 0.32, 0.32, 0.32, 0.06, dc, 5);
    leafShell(duck, LEAF[0], W1, 0, 1.12, -0.8, 0.14, 0.07, 0.2, 0.0, dc, 6);
    leafShell(duck, LEAF[0], W1, 0, 0.92, 0.78, 0.2, 0.26, 0.16, 0.05, dc, 7);
    duck.add(CYL8, 0x8a5a3c, 0, 0.08, 0, 0, 0, 0, 1.2, 0.16, 1.4);   // a trimmed bed
    return [round(1), round(1.15), duck.build()];
  })();
  const FLOWERS = LOW ? null : (() => {
    const m = new Merge(), cols = [0xffffff, 0xff8fb8, 0xffd23f, 0xb48cff, 0xff6b6b];
    for (let k = 0; k < 16; k++) {
      const a = hash(300 + k) * 6.28, e = 0.15 + hash(320 + k) * 1.1, cx = k % 3 === 1 ? 0.45 : k % 3 === 2 ? -0.42 : 0, cz = k % 3 === 1 ? 0.2 : k % 3 === 2 ? -0.25 : 0, rr = k % 3 ? 0.58 : 0.78;
      m.add(LEAF[0], cols[k % cols.length], cx + Math.cos(a) * Math.cos(e) * rr, 0.55 + Math.sin(e) * 0.6, cz + Math.sin(a) * Math.cos(e) * rr, 0, 0, 0, 0.07, 0.07, 0.07);
    }
    return m.build();
  })();
  const SHARED = new Set();
  for (const t of TREE.concat(TREE_LO || [])) { SHARED.add(t.trunk); SHARED.add(t.crown); }
  if (BUSH) { BUSH.forEach(g => SHARED.add(g)); SHARED.add(FLOWERS); }
  const shared = g => { SHARED.add(g); return g; };
  const propGeo = fn => { const m = new Merge(); fn(m); return shared(m.build()); };

  // ---- the decor layer (2026-11-18, "more colours, objects everywhere, fill the empty spaces"): colourful junk, plastic
  // wildlife and silly monuments on pavements, in parks and plazas, floating on the water, flags strung across side
  // streets. DECOR[kind] = {a, b, glow}: a = the part tinted per instance (drawn white, MAT.tint), b = the part with its own
  // colours (MAT.decor), glow = unlit colours (MAT.dglow: crystals, a vending machine's front). Placed by layDecor, drawn
  // by decorInst in buildSub. Kinds in DECOR_HP can be smashed like street furniture (W.hitProp); small ones only show
  // within LOD_R (DECOR_HI). Everything faces -z and stands on y = 0.
  const TORUS = new THREE.TorusGeometry(1, 0.42, 8, 18).toNonIndexed();
  const TRI = new THREE.CylinderGeometry(0.5, 0.5, 1, 3).toNonIndexed();
  const DECOR = (() => {
    const W1 = 0xffffff, out = {}, mk = fn => { const m = new Merge(); fn(m); return m.p.length ? shared(m.build()) : null; };
    const def = (k, a, b, glow) => { out[k] = { a: a ? mk(a) : null, b: b ? mk(b) : null, glow: glow ? mk(glow) : null }; };
    const RAIN = [0xff5c8a, 0xffc21f, 0x35e06a, 0x38bdf8, 0x9b5cf6, 0xff8a3d];
    const eye = (m, x, y, z, r) => { m.add(SPHERE, 0xffffff, x, y, z, 0, 0, 0, r, r, r); m.add(SPHERE, 0x111111, x, y, z - r * 0.36, 0, 0, 0, r * 0.5, r * 0.5, r * 0.4); };  // (the monsters' one is declared later)
    def('planter', m => { m.add(CYL, W1, 0, 0.36, 0, 0, 0, 0, 1.15, 0.72, 1.15); m.add(CYL, W1, 0, 0.74, 0, 0, 0, 0, 1.25, 0.1, 1.25); },
      m => { m.add(CYL, 0x5b4030, 0, 0.78, 0, 0, 0, 0, 1.08, 0.04, 1.08);
        for (let k = 0; k < 8; k++) { const a = k * 0.785 + 0.3, r = k % 2 ? 0.34 : 0.18, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 1.05 + hash(700 + k) * 0.35;
          m.box(0.03, h - 0.8, 0.03, 0x3f8f3a, x, (h + 0.8) / 2, z); m.add(SPHERE, 0x4f9a3a, x * 1.2, 0.9, z * 1.2, 0, 0, 0, 0.26, 0.16, 0.26); m.add(SPHERE, RAIN[k % 6], x, h, z, 0, 0, 0, 0.2, 0.14, 0.2); m.add(SPHERE, 0xfff3b0, x, h + 0.05, z, 0, 0, 0, 0.07, 0.06, 0.07); } });
    def('cafe', m => { m.add(CONE, W1, 0, 2.35, 0, 0, 0, 0, 2.7, 0.55, 2.7); },
      m => { m.add(CYL8, 0xf4f1ea, 0, 1.2, 0, 0, 0, 0, 0.05, 2.4, 0.05); m.add(CYL, 0xf4f1ea, 0, 0.75, 0, 0, 0, 0, 0.8, 0.05, 0.8); m.add(CYL8, 0x33373f, 0, 0.37, 0, 0, 0, 0, 0.06, 0.74, 0.06);
        for (const s of [-1, 1]) { m.box(0.42, 0.05, 0.42, 0x33373f, s * 0.62, 0.46, 0.1); m.box(0.42, 0.45, 0.05, 0x33373f, s * 0.62, 0.7, 0.3); for (const lx of [-0.18, 0.18]) m.box(0.03, 0.46, 0.03, 0x33373f, s * 0.62 + lx, 0.23, 0.1); }
        m.add(CYL8, 0xffffff, 0.1, 0.84, 0, 0, 0, 0, 0.12, 0.14, 0.12); m.add(SPHERE, 0xff5c8a, -0.15, 0.82, 0.1, 0, 0, 0, 0.14, 0.12, 0.14); });
    def('cones', null, m => { for (const [x, z, s] of [[0, 0, 1], [0.55, 0.3, 0.85], [-0.45, 0.35, 0.9], [0.1, 0.7, 0.75]]) { m.box(0.5 * s, 0.06, 0.5 * s, 0xff7a1a, x, 0.03, z); m.add(CONE, 0xff7a1a, x, 0.4 * s, z, 0, 0, 0, 0.42 * s, 0.75 * s, 0.42 * s); m.add(CYL, 0xffffff, x, 0.38 * s, z, 0, 0, 0, 0.28 * s, 0.1 * s, 0.28 * s); } });
    def('gnome', m => { m.add(CONE, W1, 0, 1.12, 0, -0.15, 0, 0, 0.42, 0.62, 0.42); },
      m => { m.box(0.16, 0.12, 0.26, 0x3b2a1e, -0.1, 0.06, -0.04); m.box(0.16, 0.12, 0.26, 0x3b2a1e, 0.1, 0.06, -0.04); m.add(CYL, 0x2b6cb0, 0, 0.3, 0, 0, 0, 0, 0.36, 0.36, 0.32);
        m.add(SPHERE, 0x35a05a, 0, 0.55, 0, 0, 0, 0, 0.46, 0.4, 0.4); m.add(SPHERE, 0xf1c9a5, 0, 0.8, -0.02, 0, 0, 0, 0.34, 0.3, 0.32); m.add(CONE, 0xffffff, 0, 0.62, -0.15, Math.PI, 0, 0, 0.32, 0.36, 0.2);
        m.add(SPHERE, 0xf2a7b8, 0, 0.8, -0.18, 0, 0, 0, 0.1, 0.09, 0.1); eye(m, -0.07, 0.88, -0.14, 0.05); eye(m, 0.07, 0.88, -0.14, 0.05); m.box(0.07, 0.24, 0.07, 0x9a6a3c, 0.22, 0.45, -0.1, 0.3); });
    def('flamingo', null, m => { const P = 0xff7ab8, Pd = 0xf25a9a; m.add(SPHERE, P, 0, 0.95, 0.05, 0, 0, 0, 0.42, 0.34, 0.62); m.add(SPHERE, Pd, 0, 1.0, 0.32, -0.4, 0, 0, 0.3, 0.2, 0.34);
      seg(m, TAPER, P, 0, 1.05, -0.2, 0, 1.45, -0.32, 0.06); seg(m, TAPER, P, 0, 1.45, -0.32, 0, 1.62, -0.18, 0.05); m.add(SPHERE, P, 0, 1.66, -0.2, 0, 0, 0, 0.16, 0.14, 0.18);
      m.box(0.06, 0.06, 0.16, 0x222222, 0, 1.6, -0.34, 0.5); eye(m, -0.06, 1.7, -0.27, 0.035); eye(m, 0.06, 1.7, -0.27, 0.035);
      m.box(0.025, 0.8, 0.025, 0x9a9a9a, -0.04, 0.4, 0); m.box(0.025, 0.55, 0.025, 0x9a9a9a, 0.05, 0.28, 0.02); });
    def('vend', m => { m.box(1.0, 2.0, 0.8, W1, 0, 1.0, 0); m.box(1.04, 0.14, 0.84, W1, 0, 2.04, 0); },
      m => { m.box(0.2, 0.08, 0.06, 0x222428, 0.3, 0.3, -0.41); m.box(0.6, 0.18, 0.05, 0x222428, -0.1, 0.24, -0.41); m.box(0.14, 0.3, 0.05, 0xc0c4ca, 0.36, 1.1, -0.41); },
      m => { m.box(0.64, 1.1, 0.02, 0xbfe8ff, -0.1, 1.3, -0.415); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) m.box(0.1, 0.18, 0.02, RAIN[(r * 4 + c) % 6], -0.34 + c * 0.16, 0.92 + r * 0.26, -0.43); });
    def('balloons', null, m => { m.box(0.3, 0.2, 0.3, 0x5b5f66, 0, 0.1, 0); for (let k = 0; k < 7; k++) { const a = k * 0.9, r = k ? 0.42 : 0, x = Math.cos(a) * r, z = Math.sin(a) * r, y = 2.7 + (k % 3) * 0.32;
      seg(m, STICK, 0xf4f1ea, 0, 0.2, 0, x, y - 0.35, z, 0.012); m.add(SPHERE, RAIN[k % 6], x, y, z, 0, 0, 0, 0.62, 0.74, 0.62); m.add(CONE, RAIN[k % 6], x, y - 0.4, z, Math.PI, 0, 0, 0.1, 0.1, 0.1); } });
    def('couch', m => { m.box(2.0, 0.42, 0.9, W1, 0, 0.4, 0); m.box(2.0, 0.75, 0.25, W1, 0, 0.85, 0.34); m.box(0.25, 0.6, 0.9, W1, -1.0, 0.6, 0); m.box(0.25, 0.6, 0.9, W1, 1.0, 0.6, 0); },
      m => { for (const x of [-0.5, 0.5]) m.box(0.85, 0.12, 0.7, 0xf4f1ea, x, 0.66, -0.06); m.box(0.5, 0.05, 0.36, 0xc9a26a, 0.6, 1.2, 0.3, -0.3, 0, 0.1); m.box(0.04, 0.4, 0.04, 0x9a6a3c, 0.6, 1.0, 0.35);
        for (const [x, z] of [[-0.9, -0.35], [0.9, -0.35], [-0.9, 0.35], [0.9, 0.35]]) m.box(0.08, 0.2, 0.08, 0x3b2a1e, x, 0.1, z); });
    def('potty', m => { m.box(1.15, 2.2, 1.15, W1, 0, 1.1, 0); },
      m => { m.add(SPHERE, 0xf4f1ea, 0, 2.2, 0, 0, 0, 0, 1.25, 0.3, 1.25); m.box(0.82, 1.9, 0.04, 0xffffff, 0, 1.0, -0.6); m.box(0.12, 0.04, 0.06, 0x33373f, 0.28, 1.05, -0.64);
        m.add(CYL, 0x33373f, 0, 1.75, -0.63, Math.PI / 2, 0, 0, 0.18, 0.02, 0.18); m.add(SPHERE, 0xffd23f, 0.03, 1.75, -0.64, 0, 0, 0, 0.12, 0.12, 0.02); m.box(0.2, 0.06, 0.03, 0xe8453c, -0.22, 1.3, -0.63); });
    def('cart', null, m => { m.box(0.7, 0.5, 1.0, 0xb9c0c8, 0, 0.75, 0); m.box(0.62, 0.32, 0.88, 0xff5c8a, 0, 0.82, 0); m.box(0.7, 0.05, 0.05, 0xe8453c, 0, 1.05, 0.6);
      for (const [x, z] of [[-0.3, -0.4], [0.3, -0.4], [-0.3, 0.4], [0.3, 0.4]]) m.add(CYL8, 0x222428, x, 0.12, z, 0, 0, Math.PI / 2, 0.24, 0.08, 0.24); m.box(0.04, 0.4, 0.04, 0xb9c0c8, -0.3, 0.35, 0); m.box(0.04, 0.4, 0.04, 0xb9c0c8, 0.3, 0.35, 0);
      m.add(SPHERE, 0xffc21f, 0.1, 1.15, 0, 0, 0, 0, 0.3, 0.3, 0.3); m.box(0.3, 0.2, 0.2, 0x35e06a, -0.15, 1.08, 0.2); });
    def('mushroom', m => { m.add(SPHERE, W1, 0, 1.55, 0, 0, 0, 0, 2.2, 1.1, 2.2); },
      m => { m.add(CYL, 0xf4ecd8, 0, 0.7, 0, 0, 0, 0, 0.6, 1.4, 0.6); m.add(CYL, 0xe9dfc6, 0, 1.3, 0, 0, 0, 0, 1.5, 0.12, 1.5); eye(m, -0.13, 0.95, -0.27, 0.09); eye(m, 0.13, 0.95, -0.27, 0.09);
        for (let k = 0; k < 9; k++) { const a = k * 0.7 + 0.2, e = 0.35 + (k % 3) * 0.33; m.add(SPHERE, 0xffffff, Math.cos(a) * Math.cos(e) * 1.08, 1.55 + Math.sin(e) * 0.56, Math.sin(a) * Math.cos(e) * 1.08, 0, 0, 0, 0.32, 0.18, 0.32); } });
    def('duckbig', null, m => { const Y = 0xffd23f; m.add(SPHERE, Y, 0, 1.2, 0.3, 0, 0, 0, 3.0, 2.2, 3.9); m.add(SPHERE, Y, 0, 1.6, 1.9, -0.6, 0, 0, 1.2, 0.8, 0.9);
      m.add(SPHERE, Y, 0, 2.95, -1.0, 0, 0, 0, 1.8, 1.8, 1.8); m.add(SPHERE, 0xff8a1a, 0, 2.75, -1.95, 0, 0, 0, 0.9, 0.36, 0.9); eye(m, -0.45, 3.25, -1.7, 0.26); eye(m, 0.45, 3.25, -1.7, 0.26);
      m.add(SPHERE, 0xff8fb8, -0.7, 2.75, -1.6, 0, 0, 0, 0.3, 0.2, 0.1); m.add(SPHERE, 0xff8fb8, 0.7, 2.75, -1.6, 0, 0, 0, 0.3, 0.2, 0.1); });
    def('statue', null, m => { const S = 0xb9b2a4, B = 0x6fae94; m.box(1.6, 1.2, 1.6, S, 0, 0.6, 0); m.box(1.8, 0.18, 1.8, 0xa49c8e, 0, 1.25, 0); m.box(1.3, 0.12, 0.04, 0xd4af37, 0, 0.75, -0.81);
      m.add(SPHERE, B, 0, 2.2, 0.1, 0, 0, 0, 1.2, 1.05, 1.6); m.add(SPHERE, B, 0, 3.0, -0.55, 0, 0, 0, 0.75, 0.75, 0.75); m.box(0.2, 0.14, 0.4, 0x5e9a82, 0, 2.95, -0.98); m.box(0.08, 0.6, 0.08, B, -0.2, 1.55, 0); m.box(0.08, 0.6, 0.08, B, 0.2, 1.55, 0);
      m.box(0.9, 0.12, 0.9, B, 0, 2.15, 0.85, 0.4); m.add(SPHERE, 0xd4af37, 0, 3.55, -0.5, 0, 0, 0, 0.18, 0.18, 0.18); m.box(0.18, 0.36, 0.14, 0xd4af37, 0, 3.32, -0.5); m.box(0.5, 0.06, 0.06, 0xd4af37, 0, 3.4, -0.5, 0, 0, 0.5); });
    def('donut', m => { m.add(TORUS, W1, 0, 2.0, 0, 0, 0, 0, 1.15, 1.15, 0.85); },
      m => { m.add(TORUS, 0xd9a05b, 0, 2.0, 0.1, 0, 0, 0, 1.1, 1.1, 0.8); m.box(0.5, 0.8, 0.5, 0x8a8f99, 0, 0.4, 0.05); m.box(1.2, 0.1, 1.0, 0x6b7079, 0, 0.05, 0.05);
        for (let k = 0; k < 16; k++) { const a = k * 0.39, r = 1.12 + (k % 2) * 0.18; m.box(0.2, 0.06, 0.06, RAIN[k % 6], Math.cos(a) * r, 2.0 + Math.sin(a) * r, -0.42, 0, 0, a * 2); } });
    def('crystal', null, null, m => { const C = [0xff7ad9, 0x7ae8ff, 0xb48cff, 0x9effa8]; for (let k = 0; k < 6; k++) { const a = k * 1.05, r = k ? 0.42 : 0, h = k ? 1.1 + hash(800 + k) * 0.8 : 2.2;
      m.add(CYL6, C[k % 4], Math.cos(a) * r, h * 0.35, Math.sin(a) * r, Math.cos(a) * 0.3 * (k ? 1 : 0), 0, Math.sin(a) * 0.3 * (k ? 1 : 0), 0.34, h * 0.7, 0.34); m.add(CONE, C[k % 4], Math.cos(a) * r * 1.2, h * 0.7 + h * 0.15, Math.sin(a) * r * 1.2, 0, 0, 0, 0.34, h * 0.3, 0.34); } });
    def('sunflower', null, m => { for (const [x, z, h] of [[0, 0, 2.4], [0.6, 0.3, 2.0], [-0.5, 0.25, 1.75]]) { m.box(0.07, h, 0.07, 0x3f8f3a, x, h / 2, z); m.add(SPHERE, 0x4f9a3a, x + 0.18, h * 0.45, z, 0, 0, 0.6, 0.34, 0.08, 0.2);
      for (let k = 0; k < 10; k++) { const a = k * 0.628; m.add(SPHERE, 0xffc21f, x + Math.cos(a) * 0.3, h + Math.sin(a) * 0.3, z - 0.06, 0, 0, a, 0.26, 0.1, 0.06); } m.add(CYL, 0x5b3a1e, x, h, z - 0.08, Math.PI / 2, 0, 0, 0.36, 0.08, 0.36); } });
    def('picnic', null, m => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) m.box(0.5, 0.03, 0.5, (i + j) % 2 ? 0xe8453c : 0xffffff, -0.75 + i * 0.5, 0.02, -0.75 + j * 0.5);
      m.box(0.5, 0.32, 0.36, 0xc9a26a, 0.3, 0.2, 0.3); m.box(0.5, 0.04, 0.04, 0x9a6a3c, 0.3, 0.42, 0.3); m.add(SPHERE, 0x35a05a, -0.4, 0.14, -0.3, 0, 0, 0, 0.42, 0.28, 0.32); m.add(SPHERE, 0xff5c8a, -0.4, 0.2, -0.3, 0, 0, 0, 0.3, 0.12, 0.2); });
    // chalk drawings on the pavement: hopscotch, a giant smiley, and "67"
    def('chalk0', null, m => { const C = [0xffffff, 0xff8fb8, 0x8fd3ff]; const sq = (x, z, c) => { m.box(0.7, 0.012, 0.05, c, x, 0.006, z - 0.33); m.box(0.7, 0.012, 0.05, c, x, 0.006, z + 0.33); m.box(0.05, 0.012, 0.7, c, x - 0.33, 0.006, z); m.box(0.05, 0.012, 0.7, c, x + 0.33, 0.006, z); };
      sq(0, 1.4, C[0]); sq(0, 0.7, C[1]); sq(-0.35, 0, C[2]); sq(0.35, 0, C[2]); sq(0, -0.7, C[0]); sq(-0.35, -1.4, C[1]); sq(0.35, -1.4, C[1]); sq(0, -2.1, C[0]); });
    def('chalk1', null, m => { for (let k = 0; k < 24; k++) { const a = k * 0.2618; m.box(0.3, 0.012, 0.08, 0xffe066, Math.cos(a) * 1.0, 0.006, Math.sin(a) * 1.0, 0, -a + Math.PI / 2, 0); }
      m.add(CYL, 0x222222, -0.32, 0.006, -0.3, 0, 0, 0, 0.18, 0.012, 0.18); m.add(CYL, 0x222222, 0.32, 0.006, -0.3, 0, 0, 0, 0.18, 0.012, 0.18);
      for (let k = 0; k < 7; k++) { const a = Math.PI * (0.2 + k * 0.1); m.box(0.18, 0.012, 0.06, 0xff8fb8, Math.cos(a) * 0.55, 0.006, Math.sin(a) * 0.55, 0, -a + Math.PI / 2, 0); } });
    def('chalk2', null, m => { const c = 0x9effa8, d = (x, z, w, h) => m.box(w, 0.012, h, c, x, 0.006, z);
      d(-0.75, -0.55, 0.6, 0.1); d(-1.0, 0, 0.1, 1.1); d(-0.75, 0, 0.6, 0.1); d(-0.75, 0.55, 0.6, 0.1); d(-0.5, 0.28, 0.1, 0.55);   // 6
      d(0.65, -0.55, 0.65, 0.1); m.box(0.1, 0.012, 1.15, c, 0.72, 0.006, 0, 0, -0.35, 0); });                                        // 7
    def('floatduck', null, m => { const Y = 0xffd23f; m.add(SPHERE, Y, 0, 0.45, 0.2, 0, 0, 0, 1.6, 1.0, 2.0); m.add(SPHERE, Y, 0, 1.25, -0.55, 0, 0, 0, 0.95, 0.95, 0.95); m.add(SPHERE, 0xff8a1a, 0, 1.15, -1.05, 0, 0, 0, 0.5, 0.2, 0.5); eye(m, -0.25, 1.4, -0.9, 0.14); eye(m, 0.25, 1.4, -0.9, 0.14); });
    def('floatring', m => { m.add(TORUS, W1, 0, 0.3, 0, Math.PI / 2, 0, 0, 1.0, 1.0, 0.8); }, m => { for (let k = 0; k < 6; k++) { const a = k * 1.047; m.add(SPHERE, 0xffffff, Math.cos(a) * 1.0, 0.55, Math.sin(a) * 1.0, 0, 0, 0, 0.42, 0.18, 0.42); } });
    def('flag', m => { m.add(TRI, W1, 0, -0.2, 0, Math.PI / 2, 0, 0, 0.5, 0.03, 0.62); }, m => { m.box(0.62, 0.025, 0.025, 0xf4f1ea, 0, 0, 0); });   // a pennant hanging point-down, and its bit of string
    return out;
  })();
  const DECOR_KINDS = Object.keys(DECOR);
  // hits to break each (x weapon); kinds not listed can't be smashed (chalk, flags, floats)
  const DECOR_HP = { planter: 2, cafe: 2, cones: 1, gnome: 1, flamingo: 1, vend: 3, balloons: 1, couch: 2, potty: 3, cart: 1, mushroom: 2, duckbig: 4, statue: 5, donut: 3, crystal: 2, sunflower: 1, picnic: 1 };
  const DECOR_HI = new Set(['planter', 'cafe', 'cones', 'gnome', 'flamingo', 'cart', 'sunflower', 'picnic', 'chalk0', 'chalk1', 'chalk2', 'couch']);  // only near you
  const DECOR_TINTS = { planter: [0xe8453c, 0x2b6cb0, 0xffc21f, 0x9b5cf6, 0x35a05a, 0xff8a3d], cafe: [0xe8453c, 0x35a05a, 0x2b6cb0, 0xff5c8a, 0xffc21f], gnome: [0xe8453c, 0x2b6cb0, 0x9b5cf6, 0xffc21f],
    vend: [0xe8453c, 0x2b6cb0, 0x35a05a, 0x9b5cf6, 0xff8a3d], couch: [0xc9a227, 0x6b8e23, 0xd98fb0, 0x8b4513, 0x5f9ea0], potty: [0x2b6cb0, 0x35a05a, 0xff8a3d, 0x9b5cf6],
    mushroom: [0xe8453c, 0x9b5cf6, 0x38bdf8, 0xff5c8a, 0xff8a3d], donut: [0xff8fb8, 0x7a4a2a, 0xb48cff, 0x9effa8], floatring: [0xff5c8a, 0x38bdf8, 0xffc21f, 0x35e06a],
    flag: [0xff5c8a, 0xffc21f, 0x35e06a, 0x38bdf8, 0x9b5cf6, 0xff8a3d, 0xffffff] };
  MAT.decor = GFX ? GFX.pbr() : new THREE.MeshLambertMaterial({ vertexColors: true });   // decor's own colours, instanced, never tinted
  MAT.dglow = new THREE.MeshBasicMaterial({ vertexColors: true });

  // ---------------------------------------------------------------- colour blocks (2026-11-21, the user: "separate any map into
  // squares of 2 by 2 km. Inside each block everything starts off grayscale; as you unlock grocery stores, metros and shops the
  // world becomes colourful... if all secret packages are found, the road and trees get colour"). Design: docs/colour-blocks.md.
  // Every world material gets a few lines of shader (greyify): it looks up its block in a small texture (one texel per 2 km
  // block, home in the middle of block 0,0) and mixes its colour with its own grey by that block's level for its LAYER:
  //   R = buildings (walls, roofs), G = streets (roads, pavements, plazas, street furniture, parked cars, decor),
  //   B = nature (trees, bushes, grass, parks, water, sand), A = the sky (set per frame from the block you stand in).
  // People, figments, you, cars that drive, pickups, signs and lights are never greyed. cft-color.js decides the levels
  // (W.setBlockColor) and sends colour waves when something is freed (W.colorWave). W.colorOff(true) = full colour (setting).
  const CGW = {};   // the colour-block API, copied onto W once W exists (below)
  const CG_N = 48;   // texels across: 48 blocks = 96 km around home
  const cgData = new Uint8Array(CG_N * CG_N * 4);
  const cgTex = new THREE.DataTexture(cgData, CG_N, CG_N, THREE.RGBAFormat);
  cgTex.magFilter = cgTex.minFilter = THREE.NearestFilter; cgTex.needsUpdate = true;
  const CGU = { cftSat: { value: cgTex }, cftGrid: { value: new THREE.Vector4(2000, CG_N, 0, 0) }, cftWave: { value: new THREE.Vector4(0, 0, 0, 0) }, cftOff: { value: 0 } };
  const CG_FRAG = `uniform sampler2D cftSat; uniform vec4 cftGrid; uniform vec4 cftWave; uniform float cftOff; varying vec2 vCftW;
`;
  function cgPatch(sh, ch) {
    if (!sh.vertexShader.includes('#include <project_vertex>') || !sh.fragmentShader.includes('#include <fog_fragment>')) return;
    Object.assign(sh.uniforms, CGU);
    sh.vertexShader = 'varying vec2 vCftW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
	{ vec4 cw = vec4(transformed, 1.0);
	#ifdef USE_INSTANCING
	cw = instanceMatrix * cw;
	#endif
	vCftW = (modelMatrix * cw).xz; }`);
    const pick = ch === 'ground'   // roads, pavements, plazas, paths = streets; grass, woods, sand, water = nature (groundify's vGL)
      ? 'float cs = (vGL < -0.5 || (vGL > 1.5 && vGL < 3.5) || (vGL > 4.5 && vGL < 5.5)) ? lv.b : lv.g;'
      : 'float cs = lv.' + ch + ';';
    sh.fragmentShader = CG_FRAG + sh.fragmentShader.replace('#include <fog_fragment>', `{
	vec2 bi = floor((vCftW - cftGrid.zw + cftGrid.x * 0.5) / cftGrid.x) + floor(cftGrid.y * 0.5);
	vec4 lv = (bi.x < 0.0 || bi.y < 0.0 || bi.x >= cftGrid.y || bi.y >= cftGrid.y) ? vec4(0.0) : texture2D(cftSat, (bi + 0.5) / cftGrid.y);
	${pick}
	float wd = length(vCftW - cftWave.xy);
	cs = max(cs, cftWave.w * smoothstep(cftWave.z - 26.0, cftWave.z - 3.0, wd) * (1.0 - smoothstep(cftWave.z, cftWave.z + 3.0, wd)));
	cs = clamp(max(cs, cftOff), 0.0, 1.0);
	float cl = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
	gl_FragColor.rgb = mix(vec3(cl), gl_FragColor.rgb, cs);
}
#include <fog_fragment>`);
  }
  function greyify(mat, ch) {
    if (!mat || mat.userData.cftGrey) return mat;
    const prev = mat.onBeforeCompile, key0 = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
    mat.onBeforeCompile = function (sh, r) { if (prev) prev.call(this, sh, r); cgPatch(sh, ch); };
    mat.customProgramCacheKey = () => key0 + '|cftgrey:' + ch;   // three caches programs by this key: every layer keeps its own
    mat.userData.cftGrey = ch; mat.needsUpdate = true;
    return mat;
  }
  CGW.greyify = greyify;
  for (const [k, ch] of [['walls', 'r'], ['plain', 'r'], ['terrain', 'ground'], ['drape', 'ground'], ['trunk', 'b'], ['crown', 'b'], ['prop', 'g'], ['tint', 'g'], ['wreck', 'g'], ['decor', 'g'], ['dglow', 'g']]) greyify(MAT[k], ch);
  greyify(ground.material, 'b');
  // the grid's centre: where the save first started (cft-color keeps it in save.color.origin), so moving house never shifts it
  let cgOx = 0, cgOz = 0;
  const cgBlock = (x, z) => [Math.floor((x - cgOx + 1000) / 2000), Math.floor((z - cgOz + 1000) / 2000)];
  CGW.setBlockOrigin = function (x, z) { cgOx = x; cgOz = z; CGU.cftGrid.value.z = x; CGU.cftGrid.value.w = z; };
  CGW.blockCentre = (bx, bz) => ({ x: cgOx + bx * 2000, z: cgOz + bz * 2000 });
  CGW.blockOf = (x, z) => { const b = cgBlock(x, z); return { bx: b[0], bz: b[1], key: b[0] + '_' + b[1] }; };
  CGW.BLOCK = 2000;
  // levels 0..1 for [buildings, streets, nature, sky] of block (bx, bz)
  CGW.setBlockColor = function (bx, bz, lv) {
    const i = bx + (CG_N >> 1), j = bz + (CG_N >> 1);
    if (i < 0 || j < 0 || i >= CG_N || j >= CG_N) return;
    const o = (j * CG_N + i) * 4;
    for (let c = 0; c < 4; c++) cgData[o + c] = Math.max(0, Math.min(255, Math.round((lv[c] || 0) * 255)));
    cgTex.needsUpdate = true;
  };
  CGW.blockColor = function (bx, bz) { const i = bx + (CG_N >> 1), j = bz + (CG_N >> 1); if (i < 0 || j < 0 || i >= CG_N || j >= CG_N) return [0, 0, 0, 0]; const o = (j * CG_N + i) * 4; return [cgData[o] / 255, cgData[o + 1] / 255, cgData[o + 2] / 255, cgData[o + 3] / 255]; };
  CGW.colorOff = function (off) { CGU.cftOff.value = off ? 1 : 0; };
  CGW.colorIsOff = () => CGU.cftOff.value > 0.5;
  // a ring of full colour running out from (x, z): something was freed here
  const cgWaves = [];
  CGW.colorWave = function (x, z, o) { o = o || {}; cgWaves.push({ x, z, t: 0, life: o.life || 2.6, max: o.max || 140 }); };
  function updateColorWaves(dt) {
    let best = null;
    for (let i = cgWaves.length - 1; i >= 0; i--) { const w = cgWaves[i]; w.t += dt; if (w.t >= w.life) { cgWaves.splice(i, 1); continue; } if (!best || w.t < best.t) best = w; }
    if (!best) { CGU.cftWave.value.w = 0; return; }
    const k = best.t / best.life;
    CGU.cftWave.value.set(best.x, best.z, 6 + best.max * (1 - Math.pow(1 - k, 2)), 1 - k * k);
  }
  CGW.skySat = 1;   // the sky's colour (the block you stand in), read by setClock
  const greyCol = c => { const l = c.r * 0.299 + c.g * 0.587 + c.b * 0.114; return c.lerp(_c.setRGB(l, l, l), 1 - (CGU.cftOff.value > 0.5 ? 1 : W.skySat)); };

  // ---- cars (realism pass, 2026-11-17): a real side profile (bonnet, windscreen rake, roof, boot or hatch, wheel arches)
  // extruded with rounded edges, then narrowed towards the roof (tumblehome) and rounded at the corners in plan; a glass
  // greenhouse with pillars, tyres with rims and spokes, wheel wells, lights, grille, plates, mirrors and door handles.
  // Profiles in metres from the front: ws windscreen base, rf / rb roof front / back, rear = rear-window base, deck = boot
  // height, panel = where a van's glass stops (panel sides behind it), wf / wb axles, wr wheel radius.
  const CAR_SPEC = {
    hatch:  { L: 3.95, Wd: 1.74, sill: 0.3, nose: 0.8, belt: 1.0, ws: 1.2, rf: 1.95, rb: 3.5, roof: 1.5, rear: 3.88, deck: 1.0, wr: 0.31, wf: 0.78, wb: 3.2, doors: 2 },
    sedan:  { L: 4.6, Wd: 1.8, sill: 0.3, nose: 0.78, belt: 0.98, ws: 1.45, rf: 2.2, rb: 3.35, roof: 1.45, rear: 3.95, deck: 1.02, wr: 0.32, wf: 0.9, wb: 3.65, doors: 4 },
    suv:    { L: 4.6, Wd: 1.88, sill: 0.42, nose: 1.0, belt: 1.2, ws: 1.25, rf: 1.9, rb: 4.25, roof: 1.8, rear: 4.5, deck: 1.2, wr: 0.38, wf: 0.85, wb: 3.75, doors: 4 },
    sports: { L: 4.35, Wd: 1.86, sill: 0.22, nose: 0.58, belt: 0.82, ws: 1.75, rf: 2.35, rb: 3.0, roof: 1.18, rear: 3.95, deck: 0.86, wr: 0.33, wf: 1.0, wb: 3.55, doors: 2, wing: true },
    van:    { L: 4.85, Wd: 1.95, sill: 0.35, nose: 1.0, belt: 1.18, ws: 0.55, rf: 1.2, rb: 4.78, roof: 2.05, rear: 4.82, deck: 1.2, wr: 0.34, wf: 0.72, wb: 3.95, doors: 2, panel: 1.95 },
    bus:    { L: 7.6, Wd: 2.3, sill: 0.4, nose: 1.4, belt: 1.45, ws: 0.18, rf: 0.42, rb: 7.5, roof: 2.95, rear: 7.58, deck: 1.45, wr: 0.45, wf: 1.5, wb: 6.0, doors: 0, bus: true },
  };
  const CAR_GLASS = 0x27333f;
  function extrudeSide(pts, depth, bevel, arches) { // pts = [z from front, y]... in metres; arches = [[zc, yc, r, sill]] back to front; returns a geometry centred on x
    const sh = new THREE.Shape();
    pts.forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])));
    for (const a of arches || []) { sh.lineTo(a[0] - a[2], a[3]); sh.absarc(a[0], a[1], a[2], Math.PI, 0, true); sh.lineTo(a[0] + a[2], a[3]); }  // back to front, over the top
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.01, depth - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1, curveSegments: 5 });
    g.translate(0, 0, -(depth - 2 * bevel) / 2);
    g.rotateY(Math.PI / 2);   // shape x (metres from the BACK, see below) -> world -z; extrude depth -> world x
    return g;  // ExtrudeGeometry is non-indexed
  }
  // squeeze x: rounder corners in plan (ends) and a narrower glasshouse towards the roof (y0 -> y1 by k)
  function carShapeX(g, L, y0, y1, k, ends) {
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i), z = P.getZ(i), t = Math.min(1, Math.max(0, (Math.abs(z) - (L / 2 - 0.75)) / 0.75));
      const tu = y1 > y0 ? Math.min(1, Math.max(0, (y - y0) / (y1 - y0))) : 0;
      P.setX(i, P.getX(i) * (1 - ends * t * t) * (1 - k * tu));
    }
    g.computeVertexNormals();
    return g;
  }
  // Adds a car of spec s to Merge m. paint = body colour (white on parked cars: the instance tint paints them).
  // Returns where its lights go: {head: [[x, y, z]...], tail: [...], roofY, cabZ, L, Wd} (W.vehicle puts glowing lights there).
  function carShape(m, s, paint, glass, fine) {
    const L = s.L, Wd = s.Wd, F = z => L / 2 - z;  // shape x = metres from the back, so after rotateY the nose faces -z
    const dark = 0x1d1f23, trim = 0x2b2e34, rim = 0xb9bfc6, aR = s.wr + 0.07;
    const kp = m.kOf; m.kOf = Object.assign({}, kp || {}, { [_c.set(paint).getHex()]: 1, [_c.set(glass).getHex()]: 2, [rim]: 3, 0x8d949c: 3, 0x8fa4b6: 2, 0xf2f2ec: 9, [trim]: 9 });
    // body: nose, bonnet up to the windscreen base, then the deck / panel sides to the tail, and along the bottom over the arches
    const body = [[F(0.06), s.sill + 0.02], [F(0), s.sill + 0.2], [F(0), s.nose - 0.12], [F(0.12), s.nose], [F(s.ws * 0.55), s.nose + (s.belt - s.nose) * 0.6], [F(s.ws), s.belt]];
    if (s.panel) body.push([F(s.panel), s.belt], [F(s.panel), s.roof], [F(L - 0.1), s.roof], [F(L), s.roof - 0.12]);
    else if (s.bus) body.push([F(s.rb), s.belt], [F(L), s.belt]);
    else { body.push([F(s.rear), s.belt]); if (s.deck > s.belt) body.push([F((s.rear + L) / 2), s.deck]); body.push([F(L - 0.05), s.deck - 0.04], [F(L), s.deck - 0.2]); }
    body.push([F(L), s.sill + 0.2], [F(L - 0.08), s.sill]);
    const arches = [[F(s.wb), s.wr, aR, s.sill], [F(s.wf), s.wr, aR, s.sill]];
    m.add(carShapeX(extrudeSide(body, Wd, 0.07, arches), L, s.belt - 0.35, s.belt, 0.04, 0.1), paint);
    // the glasshouse (bus: a window band), its roof and pillars
    const gw = Wd * (s.bus ? 0.98 : 0.86), tumble = s.bus ? 0.02 : s.panel ? 0.1 : 0.2;
    const gEnd = s.panel || (s.bus ? s.rb : s.rear);
    const gh = s.bus ? [[F(s.ws), s.belt], [F(s.rf), s.roof - 0.1], [F(s.rb), s.roof - 0.1], [F(s.rb), s.belt]]
      : s.panel ? [[F(s.ws), s.belt], [F(s.rf), s.roof - 0.02], [F(s.panel), s.roof - 0.02], [F(s.panel), s.belt]]
      : [[F(s.ws), s.belt], [F(s.rf), s.roof], [F(s.rb), s.roof], [F(s.rear), s.belt]];
    m.add(carShapeX(extrudeSide(gh, gw, 0.04), L, s.belt, s.roof, tumble, 0.1), glass);
    const topW = gw * (1 - tumble);
    if (s.bus) m.add(carShapeX(extrudeSide([[F(0.1), s.roof - 0.12], [F(0.3), s.roof], [F(L - 0.1), s.roof], [F(L), s.roof - 0.12], [F(L), s.roof - 0.16], [F(0.1), s.roof - 0.16]], Wd, 0.06), L, 0, 0, 0, 0.06), paint);
    else if (!s.panel) m.add(carShapeX(extrudeSide([[F(s.rf - 0.04), s.roof - 0.05], [F(s.rf + 0.14), s.roof + 0.025], [F(s.rb - 0.14), s.roof + 0.025], [F(s.rb + 0.04), s.roof - 0.05]], topW + 0.06, 0.03), L, 0, 0, 0, 0.1), paint);
    else m.add(carShapeX(extrudeSide([[F(s.rf - 0.02), s.roof - 0.06], [F(s.rf + 0.12), s.roof + 0.01], [F(s.panel + 0.1), s.roof + 0.01], [F(s.panel + 0.1), s.roof - 0.06]], topW + 0.05, 0.03), L, 0, 0, 0, 0.1), paint);
    const zf = z => z - L / 2, bx = gw / 2 + 0.012, tx = topW / 2 + 0.012;
    for (const sx of [-1, 1]) {
      if (s.bus) { for (let z = s.ws + 1.0; z < s.rb - 0.3; z += 1.15) m.box(0.05, s.roof - s.belt - 0.1, 0.12, paint, sx * (Wd / 2 - 0.005), (s.roof + s.belt - 0.1) / 2, zf(z)); continue; }
      seg(m, STICK, paint, sx * bx, s.belt - 0.02, zf(s.ws), sx * tx, s.roof - 0.02, zf(s.rf), 0.07, 0.07);                           // A pillars
      if (!s.panel) {
        seg(m, STICK, paint, sx * bx, s.belt - 0.02, zf(s.rear), sx * tx, s.roof - 0.02, zf(s.rb), 0.09, 0.09);                     // C pillars
        const bz = s.doors === 4 ? s.rf + (s.rb - s.rf) * 0.48 : s.rf + (s.rb - s.rf) * 0.62;
        seg(m, STICK, paint, sx * bx, s.belt - 0.02, zf(bz + 0.06), sx * tx, s.roof - 0.02, zf(bz), 0.07, 0.07);                     // B pillar
      }
      m.box(0.035, 0.03, gEnd - s.ws, trim, sx * (Wd / 2 * 0.955), s.belt + 0.005, zf((s.ws + gEnd) / 2));                           // window seal
      // mirror, door lines, handles
      m.box(0.16, 0.09, 0.1, paint, sx * (Wd / 2 + 0.07), s.belt + 0.07, zf(s.ws + 0.16)); m.box(0.12, 0.07, 0.015, 0x8fa4b6, sx * (Wd / 2 + 0.09), s.belt + 0.07, zf(s.ws + 0.22));
      const dz = [s.ws + 0.05, s.doors === 4 ? s.rf + (s.rb - s.rf) * 0.5 : s.rf + (s.rb - s.rf) * 0.66];
      if (s.doors === 4) dz.push(s.rb - 0.05);
      for (const z of dz) m.box(0.012, s.belt - s.sill - 0.12, 0.014, trim, sx * (Wd / 2 - 0.005), (s.belt + s.sill) / 2 + 0.03, zf(z));
      for (let k = 0; k + 1 < dz.length; k++) m.box(0.02, 0.025, 0.12, trim, sx * (Wd / 2 + 0.003), s.belt - 0.12, zf(dz[k + 1] - 0.18));
    }
    // wheels: well (dark, inside the arch), tyre, rim with five spokes, hub
    const tx2 = Wd / 2 - 0.13;
    for (const az of [s.wf, s.wb]) {
      m.add(CYL8, dark, 0, s.wr, zf(az), 0, 0, Math.PI / 2, aR * 1.9, Wd - 0.3, aR * 1.9);
      for (const sx of [-1, 1]) {
        m.add(WHEEL, 0x1b1c1f, sx * tx2, s.wr, zf(az), 0, 0, Math.PI / 2, s.wr * 2, 0.22, s.wr * 2);
        m.add(fine ? CYL : CYL8, rim, sx * (tx2 + 0.1), s.wr, zf(az), 0, 0, Math.PI / 2, s.wr * 1.25, 0.03, s.wr * 1.25);
        if (fine) {
          for (let k = 0; k < 5; k++) { const a = k * 1.2566; m.box(0.02, s.wr * 0.62, 0.05, 0x8d949c, sx * (tx2 + 0.12), s.wr + Math.cos(a) * s.wr * 0.31, zf(az) + Math.sin(a) * s.wr * 0.31, a, 0, 0); }
          m.add(CYL8, 0x3a3d44, sx * (tx2 + 0.125), s.wr, zf(az), 0, 0, Math.PI / 2, 0.1, 0.03, 0.1);
        }
      }
    }
    // front and back: lower bumper band, grille, number plates (lights are added by the caller: they glow on traffic)
    const fy = s.bus ? s.sill + 0.3 : s.sill + 0.12;
    m.box(Wd * 0.9, 0.14, 0.05, trim, 0, fy, zf(0) - 0.012); m.box(Wd * 0.9, 0.14, 0.05, trim, 0, fy, zf(L) + 0.012);
    if (!s.bus) m.box(Wd * 0.42, Math.max(0.1, (s.nose - s.sill) * 0.3), 0.04, dark, 0, s.sill + (s.nose - s.sill) * 0.48, zf(0) - 0.015);
    m.box(0.46, 0.11, 0.02, 0xf2f2ec, 0, fy + 0.13, zf(0) - 0.03); m.box(0.46, 0.11, 0.02, 0xf2f2ec, 0, s.bus ? fy + 0.4 : s.deck - 0.38, zf(L) + 0.03);
    if (s.wing) { m.box(Wd * 0.84, 0.04, 0.26, trim, 0, s.deck + 0.2, zf(L - 0.18)); for (const sx of [-1, 1]) m.box(0.04, 0.2, 0.08, trim, sx * Wd * 0.34, s.deck + 0.09, zf(L - 0.2)); }
    const hy = s.nose - 0.1, ty = s.bus ? s.belt - 0.5 : s.deck - 0.16;
    m.kOf = kp;
    return { head: [[-Wd * 0.34, hy, zf(0) - 0.02], [Wd * 0.34, hy, zf(0) - 0.02]], tail: [[-Wd * 0.38, ty, zf(L) + 0.02], [Wd * 0.38, ty, zf(L) + 0.02]], roofY: s.roof, cabZ: zf((s.rf + s.rb) / 2), L, Wd };
  }
  function carLights(m, at, Wd, bus) { // headlight and tail-light shapes (parked cars: plain colours; traffic: an unlit glow mesh)
    for (const p of at.head) m.box(Wd * 0.2, bus ? 0.16 : 0.1, 0.05, 0xfff6c8, p[0], p[1], p[2]);
    for (const p of at.tail) m.box(Wd * 0.17, 0.11, 0.05, 0xff2a2a, p[0], p[1], p[2]);
  }
  const WHEEL = (() => { // a tyre: a fat cylinder with rounded shoulders (Lathe)
    const pts = [[0.3, -0.5], [0.43, -0.5], [0.5, -0.22], [0.5, 0.22], [0.43, 0.5], [0.3, 0.5]].map(q => new THREE.Vector2(q[0], q[1]));
    return new THREE.LatheGeometry(pts, 11).toNonIndexed();
  })();
  const PROP = {
    lamp: propGeo(m => { m.add(CYL6, 0x3a3f4a, 0, 2.7, 0, 0, 0, 0, 0.15, 5.4, 0.15); m.add(CYL6, 0x2a2e37, 0, 0.18, 0, 0, 0, 0, 0.34, 0.36, 0.34); m.box(0.1, 0.1, 1.5, 0x3a3f4a, 0, 5.36, -0.7); m.box(0.4, 0.14, 0.66, 0x2a2e37, 0, 5.32, -1.35); }),
    bulb: shared(new THREE.BoxGeometry(0.3, 0.08, 0.54).translate(0, 5.22, -1.35)),
    pool: shared(new THREE.CircleGeometry(5.5, 18).rotateX(-Math.PI / 2).translate(0, 0.16, -1.35)),
    halo: shared(new THREE.IcosahedronGeometry(0.75, 1).translate(0, 5.12, -1.35)),
    bench: propGeo(m => {
      if (LOW) { m.box(1.7, 0.08, 0.5, 0x9a6a3c, 0, 0.48, 0); m.box(1.7, 0.5, 0.07, 0x9a6a3c, 0, 0.82, 0.24, -0.15); }
      else { for (let k = 0; k < 4; k++) m.box(1.7, 0.05, 0.1, k % 2 ? 0x9a6a3c : 0xa8774a, 0, 0.48, -0.19 + k * 0.125); for (let k = 0; k < 3; k++) m.box(1.7, 0.1, 0.04, k % 2 ? 0x9a6a3c : 0xa8774a, 0, 0.66 + k * 0.14, 0.23 + k * 0.025, -0.15); m.box(0.06, 0.06, 0.45, 0x33373f, -0.75, 0.68, 0.02); m.box(0.06, 0.06, 0.45, 0x33373f, 0.75, 0.68, 0.02); }
      m.box(0.08, 0.48, 0.5, 0x33373f, -0.75, 0.24, 0); m.box(0.08, 0.48, 0.5, 0x33373f, 0.75, 0.24, 0);
    }),
    hydrant: propGeo(m => { m.add(CYL8, 0xe23b2e, 0, 0.36, 0, 0, 0, 0, 0.3, 0.72, 0.3); m.box(0.24, 0.16, 0.24, 0xe23b2e, 0, 0.8, 0); m.add(CYL6, 0xf2b134, 0, 0.5, 0, 0, 0, Math.PI / 2, 0.16, 0.5, 0.16); m.add(CYL8, 0xc22d22, 0, 0.05, 0, 0, 0, 0, 0.4, 0.1, 0.4); }),
    bin: propGeo(m => { m.add(CYL8, 0x2f8f5b, 0, 0.5, 0, 0, 0, 0, 0.56, 1.0, 0.56); m.add(CYL8, 0x226b44, 0, 1.03, 0, 0, 0, 0, 0.62, 0.08, 0.62); m.box(0.36, 0.12, 0.04, 0x1f1a3d, 0, 0.8, -0.28); }),
    box: propGeo(m => { m.box(0.5, 0.95, 0.44, 0x2b6cb0, 0, 0.62, 0); m.add(CYL8, 0x2b6cb0, 0, 1.08, 0, 0, 0, Math.PI / 2, 0.44, 0.5, 0.44); m.box(0.07, 0.3, 0.07, 0x33373f, -0.18, 0.15, 0); m.box(0.07, 0.3, 0.07, 0x33373f, 0.18, 0.15, 0); m.box(0.3, 0.05, 0.02, 0xf4f1ea, 0, 0.95, -0.23); }),
    // parked cars are white where the paint goes: each instance tints its own (glass and tyres are dark, so they stay dark).
    // car = three body styles (hatchback, saloon, SUV: e.sp says which), van = a panel van.
    car: ['hatch', 'sedan', 'suv'].map(k => propGeo(m => carBody(m, k))),
    van: propGeo(m => carBody(m, 'van')),
    carLo: ['hatch', 'sedan', 'suv'].map(k => propGeo(m => carBox(m, CAR_SPEC[k], 0xffffff))),
    vanLo: propGeo(m => carBox(m, CAR_SPEC.van, 0xffffff)),
    sigPole: propGeo(m => { m.add(CYL, 0x33373f, 0, 2.0, 0, 0, 0, 0, 0.18, 4.0, 0.18); m.box(0.54, 1.56, 0.36, 0x1f2229, 0, 4.2, 0); m.box(0.7, 0.08, 0.5, 0xf2b134, 0, 5.02, 0); m.add(CYL, 0x1f2229, 0, 0.14, 0, 0, 0, 0, 0.44, 0.28, 0.44); }),
    sigLamp: shared(new THREE.SphereGeometry(0.19, 10, 8)),
    banner: propGeo(m => { m.box(0.05, 0.05, 1.0, 0x2a2e37, 0, 4.75, 0.52); m.box(0.05, 0.05, 1.0, 0x2a2e37, 0, 2.75, 0.52); m.box(0.05, 1.95, 0.88, 0xffffff, 0, 3.75, 0.6); m.box(0.055, 0.22, 0.88, 0xdddddd, 0, 2.95, 0.6); m.box(0.055, 0.22, 0.88, 0xdddddd, 0, 4.55, 0.6); }),
  };
  // Parked cars: the low-quality box car, or the realistic body (carShape) with plain-coloured lights.
  function carBody(m, kind) {
    const s = CAR_SPEC[kind], col = 0xffffff;
    if (LOW) { carBox(m, s, col); return; }
    carLights(m, carShape(m, s, col, CAR_GLASS), s.Wd);
  }
  function carBox(m, s, col) {
    {
      const L = s.L, Wd = s.Wd, H = s.belt - s.sill, base = s.sill, cabH = s.roof - s.belt, cabL = (s.panel || s.rear) - s.ws, cabZ = ((s.panel || s.rear) + s.ws) / 2 - L / 2;
      m.box(Wd, H, L, col, 0, base + H / 2, 0);
      m.box(Wd * 0.88, cabH, cabL, 0x2d3d52, 0, base + H + cabH / 2, cabZ);
      m.box(Wd * 0.9, 0.06, cabL * 0.9, col, 0, base + H + cabH + 0.03, cabZ);
      for (const [x, z] of [[-Wd / 2, s.wf - L / 2], [Wd / 2, s.wf - L / 2], [-Wd / 2, s.wb - L / 2], [Wd / 2, s.wb - L / 2]]) m.add(CYL6, 0x222428, x, s.wr, z, 0, 0, Math.PI / 2, s.wr * 2, 0.26, s.wr * 2);
    }
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
    // ground = true: a photo-textured drape (MAT.drape). Set geo.layer (TL.*) before adding a surface; geo.fr = null lays
    // the photo in world x/z, or [ox, oz, ax, az, bx, bz, u0, v0] lays it along unit vector a (u) and across b (v).
    // withUV (walls) also carries `wa` = this.wv = [facade style, seed, street-floor band] for cft-gfx's facade shader
    constructor(withUV, ground) { this.p = []; this.n = []; this.c = []; this.uv = withUV ? [] : null; this.wa = withUV ? [] : null; this.wv = [2, 0, 0]; this.gl = ground ? [] : null; this.guv = ground ? [] : null; this.layer = -1; this.fr = null; }
    vert(x, y, z, nx, ny, nz, col, u, v) {
      this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col.r, col.g, col.b); if (this.uv) { this.uv.push(u, v); this.wa.push(this.wv[0], this.wv[1], this.wv[2]); }
      if (this.gl) {
        this.gl.push(this.layer);
        const f = this.fr;
        if (f) { const rx = x - f[0], rz = z - f[1]; this.guv.push(f[6] + rx * f[2] + rz * f[3], f[7] + rx * f[4] + rz * f[5]); }
        else this.guv.push(x, z);
      }
    }
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
    dquad(x1, z1, x2, z2, x3, z3, x4, z4, hf, lift, col, maxE) { this.dtri(x1, z1, x2, z2, x3, z3, hf, lift, col, maxE); this.dtri(x1, z1, x3, z3, x4, z4, hf, lift, col, maxE); }
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
      if (this.uv) { g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setAttribute('wa', new THREE.Float32BufferAttribute(this.wa, 3)); }
      if (this.gl) { g.setAttribute('glayer', new THREE.Float32BufferAttribute(this.gl, 1)); g.setAttribute('guv', new THREE.Float32BufferAttribute(this.guv, 2)); }
      g.computeBoundingSphere();
      return g;
    }
  }

  // ---------------------------------------------------------------- state
  const W = { THREE, scene, camera, renderer, places: [], placeIds: new Set(), onPlace: null };
  Object.assign(W, CGW);   // colour blocks (defined with the materials, above)
  let origin = null, gen = 0;
  const tiles = new Map();
  let allSubs = [], inflight = 0;
  const buckets = new Map(), nameBuckets = new Map(), hchunks = new Map(), rchunks = new Map(), pchunks = new Map(), lchunks = new Map(), segBuckets = new Map(), bridgeBuckets = new Map();
  const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), vy: 0, grounded: true, face: 0, phase: 0, speed: 0, heading: 0, moved: 0, footMoved: 0, slope: 0, pitch: 0 };
  const cam = { yaw: 0, pitch: 0.32, dist: 7.5, cur: 7.5, lookT: 0, shake: 0, aimK: 0 };
  const input = { f: 0, b: 0, l: 0, r: 0, sprint: false, jump: false, hold: false, jx: 0, jy: 0 };  // hold = Space (or the jump button) held down: jetpacks, gliding
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
  // ---------------------------------------------------------------- boroughs (2026-11-17): every borough looks different
  // The names come from the place layer of zoom-11 tiles (TM.places, ~14 km across, cached in IndexedDB as '11/x/y'): a point
  // per borough / district (class suburb: Montréal's boroughs, New York's five, Paris's arrondissements) and per town.
  // A spot belongs to the nearest borough or town point within BORO_R (a fair guess at the real border); further out, the
  // nearest city. Each borough gets one of LOOKS (boroughs near each other never share one): walls tinted toward `wall`,
  // roofs from `roof`, kerbs painted in `a` stripes, centre lines in `line` colour and `dash` pattern, crowns of trees
  // (`tree` = [h, s, l], null = green), lamp-post banners in `a` / `b`. W.districtAt(x, z) -> { n, look } (HUD, missions).
  // Sub-tiles built before the names arrived (or whose borough changed) are rebuilt in place (boro.stale, in pumpTiles).
  const LOOKS = [
    { id: 'raspberry', n: 'Raspberry', a: 0xd4245e, b: 0xffe1ea, wall: 0xf0a6b8, roof: [0x8a3a4c, 0x6b2d3b], line: 0xffc21f, dash: 'dash', tree: [0.94, 0.5, 0.74] },
    { id: 'mint', n: 'Mint', a: 0x20c997, b: 0xe0fff4, wall: 0x9fdcc5, roof: [0x2f6b5a, 0x3a5f55], line: 0xffffff, dash: 'double', tree: null },
    { id: 'tangerine', n: 'Tangerine', a: 0xff8a1f, b: 0xfff0dc, wall: 0xf3bd88, roof: [0x9a4a22, 0x7a3d1e], line: 0xffffff, dash: 'long', tree: [0.07, 0.75, 0.5] },
    { id: 'grape', n: 'Grape', a: 0x6b4eff, b: 0xece6ff, wall: 0xbcb0f3, roof: [0x3d3470, 0x2f2a55], line: 0xffc21f, dash: 'dots', tree: [0.42, 0.4, 0.36] },
    { id: 'lemon', n: 'Lemon', a: 0xf2b705, b: 0xfff6cc, wall: 0xf2dc8a, roof: [0x6b5a2a, 0x5a4a22], line: 0xffffff, dash: 'dash', tree: [0.13, 0.75, 0.5] },
    { id: 'sky', n: 'Sky', a: 0x2f9bff, b: 0xe1f0ff, wall: 0xa9cdf2, roof: [0x2e4a6b, 0x3a556e], line: 0xffc21f, dash: 'double', tree: null },
    { id: 'terracotta', n: 'Terracotta', a: 0xe85d3c, b: 0xffe6dc, wall: 0xe6a68c, roof: [0xa8442a, 0x8e3a24], line: 0xffffff, dash: 'dots', tree: [0.2, 0.45, 0.4] },
    { id: 'lime', n: 'Lime', a: 0x7cc417, b: 0xf1ffd9, wall: 0xcfe39a, roof: [0x4a5a28, 0x3f4d22], line: 0xffffff, dash: 'long', tree: [0.25, 0.7, 0.48] },
    { id: 'teal', n: 'Teal', a: 0x0fa3b1, b: 0xdcf8fa, wall: 0x93d3d6, roof: [0x1f5a60, 0x24484c], line: 0xffc21f, dash: 'dash', tree: null },
    { id: 'lavender', n: 'Lavender', a: 0xa35cff, b: 0xf3e8ff, wall: 0xd4b8f0, roof: [0x5a3f7a, 0x4a3466], line: 0xffffff, dash: 'double', tree: [0.76, 0.45, 0.66] },
    { id: 'cherry', n: 'Cherry', a: 0xd62839, b: 0xffe0e3, wall: 0xdc9f9f, roof: [0x5a2a2a, 0x6e3030], line: 0xffffff, dash: 'dots', tree: [0.01, 0.6, 0.45] },
    { id: 'slate', n: 'Slate', a: 0x3f4b5e, b: 0xf4f6fa, wall: 0xc4ccd6, roof: [0x2f3640, 0x3a4048], line: 0xffc21f, dash: 'long', tree: [0.36, 0.25, 0.42] },
  ];
  for (const L of LOOKS) { L.ac = new THREE.Color(L.a); L.bc = new THREE.Color(L.b); L.wc = new THREE.Color(L.wall); L.lc = new THREE.Color(L.line); L.rc = L.roof.map(c => new THREE.Color(c)); L.pc = new THREE.Color(0xd8ccb6).lerp(L.wc, 0.3); L.css = '#' + L.ac.getHexString(); L.ink = (0.2126 * L.ac.r + 0.7152 * L.ac.g + 0.0722 * L.ac.b) > 0.42 ? '#1f1a3d' : '#ffffff'; L.map = '#' + new THREE.Color(0xcbc3b4).lerp(L.ac, 0.35).getHexString(); L.mapLine = '#' + new THREE.Color(0xb3a998).lerp(L.ac, 0.45).getHexString(); }
  W.LOOKS = LOOKS;
  const BORO_Z = 11, BORO_R = 6000, CITY_R = 25000, BORO_MIX = 0.5;
  const boro = { tiles: new Map(), pts: [], stale: new Set() };
  const strHash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };
  function districtAt(x, z) {
    let best = null, bd = Infinity, city = null, cd = Infinity;
    for (const p of boro.pts) {
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (p.c === 'city') { if (d < cd) { cd = d; city = p; } } else if (d < bd) { bd = d; best = p; }
    }
    if (best && bd < BORO_R * BORO_R) return best;
    if (city && cd < CITY_R * CITY_R) return city;
    return best || city;
  }
  W.districtAt = (x, z) => { const p = districtAt(x, z); return p ? { n: p.n, c: p.c, look: LOOKS[p.li] } : null; };
  W.districts = () => boro.pts.map(p => ({ n: p.n, c: p.c, x: p.x, z: p.z, look: LOOKS[p.li] }));
  const lookAt = (x, z) => { const p = districtAt(x, z); return p ? LOOKS[p.li] : null; };
  // Each borough takes its name's look unless a borough within LOOK_GAP already has it; then the look whose nearest
  // twin is furthest away. The order is by name, so the same boroughs get the same looks on every visit.
  const LOOK_GAP = 9000;
  function assignLooks() {
    const done = [];
    for (const p of boro.pts.slice().sort((a, b) => a.n < b.n ? -1 : a.n > b.n ? 1 : a.x - b.x)) {
      const gap = new Array(LOOKS.length).fill(Infinity);
      for (const q of done) gap[q.li] = Math.min(gap[q.li], Math.hypot(q.x - p.x, q.z - p.z));
      const pref = strHash(p.n) % LOOKS.length;
      p.li = pref;
      if (gap[pref] < LOOK_GAP) for (let k = 1; k < LOOKS.length; k++) { const i = (pref + k) % LOOKS.length; if (gap[i] > gap[p.li]) p.li = i; }
      done.push(p);
    }
  }
  // Which looks a sub-tile used (its corners + centre): when that changes, it is rebuilt.
  const subLooks = s => [[s.x0, s.z0], [s.x1, s.z0], [s.x0, s.z1], [s.x1, s.z1], [(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2]].map(([x, z]) => { const p = districtAt(x, z); return p ? p.n + p.li : '-'; }).join('|');
  function addBoroughs(list) {
    let added = 0;
    for (const p of list) {
      const { x, z } = W.toXZ(p.lat, p.lon);
      if (boro.pts.some(q => q.n === p.n && Math.hypot(q.x - x, q.z - z) < 1500)) continue;
      boro.pts.push({ n: p.n, c: p.c, x, z, li: 0 }); added++;
    }
    if (!added) return;
    assignLooks();
    for (const s of allSubs) if (s.group && s.looks !== subLooks(s)) boro.stale.add(s);
  }
  function requestBoroTile(x, y) {
    const k = BORO_Z + '/' + x + '/' + y, g = gen;
    if (boro.tiles.has(k)) return;
    boro.tiles.set(k, 'loading');
    (async () => {
      let buf = await idb('readonly', k);
      if (!buf) {
        const res = await fetchT((await tileUrl()).replace('{z}', BORO_Z).replace('{x}', x).replace('{y}', y), 20000);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        buf = await res.arrayBuffer();
        idb('readwrite', k, buf);
      }
      if (g !== gen) return;
      boro.tiles.set(k, 'ready');
      addBoroughs(TM.places(buf, BORO_Z, x, y));
    })().catch(err => {
      if (g !== gen) return;
      console.warn('borough names', k, err);
      boro.tiles.set(k, 'error');
      setTimeout(() => { if (g === gen && boro.tiles.get(k) === 'error') boro.tiles.delete(k); }, 30000);
    });
  }
  // The zoom-11 tile under the player, plus the next one when the player is within 3 km of its edge.
  function pumpBoroughs(px, pz) {
    const sc = 1 << (TM.Z - BORO_Z), gx = (origin.gx0 + px / origin.M) / sc, gy = (origin.gy0 + pz / origin.M) / sc;
    const e = 3000 / (origin.M * sc), tx = Math.floor(gx), ty = Math.floor(gy);
    requestBoroTile(tx, ty);
    const fx = gx - tx, fy = gy - ty, dx = fx < e ? -1 : fx > 1 - e ? 1 : 0, dy = fy < e ? -1 : fy > 1 - e ? 1 : 0;
    if (dx) requestBoroTile(tx + dx, ty);
    if (dy) requestBoroTile(tx, ty + dy);
    if (dx && dy) requestBoroTile(tx + dx, ty + dy);
  }
  W.boroughsReady = () => boro.pts.length > 0 || (boro.tiles.size > 0 && [...boro.tiles.values()].every(v => v === 'error'));

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
  loadGround();

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
    const g = standAt(x, z);
    if (!bridgeBuckets.size) return g;
    const d = deckAt(x, z);
    return d > g + 0.25 && (y == null || y > d - 1.6) ? d + roadLift(x, z) : g;   // the deck's road surface (lift) too
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
    pumpBoroughs(px, pz);
    ground.position.y = terr.minY - 1.5;
    const t0 = performance.now();
    for (const s of boro.stale) { // a borough's look arrived or changed: rebuild in place (the old group stays until the new one is up)
      if (performance.now() - t0 > budget) break;
      boro.stale.delete(s);
      if (!s.group) continue;
      const old = s.group; buildSub(s); dropSub({ group: old }); s.canvas = drawSubMap(s);
    }
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
  // Feet on the road (2026-11-21, the user: "check why feet sometimes go through the ground"): roads are drawn ROAD_STYLE.y +
  // 0.03 above the terrain (car roads 11 cm), but people stood on the bare terrain, so on every road their shoes sank in
  // (measured: 42% of steps more than 3 cm, worst 34 cm in the middle of wide roads, which were only shaped at their edges).
  // lchunks (a 0.5 m grid) keeps the drawn lift in centimetres, pavements use the same fine grid; road quads are split so
  // the surface follows the hill across.
  const LCELL = 0.5;   // the road-surface grid (lchunks) is finer than CELL so feet don't float or sink at road edges
  const roadLift = (x, z) => { const i = Math.floor(x / LCELL), j = Math.floor(z / LCELL), a = lchunks.get(ckey(i, j)); return a ? a[(j - Math.floor(j / CH) * CH) * CH + (i - Math.floor(i / CH) * CH)] / 100 : 0; };
  W.roadLift = (x, z) => roadLift(x, z);
  const roadLiftCm = rd => Math.max(1, Math.round((roadStyle(rd.t).y + 0.03 + (rd.br ? 0.006 : 0)) * 100));
  // pavements (the raised strips with a kerb along streets with cars, drawn KERB_Y above the ground in buildSub): people
  // standing on them stand on top, not 13 cm into them (2026-11-18, "legs in the ground")
  const paveAt = (x, z) => { if (LOW) return 0; const i = Math.floor(x / LCELL), j = Math.floor(z / LCELL), a = pchunks.get(ckey(i, j)); return a && a[(j - Math.floor(j / CH) * CH) * CH + (i - Math.floor(i / CH) * CH)] && !roadLift(x, z) ? 1 : 0; };   // fine grid (LCELL) like the road surface
  const standAt = (x, z) => { const r = roadLift(x, z); return groundAt(x, z) + (r || (paveAt(x, z) ? 0.13 : 0)); };
  W.standAt = standAt; W.paveAt = paveAt;
  function rasterize(rings, fn, cell) {
    const CELL_ = cell || CELL;
    let zmin = Infinity, zmax = -Infinity;
    for (const p of rings) for (let i = 1; i < p.length; i += 2) { zmin = Math.min(zmin, p[i]); zmax = Math.max(zmax, p[i]); }
    const j0 = Math.ceil(zmin / CELL_ - 0.5), j1 = Math.floor(zmax / CELL_ - 0.5), xs = [];
    for (let j = j0; j <= j1; j++) {
      const zc = (j + 0.5) * CELL_;
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
        const i0 = Math.ceil(xs[q] / CELL_ - 0.5), i1 = Math.floor(xs[q + 1] / CELL_ - 0.5);
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
        { const lc = roadLiftCm(rd), dw = rd.w / 2; rasterize([[x1 + nx * dw, z1 + nz * dw, x2 + nx * dw, z2 + nz * dw, x2 - nx * dw, z2 - nz * dw, x1 - nx * dw, z1 - nz * dw]],
          (i, j) => gridSet(lchunks, Uint8Array, i, j, lc), LCELL); }   // the drawn lift in cm on a finer grid (the drawn width, not hw): standAt
        if (!LOW && !rd.br && CAR.has(rd.t) && rd.t !== 'service' && rd.t !== 'track') { // the same pavement bands buildSub draws
          const a = rd.w / 2, b = a + (rd.t === 'residential' ? 2.0 : 2.6);
          for (const sd of [1, -1]) rasterize([[x1 + nx * a * sd, z1 + nz * a * sd, x2 + nx * a * sd, z2 + nz * a * sd, x2 + nx * b * sd, z2 + nz * b * sd, x1 + nx * b * sd, z1 + nz * b * sd]],
            (i, j) => gridSet(pchunks, Uint8Array, i, j, 1), LCELL);
        }
      }
      { // the round joints buildSub draws at every bend and end (disk): part of the road surface too
        const lc = roadLiftCm(rd), dw = rd.w / 2;
        for (let i = 0; i + 1 < p.length; i += 2) { const ring = []; for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; ring.push(p[i] + Math.cos(a) * dw, p[i + 1] + Math.sin(a) * dw); } rasterize([ring], (ii, jj) => gridSet(lchunks, Uint8Array, ii, jj, lc), LCELL); }
      }
    }
    s.names = [];  // named car streets in this sub-tile, painted on the road by streetNames()
    for (const nm of r.nm) {
      const p = conv(nm.p);
      if (nm.c) s.names.push({ n: nm.n, p });
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
    const tc = [0, 0, 0, 0];
    for (let i = 0; i < s.trees.length; i += 2) { const k = s.treeK[i / 2], li = tc[k]++; if (heightAt(s.trees[i], s.trees[i + 1]) === 0) indexProp(s, 'tree', li, s.trees[i], s.trees[i + 1], { sp: k }); }
    s.reg = true;
    for (const sg of s.walk) if (sg.car) { sg.n1 = nodeAt(sg.x1, sg.z1, sg, 1); sg.n2 = nodeAt(sg.x2, sg.z2, sg, 2); }
    s.props = layProps(s);
    s.decor = layDecor(s);
    // Named places: pin each to the nearest street point so people stand outside, not inside the walls
    const po = r.po || [];
    for (let i = 0; i < po.length; i += 4) {
      const id = s.tile.k + ':' + s.idx + ':' + (i / 4);
      const x = ox + po[i] * k, z = oz + po[i + 1] * k;
      if (W.placeIds.has(id)) continue;
      const pin = nearestWalkLocal(x, z, 45, s);
      if (!pin) continue;
      const pl = { id, x, z, kind: po[i + 2], name: po[i + 3], pin };
      if (W.placeFix) W.placeFix(pl);  // the game may rename a place (Tim Hortons -> Tom Hearton's)
      // a made-up shop that was put here before this tile arrived makes room for the real place
      for (let q = W.places.length - 1; q >= 0; q--) { const o = W.places[q]; if (o.made && Math.hypot(o.x - x, o.z - z) < 16) { o.gone = true; W.places.splice(q, 1); } }
      W.placeIds.add(id); W.places.push(pl);
      if (W.onPlace) W.onPlace(pl);
      for (const b of s.buildings) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && inRings(b.rings, x, z)) { b.shop = true; break; }  // shop windows (cft-gfx)
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
        made.push(pl); W.placeIds.add(id); W.places.push(pl); b.shop = true;
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
  // Everything you can smash (2026-11-17): street furniture, trees and parked cars, indexed by place. smashed: key ->
  // true (gone) | 'wreck' (a parked car, burnt out but still there) | 'gone' (borrowed). Lives as long as this world
  // (the session): a new visit builds a new world, so the city is whole again.
  const propBuckets = new Map(), smashed = new Map(), WRECK_COL = 0x2b2a2e, ZERO3 = new THREE.Vector3(0, 0, 0);
  const propKey = (kind, x, z) => kind + ':' + x.toFixed(1) + ',' + z.toFixed(1);
  function indexProp(s, kind, i, x, z, extra) {
    const e = Object.assign({ k: kind, s, i, x, z, key: propKey(kind, x, z) }, extra || {});
    addToBuckets(propBuckets, x - 1.5, z - 1.5, x + 1.5, z + 1.5, e);
    return e;
  }
  function layProps(s) {
    const P = { lamp: [], bench: [], hydrant: [], bin: [], box: [], car: [], car0: [], car1: [], car2: [], van: [] };
    let seed = (s.tile.x * 613 + s.tile.y * 271 + s.idx * 97) | 0;
    const rnd = () => hash(seed++);
    const free = (x, z) => !heightAt(x, z) && !heightAt(x + 0.8, z) && !heightAt(x - 0.8, z) && !heightAt(x, z + 0.8) && !heightAt(x, z - 0.8);
    const put = (kind, x, z, yaw) => { indexProp(s, kind, P[kind].length / 3, x, z); P[kind].push(x, z, yaw); };
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
          if (free(x, z)) put('lamp', x, z, Math.atan2(-uz * side, ux * side));
        }
        acc += L;
        for (let d = 5 + rnd() * 14; d < L - 4; d += 18 + rnd() * 26) {
          const sd = rnd() < 0.5 ? 1 : -1, q = rnd();
          const x = x1 + ux * d - uz * (hw + 1.4) * sd, z = z1 + uz * d + ux * (hw + 1.4) * sd;
          if (!free(x, z) || roadAt(x, z)) continue;
          put(q < 0.3 ? 'bench' : q < 0.58 ? 'bin' : q < 0.82 ? 'hydrant' : 'box', x, z, Math.atan2(-uz * sd, ux * sd));
        }
        if (rd.w >= 9 && L > 24 && !MAJOR.has(rd.t)) for (const sd of [1, -1]) { // cars parked along the kerb, nose with the traffic
          if (rnd() < 0.3) continue;
          for (let d = 10 + rnd() * 5; d < L - 10; d += 5.7) {
            if (rnd() < (LOW ? 0.8 : 0.55)) continue;
            const x = x1 + ux * d - uz * (hw - 0.95) * sd, z = z1 + uz * d + ux * (hw - 0.95) * sd;
            const yaw = Math.atan2(-ux * sd, -uz * sd), tint = CAR_TINT[Math.floor(rnd() * CAR_TINT.length)];
            const van = rnd() < 0.18, q2 = rnd(), sp = van ? null : q2 < 0.45 ? 0 : q2 < 0.78 ? 1 : 2;  // hatchback, saloon, SUV
            const pc = { x, z, yaw, ux, uz, van, tint, sp };
            const list = van ? P.van : P['car' + sp];
            pc.prop = indexProp(s, van ? 'van' : 'car', list.length / 4, x, z, van ? { car: pc, tint } : { car: pc, tint, sp });
            list.push(x, z, yaw, tint);
            if (!van) P.car.push(x, z, yaw, tint);
            addToBuckets(carBuckets, x - 2.5, z - 2.5, x + 2.5, z + 2.5, pc);
          }
        }
      }
    }
    return P;
  }
  // The decor layer for one sub-tile (see DECOR): lists [x, z, yaw, tint, scale, ...] per kind ('flag': the 5th value is
  // the height above the ground). Same seed, same spots: a street always has the same gnomes.
  const PAVE_MIX = [['planter', 26], ['cafe', 10], ['cones', 7], ['gnome', 9], ['vend', 7], ['balloons', 9], ['couch', 4], ['potty', 3], ['cart', 5], ['flamingo', 6], ['chalk0', 5], ['chalk1', 4], ['chalk2', 3]];
  const AREA_DECOR = {   // [kind, weight, group]; rate = one per this many m²
    park: { rate: 380, mix: [['mushroom', 16, 'ring'], ['duckbig', 5], ['statue', 6], ['sunflower', 12], ['crystal', 8], ['picnic', 12], ['flamingo', 8, 'flock'], ['gnome', 9, 'gang'], ['balloons', 8], ['potty', 4], ['donut', 4]] },
    grass: { rate: 520, mix: [['mushroom', 14, 'ring'], ['sunflower', 16], ['flamingo', 12, 'flock'], ['gnome', 12, 'gang'], ['crystal', 6], ['picnic', 8], ['balloons', 5]] },
    plaza: { rate: 300, mix: [['statue', 12], ['donut', 10], ['duckbig', 6], ['balloons', 14], ['cafe', 16], ['planter', 18], ['vend', 8], ['potty', 3], ['chalk1', 6], ['chalk2', 4]] },
    playground: { rate: 240, mix: [['duckbig', 10], ['balloons', 14], ['mushroom', 10], ['chalk0', 12], ['gnome', 8, 'gang'], ['donut', 5]] },
    pitch: { rate: 2400, mix: [['balloons', 6], ['potty', 6], ['flamingo', 6, 'flock']] },
    wood: { rate: 1100, mix: [['mushroom', 20, 'ring'], ['crystal', 14], ['gnome', 8, 'gang']] },
    sand: { rate: 900, mix: [['duckbig', 8], ['crystal', 6], ['balloons', 4]] },
  };
  function layDecor(s) {
    const P = {};
    for (const k of DECOR_KINDS) P[k] = [];
    let seed = (s.tile.x * 389 + s.tile.y * 733 + s.idx * 59 + 7) | 0;
    const rnd = () => hash(seed++);
    const dens = LOW ? 0.45 : 1;
    const free = (x, z, r) => !heightAt(x, z) && !heightAt(x + r, z) && !heightAt(x - r, z) && !heightAt(x, z + r) && !heightAt(x, z - r) && !roadAt(x, z) && !roadAt(x + r * 0.7, z) && !roadAt(x - r * 0.7, z) && !roadAt(x, z + r * 0.7) && !roadAt(x, z - r * 0.7);
    const pickW = mix => { let t = 0; for (const e of mix) t += e[1]; let r = rnd() * t; for (const e of mix) { if (r < e[1]) return e; r -= e[1]; } return mix[0]; };
    const tintOf = k => { const l = DECOR_TINTS[k]; return l ? l[Math.floor(rnd() * l.length)] : 0xffffff; };
    let total = 0;
    const put = (k, x, z, yaw, sc) => {
      if (total++ > 900) return;
      if (DECOR_HP[k]) indexProp(s, k, P[k].length / 5, x, z);
      P[k].push(x, z, yaw, tintOf(k), sc || 1);
    };
    // 1. pavements: along residential and bigger streets, a little further from the kerb than the benches; flags across side streets
    for (const rd of s.roads) {
      if (rd.br || !(rd.t === 'residential' || BIG.has(rd.t))) continue;
      const p = rd.p, hw = rd.w / 2;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const x1 = p[i], z1 = p[i + 1], x2 = p[i + 2], z2 = p[i + 3], L = Math.hypot(x2 - x1, z2 - z1);
        if (L < 6) continue;
        const ux = (x2 - x1) / L, uz = (z2 - z1) / L;
        for (let d = 3 + rnd() * 7; d < L - 3; d += (8 + rnd() * 13) / dens) {
          const sd = rnd() < 0.5 ? 1 : -1, e = pickW(PAVE_MIX), k = e[0], chalk = k.startsWith('chalk'), off = hw + (chalk ? 1.25 : 1.85 + rnd() * 0.7);
          const x = x1 + ux * d - uz * off * sd, z = z1 + uz * d + ux * off * sd;
          // buildings only: OSM sidewalks are footways, so the road grid covers most pavements (and the spot is already clear of this street's lanes)
          const r0 = chalk ? 1 : k === 'couch' || k === 'potty' || k === 'cafe' ? 1.0 : 0.55;
          if (heightAt(x, z) || heightAt(x + r0, z) || heightAt(x - r0, z) || heightAt(x, z + r0) || heightAt(x, z - r0)) continue;
          put(k, x, z, Math.atan2(-uz * sd, ux * sd) + (k === 'gnome' || k === 'flamingo' ? (rnd() - 0.5) * 1.5 : 0), k === 'gnome' ? 0.9 + rnd() * 0.5 : 1);
        }
        if (rd.t === 'residential' && rd.w >= 6 && L > 18 && rnd() < 0.45 * dens) { // bunting: a line of little flags from kerb to kerb, sagging in the middle
          const d = L * (0.3 + rnd() * 0.4), cx = x1 + ux * d, cz = z1 + uz * d, nx = -uz, nz = ux, half = hw + 1.2, n = Math.max(6, Math.round(half * 2 / 0.6));
          const yaw = Math.atan2(-ux, -uz), base = 5.4 + rnd() * 0.8;
          for (let j = 0; j < n; j++) { const t = j / (n - 1), fx = cx + nx * (t * 2 - 1) * half, fz = cz + nz * (t * 2 - 1) * half; P.flag.push(fx, fz, yaw, DECOR_TINTS.flag[(j + i) % 7], base - 1.1 * 4 * t * (1 - t)); }
        }
      }
    }
    // 2. parks, lawns, plazas, playgrounds, woods: scattered, some in groups (a fairy ring of mushrooms, a gnome gang, a flock of flamingos)
    for (const a of s.areas) {
      const cfg = AREA_DECOR[a.k];
      if (!cfg) continue;
      const p = a.p, rings = [p].concat(a.hs || []);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]); }
      const n = Math.min(45, Math.abs(signedArea(p)) / cfg.rate * dens);
      let placed = 0;
      for (let t = 0; t < n * 3 && placed < n; t++) {
        const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
        if (!inRings(rings, x, z) || !free(x, z, 1.4)) continue;
        const e = pickW(cfg.mix), k = e[0], yaw = rnd() * 6.283;
        placed++;
        if (e[2] === 'ring') { const cnt = 5 + Math.floor(rnd() * 3), R = 2.6 + rnd(); for (let j = 0; j < cnt; j++) { const q = j / cnt * 6.283, mx = x + Math.cos(q) * R, mz = z + Math.sin(q) * R; if (free(mx, mz, 0.6)) put(k, mx, mz, rnd() * 6.283, 0.45 + rnd() * 0.5); } put(k, x, z, yaw, 1.1 + rnd() * 0.5); }
        else if (e[2] === 'gang' || e[2] === 'flock') { const cnt = 3 + Math.floor(rnd() * 4); for (let j = 0; j < cnt; j++) { const mx = x + (rnd() - 0.5) * 5, mz = z + (rnd() - 0.5) * 5; if (free(mx, mz, 0.5) && inRings(rings, mx, mz)) put(k, mx, mz, yaw + (rnd() - 0.5) * 0.8, e[2] === 'gang' ? 0.9 + rnd() * 0.7 : 1); } }
        else put(k, x, z, yaw, k === 'duckbig' || k === 'statue' ? 0.85 + rnd() * 0.4 : 0.85 + rnd() * 0.35);
      }
    }
    // 3. the water: giant rubber ducks and pool rings bobbing about
    for (const a of s.water) {
      const p = a.p, rings = [p].concat(a.hs || []), area = Math.abs(signedArea(p));
      if (area < 400) continue;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]); }
      const n = Math.min(18, area / 1600 * dens);
      for (let t = 0, got = 0; t < n * 3 && got < n; t++) {
        const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
        if (!inRings(rings, x, z) || heightAt(x, z)) continue;
        got++; put(rnd() < 0.5 ? 'floatduck' : 'floatring', x, z, rnd() * 6.283, rnd() < 0.15 ? 2.6 : 0.9 + rnd() * 0.6);
      }
    }
    return P;
  }
  // A parked car at (x, z)? (within its footprint, with a margin R)
  function carAt(x, z, R) {
    const list = carBuckets.get(bkey(x, z));
    if (!list) return null;
    for (const c of list) {
      if (c.gone) continue;  // borrowed (or a loose car that drove off)
      const dx = x - c.x, dz = z - c.z, along = dx * c.ux + dz * c.uz, across = -dx * c.uz + dz * c.ux;
      if (Math.abs(along) < (c.van ? 2.45 : c.sp ? 2.32 : 2.0) + R && Math.abs(across) < 0.92 + R) return c;
    }
    return null;
  }
  W.carAt = carAt;

  // ---------------------------------------------------------------- smashing things (session only) + borrowed cars
  const PROP_HP = Object.assign({}, DECOR_HP, (opts.tune && opts.tune.smash && opts.tune.smash.hp) || { bin: 1, box: 1, hydrant: 2, bench: 2, lamp: 3, tree: 3, car: 4, van: 5 });  // D.TUNE.smash.hp (+ the decor layer's)
  const DEBRIS_COL = { bin: [0x2f8f5b, 0x226b44, 0xf4f1ea], box: [0x2b6cb0, 0xf4f1ea], hydrant: [0xe23b2e, 0xf2b134], bench: [0x9a6a3c, 0xa8774a, 0x33373f],
    lamp: [0x3a3f4a, 0x2a2e37, 0xfff0b8], tree: [0x6b4f37, 0x4f8a3a, 0x6c9a4e], car: [0x2b2a2e, 0x9fc3dd, 0x3a3d44], van: [0x2b2a2e, 0x9fc3dd, 0x3a3d44],
    planter: [0xe8453c, 0x5b4030, 0xff5c8a], cafe: [0xf4f1ea, 0x33373f, 0x35a05a], cones: [0xff7a1a, 0xffffff], gnome: [0xe8453c, 0x2b6cb0, 0xffffff], flamingo: [0xff7ab8, 0xf25a9a], vend: [0xe8453c, 0xbfe8ff, 0xffc21f],
    balloons: [0xff5c8a, 0xffc21f, 0x38bdf8], couch: [0xc9a227, 0xf4f1ea], potty: [0x2b6cb0, 0x6b4f37, 0xf4f1ea], cart: [0xb9c0c8, 0xff5c8a], mushroom: [0xe8453c, 0xffffff, 0xf4ecd8], duckbig: [0xffd23f, 0xff8a1a],
    statue: [0xb9b2a4, 0x6fae94, 0xd4af37], donut: [0xd9a05b, 0xff8fb8, 0x35e06a], crystal: [0xff7ad9, 0x7ae8ff, 0xb48cff], sunflower: [0xffc21f, 0x3f8f3a], picnic: [0xe8453c, 0xffffff, 0xc9a26a] };
  const SMASH_FX = { bin: ['🗑️', '📰', '🍌'], box: ['✉️', '📨'], hydrant: ['💦', '💧'], bench: ['🪵'], lamp: ['⚡', '✨'], tree: ['🍃', '🍂'], car: ['💥', '🔥'], van: ['💥', '🔥'],
    planter: ['🌸', '🌼'], cafe: ['☕', '🥐'], cones: ['🚧'], gnome: ['🍄', '✨'], flamingo: ['🦩', '🪶'], vend: ['🥤', '🪙'], balloons: ['🎈', '🎉'], couch: ['🛋️', '🪙'], potty: ['💩', '🧻'],
    cart: ['🛒', '🥫'], mushroom: ['🍄', '✨'], duckbig: ['🦆', '💦'], statue: ['🪨', '🐦'], donut: ['🍩', '✨'], crystal: ['💎', '✨'], sunflower: ['🌻', '🌱'], picnic: ['🍉', '🥪'] };
  const SMASH_Y = { lamp: 2.6, tree: 2.2, balloons: 2.8, duckbig: 2.2, statue: 2.4, donut: 2.0, mushroom: 1.4, potty: 1.4, vend: 1.2, sunflower: 1.8, crystal: 1.0 };
  const propHp = new Map();
  // the nearest thing you can smash within r of (x, z): {k, x, z, key, ...} or null. opts.cars: include parked cars
  W.propNear = function (x, z, r, opts) {
    const list = propBuckets.get(bkey(x, z));
    if (!list) return null;
    let best = null, bd = r;
    for (const e of list) {
      const st = smashed.get(e.key);
      if (st === true || st === 'gone' || (st === 'wreck')) continue;
      if (e.car && !(opts && opts.cars)) continue;
      if (opts && opts.kind && e.k !== opts.kind) continue;
      const d = Math.hypot(e.x - x, e.z - z) - (e.car ? 1.2 : e.k === 'tree' ? 0.3 : 0);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };
  W.isSmashed = key => smashed.has(key);
  W.smashCount = () => smashed.size;
  function setInstance(e, fn) {
    if (!e.s || !e.s.inst) return;
    for (const im of e.s.inst[e.k] || []) {
      if (im.userData.sp != null && im.userData.sp !== e.sp) continue;
      if (e.i >= im.count) continue;
      fn(im);
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
  const _sm = new THREE.Matrix4(), _sp = new THREE.Vector3(), _sq = new THREE.Quaternion(), _ss = new THREE.Vector3();
  // W.hitProp(e, dmg, dir {x, z}) -> 'hit' | 'smashed' | 'wreck'. dmg 99 smashes anything (a car driving into it).
  W.hitProp = function (e, dmg, dir) {
    if (!e || smashed.has(e.key)) return null;
    const left = (propHp.has(e.key) ? propHp.get(e.key) : PROP_HP[e.k] || 1) - Math.max(0.5, dmg);
    const y = groundAt(e.x, e.z);
    if (left > 0) { // a dent: it wobbles and sheds a chip or two
      propHp.set(e.key, left);
      debris(e.x, y + (SMASH_Y[e.k] ? SMASH_Y[e.k] * 0.8 : 0.6), e.z, e.k, 3, dir);
      return 'hit';
    }
    propHp.delete(e.key);
    const car = e.k === 'car' || e.k === 'van';
    smashed.set(e.key, car ? 'wreck' : true);
    if (car) {
      if (e.loose) { e.loose.traverse(o => { if (o.isMesh && o.material && o.material.vertexColors) { o.material = MAT.wreck; } }); e.loose.rotation.z = 0.12; e.loose.position.y -= 0.18; }
      else setInstance(e, im => { im.getMatrixAt(e.i, _sm); _sm.decompose(_sp, _sq, _ss); _sq.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.12))); _sp.y -= 0.18; _sm.compose(_sp, _sq, _ss); im.setMatrixAt(e.i, _sm); im.setColorAt(e.i, _c.setHex(WRECK_COL)); });
      fires.push({ x: e.x, z: e.z, t: 0, life: 9 });
      if (W.onWreckFire) W.onWreckFire(e.x, e.z);  // the campaign's real fire (it spreads; put it out)
      debris(e.x, y + 1.2, e.z, e.k, 14, dir);
    } else {
      setInstance(e, im => { im.getMatrixAt(e.i, _sm); _sm.decompose(_sp, _sq, _ss); _sm.compose(_sp, _sq, ZERO3); im.setMatrixAt(e.i, _sm); });
      debris(e.x, y + (SMASH_Y[e.k] || 0.6), e.z, e.k, e.k === 'tree' || e.k === 'duckbig' || e.k === 'statue' ? 14 : e.k === 'lamp' ? 10 : 8, dir);
      if (e.k === 'hydrant') geysers.push({ x: e.x, z: e.z, t: 0, life: 7 });
      if (e.k === 'tree') fallTree(e, dir);
    }
    const fxl = SMASH_FX[e.k] || ['💥'];
    W.burst(e.x, y + 1.2, e.z, fxl[0], 5, { spread: 3, up: 5 });
    if (fxl[1]) W.burst(e.x, y + 1.2, e.z, fxl[1], 4, { spread: 2.5, up: 4, size: 0.45 });
    if (W.onSmash) W.onSmash(e);
    return car ? 'wreck' : 'smashed';
  };
  // chunks that fly, tumble, bounce and shrink away
  const debrisList = [], debrisGeo = shared(new THREE.BoxGeometry(1, 1, 1)), debrisMats = new Map();
  const debrisMat = col => { let m = debrisMats.get(col); if (!m) { m = new THREE.MeshLambertMaterial({ color: col }); debrisMats.set(col, m); } return m; };
  function debris(x, y, z, kind, n, dir) {
    const cols = DEBRIS_COL[kind] || [0x888888];
    n = LOW ? Math.ceil(n / 2) : n;
    for (let i = 0; i < n && debrisList.length < 90; i++) {
      const m = new THREE.Mesh(debrisGeo, debrisMat(cols[i % cols.length])), sz = 0.1 + Math.random() * (kind === 'car' || kind === 'van' ? 0.4 : 0.25);
      m.scale.set(sz, sz * (0.4 + Math.random()), sz * (0.6 + Math.random()));
      m.position.set(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6);
      m.castShadow = !LOW;
      scene.add(m);
      const a = Math.random() * 6.283, sp = 2 + Math.random() * 5, dx = dir ? dir.x * 4 : 0, dz = dir ? dir.z * 4 : 0;
      debrisList.push({ m, vx: Math.cos(a) * sp + dx, vz: Math.sin(a) * sp + dz, vy: 3 + Math.random() * 6, rx: (Math.random() - 0.5) * 14, rz: (Math.random() - 0.5) * 14, t: 0, life: 2.2 + Math.random(), s0: m.scale.clone() });
    }
  }
  const geysers = [], fires = [], fallen = [];
  function fallTree(e, dir) { // a stand-in tree that tips over and sinks away
    const T = TREE[e.sp || 0] || TREE[0], g = new THREE.Group(), t = new THREE.Mesh(T.trunk, MAT.trunk), c = new THREE.Mesh(T.crown, new THREE.MeshLambertMaterial({ color: 0x5e8f43, vertexColors: !LOW }));
    g.add(t, c); g.position.set(e.x, groundAt(e.x, e.z) - 0.1, e.z);
    g.rotation.y = dir ? Math.atan2(dir.x, dir.z) : Math.random() * 6.28;
    scene.add(g);
    fallen.push({ g, t: 0 });
  }
  function updateSmash(dt) {
    for (let i = debrisList.length - 1; i >= 0; i--) {
      const d = debrisList[i];
      d.t += dt;
      if (d.t >= d.life) { scene.remove(d.m); debrisList.splice(i, 1); continue; }
      d.vy -= GRAV * dt;
      d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt;
      const gy = groundAt(d.m.position.x, d.m.position.z) + 0.05;
      if (d.m.position.y < gy) { d.m.position.y = gy; d.vy = Math.abs(d.vy) * 0.35; d.vx *= 0.6; d.vz *= 0.6; d.rx *= 0.5; d.rz *= 0.5; }
      d.m.rotation.x += d.rx * dt; d.m.rotation.z += d.rz * dt;
      const k = d.t / d.life; if (k > 0.7) d.m.scale.copy(d.s0).multiplyScalar(1 - (k - 0.7) / 0.3);
    }
    for (let i = geysers.length - 1; i >= 0; i--) { // a broken hydrant: a fountain for a few seconds
      const g = geysers[i];
      g.t += dt;
      if (g.t > g.life) { geysers.splice(i, 1); continue; }
      if (Math.random() < dt * 14 && fx.length < 150) W.burst(g.x, groundAt(g.x, g.z) + 0.8, g.z, Math.random() < 0.7 ? '💧' : '💦', 1, { spread: 1.4, up: 11, size: 0.5, life: 1.4, grav: 14 });
    }
    for (let i = fires.length - 1; i >= 0; i--) { // a wreck smokes and burns for a while
      const f = fires[i];
      f.t += dt;
      if (f.t > f.life) { fires.splice(i, 1); continue; }
      if (Math.random() < dt * 5 && fx.length < 150) W.burst(f.x + (Math.random() - 0.5), groundAt(f.x, f.z) + 1.4, f.z + (Math.random() - 0.5), f.t < f.life * 0.6 && Math.random() < 0.5 ? '🔥' : '💨', 1, { spread: 0.6, up: 2.2, size: 0.8, life: 1.6, grav: -0.5 });
    }
    for (let i = fallen.length - 1; i >= 0; i--) {
      const f = fallen[i];
      f.t += dt;
      f.g.rotation.x = Math.min(Math.PI / 2, f.t * f.t * 2.4);
      if (f.t > 1.4) f.g.position.y -= dt * 1.5;
      if (f.t > 3) { scene.remove(f.g); fallen.splice(i, 1); }
    }
  }
  // Borrowing a parked car: it disappears from the kerb (you're driving it). Parking it again leaves a loose car that can
  // be borrowed again, smashed, or wrecked. Returns the tint.
  const looseCars = [];
  W.borrowCar = function (pc) {
    if (!pc || pc.gone) return null;
    pc.gone = true;
    if (pc.loose) { removeObj(pc.loose); const i = looseCars.indexOf(pc); if (i >= 0) looseCars.splice(i, 1); }
    else if (pc.prop) { smashed.set(pc.prop.key, 'gone'); setInstance(pc.prop, im => { im.getMatrixAt(pc.prop.i, _sm); _sm.decompose(_sp, _sq, _ss); _sm.compose(_sp, _sq, ZERO3); im.setMatrixAt(pc.prop.i, _sm); }); }
    return pc.tint || 0xe8453c;
  };
  W.parkCar = function (x, z, yaw, tint) {
    const mesh = W.vehicle('car', tint);
    mesh.position.set(x, groundAt(x, z), z); mesh.rotation.y = yaw;
    scene.add(mesh);
    const fx2 = -Math.sin(yaw), fz2 = -Math.cos(yaw);
    const pc = { x, z, yaw, ux: fx2, uz: fz2, van: false, tint, loose: mesh, sp: 0 };
    pc.prop = { k: 'car', x, z, key: 'loose:' + looseCars.length + ':' + Math.round(x) + ',' + Math.round(z), car: pc, loose: mesh, tint };
    addToBuckets(carBuckets, x - 2.5, z - 2.5, x + 2.5, z + 2.5, pc);
    addToBuckets(propBuckets, x - 1.5, z - 1.5, x + 1.5, z + 1.5, pc.prop);
    looseCars.push(pc);
    return pc;
  };
  // A parked car close to (x, z) that can be borrowed (not wrecked, not gone)
  W.borrowable = function (x, z, r) {
    const list = carBuckets.get(bkey(x, z));
    if (!list) return null;
    let best = null, bd = r;
    for (const c of list) { if (c.gone || (c.prop && smashed.get(c.prop.key) === 'wreck')) continue; const d = Math.hypot(c.x - x, c.z - z) - 1.4; if (d < bd) { bd = d; best = c; } }
    return best;
  };
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
    const out = [], kinds = [], bush = [];
    s.treeK = kinds; s.bushes = bush;
    const okB = (x, z) => !LOW && bush.length < 6000 && heightAt(x, z) === 0 && heightAt(x + 1, z) === 0 && heightAt(x - 1, z) === 0 && heightAt(x, z + 1) === 0 && heightAt(x, z - 1) === 0 && !roadAt(x, z) && !roadAt(x + 0.9, z) && !roadAt(x - 0.9, z) && !roadAt(x, z + 0.9) && !roadAt(x, z - 0.9);
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
          if (ok(x, z)) { out.push(x, z); kinds.push(treeKind(x, z, 'street')); }
          if (rd.t === 'residential' && rnd() < 0.4) { // a bush between the trees, a little further from the kerb
            const bd = d + (rnd() < 0.5 ? -1 : 1) * (2.6 + rnd() * 1.4), bo = off + 0.6 + rnd() * 1.2, bx = x1 + ux * bd - uz * bo * side, bz = z1 + uz * bd + ux * bo * side;
            if (okB(bx, bz)) bush.push(bx, bz, rnd() < 0.3 ? 1 : 0, rnd() * 6.28);
          }
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
        if (inRings([p].concat(a.hs || []), x, z) && ok(x, z)) { out.push(x, z); kinds.push(treeKind(x, z, a.k === 'wood' ? 'wood' : 'park')); }
      }
      if (!LOW) { // undergrowth in woods; round, flowering and the odd topiary duck in parks
        const nb = Math.min(500, Math.abs(signedArea(p)) * (a.k === 'wood' ? 1 / 140 : 1 / 180));
        for (let t = 0; t < nb * 1.6; t++) {
          const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0), q = rnd();
          if (inRings([p].concat(a.hs || []), x, z) && okB(x, z)) bush.push(x, z, a.k === 'wood' ? 0 : q < 0.05 ? 2 : q < 0.4 ? 1 : 0, rnd() * 6.28);
        }
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
    const col = new Float32Array(nv * 3), lay = new Float32Array(nv).fill(TL.ground), guv = new Float32Array(nv * 2);
    let p = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = node(i - 1, j) - node(i + 1, j), dz = node(i, j - 1) - node(i, j + 1), l = Math.hypot(dx, 2 * GS, dz);
      pos[p] = i * GS; pos[p + 1] = node(i, j); pos[p + 2] = j * GS;
      nrm[p] = dx / l; nrm[p + 1] = 2 * GS / l; nrm[p + 2] = dz / l;
      col[p] = TERRAIN_COL.r; col[p + 1] = TERRAIN_COL.g; col[p + 2] = TERRAIN_COL.b;
      guv[p / 3 * 2] = i * GS; guv[p / 3 * 2 + 1] = j * GS;
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
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('glayer', new THREE.BufferAttribute(lay, 1));
    g.setAttribute('guv', new THREE.BufferAttribute(guv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, MAT.terrain);
    m.receiveShadow = true;
    return m;
  }
  // Graffiti (2026-11-24, the user: "put graffiti on 10% of buildings"). One painted atlas (graffitiAtlas: 16 pieces in a
  // 4 x 4 grid, drawn once on a canvas: bubble-letter words with a 3D drop, outlines, shine and drips over a spray cloud,
  // and four characters), one piece on the longest wall of about one building in ten (GRAFFITI_SHARE; the same buildings
  // every visit: picked by a hash of the building's centre), all of a sub-tile's pieces in one mesh. Friendly words only.
  // Never greyed: in a grey colour block (cft-color.js) the graffiti is the only colour on the street, the city's own paint
  // holding out against the Static.
  const GRAFFITI_SHARE = 0.1;
  let GRAF = null;
  function graffitiAtlas() {
    if (GRAF) return GRAF;
    const CW = 512, CH = 256, cv = document.createElement('canvas');
    cv.width = CW * 4; cv.height = CH * 4;
    const g = cv.getContext('2d');
    const PAL = [['#ff5c8a', '#ffc21f'], ['#20c997', '#3fa7ff'], ['#6b4eff', '#ff5ce1'], ['#ff8a3d', '#ffe14d'], ['#3fe0c5', '#b6ff5a'], ['#ff4d4d', '#ff9f1c'], ['#7b8cff', '#4dfff3'], ['#ffd23f', '#ff6fa8']];
    const WORDS = ['BONK', 'WOW!', 'YO!', 'FUN', 'ZAP', 'LOVE', 'HI MOM', 'POP!', 'COOL', 'SMILE', 'RAD', 'YAY'];
    const FONT = "900 {s}px Fredoka, 'Arial Black', Impact, sans-serif";
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    function spray(cx, cy, rx, ry, col, n) { // a soft cloud of paint behind a piece
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()), x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d, r = 14 + rnd() * 34;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.globalAlpha = 0.22; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    }
    function drips(x0, x1, y, col, n) {
      g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const x = x0 + rnd() * (x1 - x0), len = 12 + rnd() * 34, w = 4 + rnd() * 5;
        g.lineWidth = w; g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x, y + len); g.stroke();
        g.beginPath(); g.arc(x, y + len + w * 0.3, w * 0.75, 0, Math.PI * 2); g.fill();
      }
    }
    function star(x, y, r) {
      g.fillStyle = '#ffffff'; g.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.3 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.closePath(); g.fill();
    }
    function word(cx, cy, text, pal) {
      let size = 150;
      g.font = FONT.replace('{s}', size);
      while (g.measureText(text).width > CW - 90 && size > 60) { size -= 8; g.font = FONT.replace('{s}', size); }
      const w = g.measureText(text).width;
      g.save(); g.translate(cx, cy); g.rotate((rnd() - 0.5) * 0.16); g.transform(1, 0, (rnd() - 0.5) * 0.3, 1, 0, 0);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      for (let k = 12; k > 0; k -= 2) { g.lineWidth = 22; g.strokeStyle = '#1f1a3d'; g.strokeText(text, k, k); g.fillStyle = '#1f1a3d'; g.fillText(text, k, k); }   // the 3D drop
      g.lineWidth = 24; g.strokeStyle = '#1f1a3d'; g.strokeText(text, 0, 0);
      g.lineWidth = 10; g.strokeStyle = '#ffffff'; g.strokeText(text, 0, 0);
      const gr = g.createLinearGradient(0, -size * 0.45, 0, size * 0.45);
      gr.addColorStop(0, pal[1]); gr.addColorStop(1, pal[0]);
      g.fillStyle = gr; g.fillText(text, 0, 0);
      g.save(); g.beginPath(); g.rect(-w, -size, w * 2, size * 0.42); g.clip(); g.globalAlpha = 0.35; g.fillStyle = '#ffffff'; g.fillText(text, 0, 0); g.restore();   // a shine across the top
      drips(-w * 0.45, w * 0.45, size * 0.38, pal[0], 4 + Math.floor(rnd() * 3));
      for (let i = 0; i < 3; i++) star(-w * 0.55 + rnd() * w * 1.1, -size * 0.55 + rnd() * size * 0.15, 8 + rnd() * 8);
      g.restore();
    }
    function blob(cx, cy, r, fill) { g.beginPath(); for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, rr = r * (0.9 + rnd() * 0.18); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.lineWidth = 12; g.strokeStyle = '#1f1a3d'; g.stroke(); g.fillStyle = fill; g.fill(); }
    function character(cx, cy, kind, pal) {
      g.save(); g.translate(cx, cy); g.lineJoin = 'round'; g.lineCap = 'round';
      if (kind === 0) { // a big grin
        blob(0, 0, 100, pal[1]);
        g.fillStyle = '#1f1a3d'; g.beginPath(); g.ellipse(-34, -24, 13, 20, 0, 0, Math.PI * 2); g.ellipse(34, -24, 13, 20, 0, 0, Math.PI * 2); g.fill();
        g.lineWidth = 12; g.strokeStyle = '#1f1a3d'; g.beginPath(); g.arc(0, 8, 56, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(-28, -32, 5, 0, Math.PI * 2); g.arc(40, -32, 5, 0, Math.PI * 2); g.fill();
        drips(-60, 60, 92, pal[1], 4);
      } else if (kind === 1) { // a heart with a crown
        g.beginPath(); g.moveTo(0, 90); g.bezierCurveTo(-150, -10, -70, -110, 0, -45); g.bezierCurveTo(70, -110, 150, -10, 0, 90); g.closePath();
        g.lineWidth = 14; g.strokeStyle = '#1f1a3d'; g.stroke(); g.fillStyle = pal[0]; g.fill();
        g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(-50, -70); g.lineTo(-50, -112); g.lineTo(-25, -88); g.lineTo(0, -122); g.lineTo(25, -88); g.lineTo(50, -112); g.lineTo(50, -70); g.closePath(); g.lineWidth = 8; g.stroke(); g.fill();
        drips(-40, 40, 70, pal[0], 3);
      } else if (kind === 2) { // a googly figment (the city's friendly monsters)
        blob(0, 10, 92, pal[0]);
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(-32, -10, 30, 0, Math.PI * 2); g.arc(34, -14, 24, 0, Math.PI * 2); g.fill(); g.lineWidth = 7; g.strokeStyle = '#1f1a3d'; g.stroke();
        g.fillStyle = '#1f1a3d'; g.beginPath(); g.arc(-26, -4, 12, 0, Math.PI * 2); g.arc(40, -10, 10, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(0, 46, 26, 16, 0, 0, Math.PI); g.fill();
        drips(-50, 50, 96, pal[0], 4);
      } else { // a rainbow over clouds
        ['#ff4d4d', '#ff9f1c', '#ffe14d', '#3fe07a', '#3fa7ff', '#8a5cff'].forEach((c, i) => { g.lineWidth = 16; g.strokeStyle = c; g.beginPath(); g.arc(0, 60, 150 - i * 16, Math.PI, 0); g.stroke(); });
        g.fillStyle = '#ffffff'; g.lineWidth = 10; g.strokeStyle = '#1f1a3d';
        for (const [x, y, r] of [[-120, 60, 40], [-80, 50, 48], [120, 60, 40], [80, 50, 48]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); g.fill(); }
      }
      g.restore();
    }
    let wi = 0;
    for (let i = 0; i < 16; i++) {
      const x0 = (i % 4) * CW, y0 = Math.floor(i / 4) * CH, cx = x0 + CW / 2, cy = y0 + CH / 2, pal = PAL[i % PAL.length];
      g.save(); g.beginPath(); g.rect(x0, y0, CW, CH); g.clip();
      spray(cx, cy, CW * 0.36, CH * 0.3, pal[i % 2], 26);
      if (i % 4 === 3) character(cx, cy - 4, Math.floor(i / 4), pal);
      else word(cx, cy - 10, WORDS[wi++ % WORDS.length], pal);
      g.restore();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, alphaTest: 0.03, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    GRAF = { tex, mat, canvas: cv };
    return GRAF;
  }
  W.graffitiAtlas = () => graffitiAtlas().canvas;
  W.graffitiNear = (x, z, r) => { const out = []; for (const s of allSubs) if (s.group) for (const b of s.buildings) if (b.graffiti && Math.hypot(b.graffiti.x - x, b.graffiti.z - z) < r) out.push(b.graffiti); return out.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z)); };
  W.graffitiStats = () => { let n = 0, t = 0; for (const s of allSubs) if (s.group) for (const b of s.buildings) { n++; if (b.graffiti != null) t++; } return { buildings: n, tagged: t }; };
  // the wall piece for building b, or null: {x, z, nx, nz, ux, uz, w, h, y, cell}
  function graffitiSpot(b) {
    if (b.m > 0.5 || b.h < 3.2 || b.area < 25) return null;
    const hh = (Math.round(b.cx * 4) * 73856093) ^ (Math.round(b.cz * 4) * 19349663);
    if (hash(hh) >= GRAFFITI_SHARE) return null;
    const p = b.p, n = p.length / 2;
    let best = null, bl = 4.5;
    for (let i = 0, k = n - 1; i < n; k = i++) {
      const x1 = p[2 * k], z1 = p[2 * k + 1], x2 = p[2 * i], z2 = p[2 * i + 1], L = Math.hypot(x2 - x1, z2 - z1);
      if (L > bl) { bl = L; best = [x1, z1, x2, z2, L]; }
    }
    if (!best) return null;
    const [x1, z1, x2, z2, L] = best, dx = (x2 - x1) / L, dz = (z2 - z1) / L;
    let nx = dz, nz = -dx;
    const t = 0.5 + (hash(hh + 1) - 0.5) * 0.3, mx = x1 + (x2 - x1) * t, mz = z1 + (z2 - z1) * t;
    if (inRings(b.rings, mx + nx * 0.7, mz + nz * 0.7)) { nx = -nx; nz = -nz; }
    const w = Math.min(L * 0.72, 7.5, 2 * (b.h - 0.9)), h = w / 2;
    if (w < 2.4) return null;
    const ux = nz, uz = -nx;   // to the right of someone facing the wall
    const gy = Math.max(groundAt(mx + nx * 0.5, mz + nz * 0.5), groundAt(mx - ux * w / 2 + nx * 0.5, mz - uz * w / 2 + nz * 0.5), groundAt(mx + ux * w / 2 + nx * 0.5, mz + uz * w / 2 + nz * 0.5));
    const y = gy + 0.3 + hash(hh + 2) * Math.max(0, Math.min(1.2, b.base + b.h - gy - h - 0.8));
    if (y + h > b.base + b.h - 0.3) return null;
    return { x: mx + nx * 0.06, z: mz + nz * 0.06, nx, nz, ux, uz, w, h, y, cell: Math.floor(hash(hh + 3) * 16) % 16 };
  }
  function graffitiMesh(s) {
    const pos = [], nrm = [], uv = [];
    for (const b of s.buildings) {
      const q = graffitiSpot(b);
      if (!q) continue;
      const hw = q.w / 2, u0 = (q.cell % 4) / 4, v1 = 1 - Math.floor(q.cell / 4) / 4, u1 = u0 + 0.25, v0 = v1 - 0.25;
      const BL = [q.x - q.ux * hw, q.y, q.z - q.uz * hw], BR = [q.x + q.ux * hw, q.y, q.z + q.uz * hw], TR = [BR[0], q.y + q.h, BR[2]], TL = [BL[0], q.y + q.h, BL[2]];
      for (const [v, a, c] of [[BL, u0, v0], [BR, u1, v0], [TR, u1, v1], [BL, u0, v0], [TR, u1, v1], [TL, u0, v1]]) { pos.push(v[0], v[1], v[2]); nrm.push(q.nx, 0, q.nz); uv.push(a, c); }
      b.graffiti = q;
    }
    if (!pos.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, graffitiAtlas().mat);
    m.receiveShadow = !LOW; m.renderOrder = 1; m.userData.graffiti = pos.length / 18;
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
    s.looks = subLooks(s);
    const group = new THREE.Group();
    const gm = groundMesh(s);
    if (gm) group.add(gm);
    const flat = new Geo(false, true), col = new THREE.Color();
    for (const a of s.areas.concat(s.water)) {
      const st = AREA[a.k] || AREA.grass;
      col.setHex(st[0]);
      flat.layer = st[3];
      flat.dpolygon(a.p, a.hs, groundAt, st[1] + 0.03, col, 2 * GS);
    }
    for (const r of s.roads) {
      const st = roadStyle(r.t), hw = r.w / 2, p = r.p, n = p.length / 2;
      const lift = st.y + 0.03 + (r.br ? 0.006 : 0), hf = r.deck || groundAt;
      const marking = MAJOR.has(r.t) || r.t === 'tertiary';
      const lk = n > 1 ? lookAt((p[0] + p[2 * n - 2]) / 2, (p[1] + p[2 * n - 1]) / 2) : null;  // the borough's look
      const bline = !marking && lk && r.t === 'residential' && hw >= 4;  // side streets get the borough's centre line too
      flat.layer = st.l; flat.fr = null;
      let run = 0;  // metres along the street so far: pavement slabs carry on from one segment to the next
      for (let i = 0; i < n - 1; i++) {
        const x1 = p[2 * i], z1 = p[2 * i + 1], x2 = p[2 * i + 2], z2 = p[2 * i + 3];
        const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz);
        if (L < 0.01) continue;
        const run0 = run; run += L;
        const nx = -dz / L * hw, nz = dx / L * hw, k = Math.max(1, Math.ceil(L / GS));
        for (let q = 0; q < k; q++) { // short pieces so the road follows the slope
          const ax = x1 + dx * q / k, az = z1 + dz * q / k, bx = x1 + dx * (q + 1) / k, bz = z1 + dz * (q + 1) / k;
          flat.dquad(ax + nx, az + nz, bx + nx, bz + nz, bx - nx, bz - nz, ax - nx, az - nz, hf, lift, st.col, hw > GS * 0.6 ? GS : 0);   // wide roads: split across too
        }
        if (marking || bline) dashes(flat, x1, z1, dx / L, dz / L, L, hf, lift + 0.012, lk);
        if (!LOW && !r.br && marking && hw > 3.2) { // solid white lines along the edges of bigger roads
          const ex = -dz / L, ez = dx / L;
          for (const sd of [1, -1]) {
            const o1 = (hw - 0.45) * sd, o2 = (hw - 0.6) * sd;
            for (let q = 0; q < k; q++) {
              const ax = x1 + dx * q / k, az = z1 + dz * q / k, bx = x1 + dx * (q + 1) / k, bz = z1 + dz * (q + 1) / k;
              flat.dquad(ax + ex * o1, az + ez * o1, bx + ex * o1, bz + ez * o1, bx + ex * o2, bz + ez * o2, ax + ex * o2, az + ez * o2, hf, lift + 0.012, edgeCol);
            }
          }
        }
        // pavements: a lighter strip with a kerb along every street with cars (not on bridges, not across other roads)
        if (!LOW && !r.br && CAR.has(r.t) && r.t !== 'service' && r.t !== 'track') {
          const ex = -dz / L, ez = dx / L, pw = r.t === 'residential' ? 2.0 : 2.6;
          flat.layer = TL.sidewalk;
          for (const sd of [1, -1]) {
            const oi = hw * sd, oo = (hw + pw) * sd, ok = (hw + 0.22) * sd;
            // slabs laid along the street, the first row starting at the kerb
            flat.fr = [x1, z1, dx / L, dz / L, ex * sd, ez * sd, run0, -hw];
            for (let q = 0; q < k; q++) {
              const t0 = q / k, t1 = (q + 1) / k, mx = x1 + dx * (t0 + t1) / 2 + ex * (hw + pw / 2) * sd, mz = z1 + dz * (t0 + t1) / 2 + ez * (hw + pw / 2) * sd;
              if (roadAt(mx, mz)) continue;  // another street crosses here: no pavement over it
              const ax = x1 + dx * t0, az = z1 + dz * t0, bx = x1 + dx * t1, bz = z1 + dz * t1;
              flat.dquad(ax + ex * ok, az + ez * ok, bx + ex * ok, bz + ez * ok, bx + ex * oo, bz + ez * oo, ax + ex * oo, az + ez * oo, groundAt, KERB_Y, lk ? lk.pc : paveCol);
              flat.dquad(ax + ex * oi, az + ez * oi, bx + ex * oi, bz + ez * oi, bx + ex * ok, bz + ez * ok, ax + ex * ok, az + ez * ok, groundAt, KERB_Y + 0.004, lk && Math.floor((run0 + L * (t0 + t1) / 2) / 2.5) % 2 ? lk.ac : kerbCol);
            }
          }
          flat.layer = st.l; flat.fr = null;
        }
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
    streetNames(s, group);
    const walls = new Geo(true), roofs = new Geo(false);
    const wc = new THREE.Color(), rc = new THREE.Color(), gray = new THREE.Color(0x8c8b88), hsl = {}, gfc = new THREE.Color(), shopfront = new THREE.Color(0x3b3344), ccol = new THREE.Color(), white = new THREE.Color(0xffffff);
    s.buildings.forEach((b, idx) => {
      buildingBase(b);
      const y0 = b.m > 0.5 ? b.base + b.m : b.lo - 0.4, top = b.base + b.h;
      wc.set(cssColor(b.c) || '#b0a490');
      wc.getHSL(hsl);
      if (hsl.l < 0.3 || hsl.l > 0.85) wc.setHSL(hsl.h, hsl.s, Math.min(0.85, Math.max(0.3, hsl.l)));
      wc.getHSL(hsl);
      wc.setHSL(hsl.h, Math.min(0.9, hsl.s * 1.25 + 0.04), hsl.l); // a little more colour than the map's: sticker-book streets
      const lk = lookAt(b.cx, b.cz);
      if (lk) wc.lerp(lk.wc, BORO_MIX * (0.75 + hash(idx + 11) * 0.5));  // the borough's colour runs through its streets
      wc.multiplyScalar(0.82 + hash(idx + Math.round(b.x0)) * 0.18);
      // the street floor is a darker band (shopfronts), when the building is tall enough to have one
      const gf = b.m <= 0.5 && b.h > 6.2 ? gfc.copy(wc).lerp(shopfront, 0.38) : null;
      const fst = facadeStyle(b, idx, wc);
      // street floor: shop windows where a shop is (or about one building in four on a shopping street), else plain windows
      walls.wv = [fst, Math.floor(hash(idx * 31 + Math.round(b.cx * 3 + b.cz * 7)) * 997), gf && (b.shop || hash(idx * 7 + 3) < 0.25) ? 1 : 0];
      for (const ring of b.rings) addWalls(walls, ring, y0, top, wc, b.base, gf);
      if (GFX && b.m <= 0.5) facadeExtras(roofs, b, idx, fst, top, walls.wv[2]);
      const rcs = cssColor(b.r);
      if (rcs) { rc.set(rcs); if (lk) rc.lerp(lk.rc[(idx & 1)], 0.6); } else { rc.copy(wc).lerp(gray, 0.55).multiplyScalar(0.85); if (lk) rc.lerp(lk.rc[(idx & 1)], 0.45); }
      if (!LOW && b.area > 40) { // ledges: a cornice under the roof line, a band above the shopfronts
        const lc = ccol.copy(wc).lerp(white, 0.42);
        if (!b.g && b.h >= 5) cornice(roofs, b.p, top + 0.12, lc, b.h > 20 ? 0.42 : 0.3, b.h > 20 ? 0.7 : 0.5);
        if (gf) cornice(roofs, b.p, b.base + FLOOR_H + 0.12, lc, 0.2, 0.24);
      }
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
    const gm2 = graffitiMesh(s);   // graffiti on about one building in ten
    if (gm2) group.add(gm2);
    // Trees, street furniture and parked cars are instanced per sub-tile. three r149 never culls an InstancedMesh, so
    // each one sits at the sub-tile's centre with a bounding sphere the size of the sub-tile (cullGeo): out of view, not drawn.
    const ccx = (s.x0 + s.x1) / 2, ccz = (s.z0 + s.z1) / 2, ccy = groundAt(ccx, ccz);
    const culled = im => { im.position.set(ccx, ccy, ccz); im.frustumCulled = true; group.add(im); return im; };
    // s.inst[kind] = the InstancedMeshes drawing that kind (instance i = item i of the kind's list), so smashing can hide
    // one (W.smash). Smashed things stay smashed while this world lives (the session), even when the sub-tile is rebuilt.
    s.inst = {};
    const keep = (kind, im) => { (s.inst[kind] || (s.inst[kind] = [])).push(im); return im; };
    const n = s.trees.length / 2;
    if (n) {
      const cnt = TREE.map(() => 0), fill = TREE.map(() => 0);
      for (let i = 0; i < n; i++) cnt[s.treeK[i] || 0]++;
      const pairOf = (T, k) => cnt[k] ? [new THREE.InstancedMesh(cullGeo(T.trunk), MAT.trunk, cnt[k]), new THREE.InstancedMesh(cullGeo(T.crown), MAT.crown, cnt[k])] : null;
      const ims = TREE.map(pairOf), los = TREE_LO ? TREE_LO.map(pairOf) : null;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const k = s.treeK[i] || 0, j = fill[k]++, sx = s.trees[2 * i], sz = s.trees[2 * i + 1], hh = Math.round(sx * 7 + sz * 13), size = 0.75 + hash(hh) * 0.6;
        e.set(0, hash(hh + 1) * 6.28, 0); q.setFromEuler(e); sc.set(size, size * (0.9 + hash(hh + 2) * 0.3), size);
        if (smashed.has(propKey('tree', sx, sz))) sc.set(0, 0, 0);
        v.set(sx - ccx, groundAt(sx, sz) - 0.1 - ccy, sz - ccz); m.compose(v, q, sc);
        ims[k][0].setMatrixAt(j, m); ims[k][1].setMatrixAt(j, m);
        if (los) { los[k][0].setMatrixAt(j, m); los[k][1].setMatrixAt(j, m); }
        const h3 = hash(hh + 3), h4 = hash(hh + 4), h5 = hash(hh + 5);
        if (LOW) c.setHSL(0.24 + h3 * 0.08, 0.45 + h4 * 0.2, 0.3 + h5 * 0.12);
        else if (k === 0 && hash(hh + 6) < 0.07) c.setHSL(0.02 + h3 * 0.07, 0.72, 0.5 + h5 * 0.06);    // the odd maple already turning red
        else if (k === 0) c.setHSL(0.23 + h3 * 0.08, 0.36 + h4 * 0.18, 0.38 + h5 * 0.1);
        else if (k === 1) c.setHSL(0.22 + h3 * 0.06, 0.38 + h4 * 0.14, 0.4 + h5 * 0.1);
        else if (k === 2) c.setHSL(0.36 + h3 * 0.06, 0.3 + h4 * 0.12, 0.3 + h5 * 0.08);
        else c.setHSL(0.17 + h3 * 0.06, 0.5 + h4 * 0.15, 0.52 + h5 * 0.1);
        const tc = k !== 2 && (lookAt(sx, sz) || {}).tree;  // boroughs: 7 in 10 leafy trees wear the borough's colour (spruces stay green)
        if (tc && hash(hh + 7) < 0.7) c.setHSL((tc[0] + (h3 - 0.5) * 0.05 + 1) % 1, tc[1] * (0.85 + h4 * 0.3), tc[2] * (0.88 + h5 * 0.24));
        ims[k][1].setColorAt(j, c); if (los) los[k][1].setColorAt(j, c);
      }
      ims.forEach((pair, k) => { if (pair) for (const im of pair) { im.castShadow = !LOW; im.userData.sp = k; if (los) im.userData.lod = 'hi'; keep('tree', culled(im)); } });
      if (los) los.forEach((pair, k) => { if (pair) for (const im of pair) { im.castShadow = true; im.userData.sp = k; im.userData.lod = 'lo'; keep('tree', culled(im)); } });
    }
    const bl = s.bushes || [];
    if (BUSH && bl.length) { // bushes: not smashable, so not kept per kind
      const byK = [[], [], []];
      for (let i = 0; i < bl.length; i += 4) byK[bl[i + 2]].push(i);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
      byK.forEach((list, k) => {
        if (!list.length) return;
        const im = new THREE.InstancedMesh(cullGeo(BUSH[k]), MAT.crown, list.length), fl = k === 1 ? new THREE.InstancedMesh(cullGeo(FLOWERS), MAT.prop, list.length) : null;
        list.forEach((i, j) => {
          const x = bl[i], z = bl[i + 1], hh = Math.round(x * 11 + z * 5), size = k === 2 ? 1 : 0.75 + hash(hh) * 0.55;
          e.set(0, bl[i + 3], 0); q.setFromEuler(e); sc.set(size, size * (0.85 + hash(hh + 1) * 0.3), size);
          v.set(x - ccx, groundAt(x, z) - 0.05 - ccy, z - ccz); m.compose(v, q, sc);
          im.setMatrixAt(j, m); if (fl) fl.setMatrixAt(j, m);
          if (k === 2) c.setHSL(0.3, 0.45, 0.36); else c.setHSL(0.22 + hash(hh + 2) * 0.1, 0.4 + hash(hh + 3) * 0.2, 0.4 + hash(hh + 4) * 0.1);
          im.setColorAt(j, c);
        });
        im.castShadow = true; im.userData.lod = 'hi'; culled(im);
        if (fl) { fl.userData.lod = 'hi'; culled(fl); }
      });
    }
    const pr = s.props || {};
    const inst = (kind, geo, mat, list, stride, shadow) => {
      const cnt = list.length / stride;
      if (!cnt) return null;
      const im = new THREE.InstancedMesh(cullGeo(geo), mat, cnt), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
      for (let i = 0; i < cnt; i++) {
        const x = list[i * stride], z = list[i * stride + 1], yaw = list[i * stride + 2], st = smashed.get(propKey(kind, x, z));
        let pitch = 0, roll = 0, sink = 0;
        if (stride === 4) { const fx = -Math.sin(yaw), fz = -Math.cos(yaw); pitch = Math.atan((groundAt(x + fx * 1.6, z + fz * 1.6) - groundAt(x - fx * 1.6, z - fz * 1.6)) / 3.2); c.setHex(st === 'wreck' ? WRECK_COL : list[i * stride + 3]); im.setColorAt(i, c); }
        if (st === 'wreck') { roll = 0.12; sink = -0.18; }
        e.set(pitch, yaw, roll); q.setFromEuler(e); v.set(x - ccx, groundAt(x, z) - ccy + sink, z - ccz); m.compose(v, q, st && st !== 'wreck' ? ZERO3 : one);
        im.setMatrixAt(i, m);
      }
      im.castShadow = !!shadow && !LOW; im.receiveShadow = false;
      return keep(kind, culled(im));
    };
    for (const kind of ['lamp', 'bench', 'hydrant', 'bin', 'box']) if (pr[kind]) inst(kind, PROP[kind], MAT.prop, pr[kind], 3, true);
    if (pr.lamp) {
      inst('lamp', PROP.bulb, MAT.bulb, pr.lamp, 3, false);
      const pool = inst('lamp', PROP.pool, MAT.pool, pr.lamp, 3, false); if (pool) pool.renderOrder = 2;
      if (!LOW) { const halo = inst('lamp', PROP.halo, MAT.halo, pr.lamp, 3, false); if (halo) halo.renderOrder = 3; }
      // borough banners: one per lamp (instance i = lamp i, so smashing a lamp hides its banner), in the borough's two colours
      const ban = inst('lamp', PROP.banner, MAT.tint, pr.lamp, 3, false);
      if (ban) {
        const c = new THREE.Color(), BRAND = new THREE.Color(0x6b4eff);
        for (let i = 0; i < pr.lamp.length / 3; i++) {
          const lk = lookAt(pr.lamp[i * 3], pr.lamp[i * 3 + 1]);
          c.copy(lk ? (i & 1 ? lk.bc : lk.ac) : (i & 1 ? white : BRAND)); ban.setColorAt(i, c);
        }
      }
    }
    for (let v = 0; v < 3; v++) if (pr['car' + v]) {
      const im = inst('car', PROP.car[v], MAT.tint, pr['car' + v], 4, true); if (im) { im.userData.sp = v; if (!LOW) im.userData.lod = 'hi'; }
      const lo = !LOW && inst('car', PROP.carLo[v], MAT.tint, pr['car' + v], 4, true); if (lo) { lo.userData.sp = v; lo.userData.lod = 'lo'; }
    }
    if (pr.van) { const im = inst('van', PROP.van, MAT.tint, pr.van, 4, true); if (im && !LOW) { im.userData.lod = 'hi'; const lo = inst('van', PROP.vanLo, MAT.tint, pr.van, 4, true); if (lo) lo.userData.lod = 'lo'; } }
    // the decor layer (layDecor): x, z, yaw, tint, scale per instance; smashed ones are drawn at scale 0
    const dc = s.decor || {}, dm = new THREE.Matrix4(), dq = new THREE.Quaternion(), de = new THREE.Euler(), dv = new THREE.Vector3(), ds = new THREE.Vector3(), dcol = new THREE.Color();
    const decorInst = (kind, geo, mat, list, tinted) => {
      const cnt = list.length / 5;
      const im = new THREE.InstancedMesh(cullGeo(geo), mat, cnt), flag = kind === 'flag', water = kind === 'floatduck' || kind === 'floatring';
      for (let i = 0; i < cnt; i++) {
        const x = list[i * 5], z = list[i * 5 + 1], sc = list[i * 5 + 4], st = DECOR_HP[kind] && smashed.get(propKey(kind, x, z));
        de.set(0, list[i * 5 + 2], 0); dq.setFromEuler(de);
        dv.set(x - ccx, groundAt(x, z) - ccy + (flag ? sc : water ? 0.1 : 0), z - ccz);
        if (st) ds.set(0, 0, 0); else if (flag) ds.set(1, 1, 1); else ds.set(sc, sc, sc);
        dm.compose(dv, dq, ds); im.setMatrixAt(i, dm);
        if (tinted) im.setColorAt(i, dcol.setHex(list[i * 5 + 3]));
      }
      im.castShadow = !LOW && !flag && !kind.startsWith('chalk'); im.receiveShadow = false;
      if (DECOR_HI.has(kind) && !LOW) im.userData.lod = 'hi';
      culled(im);
      if (DECOR_HP[kind]) keep(kind, im);
      return im;
    };
    for (const k of DECOR_KINDS) {
      const list = dc[k];
      if (!list || !list.length) continue;
      const d = DECOR[k];
      if (d.a) decorInst(k, d.a, MAT.tint, list, true);
      if (d.b) decorInst(k, d.b, MAT.decor, list, false);
      if (d.glow) decorInst(k, d.glow, MAT.dglow, list, false);
    }
    s.near = null;
    worldGroup.add(group);
    s.group = group;
    lodSub(s);
    if (!s.canvas) s.canvas = drawSubMap(s);
  }
  // Shows a sub-tile's full models (lod 'hi') near you, its stand-ins (lod 'lo') further away. Hysteresis: 20 m.
  function lodSub(s) {
    if (LOW || !s.group) return;
    const d = rectDist(s, player.pos.x, player.pos.z), near = s.near ? d < LOD_R + 20 : d < LOD_R;
    if (near === s.near) return;
    s.near = near;
    for (const o of s.group.children) if (o.userData.lod) o.visible = (o.userData.lod === 'hi') === near;
  }
  let lodT = 0;
  function updateLod(dt) { lodT -= dt; if (lodT > 0) return; lodT = 0.4; for (const s of allSubs) lodSub(s); }
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
      if (gcol && LOW) {
        geo.vert(x1, y0, z1, nx, 0, nz, gcol, u0, v0); geo.vert(x2, y0, z2, nx, 0, nz, gcol, u1, v0); geo.vert(x2, ys, z2, nx, 0, nz, gcol, u1, vs);
        geo.vert(x1, y0, z1, nx, 0, nz, gcol, u0, v0); geo.vert(x2, ys, z2, nx, 0, nz, gcol, u1, vs); geo.vert(x1, ys, z1, nx, 0, nz, gcol, u0, vs);
      }
      if (LOW) {
        geo.vert(x1, ys, z1, nx, 0, nz, col, u0, vs); geo.vert(x2, ys, z2, nx, 0, nz, col, u1, vs); geo.vert(x2, y1, z2, nx, 0, nz, col, u1, v1);
        geo.vert(x1, ys, z1, nx, 0, nz, col, u0, vs); geo.vert(x2, y1, z2, nx, 0, nz, col, u1, v1); geo.vert(x1, y1, z1, nx, 0, nz, col, u0, v1);
        continue;
      }
      // high quality: the wall darkens towards the street (soft contact shadow, like ambient occlusion), in two bands so a
      // tall wall keeps the gradient near the ground. The shopfront band gets it too.
      const ym = Math.min(y1, ys + 7), vm = (ym - base) / FLOOR_H / 4, cLo = aoA.copy(col).multiplyScalar(gcol ? 0.86 : 0.7);
      if (gcol) {
        aoC.copy(gcol).multiplyScalar(0.72);
        geo.vert(x1, y0, z1, nx, 0, nz, aoC, u0, v0); geo.vert(x2, y0, z2, nx, 0, nz, aoC, u1, v0); geo.vert(x2, ys, z2, nx, 0, nz, gcol, u1, vs);
        geo.vert(x1, y0, z1, nx, 0, nz, aoC, u0, v0); geo.vert(x2, ys, z2, nx, 0, nz, gcol, u1, vs); geo.vert(x1, ys, z1, nx, 0, nz, gcol, u0, vs);
      }
      geo.vert(x1, ys, z1, nx, 0, nz, cLo, u0, vs); geo.vert(x2, ys, z2, nx, 0, nz, cLo, u1, vs); geo.vert(x2, ym, z2, nx, 0, nz, col, u1, vm);
      geo.vert(x1, ys, z1, nx, 0, nz, cLo, u0, vs); geo.vert(x2, ym, z2, nx, 0, nz, col, u1, vm); geo.vert(x1, ym, z1, nx, 0, nz, col, u0, vm);
      if (ym < y1 - 0.01) {
        geo.vert(x1, ym, z1, nx, 0, nz, col, u0, vm); geo.vert(x2, ym, z2, nx, 0, nz, col, u1, vm); geo.vert(x2, y1, z2, nx, 0, nz, col, u1, v1);
        geo.vert(x1, ym, z1, nx, 0, nz, col, u0, vm); geo.vert(x2, y1, z2, nx, 0, nz, col, u1, v1); geo.vert(x1, y1, z1, nx, 0, nz, col, u0, v1);
      }
    }
  }
  const aoA = new THREE.Color(), aoC = new THREE.Color(), corA = new THREE.Color();
  // Facade style for cft-gfx (high quality): 0 red brick, 1 buff brick, 2 stucco, 3 concrete panels, 4 lap siding,
  // 5 greystone, 6 glass curtain wall. Towers get glass or concrete, houses siding or brick, the rest follows the colour.
  const fsHSL = {};
  function facadeStyle(b, idx, wc) {
    const r = hash(idx * 13 + Math.round(b.cx + b.cz * 3));
    wc.getHSL(fsHSL);
    if (b.h > 28) return r < 0.55 ? 6 : 3;
    if (b.h > 16 && r < 0.25) return r < 0.12 ? 6 : 3;
    if (b.g) return r < 0.45 ? 4 : fsHSL.h < 0.07 || fsHSL.h > 0.94 ? 0 : 1;
    const warm = fsHSL.h < 0.08 || fsHSL.h > 0.93;
    if (fsHSL.s < 0.14) return r < 0.5 ? 5 : r < 0.75 ? 3 : 2;
    if (warm && fsHSL.s > 0.25) return r < 0.8 ? 0 : 5;
    if (fsHSL.h < 0.17) return r < 0.5 ? 1 : r < 0.7 ? 0 : 2;
    return r < 0.55 ? 2 : r < 0.8 ? 1 : 4;
  }
  // A ledge around a building at height y (a roof cornice, or the line above the shopfronts): sticks out o metres, h tall.
  // Goes in the roofs geometry (plain colours, no window texture). High quality only.
  function cornice(geo, p, y, col, o, h) {
    const n = p.length / 2, yb = y - h;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x1 = p[2 * i], z1 = p[2 * i + 1], x2 = p[2 * j], z2 = p[2 * j + 1];
      const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz);
      if (L < 0.6) continue;
      const nx = -dz / L, nz = dx / L, ox = nx * o, oz = nz * o, ex = dx / L * o, ez = dz / L * o;  // stretched along the edge so the corners close
      const ax = x1 + ox - ex, az = z1 + oz - ez, bx = x2 + ox + ex, bz = z2 + oz + ez;
      geo.vert(ax, yb, az, nx, 0, nz, col); geo.vert(bx, yb, bz, nx, 0, nz, col); geo.vert(bx, y, bz, nx, 0, nz, col);
      geo.vert(ax, yb, az, nx, 0, nz, col); geo.vert(bx, y, bz, nx, 0, nz, col); geo.vert(ax, y, az, nx, 0, nz, col);
      geo.quadFlat(x1, z1, x2, z2, bx, bz, ax, az, y, col);
      corA.copy(col).multiplyScalar(0.6);
      geo.flat(x1, z1, x2, z2, bx, bz, yb, corA, true); geo.flat(x1, z1, bx, bz, ax, az, yb, corA, true);
    }
  }
  // A box turned to a wall: centre (cx, cz), u = unit vector along the wall, n = out of it; hl / hd half length / depth.
  function obox(geo, cx, cz, y0, y1, ux, uz, hl, hd, col) {
    const nx = -uz, nz = ux;
    const c = [[-hl, -hd], [hl, -hd], [hl, hd], [-hl, hd]].map(q => [cx + ux * q[0] + nx * q[1], cz + uz * q[0] + nz * q[1]]);
    const nrm = [[-nx, -nz], [ux, uz], [nx, nz], [-ux, -uz]];
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4], [fx, fz] = nrm[i];
      geo.vert(a[0], y0, a[1], fx, 0, fz, col, 0, 0); geo.vert(b[0], y1, b[1], fx, 0, fz, col, 0, 0); geo.vert(b[0], y0, b[1], fx, 0, fz, col, 0, 0);
      geo.vert(a[0], y0, a[1], fx, 0, fz, col, 0, 0); geo.vert(a[0], y1, a[1], fx, 0, fz, col, 0, 0); geo.vert(b[0], y1, b[1], fx, 0, fz, col, 0, 0);
    }
    geo.quadFlat(c[0][0], c[0][1], c[1][0], c[1][1], c[2][0], c[2][1], c[3][0], c[3][1], y1, col);
    geo.flat(c[0][0], c[0][1], c[1][0], c[1][1], c[2][0], c[2][1], y0, col, true); geo.flat(c[0][0], c[0][1], c[2][0], c[2][1], c[3][0], c[3][1], y0, col, true);
  }
  // Is some other building's footprint at (x, z)? (party walls: no balconies into the neighbours)
  function builtAt(x, z, not) {
    const list = buckets.get(bkey(x, z));
    if (list) for (const b of list) if (b !== not && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && inRings(b.rings, x, z)) return true;
    return false;
  }
  // Facade extras (high quality, 2026-11-19): balconies with iron railings and, on some, a Montreal-style outdoor staircase
  // down to the street; window air conditioners; chimneys on pitched roofs. Only on walls that face a street and have no
  // neighbour against them. Drawn in the roofs geometry (cft-gfx roof material: weathered paint on the sides).
  const BAL_SLAB = new THREE.Color(0x9c978d), BAL_IRON = [new THREE.Color(0x24262b), new THREE.Color(0xe9e6df), new THREE.Color(0x2f5d4a)], AC_COL = new THREE.Color(0xd9d8d2), AC_DARK = new THREE.Color(0x5d6066), CHIM = new THREE.Color(0x8a4a38);
  function facadeExtras(geo, b, idx, st, top, shopBand) {
    const r0 = hash(idx * 17 + Math.round(b.cx * 5 + b.cz)), floors = Math.floor((b.h + 0.4) / FLOOR_H);
    if (b.g && b.area > 30) {   // a chimney near the ridge
      const cx = b.cx + (hash(idx + 5) - 0.5) * (b.x1 - b.x0) * 0.3, cz = b.cz + (hash(idx + 6) - 0.5) * (b.z1 - b.z0) * 0.3;
      if (inRings(b.rings, cx, cz)) { gbox(geo, cx, cz, top, top + b.g + 0.9, 0.32, 0.32, CHIM); gbox(geo, cx, cz, top + b.g + 0.9, top + b.g + 1.05, 0.38, 0.38, AC_DARK); }
    }
    if (st === 3 || st === 6 || floors < 2 || b.h > 24) return;
    const balconies = r0 < 0.42, stairs = balconies && r0 < 0.2 && floors <= 4 && !shopBand, ac = !balconies && r0 > 0.7;
    if (!balconies && !ac) return;
    const iron = BAL_IRON[Math.floor(hash(idx + 9) * 3)];
    const ring = b.rings[0], n = ring.length / 2;
    let stairsDone = false;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, x1 = ring[2 * i], z1 = ring[2 * i + 1], x2 = ring[2 * j], z2 = ring[2 * j + 1];
      const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz);
      if (L < 4.5) continue;
      const ux = dx / L, uz = dz / L, nx = -uz, nz = ux, mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
      if (builtAt(mx + nx * 1.5, mz + nz * 1.5, b)) continue;
      let street = false;
      for (const k of [3, 6, 9]) if (roadAt(mx + nx * k, mz + nz * k)) { street = true; break; }
      if (!street) continue;
      const bays = Math.max(1, Math.round(L / WIN_W)), cw = L / bays;
      for (let q = 0; q < bays; q++) {
        const along = (q + 0.5) * cw, bx = x1 + ux * along, bz = z1 + uz * along;
        for (let f = 1; f < floors; f++) {
          const y = b.base + f * FLOOR_H;
          if (balconies) {
            if ((q + (r0 * 10 | 0)) % 2 && bays > 2) continue;   // every other bay on wide walls
            const hl = cw * 0.42, d = 1.05, cx = bx + nx * d / 2, cz = bz + nz * d / 2;
            obox(geo, cx, cz, y - 0.12, y, ux, uz, hl, d / 2, BAL_SLAB);                                         // slab
            obox(geo, cx + nx * (d / 2 - 0.03), cz + nz * (d / 2 - 0.03), y + 0.9, y + 0.96, ux, uz, hl, 0.03, iron);  // hand rail
            obox(geo, cx + nx * (d / 2 - 0.03), cz + nz * (d / 2 - 0.03), y + 0.08, y + 0.13, ux, uz, hl, 0.025, iron);
            for (let k = 0; k <= 6; k++) { const o = -hl + k * hl / 3; obox(geo, cx + ux * o + nx * (d / 2 - 0.03), cz + uz * o + nz * (d / 2 - 0.03), y, y + 0.92, ux, uz, 0.018, 0.018, iron); }
            for (const sd of [-1, 1]) obox(geo, cx + ux * hl * sd, cz + uz * hl * sd, y + 0.9, y + 0.96, ux, uz, 0.03, d / 2, iron);
            // the outdoor staircase: from the first balcony down to the pavement, along the wall
            if (stairs && !stairsDone && f === 1 && q === 0 && L > 7) {
              stairsDone = true;
              const steps = 14, rise = (y - b.base) / steps, run = 0.27, sw = 0.5;
              for (let k = 0; k < steps; k++) {
                const a = along - hl - 0.15 - (k + 0.5) * run;   // walks away from the balcony along the wall, going down
                if (a < 0.3) break;
                const sx = x1 + ux * a + nx * (d - sw), sz = z1 + uz * a + nz * (d - sw), ty = y - (k + 1) * rise;
                obox(geo, sx, sz, ty - 0.05, ty, ux, uz, run / 2 + 0.01, sw, iron);
                if (k % 2 === 0) obox(geo, sx + nx * sw, sz + nz * sw, ty, ty + 0.95, ux, uz, 0.018, 0.018, iron);
              }
            }
          } else if (ac && hash(idx * 3 + q * 7 + f * 13) < 0.22) {
            const cx = bx + nx * 0.27, cz = bz + nz * 0.27;
            obox(geo, cx, cz, y + 0.42, y + 0.84, ux, uz, 0.32, 0.27, AC_COL);
            obox(geo, cx + nx * 0.27, cz + nz * 0.27, y + 0.48, y + 0.78, ux, uz, 0.25, 0.006, AC_DARK);   // the grille
          }
        }
      }
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
    if (LOW || b.area < 110 || b.h < 6) return;
    const sx = (b.x1 - b.x0) * 0.3, sz = (b.z1 - b.z0) * 0.3, n = Math.min(GFX ? 7 : 4, 1 + Math.floor(b.area / (GFX ? 220 : 500)));
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
  // 2026-11-17 graphics pass: road edge lines, pavements and their kerb strip (KERB_Y = height above the ground: just above
  // the road surface, so people's feet don't sink into it)
  const edgeCol = new THREE.Color(0xeeeee6), paveCol = new THREE.Color(0xd8ccb6), kerbCol = new THREE.Color(0xeee6d6), KERB_Y = 0.13;
  // Centre lines. The borough's look picks the colour and pattern (dash 3 m every 9 m, long 6 every 9, dots 0.6 every 2.4,
  // double = two solid lines), so each borough's streets read differently at a glance.
  const DASH = { dash: [3, 9, 0.09], long: [6, 9, 0.11], dots: [0.6, 2.4, 0.16], double: [0, 0, 0.07] };
  // ---------------------------------------------------------------- street names on the road (2026-11-20)
  // The street's name lies on the road like a carpet: yellow letters with a black outline, the capitals half the street
  // wide, running along it and following its bends and hills. One label per NAME_GAP metres of a street, only where the
  // street bends gently over the label's length. Each name is one canvas texture (cached, the oldest dropped past NAME_MAX).
  const NAME_GAP = 160, NAME_MAX = 160, NAME_H = 128, NAME_CAP = 0.56, nameMats = new Map();
  const nameTint = new THREE.Color(1, 1, 1);  // shared by every name's material, set by the time of day
  const nameSpots = W.nameSpots = [];  // where labels lie (tests, debug)
  function nameMat(name) {
    let m = nameMats.get(name);
    if (m) { nameMats.delete(name); nameMats.set(name, m); return m; }
    const c = document.createElement('canvas'), g = c.getContext('2d');
    const font = '900 ' + Math.round(NAME_H * 0.78) + 'px "Arial Rounded MT Bold", "Arial Black", "Trebuchet MS", system-ui, sans-serif';
    g.font = font;
    const tw = Math.ceil(g.measureText(name).width) + 40;
    c.width = Math.min(2048, tw); c.height = NAME_H;
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.setTransform(Math.min(1, c.width / tw), 0, 0, 1, c.width / 2, NAME_H / 2 + 5);
    g.lineWidth = 16; g.strokeStyle = '#111'; g.strokeText(name, 0, 0);
    g.fillStyle = '#ffd21f'; g.fillText(name, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = Math.min(LOW ? 2 : 8, renderer.capabilities.getMaxAnisotropy());
    // unlit paint, dimmed by W.setClock (nameTint): a lit material came out nearly black under the high-quality lighting
    m = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, alphaTest: 0.5, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 });
    // turned round on the GPU when the camera looks at it from the other side, so it never reads upside down
    m.onBeforeCompile = sh => {
      sh.vertexShader = 'attribute vec2 lup;\n' + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
	vec3 camBack = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
	if (dot(-camBack.xz, lup) < 0.0) vUv = vec2(1.0) - vUv;`);
    };
    m.customProgramCacheKey = () => 'cft-street-name';
    m.color = nameTint;
    m.userData.aspect = c.width / NAME_H;
    nameMats.set(name, m);
    if (nameMats.size > NAME_MAX) { const [k, old] = nameMats.entries().next().value; nameMats.delete(k); old.map.dispose(); old.dispose(); }
    return m;
  }
  function streetNames(s, group) {
    if (!s.names || !s.names.length) return;
    const placed = [];  // [name, x, z] so two pieces of one street don't both get a label close together
    for (const nm of s.names) {
      const p = nm.p, n = p.length / 2;
      if (n < 2) continue;
      const cum = [0];
      for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]));
      const total = cum[n - 1];
      const at = d => { // point + direction d metres along the line
        d = Math.max(0, Math.min(total, d));
        let i = 1; while (i < n - 1 && cum[i] < d) i++;
        const L = cum[i] - cum[i - 1] || 1, t = (d - cum[i - 1]) / L;
        const dx = p[2 * i] - p[2 * i - 2], dz = p[2 * i + 1] - p[2 * i - 1];
        return [p[2 * i - 2] + dx * t, p[2 * i - 1] + dz * t, dx / L, dz / L];
      };
      const mid = at(total / 2), road = nearestRoad(s, mid[0], mid[1]);
      if (!road || !CAR.has(road.t) || road.t === 'track' || road.w < 4) continue;
      const mat = nameMat(nm.n), Q = road.w / 2 / NAME_CAP, len = Q * mat.userData.aspect;
      if (len + 4 > total) continue;
      const count = Math.max(1, Math.floor(total / NAME_GAP));
      for (let c = 0; c < count; c++) {
        const cMid = total * (c + 0.5) / count, s0 = cMid - len / 2, s1 = cMid + len / 2;
        // only where the street bends gently under the label
        const a0 = at(s0), a1 = at(s1), am = at(cMid);
        if (a0[2] * am[2] + a0[3] * am[3] < 0.94 || a1[2] * am[2] + a1[3] * am[3] < 0.94) continue;
        if (placed.some(q => q[0] === nm.n && Math.hypot(q[1] - am[0], q[2] - am[1]) < NAME_GAP * 0.7)) continue;
        const r = nearestRoad(s, am[0], am[1]);
        if (!r || !CAR.has(r.t)) continue;
        placed.push([nm.n, am[0], am[1]]);
        nameSpots.push({ n: nm.n, x: am[0], z: am[1], ux: am[2], uz: am[3] }); if (nameSpots.length > 400) nameSpots.shift();
        const flip = am[2] < 0;  // read left to right on the map
        const hf = r.deck || groundAt, lift = roadStyle(r.t).y + 0.06;
        const steps = Math.max(2, Math.ceil(len / 1.5)), pos = [], uv = [], idx = [], up = [], ugx = flip ? -am[3] : am[3], ugz = flip ? am[2] : -am[2];
        for (let j = 0; j <= steps; j++) {
          const d = s0 + len * j / steps, a = at(d), b = at(d - 1.2), e = at(d + 1.2);
          let ux = e[0] - b[0], uz = e[1] - b[1]; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;
          if (flip) { ux = -ux; uz = -uz; }
          const nx = uz * Q / 2, nz = -ux * Q / 2, u = flip ? 1 - j / steps : j / steps;
          for (const [sx, v] of [[1, 1], [-1, 0]]) {
            const x = a[0] + nx * sx, z = a[1] + nz * sx;
            pos.push(x, (hf === groundAt ? groundFace(x, z) : hf(x, z)) + lift, z); uv.push(u, v); up.push(ugx, ugz);
          }
          if (j) { const k = 2 * j; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setAttribute('lup', new THREE.Float32BufferAttribute(up, 2));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
        geo.setIndex(idx); geo.computeBoundingSphere();
        const m = new THREE.Mesh(geo, mat);
        m.receiveShadow = true; m.renderOrder = 2; m.raycast = () => {};
        group.add(m);
      }
    }
  }
  function nearestRoad(s, x, z) { // the sub-tile's road closest to (x, z), within its half width + 2 m
    let best = null, bd = Infinity;
    for (const r of s.roads) {
      const p = r.p;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const dx = p[i + 2] - p[i], dz = p[i + 3] - p[i + 1], L = dx * dx + dz * dz;
        let t = L > 0 ? ((x - p[i]) * dx + (z - p[i + 1]) * dz) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(x - p[i] - t * dx, z - p[i + 1] - t * dz) - r.w / 2;
        if (d < bd) { bd = d; best = r; }
      }
    }
    return bd < 2 ? best : null;
  }
  function dashes(geo, x, z, ux, uz, L, hf, lift, lk) {
    const [len, step, hw] = DASH[lk ? lk.dash : 'dash'], col = lk ? lk.lc : dashCol;
    const line = (off, a, b) => {
      const nx = -uz * hw, nz = ux * hw, ox = -uz * off, oz = ux * off;
      const ax = x + ux * a + ox, az = z + uz * a + oz, bx = x + ux * b + ox, bz = z + uz * b + oz;
      geo.dquad(ax + nx, az + nz, bx + nx, bz + nz, bx - nx, bz - nz, ax - nx, az - nz, hf, lift, col);
    };
    if (!len) { for (let s = 0; s < L; s += GS) { const e = Math.min(L, s + GS); line(0.16, s, e); line(-0.16, s, e); } return; }
    for (let s = 2; s + len < L; s += step) line(0, s, s + len);
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
    g.lineWidth = 1;
    for (const b of s.buildings) { // buildings take their borough's colour on the maps too
      if (b.m >= 2.5) continue;
      const lk = lookAt(b.cx, b.cz);
      g.fillStyle = lk ? lk.map : '#cbc3b4'; g.strokeStyle = lk ? lk.mapLine : '#b3a998';
      g.beginPath(); for (const r of b.rings) path(r, true); g.fill('evenodd'); g.stroke();
    }
    return c;
  }

  // ---------------------------------------------------------------- queries
  // footY (the campaign update, 2026-11-18: "everything jumpable"): feet above a building's roof walk over it, not into it
  function collide(pos, R, footY) {
    R = R || ride.radius;
    let hit = false;
    for (let it = 0; it < 3; it++) {
      const list = buckets.get(bkey(pos.x, pos.z));
      if (!list) return hit;
      let moved = false;
      for (const b of list) {
        if (pos.x < b.x0 - R || pos.x > b.x1 + R || pos.z < b.z0 - R || pos.z > b.z1 + R) continue;
        if (footY != null && b.base != null && footY > roofTop(b, pos.x, pos.z) - 0.45) continue;
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
  // The roof height of the building at (x, z), or null (open ground / not built yet). Roofs are walkable (campaign update).
  // Gabled roofs (houses, b.g = the rise) follow their slope (2026-11-19, the user: "some angled roofs you can't walk on,
  // they have no tangibleness"): before, they counted as flat at the eaves, so you sank into the slope.
  function gableRise(b, x, z) {
    const p = b.p, P = i => [p[2 * (i % 4)], p[2 * (i % 4) + 1]];
    const s = Math.hypot(p[2] - p[0], p[3] - p[1]) >= Math.hypot(p[4] - p[2], p[5] - p[3]) ? 0 : 1;   // the same choice as gable()
    const A = P(s), B = P(s + 1), C = P(s + 2), D = P(s + 3);
    const m1x = (D[0] + A[0]) / 2, m1z = (D[1] + A[1]) / 2, m2x = (B[0] + C[0]) / 2, m2z = (B[1] + C[1]) / 2;
    const ux = m2x - m1x, uz = m2z - m1z, L = Math.hypot(ux, uz) || 1;
    const across = q => Math.abs(((q[0] - m1x) * uz - (q[1] - m1z) * ux) / L);   // distance from the ridge line
    const half = Math.max(0.5, (across(A) + across(D)) / 2);
    return b.g * Math.max(0, 1 - across([x, z]) / half);
  }
  function roofTop(b, x, z) { return b.base + b.h + (b.g && b.p.length === 8 ? gableRise(b, x, z) : 0); }
  W.roofTop = roofTop;
  function roofAt(x, z) {
    const list = buckets.get(bkey(x, z));
    if (!list) return null;
    for (const b of list) {
      if (b.base == null || x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      if (inRings(b.rings, x, z)) return roofTop(b, x, z);
    }
    return null;
  }
  W.roofAt = roofAt;
  // registered sub-tiles (buildings, roads) within r of (x, z): the campaign's secret finder reads their footprints
  W.subsNear = (x, z, r) => allSubs.filter(s => s.reg && s.buildings && rectDist(s, x, z) < r);
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
  // Who looks like a child (small: height under KID_H). Kids are never flirted with or flirt (W.isKid / ped.type 'kid').
  const KID_H = 0.78;
  W.isKid = (look, type) => type === 'kid' || !!(look && (look.h || 1) < KID_H);
  W.randomLook = function (seed) {
    const r = i => hash(seed * 31 + i);
    const pick = (a, i) => a[Math.floor(r(i) * a.length) % a.length];
    return { skin: pick(SKINS, 1), hair: pick(HAIRS, 2), shirt: pick(CLOTH, 3), pants: pick(PANTS, 4), shoe: pick(SHOES, 5),
      long: r(6) < 0.4, dress: r(7) < 0.15, hat: r(8) < 0.12 ? pick(CLOTH, 9) : null, bag: r(10) < 0.25 ? pick(CLOTH, 11) : null, h: 0.92 + r(12) * 0.16,
      hs: Math.floor(r(13) * 24), sleeve: r(14) < 0.45 ? 'short' : 'long', shorts: r(15) < 0.14, glasses: r(16) < 0.14, beard: r(17) < 0.1 && r(6) >= 0.4,
      stripes: r(18) < 0.16 ? pick(CLOTH, 19) : null, logo: r(20) < 0.2 ? pick(CLOTH, 21) : null, phones: r(22) < 0.07 ? pick(CLOTH, 23) : null,
      build: 0.92 + r(24) * 0.2, scarf: r(25) < 0.06 ? pick(CLOTH, 26) : null, collar: r(27) < 0.2,
      fig: Math.min(1, Math.max(0, r(28) * 0.45 + (r(7) < 0.15 ? 0.5 : 0) + (r(6) < 0.4 ? 0.25 : 0) - (r(17) < 0.1 ? 0.3 : 0))),
      tuck: r(30) < 0.5, silly: r(31) < 0.09 ? W.SILLY[Math.floor(r(32) * W.SILLY.length) % W.SILLY.length] : null };
  };
  const ARM_Z = 0.11;  // arms hang a little away from the body
  // The shapes people are made of (smooth-shaded). Three levels of roundness: you and the story's cast get the smoothest, the
  // dozens of passers-by a lighter one, one step down each on low quality.
  // Realism pass (2026-11-17, user: "more realistic... but keep the silliness"): about six and a half heads tall (a little
  // cartoon left in the head and the eyes), a shaped torso (torsoGeo: chest, waist, hips from look.fig and look.build, a belly
  // for big builds), lathe-turned limbs (LIMB: thighs, calves, deltoids, forearms), hands with a thumb, shoes with soles and
  // toe caps, a face with lids, irises, a real nose and lips. The silliness stays in the walk and in look.silly (SILLY).
  const LIMB = {
    thigh: [[0, -1.04], [0.5, -1.02], [0.64, -0.94], [0.68, -0.8], [0.76, -0.55], [0.88, -0.3], [0.98, -0.1], [0.95, 0.02], [0.62, 0.1], [0, 0.13]],
    shin: [[0, -1.03], [0.55, -1.01], [0.6, -0.92], [0.6, -0.78], [0.72, -0.55], [0.95, -0.3], [0.98, -0.16], [0.86, 0], [0.55, 0.08], [0, 0.1]],
    upper: [[0, -1.05], [0.6, -1.02], [0.8, -0.92], [0.84, -0.7], [0.9, -0.4], [0.98, -0.15], [0.92, 0.02], [0.6, 0.12], [0, 0.16]],
    fore: [[0, -1.03], [0.62, -1.0], [0.7, -0.9], [0.74, -0.6], [0.9, -0.3], [0.97, -0.1], [0.86, 0.02], [0, 0.08]],
    sleeve: [[0.86, -0.55], [1.04, -0.52], [1.06, -0.3], [1.02, -0.06], [0.94, 0.05], [0.62, 0.16], [0, 0.19]],  // a short sleeve / shorts leg over a limb (scaled by the limb's full length)
  };
  const prims = (su, sv, mu, mv, cs, cr, du, dv, rr, ln) => {
    const o = { sph: new THREE.SphereGeometry(0.5, su, sv).toNonIndexed(), sm: new THREE.SphereGeometry(0.5, mu, mv).toNonIndexed(),
      cap: new THREE.CapsuleGeometry(0.5, 1, cs, cr).toNonIndexed(),                                  // 2 tall, 1 wide
      dome: new THREE.SphereGeometry(0.5, du, dv, 0, Math.PI * 2, 0, Math.PI * 0.46).toNonIndexed(),
      skirt: new THREE.CylinderGeometry(0.3, 0.5, 1, rr).toNonIndexed(), ring: new THREE.CylinderGeometry(0.5, 0.5, 1, rr, 1, true).toNonIndexed(), seg: rr };
    for (const k in LIMB) o[k] = new THREE.LatheGeometry(LIMB[k].map(p => new THREE.Vector2(p[0], p[1])), ln).toNonIndexed();
    return o;
  };
  const PRIM_HI = prims(26, 18, 14, 10, 6, 18, 26, 9, 22, 18), PRIM_MID = LOW ? prims(10, 7, 6, 3, 2, 8, 10, 4, 10, 8) : prims(14, 10, 8, 5, 3, 10, 14, 5, 12, 10),  // smoother since 2026-11-19 (high quality)
    PRIM_LO = prims(8, 5, 5, 3, 1, 6, 8, 3, 8, 6);
  // brows, lash lines and fingers (the face pass): small, so a few sides are plenty
  const STROKE = new THREE.CapsuleGeometry(0.5, 1, 1, 6).toNonIndexed(), FINGER = new THREE.CapsuleGeometry(0.5, 1, 2, 7).toNonIndexed();
  const DUCK_RING = new THREE.TorusGeometry(0.5, 0.16, 6, 16).rotateX(Math.PI / 2).toNonIndexed();
  const shade = (c, k) => { _c.set(c).multiplyScalar(k); return _c.getHex(); };
  const mix = (a, b, t) => { _c.set(a).lerp(new THREE.Color(b), t); return _c.getHex(); };
  const LONG_HAIR = [1, 3, 6, 2, 1, 6], SHORT_HAIR = [0, 4, 5, 0, 8, 0, 7, 4];
  W.HAIR_STYLES = ['Short', 'Long', 'Bun', 'Ponytail', 'Curly', 'Spiky', 'Bob', 'Thin on top', 'Side part'];
  const EYES = [0x5a3a22, 0x3b2616, 0x6b8e4e, 0x4a7ab0, 0x8a6a3a, 0x2c2c2c];
  // Silly extras about one passer-by in eleven wears (W.SILLY): the city is realistic, its people are not quite.
  W.SILLY = ['propeller', 'party', 'cone', 'antlers', 'stache', 'nosegl', 'flower', 'duckring', 'balloon', 'baguette'];
  // A torso as one smooth ring-by-ring shape. Rows: [y, half width, half depth, z offset (+ = back), 1 = trousers colour].
  function torsoGeo(look, n, top, bottom) {
    const f = look.fig != null ? look.fig : 0.5, b = Math.max(0, (look.build || 1) - 1.04);
    const belt = [1.02, 0.157 + 0.01 * f + b * 0.1, 0.108 + b * 0.25, -b * 0.08];
    const R = [
      [0.83, 0.14, 0.09, 0.004, 1], [0.88, 0.155 + 0.016 * f, 0.104 + 0.01 * f, 0.006, 1], [0.97, 0.162 + 0.016 * f, 0.11 + 0.004 * f, 0.002, 1],
      belt.concat(1), belt.concat(0),
      [1.1, 0.152 - 0.016 * f + b * 0.18, 0.104 - 0.004 * f + b * 0.45, -b * 0.15, 0],                                   // waist (a belly for big builds)
      [1.22, 0.16 - 0.008 * f + b * 0.1, 0.112 + b * 0.25, -0.005 - b * 0.08, 0],
      [1.32, 0.168 - 0.014 * f, 0.121 + 0.016 * f, -0.012 - 0.01 * f, 0],                                                // chest
      [1.4, 0.174 - 0.02 * f, 0.11, -0.006, 0], [1.448, 0.172 - 0.022 * f, 0.092, 0.0, 0],                                 // shoulders, rounding
      [1.48, 0.145 - 0.018 * f, 0.078, 0.004, 0], [1.503, 0.1, 0.062, 0.008, 0], [1.525, 0.055, 0.048, 0.01, 0],                 // into the neck
    ];
    const pos = [], col = [], idx = [], ct = new THREE.Color(top), cb = new THREE.Color(bottom);
    for (const r of R) for (let j = 0; j <= n; j++) {
      const a = j / n * Math.PI * 2, c = r[4] ? cb : ct;
      pos.push(Math.cos(a) * r[1], r[0], r[3] + Math.sin(a) * r[2]); col.push(c.r, c.g, c.b);
    }
    const row = n + 1;
    for (let i = 0; i + 1 < R.length; i++) for (let j = 0; j < n; j++) {
      const A = i * row + j, B = A + 1, C = A + row, D = C + 1;
      idx.push(A, C, B, B, C, D);
    }
    const bot = pos.length / 3; pos.push(0, 0.81, 0.004); col.push(cb.r, cb.g, cb.b);
    const tp = pos.length / 3; pos.push(0, 1.535, 0.01); col.push(ct.r, ct.g, ct.b);
    const last = (R.length - 1) * row;
    for (let j = 0; j < n; j++) { idx.push(bot, j, j + 1); idx.push(tp, last + j + 1, last + j); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    // where the surface is at height y: front z (negative), back z, half width
    const at = y => { let i = 0; while (i < R.length - 2 && R[i + 1][0] < y) i++; const p = R[i], q = R[i + 1], t = Math.min(1, Math.max(0, (y - p[0]) / ((q[0] - p[0]) || 1))); const hw = p[1] + (q[1] - p[1]) * t, hd = p[2] + (q[2] - p[2]) * t, zo = p[3] + (q[3] - p[3]) * t; return { hw, hd, zo, front: zo - hd, back: zo + hd }; };
    return { geo: g.toNonIndexed(), at };
  }
  // The face pass (2026-11-24, the user: "more effort into the model design... more advanced, more edges and better looking.
  // Most importantly the face"). The skull, jaw and chin are one sculpted surface turned ring by ring (HEAD_ROWS: [y, half
  // width, front depth, back depth] in the head group's metres, a superellipse per ring so the face is flatter than the back
  // of the head), then shaped by bumps on the front: brow ridge, eye sockets, cheekbones, the muzzle round the mouth, the
  // chin and the groove under the lower lip. Vertex colours carry the soft parts: a blush on the cheeks, shade in the eye
  // sockets and under the brow. headZ(x, y, f) = the front surface at (x, y): the eyes, brows, nose and lips sit on it.
  // look.fig narrows the jaw a little (f quantised to 0 / 0.5 / 1 so passers-by share a few cached shapes per skin).
  const HEAD_ROWS = [
    [0.004, 0.022, 0.072, 0.02], [0.016, 0.04, 0.097, 0.034], [0.03, 0.054, 0.104, 0.047], [0.046, 0.065, 0.105, 0.059],
    [0.062, 0.074, 0.106, 0.071], [0.08, 0.083, 0.106, 0.084], [0.1, 0.091, 0.106, 0.095], [0.118, 0.095, 0.104, 0.101],
    [0.136, 0.0965, 0.102, 0.104], [0.154, 0.096, 0.104, 0.106], [0.172, 0.092, 0.1, 0.106], [0.19, 0.085, 0.092, 0.102],
    [0.207, 0.074, 0.08, 0.092], [0.222, 0.058, 0.063, 0.076], [0.234, 0.037, 0.04, 0.05], [0.2405, 0.012, 0.013, 0.017],
  ];
  const HEAD_ZC = 0.005, HEAD_E = 0.9, HEAD_EF = 0.8;
  const gss = (x, y, x0, y0, sx, sy) => Math.exp(-((x - x0) / sx) * ((x - x0) / sx) - ((y - y0) / sy) * ((y - y0) / sy));
  // how far the front of the face moves forward (negative z) at (x, y), before the ring's own curve
  function headBump(x, y) {
    const ax = Math.abs(x);
    return -0.005 * Math.exp(-((y - 0.152) / 0.012) * ((y - 0.152) / 0.012)) * Math.exp(-Math.pow(x / 0.07, 4))   // brow ridge
      + 0.007 * gss(ax, y, 0.04, 0.128, 0.022, 0.016)                                                               // eye sockets
      - 0.004 * gss(ax, y, 0.058, 0.098, 0.02, 0.02)                                                                // cheekbones
      - 0.003 * gss(x, y, 0, 0.068, 0.035, 0.03)                                                                    // muzzle
      - 0.004 * gss(x, y, 0, 0.022, 0.022, 0.014)                                                                   // chin
      + 0.0025 * gss(x, y, 0, 0.04, 0.025, 0.006);                                                                  // under the lower lip
  }
  function headRow(y, f) {
    const R = HEAD_ROWS;
    let i = 0; while (i < R.length - 2 && R[i + 1][0] < y) i++;
    const p = R[i], q = R[i + 1], t = Math.min(1, Math.max(0, (y - p[0]) / (q[0] - p[0])));
    const jaw = 1 - 0.07 * f * Math.min(1, Math.max(0, (0.11 - y) / 0.08));
    return [(p[1] + (q[1] - p[1]) * t) * jaw, p[2] + (q[2] - p[2]) * t, p[3] + (q[3] - p[3]) * t];
  }
  function headZ(x, y, f) {
    const r = headRow(y, f || 0), s = Math.min(0.999, Math.pow(Math.min(1, Math.abs(x) / r[0]), 1 / HEAD_E)), c = Math.sqrt(1 - s * s);
    return HEAD_ZC - r[1] * Math.pow(c, HEAD_EF) + headBump(x, y) * c;
  }
  const headCache = new Map();
  function headGeo(skin, f, n) {
    const fq = Math.round(f * 2) / 2, key = skin + '|' + fq + '|' + n;
    if (headCache.has(key)) return headCache.get(key);
    const R = HEAD_ROWS, pos = [], col = [], idx = [], base = new THREE.Color(skin), blush = new THREE.Color(0xe0806a), c = new THREE.Color();
    const row = n + 1;
    for (const r0 of R) {
      const [hw, fd, bd] = headRow(r0[0], fq), y = r0[0];
      for (let j = 0; j <= n; j++) {
        const th = j / n * Math.PI * 2, s = Math.sin(th), cs = Math.cos(th);   // th = 0 at the back: the seam hides under the hair
        let x = hw * Math.sign(s) * Math.pow(Math.abs(s), HEAD_E), z;
        if (cs >= 0) z = HEAD_ZC + bd * Math.pow(cs, HEAD_E);
        else {
          const fw = -cs;
          z = HEAD_ZC - fd * Math.pow(fw, HEAD_EF) + headBump(x, y) * fw;
          x += Math.sign(x) * 0.003 * gss(Math.abs(x), y, 0.058, 0.098, 0.02, 0.02) * fw;          // cheekbones stand out a little sideways too
        }
        x *= 1 - 0.035 * Math.exp(-((y - 0.165) / 0.03) * ((y - 0.165) / 0.03)) * Math.max(0, Math.abs(s) - 0.6) / 0.4;   // temples
        pos.push(x, y, z);
        const front = Math.max(0, -cs), ax = Math.abs(x);
        c.copy(base).lerp(blush, 0.2 * gss(ax, y, 0.052, 0.09, 0.024, 0.02) * front);                                 // cheeks
        c.multiplyScalar(1 - 0.1 * gss(ax, y, 0.04, 0.132, 0.024, 0.018) * front - 0.05 * gss(ax, y, 0.03, 0.144, 0.03, 0.008) * front);  // sockets, under the brow
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i + 1 < R.length; i++) for (let j = 0; j < n; j++) { const A = i * row + j, B = A + 1, C2 = A + row, D2 = C2 + 1; idx.push(A, B, C2, B, D2, C2); }
    const bot = pos.length / 3; pos.push(0, -0.002, -0.028); col.push(base.r, base.g, base.b);
    const top = pos.length / 3; pos.push(0, 0.2425, 0.012); col.push(base.r, base.g, base.b);
    const last = (R.length - 1) * row;
    for (let j = 0; j < n; j++) { idx.push(bot, j + 1, j); idx.push(top, last + j, last + j + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const out = g.toNonIndexed();
    if (headCache.size > 80) headCache.clear();
    headCache.set(key, out);
    return out;
  }
  W.headZ = headZ;
  // A person, facing -z. userData: {body, head, legL, legR, kneeL, kneeR, armL, armR, elbowL, elbowR, handL, handR, prop}:
  // the body group holds a head and four limbs, each limb a pivot with a second pivot (knee / elbow) inside, so people can
  // walk, run, sit, pedal, wave and dance; handR/handL are in the palm (weapons attach there).
  // look: {skin, hair, shirt, pants, shoe, h, build, fig 0-1 (straight -> curvy), eye, style | long + hs, sleeve: 'short' |
  //   'long' | 'none', shorts, dress, hat, beanie, crown, glasses, beard, bag, apron, cape, coat, scarf, stripes, logo, phones,
  //   collar, tie, tuck, mood: 'angry', silly (one of W.SILLY)}. npc: true = only the big parts cast shadows.
  // surface classes for a person's parts, by colour (cft-gfx: skin, hair strands, cloth weave, glossy eyes)
  function personKOF(look) {
    const t = { raw: 6 }, h = c => _c.set(c).getHex();
    for (const c of [look.shirt, look.pants, look.coat, look.scarf, look.apron, look.cape, look.stripes, look.tie]) if (c != null) t[h(c)] = 6;
    if (look.shoe != null) t[h(look.shoe)] = 9; else t[0x222222] = 9;
    if (look.bag != null) t[h(look.bag)] = 9;
    if (look.hair != null) t[h(look.hair)] = 7;
    t[0xffffff] = 5; t[0x111111] = 5;
    if (look.skin != null) t[h(look.skin)] = 4;
    return t;
  }
  W.person = function (look, npc) {
    look = look || W.randomLook(Math.random() * 1e6 | 0);
    if (!GFX) return buildPerson(look, npc);
    const prev = KOF;
    KOF = personKOF(look);
    try { return buildPerson(look, npc); } finally { KOF = prev; }
  };
  function buildPerson(look, npc) {
    const P = npc ? (LOW ? PRIM_LO : PRIM_MID) : (LOW ? PRIM_MID : PRIM_HI);
    const { sph: P_SPH, sm: P_SM, cap: P_CAP, dome: P_DOME, skirt: P_SKIRT, ring: P_RING } = P;
    const g = new THREE.Group(), body = new THREE.Group();
    g.add(body);
    const skin = look.skin, hair = look.hair, shirt = look.coat || look.shirt, pants = look.pants, shoe = look.shoe == null ? 0x222222 : look.shoe;
    const kid = W.isKid(look), f = look.fig != null ? look.fig : 0.5, silly = look.silly || null;
    const part = (m, shadow) => { const mesh = m.mesh(); mesh.castShadow = !LOW && (shadow || !npc); return mesh; };
    // ---- torso
    const T = torsoGeo(look, P.seg + 2, shirt, look.dress ? shirt : pants), at = T.at;
    const t = new Merge();
    t.addRaw(T.geo);
    t.add(CYL8, skin, 0, 1.51, 0.005, 0, 0, 0, 0.1, 0.12, 0.092);                                          // neck
    const tucked = look.tuck != null ? look.tuck : !((look.hs || 0) % 2);
    if (look.dress) t.add(P_SKIRT, shirt, 0, 0.79, 0.004, 0, 0, 0, 0.62, 0.48, 0.5);
    else if (!look.coat) {
      const w = at(1.02);
      if (tucked) { t.add(P_RING, shade(pants, 0.45), 0, 1.02, w.zo, 0, 0, 0, w.hw * 2 + 0.012, 0.04, w.hd * 2 + 0.012); t.box(0.035, 0.03, 0.01, 0xc9ced3, 0, 1.02, w.front - 0.008); }
      else { const h = at(1.0); t.add(P_RING, shirt, 0, 0.995, h.zo, 0, 0, 0, h.hw * 2 + 0.02, 0.05, h.hd * 2 + 0.02); }  // an untucked hem
    }
    if (look.coat) { // a coat: skirts to the knee, lapels, buttons
      const h = at(0.97), c = at(1.3);
      t.add(P_SKIRT, look.coat, 0, 0.8, h.zo, 0, 0, 0, h.hw * 3.4, 0.4, h.hd * 3.6);
      t.box(0.05, 0.2, 0.012, shade(look.coat, 0.75), -0.045, 1.37, c.front - 0.004, 0, 0, -0.25); t.box(0.05, 0.2, 0.012, shade(look.coat, 0.75), 0.045, 1.37, c.front - 0.004, 0, 0, 0.25);
      for (const y of [1.2, 1.1, 1.0]) t.add(P_SM, shade(look.coat, 0.5), 0.02, y, at(y).front - 0.004, 0, 0, 0, 0.018, 0.018, 0.01);
    }
    if (look.stripes) for (const y of [1.18, 1.3]) { const w = at(y); t.add(P_RING, look.stripes, 0, y, w.zo, 0, 0, 0, w.hw * 2 + 0.01, 0.045, w.hd * 2 + 0.01); }
    if (look.logo && !look.apron && !look.tie) t.add(P_SM, look.logo, 0.035, 1.3, at(1.3).front + 0.002, 0, 0, 0, 0.07, 0.07, 0.016);
    if (look.collar || look.tie) { const z = at(1.49).front - 0.006; t.box(0.065, 0.045, 0.025, 0xf4f1ea, -0.035, 1.485, z, 0, 0, 0.5); t.box(0.065, 0.045, 0.025, 0xf4f1ea, 0.035, 1.485, z, 0, 0, -0.5); }
    if (look.collar && !look.tie && !look.coat && !look.apron && !npc && !LOW) for (const y of [1.42, 1.34, 1.26, 1.18]) t.add(P_SM, shade(shirt, 0.6), 0, y, at(y).front - 0.003, 0, 0, 0, 0.014, 0.014, 0.006);   // shirt buttons
    if (look.tie) { const z = at(1.3).front - 0.008; t.box(0.045, 0.28, 0.012, look.tie, 0, 1.3, z, 0.08); t.box(0.05, 0.045, 0.02, look.tie, 0, 1.45, at(1.45).front - 0.008); }
    if (look.apron) { t.box(0.3, 0.56, 0.018, look.apron, 0, 1.08, at(1.15).front - 0.012); t.box(0.22, 0.03, 0.018, look.apron, 0, 1.38, at(1.38).front - 0.01); }
    if (look.cape) t.box(0.4, 0.82, 0.025, look.cape, 0, 1.08, at(1.3).back + 0.03, -0.08);
    if (look.scarf) { t.add(P_RING, look.scarf, 0, 1.49, 0.01, 0, 0, 0, 0.21, 0.075, 0.19); t.box(0.07, 0.26, 0.025, look.scarf, 0.05, 1.36, at(1.36).front - 0.012); }
    if (look.bag) { // a backpack with straps
      const bz = at(1.25).back;
      t.add(P_CAP, look.bag, 0, 1.24, bz + 0.07, 0, 0, 0, 0.27, 0.17, 0.15);
      t.add(P_SM, shade(look.bag, 0.75), 0, 1.15, bz + 0.15, 0, 0, 0, 0.18, 0.13, 0.05);
      for (const sx of [-1, 1]) t.box(0.035, 0.3, 0.012, shade(look.bag, 0.6), sx * 0.095, 1.27, at(1.27).front - 0.006, -0.12);
    }
    if (silly === 'duckring') { const w = at(1.06); t.add(DUCK_RING, 0xffd23f, 0, 1.0, w.zo, 0, 0, 0, w.hw * 2 + 0.16, 0.6, w.hd * 2 + 0.2); t.add(P_SM, 0xffd23f, 0, 1.1, w.front - 0.1, 0, 0, 0, 0.11, 0.11, 0.11); t.add(P_SM, 0xff8a3d, 0, 1.09, w.front - 0.17, 0, 0, 0, 0.06, 0.03, 0.06); t.add(P_SM, 0x1c1a24, 0.03, 1.13, w.front - 0.14, 0, 0, 0, 0.015, 0.015, 0.01); t.add(P_SM, 0x1c1a24, -0.03, 1.13, w.front - 0.14, 0, 0, 0, 0.015, 0.015, 0.01); }
    if (silly === 'baguette') { t.add(P_CAP, 0xd9a35b, -0.17, 1.2, -0.02, 1.25, 0, 0.12, 0.055, 0.2, 0.055); for (let k = -1; k <= 1; k++) t.box(0.012, 0.012, 0.05, 0xf0d29a, -0.17, 1.2 + k * 0.07 * 0.32, -0.02 - k * 0.07 * 0.95 - 0.03, 0.4); }
    body.add(part(t, true));
    // ---- head (its own group: it turns and nods). Skull, jaw and chin; the face sits on their curve.
    const head = new THREE.Group();
    head.position.set(0, 1.535, 0);
    if (kid) head.scale.setScalar(1.22);
    body.add(head);
    const hm = new Merge(), dark = 0x1c1a24, angry = look.mood === 'angry', eye = look.eye != null ? look.eye : EYES[(look.hs || 0) % EYES.length];
    const lip = mix(skin, 0xa84848, 0.38), lid = shade(skin, 0.94), hi = !npc && !LOW;   // hi = you and the cast: every detail
    const fz = (x, y) => headZ(x, y, f);   // the face's front surface here
    const old = shade(hair, 1) === 0x8a8a8a || shade(hair, 1) === 0xd9d4cc, lashes = !look.beard && (f > 0.55 || !!look.long || look.style === 1 || look.style === 3 || look.style === 6);
    const skinK = KOF && KOF[_c.set(skin).getHex()];
    hm.as(skinK || 0); hm.addRaw(headGeo(skin, f, npc ? (LOW ? 12 : 20) : (LOW ? 20 : 40))); hm.k = null;   // skull, jaw, cheeks, chin: one sculpted surface
    for (const sx of [-1, 1]) {   // ears: rim, the hollow inside, the lobe
      hm.add(P_SM, shade(skin, 0.95), sx * 0.095, 0.112, 0.012, 0, sx * 0.25, 0, 0.022, 0.056, 0.036);
      hm.add(P_SM, shade(skin, 0.74), sx * 0.104, 0.114, 0.01, 0, sx * 0.25, 0, 0.008, 0.034, 0.02);
      if (hi) hm.add(P_SM, shade(skin, 0.97), sx * 0.099, 0.082, 0.014, 0, 0, 0, 0.014, 0.017, 0.015);
    }
    // nose: bridge, tip, wings and nostrils
    hm.add(P_SM, skin, 0, 0.114, fz(0, 0.114) + 0.004, -0.22, 0, 0, 0.018, 0.046, 0.02);
    hm.add(P_SM, skin, 0, 0.098, fz(0, 0.098) + 0.001, -0.35, 0, 0, 0.024, 0.036, 0.024);
    hm.add(P_SM, skin, 0, 0.0885, fz(0, 0.0885) - 0.003, 0, 0, 0, 0.024, 0.022, 0.021);
    for (const sx of [-1, 1]) {
      hm.add(P_SM, shade(skin, 0.97), sx * 0.0125, 0.0835, fz(0.0125, 0.0835) + 0.0005, 0, 0, sx * 0.2, 0.014, 0.0125, 0.013);
      hm.add(P_SM, shade(skin, 0.4), sx * 0.0075, 0.0785, fz(0.0075, 0.0785) - 0.0045, 0.3, 0, 0, 0.0075, 0.0035, 0.006);
    }
    for (const sx of [-1, 1]) {
      const ex = sx * 0.04, ey = 0.128, ez = fz(ex, ey) - 0.003;
      hm.add(P_SM, 0xf6f3ee, ex, ey, ez + 0.0015, 0, 0, 0, 0.034, 0.028, 0.026);                                      // eyeball
      hm.add(P_SM, shade(eye, 0.5), ex, ey - 0.001, ez - 0.0125, 0, 0, 0, 0.025, 0.026, 0.008);              // the dark ring round the iris
      hm.add(P_SM, eye, ex, ey - 0.001, ez - 0.0135, 0, 0, 0, 0.021, 0.022, 0.01);                          // iris
      if (hi) hm.add(P_SM, mix(eye, 0xffffff, 0.3), ex, ey - 0.001, ez - 0.0162, 0, 0, 0, 0.014, 0.015, 0.006);   // lighter flecks round the pupil
      hm.add(P_SM, dark, ex, ey - 0.001, ez - 0.0168, 0, 0, 0, 0.01, 0.011, 0.006);                         // pupil
      hm.add(P_SM, 0xffffff, ex + 0.006, ey + 0.006, ez - 0.0195, 0, 0, 0, 0.0065, 0.0065, 0.003);          // glints: a big one, a small one
      if (hi) hm.add(P_SM, 0xffffff, ex - 0.005, ey - 0.005, ez - 0.019, 0, 0, 0, 0.003, 0.003, 0.002);
      // upper lid with the lash line along its edge; lower lid
      hm.add(P_SM, lid, ex, angry ? 0.14 : 0.1462, ez - 0.0005, angry ? 0 : -0.25, 0, angry ? sx * 0.3 : 0, 0.041, 0.012, 0.029);
      const ly = angry ? 0.1365 : 0.1405, lz = ez - 0.0125;
      const stroke = (x, y, z, len, th, rz) => hm.add(STROKE, dark, x, y, z, 0, 0, Math.PI / 2 + rz, th, len / 2, th * 0.8);
      stroke(ex - sx * 0.011, ly - 0.0015, lz + 0.001, 0.02, 0.0034, sx * (angry ? 0.45 : 0.24));
      stroke(ex + sx * 0.005, ly + 0.0004, lz, 0.018, 0.0036, angry ? sx * 0.3 : 0);
      stroke(ex + sx * 0.018, ly - 0.0022, lz + 0.002, 0.014, 0.0032, angry ? 0 : -sx * 0.32);
      if (lashes) stroke(ex + sx * 0.026, ly + 0.0012, lz + 0.004, 0.012, 0.0026, sx * 0.75);   // a flick at the outer corner
      hm.add(P_SM, shade(skin, 0.97), ex, ey - 0.0165, ez - 0.004, 0.2, 0, 0, 0.04, 0.009, 0.026);
      if (old) hm.box(0.016, 0.0025, 0.003, shade(skin, 0.8), ex + sx * 0.03, ey - 0.006, fz(ex + sx * 0.03, ey - 0.006) - 0.0005, 0, sx * 0.6, sx * 0.4);   // crow's feet
      // brows: three tapered pieces along an arch (angry: low and slanted in)
      const bc = shade(hair, 0.78), bt = look.beard || (!look.long && f < 0.4) ? 1.25 : 1;
      const brow = angry ? [[0.02, 0.146, 0.45], [0.04, 0.153, 0.3], [0.058, 0.157, 0.1]] : [[0.021, 0.156, -0.05], [0.04, 0.1615, -0.12], [0.058, 0.158, -0.42]];
      brow.forEach((b, k) => { const bx = sx * b[0]; hm.add(STROKE, bc, bx, b[1], fz(bx, b[1]) - 0.0025, 0, sx * k * 0.3, Math.PI / 2 + sx * b[2], (0.0105 - k * 0.0018) * bt, 0.0148, 0.006); });
    }
    // freckles (fair skin, one in four) and laugh lines (grey hair)
    if (((look.hs || 0) % 4 === 1) && _c.set(skin).getHSL({}).l > 0.68) for (let k = 0; k < (hi ? 9 : 5); k++) {
      const sx = k % 2 ? 1 : -1, fx = sx * (0.03 + hash(k * 7 + (look.hs || 0)) * 0.035), fy = 0.098 + hash(k * 13 + 3) * 0.018;
      hm.add(P_SM, shade(skin, 0.8), fx, fy, fz(fx, fy) + 0.0004, 0, 0, 0, 0.0032, 0.0032, 0.002);
    }
    if (old) for (const sx of [-1, 1]) hm.box(0.0035, 0.032, 0.004, shade(skin, 0.82), sx * 0.033, 0.072, fz(sx * 0.033, 0.072) - 0.0004, 0, 0, sx * 0.38);
    if (look.beard) { // a beard following the jaw, a moustache in two halves
      hm.add(P_SPH, hair, 0, 0.044, -0.03, 0, 0, 0, 0.152 - 0.012 * f, 0.1, 0.152);
      hm.add(P_SM, hair, 0, 0.022, fz(0, 0.022) + 0.006, 0, 0, 0, 0.06, 0.05, 0.04);
      for (const sx of [-1, 1]) hm.add(P_SM, hair, sx * 0.018, 0.071, fz(0.018, 0.071) - 0.002, 0, 0, -sx * 0.25, 0.042, 0.016, 0.018);
    }
    if (!look.beard || angry) {   // lips: a cupid's bow on top, a fuller lower lip, the line between them, smile corners
      const mz = fz(0, 0.058) + 0.001;
      for (const sx of [-1, 1]) hm.add(P_SM, lip, sx * 0.0105, 0.0625, mz, 0, 0, sx * 0.18, 0.027, 0.0115, 0.013);
      hm.add(P_SM, shade(lip, 1.08), 0, 0.0505, mz + 0.0015, 0, 0, 0, 0.036, 0.0145, 0.012);
      hm.box(0.038, 0.0022, 0.004, shade(lip, 0.45), 0, 0.0568, mz - 0.0045);
      if (!angry && !look.beard) for (const sx of [-1, 1]) hm.box(0.011, 0.0045, 0.006, shade(lip, 0.62), sx * 0.022, 0.0588, mz - 0.0015, 0, sx * 0.4, sx * 0.55);
      if (angry) for (const sx of [-1, 1]) hm.box(0.01, 0.004, 0.006, shade(lip, 0.6), sx * 0.021, 0.054, mz - 0.0015, 0, sx * 0.4, -sx * 0.5);
    }
    const gl = look.glasses || silly === 'nosegl';
    if (gl) {
      const fr = silly === 'nosegl' ? 0x111111 : dark, th = silly === 'nosegl' ? 0.01 : 0.006;
      for (const sx of [-1, 1]) {
        const x = sx * 0.041;
        hm.box(0.054, th, th, fr, x, 0.147, -0.108); hm.box(0.054, th, th, fr, x, 0.111, -0.108);
        hm.box(th, 0.036, th, fr, x - 0.027, 0.129, -0.108); hm.box(th, 0.036, th, fr, x + 0.027, 0.129, -0.108);
        hm.box(0.005, 0.005, 0.11, fr, sx * 0.094, 0.135, -0.055);
      }
      hm.box(0.022, 0.005, 0.005, fr, 0, 0.133, -0.11);
    }
    // ---- silly face and head extras (in the head's own coordinates)
    if (silly === 'nosegl') { hm.add(P_SM, 0xf2a3a3, 0, 0.09, -0.125, 0, 0, 0, 0.055, 0.05, 0.06); hm.box(0.1, 0.02, 0.02, 0x222222, 0, 0.069, -0.11); for (const sx of [-1, 1]) hm.box(0.05, 0.02, 0.016, 0x222222, sx * 0.041, 0.164, -0.104, 0, 0, -sx * 0.15); }
    if (silly === 'stache') { hm.box(0.1, 0.024, 0.022, hair === 0xd9d4cc ? 0xd9d4cc : 0x2b1a10, 0, 0.073, -0.11); for (const sx of [-1, 1]) { hm.add(P_SM, 0x2b1a10, sx * 0.06, 0.08, -0.106, 0, 0, 0, 0.035, 0.03, 0.022); hm.add(P_SM, 0x2b1a10, sx * 0.078, 0.098, -0.1, 0, 0, 0, 0.022, 0.022, 0.016); } }
    if (silly === 'flower') { const fx = 0.088, fy = 0.17, fz = 0.03; for (let k = 0; k < 5; k++) { const a = k * 1.2566; hm.add(P_SM, 0xff6fa8, fx + 0.012, fy + Math.cos(a) * 0.024, fz + Math.sin(a) * 0.024, 0, 0, 0, 0.012, 0.026, 0.026); } hm.add(P_SM, 0xffd23f, fx + 0.02, fy, fz, 0, 0, 0, 0.014, 0.022, 0.022); }
    // hair, hats, the crown and headphones: built round the old big head, then fitted to the new skull
    const hr = new Merge();
    const style = look.style != null ? look.style : (look.long ? LONG_HAIR[(look.hs || 0) % LONG_HAIR.length] : SHORT_HAIR[(look.hs || 0) % SHORT_HAIR.length]);
    const beanie = look.beanie || (silly === 'propeller' ? 0xe8453c : null);
    const covered = look.hat || beanie || silly === 'cone' || silly === 'party';
    if (style === 4) hr.add(P_SPH, hair, 0, 0.26, 0.035, 0, 0, 0, covered ? 0.44 : 0.53, covered ? 0.38 : 0.48, 0.49);
    else if (style === 7) { hr.add(P_SM, hair, -0.175, 0.2, 0.04, 0, 0, 0, 0.1, 0.17, 0.26); hr.add(P_SM, hair, 0.175, 0.2, 0.04, 0, 0, 0, 0.1, 0.17, 0.26); hr.add(P_SM, hair, 0, 0.16, 0.16, 0, 0, 0, 0.32, 0.22, 0.1); }
    else {
      hr.add(P_DOME, hair, 0, 0.17, 0.012, 0.5, 0, 0, 0.405, 0.44, 0.415);                              // the cap of hair, tipped back off the forehead
      if (!covered && style !== 5) hr.add(P_SM, hair, style === 8 ? -0.05 : 0, 0.325, -0.105, 0.55, 0, style === 8 ? 0.35 : 0, 0.33, 0.1, 0.2);   // a fringe
    }
    if (style === 1) { hr.add(P_CAP, hair, 0, 0, 0.14, 0.12, 0, 0, 0.38, 0.27, 0.16); hr.add(P_CAP, hair, -0.18, 0.06, 0.03, 0, 0, 0, 0.09, 0.2, 0.17); hr.add(P_CAP, hair, 0.18, 0.06, 0.03, 0, 0, 0, 0.09, 0.2, 0.17); }
    if (style === 2) hr.add(P_SM, hair, 0, 0.39, 0.1, 0, 0, 0, 0.18, 0.17, 0.18);
    if (style === 3) { hr.add(P_SM, hair, 0, 0.31, 0.2, 0, 0, 0, 0.1, 0.1, 0.1); hr.add(P_CAP, hair, 0, 0.14, 0.29, 0.5, 0, 0, 0.1, 0.18, 0.1); }
    if (style === 5 && !covered) for (let k = 0; k < 5; k++) hr.add(CONE, hair, 0, 0.405 - Math.abs(k - 2) * 0.012, -0.12 + k * 0.068, -0.5 + k * 0.25, 0, 0, 0.12, 0.18, 0.12);
    if (style === 6) hr.add(P_CAP, hair, 0, 0.12, 0.075, 0, 0, 0, 0.45, 0.2, 0.31);
    if (look.hat) { hr.add(P_DOME, look.hat, 0, 0.235, 0.005, 0.1, 0, 0, 0.425, 0.39, 0.435); hr.add(P_SM, look.hat, 0, 0.272, -0.25, 0.1, 0, 0, 0.31, 0.035, 0.27); hr.add(P_SM, shade(look.hat, 0.7), 0, 0.43, 0.03, 0, 0, 0, 0.05, 0.03, 0.05); }
    if (beanie) { hr.add(P_DOME, beanie, 0, 0.21, 0.01, 0.3, 0, 0, 0.432, 0.46, 0.44); hr.add(P_RING, shade(beanie, 0.8), 0, 0.272, 0.012, 0.3, 0, 0, 0.437, 0.08, 0.445); if (silly !== 'propeller') hr.add(P_SM, 0xf4f1ea, 0, 0.46, 0.05, 0, 0, 0, 0.1, 0.1, 0.1); }
    if (look.crown) { // a cardboard crown, worn with pride
      hr.add(P_RING, 0xf2c14e, 0, 0.385, 0.01, 0, 0, 0, 0.32, 0.1, 0.32);
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; hr.add(CONE, 0xf2c14e, Math.sin(a) * 0.145, 0.475, 0.01 - Math.cos(a) * 0.145, 0, 0, 0, 0.09, 0.12, 0.09); }
      hr.add(P_SM, 0xe8453c, 0, 0.385, -0.155, 0, 0, 0, 0.06, 0.06, 0.03);
    }
    if (look.phones) { hr.add(P_RING, 0x24262e, 0, 0.2, 0.01, 0, 0, Math.PI / 2, 0.44, 0.04, 0.42); for (const sx of [-1, 1]) hr.add(P_SM, look.phones, sx * 0.21, 0.15, 0.01, 0, 0, 0, 0.07, 0.15, 0.15); }
    hm.addMerge(hr, 0, 0.0316, 0.005, 0.5, 0.5625, 0.566);
    if (silly === 'party' && !look.crown && !look.hat) { hm.add(CONE, 0x7b52c7, 0.015, 0.31, 0, 0, 0, -0.22, 0.12, 0.17, 0.12); hm.add(P_RING, 0xffd23f, 0.007, 0.28, 0, 0, 0, -0.22, 0.095, 0.022, 0.095); hm.add(P_SM, 0xff6fa8, 0.035, 0.4, 0, 0, 0, 0, 0.04, 0.04, 0.04); }
    if (silly === 'cone' && !look.crown && !look.hat) { hm.add(CONE, 0xff6a1a, 0, 0.36, 0.005, 0, 0, 0, 0.17, 0.27, 0.17); hm.add(P_RING, 0xf4f1ea, 0, 0.35, 0.005, 0, 0, 0, 0.115, 0.035, 0.115); hm.box(0.2, 0.025, 0.2, 0xff6a1a, 0, 0.235, 0.005); }
    if (silly === 'antlers' && !look.crown) { hm.add(P_RING, 0x5b4636, 0, 0.215, 0.01, 0.15, 0, Math.PI / 2, 0.2, 0.015, 0.21); for (const sx of [-1, 1]) { seg(hm, TAPER, 0x8a5a2b, sx * 0.07, 0.22, 0.01, sx * 0.15, 0.37, 0.03, 0.014); seg(hm, TAPER, 0x8a5a2b, sx * 0.11, 0.29, 0.02, sx * 0.07, 0.36, -0.02, 0.008); seg(hm, TAPER, 0x8a5a2b, sx * 0.13, 0.33, 0.025, sx * 0.21, 0.37, 0.0, 0.008); } }
    head.add(part(hm, true));
    let prop = null;
    if (silly === 'propeller' && !look.crown && !look.hat) { // spins faster the faster they walk (W.animate)
      const pm = new Merge(); pm.add(CYL8, 0x33373f, 0, 0.0, 0, 0, 0, 0, 0.012, 0.05, 0.012); pm.box(0.2, 0.006, 0.035, 0xffd23f, 0.09, 0.025, 0, 0.3, 0, 0); pm.box(0.2, 0.006, 0.035, 0x2b6cb0, -0.09, 0.025, 0, -0.3, 0, 0); pm.add(P_SM, 0xe8453c, 0, 0.03, 0, 0, 0, 0, 0.025, 0.02, 0.025);
      prop = part(pm, false); prop.position.set(0, 0.272, 0.01); head.add(prop);
    }
    // ---- limbs: a pivot at the hip / shoulder, a second at the knee / elbow, a tip in the palm / sole
    const limb = (x, y, lenA, lenB, upper, lower, tipY) => {
      const pivot = new THREE.Group(); pivot.position.set(x, y, 0); body.add(pivot);
      const a = new Merge(); upper(a, lenA); pivot.add(part(a, true));
      const joint = new THREE.Group(); joint.position.set(0, -lenA, 0); pivot.add(joint);
      const b = new Merge(); lower(b, lenB); joint.add(part(b, false));
      const tip = new THREE.Group(); tip.position.set(0, tipY != null ? tipY : -lenB, 0); joint.add(tip);
      return [pivot, joint, tip];
    };
    const bare = look.dress || look.shorts, thighR = 0.09 + 0.006 * f, shinR = 0.064;
    const darkShoe = shoe === 0x222222 || shoe === 0x8a5a2b || shoe === 0x3a3f4a || shoe === 0x1f2937, sole = darkShoe ? 0x1a1a1a : 0xf0efea;
    const thigh = (m, len) => {
      m.add(P.thigh, look.dress || look.shorts ? skin : pants, 0, 0, 0, 0, 0, 0, thighR, len, thighR * 0.96);
      if (look.shorts && !look.dress) m.add(P.sleeve, pants, 0, 0, 0, 0, 0, 0, thighR * 1.08, len * 1.1, thighR * 1.05);
    };
    const shin = (m, len) => {
      m.add(P.shin, bare ? skin : pants, 0, 0, 0, 0, 0, 0, shinR, len, shinR * 1.02);
      if (bare) m.add(P_RING, 0xf4f1ea, 0, -len + 0.06, 0, 0, 0, 0, 0.085, 0.05, 0.085);                     // socks
      m.add(P_SM, shoe, 0, -len - 0.03, -0.03, 0, 0, 0, 0.092, 0.08, 0.2);                                   // the shoe: upper, toe cap, heel, sole, tongue
      m.add(P_SM, shoe, 0, -len - 0.042, -0.115, 0, 0, 0, 0.088, 0.062, 0.1);
      m.add(P_SM, shade(shoe, 0.9), 0, -len - 0.036, 0.048, 0, 0, 0, 0.084, 0.07, 0.08);
      m.box(0.094, 0.026, 0.25, sole, 0, -len - 0.07, -0.042);
      if (!darkShoe) m.box(0.04, 0.012, 0.08, shade(shoe, 1.15), 0, -len - 0.004, -0.07, 0.55);
      if (hi) for (let k = 0; k < 3; k++) m.box(0.05, 0.005, 0.007, darkShoe ? 0x9a9a9a : 0xfafafa, 0, -len - 0.004 - k * 0.012, -0.075 - k * 0.022, 0.55);   // laces
    };
    const [legL, kneeL] = limb(-0.092, 0.92, 0.44, 0.41, thigh, shin);
    const [legR, kneeR] = limb(0.092, 0.92, 0.44, 0.41, thigh, shin);
    const sleeve = look.dress && look.sleeve == null ? 'none' : look.coat ? 'long' : look.sleeve || 'long';
    const armR0 = 0.059 - 0.005 * f, foreR = 0.049 - 0.004 * f;
    const upper = (m, len) => {
      m.add(P.upper, sleeve === 'long' ? shirt : skin, 0, 0, 0, 0, 0, 0, armR0, len, armR0 * 0.95);
      if (sleeve === 'short') m.add(P.sleeve, shirt, 0, 0, 0, 0, 0, 0, armR0 * 1.1, len, armR0 * 1.07);
    };
    const fore = (m, len) => {
      m.add(P.fore, sleeve === 'long' ? shirt : skin, 0, 0, 0, 0, 0, 0, foreR, len, foreR * 0.9);
      if (sleeve === 'long') m.add(P_RING, shade(shirt, 0.8), 0, -len + 0.03, 0, 0, 0, 0, foreR * 2.15, 0.035, foreR * 2.0);
      m.add(P_SM, skin, 0, -len - 0.045, -0.004, 0, 0, 0, 0.034, 0.09, 0.075);                               // palm (facing the thigh)
      if (hi) { // four fingers, slightly curled, the middle one longest; knuckles
        [[-0.023, 0.052], [-0.006, 0.058], [0.011, 0.054], [0.026, 0.044]].forEach(([fzz, fl]) => {
          m.add(FINGER, skin, 0, -len - 0.088 - fl * 0.5, fzz - 0.004, 0.18, 0, 0, 0.019, fl * 0.5, 0.018);
          m.add(P_SM, shade(skin, 0.97), 0.002, -len - 0.087, fzz - 0.002, 0, 0, 0, 0.022, 0.016, 0.019);
        });
      } else m.add(P_SM, skin, 0, -len - 0.108, -0.008, 0.12, 0, 0, 0.028, 0.075, 0.066);                     // fingers
      m.add(P_CAP, skin, 0, -len - 0.05, -0.038, 0.5, 0, 0, 0.022, 0.03, 0.022);                             // thumb
    };
    const sw = 0.19 - 0.018 * f;
    const [armL, elbowL, handL] = limb(-sw, 1.425, 0.29, 0.26, upper, fore, -0.26 - 0.075);
    const [armR, elbowR, handR] = limb(sw, 1.425, 0.29, 0.26, upper, fore, -0.26 - 0.075);
    armL.rotation.z = -ARM_Z; armR.rotation.z = ARM_Z;
    if (silly === 'balloon') { // a balloon on a string, held in the left hand
      const bm = new Merge(), bc = [0xe8453c, 0x2b6cb0, 0xffd23f, 0x2f9e6e, 0xef6aa5][(look.hs || 0) % 5];
      bm.box(0.004, 1.1, 0.004, 0xf4f1ea, 0, 0.55, 0); bm.add(P_SPH, bc, 0, 1.28, 0, 0, 0, 0, 0.32, 0.38, 0.32); bm.add(CONE, bc, 0, 1.08, 0, Math.PI, 0, 0, 0.05, 0.05, 0.05);
      const bal = part(bm, false); bal.castShadow = false; handL.add(bal); g.userData.balloon = bal;
    }
    let shield = null;
    if (look.shield) { shield = W.shieldMesh(look.shield.kind, look.shield.col); shield.position.set(-0.31, 1.0, 0.03); shield.rotation.y = Math.PI / 2; body.add(shield); }
    g.userData = Object.assign(g.userData || {}, { body, head, legL, legR, kneeL, kneeR, armL, armR, elbowL, elbowR, handL, handR, phase: Math.random() * 6, kind: 'person', kid, shield, prop });
    body.scale.x = 1 + ((look.build || 1) - 1) * 0.6;
    g.scale.setScalar(look.h || 1);
    return g;
  }
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
    if (u.prop) u.prop.rotation.y += dt * (5 + speed * 4);
    if (u.balloon) u.balloon.rotation.z = Math.sin((u.phase || 0) * 0.7) * 0.12;
    const L = u.legL.rotation, R = u.legR.rotation, KL = u.kneeL.rotation, KR = u.kneeR.rotation, AL = u.armL.rotation, AR = u.armR.rotation, EL = u.elbowL.rotation, ER = u.elbowR.rotation, B = u.body, H = u.head.rotation;
    L.z = R.z = 0; AL.z = -ARM_Z; AR.z = ARM_Z; EL.z = ER.z = 0; B.rotation.set(0, 0, 0); H.x = H.y = H.z = 0; B.position.y = 0;
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
    // cut-scene poses (cft-cine.js): talk (u.talk 0..1 = how loud the voice is right now: the hands move with it),
    // cheer (both arms up, a little hop: a mission accepted or done), phone (right hand at the ear)
    if (pose === 'talk') {
      const k = u.talk || 0;
      u.phase += dt * (2.2 + k * 4);
      u.talkK = (u.talkK || 0) + (k - (u.talkK || 0)) * Math.min(1, dt * 6);
      const s = Math.sin(u.phase), s2 = Math.sin(u.phase * 0.63 + 1.3), kk = u.talkK;
      L.x = R.x = KL.x = KR.x = 0;
      AR.x = 0.25 + kk * 0.75 + s * 0.2 * kk; AR.z = ARM_Z + 0.12 + s2 * 0.1 * kk; ER.x = 0.55 + kk * 0.9 + s2 * 0.3 * kk;
      AL.x = 0.12 + kk * 0.45 * (0.5 + 0.5 * s2); AL.z = -ARM_Z - 0.05 * kk; EL.x = 0.3 + kk * 0.7;
      H.x = -0.03 + Math.sin(u.phase * 1.7) * 0.07 * kk; H.y = Math.sin(u.phase * 0.37) * 0.14; H.z = s2 * 0.05 * kk;
      B.rotation.y = Math.sin(u.phase * 0.29) * 0.07; B.rotation.x = -0.03 * kk;
      return;
    }
    if (pose === 'cheer') {
      u.phase += dt * 9;
      const s = Math.abs(Math.sin(u.phase));
      AL.x = AR.x = 2.75; AL.z = -0.5 - s * 0.15; AR.z = 0.5 + s * 0.15; EL.x = ER.x = 0.25 + s * 0.2;
      L.x = R.x = s * 0.25; KL.x = KR.x = -s * 0.5; B.position.y = s * 0.16; H.x = -0.15;
      return;
    }
    if (pose === 'phone') {
      u.phase += dt;
      AR.x = 1.05; AR.z = ARM_Z + 0.45; ER.x = 2.45; ER.z = 0; AL.x = 0.15; EL.x = 0.25;   // elbow forward and out, forearm folded back up to the ear
      H.z = 0.12; H.y = Math.sin(u.phase * 0.6) * 0.12; H.x = Math.sin(u.phase * 0.9) * 0.05;
      L.x = R.x = KL.x = KR.x = 0;
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
      AL.z = -ARM_Z - k * 0.012; AR.z = ARM_Z + k * 0.012; EL.x = ER.x = 0.14;
      H.y = Math.sin(u.phase * 0.17) * 0.3; H.x = Math.sin(u.phase * 0.11) * 0.06;
    }
  };
  // Animals: dog, cat, pigeon, duck (realism pass 2026-11-17: rounded bodies, snouts, floppy or pointed ears, tails, wings).
  // userData: {kind: 'animal', legs (4 pivots; none for birds), head, tail, bird}. Faces -z.
  // A mouth that opens with the voice (cft-cine.js): made the first time someone talks in a cut-scene, a dark oval
  // between the lips (over a beard), 0 = closed and hidden, 1 = wide open. The head is merged, so the mouth is its own mesh.
  let MOUTH = null;
  W.mouth = function (fig, k) {
    const u = fig && fig.userData;
    if (!u || u.kind !== 'person' || !u.head) return;
    if (!u.mouth) {
      if (!k) return;
      if (!MOUTH) MOUTH = { g: new THREE.SphereGeometry(1, 14, 10), m: new THREE.MeshBasicMaterial({ color: 0x3a1418 }), t: new THREE.MeshBasicMaterial({ color: 0xf4f1ea }) };
      const mo = new THREE.Group(), cav = new THREE.Mesh(MOUTH.g, MOUTH.m), teeth = new THREE.Mesh(MOUTH.g, MOUTH.t);
      cav.scale.set(0.026, 0.016, 0.008); teeth.scale.set(0.02, 0.004, 0.006); teeth.position.set(0, 0.009, -0.002);
      mo.add(cav, teeth);
      mo.position.set(0, 0.056, -0.108);
      u.head.add(mo); u.mouth = mo;
    }
    const o = Math.max(0, Math.min(1, k || 0));
    u.mouth.visible = o > 0.04;
    u.mouth.scale.set(0.85 + o * 0.25, 0.25 + o * 1.25, 1);
  };
  W.animal = function (kind, color) {
    const g = new THREE.Group(), body = new Merge(), { sph: S, sm: SM, cap: CAP } = PRIM_LO;
    const c = color || (kind === 'dog' ? 0xc8894a : kind === 'cat' ? 0x6b6b6b : kind === 'duck' ? 0x8a6a3a : 0x8b8f9c);
    const legs = [], dark = 0x15151a;
    let head = null, tail = null;
    if (kind === 'pigeon' || kind === 'duck') {
      const s = kind === 'duck' ? 1.45 : 1, hc = kind === 'duck' ? 0x2f6b3a : 0x5c6f8a, beak = kind === 'duck' ? 0xf0a030 : 0x3a3a3a;
      body.add(S, c, 0, 0.15 * s, 0.01 * s, -0.15, 0, 0, 0.17 * s, 0.16 * s, 0.3 * s);                          // body
      body.add(S, kind === 'duck' ? 0x8a6a3a : 0x9aa0ad, 0, 0.13 * s, -0.06 * s, 0, 0, 0, 0.15 * s, 0.15 * s, 0.16 * s);   // breast
      body.add(SM, shade(c, 0.8), 0, 0.17 * s, 0.17 * s, 0.35, 0, 0, 0.12 * s, 0.04 * s, 0.16 * s);              // tail
      for (const sx of [-1, 1]) body.add(SM, shade(c, 0.85), sx * 0.075 * s, 0.17 * s, 0.03 * s, -0.1, 0, sx * 0.25, 0.05 * s, 0.11 * s, 0.24 * s);   // wings
      body.add(SM, hc, 0, 0.27 * s, -0.12 * s, 0, 0, 0, 0.1 * s, 0.1 * s, 0.11 * s);                            // head
      if (kind === 'pigeon') body.add(SM, 0x6aa38a, 0, 0.22 * s, -0.1 * s, 0, 0, 0, 0.09, 0.05, 0.08);           // the shiny neck
      body.add(CONE, beak, 0, 0.26 * s, -0.19 * s, -Math.PI / 2, 0, 0, 0.035 * s, 0.07 * s, kind === 'duck' ? 0.02 * s : 0.03 * s);
      for (const sx of [-1, 1]) body.add(SM, dark, sx * 0.04 * s, 0.285 * s, -0.15 * s, 0, 0, 0, 0.02 * s, 0.02 * s, 0.015 * s);
      for (const sx of [-1, 1]) body.box(0.012 * s, 0.07 * s, 0.012 * s, 0xd9734a, sx * 0.035 * s, 0.035 * s, 0);
      const m = body.mesh(); g.add(m);
      g.userData = { kind: 'animal', legs: [], phase: Math.random() * 6, bird: true, head: m };
      return g;
    }
    const cat = kind === 'cat', L = cat ? 0.45 : 0.62, H = cat ? 0.19 : 0.27, legH = cat ? 0.2 : 0.28, belly = shade(c, cat ? 1.1 : 1.2);
    body.add(CAP, c, 0, legH + H / 2, 0, Math.PI / 2, 0, 0, H * 0.95, L * 0.42, H);                            // body (a capsule lying down)
    body.add(S, c, 0, legH + H * 0.6, -L * 0.3, 0, 0, 0, H * 1.05, H * 1.1, H * 1.0);                         // chest
    body.add(S, belly, 0, legH + H * 0.3, -L * 0.05, 0, 0, 0, H * 0.7, H * 0.4, L * 0.6);                    // belly
    g.add(body.mesh());
    const hm = new Merge();
    hm.add(S, c, 0, 0, -0.06, 0, 0, 0, cat ? 0.2 : 0.22, cat ? 0.18 : 0.2, cat ? 0.19 : 0.22);                // head
    hm.add(S, cat ? belly : c, 0, -0.04, cat ? -0.15 : -0.2, 0, 0, 0, cat ? 0.09 : 0.11, cat ? 0.07 : 0.09, cat ? 0.08 : 0.17);   // snout
    hm.add(SM, dark, 0, cat ? -0.02 : -0.01, cat ? -0.19 : -0.285, 0, 0, 0, 0.035, 0.028, 0.03);              // nose
    for (const sx of [-1, 1]) {
      hm.add(SM, cat ? 0x9ccf5a : 0x2a1a10, sx * 0.055, 0.03, -0.14, 0, 0, 0, 0.035, 0.035, 0.02);            // eyes
      hm.add(SM, dark, sx * 0.055, 0.03, -0.152, 0, 0, 0, cat ? 0.01 : 0.02, 0.026, 0.01);
      if (cat) hm.add(CONE, c, sx * 0.065, 0.11, -0.04, 0, 0, sx * -0.25, 0.07, 0.09, 0.04);                  // pointed ears
      else hm.add(SM, shade(c, 0.7), sx * 0.1, 0.0, -0.03, 0, 0, sx * 0.35, 0.05, 0.14, 0.09);                // floppy ears
    }
    if (!cat) hm.add(SM, 0xe86a7a, 0, -0.085, -0.25, 0.3, 0, 0, 0.04, 0.01, 0.05);                           // a happy tongue
    head = new THREE.Group(); head.position.set(0, legH + H + 0.04, -L / 2); head.add(hm.mesh()); g.add(head);
    const tm = new Merge();
    seg(tm, TAPER, c, 0, 0, 0, 0, cat ? 0.3 : 0.16, cat ? 0.14 : 0.2, cat ? 0.03 : 0.035);
    if (cat) seg(tm, TAPER, c, 0, 0.29, 0.14, 0, 0.36, 0.06, 0.02);
    tail = new THREE.Group(); tail.position.set(0, legH + H * 0.75, L / 2); tail.add(tm.mesh()); g.add(tail);
    for (const [x, z] of [[-0.075, -L / 2 + 0.08], [0.075, -L / 2 + 0.08], [-0.075, L / 2 - 0.08], [0.075, L / 2 - 0.08]]) {
      const p = new THREE.Group(); p.position.set(x, legH, z);
      const lm = new Merge(); lm.add(CAP, c, 0, -legH / 2 + 0.01, 0, 0, 0, 0, 0.065, legH * 0.42, 0.065); lm.add(SM, shade(c, 0.85), 0, -legH + 0.02, -0.02, 0, 0, 0, 0.07, 0.04, 0.09);
      p.add(lm.mesh()); g.add(p); legs.push(p);
    }
    g.userData = { kind: 'animal', legs, head, tail, phase: Math.random() * 6 };
    return g;
  };
  // Monsters (cartoon figments: you bonk them, they pop into coins). Each has googly eyes and its own wobble.
  // kind: slime | bin | cone | sock | pigeon | goose | blob (the big purple boss) | rat | raccoon | wisp | cart | spider | worm | gargoyle | brute. W.animateMonster(g, dt, speed) moves it.
  const eye = (m, x, y, z, r) => { m.add(SPHERE, 0xffffff, x, y, z, 0, 0, 0, r, r, r); m.add(SPHERE, 0x111111, x, y, z - r * 0.36, 0, 0, 0, r * 0.5, r * 0.5, r * 0.4); };
  const slimeMat = GFX ? GFX.pbr({ transparent: true, opacity: 0.86, rough: 0.15 }) : new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.86 });
  W.monster = function (kind) {
    const g = new THREE.Group(), body = new THREE.Group(), m = new Merge();
    g.add(body);
    let mat = MAT.vc, h = 1, lid = null, wings = null;
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
    } else if (kind === 'rat') {
      const c = 0x8a8f99, pink = 0xf2a7b8;
      m.add(SPHERE, c, 0, 0.45, 0.08, 0, 0, 0, 0.9, 0.62, 1.35);
      m.add(SPHERE, c, 0, 0.6, -0.62, 0, 0, 0, 0.56, 0.5, 0.62);
      m.add(SPHERE, pink, 0, 0.56, -0.94, 0, 0, 0, 0.13, 0.11, 0.12);
      m.add(SPHERE, pink, -0.22, 0.9, -0.58, 0, 0, 0, 0.26, 0.26, 0.08); m.add(SPHERE, pink, 0.22, 0.9, -0.58, 0, 0, 0, 0.26, 0.26, 0.08);
      eye(m, -0.13, 0.7, -0.86, 0.12); eye(m, 0.13, 0.7, -0.86, 0.12);
      for (const sx of [-1, 1]) for (const k of [0, 1]) m.box(0.34, 0.012, 0.012, 0x333333, sx * 0.2, 0.56 + k * 0.04, -0.9, 0, 0, sx * (0.12 - k * 0.24));
      m.add(CYL, pink, 0, 0.34, 0.95, 1.25, 0, 0, 0.06, 1.1, 0.06);
      for (const [x, z] of [[-0.25, -0.35], [0.25, -0.35], [-0.25, 0.4], [0.25, 0.4]]) m.box(0.14, 0.18, 0.2, pink, x, 0.09, z);
      m.box(0.14, 0.05, 0.03, 0xffffff, 0, 0.46, -0.9);
      h = 1.05;
    } else if (kind === 'raccoon') {
      const c = 0x7d7d84, mask = 0x2b2b2b, light = 0xd9d4cc;
      m.add(SPHERE, c, 0, 0.55, 0.05, 0, 0, 0, 0.9, 0.85, 1.05);
      m.add(SPHERE, light, 0, 0.5, -0.36, 0, 0, 0, 0.55, 0.55, 0.3);
      m.add(SPHERE, c, 0, 1.05, -0.3, 0, 0, 0, 0.66, 0.58, 0.6);
      m.box(0.56, 0.15, 0.08, mask, 0, 1.08, -0.58);
      m.add(SPHERE, light, 0, 0.97, -0.62, 0, 0, 0, 0.26, 0.2, 0.24); m.add(SPHERE, mask, 0, 1.0, -0.75, 0, 0, 0, 0.09, 0.07, 0.07);
      m.add(CONE, c, -0.22, 1.38, -0.28, 0, 0, 0.2, 0.18, 0.24, 0.12); m.add(CONE, c, 0.22, 1.38, -0.28, 0, 0, -0.2, 0.18, 0.24, 0.12);
      eye(m, -0.13, 1.1, -0.64, 0.1); eye(m, 0.13, 1.1, -0.64, 0.1);
      for (let k = 0; k < 5; k++) m.add(CYL, k % 2 ? mask : c, 0, 0.4 + k * 0.1, 0.55 + k * 0.17, -0.9, 0, 0, 0.24 - k * 0.02, 0.18, 0.24 - k * 0.02);
      m.add(SPHERE, mask, -0.36, 0.7, -0.35, 0, 0, 0, 0.16, 0.16, 0.16); m.add(SPHERE, mask, 0.36, 0.7, -0.35, 0, 0, 0, 0.16, 0.16, 0.16);
      m.box(0.2, 0.14, 0.24, mask, -0.22, 0.07, -0.1); m.box(0.2, 0.14, 0.24, mask, 0.22, 0.07, -0.1);
      h = 1.45;
    } else if (kind === 'wisp') {
      const c = 0xbfe3ff, deep = 0x8fc8f5;
      m.add(SPHERE, c, 0, 0.95, 0, 0, 0, 0, 0.95, 0.85, 0.95);
      m.add(SPHERE, c, 0, 1.5, 0.02, 0, 0, 0, 0.72, 0.62, 0.72);
      m.add(SPHERE, c, 0.05, 1.88, 0.06, 0, 0, 0.3, 0.42, 0.4, 0.42);
      m.add(SPHERE, deep, 0, 0.45, 0.05, 0, 0, 0, 0.5, 0.4, 0.5); m.add(SPHERE, deep, 0, 0.16, 0.1, 0, 0, 0, 0.24, 0.2, 0.24);
      eye(m, -0.16, 1.05, -0.4, 0.18); eye(m, 0.16, 1.05, -0.4, 0.18);
      m.add(SPHERE, 0x1c2a4a, 0, 0.78, -0.44, 0, 0, 0, 0.2, 0.14, 0.05);
      mat = slimeMat; h = 2.0;
    } else if (kind === 'cart') {
      const wire = 0xb9c0c8, dark = 0x3a3f4a;
      m.box(0.92, 0.6, 1.2, wire, 0, 0.9, 0); m.box(0.8, 0.5, 1.08, 0x8a929c, 0, 0.94, 0);
      for (let k = -2; k <= 2; k++) m.box(0.94, 0.03, 0.03, dark, 0, 0.9 + k * 0.12, -0.61);
      m.box(0.3, 0.3, 0.3, 0xe8453c, -0.18, 1.32, 0.15, 0, 0.4, 0); m.box(0.26, 0.4, 0.2, 0xf2b134, 0.2, 1.36, -0.05, 0, -0.3, 0); m.add(SPHERE, 0x2f9e6e, 0.05, 1.3, 0.4, 0, 0, 0, 0.3, 0.26, 0.3);
      m.add(CYL, 0xe8453c, 0, 1.3, 0.66, 0, 0, Math.PI / 2, 0.08, 1.0, 0.08);
      for (const [x, z] of [[-0.38, -0.5], [0.38, -0.5], [-0.38, 0.5], [0.38, 0.5]]) { m.box(0.05, 0.5, 0.05, dark, x, 0.36, z); m.add(CYL, 0x222428, x, 0.1, z, 0, 0, Math.PI / 2, 0.2, 0.08, 0.2); }
      eye(m, -0.22, 1.02, -0.66, 0.17); eye(m, 0.22, 1.02, -0.66, 0.17);
      for (let k = -2; k <= 2; k++) m.box(0.07, 0.1, 0.03, 0xffffff, k * 0.11, 0.72, -0.63);
      h = 1.45;
    } else if (kind === 'spider') {
      const c = 0x1f2229, red = 0xff3b30;
      m.add(SPHERE, c, 0, 0.55, -0.1, 0, 0, 0, 0.8, 0.55, 0.85);
      m.add(SPHERE, c, 0, 0.65, 0.55, 0, 0, 0, 0.95, 0.8, 1.0);
      m.add(SPHERE, red, 0, 0.82, 0.62, 0, 0, 0, 0.3, 0.2, 0.36);
      for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) {
        const z = -0.32 + i * 0.22;
        m.box(0.62, 0.06, 0.06, c, sx * 0.55, 0.62, z, 0, sx * (i - 1.5) * 0.3, sx * 0.5);
        m.box(0.06, 0.6, 0.06, c, sx * 0.86, 0.32, z + sx * 0 - (i - 1.5) * 0.06, 0, 0, sx * -0.2);
      }
      eye(m, -0.14, 0.72, -0.48, 0.14); eye(m, 0.14, 0.72, -0.48, 0.14);
      for (const [x, y] of [[-0.26, 0.6], [0.26, 0.6], [-0.08, 0.86], [0.08, 0.86]]) m.add(SPHERE, red, x, y, -0.46, 0, 0, 0, 0.06, 0.06, 0.04);
      h = 1.0;
    } else if (kind === 'worm') {
      const c = 0xd98c9a, belly = 0xf2c4cc;
      m.add(CYL, 0x3a3f4a, 0, 0.04, 0, 0, 0, 0, 1.7, 0.08, 1.7); m.add(CYL, 0x1c1e22, 0, 0.06, 0, 0, 0, 0, 1.3, 0.06, 1.3);
      for (let k = 0; k < 5; k++) m.add(SPHERE, k % 2 ? c : belly, 0, 0.32 + k * 0.32, -k * 0.04, 0, 0, 0, 0.78 - k * 0.05, 0.42, 0.78 - k * 0.05);
      m.add(SPHERE, c, 0, 1.85, -0.18, 0, 0, 0, 0.72, 0.66, 0.72);
      m.add(CYL, 0x3a1020, 0, 1.74, -0.5, Math.PI / 2, 0, 0, 0.42, 0.06, 0.42);
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; m.add(CONE, 0xffffff, Math.cos(a) * 0.16, 1.74 + Math.sin(a) * 0.16, -0.53, Math.PI / 2, 0, a + Math.PI / 2, 0.06, 0.1, 0.06); }
      eye(m, -0.18, 2.06, -0.4, 0.15); eye(m, 0.18, 2.06, -0.4, 0.15);
      h = 2.3;
    } else if (kind === 'gargoyle') {
      const c = 0x8c8b88, dark = 0x6b6a67;
      m.add(SPHERE, c, 0, 0.78, 0.05, 0, 0, 0, 0.92, 0.95, 0.82);
      m.add(SPHERE, c, 0, 1.38, -0.22, 0, 0, 0, 0.6, 0.55, 0.58);
      m.add(CONE, dark, -0.17, 1.72, -0.2, -0.3, 0, 0.35, 0.12, 0.3, 0.12); m.add(CONE, dark, 0.17, 1.72, -0.2, -0.3, 0, -0.35, 0.12, 0.3, 0.12);
      m.box(0.95, 0.65, 0.06, dark, -0.6, 1.2, 0.3, 0, 0.55, 0.35); m.box(0.95, 0.65, 0.06, dark, 0.6, 1.2, 0.3, 0, -0.55, -0.35);
      for (const sx of [-1, 1]) { m.add(SPHERE, 0xffd23f, sx * 0.13, 1.44, -0.48, 0, 0, 0, 0.14, 0.12, 0.06); m.add(SPHERE, 0x111111, sx * 0.13, 1.44, -0.51, 0, 0, 0, 0.05, 0.08, 0.03); }
      for (let k = -1; k <= 1; k++) m.add(CONE, 0xf4f1ea, k * 0.08, 1.24, -0.5, Math.PI, 0, 0, 0.05, 0.08, 0.05);
      m.box(0.24, 0.2, 0.34, dark, -0.26, 0.1, -0.12); m.box(0.24, 0.2, 0.34, dark, 0.26, 0.1, -0.12);
      m.box(0.16, 0.4, 0.16, dark, -0.4, 0.55, -0.36); m.box(0.16, 0.4, 0.16, dark, 0.4, 0.55, -0.36);
      h = 1.85;
    } else if (kind === 'brute') {
      const c = 0xb5533c, mortar = 0xd9c7b8, dark = 0x8a3a2a;
      m.box(1.1, 1.0, 0.72, c, 0, 1.28, 0);
      for (let k = 0; k < 4; k++) m.box(1.12, 0.04, 0.74, mortar, 0, 0.88 + k * 0.25, 0);
      for (let k = 0; k < 4; k++) m.box(0.04, 0.22, 0.74, mortar, (k % 2 ? -0.2 : 0.2), 1.0 + k * 0.25, 0);
      m.box(0.52, 0.44, 0.48, c, 0, 2.0, -0.04); m.box(0.54, 0.04, 0.5, mortar, 0, 1.92, -0.04);
      eye(m, -0.12, 2.04, -0.28, 0.1); eye(m, 0.12, 2.04, -0.28, 0.1);
      m.box(0.24, 0.05, 0.03, 0x2a1410, 0, 1.88, -0.29, 0, 0, 0.1);
      m.box(0.38, 0.92, 0.38, c, -0.8, 1.15, 0); m.box(0.38, 0.92, 0.38, c, 0.8, 1.15, 0);
      m.box(0.46, 0.36, 0.46, dark, -0.8, 0.56, -0.02); m.box(0.46, 0.36, 0.46, dark, 0.8, 0.56, -0.02);
      m.box(0.42, 0.78, 0.42, dark, -0.28, 0.39, 0); m.box(0.42, 0.78, 0.42, dark, 0.28, 0.39, 0);
      h = 2.3;
    } else if (kind === 'spitter') { // the Spitball Gremlin: big ears, puffed cheeks, spits green goo from a distance
      const c = 0x5fd068, d = 0x3f9a4a;
      m.add(SPHERE, c, 0, 0.55, 0.05, 0, 0, 0, 0.8, 0.82, 0.72); m.add(SPHERE, c, 0, 1.15, -0.05, 0, 0, 0, 0.82, 0.74, 0.78);
      m.add(CONE, c, -0.48, 1.32, 0, 0, 0, 1.25, 0.26, 0.6, 0.14); m.add(CONE, c, 0.48, 1.32, 0, 0, 0, -1.25, 0.26, 0.6, 0.14);
      m.add(SPHERE, 0x8ff09a, -0.24, 1.02, -0.32, 0, 0, 0, 0.3, 0.26, 0.24); m.add(SPHERE, 0x8ff09a, 0.24, 1.02, -0.32, 0, 0, 0, 0.3, 0.26, 0.24);
      m.add(CYL, 0x2a1b2e, 0, 1.0, -0.4, Math.PI / 2, 0, 0, 0.16, 0.1, 0.16); eye(m, -0.15, 1.32, -0.34, 0.15); eye(m, 0.15, 1.32, -0.34, 0.15);
      m.box(0.34, 0.05, 0.05, 0x1f1a3d, -0.15, 1.48, -0.36, 0, 0, -0.35); m.box(0.34, 0.05, 0.05, 0x1f1a3d, 0.15, 1.48, -0.36, 0, 0, 0.35);
      m.box(0.16, 0.38, 0.16, d, -0.18, 0.18, 0); m.box(0.16, 0.38, 0.16, d, 0.18, 0.18, 0); m.box(0.14, 0.38, 0.14, d, -0.42, 0.62, -0.05, 0, 0, 0.5); m.box(0.14, 0.38, 0.14, d, 0.42, 0.62, -0.05, 0, 0, -0.5);
      h = 1.6;
    } else if (kind === 'tomato') { // the Tomato Tosser: a grumpy tomato with a crate of ammunition
      const r = 0xe8453c;
      m.add(SPHERE, r, 0, 0.75, 0, 0, 0, 0, 1.2, 1.05, 1.2); m.add(SPHERE, 0xff7a6e, -0.2, 0.95, -0.42, 0, 0, 0, 0.3, 0.24, 0.12);
      for (let k = 0; k < 5; k++) { const a = k * 1.257; m.add(CONE, 0x35a05a, Math.cos(a) * 0.2, 1.3, Math.sin(a) * 0.2, Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2, 0.16, 0.42, 0.06); }
      m.box(0.06, 0.22, 0.06, 0x2f7a3a, 0, 1.4, 0); eye(m, -0.18, 0.92, -0.5, 0.13); eye(m, 0.18, 0.92, -0.5, 0.13);
      m.box(0.26, 0.05, 0.05, 0x1f1a3d, -0.18, 1.08, -0.53, 0, 0, -0.4); m.box(0.26, 0.05, 0.05, 0x1f1a3d, 0.18, 1.08, -0.53, 0, 0, 0.4); m.box(0.3, 0.05, 0.05, 0x1f1a3d, 0, 0.62, -0.58);
      m.box(0.6, 0.34, 0.4, 0xc9a26a, 0.62, 0.42, 0.1); for (const [x, z] of [[0.5, 0.02], [0.72, 0.18], [0.6, 0.2]]) m.add(SPHERE, r, x, 0.66, z, 0, 0, 0, 0.24, 0.22, 0.24);
      m.box(0.12, 0.3, 0.12, 0x2f7a3a, -0.22, 0.15, 0); m.box(0.12, 0.3, 0.12, 0x2f7a3a, 0.22, 0.15, 0);
      h = 1.5;
    } else if (kind === 'gull') { // the Seagull Sniper: flies over you, drops "presents". Wings flap (userData.wings)
      m.add(SPHERE, 0xffffff, 0, 0, 0.05, 0, 0, 0, 0.62, 0.55, 1.15); m.add(SPHERE, 0xffffff, 0, 0.22, -0.55, 0, 0, 0, 0.5, 0.48, 0.52);
      m.box(0.12, 0.1, 0.36, 0xffc21f, 0, 0.16, -0.92); m.add(SPHERE, 0xe8453c, 0, 0.11, -0.98, 0, 0, 0, 0.06, 0.06, 0.06);
      eye(m, -0.15, 0.32, -0.74, 0.08); eye(m, 0.15, 0.32, -0.74, 0.08); m.box(0.2, 0.04, 0.04, 0x1f1a3d, -0.14, 0.42, -0.76, 0, 0, -0.4); m.box(0.2, 0.04, 0.04, 0x1f1a3d, 0.14, 0.42, -0.76, 0, 0, 0.4);
      m.box(0.36, 0.08, 0.36, 0xb9c0c8, 0, 0.02, 0.62, 0.2); m.box(0.05, 0.3, 0.05, 0xff8a1a, -0.12, -0.38, 0.05); m.box(0.05, 0.3, 0.05, 0xff8a1a, 0.12, -0.38, 0.05);
      wings = {};
      for (const sx of [-1, 1]) { const wm = new Merge(); wm.box(1.1, 0.06, 0.55, 0xd6dbe3, sx * 0.55, 0, 0); wm.box(0.35, 0.065, 0.45, 0x5b5f66, sx * 1.0, 0, 0.05); const wg = new THREE.Group(); wg.position.set(sx * 0.28, 0.12, 0.05); wg.add(wm.mesh()); body.add(wg); wings[sx < 0 ? 'wl' : 'wr'] = wg; }
      h = 0.9;
    } else if (kind === 'wifi') { // the Wi-Fi Wraith: a haunted router that fires lag at you. Getting hit = buffering
      m.box(1.0, 0.28, 0.66, 0x2b2b33, 0, 1.0, 0); m.box(1.02, 0.04, 0.68, 0x6b4eff, 0, 0.87, 0);
      for (const x of [-0.36, 0, 0.36]) { m.box(0.06, 0.62, 0.06, 0x2b2b33, x, 1.44, 0.22); m.add(SPHERE, 0x35e06a, x, 1.78, 0.22, 0, 0, 0, 0.1, 0.1, 0.1); }
      for (let k = 0; k < 4; k++) m.add(SPHERE, k % 2 ? 0x35e06a : 0xffc21f, -0.3 + k * 0.2, 1.0, -0.34, 0, 0, 0, 0.06, 0.06, 0.04);
      eye(m, 0, 1.06, -0.3, 0.2); m.add(CONE, 0x6b4eff, 0, 0.6, 0, Math.PI, 0, 0, 0.75, 0.6, 0.5);
      for (const sx of [-1, 1]) m.box(0.1, 0.36, 0.1, 0x2b2b33, sx * 0.6, 0.88, 0, 0, 0, sx * 0.6);
      h = 1.9;
    } else { // pigeon (a very large one) and goose (a very angry one)
      const goose = kind === 'goose', c = goose ? 0xf4f1ea : 0x8b8f9c;
      m.add(SPHERE, c, 0, 0.75, 0.05, 0, 0, 0, 0.9, 0.8, 1.3);
      m.box(0.5, 0.1, 0.5, c, 0, 0.72, 0.75, 0.3);
      if (goose) { m.box(0.2, 0.9, 0.2, c, 0, 1.4, -0.5, 0.25); m.box(0.3, 0.26, 0.34, c, 0, 1.9, -0.62); m.box(0.16, 0.1, 0.34, 0xff8a1a, 0, 1.86, -0.92); eye(m, -0.14, 1.96, -0.74, 0.1); eye(m, 0.14, 1.96, -0.74, 0.1); }
      else { m.add(SPHERE, 0x5c6f8a, 0, 1.3, -0.5, 0, 0, 0, 0.6, 0.6, 0.6); m.box(0.14, 0.1, 0.26, 0xe0a030, 0, 1.26, -0.86); eye(m, -0.2, 1.4, -0.7, 0.18); eye(m, 0.2, 1.4, -0.7, 0.18); m.box(0.5, 0.06, 0.06, 0x333333, 0, 1.56, -0.74, 0, 0, 0.3); }
      m.box(0.08, 0.36, 0.08, 0xe0a030, -0.2, 0.18, 0); m.box(0.08, 0.36, 0.08, 0xe0a030, 0.2, 0.18, 0);
      h = goose ? 2.1 : 1.7;
    }
    const mm = monModel(kind);   // a rigged, animated figment model once it has loaded (2026-11-19), else the built one
    if (mm) {
      body.add(mm.obj);
      g.userData = { kind: 'monster', mkind: kind, body, lid: null, wings: null, phase: Math.random() * 6, h: mm.h, hurt: 0, model: mm };
      return g;
    }
    const mesh = m.mesh(mat);
    body.add(mesh);
    g.userData = { kind: 'monster', mkind: kind, body, lid, wings, phase: Math.random() * 6, h, hurt: 0 };
    return g;
  };
  // ---- figment models (2026-11-19 graphics overhaul): Quaternius "Ultimate Monsters" (CC0), packed by tools/monster_models.py
  // into theme/assets/mon-*.glb. MON_MODELS = monster kind -> model files (one picked at random); MON_H = height in metres.
  // Kinds not listed (bin, cone, cart, tomato, wifi, rat, spider, goose) keep their built models: they are jokes about
  // real objects. Loaded in the background after the world starts; until then (or without THREE.GLTFLoader) every
  // figment is the built one. W.animateMonster plays the clips: idle / walk / run, the attack while it winds up
  // (userData.act = 'wind', set by cft-fun), a flinch when hurt.
  const MON_MODELS = { slime: ['greenblob', 'pinkblob', 'spikyblob'], blob: ['spikyblob'], sock: ['ghost'], wisp: ['ghostskull'], pigeon: ['fatpigeon'],
    gull: ['pigeon'], raccoon: ['ninja'], worm: ['fish'], gargoyle: ['bluedemon'], brute: ['orc'], spitter: ['alien'] };
  const MON_H = { greenblob: 1.05, pinkblob: 1.05, spikyblob: 1.15, fatpigeon: 1.5, ghost: 1.55, ghostskull: 1.6, pigeon: 1.25, ninja: 1.75, fish: 1.85, bluedemon: 2.0, orc: 2.15, alien: 1.6 };
  const monSrc = {};
  W.monModels = monSrc;
  function loadMonsters() {
    if (!THREE.GLTFLoader || !THREE.SkeletonUtils || opts.nomodels || /[?&]nomodels=1/.test(location.search)) return;
    const loader = new THREE.GLTFLoader();
    const names = [...new Set(Object.values(MON_MODELS).flat())];
    names.forEach(name => loader.load('_/theme/mon-' + name + '.glb?v=1', gl => {
      if (destroyed) return;
      const sc = gl.scene;
      sc.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = !LOW; o.frustumCulled = false;   // skinned: the bind-pose bounds lag behind the animation
        const old = o.material, map = old.map;
        if (map) { map.encoding = THREE.LinearEncoding; map.anisotropy = 4; map.needsUpdate = true; }   // this game draws in display colours
        o.material = GFX ? new THREE.MeshStandardMaterial({ map, roughness: 0.5, metalness: 0, envMapIntensity: 0.6, side: old.side })
          : new THREE.MeshLambertMaterial({ map, side: old.side });
        old.dispose();
      });
      const box = new THREE.Box3().setFromObject(sc);
      const clip = n => gl.animations.find(a => a.name === n) || null;
      const any = (...ns) => { for (const n of ns) { const c = clip(n); if (c) return c; } return null; };
      monSrc[name] = { scene: sc, h0: Math.max(0.2, box.max.y - box.min.y), y0: box.min.y,
        clips: { idle: any('Idle', 'Flying_Idle'), walk: any('Walk', 'Flying_Idle'), run: any('Run', 'Fast_Flying', 'Walk'), atk: any('Punch', 'Bite_Front', 'Headbutt', 'Weapon'), hit: any('HitReact', 'HitRecieve') } };
    }, undefined, () => { /* a missing model: that figment stays the built one */ }));
  }
  function monModel(kind) {
    const list = (MON_MODELS[kind] || []).filter(n => monSrc[n]);
    if (!list.length) return null;
    const name = list[Math.random() * list.length | 0], src = monSrc[name];
    const obj = THREE.SkeletonUtils.clone(src.scene);
    const h = MON_H[name] * (kind === 'blob' ? 2.7 : 1), k = h / src.h0;
    obj.scale.setScalar(k); obj.position.y = -src.y0 * k; obj.rotation.y = Math.PI;   // glTF faces +z, figments face -z
    const mixer = new THREE.AnimationMixer(obj), acts = {};
    for (const c in src.clips) if (src.clips[c]) { acts[c] = mixer.clipAction(src.clips[c]); if (c === 'atk' || c === 'hit') { acts[c].setLoop(THREE.LoopOnce, 1); acts[c].clampWhenFinished = true; } }
    const mm = { obj, mixer, acts, cur: null, h, name };
    playMon(mm, 'idle', 0);
    mixer.update(Math.random() * 2);
    return mm;
  }
  function playMon(mm, c, fade) {
    const a = mm.acts[c] || mm.acts.idle;
    if (!a || mm.cur === a) return;
    a.reset(); a.setEffectiveWeight(1); a.play();
    if (mm.cur && fade) mm.cur.crossFadeTo(a, fade, false); else if (mm.cur) mm.cur.stop();
    mm.cur = a;
  }
  setTimeout(loadMonsters, 1200);
  W.animateMonster = function (g, dt, speed) {
    const u = g.userData, b = u.body;
    u.phase += dt * (3 + speed * 1.6);
    if (u.model) {
      const mm = u.model, A = mm.acts;
      const want = u.hurt > 0 && A.hit ? 'hit' : u.act === 'wind' && A.atk ? 'atk' : speed > 4.2 ? 'run' : speed > 0.25 ? 'walk' : 'idle';
      playMon(mm, want, 0.18);
      const loco = want === 'walk' || want === 'run';
      mm.mixer.update(dt * (loco ? Math.max(0.6, Math.min(1.8, speed / (want === 'run' ? 5.5 : 2.6))) : 1));
      if (mm.name === 'ghost' || mm.name === 'ghostskull') b.position.y = 0.3 + Math.sin(u.phase * 0.6) * 0.18;   // ghosts drift
      if (u.hurt > 0) { u.hurt -= dt; const f = 1 + Math.sin(u.hurt * 40) * 0.06; g.scale.setScalar((u.size || 1) * f); } else g.scale.setScalar(u.size || 1);
      return;
    }
    const s = Math.sin(u.phase), k = u.mkind;
    if (k === 'slime' || k === 'blob') { const q = 1 + s * 0.14; b.scale.set(1 / Math.sqrt(q), q, 1 / Math.sqrt(q)); b.position.y = Math.max(0, s) * (speed > 0.3 ? 0.5 : 0.08); }
    else if (k === 'sock') { b.position.y = 0.25 + s * 0.14; b.rotation.z = s * 0.14; }
    else if (k === 'wisp') { b.position.y = 0.3 + s * 0.25; b.rotation.y += dt * 0.6; b.rotation.z = Math.sin(u.phase * 0.5) * 0.08; }
    else if (k === 'worm') { b.rotation.z = s * 0.16; b.rotation.x = Math.cos(u.phase * 0.7) * 0.1; b.scale.y = 1 + s * 0.05; }
    else if (k === 'spider') { b.position.y = Math.abs(s) * 0.12 * Math.min(1, speed + 0.3); b.rotation.y = Math.sin(u.phase * 2) * 0.08; }
    else if (k === 'brute' || k === 'gargoyle') { b.rotation.z = s * 0.06 * Math.min(1, speed + 0.2); b.position.y = Math.abs(s) * 0.05; b.rotation.y = s * 0.05; }
    else if (k === 'gull') { const f = Math.sin(u.phase * 2.6) * 0.75; if (u.wings) { u.wings.wl.rotation.z = f; u.wings.wr.rotation.z = -f; } b.position.y = Math.sin(u.phase) * 0.15; b.rotation.z = Math.sin(u.phase * 0.5) * 0.15; }
    else if (k === 'wifi') { b.position.y = Math.sin(u.phase * 0.8) * 0.2; b.rotation.y = Math.sin(u.phase * 0.4) * 0.3; b.rotation.z = Math.sin(u.phase * 1.7) * 0.05; }
    else if (k === 'bin') { b.rotation.z = s * 0.1 * Math.min(1, speed); b.position.y = Math.abs(s) * 0.08 * Math.min(1, speed); if (u.lid) u.lid.rotation.x = -Math.max(0, Math.sin(u.phase * 0.7)) * 0.7; }
    else { b.rotation.z = s * 0.12 * Math.min(1, speed + 0.2); b.position.y = Math.abs(s) * 0.1 * Math.min(1, speed + 0.2); }
    if (u.hurt > 0) { u.hurt -= dt; const f = 1 + Math.sin(u.hurt * 40) * 0.12; g.scale.setScalar((u.size || 1) * f); } else g.scale.setScalar(u.size || 1);
  };
  // One tree (kind 0-3, see TREE) or bush (0-2, high quality only) as a plain mesh: screenshots and the play-test panel.
  W.treeMesh = function (k, col) {
    const T = TREE[k] || TREE[0], g = new THREE.Group(), c = new THREE.Mesh(T.crown, new THREE.MeshLambertMaterial({ color: col || [0x5e9a3e, 0x6aa046, 0x2f6e48, 0x9cc25a][k] || 0x5e9a3e, vertexColors: !LOW }));
    const t = new THREE.Mesh(T.trunk, MAT.trunk); t.castShadow = c.castShadow = !LOW; g.add(t, c); return g;
  };
  W.bushMesh = function (k) {
    const g = new THREE.Group(); if (!BUSH) return g;
    g.add(new THREE.Mesh(BUSH[k] || BUSH[0], new THREE.MeshLambertMaterial({ color: k === 2 ? 0x4a8a3a : 0x5a9a40, vertexColors: true })));
    if (k === 1) g.add(new THREE.Mesh(FLOWERS, MAT.prop));
    return g;
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
      // bonkers with very different reach (2026-11-19): the shape says how far it goes
      case 'pan': m.add(CYL, 0x2b2b30, 0, 0, -0.42, 0, 0, 0, 0.3, 0.06, 0.3); m.add(CYL, 0x4a4a52, 0, 0.03, -0.42, 0, 0, 0, 0.26, 0.02, 0.26); m.box(0.06, 0.05, 0.34, 0x1b1b1f, 0, 0, -0.06); break;
      case 'selfie': m.add(CYL8, 0xc9ced6, 0, 0, -0.9, Math.PI / 2, 0, 0, 0.035, 1.8, 0.035); m.box(0.2, 0.36, 0.03, 0x1f1a3d, 0, 0.12, -1.8); m.box(0.18, 0.32, 0.01, 0x7cc4ff, 0, 0.12, -1.785); m.box(0.07, 0.07, 0.2, 0x1f1a3d, 0, 0, 0); break;
      case 'rake': m.add(CYL8, 0x9a6a3c, 0, 0, -0.85, Math.PI / 2, 0, 0, 0.04, 1.7, 0.04); m.box(0.6, 0.05, 0.06, 0x6f7a86, 0, 0, -1.7); for (let k = 0; k < 7; k++) m.box(0.025, 0.16, 0.025, 0x6f7a86, -0.27 + k * 0.09, -0.08, -1.7); break;
      case 'yoyo': m.add(CYL, 0xff5c8a, 0, 0, -0.08, 0, 0, Math.PI / 2, 0.24, 0.07, 0.24); m.add(CYL, 0xff5c8a, 0.1, 0, -0.08, 0, 0, Math.PI / 2, 0.24, 0.07, 0.24); m.add(CYL8, 0xffc21f, 0.05, 0, -0.08, 0, 0, Math.PI / 2, 0.08, 0.1, 0.08); break;
      case 'tether': m.add(CYL8, 0xf4f1ea, 0, 0, -0.6, Math.PI / 2, 0, 0, 0.02, 1.2, 0.02); m.add(SPHERE, 0xffc21f, 0, 0, -1.3, 0, 0, 0, 0.26, 0.26, 0.26); m.box(0.53, 0.04, 0.04, 0x1f1a3d, 0, 0, -1.3); break;
      case 'bubble': m.box(0.12, 0.2, 0.34, 0xff5c8a, 0, 0, -0.18); m.add(CYL, 0x9fe3d0, 0, 0.04, -0.46, Math.PI / 2, 0, 0, 0.2, 0.24, 0.2); m.box(0.08, 0.2, 0.1, 0xff5c8a, 0, -0.14, -0.06); break;
      // ranged weapons (2026-11-18)
      case 'straw': m.add(CYL8, 0xffffff, 0, 0.02, -0.3, Math.PI / 2, 0, 0, 0.05, 0.6, 0.05); for (const z of [-0.1, -0.3, -0.5]) m.add(CYL8, 0xe8453c, 0, 0.02, z, Math.PI / 2, 0, 0, 0.055, 0.06, 0.055); break;
      case 'launcher': m.add(CYL, 0x35e06a, 0, 0.05, -0.35, Math.PI / 2, 0, 0, 0.2, 0.8, 0.2); m.add(SPHERE, 0x38bdf8, 0, 0.05, -0.78, 0, 0, 0, 0.26, 0.26, 0.26); m.box(0.08, 0.22, 0.12, 0x1f1a3d, 0, -0.12, -0.1); m.add(CYL, 0xffc21f, 0, 0.05, -0.05, Math.PI / 2, 0, 0, 0.24, 0.12, 0.24); break;
      case 'cannon': m.add(CYL, 0xe8453c, 0, 0.06, -0.4, Math.PI / 2, 0, 0, 0.3, 1.0, 0.3); m.add(CYL, 0xffc21f, 0, 0.06, -0.9, Math.PI / 2, 0, 0, 0.34, 0.08, 0.34); m.box(0.1, 0.24, 0.14, 0x1f1a3d, 0, -0.14, -0.15); m.add(CYL8, 0x9fc3dd, 0, 0.28, -0.2, 0, 0, 0, 0.16, 0.2, 0.16); break;
      case 'boomer': m.box(0.1, 0.07, 0.45, 0xf7d94c, 0, 0, -0.2, 0, 0.4); m.box(0.1, 0.07, 0.45, 0xf7d94c, 0.12, 0, -0.55, 0, -0.4); m.box(0.06, 0.08, 0.06, 0x6b4f37, 0.2, 0, -0.75); break;
      case 'sniper': m.add(CYL, 0xffc21f, 0, 0.04, -0.5, Math.PI / 2, 0, 0, 0.12, 1.3, 0.12); m.add(CONE, 0xe8a317, 0, 0.04, -1.2, -Math.PI / 2, 0, 0, 0.12, 0.16, 0.12); m.box(0.08, 0.2, 0.3, 0xe8453c, 0, -0.1, -0.05); m.add(CYL8, 0x1f1a3d, 0, 0.17, -0.45, Math.PI / 2, 0, 0, 0.07, 0.3, 0.07); break;
      case 'popper': m.add(CONE, 0xff5c8a, 0, 0.05, -0.35, -Math.PI / 2, 0, 0, 0.3, 0.6, 0.3); for (let k = 0; k < 4; k++) m.box(0.31, 0.04, 0.04, [0xffc21f, 0x38bdf8, 0x35e06a, 0x9b5cf6][k], 0, 0.05, -0.15 - k * 0.12, 0, 0, k); m.box(0.08, 0.18, 0.1, 0x1f1a3d, 0, -0.1, -0.05); break;
      case 'grenade': m.add(SPHERE, 0xff8fb8, 0, 0.05, -0.2, 0, 0, 0, 0.32, 0.22, 0.32); m.add(CYL8, 0xe8453c, 0, 0.05, -0.38, Math.PI / 2, 0, 0, 0.06, 0.12, 0.06); break;
      case 'potato': m.add(CYL, 0x8a8f99, 0, 0.06, -0.45, Math.PI / 2, 0, 0, 0.22, 1.1, 0.22); m.add(CYL, 0x5b5f66, 0, 0.06, 0.05, Math.PI / 2, 0, 0, 0.34, 0.3, 0.34); m.add(SPHERE, 0xc8a165, 0, 0.06, -1.0, 0, 0, 0, 0.2, 0.18, 0.24); break;
      case 'chickenl': m.add(CYL, 0xffc21f, 0, 0.06, -0.38, Math.PI / 2, 0, 0, 0.26, 0.9, 0.26); m.box(0.16, 0.2, 0.3, 0xf7d94c, 0, 0.06, -0.92); m.box(0.05, 0.1, 0.1, 0xe8453c, 0, 0.18, -0.95); m.box(0.08, 0.22, 0.12, 0x1f1a3d, 0, -0.12, -0.1); break;
      case 'gnomezooka': m.add(CYL, 0x35a05a, 0, 0.12, -0.3, Math.PI / 2, 0, 0, 0.32, 1.3, 0.32); m.add(CONE, 0xe8453c, 0, 0.12, -1.1, -Math.PI / 2, 0, 0, 0.3, 0.4, 0.3); m.add(SPHERE, 0xffffff, 0, 0.12, -0.92, 0, 0, 0, 0.26, 0.26, 0.2); m.box(0.1, 0.26, 0.14, 0x1f1a3d, 0, -0.1, -0.1); break;
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
  // For cft-chaos.js and screenshots: the geometry helpers and one decor piece as a plain mesh
  W.Merge = Merge; W.GEO = { CYL, CYL8, SPHERE, CONE, BOX: UNIT_BOX, TORUS };
  W.DECOR_KINDS = DECOR_KINDS;
  W.decorMesh = function (kind, tint) {
    const d = DECOR[kind], g = new THREE.Group(); if (!d) return g;
    if (d.a) { const m = new THREE.Mesh(d.a, new THREE.MeshLambertMaterial({ vertexColors: true, color: tint || (DECOR_TINTS[kind] || [0xffffff])[0] })); m.castShadow = !LOW; g.add(m); }
    if (d.b) { const m = new THREE.Mesh(d.b, MAT.vc); m.castShadow = !LOW; g.add(m); }
    if (d.glow) g.add(new THREE.Mesh(d.glow, MAT.glow));
    return g;
  };
  W.decorStats = () => { const o = {}; for (const s of allSubs) if (s.decor) for (const k of DECOR_KINDS) o[k] = (o[k] || 0) + (s.decor[k] || []).length / 5; return o; };
  W.decorCount = () => { let n = 0; for (const s of allSubs) if (s.decor) for (const k of DECOR_KINDS) n += (s.decor[k] || []).length / 5; return n; };
  // Off-hand shields (loot slot "hand", 2026-11-17): facing -z, centred on the forearm. col = the rarity colour.
  W.shieldMesh = function (kind, col) {
    const m = new Merge(), c = col || 0x9aa3ad, dark = 0x33373f;
    switch (kind) {
      case 'pizza': m.box(0.62, 0.62, 0.07, 0xd9b27c, 0, 0, 0); m.box(0.5, 0.5, 0.01, c, 0, 0, -0.04); m.add(SPHERE, 0xe8453c, 0, 0, -0.05, 0, 0, 0, 0.22, 0.22, 0.02); break;
      case 'pan': m.add(CYL, 0x26282e, 0, 0, 0, Math.PI / 2, 0, 0, 0.58, 0.08, 0.58); m.add(CYL, c, 0, 0, -0.045, Math.PI / 2, 0, 0, 0.46, 0.01, 0.46); m.box(0.07, 0.42, 0.05, 0x5b4636, 0, -0.48, 0); break;
      case 'umbrella': m.add(CONE, c, 0, 0, -0.12, -Math.PI / 2, 0, 0, 0.95, 0.32, 0.95); m.add(CYL, dark, 0, 0, 0.2, Math.PI / 2, 0, 0, 0.03, 0.7, 0.03); break;
      case 'deck': m.box(0.28, 0.86, 0.05, c, 0, 0, 0); m.box(0.26, 0.82, 0.01, 0x1f1a3d, 0, 0, -0.03); for (const y of [-0.28, 0.28]) { m.add(CYL6, 0xf4f1ea, -0.12, y, 0.06, 0, 0, Math.PI / 2, 0.08, 0.05, 0.08); m.add(CYL6, 0xf4f1ea, 0.12, y, 0.06, 0, 0, Math.PI / 2, 0.08, 0.05, 0.08); } break;
      case 'tray': m.box(0.7, 0.48, 0.04, c, 0, 0, 0); m.box(0.72, 0.04, 0.07, shade(c, 0.75), 0, 0.24, -0.02); m.box(0.72, 0.04, 0.07, shade(c, 0.75), 0, -0.24, -0.02); break;
      default: m.add(CYL, 0x9aa3ad, 0, 0, 0, Math.PI / 2, 0, 0, 0.66, 0.06, 0.66); m.add(CYL, c, 0, 0, -0.035, Math.PI / 2, 0, 0, 0.5, 0.01, 0.5); m.add(SPHERE, 0x7c8288, 0, 0, -0.06, 0, 0, 0, 0.16, 0.16, 0.08); // a trash-can lid
    }
    const mesh = m.mesh(); mesh.castShadow = !LOW;
    return mesh;
  };
  // Vehicles: skateboard, kickscooter, bike, moped, car, suv, sports (+ taxi, van, bus, truck, police in traffic). Facing -z.
  // Cars use the realistic bodies (carShape, CAR_SPEC) on high quality. opts.silly (traffic only, W.SILLY_CARS): something
  // daft strapped to the roof: a giant rubber duck, a mattress, a sofa, a Christmas tree, a canoe, a tower of suitcases.
  W.SILLY_CARS = ['duck', 'mattress', 'sofa', 'xmas', 'canoe', 'suitcases'];
  const CAR_KIND = { car: 'hatch', suv: 'suv', sports: 'sports', taxi: 'sedan', police: 'sedan', van: 'van', truck: 'van', bus: 'bus' };
  W.vehicle = function (kind, color, opts) {
    const m = new Merge(), col = color || 0xe8453c, dark = 0x222428, glass = 0x9fc3dd, chrome = 0xcfd3d6;
    const wheel = (x, y, z, r, w) => m.add(CYL, dark, x, y, z, 0, 0, Math.PI / 2, r * 2, w, r * 2);
    if (kind === 'skateboard') { m.box(0.24, 0.025, 0.8, col, 0, 0.12, 0); m.box(0.2, 0.03, 0.12, col, 0, 0.13, -0.42, -0.35); m.box(0.2, 0.03, 0.12, col, 0, 0.13, 0.42, 0.35); m.box(0.18, 0.04, 0.05, chrome, 0, 0.085, -0.28); m.box(0.18, 0.04, 0.05, chrome, 0, 0.085, 0.28); for (const z of [-0.28, 0.28]) { wheel(-0.09, 0.04, z, 0.035, 0.04); wheel(0.09, 0.04, z, 0.035, 0.04); } }
    else if (kind === 'kickscooter') { m.box(0.14, 0.04, 0.72, col, 0, 0.1, 0); seg(m, STICK, chrome, 0, 0.1, -0.36, 0, 1.05, -0.42, 0.035); m.box(0.48, 0.03, 0.03, dark, 0, 1.05, -0.42); for (const sx of [-1, 1]) m.add(CYL8, 0x333333, sx * 0.24, 1.05, -0.42, 0, 0, Math.PI / 2, 0.04, 0.1, 0.04); wheel(0, 0.08, -0.4, 0.08, 0.05); wheel(0, 0.08, 0.36, 0.08, 0.05); }
    else if (kind === 'bike') { // a diamond frame, spoked wheels, saddle, bars
      for (const z of [-0.52, 0.52]) { m.add(WHEEL, 0x1b1c1f, 0, 0.34, z, 0, 0, Math.PI / 2, 0.68, 0.05, 0.68); m.add(CYL8, 0x9aa0a8, 0, 0.34, z, 0, 0, Math.PI / 2, 0.08, 0.06, 0.08); if (!LOW) for (let k = 0; k < 6; k++) m.box(0.006, 0.6, 0.006, 0xb8bec6, 0, 0.34, z, k * 0.5236, 0, 0); }
      const B = [0, 0.4, 0.04], S = [0, 0.86, 0.18], H = [0, 0.9, -0.38];
      seg(m, STICK, col, B[0], B[1], B[2], S[0], S[1], S[2], 0.035); seg(m, STICK, col, B[0], B[1], B[2], H[0], H[1] - 0.12, H[2] + 0.03, 0.035); seg(m, STICK, col, S[0], S[1] - 0.06, S[2] - 0.02, H[0], H[1] - 0.06, H[2] + 0.02, 0.03);
      seg(m, STICK, col, B[0], B[1], B[2], 0, 0.34, 0.52, 0.025); seg(m, STICK, col, S[0], S[1] - 0.04, S[2], 0, 0.34, 0.52, 0.025); seg(m, STICK, chrome, H[0], H[1], H[2], 0, 0.34, -0.52, 0.03);
      m.add(SPHERE, dark, 0, 0.93, 0.2, 0, 0, 0, 0.14, 0.06, 0.26); m.box(0.56, 0.03, 0.03, dark, 0, 1.0, -0.42); m.add(CYL8, 0x3a3a3a, 0, 0.4, 0.04, 0, 0, Math.PI / 2, 0.16, 0.03, 0.16);
    }
    else if (kind === 'moped') { wheel(0, 0.25, -0.62, 0.25, 0.12); wheel(0, 0.25, 0.55, 0.25, 0.12); m.add(SPHERE, col, 0, 0.5, 0.25, 0, 0, 0, 0.42, 0.42, 0.9); m.box(0.3, 0.1, 0.55, dark, 0, 0.74, 0.2); m.box(0.4, 0.75, 0.16, col, 0, 0.7, -0.5, -0.25); m.box(0.62, 0.05, 0.06, chrome, 0, 1.12, -0.62); m.box(0.18, 0.12, 0.05, 0xfff3b0, 0, 0.95, -0.66); m.box(0.5, 0.06, 0.5, dark, 0, 0.3, -0.1); }
    else if (LOW || !CAR_KIND[kind]) { // the low-quality box cars (and anything unknown)
      const big = kind === 'bus', tall = kind === 'van' || kind === 'truck';
      const body = kind === 'taxi' ? 0xf7c21a : kind === 'police' ? 0xf4f1ea : kind === 'truck' ? 0xffd1e3 : kind === 'bus' ? [0x2b6cb0, 0xe8453c, 0x2f9e6e][Math.floor(Math.random() * 3)] : col;
      const L = big ? 7.6 : tall ? 4.7 : kind === 'sports' ? 4.3 : kind === 'suv' ? 4.6 : 3.9, Wd = big ? 2.3 : tall ? 1.95 : kind === 'suv' ? 1.9 : 1.75;
      const H = big ? 1.1 : tall ? 1.0 : kind === 'sports' ? 0.55 : kind === 'suv' ? 0.95 : 0.75, base = 0.32;
      m.box(Wd, H, L, body, 0, base + H / 2, 0);
      const cabL = big ? L * 0.94 : tall ? L * 0.7 : kind === 'sports' ? 1.7 : L * 0.55, cabH = big ? 1.15 : tall ? 0.95 : kind === 'sports' ? 0.42 : kind === 'suv' ? 0.7 : 0.62;
      const cabZ = big ? 0 : tall ? 0.5 : kind === 'sports' ? 0.3 : 0.15;
      m.box(Wd * (big || tall ? 0.97 : 0.88), cabH, cabL, kind === 'truck' ? 0xfdf6e8 : glass, 0, base + H + cabH / 2, cabZ);
      m.box(Wd * (big || tall ? 0.99 : 0.9), 0.06, cabL * (big ? 1 : 0.9), body, 0, base + H + cabH + 0.03, cabZ);
      if (kind === 'taxi') m.box(0.5, 0.16, 0.24, 0x1f1a3d, 0, base + H + cabH + 0.14, cabZ);
      if (kind === 'police') m.box(Wd * 1.01, 0.22, L * 0.5, 0x24324a, 0, base + H * 0.55, 0);
      if (kind === 'truck') { m.add(CONE, 0xd9a05b, 0, base + H + cabH + 0.55, cabZ, Math.PI, 0, 0, 0.5, 0.9, 0.5); m.add(SPHERE, 0xff8fb8, 0, base + H + cabH + 1.12, cabZ, 0, 0, 0, 0.62, 0.62, 0.62); }
      for (const [x, z] of [[-Wd / 2, -L * 0.33], [Wd / 2, -L * 0.33], [-Wd / 2, L * 0.33], [Wd / 2, L * 0.33]]) wheel(x, 0.34, z, 0.34, 0.26);
      const lm = new Merge();
      lm.box(Wd * 0.2, 0.14, 0.05, 0xfff6c8, -Wd * 0.32, base + H * 0.6, -L / 2 - 0.02); lm.box(Wd * 0.2, 0.14, 0.05, 0xfff6c8, Wd * 0.32, base + H * 0.6, -L / 2 - 0.02);
      lm.box(Wd * 0.2, 0.12, 0.05, 0xff2a2a, -Wd * 0.32, base + H * 0.6, L / 2 + 0.02); lm.box(Wd * 0.2, 0.12, 0.05, 0xff2a2a, Wd * 0.32, base + H * 0.6, L / 2 + 0.02);
      if (kind === 'police') { lm.box(0.3, 0.14, 0.2, 0xff3b30, -0.22, base + H + cabH + 0.12, cabZ); lm.box(0.3, 0.14, 0.2, 0x3b82f6, 0.22, base + H + cabH + 0.12, cabZ); }
      const g0 = new THREE.Group(); g0.add(m.mesh(), new THREE.Mesh(lm.build(), MAT.glow));
      g0.userData = { kind: 'vehicle', vkind: kind };
      return g0;
    }
    else { // realistic cars, taxis, police cars, vans, the ice cream truck and buses
      const s = CAR_SPEC[CAR_KIND[kind]];
      const paint = kind === 'taxi' ? 0xf7c21a : kind === 'police' ? 0xf4f1ea : kind === 'truck' ? 0xffd1e3 : kind === 'bus' ? [0x2b6cb0, 0xe8453c, 0x2f9e6e][Math.floor(Math.random() * 3)] : col;
      const at = carShape(m, s, paint, CAR_GLASS, true), top = s.roof + 0.03, cz = at.cabZ;
      const lm = new Merge();
      carLights(lm, at, s.Wd, kind === 'bus');
      if (kind === 'taxi') { m.box(0.56, 0.16, 0.26, 0x1f1a3d, 0, top + 0.08, cz); lm.box(0.46, 0.1, 0.02, 0xfff1a8, 0, top + 0.08, cz - 0.135); for (const sx of [-1, 1]) for (let k = 0; k < 8; k++) m.box(0.01, 0.07, 0.14, k % 2 ? 0x1f1a3d : 0xf4f1ea, sx * (s.Wd / 2 + 0.006), s.belt - 0.12, -1.2 + k * 0.14 + 0.6); }
      if (kind === 'police') { for (const sx of [-1, 1]) m.box(0.012, 0.36, s.L * 0.5, 0x24324a, sx * (s.Wd / 2 + 0.004), s.sill + 0.33, 0.05); m.box(1.0, 0.05, 0.26, 0x2b2e34, 0, top + 0.02, cz); lm.box(0.42, 0.12, 0.22, 0xff3b30, -0.24, top + 0.1, cz); lm.box(0.42, 0.12, 0.22, 0x3b82f6, 0.24, top + 0.1, cz); }
      if (kind === 'truck') { // an ice cream van: hatch, awning, the giant cone
        m.add(CONE, 0xd9a05b, 0, top + 0.5, 0.6, Math.PI, 0, 0, 0.5, 0.9, 0.5); m.add(SPHERE, 0xff8fb8, 0, top + 1.08, 0.6, 0, 0, 0, 0.62, 0.62, 0.62); m.add(SPHERE, 0xd94a5a, 0, top + 1.42, 0.6, 0, 0, 0, 0.14, 0.14, 0.14);
        m.box(0.02, 0.62, 1.4, 0x3a3d44, s.Wd / 2 + 0.008, s.belt + 0.4, 0.75); m.box(0.5, 0.03, 1.5, 0x9fe3d0, s.Wd / 2 + 0.24, s.roof - 0.12, 0.75, 0, 0, -0.35);
        for (let k = 0; k < 5; k++) m.box(0.02, 0.1, 0.3, k % 2 ? 0xf4f1ea : 0xff8fb8, s.Wd / 2 + 0.47, s.roof - 0.26, 0.15 + k * 0.3, 0, 0, -0.35);
      }
      if (kind === 'bus') { m.box(1.3, 0.26, 0.04, 0x1f2229, 0, s.roof - 0.25, -s.L / 2 - 0.02); lm.box(1.1, 0.14, 0.02, 0xffb020, 0, s.roof - 0.25, -s.L / 2 - 0.045); for (const z of [-2.2, 1.0]) m.box(0.02, s.roof - s.sill - 0.4, 0.95, 0x3a3d44, s.Wd / 2 + 0.006, (s.roof + s.sill) / 2 - 0.15, z); }
      const silly = opts && opts.silly;
      if (silly && kind !== 'bus' && kind !== 'truck') { // roof rails, then the silly load
        for (const sx of [-1, 1]) m.box(0.04, 0.05, (s.rb - s.rf) * 0.8, 0x2b2e34, sx * s.Wd * 0.33, top + 0.02, cz);
        const y = top + 0.06;
        if (silly === 'duck') { m.add(SPHERE, 0xffd23f, 0, y + 0.45, cz + 0.1, 0, 0, 0, 1.1, 0.8, 1.4); m.add(SPHERE, 0xffd23f, 0, y + 1.05, cz - 0.45, 0, 0, 0, 0.62, 0.62, 0.62); m.add(SPHERE, 0xff8a3d, 0, y + 0.98, cz - 0.82, 0, 0, 0, 0.32, 0.12, 0.34); for (const sx of [-1, 1]) m.add(SPHERE, 0x1c1a24, sx * 0.17, y + 1.15, cz - 0.7, 0, 0, 0, 0.08, 0.1, 0.06); m.add(SPHERE, 0xffd23f, 0, y + 0.75, cz + 0.75, -0.6, 0, 0, 0.3, 0.5, 0.2); }
        if (silly === 'mattress') { m.box(1.5, 0.22, 2.0, 0xf4efe4, 0, y + 0.13, cz, 0.04, 0, 0.03); for (let k = -2; k <= 2; k++) m.box(1.52, 0.02, 0.04, 0x8fb3d9, 0, y + 0.25, cz + k * 0.38, 0.04); for (const z of [-0.6, 0.6]) m.box(s.Wd + 0.04, 0.03, 0.05, 0xe8453c, 0, y + 0.18, cz + z); }
        if (silly === 'sofa') { m.box(1.6, 0.3, 0.8, 0x7b52c7, 0, y + 0.18, cz); m.box(1.6, 0.45, 0.2, 0x6a45ad, 0, y + 0.5, cz + 0.32); for (const sx of [-1, 1]) m.box(0.18, 0.4, 0.8, 0x6a45ad, sx * 0.8, y + 0.32, cz); m.box(0.3, 0.3, 0.12, 0xffd23f, 0.3, y + 0.45, cz + 0.12, -0.3, 0.3, 0); }
        if (silly === 'xmas') { m.add(CONE, 0x2f7a45, 0, y + 0.3, cz, Math.PI / 2, 0, 0, 0.75, 2.4, 0.75); m.add(CYL8, 0x6b4f37, 0, y + 0.3, cz + 1.35, Math.PI / 2, 0, 0, 0.14, 0.4, 0.14); for (const z of [-0.4, 0.4]) m.box(s.Wd + 0.04, 0.03, 0.05, 0xe8453c, 0, y + 0.5, cz + z); }
        if (silly === 'canoe') { m.add(SPHERE, 0xe8453c, 0, y + 0.18, cz, 0, 0, 0, 0.75, 0.32, 4.4); m.add(SPHERE, 0xf4f1ea, 0, y + 0.26, cz, 0, 0, 0, 0.6, 0.18, 4.1); }
        if (silly === 'suitcases') { const cs = [0x2b6cb0, 0xe8453c, 0x2f9e6e, 0xf2b134, 0x7b52c7]; for (let k = 0; k < 5; k++) m.box(0.75 - k * 0.08, 0.32, 0.5, cs[k], (k % 2 ? 0.08 : -0.06), y + 0.17 + k * 0.32, cz + (k % 3 - 1) * 0.08, 0, (k % 2 ? 0.25 : -0.2), 0); }
      }
      const g0 = new THREE.Group(); g0.add(m.mesh(), new THREE.Mesh(lm.build(), MAT.glow));
      g0.userData = { kind: 'vehicle', vkind: kind, silly: silly || null };
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
  // A figment's name plate (2026-11-21, the user: "each enemy has their health bar and name above their head, not in the HUD"):
  // its own little canvas (name + level on a pill coloured by rank, a health bar with a fading "just lost" part, an optional
  // hint line), redrawn only when something changed. plate.set({name, lvl, pct, rank, sub}); rank '', champ, guard, rare,
  // boss, captain, mega. World height = o.height (default 0.82 m for the two-line plate).
  const PLATE_RANK = { '': ['rgba(31,26,61,.9)', '#ffffff'], champ: ['rgba(28,80,190,.95)', '#ffffff'], guard: ['rgba(255,194,31,.97)', '#1f1a3d'],
    rare: ['rgba(214,219,227,.97)', '#1f1a3d'], boss: ['rgba(255,194,31,.97)', '#1f1a3d'], captain: ['rgba(200,16,46,.95)', '#ffffff'], mega: ['rgba(160,20,50,.95)', '#ffffff'] };
  W.foePlate = function (o) {
    o = o || {};
    const big = !!o.big, c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = big ? 640 : 400; c.height = big ? 200 : 116;
    const tex = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: !big, fog: false }));
    const hgt = o.height || (big ? 2.6 : 0.82);
    sp.scale.set(hgt * c.width / c.height, hgt, 1);
    sp.userData.h = hgt; sp.renderOrder = big ? 21 : 6;
    let key = '', shown = 1, lostT = 0;
    const draw = (s) => {
      const W0 = c.width, H0 = c.height, pad = big ? 10 : 6, fs = big ? 44 : 30;
      g.clearRect(0, 0, W0, H0);
      const [bg, fg] = PLATE_RANK[s.rank || ''] || PLATE_RANK[''];
      g.font = '800 ' + fs + 'px Nunito, system-ui, ' + EMOJI_FONT;
      const text = (s.name || '') + (s.lvl ? '  Lv ' + s.lvl : '');
      const tw = Math.min(W0 - 8, g.measureText(text).width + fs * 0.9), th = fs * 1.3, tx = (W0 - tw) / 2;
      g.fillStyle = bg; g.beginPath(); if (g.roundRect) g.roundRect(tx, 2, tw, th, th * 0.35); else g.rect(tx, 2, tw, th); g.fill();
      g.lineWidth = 3; g.strokeStyle = '#1f1a3d'; g.stroke();
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, W0 / 2, 2 + th / 2 + fs * 0.04, W0 - 16);
      // the bar: dark track, a pale "just lost" part, then the health colour (green > yellow > red)
      const by = th + pad + 2, bh = big ? 34 : 22, bw = W0 - pad * 4, bx = pad * 2, p = Math.max(0, Math.min(1, s.pct)), q = Math.max(p, Math.min(1, s.ghost == null ? p : s.ghost));
      g.fillStyle = '#1f1a3d'; g.beginPath(); if (g.roundRect) g.roundRect(bx - 3, by - 3, bw + 6, bh + 6, (bh + 6) / 2); else g.rect(bx - 3, by - 3, bw + 6, bh + 6); g.fill();
      if (q > p) { g.fillStyle = '#ffe9a8'; g.fillRect(bx, by, bw * q, bh); }
      g.fillStyle = p > 0.5 ? '#35d07f' : p > 0.25 ? '#ffc21f' : '#ff3b5c'; g.fillRect(bx, by, bw * p, bh);
      g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(bx, by, bw * p, bh * 0.4);
      if (s.sub) { g.font = '800 ' + Math.round(fs * 0.62) + 'px Nunito, system-ui, ' + EMOJI_FONT; g.lineWidth = 6; g.strokeStyle = '#1f1a3d'; g.strokeText(s.sub, W0 / 2, by + bh + fs * 0.62, W0 - 12); g.fillStyle = '#ffe36b'; g.fillText(s.sub, W0 / 2, by + bh + fs * 0.62, W0 - 12); }
      tex.needsUpdate = true;
    };
    sp.userData.plate = {
      // dt-driven: the "just lost" part catches up after a short pause
      set(s, dt) {
        const p = Math.max(0, Math.min(1, s.pct));
        if (p < shown - 0.001) { lostT += dt || 0; if (lostT > 0.45) shown = Math.max(p, shown - (dt || 0) * 0.9); } else { shown = p; lostT = 0; }
        const k = (s.name || '') + '|' + (s.lvl || '') + '|' + (s.rank || '') + '|' + Math.round(p * 200) + '|' + Math.round(shown * 100) + '|' + (s.sub || '');
        if (k === key) return;
        key = k; draw(Object.assign({}, s, { ghost: shown }));
      },
      dispose() { tex.dispose(); sp.material.dispose(); },
    };
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
  // A swing shows its reach (2026-11-19, the user: "different weapons to bonk with... I want to see them have different
  // ranges"): a bright crescent as far out as the weapon reaches, as wide as its arc (degrees).
  const arcGeos = new Map(), arcs = [];
  function arcGeo(r, deg) {
    const key = r.toFixed(1) + ':' + Math.round(deg);
    let g = arcGeos.get(key);
    if (!g) { const a = Math.min(Math.PI * 2, deg * Math.PI / 180); g = new THREE.RingGeometry(Math.max(0.3, r - Math.max(0.4, r * 0.3)), r, Math.max(8, Math.round(deg / 8)), 1, -a / 2, a); g.rotateX(-Math.PI / 2); arcGeos.set(key, g); }
    return g;
  }
  function arcFx(r, deg, y, col, life, ground) {
    const m = new THREE.Mesh(arcGeo(r, deg), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    m.position.set(player.pos.x, y, player.pos.z); m.rotation.y = player.face + Math.PI / 2; m.renderOrder = 3;
    scene.add(m); arcs.push({ m, t: 0, life, ground });
  }
  W.swing = function (reach, arc) { swingT = 0.3; if (reach) arcFx(reach, arc || 160, player.pos.y + 1.05, 0xfff6d0, 0.26); };
  W.showReach = function (reach) { if (reach) arcFx(reach, 360, player.pos.y + 0.3, 0xffc21f, 1.6, true); };
  W.arcCount = () => arcs.length;
  // The bonk reach on the ground, all the time (2026-11-21, the user: "a visual indication how far the melee attack reaches").
  // cft-fun.js feeds W.reachMarker({r, arc, hot, ranged}) every tick (r = the real hit distance for an ordinary figment,
  // arc = the weapon's swing in degrees). A faint fan + a gold edge in front of you; pink and pulsing when a figment is
  // inside it (a swing now would hit). Hidden on rides, while aiming, in cut-scenes, in the wardrobe; null hides it.
  const reachFill = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  const reachEdge = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xffc21f, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  const reachLine = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x1f1a3d, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, fog: false }));   // a dark rim: the gold reads on bright paint too
  reachFill.renderOrder = 2; reachLine.renderOrder = 3; reachEdge.renderOrder = 4; reachFill.visible = reachEdge.visible = reachLine.visible = false;
  scene.add(reachFill, reachLine, reachEdge);
  const reachGeos = new Map();
  let reachInfo = null, reachKey = '';
  function reachGeo(r, deg, edge) {
    const key = (edge || 'f') + r.toFixed(2) + ':' + Math.round(deg);
    let g = reachGeos.get(key);
    if (!g) {
      const a = Math.min(Math.PI * 2, deg * Math.PI / 180), seg = Math.max(10, Math.round(deg / 6));
      const [r0, r1] = edge === 'o' ? [r + 0.04, r + 0.12] : edge ? [Math.max(0.2, r - 0.11), r + 0.04] : [0.55, r - 0.11];
      g = new THREE.RingGeometry(r0, r1, seg, 1, -a / 2, a); g.rotateX(-Math.PI / 2); reachGeos.set(key, g);
    }
    return g;
  }
  W.reachMarker = function (info) { reachInfo = info; };
  W.reachShown = () => reachEdge.visible;
  W.reachRadius = () => (reachInfo ? reachInfo.r : 0);
  W.reachHeight = () => reachEdge.position.y - player.pos.y;   // tests: how far above your feet the arc floats
  function updateReach() {
    const i = reachInfo;
    const show = !!i && !i.ranged && ride.mode === 'foot' && !W.aiming && !W.cine && !W.showOff && avatar.visible && !player.climb && !W.tether;
    reachFill.visible = reachEdge.visible = reachLine.visible = show;
    if (!show) return;
    const key = i.r.toFixed(2) + ':' + Math.round(i.arc);
    if (key !== reachKey) { reachKey = key; reachFill.geometry = reachGeo(i.r, i.arc, null); reachEdge.geometry = reachGeo(i.r, i.arc, 'e'); reachLine.geometry = reachGeo(i.r, i.arc, 'o'); }
    const fx = -Math.sin(player.face), fz = -Math.cos(player.face), px = player.pos.x, pz = player.pos.z;   // higher than the road and whatever rises ahead (2026-11-21)
    const y = Math.max(player.pos.y, standAt(px + fx * i.r * 0.5, pz + fz * i.r * 0.5), standAt(px + fx * i.r, pz + fz * i.r)) + 0.3, rot = player.face + Math.PI / 2;
    reachFill.position.set(player.pos.x, y, player.pos.z); reachLine.position.set(player.pos.x, y + 0.004, player.pos.z); reachEdge.position.set(player.pos.x, y + 0.008, player.pos.z);
    reachFill.rotation.y = reachEdge.rotation.y = reachLine.rotation.y = rot;
    const pulse = i.hot ? 0.75 + 0.25 * Math.sin(performance.now() / 90) : 1;
    reachEdge.material.color.setHex(i.hot ? 0xff5c8a : 0xffc21f); reachEdge.material.opacity = i.hot ? 0.95 * pulse : 0.75;
    reachFill.material.color.setHex(i.hot ? 0xff5c8a : 0xffffff); reachFill.material.opacity = i.hot ? 0.16 : 0.07;
  }
  // Rainbow light guides on the floor (2026-11-19, the user: "when a monster is nearby a little wave of rainbow energy
  // emanates towards it on the floor... the arrow on the head is for missions"): chevrons run from you to (x, z) in two waves.
  const CHEV = (() => { const g = new THREE.BufferGeometry(), v = [-0.9, 0, 0.35, 0, 0, -0.55, 0, 0, -0.05, -0.9, 0, 0.35, 0, 0, -0.05, -0.9, 0, 0.8, 0.9, 0, 0.35, 0, 0, -0.05, 0, 0, -0.55, 0.9, 0, 0.35, 0.9, 0, 0.8, 0, 0, -0.05];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g; })();
  const guides = [];
  W.guide = function (x, z, o) {
    o = o || {};
    const px = player.pos.x, pz = player.pos.z, dx = x - px, dz = z - pz, d = Math.hypot(dx, dz);
    if (d < 4) return null;
    const ux = dx / d, uz = dz / d, end = Math.min(d - 1.5, o.max || 80), step = 2.4, list = [];
    for (let s0 = 2.2, i = 0; s0 <= end && i < 34; s0 += step, i++) {
      const cx = px + ux * s0, cz = pz + uz * s0;
      const m = new THREE.Mesh(CHEV, new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL((i * 0.075 + (o.hue || 0)) % 1, 1, 0.6), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      m.position.set(cx, Math.max(standAt(cx, cz), surfaceAt(cx, cz, player.pos.y + 2)) + 0.32, cz); m.rotation.y = Math.atan2(-ux, -uz); m.renderOrder = 5; m.scale.set(1.2, 1, 1.2);   // above the road drape (it sits a little over the terrain)
      scene.add(m); list.push({ m, s: s0 });
    }
    const g = { list, t: 0, end, speed: o.speed || 34, waves: o.waves || 2 };
    guides.push(g);
    return g;
  };
  W.guides = () => guides.length;
  function updateArcs(dt) {
    updateReach();
    updateColorWaves(dt);
    for (let i = arcs.length - 1; i >= 0; i--) {
      const a = arcs[i]; a.t += dt; const k = a.t / a.life;
      if (k >= 1) { scene.remove(a.m); a.m.material.dispose(); arcs.splice(i, 1); continue; }
      a.m.material.opacity = (a.ground ? 0.4 : 0.42) * (1 - k * k);
      if (!a.ground) a.m.scale.setScalar(0.85 + 0.15 * Math.min(1, k * 3)); else a.m.position.set(player.pos.x, a.m.position.y, player.pos.z);
    }
    for (let i = guides.length - 1; i >= 0; i--) {
      const g = guides[i]; g.t += dt;
      let alive = false;
      for (const c of g.list) {
        let op = 0;
        for (let w = 0; w < g.waves; w++) { const head = (g.t - w * 0.5) * g.speed, k = head - c.s; if (k > 0) op = Math.max(op, k < 3 ? k / 3 : Math.max(0, 1 - (k - 3) / 10)); if (head < c.s + 13) alive = true; }
        c.m.material.opacity = op * 0.85;
        const sc = 1 + op * 0.5; c.m.scale.set(sc, 1, sc);
      }
      if (!alive) { for (const c of g.list) { scene.remove(c.m); c.m.material.dispose(); } guides.splice(i, 1); }
    }
  }
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
    if (player.carAir && ride.mode !== 'drive') { player.vy = Math.min(player.vy, 0); player.pitch = 0; }
    player.carAir = null; player.onRamp = null; player.boostT = 0;
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
      // car stunts (2026-11-19, cft-stunt.js): W.ramps launch you, Space hops, and in the air W/S flip, A/D spin, Space
      // barrel-rolls (player.carAir). Land on four wheels or wipe out. Boost pads set player.boostT.
      const air = player.carAir;
      const hx = -Math.sin(player.heading), hz = -Math.cos(player.heading), back = player.speed < 0 ? -1 : 1;
      if (!air) {
        const boost = ctl && (input.sprint || Math.abs(input.jy) > 0.95);
        player.slope = slopeAlong(hx * back, hz * back);
        const bst = player.boostT > 0 ? STUNT.boostMul : 1;
        if (player.boostT > 0) player.boostT -= dt;
        const top = (boost || bst > 1 ? ride.run : ride.walk) * bst * (W.speedMul || 1) * slopeMul(player.slope);
        const target = fwdIn > 0 || bst > 1 ? top * (bst > 1 ? 1 : Math.min(1, fwdIn)) : fwdIn < 0 ? -top * 0.35 * Math.min(1, -fwdIn) : 0;
        const rate = (Math.sign(target - player.speed) === Math.sign(player.speed) || player.speed === 0) ? ride.accel * (bst > 1 ? 3 : 1) : ride.accel * 2;
        player.speed += Math.max(-rate * dt, Math.min(rate * dt, target - player.speed));
        if (!fwdIn && bst === 1) player.speed *= Math.exp(-0.8 * dt);
        const steer = Math.max(-1, Math.min(1, sideIn));
        player.heading -= steer * ride.turn * dt * Math.max(-1, Math.min(1, player.speed / 6));
      } else carAirTick(air, dt, ctl, fwdIn, sideIn);
      player.vel.set(-Math.sin(player.heading) * player.speed, 0, -Math.cos(player.heading) * player.speed);
      player.pos.x += player.vel.x * dt; player.pos.z += player.vel.z * dt;
      if (collide(player.pos, ride.radius, player.pos.y)) { player.speed *= 0.6; if (Math.abs(player.speed) > 4) W.lastHit = performance.now(); }
      const lowAir = !air || player.pos.y - groundAt(player.pos.x, player.pos.z) < 1.4;
      // driving into street furniture, trees and parked cars smashes them (the game decides what that's worth: W.onDriveHit)
      if (lowAir && Math.abs(player.speed) > 4.5 && W.onDriveHit) {
        const hx2 = -Math.sin(player.heading) * Math.sign(player.speed), hz2 = -Math.cos(player.heading) * Math.sign(player.speed);
        const e = W.propNear(player.pos.x + hx2 * ride.radius, player.pos.z + hz2 * ride.radius, ride.radius + 0.5, { cars: Math.abs(player.speed) > 9 });
        if (e) { W.onDriveHit(e, Math.abs(player.speed), { x: hx2, z: hz2 }); player.speed *= e.car ? 0.45 : e.k === 'tree' || e.k === 'lamp' ? 0.7 : 0.88; }
      }
      const pc = !air ? carAt(player.pos.x, player.pos.z, ride.radius * 0.5) : null;
      if (pc) { // squeeze past parked cars
        const dx = player.pos.x - pc.x, dz = player.pos.z - pc.z, across = -dx * pc.uz + dz * pc.ux, sd = across >= 0 ? 1 : -1, push = (0.95 + ride.radius * 0.5 - Math.abs(across)) * sd;
        player.pos.x += -pc.uz * push; player.pos.z += pc.ux * push; player.speed *= 0.97;
      }
      player.face = player.heading;
      if (performance.now() - cam.lookT > 1500) cam.yaw += angDiff(player.heading, cam.yaw) * Math.min(1, dt * 2.5);
      carVertical(dt, ctl);
      if (!player.carAir) player.pitch += (Math.atan(slopeAlong(hx, hz)) - player.pitch) * Math.min(1, dt * 8);
    } else {
      const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
      let fwd = fwdIn, side = sideIn;
      const len = Math.hypot(fwd, side);
      if (len > 1) { fwd /= len; side /= len; }
      const running = ctl && !W.noRun && (input.sprint || Math.hypot(input.jx, input.jy) > 0.92);
      const dirX = -sy * fwd + cy * side, dirZ = -cy * fwd - sy * side;
      player.slope = slopeAlong(dirX, dirZ);
      const speed = (running && !W.blocking && !W.aiming ? ride.run : ride.walk) * (W.speedMul || 1) * slopeMul(player.slope) * (W.blocking ? 0.45 : W.aiming ? 0.75 : 1);
      const tx = dirX * speed, tz = dirZ * speed;
      const k = 1 - Math.exp(-(player.grounded ? (ride.mode === 'ride' ? 5.5 : 15) : player.noGrab > 0 ? 0.6 : 3.5) * dt);   // just jumped off a wall: momentum first
      player.vel.x += (tx - player.vel.x) * k; player.vel.z += (tz - player.vel.z) * k;
      // climbing (2026-11-18, Breath of the Wild-style): hold forward against a building and you go up it, paying stamina
      // (W.stam, set by cft-wild.js). The wall normal comes from collide's push-back each frame.
      const cl = player.climb;
      if (cl) { const tgx = -cl.nz, tgz = cl.nx, sd = ctl ? sideIn : 0; player.vel.x = -cl.nx * 2.5 + tgx * sd * 1.5; player.vel.z = -cl.nz * 2.5 + tgz * sd * 1.5; }
      // the web (2026-11-19, cft-aim.js sets W.tether = {x, y, z, v0, acc, max, life}): it reels you in toward where it stuck.
      // Jump lets go with a hop; reaching the wall = grab it (climb) or pull up onto the roof.
      const teth = !cl && ride.mode === 'foot' ? W.tether : null;
      let tethD = Infinity;
      if (teth) {
        teth.t = (teth.t || 0) + dt;
        const dx = teth.x - player.pos.x, dy = teth.y - (player.pos.y + 1.1), dz = teth.z - player.pos.z;
        tethD = Math.hypot(dx, dy, dz) || 1e-6;
        const sp = Math.min(teth.max || 30, (teth.v0 || 8) + (teth.acc || 60) * teth.t), sd = ctl ? sideIn * 2.5 : 0;
        if (ctl && input.jump) { // let go: keep the speed, add a hop (web-swing style)
          W.tether = null; player.vy = Math.max(player.vy, 9.5); player.jumps = 1; input.jump = false; player.grounded = false;
          if (W.onTetherEnd) W.onTetherEnd('jump');
        } else if (tethD > 1.5) {
          player.vel.x = dx / tethD * sp + cy * sd; player.vel.z = dz / tethD * sp - sy * sd;
          player.vy = dy / tethD * sp + 1.2; player.grounded = false;
        }
      }
      player.pos.x += player.vel.x * dt; player.pos.z += player.vel.z * dt;
      const preX = player.pos.x, preZ = player.pos.z;
      const wallHit = collide(player.pos, ride.radius, player.pos.y);
      // everything is jumpable (campaign update): a wall you run into in the air can be kicked off (wall jump), and a roof
      // edge within reach pulls you up (mantle). Roofs are walkable (roofAt below).
      let wnx = player.pos.x - preX, wnz = player.pos.z - preZ;
      const wnl = Math.hypot(wnx, wnz);
      if (wnl > 1e-4) { wnx /= wnl; wnz /= wnl; }
      const into = wnl > 1e-4 ? -(dirX * wnx + dirZ * wnz) : 0;   // how hard you push into the wall (1 = straight at it)
      if (player.noGrab > 0) player.noGrab -= dt;   // just jumped off a wall: don't stick straight back onto it
      const stam = W.stam;
      if (teth && W.tether === teth && (tethD < 1.6 || (wallHit && wnl > 1e-4 && tethD < 5.5) || teth.t > (teth.life || 3.2))) {
        W.tether = null;
        const nx = wallHit && wnl > 1e-4 ? wnx : 0, nz = wallHit && wnl > 1e-4 ? wnz : 0;
        const rf = nx || nz ? roofAt(player.pos.x - nx * 0.7, player.pos.z - nz * 0.7) : null;
        let how = 'drop';
        if (rf != null && rf - player.pos.y < 2.4 && rf - player.pos.y > -1) { // the web stuck near the top: up and over
          player.pos.x -= nx * 0.8; player.pos.z -= nz * 0.8; player.pos.y = rf + 0.05; player.vy = 2.5; player.jumps = 1; how = 'roof';
        } else if ((nx || nz) && (!stam || stam.can('climb'))) { // stick to the wall, ready to climb
          player.climb = { nx, nz, t: 0, lost: 0 }; player.vy = 0; player.vel.set(0, 0, 0); how = 'wall';
        } else { player.vy = Math.max(player.vy * 0.3, 3); player.vel.x *= 0.4; player.vel.z *= 0.4; }
        if (W.onTetherEnd) W.onTetherEnd(how);
      }
      if (cl) {
        cl.t += dt;
        if (wallHit && wnl > 1e-4) { cl.nx = wnx; cl.nz = wnz; cl.lost = 0; } else cl.lost += dt;
        const rf = roofAt(player.pos.x - cl.nx * 0.7, player.pos.z - cl.nz * 0.7);
        const up = ctl ? fwdIn : 0;
        if (rf != null && rf - player.pos.y < 1.1 && up > 0) { // over the top
          player.pos.x -= cl.nx * 0.75; player.pos.z -= cl.nz * 0.75; player.pos.y = rf + 0.05; player.vy = 2; player.jumps = 1; player.climb = null;
          if (W.onMantle) W.onMantle();
        } else if (cl.lost > 0.25 || !ctl || (stam && !stam.can('hang'))) { // let go (or too tired to hold on)
          player.climb = null; if (stam && !stam.can('hang') && W.onTired) W.onTired();
        } else if (input.jump && input.sprint && (!stam || stam.use('climbjump'))) { // Shift + Space: a burst up the wall
          player.vy = 7.6; input.jump = false; if (W.onClimbJump) W.onClimbJump();
        } else if (input.jump) { // Space: jump off the building (2026-11-19, the user: "space bar jumps off the building if
          // the user is climbing it"): up and away from the wall, steered by A/D, and no re-grabbing for a moment
          const tgx = -cl.nz, tgz = cl.nx, sd = ctl ? sideIn : 0;
          player.climb = null; player.vy = ride.jump * 1.15; player.vel.x = cl.nx * 8.5 + tgx * sd * 4; player.vel.z = cl.nz * 8.5 + tgz * sd * 4;
          player.jumps = 1; player.noGrab = 0.5; player.face = Math.atan2(-player.vel.x, -player.vel.z); input.jump = false;
          W.burst(player.pos.x, player.pos.y + 0.8, player.pos.z, '💨', 4, { up: 0.5, spread: 1.4, size: 0.5, life: 0.5 });
          if (W.onWallJump) W.onWallJump();
        } else {
          if (player.vy > 1.6 || player.vy < -1.6 || !input.jump) player.vy += ((up > 0.2 ? 1.6 : up < -0.2 ? -2.4 : 0) - player.vy) * Math.min(1, dt * 10);
          if (stam) stam.use(up > 0.2 || Math.abs(sideIn) > 0.2 ? 'climb' : 'hang', dt);
          player.face = Math.atan2(cl.nx, cl.nz);
        }
        input.jump = false;
      } else if (wallHit && wnl > 1e-4 && ctl && into > 0.55 && fwdIn > 0.3 && stam && stam.can('climb') && ride.mode === 'foot' && !W.blocking && !(player.noGrab > 0)) {
        // grab the wall: straight away in the air, after a short push from the ground (so brushing a wall doesn't stick)
        player.climbPush = player.grounded ? (player.climbPush || 0) + dt : 1;
        const rf0 = roofAt(player.pos.x - wnx * 0.7, player.pos.z - wnz * 0.7);
        if (player.climbPush > 0.22 && !(rf0 != null && rf0 - player.pos.y < 1.7 && !player.grounded)) {
          player.climb = { nx: wnx, nz: wnz, t: 0, lost: 0 }; player.vy = 0; player.grounded = false; player.pos.y += 0.05; player.climbPush = 0;
          if (W.onClimb) W.onClimb();
        }
      } else player.climbPush = 0;
      if (!player.climb && wallHit && wnl > 1e-4 && !player.grounded) {
        const rf = roofAt(player.pos.x - wnx * 0.7, player.pos.z - wnz * 0.7);
        if (rf != null && rf - player.pos.y < 1.7 && rf - player.pos.y > -0.5 && player.vy > -6 && ctl && (fwdIn || sideIn)) { // mantle onto the roof
          player.pos.x -= wnx * 0.75; player.pos.z -= wnz * 0.75; player.pos.y = rf + 0.05; player.vy = 2; player.jumps = 1;
          if (W.onMantle) W.onMantle();
        } else if (ctl && input.jump && ride.jump > 0) { // wall jump: up and away from the wall, as often as you like
          player.vy = ride.jump * 1.55; player.vel.x += wnx * 7; player.vel.z += wnz * 7; player.jumps = 1; input.jump = false;
          W.burst(player.pos.x, player.pos.y + 1, player.pos.z, '💨', 4, { up: 0.5, spread: 1.4, size: 0.5, life: 0.5 });
          if (W.onWallJump) W.onWallJump();
        }
      }
      // a perfect-dodge hop: jump while blocking = a quick hop away (sideways with A/D, else backwards). cft-wild.js times it.
      if (ctl && input.jump && W.blocking && player.grounded && !player.climb) {
        let hx = dirX, hz = dirZ;
        if (Math.hypot(hx, hz) < 0.2 || fwdIn > 0.3) { hx = Math.sin(player.face); hz = Math.cos(player.face); }
        const hl = Math.hypot(hx, hz) || 1;
        player.vel.x = hx / hl * 11; player.vel.z = hz / hl * 11; player.vy = 4.8; player.grounded = false; player.jumps = 2; input.jump = false;
        W.burst(player.pos.x, player.pos.y + 0.3, player.pos.z, '💨', 4, { up: 0.4, spread: 1.6, size: 0.5, life: 0.4 });
        if (W.onDodge) W.onDodge();
      }
      if (ctl && input.jump && ride.jump > 0) {
        if (player.grounded) { player.vy = ride.jump; player.grounded = false; player.jumps = 1; }
        else if ((player.jumps || 0) < 2) { // a second jump in the air
          player.vy = ride.jump * 0.92; player.jumps = 2;
          W.burst(player.pos.x, player.pos.y + 0.2, player.pos.z, '💨', 4, { up: 0.5, spread: 1.6, size: 0.5, life: 0.5 });
          if (W.onJump2) W.onJump2();
        }
      }
      // gravity: W.gravMul (a low-gravity street event), W.flyHook (cft-chaos.js: jetpack thrust, gliding) may change it
      let grav = player.climb || (W.tether && ride.mode === 'foot') ? 0 : GRAV * (W.gravMul || 1);
      if (W.flyHook && !player.climb) grav = W.flyHook(dt, player, input, grav, ctl);
      player.vy -= grav * dt;
      player.pos.y += player.vy * dt;
      // stay on the ground going downhill (instead of hopping), land when falling onto it
      let gy = surfaceAt(player.pos.x, player.pos.z, player.pos.y + 0.6);
      const hs0 = Math.hypot(player.vel.x, player.vel.z);
      const roofY = roofAt(player.pos.x, player.pos.z), onRoof = roofY != null && player.pos.y > roofY - 0.6;
      if (onRoof) gy = Math.max(gy, roofY);
      // bouncy (campaign update): falling onto a figment's head stomps it, onto a bench / bin / hydrant / gnome... bounces you
      // higher with every bounce in a row; a hard landing on a roof bounces too. The ground stays solid.
      if (player.vy < -2 && !player.grounded) {
        const st = W.stompHook && W.stompHook(player.pos.x, player.pos.y, player.pos.z);
        if (st) { player.chain = (player.chain || 0) + 1; player.vy = st * Math.min(1.5, 1 + 0.1 * player.chain); player.jumps = 1; }
        else if (player.pos.y - gy < 1.5 && player.pos.y - gy > 0.25) {
          const e = W.propNear(player.pos.x, player.pos.z, 0.75);
          if (e && e.k !== 'tree' && e.k !== 'lamp') {
            player.chain = (player.chain || 0) + 1;
            player.vy = Math.max(11.5, -player.vy * 0.8) * Math.min(1.6, 1 + 0.12 * player.chain); player.jumps = 1;
            W.burst(player.pos.x, player.pos.y, player.pos.z, '⭐', 4, { spread: 2, size: 0.4 });
            if (W.onPropBounce) W.onPropBounce(e, player.chain);
          }
        }
      }
      if (onRoof && player.vy < -11 && player.pos.y <= gy) { // a hard landing on a roof: BOING
        player.chain = (player.chain || 0) + 1; player.vy = -player.vy * 0.55; player.pos.y = gy + 0.05; player.jumps = 1;
        if (W.onPropBounce) W.onPropBounce({ k: 'roof', x: player.pos.x, z: player.pos.z }, player.chain);
      }
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
      if (player.climb && player.grounded && player.vy <= 0) player.climb = null;
      if (wasAir && player.grounded) { player.jumps = 0; player.chain = 0; if (player.fell > 0.45) W.burst(player.pos.x, gy + 0.1, player.pos.z, '💨', 3, { up: 0.3, spread: 2, size: 0.45, life: 0.45 }); player.fell = 0; }
      if (!player.grounded) player.fell = (player.fell || 0) + dt;
      const tilt = ride.mode === 'ride' && player.grounded ? Math.atan(slopeAlong(-Math.sin(player.face), -Math.cos(player.face))) : 0;
      player.pitch += (tilt - player.pitch) * Math.min(1, dt * 8);
      const hs = Math.hypot(player.vel.x, player.vel.z);
      player.speed = hs;
      if (W.aiming && ride.mode === 'foot' && !player.climb) player.face += angDiff(cam.yaw, player.face) * Math.min(1, dt * 22);   // aiming: you face the sight
      else if (hs > 0.3) { const da = angDiff(Math.atan2(-player.vel.x, -player.vel.z), player.face); player.face += da * Math.min(1, dt * (ride.mode === 'ride' ? 6 : 14)); }
      player.running = running && hs > 1;
    }
    input.jump = false;
    const moved = Math.hypot(player.pos.x - sx, player.pos.z - sz);
    if (moved < 5) { player.moved += moved; if (!ride.kind) player.footMoved += moved; }
    // pose
    if (body) {
      const k = ride.kind;
      if (player.climb) { // hand over hand up the wall
        W.animate(body, 0, dt, 'air');
        const u = body.userData, ph = player.climb.t * (Math.abs(player.vy) > 0.3 || Math.abs(sideIn) > 0.2 ? 9 : 0);
        u.armL.rotation.x = 2.7 + Math.sin(ph) * 0.35; u.armR.rotation.x = 2.7 - Math.sin(ph) * 0.35; u.elbowL.rotation.x = 0.5; u.elbowR.rotation.x = 0.5;
        u.legL.rotation.x = 0.5 + Math.sin(ph + 1.6) * 0.35; u.legR.rotation.x = 0.5 - Math.sin(ph + 1.6) * 0.35; u.kneeL.rotation.x = -0.9; u.kneeR.rotation.x = -0.9;
      } else if (!player.grounded) W.animate(body, 0, dt, 'air');
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
      // aiming (hold the right mouse button, 2026-11-19): the arm points along the sight
      const ak = body.userData.aimK = (body.userData.aimK || 0) + ((W.aiming && !ride.kind && !player.climb ? 1 : 0) - (body.userData.aimK || 0)) * Math.min(1, dt * 16);
      if (ak > 0.02 && swingT <= 0) {
        const u = body.userData, pr = Math.max(-1.35, Math.min(0.9, cam.pitch - 0.3));
        u.armR.rotation.x += (1.55 - pr - u.armR.rotation.x) * ak; u.armR.rotation.z += (-0.12 - u.armR.rotation.z) * ak; u.elbowR.rotation.x += (0.08 - u.elbowR.rotation.x) * ak;
        u.armL.rotation.x += (0.9 - u.armL.rotation.x) * ak; u.elbowL.rotation.x += (1.2 - u.elbowL.rotation.x) * ak;
      }
      if (W.tether && !ride.kind) { const u = body.userData; u.armR.rotation.x = 2.6; u.elbowR.rotation.x = 0.1; u.legL.rotation.x = 0.6; u.kneeL.rotation.x = -1.1; u.legR.rotation.x = -0.2; u.kneeR.rotation.x = -0.5; }
      // guarding (hold G or the shield button): fists or shield up in front of the face
      const bk = body.userData.block = (body.userData.block || 0) + ((W.blocking && !ride.kind ? 1 : 0) - (body.userData.block || 0)) * Math.min(1, dt * 18);
      if (bk > 0.02) {
        const u = body.userData;
        u.armL.rotation.x += (1.35 - u.armL.rotation.x) * bk; u.armL.rotation.z += (0.55 - u.armL.rotation.z) * bk; u.elbowL.rotation.x += (1.45 - u.elbowL.rotation.x) * bk;
        if (swingT <= 0) { u.armR.rotation.x += (1.2 - u.armR.rotation.x) * bk; u.armR.rotation.z += (-0.45 - u.armR.rotation.z) * bk; u.elbowR.rotation.x += (1.6 - u.elbowR.rotation.x) * bk; }
        u.body.rotation.x += (-0.12 - u.body.rotation.x) * bk;
      }
      const sh = body.userData.shield;
      if (sh) { // carried on the forearm, raised in front when guarding
        sh.position.set(-0.43 + 0.36 * bk, 1.02 + 0.22 * bk, 0.03 - 0.5 * bk);
        sh.rotation.set(0, Math.PI / 2 * (1 - bk), 0);
      }
    }
    avatar.position.copy(player.pos);
    avatar.rotation.y = player.face;
    avatar.rotation.x = player.pitch;
    avatar.rotation.z = 0;
    const ca = ride.mode === 'drive' && player.carAir;
    if (ca) { // flips, spins and rolls turn the car around its middle, not its wheels
      avatar.rotation.set(player.pitch + ca.pitch, player.face + ca.spin, ca.roll);
      const c = STUNT.pivot, v = _sv.set(0, c, 0).applyQuaternion(avatar.quaternion);
      avatar.position.x -= v.x; avatar.position.y += c - v.y; avatar.position.z -= v.z;
    }
  }

  // ---------------------------------------------------------------- car stunts (2026-11-19, the user: "add more things for
  // doing car tricks. They appear as you get in the car. Get some air time, have some fun doing flips and jumping through
  // rings of fire"). cft-stunt.js places the ramps (W.ramps) and scores; the physics lives here.
  // ramp: {x, z (where it starts), ux, uz (the way it launches), L, H, w, gS, gE (ground at start / lip), vy (launch speed up), ref (speed it is built for)}
  const STUNT = Object.assign({ airG: 0.6, hop: 7.5, flipRate: 8.4, spinRate: 7.4, rollRate: 10.5, landTol: 0.75, spinTol: 0.8, boostMul: 1.3, pivot: 0.75, assist: 2.2 }, (opts.tune && opts.tune.stunt) || {});
  W.STUNT = STUNT; W.GRAV = GRAV;
  W.ramps = [];
  const _sv = new THREE.Vector3();
  const TAU = Math.PI * 2;
  const wrapPi = a => a - TAU * Math.round(a / TAU);
  // The ramp surface under (x, z): {y, r, a (metres up the ramp)} or null. A ramp only carries you if you came on at the
  // bottom (from behind or the side you drive through it: cartoon physics, no invisible walls).
  function rampAt(x, z, y) {
    let best = null;
    for (const r of W.ramps) {
      if (r.k != null && r.k < 0.999) continue;   // still popping in / out
      const dx = x - r.x, dz = z - r.z, a = dx * r.ux + dz * r.uz;
      if (a < 0 || a > r.L) continue;
      const c = -dx * r.uz + dz * r.ux;
      if (Math.abs(c) > r.w / 2) continue;
      const sy = r.gS + (r.gE - r.gS) * a / r.L + r.H * a / r.L;
      if (player.onRamp !== r && a > r.L * 0.4 && !(y != null && y >= sy - 0.3)) continue;
      if (!best || sy > best.y) best = { y: sy, r, a };
    }
    return best;
  }
  W.rampAt = rampAt;
  // Up you go: vy (m/s), why ('ramp' | 'hop' | 'drop'), ramp
  function carLaunch(vy, why, r) {
    player.carAir = { t: 0, vy0: vy, why, ramp: r || null, pitch: 0, spin: 0, roll: 0, pv: 0, sv: 0, rv: 0, rollTo: 0, maxH: 0, x0: player.pos.x, z0: player.pos.z, flipsSeen: 0, spinsSeen: 0, rollsSeen: 0, crash: false, bounces: 0 };
    player.vy = vy; player.grounded = false; player.onRamp = null;
    if (W.onCarAir) W.onCarAir(player.carAir);
  }
  W.carLaunch = carLaunch;
  function carAirTick(a, dt, ctl, fwdIn, sideIn) {
    a.t += dt;
    if (a.crash) { a.pitch += a.pv * dt; a.spin += a.sv * dt; a.roll += a.rv * dt; player.speed *= Math.exp(-1.2 * dt); return; }
    const fi = ctl ? Math.max(-1, Math.min(1, fwdIn)) : 0, si = ctl ? Math.max(-1, Math.min(1, sideIn)) : 0;
    a.pv += (-fi * STUNT.flipRate - a.pv) * Math.min(1, dt * 7);   // W = nose down (front flip), S = back flip
    a.sv += (-si * STUNT.spinRate - a.sv) * Math.min(1, dt * 7);   // A / D = spin
    a.pitch += a.pv * dt; a.spin += a.sv * dt;
    if (!fi) a.pitch += (TAU * Math.round(a.pitch / TAU) - a.pitch) * Math.min(1, dt * STUNT.assist);   // let go and the nose levels out
    if (!si) a.spin += (Math.PI * Math.round(a.spin / Math.PI) - a.spin) * Math.min(1, dt * STUNT.assist);
    if (ctl && input.jump) { a.rollTo += TAU * (si > 0.2 ? -1 : 1); input.jump = false; }   // Space = a barrel roll (queue several)
    const rd = a.rollTo - a.roll;
    a.roll += Math.sign(rd) * Math.min(Math.abs(rd), STUNT.rollRate * dt);
    // the moment a trick completes, the game shouts it (W.onCarTrick)
    const fl = Math.floor((Math.abs(a.pitch) + 0.6) / TAU), sp = Math.floor((Math.abs(a.spin) + 0.5) / Math.PI), rl = Math.floor((Math.abs(a.roll) + 0.4) / TAU);
    if (W.onCarTrick) {
      if (fl > a.flipsSeen) W.onCarTrick(a.pitch < 0 ? 'front' : 'back', fl, a);
      if (sp > a.spinsSeen) W.onCarTrick('spin', sp, a);
      if (rl > a.rollsSeen) W.onCarTrick('roll', rl, a);
    }
    a.flipsSeen = fl; a.spinsSeen = sp; a.rollsSeen = rl;
  }
  // The car's height: on the road, up a ramp, off its lip, through the air, onto a roof, and the landing.
  function carVertical(dt, ctl) {
    const x = player.pos.x, z = player.pos.z;
    let gy = surfaceAt(x, z, player.pos.y + 0.6);
    const rf = roofAt(x, z);
    if (rf != null && player.pos.y > rf - 0.6) gy = Math.max(gy, rf);   // a car on a roof (landed there)
    const rp = W.ramps.length ? rampAt(x, z, player.pos.y) : null;
    if (rp && rp.y > gy) gy = rp.y;
    let a = player.carAir;
    if (!a) {
      const was = player.onRamp, along = was ? player.vel.x * was.ux + player.vel.z * was.uz : 0;
      if (was && (!rp || rp.r !== was) && along > 5 && was.lastA > was.L * 0.7) { // off the lip!
        const k = Math.max(0.4, Math.min(1.15, along / (was.ref || 25)));
        player.pos.y = was.gE + was.H; carLaunch(was.vy * k, 'ramp', was);
      } else if (ctl && input.jump && Math.abs(player.speed) > 2) { // Space: a little hop (time for a barrel roll)
        carLaunch(STUNT.hop, 'hop'); input.jump = false;
      } else if (player.pos.y > gy + 0.9) carLaunch(0, 'drop');   // off a roof or a bridge
      else { player.pos.y = gy; player.grounded = true; player.onRamp = rp ? rp.r : null; if (rp) rp.r.lastA = rp.a; }
      return;
    }
    player.vy -= GRAV * (W.gravMul || 1) * STUNT.airG * dt;
    player.pos.y += player.vy * dt;
    a.maxH = Math.max(a.maxH, player.pos.y - groundAt(x, z));
    if (player.pos.y > gy || player.vy > 0) return;
    // touchdown
    player.pos.y = gy;
    if (a.crash) { // a wipeout: bounce, tumble, settle
      a.bounces++;
      if (a.bounces < 3) { player.vy = 5.5 / a.bounces; a.pv *= 0.6; a.rv *= 0.6; a.sv *= 0.6; player.speed *= 0.5; W.burst(x, gy + 0.4, z, '💥', 3, { spread: 2, size: 0.6, life: 0.5 }); return; }
      player.carAir = null; player.grounded = true; player.speed = 0; player.vy = 0; player.pitch = 0;
      player.heading += wrapPi(a.spin); player.face = player.heading;
      if (W.onCarSettle) W.onCarSettle(a);
      return;
    }
    const ep = wrapPi(a.pitch), er = wrapPi(a.roll), hs = Math.round(a.spin / Math.PI), es = a.spin - hs * Math.PI;
    const info = {
      t: a.t, h: a.maxH, why: a.why, ramp: a.ramp, dist: Math.hypot(x - a.x0, z - a.z0),
      flips: Math.round((a.pitch - ep) / TAU), halfSpins: Math.abs(hs), rolls: Math.abs(Math.round((a.roll - er) / TAU)),
      fakie: Math.abs(hs) % 2 === 1, clean: Math.abs(ep) < STUNT.landTol && Math.abs(er) < STUNT.landTol && Math.abs(es) < STUNT.spinTol, x, z, onRoof: rf != null && gy >= rf - 0.01,
    };
    if (info.clean) {
      player.carAir = null; player.grounded = true; player.vy = 0; player.pitch = 0;
      player.heading += es + (info.fakie ? Math.PI : 0); player.face = player.heading;
      if (info.fakie) player.speed = -Math.abs(player.speed) * 0.8;   // landed backwards: roll on in reverse
      if (a.t > 0.6) W.burst(x, gy + 0.1, z, '💨', 5, { up: 0.4, spread: 2.5, size: 0.6, life: 0.5 });
      cam.shake = Math.max(cam.shake, Math.min(0.5, a.maxH * 0.04));
    } else { // roof first: WIPEOUT
      a.crash = true; a.bounces = 0; player.vy = 7; player.speed *= 0.45;
      a.pv = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 5); a.sv = (Math.random() - 0.5) * 8; a.rv = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 5);
      cam.shake = Math.max(cam.shake, 0.7);
      W.burst(x, gy + 0.6, z, '💥', 6, { spread: 3, size: 0.8, life: 0.6 });
    }
    if (W.onCarLand) W.onCarLand(info);
  }
  W.carAir = () => player.carAir || null;
  // For tests and screenshots: a spot inside the nearest park / plaza / ... of these kinds (AREA keys), at least minA m².
  W.findArea = function (kinds, minA) {
    let best = null, bd = Infinity;
    for (const s of allSubs) for (const a of s.areas || []) {
      if (!kinds.includes(a.k) || Math.abs(signedArea(a.p)) < (minA || 300)) continue;
      let x = 0, z = 0; const n = a.p.length / 2;
      for (let i = 0; i < a.p.length; i += 2) { x += a.p[i]; z += a.p[i + 1]; }
      x /= n; z /= n;
      if (!inRings([a.p].concat(a.hs || []), x, z)) continue;
      const d = Math.hypot(x - player.pos.x, z - player.pos.z);
      if (d < bd) { bd = d; best = { x, z, k: a.k }; }
    }
    return best;
  };
  W.teleport = function (x, z, yaw) {
    player.pos.set(x, surfaceAt(x, z), z); player.vel.set(0, 0, 0); player.vy = 0; player.speed = 0; player.grounded = true; player.pitch = 0;
    player.carAir = null; player.onRamp = null; player.boostT = 0;
    if (yaw != null) { player.face = player.heading = yaw; cam.yaw = yaw; }
    trail.length = 0;
    for (const f of followers) f.obj.position.set(x + 1, groundAt(x + 1, z + 1), z + 1);
    cam.cur = cam.dist;
  };

  const aimDirV = new THREE.Vector3();
  // Along a ray (the sight): the first building or ground it meets within maxD. {x, y, z, d, kind: 'wall' | 'ground'} or null.
  // Steps 0.5 m, then halves the last step, so the point sits on the wall (good enough for a web to stick to).
  W.rayCast = function (ox, oy, oz, dx, dy, dz, maxD, from) {
    const hitAt = (x, y, z) => { const rf = roofAt(x, z); if (rf != null && y < rf) return 'wall'; if (y < surfaceAt(x, z, y + 0.5)) return 'ground'; return null; };
    let prev = from || 0;
    for (let t = prev + 0.5; t <= maxD; t += 0.5) {
      const k = hitAt(ox + dx * t, oy + dy * t, oz + dz * t);
      if (!k) { prev = t; continue; }
      let a = prev, b = t;
      for (let i = 0; i < 6; i++) { const m = (a + b) / 2; if (hitAt(ox + dx * m, oy + dy * m, oz + dz * m)) b = m; else a = m; }
      return { x: ox + dx * a, y: oy + dy * a, z: oz + dz * a, d: a, kind: k };
    }
    return null;
  };
  function updateCamera(dt) {
    if (W.cine) { cineCamera(dt); return; }
    const target = _v.set(player.pos.x, player.pos.y + (ride.mode === 'drive' ? 1.4 : 1.6), player.pos.z);
    // aiming (2026-11-19): the camera slides over your right shoulder and closes in; the screen centre is the sight
    cam.aimK += ((W.aiming && ride.mode !== 'drive' && !W.showOff ? 1 : 0) - cam.aimK) * Math.min(1, dt * 12);
    const ak = cam.aimK;
    if (ak > 0.001) { target.x += Math.cos(cam.yaw) * 0.85 * ak; target.z -= Math.sin(cam.yaw) * 0.85 * ak; target.y += 0.15 * ak; }
    const dist = W.showOff ? 3.4 : cam.dist * (ride.mode === 'drive' ? 1.35 : 1) * (1 - ak) + Math.min(cam.dist, 3.6) * ak;
    const pitch = Math.max(cam.pitch, -0.2), tilt = Math.max(0, -0.2 - cam.pitch);   // looking up: the camera stops sinking and tilts instead
    const cp = Math.cos(pitch);
    const dx = Math.sin(cam.yaw) * cp, dy = Math.sin(pitch), dz = Math.cos(cam.yaw) * cp;
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
    if (tilt > 0.001) { // up to the sky: the same direction, raised by the extra pitch (flying figments, balloons, the whale)
      const ddx = target.x - camera.position.x, ddz = target.z - camera.position.z, hd = Math.hypot(ddx, ddz) || 1e-6;
      const el = Math.min(1.45, Math.atan2(target.y - camera.position.y, hd) + tilt * 1.15);
      camera.lookAt(camera.position.x + ddx / hd * Math.cos(el) * 10, camera.position.y + Math.sin(el) * 10, camera.position.z + ddz / hd * Math.cos(el) * 10);
    }
    // the view widens a little when you go fast
    const sp = Math.abs(ride.mode === 'drive' ? player.speed : Math.hypot(player.vel.x, player.vel.z));
    const fov = (62 + Math.max(0, Math.min(13, (sp - 7) * 0.85))) * (1 - ak) + 50 * ak;
    if (Math.abs(fov - camera.fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
    avatar.visible = cam.cur > 1.1;
    camera.getWorldDirection(aimDirV); W.aimRay = { ox: camera.position.x, oy: camera.position.y, oz: camera.position.z, dx: aimDirV.x, dy: aimDirV.y, dz: aimDirV.z, from: cam.cur };
    if (W.showOff) { avatar.rotation.y = cam.yaw + Math.PI + Math.sin(performance.now() / 1400) * 0.5; avatar.rotation.x = 0; if (body && !ride.kind) W.animate(body, 0, dt); }
    followLight();
  }
  // How far up or down you are looking, in radians (+ = up), for ranged weapons without the sight (2026-11-23, the user:
  // "projectiles need to respect the height of where the target is pointing... never up"). The chase camera looks down
  // at your head (default pitch 0.32), so AIM_BIAS makes the default view shoot about level; tilting up to the sky lifts it.
  const AIM_BIAS = 0.28;
  W.aimEl = function () {
    const r = W.aimRay;
    if (!r) return 0;
    return Math.max(-1.1, Math.min(1.35, Math.atan2(r.dy, Math.hypot(r.dx, r.dz)) + AIM_BIAS));
  };
  // Mission cut-scenes (cft-cine.js, 2026-11-20): W.cine = {pos, look, fov, face, pose} places the camera exactly; you are
  // always drawn, turned to `face` (yaw) and posed (`pose`: 'phone' on a call). Set to null and the normal camera returns.
  function cineCamera(dt) {
    const c = W.cine;
    camera.position.set(c.pos.x, Math.max(groundAt(c.pos.x, c.pos.z) + 0.3, c.pos.y), c.pos.z);
    camera.lookAt(c.look.x, c.look.y, c.look.z);
    if (c.fov && Math.abs(c.fov - camera.fov) > 0.05) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
    avatar.visible = true;
    if (c.face != null && !ride.kind) { avatar.rotation.y = c.face; avatar.rotation.x = 0; }
    if (body && !ride.kind) W.animate(body, 0, dt, c.pose || null);
    cam.cur = cam.dist;   // the normal camera comes back at full distance
    followLight();
  }
  function followLight() {
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
  // The light through the day (2026-11-21, the user: "change lighting throughout the day... it needs to be more apparent").
  // Key hours: [hour, sun colour, sun strength, sky light colour, ground bounce colour, sky light strength, exposure x, warmth,
  // saturation x]. Blue moonlight at night, a pink-orange sunrise with long shadows, crisp morning, bright white noon, warm
  // afternoon, an orange golden hour, a red sunset, a purple dusk, then the blue hour. Exposure / warmth / saturation go to
  // the post-processing grade on high quality (cft-post.js); low quality gets the colours of the lights and the fog.
  const LIGHT = [
    [0, 0x7f98ff, 0.14, 0x5a6cc0, 0x1c1a30, 0.42, 0.80, -3.5, 0.78],
    [4.6, 0x8a98ff, 0.16, 0x5f6ab8, 0x221e36, 0.44, 0.81, -3, 0.8],
    [5.6, 0xb59cff, 0.2, 0x8a86d0, 0x3a3048, 0.5, 0.88, -1.5, 0.9],
    [6.5, 0xff8456, 0.5, 0xffb8a0, 0x5a4040, 0.56, 0.95, 4.5, 1.14],
    [7.6, 0xffad70, 0.68, 0xffd8b8, 0x6a5a48, 0.62, 1.0, 3, 1.08],
    [9.5, 0xfff2de, 0.76, 0xe6f0ff, 0x6e685d, 0.68, 1.03, 0.8, 1.02],
    [12.5, 0xffffff, 0.84, 0xf0f6ff, 0x7a7466, 0.74, 1.08, 0, 0.95],
    [15.5, 0xfff0d0, 0.78, 0xf2eedf, 0x76705e, 0.7, 1.05, 1.5, 1.02],
    [17.6, 0xffa052, 0.74, 0xffd2a0, 0x6a5040, 0.62, 1.0, 5.5, 1.17],
    [18.8, 0xff6a3d, 0.52, 0xff9e8c, 0x503448, 0.55, 0.95, 4.5, 1.2],
    [19.7, 0xc46aa6, 0.3, 0xa07ac8, 0x302848, 0.48, 0.9, 0.5, 1.02],
    [20.7, 0x7a8cff, 0.18, 0x6a74c8, 0x22203a, 0.44, 0.84, -2.5, 0.85],
    [22, 0x7f98ff, 0.14, 0x5a6cc0, 0x1c1a30, 0.42, 0.80, -3.5, 0.78],
    [24, 0x7f98ff, 0.14, 0x5a6cc0, 0x1c1a30, 0.42, 0.80, -3.5, 0.78],
  ];
  const lc = new THREE.Color(), ld = new THREE.Color();
  let postBase = null;
  function lightAt(h) { // interpolated LIGHT row
    let i = 0;
    while (i < LIGHT.length - 2 && LIGHT[i + 1][0] <= h) i++;
    const A = LIGHT[i], B = LIGHT[i + 1], t = (h - A[0]) / (B[0] - A[0]), mix = (a, b) => a + (b - a) * t;
    const col = k => lc.setHex(A[k]).lerp(ld.setHex(B[k]), t).getHex();
    return { sun: col(1), sunI: mix(A[2], B[2]), sky: col(3), gnd: col(4), skyI: mix(A[5], B[5]), exp: mix(A[6], B[6]), warm: mix(A[7], B[7]), sat: mix(A[8], B[8]) };
  }
  W.lightAt = lightAt; W.sunDir = sunDir;   // tests read the sun height
  W.night = 0;
  W.setClock = function (h) {
    h = ((h % 24) + 24) % 24;
    let i = 0;
    while (i < SKY.length - 2 && SKY[i + 1][0] <= h) i++;
    const t = (h - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0]);
    ca.setHex(SKY[i][1]); cb.setHex(SKY[i + 1][1]);
    skyCol.copy(ca).lerp(cb, t);
    greyCol(skyCol);   // colour blocks: the sky is as grey as the block you stand in
    scene.background.copy(skyCol);
    scene.fog.color.copy(skyCol);
    const day = smooth(5.5, 8, h) * (1 - smooth(18.3, 21, h));
    W.night = 1 - day;
    const L = lightAt(h);
    W.light = L;
    hemi.intensity = L.skyI * (GFX ? 0.5 : 1);   // high quality: the sky's environment map does much of the fill
    hemi.color.setHex(L.sky); hemi.groundColor.setHex(L.gnd);
    sun.intensity = L.sunI;
    nameTint.setScalar(0.4 + 0.55 * day);  // street names painted on the road
    sun.color.setHex(L.sun);  // moonlight is blue, sunrise pink-orange, noon white, golden hour orange
    const a = (h - 6) / 12 * Math.PI;  // sun travels east -> west
    // low sun = long shadows at sunrise and in the golden hour; at night the moon stands high in the south-west
    if (day > 0.02) sunDir.set(Math.cos(a) * 0.6, Math.max(0.16, Math.sin(Math.max(0.12, Math.min(Math.PI - 0.12, a)))), 0.46).normalize();
    else sunDir.set(-0.35, 0.8, 0.5).normalize();
    if (POST) { // the colour grade follows the hour
      if (!postBase) postBase = { exposure: POST.params.exposure, sat: POST.params.sat };
      POST.params.exposure = postBase.exposure * L.exp; POST.params.sat = postBase.sat * L.sat; POST.params.warm = L.warm;
    }
    MAT.walls.emissiveIntensity = Math.max(0, (W.night - 0.3) * 1.3);
    if (GFX) { GFX.U.uNight.value = W.night; GFX.U.uDay.value = day; }
    scene.fog.near = 120 - W.night * 40; scene.fog.far = 600 - W.night * 180;
    // the dome: deep blue overhead by day, almost black at night, the horizon keeps the fog colour
    i = 0;
    while (i < SKY_TOP.length - 2 && SKY_TOP[i + 1][0] <= h) i++;
    const tt = (h - SKY_TOP[i][0]) / (SKY_TOP[i + 1][0] - SKY_TOP[i][0]);
    ca.setHex(SKY_TOP[i][1]); cb.setHex(SKY_TOP[i + 1][1]);
    skyTop.copy(ca).lerp(cb, tt);
    greyCol(skyTop);
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
    MAT.halo.opacity = glow * 0.3; MAT.halo.visible = glow > 0.02;
    nightLight.intensity = glow * 1.15;
    cloudMat.opacity = 0.93 - W.night * 0.6;
    cloudMat.emissive.copy(cloudMat.color); cloudMat.emissiveIntensity = 0.5 * (1 - W.night);
    MAT.pool.visible = glow > 0.02;
    W.glow = glow;
    if (GFX) { GFX.U.uSkyTop.value.copy(skyTop); GFX.U.uSkyLow.value.copy(skyCol); }
    // reflections: re-render the sky into the environment map when the hour has moved on (a game quarter hour = 15 s)
    if (GFX && (envH == null || Math.abs(angDiff(h / 24 * 6.2832, envH / 24 * 6.2832)) > 0.065)) {
      envH = h;
      scene.environment = GFX.updateEnv(skyTop, skyCol, sunDir, sun.color, W.night);
    }
  };
  let envH = null;

  // ---------------------------------------------------------------- ambient life: pedestrians, traffic, pigeons
  const TW = (opts.tune && opts.tune.world) || { peds: 44, pedsLow: 22, cars: 20, carsLow: 9 };  // D.TUNE.world
  const life = { peds: [], cars: [], birds: [], max: LOW ? TW.pedsLow : TW.peds, maxCars: LOW ? TW.carsLow : TW.cars, flocks: LOW ? 1 : 3, t: 0 };
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
    return { x, z, y: sg.br ? surfaceAt(x, z) : standAt(x, z), ux, uz };
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
    const silly = !LOW && kind !== 'bus' && kind !== 'truck' && kind !== 'police' && Math.random() < 0.085 ? W.SILLY_CARS[Math.random() * W.SILLY_CARS.length | 0] : null;
    const obj = W.vehicle(kind, CAR_TINT[Math.random() * CAR_TINT.length | 0], { silly });
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
    const zebra = new Geo(false, true), white = new THREE.Color(0xf4f1ea);
    zebra.layer = TL.asphalt;  // painted stripes keep the road's grain
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
    if (e.code === 'Space' && W.controls.enabled) { if (!e.repeat) input.jump = true; input.hold = true; e.preventDefault(); }
  });
  on(window, 'keyup', e => {
    if (KEYS[e.code]) input[KEYS[e.code]] = 0;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = false;
    if (e.code === 'Space') input.hold = false;
  });
  on(window, 'blur', () => { input.f = input.b = input.l = input.r = 0; input.sprint = false; input.hold = false; });
  function look(dx, dy, s) { cam.yaw -= dx * s; cam.pitch = Math.max(-1.25, Math.min(1.35, cam.pitch + dy * s)); cam.lookT = performance.now(); }   // below -0.2 the camera stays low and tilts up to the sky (updateCamera)
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
  on(canvas, 'wheel', e => { e.preventDefault(); if (W.onWheel && W.onWheel(e.deltaY, e)) return; cam.dist = Math.max(2.5, Math.min(30, cam.dist * (e.deltaY > 0 ? 1.12 : 1 / 1.12))); }, { passive: false });   // W.onWheel: cft-aim (shooters)
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
    buckets.clear(); nameBuckets.clear(); hchunks.clear(); rchunks.clear(); pchunks.clear(); lchunks.clear(); segBuckets.clear(); bridgeBuckets.clear();
    terr.tiles.clear(); terr.src.clear(); nodes.clear(); terr.inflight = 0; terr.h0 = null; terr.off = false; terr.minY = 0;
    W.places.length = 0; W.placeIds.clear();
    boro.tiles.clear(); boro.pts.length = 0; boro.stale.clear();
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
  W.snapshot = (w, h) => new Promise(res => { snapReq = { w: w || 320, h: h || 180, res }; updateCamera(0.016); updateSky(0); draw(); takeSnap(); });
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
    updateArcs(dt);
    updateSmash(dt);
    updateLod(dt);
    updateCamera(dt);
    updateSky(dt);
    if (opts.render === false) return;
    draw(true);
  };
  // every frame goes through here: post-processing on high quality, else straight to the screen
  let lastDraw = 0;
  function draw(live) {
    if (!POST) { renderer.render(scene, camera); return; }
    POST.render(scene, camera);
    if (live) { const now = performance.now(); if (lastDraw) POST.adapt((now - lastDraw) / 1000); lastDraw = now; }
  }

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
  // world point -> canvas pixels {x, y, behind} (for on-screen pointers)
  const _pj = new THREE.Vector3();
  W.project = function (x, y, z) {
    _pj.set(x, y, z).project(camera);
    const r = canvas.getBoundingClientRect(), behind = _pj.z > 1;
    return { x: (_pj.x * (behind ? -1 : 1) + 1) / 2 * r.width, y: (1 - _pj.y * (behind ? -1 : 1)) / 2 * r.height, behind, w: r.width, h: r.height };
  };
  W.render = () => { updateCamera(0.016); updateSky(0); draw(); };
  W.renderInfo = () => POST && POST.info ? Object.assign({}, POST.info) : ({ triangles: renderer.info.render.triangles, calls: renderer.info.render.calls });
  W.gfx = GFX;     // null on low quality (tests flip GFX.U.uDbg to see the facade shader's inputs)
  W.post = POST;   // null on low quality / WebGL1; tests and the play-test panel read POST.level / POST.params  // the last frame (tests, tuning)
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
      if (edge && mk.letter) { // off the map: a little arrow points the way (GTA-style)
        const a = Math.atan2(sz, sx);
        g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(r + 6 * dpr, 0); g.lineTo(r - 1, -4.5 * dpr); g.lineTo(r - 1, 4.5 * dpr); g.closePath();
        g.fillStyle = mk.color || '#ffc400'; g.fill(); g.lineWidth = 1.2 * dpr; g.strokeStyle = '#1f1a3d'; g.stroke(); g.restore();
      }
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = mk.color || '#ffc400'; g.fill();
      g.lineWidth = 1.5 * dpr; g.strokeStyle = mk.ring || 'rgba(0,0,0,.55)'; g.stroke();
      if (mk.letter) { g.font = '900 ' + Math.round(r * 1.35) + 'px Fredoka, Nunito, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 2.5 * dpr; g.strokeStyle = '#1f1a3d'; g.strokeText(mk.letter, x, y + 1 * dpr); g.fillStyle = '#fff'; g.fillText(mk.letter, x, y + 1 * dpr); }
      else if (mk.emoji && r > 5 * dpr) { g.font = Math.round(r * 1.25) + 'px ' + EMOJI_FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(mk.emoji, x, y + 0.5 * dpr); }
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
      if (mk.letter) { g.font = '900 ' + Math.round(r * 1.35) + 'px Fredoka, Nunito, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 2.5 * dpr; g.strokeStyle = '#1f1a3d'; g.strokeText(mk.letter, x, y + 1); g.fillStyle = '#fff'; g.fillText(mk.letter, x, y + 1); }
      else if (mk.emoji) { g.font = Math.round(r * 1.25) + 'px ' + EMOJI_FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(mk.emoji, x, y + 0.5); }
    }
    // borough names: a pill in the borough's colour at its centre point
    if (o.boroughs !== false) for (const p of boro.pts) {
      if (p.c === 'city') continue;
      const bx = Wd / 2 + (p.x - o.cx) * k, by = H / 2 + (p.z - o.cz) * k;
      if (bx < -200 || by < -30 || bx > Wd + 200 || by > H + 30) continue;
      const lk = LOOKS[p.li];
      g.font = '700 ' + Math.round(12 * dpr) + 'px Fredoka, Nunito, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const tw = g.measureText(p.n).width + 14 * dpr, th = 20 * dpr;
      g.fillStyle = lk.css; g.strokeStyle = '#1f1a3d'; g.lineWidth = 2 * dpr;
      g.beginPath(); if (g.roundRect) g.roundRect(bx - tw / 2, by - th / 2, tw, th, th / 2); else g.rect(bx - tw / 2, by - th / 2, tw, th); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.fillText(p.n, bx, by + 0.5);
    }
    const x = Wd / 2 + (player.pos.x - o.cx) * k, y = H / 2 + (player.pos.z - o.cz) * k;
    g.save(); g.translate(x, y); g.rotate(-player.face);
    g.beginPath(); g.moveTo(0, -10 * dpr); g.lineTo(7 * dpr, 8 * dpr); g.lineTo(0, 4 * dpr); g.lineTo(-7 * dpr, 8 * dpr); g.closePath();
    g.fillStyle = '#6b4eff'; g.fill(); g.lineWidth = 2 * dpr; g.strokeStyle = '#fff'; g.stroke(); g.restore();
  };

  W.destroy = function () {
    for (const [el, ev, fn, o] of listeners) el.removeEventListener(ev, fn, o);
    W.unlock();
    if (POST) POST.dispose();
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
