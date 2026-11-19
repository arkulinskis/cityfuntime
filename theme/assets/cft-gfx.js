/* City Fun Time: high-detail materials (2026-11-19 graphics overhaul). High quality only; low keeps cft-world's Lambert look.
   Everything is procedural (shaders), so it costs no downloads:
   - wallMaterial(): building facades. Per-building style (vertex attribute `wa` = [style, seed, shop band]): red or buff
     brick with mortar, stucco, concrete panels, lap siding, greystone blocks, or a glass curtain wall. Windows are cut in
     the shader on the floor / bay grid cft-world's walls already carry (uv × 4 = bays, floors): stone lintels and sills,
     frames and mullions, a recess with its reveal, blinds, and behind the glass a fake room (interior mapping: back wall,
     side walls, floor, ceiling, furniture) that lights up at night. Street floors get shop windows and doors.
   - roofMaterial(): flat roofs (membrane / gravel with seams), pitched roofs (shingle rows), plain sides.
   - pbr(mat): turns a vertex-coloured material into MeshStandard with a per-vertex surface class `mk` (Merge.as / kOf in
     cft-world): 0 matte, 1 car paint, 2 glass, 3 metal, 4 skin, 5 wet / eyes, 6 cloth, 7 hair, 8 leaves, 9 plastic.
   - env(renderer): a small sky scene rendered into a PMREM environment map (reflections on paint, glass, windows),
     refreshed when the time of day moves on.
   const X = CFTGfx.create(THREE, renderer)   X.U = shared uniforms (uNight, uDay, uSkyTop, uSkyLow, uSun)
*/
(function () {
'use strict';

const NOISE = `
float gh21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float gn2(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gh21(i), gh21(i + vec2(1.0, 0.0)), u.x), mix(gh21(i + vec2(0.0, 1.0)), gh21(i + vec2(1.0, 1.0)), u.x), u.y); }
float gfbm(vec2 p) { return gn2(p) * 0.55 + gn2(p * 2.07 + 13.1) * 0.3 + gn2(p * 4.11 + 7.7) * 0.15; }
`;

// ------------------------------------------------------------------ facades
const WALL_HEAD = NOISE + `
uniform float uNight, uDay, uDbg;
uniform vec3 uSkyTop, uSkyLow;
varying vec3 vWA; varying vec3 vWP; varying vec3 vWN; varying vec2 vFU;
vec3 gAlb; float gRough; float gMetal; vec3 gEmi; vec3 gNT;
const float FH = 3.3, CW = 3.6;

// wall pattern heights (1 = face, 0 = mortar / joint) and a colour factor per brick / board
float wallH(int st, vec2 m, out float vr) {
  vr = 1.0;
  if (st <= 1) {                       // brick: 215 x 65 mm, 10 mm joints, stretcher bond
    float row = floor(m.y / 0.075);
    float bx = m.x / 0.225 + mod(row, 2.0) * 0.5;
    vec2 f = vec2(fract(bx), fract(m.y / 0.075));
    vr = 0.84 + 0.3 * gh21(vec2(floor(bx), row));
    if (gh21(vec2(floor(bx) * 1.7, row + 3.1)) > 0.93) vr *= 0.72;   // the odd burnt brick
    float e = min(min(f.x, 1.0 - f.x) * 0.225, min(f.y, 1.0 - f.y) * 0.075);
    return smoothstep(0.003, 0.009, e);
  }
  if (st == 4) {                       // lap siding: 0.2 m boards, each lapping over the one below
    float f = fract(m.y / 0.2);
    vr = 0.93 + 0.1 * gh21(vec2(floor(m.y / 0.2), floor(m.x / 4.0)));
    return 0.35 + 0.65 * f;
  }
  if (st == 5) {                       // greystone blocks: 0.6 x 0.32, rough faces
    float row = floor(m.y / 0.32);
    float bx = m.x / 0.62 + mod(row, 2.0) * 0.37;
    vec2 f = vec2(fract(bx), fract(m.y / 0.32));
    vr = 0.86 + 0.24 * gh21(vec2(floor(bx), row));
    float e = min(min(f.x, 1.0 - f.x) * 0.62, min(f.y, 1.0 - f.y) * 0.32);
    return smoothstep(0.004, 0.02, e) * (0.85 + 0.15 * gn2(m * 9.0));
  }
  if (st == 3) {                       // concrete panels on the bay grid, form-tie holes
    vec2 f = fract(m / vec2(CW * 0.5, FH));
    vec2 t = fract(m / vec2(0.6, 0.6));
    float hole = 1.0 - (1.0 - smoothstep(0.02, 0.035, length(t - 0.5))) * 0.4;
    vr = 0.9 + 0.12 * gn2(floor(m / vec2(CW * 0.5, FH)) * 3.7);
    float e = min(min(f.x, 1.0 - f.x) * CW * 0.5, min(f.y, 1.0 - f.y) * FH);
    return smoothstep(0.01, 0.03, e) * hole;
  }
  // stucco
  return 0.7 + 0.3 * gfbm(m * 7.0);
}

// the fake room behind a window: p = point on the glass (metres from the opening's bottom-left), sz = opening size,
// d = view ray in tangent space (into the wall: d.z < 0)
vec3 room(vec2 p, vec2 sz, vec3 d, float sill, float seed, float lit, float shop) {
  float pad = shop > 0.5 ? 0.3 : 0.9;
  float x0 = -pad, x1 = sz.x + pad, y0 = -sill, y1 = FH - 0.35 - sill, D = shop > 0.5 ? 6.0 : 3.2 + 2.2 * gh21(vec2(seed, 2.0));
  d.z = min(d.z, -0.02);
  float tx = ((d.x > 0.0 ? x1 : x0) - p.x) / (abs(d.x) < 1e-4 ? 1e-4 : d.x);
  float ty = ((d.y > 0.0 ? y1 : y0) - p.y) / (abs(d.y) < 1e-4 ? 1e-4 : d.y);
  float tz = -D / d.z;
  tx = tx < 0.0 ? 1e5 : tx; ty = ty < 0.0 ? 1e5 : ty;
  // which surface the ray meets first: ordered comparisons, never t == tz (compilers may recompute and miss by a bit)
  int surf = (tz <= tx && tz <= ty) ? 0 : (ty <= tx ? 1 : 2);
  float t = surf == 0 ? tz : surf == 1 ? ty : tx;
  vec3 h = vec3(p, 0.0) + d * t;
  float k = gh21(vec2(seed, 7.0));
  vec3 wallC = k < 0.2 ? vec3(0.86, 0.82, 0.72) : k < 0.4 ? vec3(0.7, 0.78, 0.84) : k < 0.6 ? vec3(0.78, 0.83, 0.7) : k < 0.8 ? vec3(0.9, 0.76, 0.66) : vec3(0.8, 0.8, 0.82);
  if (shop > 0.5) wallC = mix(wallC, vec3(0.95), 0.5);
  vec3 c;
  if (surf == 0) {                     // back wall: furniture, a picture, shelves in shops
    c = wallC;
    float fx = (h.x - x0) / (x1 - x0);
    float fk = gh21(vec2(seed, 11.0));
    if (shop > 0.5) {
      float y = h.y + sill, kind = gh21(vec2(seed, 13.0));
      if (kind < 0.4) {                 // shelves of goods (item size varies by shop)
        float sw = 0.22 + 0.35 * gh21(vec2(seed, 14.0)), rh = 0.4 + 0.15 * gh21(vec2(seed, 15.0));
        float shelf = step(0.3, y) * step(y, 2.2), rows = step(0.8, fract(y / rh));
        float ix = floor(h.x / sw), iy = floor(y / rh);
        vec3 goods = vec3(gh21(vec2(ix, iy) + seed * 3.0), gh21(vec2(ix + 17.0, iy) + seed * 5.0), gh21(vec2(ix, iy + 29.0) + seed * 7.0));
        float gap = step(0.12, fract(h.x / sw));
        c = mix(c, mix(mix(vec3(0.3), goods * 0.75 + 0.15, gap), vec3(0.35, 0.3, 0.28), rows), shelf);
      } else if (kind < 0.72) {         // a cafe: counter, menu board, warm wall, pendant lamps
        c = mix(vec3(0.62, 0.42, 0.3), vec3(0.85, 0.75, 0.6), gh21(vec2(seed, 16.0)));
        if (y < 1.05) c = vec3(0.3, 0.2, 0.15) * (0.9 + 0.1 * step(0.5, fract(h.x * 2.0)));
        if (y > 1.5 && y < 2.25 && abs(fract(h.x / 2.4) - 0.5) < 0.3) { c = vec3(0.12, 0.13, 0.12); if (fract(y * 9.0) < 0.3 && fract(h.x * 5.0) < 0.75) c = vec3(0.85); }
      } else {                          // a boutique: white walls, a rail of clothes, a few framed things
        c = vec3(0.93, 0.92, 0.9);
        if (y > 0.5 && y < 1.75 && fract(h.x / 3.0) < 0.7) { float ic = floor(h.x / 0.14); c = vec3(gh21(vec2(ic, seed)), gh21(vec2(ic + 5.0, seed)), gh21(vec2(ic + 9.0, seed))) * 0.6 + 0.2; if (y > 1.68) c = vec3(0.6); }
        else if (y > 1.9 && y < 2.4 && abs(fract(h.x / 1.7) - 0.5) < 0.18) c = vec3(0.2 + 0.6 * gh21(vec2(floor(h.x / 1.7), seed + 3.0)), 0.4, 0.5);
      }
    } else {
      if (h.y + sill < 0.85 && abs(fx - (0.3 + fk * 0.4)) < 0.22) c = mix(vec3(0.3, 0.32, 0.45), vec3(0.55, 0.32, 0.25), fk);   // sofa / dresser
      if (abs(h.y + sill - 1.65) < 0.28 && abs(fx - (0.3 + fk * 0.4)) < 0.1) c = vec3(0.25 + 0.5 * fk, 0.4, 0.55 - 0.3 * fk); // a picture
      if (fk > 0.7 && fx > 0.82 && h.y + sill < 1.9) c = vec3(0.4, 0.28, 0.2);                                                // a bookcase
    }
  } else if (surf == 1) {
    if (d.y < 0.0) {                    // floor: planks / shop tiles
      c = shop > 0.5 ? vec3(0.78) * (0.9 + 0.1 * step(0.5, fract(h.x * 1.5) + fract(h.z * 1.5) - 0.5)) : vec3(0.52, 0.36, 0.24) * (0.85 + 0.15 * gh21(vec2(floor(h.x * 6.0), floor(h.z * 0.8))));
    } else {                            // ceiling with a light
      c = vec3(0.92);
      float l = 1.0 - smoothstep(0.0, 0.5, length(vec2(h.x - sz.x * 0.5, h.z + D * 0.5)));
      c += l * (0.6 + lit);
    }
  } else c = wallC * 0.82;              // side walls
  float depth = clamp(-h.z / D, 0.0, 1.0);
  // daylight comes in through the window and fades towards the back; at night the lamps light it evenly
  float day = uDay * (0.34 - 0.16 * depth) * (shop > 0.5 ? 1.1 : 1.0);
  vec3 lamp = (shop > 0.5 ? vec3(1.0, 0.97, 0.9) : (gh21(vec2(seed, 3.0)) > 0.3 ? vec3(1.0, 0.8, 0.52) : vec3(0.75, 0.85, 1.0))) * lit * (0.95 - 0.25 * depth);
  if (lit < 0.5 && gh21(vec2(seed, 5.0)) > 0.9) lamp += vec3(0.25, 0.4, 0.9) * uNight * (0.6 + 0.4 * sin(seed * 40.0));  // a TV
  return c * (day + lamp * 0.85);
}

// what a window reflects: the reflected ray keeps the view ray's height, so looking up at a window shows the sky,
// looking along the street shows the buildings opposite (darker), looking down shows the street
vec3 reflSky(vec3 vt) {
  float ry = -vt.y;
  vec3 sky = mix(uSkyLow, uSkyTop, clamp(ry * 1.6, 0.0, 1.0));
  vec3 city = mix(vec3(0.24, 0.23, 0.25), uSkyLow * 0.5, 0.3);
  return mix(city, sky, smoothstep(-0.02, 0.22, ry)) * (0.9 - 0.55 * uNight);
}
void facade(vec3 base) {
  int st = int(vWA.x + 0.5);
  float seed = floor(vWA.y + 0.5), shopBand = vWA.z;   // rounded: an interpolated varying wobbles in the last bits, and the hashes would turn that into noise
  vec3 N = normalize(vWN);
  vec3 T = normalize(vec3(N.z, 0.0, -N.x));
  vec3 V = normalize(cameraPosition - vWP);
  vec3 vt = vec3(dot(V, T), V.y, dot(V, N));
  vec2 cell = vFU * 4.0;
  vec2 ci = floor(cell);
  vec2 m = vec2(cell.x * CW, cell.y * FH);          // metres along / up the wall
  vec2 q = vec2(fract(cell.x) * CW, fract(cell.y) * FH);  // metres inside this bay + floor
  float fw = max(fwidth(m.x), fwidth(m.y));          // metres per pixel: fade fine detail far away
  float detail = 1.0 - smoothstep(0.012, 0.045, fw);
  float vr;
  // ---- the wall
  float hh = wallH(st, m, vr);
  vec3 alb = base;
  vec3 nt = vec3(0.0, 0.0, 1.0);
  float rough = 0.88;
  if (st != 6) {
    float v2; float e = 0.006;
    float hx = wallH(st, m + vec2(e, 0.0), v2), hy = wallH(st, m + vec2(0.0, e), v2);
    float bump = st == 4 ? 0.018 : st == 2 ? 0.004 : 0.012;
    nt = normalize(vec3(-(hx - hh) / e * bump * detail, -(hy - hh) / e * bump * detail, 1.0));
    vec3 mortar = mix(base, vec3(0.78, 0.76, 0.72), 0.65);
    vec3 face = base * vr;
    if (st == 4) face = base * vr * (0.8 + 0.2 * hh);
    vec3 pat = st <= 1 || st == 5 || st == 3 ? mix(mortar, face, hh) : face * (0.92 + 0.08 * hh);
    alb = mix(base * (st <= 1 ? 0.95 : 1.0), pat, detail);
    // weathering: soft patches and streaks running down
    float g = gfbm(m * vec2(0.35, 0.09) + seed * 17.0);
    alb *= 0.86 + 0.18 * g;
    rough = st == 4 ? 0.7 : 0.9;
  }
  // ---- windows
  float lit = 0.0;
  vec3 emi = vec3(0.0);
  float floorI = ci.y;
  float s1 = gh21(vec2(seed, 1.0)), s2 = gh21(vec2(seed, 2.0));
  bool shopFloor = shopBand > 0.5 && floorI < 0.5;
  float metal = 0.0;
  if (st == 6) {
    // glass curtain wall: mullions on the bay grid, spandrel panels at each floor
    float mul = min(q.x, CW - q.x), mulY = q.y;
    float frameW = 0.06;
    bool spandrel = mulY < 0.85 && !shopFloor;
    vec3 tint = mix(vec3(0.16, 0.26, 0.3), base * 0.45, 0.5);
    if (mul < frameW || abs(q.x - CW * 0.5) < frameW * 0.5 || abs(mulY - 0.85) < 0.04) { alb = vec3(0.55, 0.58, 0.62); rough = 0.35; metal = 0.7; }
    else if (spandrel) { alb = tint * 0.7; rough = 0.15; metal = 0.5; }
    else {
      float wseed = gh21(ci + seed * 31.0);
      lit = step(gh21(ci * 1.37 + seed), 0.55) * smoothstep(0.3, 0.7, uNight);
      vec2 p = vec2(q.x - frameW, q.y - 0.85);
      vec3 rc = room(p, vec2(CW - 2.0 * frameW, FH - 0.85), -vt, 0.85, wseed, lit, 0.0);
      alb = tint * 0.25; rough = 0.04; metal = 0.55;
      float fres = 0.25 + 0.6 * pow(1.0 - clamp(vt.z, 0.0, 1.0), 3.0);
      vec3 sky = reflSky(vt);
      emi = rc * 0.35 * (1.0 - fres) + sky * fres * mix(vec3(1.0), tint * 3.0, 0.35);
    }
    nt = vec3(0.0, 0.0, 1.0);
  } else {
    float nWin = s1 < 0.45 ? 1.0 : 2.0;
    float ww = nWin < 1.5 ? 1.25 + 0.5 * s2 : 0.92 + 0.15 * s2;
    float wh = 1.55 + 0.35 * gh21(vec2(seed, 4.0));
    float sill = 0.85;
    float cx = nWin < 1.5 ? CW * 0.5 : (q.x < CW * 0.5 ? CW * 0.27 : CW * 0.73);
    vec2 o0 = vec2(cx - ww * 0.5, sill);
    bool door = false;
    if (shopFloor) {
      // shopfront: one big window per bay, a door in some bays, a fascia above
      float dk = gh21(ci + seed * 7.0);
      ww = CW - 0.5; wh = 2.35; sill = 0.4; o0 = vec2(0.25, sill);
      if (dk < 0.3) { ww = 1.1; wh = 2.35; sill = 0.04; o0 = vec2(CW * 0.5 - 0.55, sill); door = true; }
    } else if (floorI < 0.5 && gh21(ci + seed * 5.0) < 0.14) {
      door = true; ww = 1.05; wh = 2.25; sill = 0.04; o0 = vec2(CW * 0.5 - 0.52, sill);   // a front door
    }
    vec2 sz = vec2(ww, wh);
    // stone lintel and sill (brick and stone buildings), drawn on the wall
    if (!shopFloor && (st <= 1 || st == 5)) {
      vec2 lp = q - vec2(o0.x - 0.12, o0.y + wh);
      if (lp.x > 0.0 && lp.x < ww + 0.24 && lp.y > 0.0 && lp.y < 0.2) { alb = mix(base, vec3(0.83, 0.8, 0.74), 0.8) * (0.9 + 0.1 * gn2(m * 20.0)); nt = vec3(0.0, lp.y < 0.03 ? -0.6 : lp.y > 0.17 ? 0.5 : 0.0, 1.0); rough = 0.8; }
      vec2 sp = q - vec2(o0.x - 0.08, o0.y - 0.09);
      if (!door && sp.x > 0.0 && sp.x < ww + 0.16 && sp.y > 0.0 && sp.y < 0.09) { alb = vec3(0.8, 0.78, 0.74); nt = vec3(0.0, sp.y > 0.06 ? 0.7 : -0.3, 1.0); rough = 0.8; }
    }
    if (shopFloor && q.y > 2.85) { alb = base * 0.55; nt = vec3(0.0, q.y < 2.9 ? -0.6 : 0.0, 1.0); }   // fascia
    vec2 pw = q - o0;
    // the recess: look through the opening to the glass 0.14 m in; outside the opening there = the reveal
    float rd = shopFloor ? 0.08 : 0.14;
    vec2 pg = pw - vt.xy / max(vt.z, 0.08) * rd;
    bool inOpen = pw.x > 0.0 && pw.x < sz.x && pw.y > 0.0 && pw.y < sz.y;
    if (inOpen) {
      nt = vec3(0.0, 0.0, 1.0);
      if (pg.x < 0.0 || pg.x > sz.x || pg.y < 0.0 || pg.y > sz.y) {
        alb = base * 0.62; rough = 0.9;                // the reveal (side of the recess)
      } else {
        float fr = 0.06;
        float wseed = gh21(ci * 3.1 + vec2(step(CW * 0.5, q.x), 0.0) + seed * 13.0);
        vec3 frameC = gh21(vec2(seed, 9.0)) > 0.35 ? vec3(0.93, 0.92, 0.88) : vec3(0.18, 0.18, 0.2);
        if (door && !shopFloor) frameC = vec3(0.3, 0.18, 0.12);
        bool frame = pg.x < fr || pg.x > sz.x - fr || pg.y < fr || pg.y > sz.y - fr
          || (!door && !shopFloor && abs(pg.x - sz.x * 0.5) < fr * 0.5 && sz.x > 1.1)
          || (!door && abs(pg.y - sz.y * 0.72) < fr * 0.5 && !shopFloor);
        if (door && !shopFloor && pg.y < sz.y * 0.62 && !frame) { alb = mix(vec3(0.42, 0.24, 0.15), base * 0.5, gh21(vec2(seed, 12.0)) * 0.6); rough = 0.6; nt = vec3(0.0, 0.0, 1.0); }  // door panel
        else if (frame) { alb = frameC; rough = 0.5; }
        else {
          lit = shopFloor ? 1.0 : step(gh21(ci * 1.91 + wseed), 0.42) * smoothstep(0.3, 0.7, uNight);
          if (shopFloor) lit = mix(0.35, 1.0, smoothstep(0.3, 0.7, uNight));
          // blinds / curtains on part of the glass
          float bl = gh21(vec2(wseed, 8.0));
          float blind = shopFloor ? 0.0 : (bl < 0.45 ? 0.0 : bl < 0.8 ? 0.15 + 0.4 * gh21(vec2(wseed, 9.0)) : 0.85);
          if (pg.y > sz.y * (1.0 - blind)) {
            vec3 bc = bl > 0.92 ? vec3(0.8, 0.45, 0.5) : vec3(0.92, 0.88, 0.8);
            bc *= 1.0 - 0.12 * detail * step(0.5, fract(pg.y * 18.0));
            alb = bc * 0.6; rough = 0.8;
            emi = bc * (0.08 * uDay + lit * 0.9 * vec3(1.0, 0.82, 0.6));
          } else {
            vec3 rc = room(pg, sz, -vt, sill, wseed, lit, shopFloor ? 1.0 : 0.0);
            alb = vec3(0.02); rough = 0.03;
            // glass reflects the sky, more at a glancing angle (Fresnel); the room shows through the rest
            float fres = 0.08 + 0.5 * pow(1.0 - clamp(vt.z, 0.0, 1.0), 4.0);
            vec3 sky = reflSky(vt);
            emi = rc * (1.0 - fres) + sky * fres;
          }
        }
      }
    }
  }
  gAlb = alb; gRough = rough; gMetal = metal; gEmi = emi; gNT = nt;
  if (uDbg > 0.5) { gAlb = vec3(0.0); gRough = 1.0; gMetal = 0.0; gNT = vec3(0.0, 0.0, 1.0);
    gEmi = uDbg < 1.5 ? vt * 0.5 + 0.5 : uDbg < 2.5 ? fract(vec3(m, 0.0)) : uDbg < 3.5 ? vec3(fract(cell), 0.0) : vec3(detail); }
}
`;

// ------------------------------------------------------------------ roofs
const ROOF_HEAD = NOISE + `
varying vec3 vWP; varying vec3 vWN;
vec3 gAlb; float gRough; vec3 gNT;
void roofSurface(vec3 base) {
  vec3 N = normalize(vWN);
  float fw = max(fwidth(vWP.x), fwidth(vWP.z));
  float detail = 1.0 - smoothstep(0.006, 0.025, fw);
  gNT = vec3(0.0, 0.0, 1.0); gRough = 0.92; gAlb = base;
  if (N.y > 0.96) {                       // flat roof: membrane sheets with seams, gravel speckle, puddle stains
    vec2 p = vWP.xz;
    float seam = 1.0 - (1.0 - smoothstep(0.0, 0.03, abs(fract(p.x / 1.0) - 0.5) * 1.0 - 0.47)) * 0.25;
    float g = gn2(p * 22.0) * 0.5 + gn2(p * 47.0) * 0.5;
    float big = gfbm(p * 0.12);
    float stain = gfbm(p * 0.45 + 7.0);                                   // water stains and patched sheets, seen from far
    float sheet = gh21(floor(p / vec2(1.0, 6.0)));
    float edge = 1.0 - 0.18 * (1.0 - smoothstep(0.0, max(0.04, fw * 1.5), min(fract(p.x), 1.0 - fract(p.x))));
    gAlb = base * mix(1.0, (0.86 + 0.22 * g) * seam, detail) * (0.8 + 0.3 * big) * (0.78 + 0.32 * stain) * (0.94 + 0.1 * sheet) * edge;
    gRough = 0.95 - 0.35 * smoothstep(0.62, 0.8, big);
    gNT = normalize(vec3((gn2(p * 22.0 + 3.0) - 0.5) * 0.3 * detail, (gn2(p * 22.0 + 9.0) - 0.5) * 0.3 * detail, 1.0));
  } else if (N.y > 0.2) {                 // pitched roof: shingle rows down the slope
    vec2 dirH = normalize(vec2(-N.z, N.x));
    float along = dot(vWP.xz, dirH);
    float slope = vWP.y / max(0.2, length(N.xz)) * 1.0;
    float row = floor(slope / 0.17);
    float f = fract(slope / 0.17);
    float tab = fract(along / 0.33 + gh21(vec2(row, 1.0)) * 0.5);
    float gap = smoothstep(0.0, 0.04, min(tab, 1.0 - tab));
    float vr = 0.82 + 0.3 * gh21(vec2(floor(along / 0.33 + gh21(vec2(row, 1.0)) * 0.5), row));
    gAlb = base * mix(1.0, vr * (0.75 + 0.25 * gap) * (0.8 + 0.2 * f), detail);
    gNT = normalize(vec3(0.0, (0.5 - f) * 0.6 * detail, 1.0));
    gRough = 0.85;
  } else {                                // ledges, huts, tanks: weathered paint / concrete
    float g = gfbm(vec2(vWP.x + vWP.z, vWP.y * 3.0) * 1.5);
    gAlb = base * (0.88 + 0.16 * g);
  }
}
`;

// ------------------------------------------------------------------ surface classes for merged models
const PBR_HEAD = NOISE + `
varying float vMK; varying vec3 vLP;
`;

const ENV_K = 0.5;   // how much the sky's environment map lights and reflects (the hemisphere light does the rest)
function create(THREE, renderer) {
  const X = {};
  const U = X.U = {
    uNight: { value: 0 }, uDay: { value: 1 }, uDbg: { value: 0 },
    uSkyTop: { value: new THREE.Color(0x4f8fe0) }, uSkyLow: { value: new THREE.Color(0xaecde9) },
  };
  const tangentNormal = `
	{
		vec3 nT = normalize((viewMatrix * vec4(normalize(vec3(vWN.z, 0.0, -vWN.x)), 0.0)).xyz);
		vec3 nB = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
		normal = normalize(nT * gNT.x + nB * gNT.y + normal * gNT.z);
	}`;
  const roofNormal = `
	{
		vec3 wn = normalize(vWN);
		vec3 wt = abs(wn.y) > 0.96 ? vec3(1.0, 0.0, 0.0) : normalize(vec3(-wn.z, 0.0, wn.x));
		vec3 wb = normalize(cross(wn, wt));
		vec3 nT = normalize((viewMatrix * vec4(wt, 0.0)).xyz), nB = normalize((viewMatrix * vec4(wb, 0.0)).xyz);
		normal = normalize(nT * gNT.x + nB * gNT.y + normal * gNT.z);
	}`;

  X.wallMaterial = function () {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: ENV_K });
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'attribute vec3 wa;\nvarying vec3 vWA; varying vec3 vWP; varying vec3 vWN; varying vec2 vFU;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n\tvWA = wa; vFU = uv; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = WALL_HEAD + sh.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\n\tfacade(diffuseColor.rgb);\n\tdiffuseColor.rgb = gAlb;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = gRough;')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor = gMetal;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>' + tangentNormal)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance = gEmi;');
    };
    mat.customProgramCacheKey = () => 'cft-facade';
    return mat;
  };

  X.roofMaterial = function () {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: ENV_K });
    mat.onBeforeCompile = sh => {
      sh.vertexShader = 'varying vec3 vWP; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n\tvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = ROOF_HEAD + sh.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\n\troofSurface(diffuseColor.rgb);\n\tdiffuseColor.rgb = gAlb;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = gRough;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>' + roofNormal);
    };
    mat.customProgramCacheKey = () => 'cft-roof';
    return mat;
  };

  // A vertex-coloured MeshStandardMaterial that reads the surface class `mk` (0 when a geometry has none).
  // o: {color, transparent, opacity, rough (default for class 0), instanced: true when per-instance tints}
  X.pbr = function (o) {
    o = o || {};
    const mat = new THREE.MeshStandardMaterial({ vertexColors: o.vertexColors !== false, color: o.color == null ? 0xffffff : o.color, roughness: o.rough || 0.78, metalness: 0, envMapIntensity: ENV_K, transparent: !!o.transparent, opacity: o.opacity == null ? 1 : o.opacity });
    const key = 'cft-pbr' + (o.leaf ? '-leaf' : '');
    mat.onBeforeCompile = sh => {
      sh.vertexShader = 'attribute float mk;\nvarying float vMK; varying vec3 vLP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvMK = mk; vLP = position;');
      sh.fragmentShader = PBR_HEAD + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
	int K = int(vMK + 0.5);
	${o.leaf ? 'K = 8;' : ''}
	float fwL = max(fwidth(vLP.x), max(fwidth(vLP.y), fwidth(vLP.z)));
	float dK = 1.0 - smoothstep(0.004, 0.02, fwL);
	if (K == 6) diffuseColor.rgb *= 1.0 - dK * 0.09 * step(0.5, fract((vLP.x + vLP.y * 0.7 + vLP.z) * 90.0));   // cloth weave
	if (K == 7) diffuseColor.rgb *= 0.86 + 0.22 * mix(0.5, gn2(vec2((vLP.x + vLP.z) * 160.0, vLP.y * 9.0)), dK);  // hair strands
	if (K == 8) diffuseColor.rgb *= 0.78 + 0.4 * gn2(vLP.xz * 7.0 + vLP.y * 5.0);                               // leaves: lighter / darker clumps
	if (K == 4) diffuseColor.rgb *= 0.97 + 0.05 * gn2(vLP.xy * 80.0);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
	roughnessFactor = K == 1 ? 0.26 : K == 2 ? 0.05 : K == 3 ? 0.28 : K == 4 ? 0.52 : K == 5 ? 0.12 : K == 6 ? 0.95 : K == 7 ? 0.42 : K == 8 ? 0.82 : K == 9 ? 0.38 : roughnessFactor;`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
	metalnessFactor = K == 3 ? 0.9 : K == 1 ? 0.12 : 0.0;`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
	if (K == 4) reflectedLight.directDiffuse += diffuseColor.rgb * vec3(0.16, 0.05, 0.03) * ${o.leaf ? '0.0' : '1.0'};   // a little warmth in the shadows of skin
	if (K == 8) reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.05, 0.09, 0.02);`);
    };
    mat.customProgramCacheKey = () => key;
    return mat;
  };

  // ---------------------------------------------------------------- environment map (sky reflections)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envU = { top: { value: new THREE.Color() }, low: { value: new THREE.Color() }, ground: { value: new THREE.Color(0x6b6a66) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color(1, 1, 1) } };
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: envU,
    vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top, low, ground, sunDir, sunCol; varying vec3 vD;
      void main() { vec3 d = normalize(vD); float h = d.y;
        vec3 sky = mix(low, top, smoothstep(0.0, 0.6, h));
        vec3 c = h > 0.0 ? sky : mix(low * 0.8, ground, smoothstep(0.0, -0.25, h));
        // a band of buildings around the horizon, so reflections are not pure sky
        float city = step(h, 0.06 + 0.05 * step(0.5, fract(atan(d.z, d.x) * 6.0))) * step(-0.02, h);
        c = mix(c, ground * 1.1, city * 0.6);
        float s = max(0.0, dot(d, normalize(sunDir)));
        c += sunCol * (pow(s, 600.0) * 30.0 + pow(s, 12.0) * 0.4);
        gl_FragColor = vec4(c, 1.0); }`,
  })));
  let envRT = null;
  X.envTexture = null;
  X.updateEnv = function (top, low, sunDir, sunCol, night) {
    envU.top.value.copy(top); envU.low.value.copy(low);
    envU.ground.value.setRGB(0.42, 0.41, 0.4).multiplyScalar(1 - night * 0.8);
    envU.sunDir.value.copy(sunDir); envU.sunCol.value.copy(sunCol).multiplyScalar(1 - night * 0.85);
    const prev = envRT;
    envRT = pmrem.fromScene(envScene, 0, 0.1, 100);
    X.envTexture = envRT.texture;
    if (prev) prev.dispose();
    return X.envTexture;
  };
  X.dispose = () => { if (envRT) envRT.dispose(); pmrem.dispose(); };
  return X;
}

window.CFTGfx = { create };
})();
