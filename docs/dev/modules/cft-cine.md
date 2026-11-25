# cft-cine.js — voiced cinematic mission scenes (plus cft-vo.js and the voice pipeline)

| At a glance | |
|---|---|
| Files | `theme/assets/cft-cine.js` (460 lines), `theme/assets/cft-vo.js` (3 lines, generated, ~486 clip entries) |
| Globals exported | `window.CFTCine = C` (pure helpers + `attach` + `VoiceQueue`, line 459); `window.CFT_VO = {dir, n, clips}` (cft-vo.js) |
| How created | `if (window.CFTCine) G.cine = window.CFTCine.attach(G)` in `cft-game.js` (~2274), after the world and the other modules attach; `G.cine.destroy()` on teardown (~2334) |
| Load order | `cft-vo.js` before `cft-cine.js` before `cft-debug.js` / `cft-game.js` (see the `ENGINE` list in `tools/live/harness.py` and the asset metas in anvil.yaml) |
| Who calls it | cft-game `sayLines(o)` (~1203): mission intro in `talkTo` (~1244), step `say` lines in `completeStep` (~627), outro in `completeMission` (~645). Build time: `tools/vo_lines.mjs` runs the pure helpers in node |
| Uses from cft-ui | `U.overlay`, `U.isTop`, `U.cineMode`, `U.dialog` (fallback) |
| Uses from cft-world | `W.cine` (camera override read by `updateCamera` -> `cineCamera`), `W.mouth(fig, k)`, `W.animate(fig, 0, dt, pose)`, `W.rayCast`, `W.surfaceAt` / `W.groundAt`, `W.player`, `W.renderer`, `W.THREE` |
| Test flags | `CFT_TEST.cine` (scenes only play in tests when true), `CFT_TEST.mute` (voices are muted in tests unless `=== false`), `CFT_TEST.cineHold` (nothing advances except clicks; for screenshots). Any `window.CFT_TEST` also silences the Web Audio sfx and shortens the closing fade |
| Tests | `python -I tools/live/game_test.py --cine` (cinetest.js, ~37 checks); `--cineshots DIR` (8 staged pictures) |

## 1. Responsibilities

Does:
- Plays a mission's lines as a cut-scene: letterbox bars, HUD faded out (`U.cineMode(true)`), music ducked (`ArkMusic.duck(0.32)`), camera shots computed per line, speaker turning/gesturing/mouth moving with the voice envelope, word-by-word subtitles, title card (intro), narrator chapter card (first mission of a chapter, once per save), MISSION COMPLETE stamp (outro), phone-call card when the speaker is not within 28 m.
- Finds and plays the right voice clip for each line (`Cn.clip`, `VoiceQueue`), one `Audio` element at a time.
- Falls back to the classic `U.dialog` box (still voiced) when scenes are off, in tests without `CFT_TEST.cine`, or while another scene is still running.
- Provides pure helpers (`C.speaker`, `C.key`, `C.paired`, `C.introPlace`, `C.chapterRaw`, `C.chapterSay`, `C.fnv`) shared with the build script so game and audio always agree on a line's clip key.

Does NOT:
- Decide which lines are said or when: cft-game decides (`sayLines`, only for story/side missions in `MISSION`; odd jobs and chats keep `U.dialog`).
- Render audio: clips are pre-rendered by `tools/voice_missions.py` and served from Cloudflare R2.
- Draw the 3D scene: it sets `W.cine` each frame; cft-world applies it. cft-game `updateActors` stops animating figures flagged `userData.cine` and hides name tags / `!` marks while `W.cine` is set (~1191-1196).
- Handle the mission's accept/decline choice (cft-game `U.choose` after the intro).

## 2. Public API

Pure (on `window.CFTCine`, usable in node):

| Name | Signature | What it does |
|---|---|---|
| `C.fnv(s)` | `-> string` | FNV-1a 32-bit over UTF-16 code units, base 36 |
| `C.speaker(raw, who, D, kind)` | `-> {id, text}` | Who says a raw content line: `"Name: ..."` matching `D.CAST` (full, first, last name or id; a trailing `(in a text)` is ignored), `{kid}` -> `'kid'`, `Everyone` -> `'everyone'`; otherwise `'narrator'` for `kind === 'say'`, else the giver `who`. Mirrors cft-ui `speakerOf` |
| `C.key(id, raw, place)` | `-> 'k' + fnv(id|raw|place)` | The clip key |
| `C.paired(id, raw)` | `-> bool` | Lines recorded twice (`gf`/`bf`): every Sam line, and any line with `{pt}`, `{he}`, `{He}`, `{him}`, `{his}` |
| `C.introPlace(m, D)` | `-> string` | The `{place}` words at a mission intro: `"a <kind> nearby"` or `"a spot nearby"` (cft-game `talkTo` builds the same) |
| `C.chapterRaw(ch)` / `C.chapterSay(ch)` | | The chapter card's key text / what the narrator says (chapter 10 = "And around the block...") |
| `C.NUM` | array | `'zero'..'ten'` |
| `C.VoiceQueue` | constructor | See below |
| `C.attach(G)` | `-> Cn` | Creates the scene player |

