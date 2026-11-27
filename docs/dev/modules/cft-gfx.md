# cft-gfx.js — `CFTGfx`: procedural high-quality materials (facades, roofs, PBR surface classes, sky reflections)

## At a glance

| | |
|---|---|
| File | `theme/assets/cft-gfx.js` (~435 lines; most of it GLSL in template strings) |
| Global it exports | `window.CFTGfx = { create }` (~L434) |
| How it is created | `const GFX = !LOW && window.CFTGfx ? window.CFTGfx.create(THREE, renderer) : null` in `theme/assets/cft-world.js` (~L52). Only on **high** quality; low quality keeps cft-world's Lambert materials |
| Who calls it | cft-world.js only: `GFX.wallMaterial()` (walls), `GFX.roofMaterial()` (plain/roofs), `GFX.pbr(...)` (trees, vertex-coloured models, props, tinted instances, decor, slime monsters), `GFX.U` uniforms in `W.setClock`, `GFX.updateEnv(...)` when the hour moves on; exposed as `W.gfx` (tests flip `W.gfx.U.uDbg`) |
| Load order | Before `cft-world.js` (cft-kit `ALL`: `three.min.js`, `cft-post.js`, `cft-gfx.js`, ...) |
| three.js | r149 (`onBeforeCompile` patches of `MeshStandardMaterial` chunks) |
| Test flags | `python -I tools/live/game_test.py --gfx OUTDIR` (facades up close, street, roofs, cars, you, dusk, night), `--models`, `--shots` |

## Responsibilities

- `wallMaterial()`: building facades drawn entirely in the shader from a per-vertex attribute `wa` = [style, seed, shop band] and the floor/bay grid in the wall UVs: brick, stucco, concrete panels, siding, greystone, glass curtain wall; windows with lintels, sills, frames, recesses, blinds and a fake interior room (interior mapping) lit at night; shop windows on street floors.
- `roofMaterial()`: flat roofs (membrane, seams, gravel, stains), pitched roofs (shingle rows), plain sides.
- `pbr(o)`: a vertex-coloured `MeshStandardMaterial` that reads a per-vertex surface class attribute `mk` (0 matte, 1 car paint, 2 glass, 3 metal, 4 skin, 5 wet/eyes, 6 cloth, 7 hair, 8 leaves, 9 plastic, 10 wood, 11 bark) for roughness/metalness and small procedural details.
- Detail textures (2026-11-27): `MAT_TEX` = bark, leaves, wood, grime, metal, rendered in Blender by `tools/material_render.py` into `theme/assets/mat-<name>.jpg` (colour) + `mat-<name>-h.jpg` (height). `loadMat` packs them into one `DataArrayTexture` (RGB colour, A height) and measures each layer's mean colour (`X.MU.mMean`); `X.matReady` once loaded. In `pbr`, classes 11/8/10/0/3 map to layers 0-4: `matSample` projects triplanar in object space (`vLP`, `vLN`), the colour is multiplied by `t.rgb / mean` at strength `mK` (the vertex colour stays the colour), and the height becomes a screen-space bump (`gMH`, `gMB`; three's perturbNormalArb maths), faded out when a texel is smaller than a pixel (otherwise it sparkles).
- An environment map (`updateEnv`): a tiny sky scene rendered through `PMREMGenerator` for reflections.

