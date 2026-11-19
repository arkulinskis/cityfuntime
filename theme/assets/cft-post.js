/* City Fun Time: post-processing for high quality (2026-11-19 graphics overhaul).
   The world is drawn into an off-screen target (HDR half-float on WebGL2, 4x MSAA, with a depth texture), then:
     1. ambient occlusion (SAO-style, half resolution, from depth only) + a depth-aware blur
     2. bloom (bright pass + a 4-level down/up-sample chain), so lamps, neon, fire and the sun glow
     3. one composite: AO, bloom, exposure + a filmic curve, contrast / saturation / warmth, vignette, dither (+ FXAA
        when the target has no MSAA)
   const P = CFTPost.create(renderer, {low})   P.setSize(w, h) / P.render(scene, camera) / P.set({...}) / P.dispose()
   P.params: exposure, ao (strength 0-1), aoR (metres), bloom (strength), thr (bloom threshold), sat, con, warm, vig.
   P.level: 2 = everything, 1 = no AO, 0 = off (the world renders straight to the screen). P.adapt(dt) lowers the level
   when frames are slow for a few seconds (and never raises it again in this session). */
(function () {
'use strict';

const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const AO_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDepth;
uniform vec2 res;          // AO target size
uniform mat4 projInv;
uniform float proj11, radius, near, far, fade;
float depthAt(vec2 uv) { return texture2D(tDepth, uv).x; }
vec3 viewPos(vec2 uv, float d) {
  vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 v = projInv * c; return v.xyz / v.w;
}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  float d = depthAt(vUv);
  if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv, d);
  float dist = -P.z;
  if (dist > fade) { gl_FragColor = vec4(1.0); return; }
  // normal from the neighbour that is closest in depth on each axis (keeps edges clean)
  vec2 px = 1.0 / res;
  vec3 Pr = viewPos(vUv + vec2(px.x, 0.0), depthAt(vUv + vec2(px.x, 0.0)));
  vec3 Pl = viewPos(vUv - vec2(px.x, 0.0), depthAt(vUv - vec2(px.x, 0.0)));
  vec3 Pu = viewPos(vUv + vec2(0.0, px.y), depthAt(vUv + vec2(0.0, px.y)));
  vec3 Pd = viewPos(vUv - vec2(0.0, px.y), depthAt(vUv - vec2(0.0, px.y)));
  vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
  vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
  vec3 N = normalize(cross(dx, dy));
  float r = radius * (1.0 + dist * 0.012);               // a bigger reach far away, so whole buildings shade the street
  float ssR = r * proj11 * 0.5 * res.y / dist;           // the radius in AO pixels
  ssR = min(ssR, 90.0);
  if (ssR < 1.0) { gl_FragColor = vec4(1.0); return; }
  float ang = hash12(gl_FragCoord.xy) * 6.2831853, sum = 0.0;
  const int N_S = 12;
  for (int i = 0; i < N_S; i++) {
    float a = (float(i) + 0.5) / float(N_S);
    float rr = a * a;                                    // more samples near the centre
    float th = ang + a * 6.2831853 * 3.0;
    vec2 o = vec2(cos(th), sin(th)) * rr * ssR * px;
    vec2 suv = vUv + o;
    float sd = depthAt(suv);
    if (sd >= 0.99999) continue;
    vec3 S = viewPos(suv, sd), v = S - P;
    float vv = dot(v, v), vn = dot(v, N);
    float fall = max(0.0, 1.0 - vv / (r * r));
    sum += fall * max(0.0, vn - 0.012 * dist) / (vv + 0.02);
  }
  float ao = max(0.0, 1.0 - 2.2 * sum / float(N_S));
  ao = mix(ao, 1.0, smoothstep(fade * 0.55, fade, dist));
  gl_FragColor = vec4(ao, ao, ao, 1.0);
}`;

// depth-aware 9-tap blur (run twice: across, then down)
const BLUR_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tAO, tDepth;
uniform vec2 dir;
uniform float near, far;
float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
void main() {
  float d0 = lin(texture2D(tDepth, vUv).x), sum = 0.0, wsum = 0.0;
  for (int i = -4; i <= 4; i++) {
    vec2 uv = vUv + dir * float(i);
    float w = exp(-float(i * i) / 10.0);
    float dz = abs(lin(texture2D(tDepth, uv).x) - d0) / max(d0, 0.5);
    w *= max(0.0, 1.0 - dz * 18.0);
    sum += texture2D(tAO, uv).x * w; wsum += w;
  }
  float ao = wsum > 0.0 ? sum / wsum : 1.0;
  gl_FragColor = vec4(ao, ao, ao, 1.0);
}`;