Instance `Cn = G.cine`:

| Name | Signature | What it does | Called by |
|---|---|---|---|
| `Cn.play(o)` | `o = {who, raw: [lines], ctx, vplace, kind: 'intro'/'outro'/'say', m, actor, chapter}` -> `Promise<true>` (or the `U.dialog` result in fallback) | Plays a scene (Flow below) | cft-game `sayLines`; tests |
| `Cn.playing` | bool | A scene is running | tests, other modules |
| `Cn.clip(id, raw, place)` | `-> {url, dur, env} or null` | Looks up `CFT_VO.clips[C.key(...)]`; for `{gf, bf}` entries picks by `save.pref` (`bf` or else `gf`) | internal, tests |
| `Cn.skip()` | | Ends the current scene (`skipAll`) | Esc / Skip button, tests, `destroy` |
| `Cn.chapterFor(m)` | `-> chapter or null` | First call per chapter returns `D.CHAPTERS` entry and marks `save.cine.ch[id] = 1`; `null` when scenes are disabled | cft-game `talkTo` |
| `Cn.destroy()` | | Stops scenes for good (`alive = false`) | cft-game teardown |

`VoiceQueue(clips)`: `playClip(clip)` -> handle `{a, ok(), ended(), env()}` (stops any previous clip), `play(i)`, `stop()`. `env()` reads the clip's envelope string at `currentTime * 20` and returns 0..1.

## 3. Internal structure (cft-cine.js)

| Lines | Section |
|---|---|
| 1-24 | Header: design notes, API summary, world hooks |
| 28-55 | Pure helpers: `C.fnv`, `C.speaker`, `C.key`, `C.paired`, `C.introPlace`, `ORD`, `C.chapterRaw`, `C.chapterSay` |
| 57-83 | `C.attach`: `REDUCED` (prefers-reduced-motion), `testing`, `enabled`, `voiceOn`, `base()` (media root), `st()` (`save.cine.ch`), `Cn.clip` |
| 85-128 | `sfx(kind)`: Web Audio one-shots `whoosh`, `swish`, `boom`, `stamp`, `ring` (no files; off when `settings.sound` is off or in tests) |
| 130-195 | Geometry: `headOf`, `playerHead`, `flat`, `faceYaw`, `fit` (pull camera in front of walls via `W.rayCast`), `groundY`, `makeShot(kind, S, P, side)`, `pickSide(S)` |
| 197-213 | Overlay: `castInfo(id)`, `buildOverlay()` (`.cft-cine` with `[data-cskip]`, `[data-ccard]`, `[data-ccall]`, `[data-csub]`, `[data-cwho]`, `[data-ctext]`, `[data-cnext]`) |
| 215-413 | `Cn.play`: setup, input, frame loop + watchdog, chapter card, title card, lines loop, outro stamp, `finally` cleanup |
| 414-423 | `Cn.skip`, `Cn.chapterFor`, `Cn.destroy` |
| 425-427 | `COLS` subtitle name colour per cast id, `colorOf` |
| 431-458 | `VoiceQueue` |

### Shot kinds (`makeShot`)
Each shot = camera `a -> b`, look-at `la -> lb`, fov `fa -> fb`, eased (smoothstep) over the line.

| Kind | Framing | Used for |
|---|---|---|
| `two` | Establishing two-shot from the side | First intro line with no mission object; giver present but no named speaker |
| `close` | Speaker from just past your shoulder | Lines |
| `ots` | Over your shoulder at the speaker | Lines |
| `low` | Low hero angle on both | Lines, outro stamp |
| `crane` | High above you, rising and turning | Narrator chapter card |
| `hero` | You from the front | Phone calls, no one to look at |

Line sequences: intro `['close','ots','close','low','ots','two']`, say `['close','ots','close','low']`, outro `['low','close','ots','close','two']` (cycled by line index, ~332). `pickSide` picks one side of the 180-degree line per scene (tries `close` from side 1 then -1 and keeps the unblocked one). On narrow screens (aspect < 1.25) `two` and `low` step back up to 2.4x so both people fit.

