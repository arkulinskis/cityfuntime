# cft-kit.js — `window.CFT`: the bridge between the Python Forms and the JavaScript engine

## At a glance

| | |
|---|---|
| File | `theme/assets/cft-kit.js` (~338 lines, ES5 style: `var`, `function`) |
| Global it exports | `window.CFT` (~L60) |
| How it is loaded | A plain `<script src="_/theme/cft-kit.js?v=...">` in `anvil.yaml` head_html, on every page (the rest of the engine is loaded on demand by this file) |
| Who calls it | `client_code/cft.py` (the only Python entry point: `setup`, `set_me`, `prepare`, `view`, `track`, `mount_game`, `mount_wiki`); `theme/assets/cft-world.js` (`CFT.tiles`); `theme/assets/cft-game.js` indirectly through `opts.onSave` etc.; `tools/live/harness.py` (fakes `CFT_HOST` and calls `CFT.mountGame` / `CFT.mountWiki`) |
| Needs | `window.CFT_HOST.call(fn, argsJson, quiet)` (set by `cft.setup()` in `client_code/startup.py`), `<meta name="cft-asset">` tags in head_html |
| Test flags | No dedicated game_test flag. Pages: `python -I tools/ui_test.py` (Docker). Game mount: any `python -I tools/live/game_test.py` run (the harness mounts through `CFT.mountGame`). Server side: `tools/testing/test_server.py` (`get_save` / `put_save` / `get_balance`) |

## Responsibilities

- **Load engine scripts on demand**, in order, once each (`script`, `chain`): `CFT.data()` (content + rules for pages), `CFT.load()` (the whole 3D game), `CFT.wiki()` (Admin > Balance).
- **Server calls** for the engine: `CFT.api(fn, args, quiet)` → `CFT_HOST.call` → `anvil.server.call` in Python → JSON text `{result}` or `{error}`.
- **Save persistence**: localStorage always (`cityfuntime.save.<user id|guest>`), the server for signed-in players (`get_save`, `put_save`, `reset_save`), choosing the newer copy on load, adopting a guest save after sign-in.
- **Photos** (album, localStorage, max 24).
- **Plain-JSON views** of the save for the Forms pages (`VIEWS.life`, `quests`, `mission`, `album`), so Python never walks engine objects.
- **Mounting** the 3D game (`CFT.mountGame`) and the balance wiki (`CFT.mountWiki`).

Not here: game rules and the save schema (cft-game.js), server-side validation (`server_code/Game.py`), the map tile backup storage (`server_code/Tiles.py`), page layout (`client_code/Pages/*`).

## Public API (`window.CFT`)