const BRIGHT_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform vec2 px;
uniform float thr;
vec3 pick(vec2 uv) { vec3 c = texture2D(tColor, uv).rgb; float l = max(c.r, max(c.g, c.b)); return c * max(0.0, l - thr) / max(l, 1e-4); }
void main() {
  // 4 taps = a soft downsample, so single bright pixels do not flicker
  vec3 c = pick(vUv + px * vec2(-0.5, -0.5)) + pick(vUv + px * vec2(0.5, -0.5)) + pick(vUv + px * vec2(-0.5, 0.5)) + pick(vUv + px * vec2(0.5, 0.5));
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;

const DOWN_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 px;   // source texel
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv + px * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + px * vec2(1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + px * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + px * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}`;

const UP_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc, tBase;
uniform vec2 px;   // source texel
void main() {
  vec3 c = texture2D(tSrc, vUv + px * vec2(-1.0, 0.0)).rgb + texture2D(tSrc, vUv + px * vec2(1.0, 0.0)).rgb;
  c += texture2D(tSrc, vUv + px * vec2(0.0, -1.0)).rgb + texture2D(tSrc, vUv + px * vec2(0.0, 1.0)).rgb;
  c = c * 0.18 + texture2D(tSrc, vUv).rgb * 0.28;
  gl_FragColor = vec4(c + texture2D(tBase, vUv).rgb, 1.0);
}`;

const COMP_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor, tAO, tBloom;
uniform vec2 px;
uniform float aoK, bloomK, exposure, sat, con, warm, vig, fxaa, useAO;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 fetch(vec2 uv) { return texture2D(tColor, uv).rgb; }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 fxaaColor(vec2 uv) {
  vec3 m = fetch(uv), n = fetch(uv + vec2(0.0, -px.y)), s = fetch(uv + vec2(0.0, px.y)), e = fetch(uv + vec2(px.x, 0.0)), w = fetch(uv - vec2(px.x, 0.0));
  float lm = luma(m), ln = luma(n), ls = luma(s), le = luma(e), lw = luma(w);
  float mn = min(lm, min(min(ln, ls), min(le, lw))), mx = max(lm, max(max(ln, ls), max(le, lw)));
  if (mx - mn < max(0.04, mx * 0.12)) return m;
  vec2 dir = vec2(ln - ls, le - lw);   // along the edge (perpendicular to the gradient)
  float rc = 1.0 / (min(abs(dir.x), abs(dir.y)) + 0.02);
  dir = clamp(dir * rc, -2.0, 2.0) * px;
  vec3 a = 0.5 * (fetch(uv + dir * (1.0 / 3.0 - 0.5)) + fetch(uv + dir * (2.0 / 3.0 - 0.5)));
  vec3 b = a * 0.5 + 0.25 * (fetch(uv - dir * 0.5) + fetch(uv + dir * 0.5));
  float lb = luma(b);
  return (lb < mn || lb > mx) ? a : b;
}
void main() {
  vec3 c = fxaa > 0.5 ? fxaaColor(vUv) : fetch(vUv);
  if (useAO > 0.5) { float ao = texture2D(tAO, vUv).x; c *= mix(1.0, ao, aoK); }
  c += texture2D(tBloom, vUv).rgb * bloomK;
  // the scene is drawn in display (gamma) colours: go linear, expose, filmic curve, back
  vec3 lin = pow(max(c, 0.0), vec3(2.2)) * exposure;
  c = pow(aces(lin), vec3(1.0 / 2.2));
  float l = luma(c);
  c = mix(vec3(l), c, sat);
  c = (c - 0.5) * con + 0.5;
  c += vec3(0.012, 0.004, -0.014) * warm;
  vec2 q = vUv - 0.5;
  c *= 1.0 - vig * smoothstep(0.32, 0.92, dot(q, q) * 2.2);
  // tiny dither so the sky gradient never bands
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

function create(renderer, opts) {
  const THREE = window.THREE;
  opts = opts || {};
  const gl2 = renderer.capabilities.isWebGL2;
  const halfOK = gl2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
  const P = {
    level: 2,
    params: { exposure: 0.84, ao: 0.9, aoR: 1.5, bloom: 0.45, thr: 0.98, sat: 1.1, con: 1.04, warm: 1, vig: 0.26 },
    info: null,
  };
  const msaa = gl2 ? 4 : 0;
  const lin = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false };
  let W = 1, H = 1;
  const depthTex = new THREE.DepthTexture(1, 1);
  depthTex.type = THREE.UnsignedIntType;
  const rtScene = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: halfOK ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: msaa, depthTexture: depthTex, stencilBuffer: false });
  const rtAO = new THREE.WebGLRenderTarget(1, 1, lin), rtAO2 = new THREE.WebGLRenderTarget(1, 1, lin);
  const bloomType = halfOK ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const rtB = [0, 1, 2, 3, 4].map(() => new THREE.WebGLRenderTarget(1, 1, Object.assign({ type: bloomType }, lin)));
  const rtU = [0, 1, 2, 3].map(() => new THREE.WebGLRenderTarget(1, 1, Object.assign({ type: bloomType }, lin)));

  const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  quad.frustumCulled = false;
  quadScene.add(quad);
  const mat = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
  const aoMat = mat(AO_FS, { tDepth: { value: depthTex }, res: { value: new THREE.Vector2() }, projInv: { value: new THREE.Matrix4() }, proj11: { value: 1 }, radius: { value: 1.4 }, near: { value: 0.3 }, far: { value: 2000 }, fade: { value: 220 } });
  const blurMat = mat(BLUR_FS, { tAO: { value: null }, tDepth: { value: depthTex }, dir: { value: new THREE.Vector2() }, near: { value: 0.3 }, far: { value: 2000 } });
  const brightMat = mat(BRIGHT_FS, { tColor: { value: rtScene.texture }, px: { value: new THREE.Vector2() }, thr: { value: 0.8 } });
  const downMat = mat(DOWN_FS, { tSrc: { value: null }, px: { value: new THREE.Vector2() } });
  const upMat = mat(UP_FS, { tSrc: { value: null }, tBase: { value: null }, px: { value: new THREE.Vector2() } });
  const compMat = mat(COMP_FS, { tColor: { value: rtScene.texture }, tAO: { value: rtAO.texture }, tBloom: { value: rtU[0].texture }, px: { value: new THREE.Vector2() }, aoK: { value: 0.8 }, bloomK: { value: 0.5 }, exposure: { value: 1 }, sat: { value: 1 }, con: { value: 1 }, warm: { value: 1 }, vig: { value: 0.3 }, fxaa: { value: msaa ? 0 : 1 }, useAO: { value: 1 } });

  function pass(m, target) { quad.material = m; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); }

  P.setSize = function (w, h) {
    // w, h = drawing-buffer pixels
    W = Math.max(1, w | 0); H = Math.max(1, h | 0);
    rtScene.setSize(W, H);
    const aw = Math.max(1, W >> 1), ah = Math.max(1, H >> 1);
    rtAO.setSize(aw, ah); rtAO2.setSize(aw, ah);
    for (let i = 0; i < rtB.length; i++) rtB[i].setSize(Math.max(1, W >> (i + 1)), Math.max(1, H >> (i + 1)));
    for (let i = 0; i < rtU.length; i++) rtU[i].setSize(Math.max(1, W >> (i + 1)), Math.max(1, H >> (i + 1)));
  };
  P.set = o => Object.assign(P.params, o || {});

  P.render = function (scene, camera) {
    if (P.level <= 0) { renderer.setRenderTarget(null); renderer.render(scene, camera); P.info = { triangles: renderer.info.render.triangles, calls: renderer.info.render.calls }; return; }
    const p = P.params, auto = renderer.info.autoReset;
    renderer.info.autoReset = false; renderer.info.reset();
    renderer.setRenderTarget(rtScene);
    renderer.render(scene, camera);
    P.info = { triangles: renderer.info.render.triangles, calls: renderer.info.render.calls };
    const useAO = P.level >= 2 && p.ao > 0.01;
    if (useAO) {
      const u = aoMat.uniforms;
      u.res.value.set(rtAO.width, rtAO.height);
      u.projInv.value.copy(camera.projectionMatrixInverse);
      u.proj11.value = camera.projectionMatrix.elements[5];
      u.radius.value = p.aoR; u.near.value = camera.near; u.far.value = camera.far;
      pass(aoMat, rtAO);
      blurMat.uniforms.near.value = camera.near; blurMat.uniforms.far.value = camera.far;
      blurMat.uniforms.tAO.value = rtAO.texture; blurMat.uniforms.dir.value.set(1.6 / rtAO.width, 0); pass(blurMat, rtAO2);
      blurMat.uniforms.tAO.value = rtAO2.texture; blurMat.uniforms.dir.value.set(0, 1.6 / rtAO.height); pass(blurMat, rtAO);
    }
    // bloom chain
    brightMat.uniforms.px.value.set(1 / W, 1 / H); brightMat.uniforms.thr.value = p.thr;
    pass(brightMat, rtB[0]);
    for (let i = 1; i < rtB.length; i++) { downMat.uniforms.tSrc.value = rtB[i - 1].texture; downMat.uniforms.px.value.set(1 / rtB[i - 1].width, 1 / rtB[i - 1].height); pass(downMat, rtB[i]); }
    // up: rtU[3] = rtB[4] up + rtB[3], ... rtU[0] = rtU[1] up + rtB[0]
    for (let i = rtU.length - 1; i >= 0; i--) {
      const src = i === rtU.length - 1 ? rtB[rtB.length - 1] : rtU[i + 1];
      upMat.uniforms.tSrc.value = src.texture; upMat.uniforms.tBase.value = rtB[i].texture; upMat.uniforms.px.value.set(1 / src.width, 1 / src.height);
      pass(upMat, rtU[i]);
    }
    const c = compMat.uniforms;
    c.px.value.set(1 / W, 1 / H);
    c.aoK.value = p.ao; c.useAO.value = useAO ? 1 : 0; c.bloomK.value = p.bloom; c.exposure.value = p.exposure;
    c.sat.value = p.sat; c.con.value = p.con; c.warm.value = p.warm; c.vig.value = p.vig;
    pass(compMat, null);
    renderer.info.autoReset = auto;
  };

  // frame-time watchdog: about 4 s of frames slower than 1/34 s drops a level (AO first, then post entirely)
  let slow = 0, seen = 0;
  P.adapt = function (dt) {
    if (P.level <= 0 || !(dt > 0) || dt > 0.5) return;  // ignore pauses and tab switches
    seen += dt;
    if (seen < 6) return;                               // let the first tiles settle
    slow = dt > 1 / 34 ? slow + dt : Math.max(0, slow - dt * 0.5);
    if (slow > 4) { P.level--; slow = 0; if (P.onLevel) P.onLevel(P.level); }
  };

  P.dispose = function () {
    [rtScene, rtAO, rtAO2].concat(rtB, rtU).forEach(r => r.dispose());
    [aoMat, blurMat, brightMat, downMat, upMat, compMat].forEach(m => m.dispose());
    quad.geometry.dispose(); depthTex.dispose();
  };
  return P;
}

window.CFTPost = { create };
})();