## 4. Key state

| State | Where | Meaning |
|---|---|---|
| `scene` | closure | The running scene `sc = {o, lines, i, skipAll, next, t, side, figs, done, ended, ov, words, shown, lineDur, lineT, callOn}` |
| `alive` | closure | False after `destroy` |
| `Cn.playing` | instance | Scene running |
| `W.cine` | world | `{pos, look, fov, face, pose}` while a scene runs, `null` after |
| `fig.userData.cine / talk / cheerT` | actor figures | In the scene / mouth envelope / cheering seconds |
| `save.cine.ch` | save | Narrator chapter cards already seen (`{chapterId: 1}`) |
| `save.settings.voice`, `save.settings.cine` | save | Both default on (`!== false`); toggled in the phone Settings app |
| `save.pref` | save | `'bf'` picks the bf clip of paired lines |

## 5. Flow: how a scene plays

1. cft-game `sayLines(o)` calls `G.cine.play(o)` when `o.m` is set (story/side mission). For the intro, `talkTo` also passes `actor: a.obj`, `vplace` (= `ctx.place`) and `chapter: G.cine.chapterFor(m)`.
2. `Cn.play` filters empty lines. If a scene is already running and scenes are enabled, it skips the old one and awaits `old.ended`.
3. **Fallback** when `!enabled()` (setting off, or tests without `CFT_TEST.cine`), still busy, no world, or destroyed: builds a `VoiceQueue` of clips (unless testing / voice off) and returns `U.dialog({who, lines: G.text(...), onLine: i => vo.play(i), onClose: vo.stop})`.
4. **Scene setup:** `buildOverlay()` via `U.overlay(..., 'cft-cine-wrap')` (the game pauses like any dialog), `U.cineMode(true)`, `ArkMusic.duck(0.32)`, `sfx('whoosh')`, bars slide in (`.in`). The main figure is `o.actor` or `G.actorOf(o.who)`, dropped if more than 28 m away. Input: click anywhere / Space / Enter / E = `next()`, Esc or `[data-cskip]` = skip all (capture-phase keydown, only when `U.isTop(ov)`).
5. **Frame loop:** `requestAnimationFrame` plus a 50 ms `setInterval` watchdog that runs `frame()` when rAF stalls (hidden or headless tab). Each frame lerps the shot into `W.cine`, turns the player to face the speaker (or past the camera on a call), animates every scene figure with pose `talk` (or `cheer` while `cheerT > 0`), sets `W.mouth(fig, env)` for the speaker, swells the call card with the envelope, and reveals subtitle words proportionally to elapsed time / line duration.
6. **Chapter card** (if `o.chapter`): narrator clip `Cn.clip('narrator', C.chapterRaw(ch), '')`, `crane` shot, `sfx('boom')`, lasts clip duration + 0.9 s (or 4.2 + 0.9 s).
7. **Title card** (intro with `o.m`): chapter label + mission title + "with <giver>", `two` (or `hero` + pose `phone` when no figure), waits ~1.9 s or a click.
8. **Lines loop:** for each raw line: `C.speaker` -> cast info; speaker figure via `figOf(id)` (`G.actorOf(id, 28)`); clip via `Cn.clip(sp.id, raw, o.vplace)` (none for `everyone`); text via `G.text(sp.text, o.ctx)`; duration = clip seconds (voice on) or `max(2.2, text.length * 0.058)` s. Shot: figure present -> next kind in the sequence; named speaker absent -> phone call (`sfx('ring')`, `.cft-cine-call`, pose `phone`, `hero` shot); narrator/everyone -> `two`/`hero`. Subtitles: `[data-cwho]` coloured by `COLS`, words wrapped in `<span>` (escaped). Voice: `vq.playClip(clip)`; mouth envelope from the clip, or a fake sine flap when no audio. The line ends when the audio ends (or `dur + 4` s safety), or `dur + 0.25` s without audio, then 380 ms; a click first reveals all words (and ends the line at once when no audio is playing), a second click moves on.
9. **Outro stamp** (outro with `o.m`): "Mission complete" card, `sfx('stamp')`, the giver cheers 1.6 s, `low` shot, ~1.7 s.
10. **Cleanup (`finally`)**: stop voice, cancel rAF + watchdog, remove key listener, reset figure flags and mouths, bars out, `ArkMusic.duck(1)`, wait 280 ms (0 in tests / reduced motion), `W.cine = null`, `U.cineMode(false)`, close overlay, `scene = null`, `Cn.playing = false`, resolve `ended`, `G.dirty()`.