| Name | Signature | What it does | Called by |
|---|---|---|---|
| `me` | `{id, name, ...}` \| null | Signed-in user | set by `cft.set_me` (`client_code/state.py`) |
| `adopt` | save \| null | A guest save found after sign-in when the account has none; Life offers it, `mountGame` uses it | `loadSave`, `VIEWS.life`, `mountGame` |
| `save` | save \| null | The migrated save for the pages (not the live game's copy) | `prepare`, `track`, `viewJSON` |
| `api` | `(fn, args?, quiet?) -> Promise<result>` (~L64) | Server call through Python; rejects with `Error(r.error)`; rejects "Not ready yet" without `CFT_HOST` | `tiles`, `balance`, `loadSave`, `push`, `reset`, cft-wiki (`{api: CFT.api}`) |
| `tiles.archive` / `tiles.backup` | `(keys)` / `(key)` | `tile_archive` / `tile_backup` (quiet) | cft-world.js `queueArchive`, `fromBackup` |
| `data` | `() -> Promise` | Loads `DATA` = `cft-content.js`, `cft-game.js` | `prepare` |
| `balance` | `() -> Promise<{path: number}>` | `get_balance` values; any failure resolves `{}` | `mountGame` |
| `wiki` / `mountWiki` | `()` / `(root) -> {ready, destroy}` | Loads `cft-content.js`, `cft-game.js`, `cft-wiki.js`; `CFTWiki.mount(root, {api})` | `cft.mount_wiki` (Admin > Balance), harness `?wiki=1` |
| `load` | `() -> Promise` | Loads `ALL` (below) | `mountGame` |
| `key` | `() -> 'save.<id\|guest>'` | localStorage key suffix (prefix `cityfuntime.`) | internal |
| `local` | `(who?) -> save\|null` | This browser's save (for `who` or the current user) | `loadSave` |
| `loadSave` | `() -> Promise<save\|null>` (~L96) | Guest: local. Signed in: server copy, unless local is > 1 s newer (then pushes local); no server copy → pushes local; neither → sets `adopt` from the guest save; server error → local | `prepare`, `mountGame` |
| `persist` | `(save, reason)` (~L110) | Writes localStorage at once; server push when `reason` is `'exit'` or `'now'` or 20 s passed, else one debounced push 20 s after the last | game `opts.onSave` (from `doSave`), `track` |
| `push` | `(save, quiet?) -> Promise` | `put_save`; sets `lastSync`; logs failures unless quiet | `persist`, `loadSave`, `mountGame` |
| `reset` | `() -> Promise` | Clears local save; `reset_save` when signed in | game `opts.onReset` |
| `photos` / `addPhoto` | `()` / `(url, meta)` | Album photos in `cityfuntime.photos.<id\|guest>`, newest first, max 24 | `VIEWS.album`, game `opts.onPhoto` |
| `money` | `(n) -> '$1,234'` | Format | views |
| `prepare` | `() -> Promise<true>` (~L138) | `data()` + `loadSave()` → `CFT.save = CFTGame.migrate(s)` | `cft.prepare()` (Life, Quests, Album, Mission pages) |
| `track` | `(id) -> bool` | Sets `save.track`, `updated`, `persist(s, 'now')` | `cft.track` (Mission dialog) |
| `viewJSON` | `(name, arg) -> JSON text` | `JSON.stringify(VIEWS[name](CFT.save, arg))` | `cft.view` |
| `mountGame` | `(root, hooks{exit, reload}) -> {ready, destroy}` (~L154) | See lifecycle | `cft.mount_game` (`client_code/Components/Game`), harness |

Fields written at runtime: `CFT._last`, `CFT._t` (push debounce), `CFT.lastSync`. `window.CFT_GAME` = the `{G, destroy}` from `CFTGame.mount` while mounted.

## Internal structure

| Lines | Section | What |
|---|---|---|
| 1–11 | header | The contract in prose |
| 14–36 | loader | `loaded` cache, `assetUrl(name)` (finds `<meta name="cft-asset" content="_/theme/<name>?v=...">`, falls back to `_/theme/<name>`), `script(name)` (one `<script async=false>` per file, cached promise; a failed load is forgotten so it can retry), `chain(list)` (sequential) |
| 37–38 | file lists | `DATA`, `ALL` |
| 40–58 | helpers | `get`/`set` (localStorage with `cityfuntime.` prefix, JSON, errors swallowed), `esc`, `money`, `pct`, `initials`, `ago` |
| 60–189 | `window.CFT` | everything in the API table |
| 191–218 | view helpers | `mystery` (GTA-style "???" for locked missions more than one step away), `stepText`, `stepLabel`, `openCount`, `STATUS` |
| 220–337 | `VIEWS` | `life`, `quests`, `mission`, `album` |

## Key data

**`ALL` — the engine load order** (~L38; each waits for the previous):

```
three.min.js, cft-post.js, cft-gfx.js, three-gltf.js, cft-content.js, cft-tiles.js, cft-world.js, cft-ui.js,
cft-fun.js, cft-rpg.js, cft-hero.js, cft-chaos.js, cft-camp.js, cft-wild.js, cft-aim.js, cft-color.js,
cft-stunt.js, cft-vo.js, cft-cine.js, cft-debug.js, cft-game.js
```

`cft-game.js` must stay last of the game files it uses and after `cft-content.js` (it reads `window.CFT_DATA` at file load). `cft-post.js` / `cft-gfx.js` must load before `cft-world.js` (it checks `window.CFTPost` / `window.CFTGfx` at create time). `cft-wiki.js` is not in `ALL`. The same list is duplicated as `ENGINE` in `tools/live/harness.py`.

**`DATA`** = `['cft-content.js', 'cft-game.js']` (no three.js: pages only need the rules).

**localStorage keys** (prefix `cityfuntime.`): `save.<id|guest>`, `photos.<id|guest>`. Other engine keys (not written here): `cityfuntime.balance.draft` (wiki), `cityfuntime.debug`, `cityfuntime.tileurl`.

**`CFT_HOST.call` contract** (`client_code/cft.py` `_host_call`): `(fn, argsJson, quiet)` returns JSON text `{"result": r}` or `{"error": "..."}`; a server dict with `ok: False` becomes an error; `quiet` uses `anvil.server.call_s` (no spinner); an expired session becomes "Your session expired...". Server functions used by the engine: `get_save`, `put_save`, `reset_save`, `get_balance`, `tile_archive`, `tile_backup` (and the admin wiki's `admin_balance_*`).

**Views** return only plain JSON (strings, numbers, booleans, arrays):

| View | arg | Returns (main keys) |
|---|---|---|
| `life` | — | no save: `{welcome: true, adopt}`; else `{name, initials, sub, xp (% of level), money, worth, now (tracked step or free roaming), home, love (partner, kids, pets + street-life chips from save.fun / save.rpg), stats, friends, biz, turfs, turfsNote, stickers, stickersPct, missions, diary (16), saved}` |
| `quests` | filter `'all'\|'active'\|'open'\|'done'\|'locked'` | `{lead, started, counts, chapters: [{e, title, blurb, count, pct, missions: [{id, e, title, sub, status, label}]}]}` (mysteries as "???") |
| `mission` | mission id | `{id, e, title, who, status, reqs, quote, steps: [{text, state}], rewards, canTrack}` |
| `album` | — | `{lead, pct, sets: [{title, bonus, done, stickers}], photos}` |

## Lifecycle

```mermaid
sequenceDiagram
  participant Py as client_code/cft.py
  participant Kit as window.CFT
  participant Srv as server (Game.py, Balance.py)
  participant Game as CFTGame
  Py->>Kit: setup(): window.CFT_HOST.call = _host_call
  Py->>Kit: set_me(me): CFT.me, adopt = save = null
  Py->>Kit: mount_game(node, exit, reload) -> CFT.mountGame
  Kit->>Kit: load() = chain(ALL)
  Kit->>Srv: get_balance (quiet; failure -> {})
  Kit->>Srv: get_save (signed in) / localStorage
  Kit->>Game: CFTGame.mount(root, {save, me, balance, onSave, onPhoto, onExit, onReset})
  loop while playing
    Game->>Kit: onSave(save, reason) -> persist: localStorage now, put_save at most every 20 s
  end
  Note over Kit: document hidden -> game.G.saveNow('now') -> immediate push
  Py->>Kit: ctl.destroy() -> game.destroy() (saves with reason 'exit')
```

`mountGame` details: a load error replaces `root` content with a `<p class="cft-fail">` message; if there is no save but `CFT.adopt` is set, the guest save is used and pushed; `onReset` calls `CFT.reset()`, destroys the game and calls `hooks.reload()`; a `visibilitychange` listener saves when the tab is hidden and is removed in `destroy`.

## Tunables

None of its own. It fetches the published balance (`CFT.balance()` → `opts.balance`) that cft-game.js applies with `D.applyBalance`. Timing constants: server push interval 20,000 ms, local-newer threshold 1,000 ms, 24 photos.

## How to test

```
python -I tools/live/game_test.py OUTDIR    # the harness mounts through CFT.mountGame with a fake CFT_HOST
python -I tools/live/harness.py             # http://localhost:8772/ (?fresh=1 clears the guest save; ?wiki=1 mounts the wiki)
python -I tools/ui_test.py                  # real Anvil App Server: pages call cft.prepare / cft.view
python tools/check.py                       # node --check, assets, server tests (put_save validation)
```

The harness fake answers `tile_archive`, `tile_backup`, `get_balance`, `admin_balance_get`, `admin_balance_save` and returns `{ok: true}` for everything else (so `put_save` "succeeds" without storing). For a view, in a browser console after `CFT.prepare()`: `JSON.parse(CFT.viewJSON('life'))`.

## How to modify safely

- **Add an engine file**: add it to `ALL` in the right position, to `ENGINE` in `tools/live/harness.py`, and a `<meta name="cft-asset" content="_/theme/<file>?v=0">` line in `anvil.yaml` head_html; then `python tools/assets.py` (it only refreshes `?v=` hashes on existing entries, it does not add lines).
- **Add a field to a page**: add it in the matching `VIEWS` function (plain JSON only), then show it in `client_code/Pages/<Name>/`. Views receive the save as stored, after `migrate`; guard optional module sub-objects (`s.fun || {}`, `s.rpg || {}`).
- **New step type**: update `stepLabel` (Quests / Mission pages) and `stepText` (Life "now" card) for its text tokens.
- **New server call from JS**: add an `@anvil.server.callable` in server_code and call it with `CFT.api(name, [args], quiet)`; return dicts (an `{ok: False, error}` result is turned into a rejected promise).
- Pitfalls: `CFT.save` (pages) and the live game's `G.save` are different objects; the game writes localStorage on every save, so pages call `prepare()` again to see fresh data. `CFT.prepare()` does **not** apply the published balance, so page-side `levelOf` uses file defaults for `D.TUNE.player` unless the game already ran in this page session (`D` is shared and mutated in place). Keep this file ES5-compatible in style (it runs on every page). After editing: `python tools/assets.py`.

## Review checklist for AI-made diffs

- [ ] `ALL` order still satisfies dependencies (content before game, post/gfx before world, game last) and matches `harness.py` `ENGINE` and the head_html metas.
- [ ] Views return only JSON-safe data and tolerate missing sub-objects and a `null` save.
- [ ] No new direct `anvil`/`fetch` call: server access goes through `CFT.api`.
- [ ] Save conflict logic (`loadSave`) still prefers the newer copy and never drops a guest save silently.
- [ ] `persist` still writes localStorage synchronously on every call; server pushes stay throttled (rate limit on `put_save`: 240 per hour).
- [ ] Listeners added in `mountGame` are removed in `destroy`.
- [ ] `python tools/assets.py` run; `python tools/check.py` passes; `ui_test.py` for page changes.
