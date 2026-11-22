# Shipping a change

The folder `C:\Users\arkvi\Documents\CLAUDE\cityfuntime-forms` **is** the Anvil app (Anvil's "git" layout) and a clone of
github.com/arkulinskis/cityfuntime. Anvil pulls the `master` branch; per README "Working on it", **`git push origin master`
is the deploy**. Live address: https://city-fun-time.anvil.app. There is no build step: `anvil.yaml`, `client_code/`,
`server_code/` and `theme/` are what Anvil runs. Related: [testing.md](testing.md), [server.md](server.md),
[anvil-client.md](anvil-client.md).

## 1. The release path, step by step

1. **Start from the latest master:** `git pull --ff-only`. The owner sometimes edits in the Anvil IDE, which commits
   "Edited ..." to master; read those commits before you change the same files.
2. **Make the change.** Engine in `theme/assets/cft-*.js`, pages in `client_code/`, server in `server_code/`.
3. **Asset hashes:** after editing *anything* in `theme/assets/`, run `python tools/assets.py` (no `-I`; needs PyYAML).
   `anvil.yaml` → `native_deps.head_html` loads every theme file as `_/theme/<file>?v=<hash>` (scripts, CSS, icons) and lists
   every engine file as a `<meta name="cft-asset" content="_/theme/<file>?v=<hash>">` tag that `cft-kit.js` (`assetUrl`) reads
   when it loads the engine. A stale hash means players keep the old cached file. `tools/check.py` runs `assets.py` too and
   tells you when it rewrote `anvil.yaml`: commit that file.
   - A brand-new engine file must be added in three places: a `cft-asset` meta in `head_html`, the `ALL` (or `DATA`) list in
     `cft-kit.js`, and `ENGINE` in `tools/live/harness.py`; then run `assets.py`.
   - Edits to `head_html` made in the Anvil IDE (Native Libraries) are kept; `assets.py` only replaces the `?v=` values.
4. **Tests:** the narrowest ones from the table in [testing.md](testing.md) section 9, then
   `python tools/check.py` → **ALL CHECKS PASSED**. Page changes: `python -I tools/ui_test.py` → **ALL UI TESTS PASSED**.
   Game changes: `node tools/live/content_check.mjs` and the matching `python -I tools/live/game_test.py --<flag>`.
5. **Docs** (the repo's own rule, CLAUDE.md and the SKILL "Workflow for any change"):
   - README.md (features) and `.claude/skills/cityfuntime/SKILL.md` when behaviour or architecture changed;
     `FIX_INDEX.md` when a feature moved; these `docs/dev` pages when a documented name changed
     (`python -I tools/doc_check.py`, also run by check.py).
   - Code map: `python -I C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/standard/app_map.py cityfuntime` regenerates `APP_MAP.md`.
   - Libraries block in README (only if a library or outside service changed):
     `python -I C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/tools/libraries.py --app cityfuntime`.
6. **Commit only your own files**, as the repo owner's identity (arkulinskis, noreply email, as in `git log`), message
   ending with the `Co-Authored-By:` trailer the session gives you. Never commit someone else's uncommitted work.
7. **Push:** `git push origin master`. If master is blocked (protected, rejected), push a branch instead and say so; do not
   force-push.
8. **After the push**, tell the owner about anything Anvil needs by hand (section 3).
9. **Code graph refresh** (local only, git-excluded `graphify-out/`):
   `C:/Users/arkvi/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/tools/graphify_apps.py cityfuntime`
10. **Play-test log:** for fixes that came from `PLAYTEST.md`, move the note from "Open" to "Done" in the format
    `- [x] 12. (area) "note" → what changed (commit abc1234)`. The hash is known only after committing, so the log line is
    usually its own small follow-up commit (history has "PLAYTEST: log commit hash").

## 2. What a push changes live

| Changed | Live effect | Extra step |
|---|---|---|
| `client_code/**` | Next page load gets the new Forms. | none |
| `theme/assets/**` | Served at _/theme/...; browsers fetch the new copy only if the `?v=` hash changed. | `python tools/assets.py` before committing |
| `server_code/**` | New server code on the next call. Open tabs keep working; a publish can drop their server session, which `client_code/session_guard.py` turns into a quiet reload. | none |
| `anvil.yaml` `db_schema` | **Not applied automatically.** Anvil shows a Schema Mismatch alert in the editor. | Owner accepts it (section 3) |
| `anvil.yaml` services, `head_html`, metadata | Next load. | Check the Users service settings in the editor if you touched them |
| New App Secret needed | Code that reads it fails or falls back until it exists. | Owner creates it (section 3) |

The repo cannot show how the published environment is configured in the Anvil editor (which branch or version it serves);
the README's setup step 5 is "Publish" once. If a pushed change doesn't appear live, check that in the editor rather than
guessing.

## 3. Things only the owner can do in Anvil

- **Schema Mismatch:** after a push that adds or changes tables/columns in `db_schema`, open the app in the Anvil editor and
  choose **"The schema of the source code is correct"**. Until then live code that uses the new columns fails (the server
  tests and the local App Server, which runs with `--auto-migrate`, won't catch this). Say it explicitly in the hand-over.
- **App Secrets:** the code reads one secret, **`admin_emails`** (comma-separated emails that become admins after a proven
  sign-in; `server_code/AdminAccess.py`). Create it once under App Secrets. Never put the address in code.
- **First setup** (README "Setting it up in Anvil (once)"): Clone from GitHub, check the Users service (email + password and
  Continue with Google, sign-up allowed), accept the schema, run and sign up with the admin email, Publish.
- **Admin data jobs:** demo data (Admin > Demo data), the map backup of starter cities (Admin > Map backup), balance values
  (Admin > Balance: published overrides are data in `app_settings`, so they need **no deploy**).

## 4. Files maintained elsewhere (don't hand-edit here)

| File(s) | Source of truth | How to update |
|---|---|---|
| `client_code/legal.py`, `server_code/legal_server.py`, `theme/assets/legal-kit.js` | C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/legal-kit (apps/cityfuntime.json there) | `python -I build.py cityfuntime && python -I install.py cityfuntime` in the legal kit, then `python tools/assets.py` here, commit, push |
| `server_code/seo_routes.py`, the `seo:start` … `seo:end` block in `head_html` | C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/seo/apps/cityfuntime.json | run `C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/seo/seo.py` there |
| `server_code/AppStatus.py`, `server_code/AdminAccess.py`, `server_code/SchemaCheck.py`, `client_code/session_guard.py` | the shared app template (APP_MAKER/template-forms) | change the template and roll out; keep this copy identical |
| `theme/assets/ark-music.js` | C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/tools/music_sync.py | re-run that tool |
| `theme/assets/cft-vo.js` and the voice MP3s | `tools/voice_missions.py` (Kokoro) | render, upload with `C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/media/r2_deploy.py`, `python tools/assets.py`, commit, push |
| README "Libraries and outside services" block | APP_MAKER/libraries/catalog.py | `libraries.py --app cityfuntime` (see step 5) |
| `APP_MAP.md` | generated | `app_map.py cityfuntime` (see step 5) |

`.anvil_editor.yaml` holds the Anvil editor's ids for forms and modules; Anvil maintains it. Several modules
(for example `Balance.py`, `AppStatus.py`, `KeepAlive.py`) have no entry and work fine, so don't hand-edit or "complete" it.

## 5. Gotchas

- `tools/check.py`, `tools/assets.py`, `tools/testing/test_server.py` and `tools/voice_missions.py` run with plain `python`
  (they need PyYAML or GPU packages from user site-packages); the other tools use `python -I`.
- Line endings are LF. On this PC Python's `Path.write_text` writes CRLF: patch scripts should write bytes or pass
  `newline="\n"` (as `tools/assets.py` does).
- Never mention the real coffee chain name: it is always "Tom Hearton's"; real shops from the map are never mocked (SKILL
  "Gotchas"). Reviewers should reject content diffs that break this.
- `put_save` accepts at most 400,000 characters of JSON; a change that grows the save a lot must stay under `MAX_SAVE` in
  `server_code/Game.py`.
- The server's net worth and level maths (`BIZ_COST`, `APT_VALUE`, `level_of` in `Game.py`) duplicate numbers from
  `cft-content.js`; a price or level-curve change in the content needs the same change there, or the leaderboard drifts.

## 6. Review checklist for AI-made diffs (deploy)

- [ ] The branch was up to date with origin/master (`git pull --ff-only`) and IDE "Edited ..." commits were not overwritten.
- [ ] Every edited file under `theme/assets/` has a matching new `?v=` hash in `anvil.yaml` (run `python tools/assets.py`;
      `git diff anvil.yaml` shows only hash changes unless head_html was meant to change).
- [ ] A new engine file appears in `head_html` (`cft-asset` meta), `ALL`/`DATA` in `cft-kit.js` and `ENGINE` in
      `tools/live/harness.py`.
- [ ] `python tools/check.py` printed ALL CHECKS PASSED on the exact tree being pushed; the relevant UI/game tests ran.
- [ ] Schema changes are listed in the hand-over with the "accept the Schema Mismatch" instruction; new App Secrets are named.
- [ ] No secrets, admin emails or personal data in the diff; kit-managed files untouched (or changed at their source).
- [ ] Commit contains only files from this change, authored as arkulinskis with the Co-Authored-By trailer; pushed to
      `master` (or a branch if master was blocked), never force-pushed.
- [ ] README / SKILL / FIX_INDEX / `docs/dev` updated where behaviour or names changed; `APP_MAP.md` regenerated; graphify
      refreshed; PLAYTEST.md notes moved to Done with the commit hash.