Clip URL: `base() + CFT_VO.dir + file + '.mp3'`, where `base()` = `window.CFT_VO_BASE`, or `ArkMusic.base` with a trailing `music/` removed, or `https://arkvital-media.addanapp.workers.dev/`. So clips are `<media root>vo/cft/<file>.mp3`. <!-- doc-check: skip -->

## 6. cft-vo.js and the voice pipeline

`theme/assets/cft-vo.js` is **generated by `tools/voice_missions.py`; never edit it by hand.** Shape:

```
window.CFT_VO = {"dir":"vo/cft/","n":<lines>,"clips":{"<key>":["<file>",<seconds>,"<envelope>"], "<key>":{"gf":[...],"bf":[...]}}};
```
`<key>` = `C.key(speaker, raw line, voice place)`; `<file>` = first 12 hex chars of md5(`PROC|voice spec|speaker|spoken text`); `<envelope>` = one digit 0-9 per 1/20 s (mouth openness).

Pipeline:
1. **`node tools/vo_lines.mjs`** loads `cft-content.js` and `cft-cine.js` into a node `vm` context and lists every spoken line as JSON `{lines: [{key, variant, speaker, raw, say}], caps}`: each mission's `intro` (with `C.introPlace`), `outro`, every step `say` (kind `'say'`, so unnamed lines go to the narrator), and one narrator line per `D.CHAPTERS` entry. Paired lines get two entries (`gf`, `bf`); Sam's `bf` take uses speaker `sam_b`. `everyone` lines are skipped. `voiceText()` turns content text into speakable text: `{name}` dropped/"friend", `{kid}` -> "our little one", `{place}`, gendered tokens per variant, `22:00` -> "ten at night", emoji / `*stage directions*` / "(or ...)" removed, all-caps words lowercased unless in `ACR` (Kokoro would spell them).
2. **`python tools/voice_missions.py`** (Kokoro-82M on the local GPU; needs `kokoro`, `torch`, `scipy`, `imageio_ffmpeg`): renders only new/changed lines (cache `APP_MAKER/media/public/vo/cft/_takes.json`), voice per speaker from `VOICES` (blends like `"bm_george*0.55+am_onyx*0.45"`, speed, pitch factor), trims silence, pads, levels to -18 dB with soft clipping, encodes MP3 mono 24 kHz 48 kbps into `APP_MAKER/media/public/vo/cft/<file>.mp3`, writes `theme/assets/cft-vo.js` (LF, via `write_bytes`) and deletes local MP3s no longer used. Flags: `--list` (print, render nothing), `--only max,rosa`, `--force`. Bump `PROC` to re-render everything after changing processing.
3. **Upload:** `python -I ../APP_MAKER/media/r2_deploy.py --only=vo/cft/` (from the project root; uploads changed files to R2 and deploys the media Worker).
4. **`python tools/assets.py`** (new `?v=` hash for cft-vo.js in anvil.yaml), `python tools/check.py`, commit, push.

Because file names change whenever text or voice changes, the year-long Worker cache never serves an old take. **Any change to a mission line's text, its speaker prefix, or the intro place wording changes its key: re-run the pipeline or that line plays silently** (the scene still works, timed by text length).

## 7. Tunables / data read from CFT_DATA

Data: `D.CAST` (names for speaker matching), `D.CHAPTERS` (`id`, `n`, `e`, `blurb`), `D.KINDS` (intro place words), `D.MISSIONS` (via cft-game; `intro`, `outro`, `steps[].say`, `ch`, `title`). No `D.TUNE` values. Hard-coded timings in `Cn.play`: 28 m speaker range, title card 1.9 s, stamp 1.7 s, 58 ms per character without audio (min 2.2 s), line tail 0.25 s / 380 ms, safety `dur + 4` s, duck level 0.32; shot geometry numbers live in `makeShot`; subtitle colours in `COLS`; voices in `tools/voice_missions.py` `VOICES`.

## 7b. The announcer (2026-11-24)