Not here: geometry and the `wa` / `mk` attributes (cft-world.js; surface classes are assigned by its merge helpers around the "Surface classes" comment ~L363), the day/night lighting itself (cft-world `W.setClock`), post-processing (cft-post.js), colour blocks greying (cft-world `greyify` wraps these materials' `onBeforeCompile` afterwards).

## Public API (`X = CFTGfx.create(THREE, renderer)`)

| Name | Signature | What it does | Called by |
|---|---|---|---|
| `create` | `(THREE, renderer) -> X` (~L318) | Builds uniforms, the PMREM generator and the env scene | cft-world.js |
| `X.U` | `{uNight, uDay, uDbg, uSkyTop, uSkyLow}` | Shared uniforms merged into the facade shader | cft-world `W.setClock` (night, day, sky colours); tests (`uDbg`: 1 = the view direction in the wall's tangent frame, 2 = wall pattern coordinates, 3 = window cell, 4 = the distance detail factor) |
| `X.wallMaterial` | `() -> MeshStandardMaterial` (~L339) | Facade shader; program cache key `'cft-facade'` | cft-world `MAT.walls` |
| `X.roofMaterial` | `() -> MeshStandardMaterial` (~L356) | Roof shader; key `'cft-roof'` | cft-world `MAT.plain` |
| `X.pbr` | `(o?) -> MeshStandardMaterial` (~L372) | `o`: `{color, vertexColors (default true), transparent, opacity, rough, leaf, bark}`; key `'cft-pbr'`, `'cft-pbr-leaf'` (`leaf` forces class 8) or `'cft-pbr-bark'` (`bark` forces class 11) | cft-world `MAT.crown`, `MAT.trunk` (bark), `vc`, `prop`, `tint`, `decor`, `slimeMat` |
| `X.MU` / `X.matReady` | uniforms / boolean | Detail-texture uniforms (`matTex`, `mOn`, `mMean`, `mScale`, `mK`, `mBump`; tune strengths in `MAT_TEX`) / true once the textures are in | pbr materials; tests (`W.gfx.matReady`) |
| `X.updateEnv` | `(top, low, sunDir, sunCol, night) -> Texture` (~L420) | Re-renders the env scene into a new PMREM target, disposes the previous one | cft-world `W.setClock` (sets `scene.environment`) |
| `X.envTexture` | Texture \| null | Last env map | — |
| `X.dispose` | `()` | Disposes the env target and the generator | no caller found (cft-world's destroy disposes `POST` but not `GFX`) |

## Internal structure

| Lines | Section | What |
|---|---|---|
| 1–14 | header | Contract and surface class list |
| 18–23 | `NOISE` | GLSL hash / value noise / fbm (`gh21`, `gn2`, `gfbm`) shared by every shader |
| 25–271 | facades (`WALL_HEAD`) | Uniforms, varyings, `FH` 3.3 m floor height, `CW` 3.6 m bay width, `wallH` (wall patterns), `room` (interior mapping), `reflSky`, `facade(base)` which sets `gAlb`, `gRough`, `gMetal`, `gEmi`, `gNT`; the `uDbg` debug views at the end |
| 273–310 | roofs (`ROOF_HEAD`) | `roofSurface(base)` |
| 312–316 | `PBR_HEAD` | varyings for `pbr` |
| 317 | `ENV_K` | 0.5: env map intensity on every material |
| 318–398 | `create` | uniforms, tangent-space normal snippets, the three material factories |
| 400–431 | environment map | env sky sphere `ShaderMaterial` (sky gradient, a band of "city" on the horizon, sun), `updateEnv`, `dispose` |

## How the shader patching works

Each factory creates a stock `MeshStandardMaterial` and sets `onBeforeCompile` to: add attributes/varyings to the vertex shader after `#include <begin_vertex>`, prepend the GLSL head to the fragment shader, and replace chunk includes (`color_fragment`, `roughnessmap_fragment`, `metalnessmap_fragment`, `normal_fragment_maps`, `emissivemap_fragment`, `lights_fragment_end`) to inject the procedural values. `customProgramCacheKey` makes three.js compile one program per variant. cft-world's `greyify` later wraps `onBeforeCompile` (calls the previous one first) and extends the cache key with `|cftgrey:<layer>`.

## Tunables

Not in `D.TUNE`. File constants: `ENV_K` (reflection strength), `FH` / `CW` (must match the floor/bay grid cft-world writes into wall UVs), per-class roughness/metalness in `pbr`, default uniforms (sky colours). The time-of-day values come from cft-world `W.setClock`.

## How to test

```
python -I tools/live/game_test.py --gfx OUTDIR       # screenshots; Read the PNGs
python -I tools/live/game_test.py --models OUTDIR    # models up close (pbr classes: paint, glass, skin, hair...)
CFT_QS="&nopost=1" python -I tools/live/game_test.py --gfx OUTDIR   # the same without post-processing
```

Shader compile errors show in the browser console as three.js program errors; the screenshots then show black or missing buildings. Inspect inputs with `W.gfx.U.uDbg.value = 1..4` in a `--eval` script (0 = normal).

## How to modify safely

- Edit GLSL inside the template strings; keep `gAlb`, `gRough`, `gMetal`, `gEmi`, `gNT` assigned on every path (the injected chunks read them).
- **New surface class**: give it a number in `pbr` (roughness, metalness, optional detail), assign it in cft-world's merge helpers, and update the class list in this file's header and the comment in cft-world.
- **New material variant**: give it its own `customProgramCacheKey`, or three.js will reuse another variant's program.
- Chunk names depend on three.js r149; a three.js upgrade can silently break the `.replace` calls (the replacement just does not happen).
- Keep cost in mind: these shaders run for every facade pixel; branch on `detail` (screen-space `fwidth`) as the existing code does to skip fine detail far away.
- Low quality never uses this file: a feature that only exists here is invisible on phones (`quality: 'low'` on coarse pointers).
- After editing: `python tools/assets.py`.

## Review checklist for AI-made diffs

- [ ] Every replaced chunk name exists in three.js r149's `MeshStandardMaterial`.
- [ ] `customProgramCacheKey` unique per shader variant; greyify's wrapper still composes (no direct overwrite of `onBeforeCompile` elsewhere).
- [ ] All `g*` outputs set on every branch; no new uniform without a default in `X.U` (or the material's own uniforms).
- [ ] Render targets disposed when replaced (`updateEnv` pattern).
- [ ] `--gfx` screenshots checked by day and at night; low quality still renders.
- [ ] `python tools/assets.py` run.