`C.SHOUT` (pure, also read by tools/vo_lines.mjs): `ev` (id -> [line, priority]), `praise` (16 cheers), `achRaw(name)`,
`missionRaw(title)`, `match(title, kind, D)` -> `{id, raw, pri}` or null, `lines(D)` = every line to voice. In `attach`:
`U.banner` is wrapped (`shoutBanner`; `Cn.destroy` puts the original back), `Cn.shout(title, kind)` queues an event plus a
cheer, `nextShout` plays the two clips through its own `VoiceQueue` (`shoutVq`), waiting while `Cn.playing`, at most 2
queued (highest priority first), none older than 12 s, music ducked to 0.45. `Cn.shoutLog` (last 30) is written even when
voices are muted (tests). Off: `settings.announcer === false`. Speaker id `announcer` = af_bella in voice_missions.py.

## 8. How to test

- `python -I tools/live/game_test.py --cine [OUTDIR]`: cinetest.js checks every line has a clip, paired voices, speakers/narrator, the old box without `CFT_TEST.cine`, a full intro scene (HUD hidden, bars, chapter + title cards, camera, word-by-word subtitles, mouth, next, Esc), accept + cheer, outro stamp, phone call, settings.
- `python -I tools/live/game_test.py --cineshots DIR` (pictures c1-c8: chapter card, title card, close-up, over the shoulder, third shot, phone call, outro line, MISSION COMPLETE). Phone layout: set `WINDOW=390,844` in the environment. Read the PNGs.
- Pipeline dry run: `node tools/vo_lines.mjs > NUL` must exit 0; `python tools/voice_missions.py --list` shows every line and the capitalised words seen.
- Manual: open the game, take a mission from a giver with a yellow `!`; toggle "Voiced missions" and "Cinematic mission scenes" in phone Settings.

## 9. How to modify safely

**Add or change a voiced mission line**
1. Edit the mission in `cft-content.js` (`intro`, `outro`, or a step's `say`). Use `"Name: text"` with a `D.CAST` name to set the speaker; a step `say` without a name is the narrator.
2. `node tools/live/content_check.mjs`.
3. `python tools/voice_missions.py` (renders only what changed), then `python -I ../APP_MAKER/media/r2_deploy.py --only=vo/cft/`, then `python tools/assets.py`.
4. `python -I tools/live/game_test.py --cine` (the "every line has a clip" check fails if step 3 was skipped).

**Add a new speaker voice:** add the cast id to `VOICES` in `tools/voice_missions.py` (otherwise `DEFAULT` `af_heart`), re-run with `--only <id>`; add a subtitle colour to `COLS` in cft-cine.js.

**Add a shot kind:** add a branch in `makeShot` returning `{a, b, la, lb, fa, fb}`, keep the `fit`/`groundY` pass, then use it in the `kinds` lists (~332). Check phone aspect and walls in `--cineshots`.

**Change scene timing:** the waits in `Cn.play` (`wait(1900)`, `wait(1700)`, `dur` formula). Keep `hold()` support so screenshots stay deterministic.

Pitfalls:
- `C.speaker` / `C.key` must stay pure and identical for node and browser: they decide clip keys at build time. Changing them invalidates every key (re-render everything with `--force`).
- `speakerOf` in cft-ui and `C.speaker` must agree on names, or the portrait and the voice diverge.
- Escape subtitle text with `esc` (already done per word); the card HTML escapes chapter/mission names.
- Keep the `cft-cine-wrap` exception in cft-ui `onKey` (Esc is handled by the scene).
- Never leave `W.cine` set: all exits go through `finally`. Do not add early `return`s before the `try`.
- Tests rely on the fallback: other suites never set `CFT_TEST.cine`; do not make scenes play in tests by default.
- Respect `REDUCED` (prefers-reduced-motion): no shot drift, fixed side, no closing delay.
- Audio uses `HTMLAudioElement` (no Web Audio for clips), so no CORS requirement; autoplay may fail silently, then the scene falls back to text timing (`h.ok()` false).

## 10. Review checklist for AI-made diffs

- [ ] `cft-vo.js` not hand-edited (only regenerated by `voice_missions.py`, and committed together with the content change).
- [ ] Content line changes were re-voiced, uploaded and hashed (`assets.py`); `--cine` passes.
- [ ] Pure helpers unchanged, or the whole set was re-rendered.
- [ ] Every scene path cleans up in `finally` (`W.cine = null`, `U.cineMode(false)`, `ArkMusic.duck(1)`, listener removed, overlay closed).
- [ ] New key handlers check `U.isTop(ov)` and use capture phase with `stopPropagation`.
- [ ] Fallback to `U.dialog` still works when scenes are off.
- [ ] No new audio file formats or hosts; clip URL still built from `base()` + `CFT_VO.dir`.
- [ ] `prefers-reduced-motion` respected; CSS changes in the "voiced cinematic missions" block of app.css.
