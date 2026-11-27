# The server (server_code/)

Python server modules running on Anvil (`anvil.yaml` → `runtime_options.server_spec.base: python314`). The browser reaches
them in two ways: Forms call `anvil.server.call` / `state.call`, and the JS engine calls `CFT.api`, which goes through
`cft._host_call` (see [anvil-client.md](anvil-client.md), section 6a). A few modules also serve plain HTTP.

Totals: **32 callables** (the count `tools/testing/test_server.py` prints as "ALL OK (32 server functions)"),
2 `@anvil.server.http_endpoint`s, 6 fixed `@anvil.server.route`s plus one route per search-engine verification file.

## 1. Conventions (`common.py`, imported as `C`)

- Check the caller first: `C.me()` (may be None), `C.require_user()` (raises `PermissionDenied("Please sign in first.")`),
  `C.require_admin()` (raises `PermissionDenied("Only admins can do that.")`), `C.is_admin(user)` = the `is_admin` column.
- Callables that change or read private data are declared `@anvil.server.callable(require_user=True)` **and** call
  `C.require_user()` / `C.require_admin()` inside. The server test fails if a callable without `require_user` is not in its
  `PUBLIC` set.
- Replies are JSON-friendly only (dicts, lists, str, numbers, bools, None); datetimes via `C.iso(v)` (UTC ISO strings).
- Expected problems return `C.fail("message")` = `{"ok": False, "error": "message"}`; successes often `C.ok(**data)`
  = `{..., "ok": True}`. The client shows `error` as a toast (`state.call`) or rejects the JS promise (`_host_call`).
- `C.text(value, limit, multiline)` cleans user text (str, trimmed, whitespace collapsed unless multiline, capped).
- `C.row_by_id(table, id)` returns None for a missing or malformed id (ids come from the browser).
- `C.rate_limited(key, limit, seconds)`: per **browser session** (`anvil.server.session["rate_<key>"]`), True when over the limit.
- `C.get_setting(key, default)` / `C.set_setting(key, value)`: the key/value table `app_settings`.
- `C.name_of(user)`: `display_name`, else the email's local part capitalised.

## 2. Every callable

"Public" = no sign-in needed. Rate limits are per browser session.

### Accounts.py
| Function | Args | Returns | Access | Tables |
|---|---|---|---|---|
| `get_me` | none | `me_dict(user)` = `{id, email, name, is_admin, joined}` or None | public | `users` (sets `is_admin` when `AdminAccess.may_promote`; stamps `last_seen` at most once an hour) |
| `update_profile` | `name` | `C.ok(me=...)`; fail if name < 2 chars (capped at 60) | user | `users.display_name` |

### Admin.py (admins only; every function calls `C.require_admin()`)
| Function | Args | Returns | Tables |
|---|---|---|---|
| `admin_overview` | none | `{users, admins, feedback_new, players, demo{state, counts}}` (users exclude demo) | reads `users`, `feedback`, `saves`, `app_settings` |
| `list_users` | `query=None` | `{users[<=200], total}`, newest first, demo users excluded, query matches email or name | reads `users` |
| `set_admin` | `user_id, flag` | `C.ok(user=...)`; fail if missing or removing your own admin | writes `users.is_admin` |
| `set_enabled` | `user_id, flag` | `C.ok(user=...)`; fail if missing or yourself | writes `users.enabled` |
| `demo_load` | none | `C.ok(demo=...)` | see DemoData |
| `demo_remove` | none | `C.ok(demo=...)` | see DemoData |

### Game.py (saves and leaderboard)
| Function | Args | Returns | Access / limits | Tables |
|---|---|---|---|---|
| `get_save` | none | `{save: data or None, updated?}` | user | reads `saves` |
| `put_save` | `data` (the whole save dict) | `C.ok(level, worth)`; fail when rate-limited, not a dict, JSON over `MAX_SAVE` (400,000 chars), or missing `home`, `xp` or `money` | user; `rate_limited("put_save", 240, 3600)` | writes `saves` via `store()` |
| `reset_save` | none | `C.ok()` | user | deletes the caller's `saves` row |
| `leaderboard` | none | `{worth, level, turfs, missions: [top 15 entries + your own rank], players, missions_done, turfs_won}`; entries `{name, level, worth, missions, turfs, biz, kids, partner, day, me, demo, rank}` | public; calls `DemoData.ensure_loaded()` | reads `saves` (rows with `hidden` skipped); may write demo rows |
| `admin_players` | `query=None` | `{players[<=300], total}`, each entry plus `id, email, hidden, updated, created` | admin | reads `saves`, `users` |
| `admin_set_player` | `save_id, hidden=None, rename=None` | `C.ok()`; fail if missing | admin | writes `saves.hidden`, or `saves.name` + `data.name` = "Player" |

Helpers: `summarize(d)` computes the leaderboard columns from a save (missions done excluding ids starting "job-" or "rush-",
owned turfs, net worth = money + savings + business costs (`BIZ_COST`, `UPGRADE`) + home value (`APT_VALUE`)); `level_of(xp)`
uses the published balance values `TUNE.player.xpBase` / `TUNE.player.xpExp` (defaults 60 / 1.8) so it matches the game;
`_clean(data)` validates and trims `name` to 20 chars; `store(user, data, is_demo)` writes the row; `player_count()`.
`BIZ_COST` mirrors prices in `theme/assets/cft-content.js`: keep them in step when business prices change.

### Balance.py (Admin > Balance)
| Function | Args | Returns | Access | Tables |
|---|---|---|---|---|
| `get_balance` | none | `{values: {path: number}, updated}` | public (every game, guests too, reads it before starting) | reads `app_settings["balance"]` |
| `admin_balance_get` | none | `{values, updated, by, note, history[{i, updated, by, note, n}]}` | admin | reads `balance`, `balance_history` |
| `admin_balance_save` | `values, note=None` | `C.ok(values, updated)`; fail on bad input | admin | writes `balance`; pushes the old one onto `balance_history` (max `MAX_HISTORY` = 12) |
| `admin_balance_restore` | `index` | as `admin_balance_save`; fail if the version is gone | admin | same |

`clean(values)` accepts only dotted paths matching `PATH` (`^[A-Za-z_]\w*(\.\w+){1,5}$`, no `__`, `prototype`,
`constructor`) and finite numbers with abs ≤ 1e7, at most `MAX_VALUES` = 3000. `tune(path, default)` and `published()` are for
server code. The game applies the values with `D.applyBalance` (in `cft-content.js`); "try it" drafts stay in the admin's
browser and never reach the server.

### Tiles.py (map backup)
| Function | Args | Returns | Access / limits | Tables |
|---|---|---|---|---|
| `tile_archive` | `keys` (list; first `MAX_KEYS` = 8 unique kept) | `C.ok(have=[keys now kept], full)`; fail if not a list or rate-limited | public; `rate_limited("tile_archive", 150, 600)` | writes `tiles`, `app_settings["tiles_bytes"]` |
| `tile_backup` | `key` | `C.ok(found=False)` / `C.ok(found=True, missing=True)` / `C.ok(found=True, missing=False, data=<base64>)`; fail on unknown key | public; `rate_limited("tile_backup", 600, 600)` | reads `tiles` |
| `admin_tiles_status` | none | `C.ok(tiles, mb, cap_mb, cities[{i, name}])` | admin | reads `tiles`, `app_settings` |
| `admin_tiles_seed` | `city, offset` | `C.ok(city, total, next, done, added, full)`: copies the next 6 tiles of `STARTER[city]` within `SEED_RADIUS` (1200 m) | admin | writes `tiles` |
| `admin_tiles_cap` | `mb` (100 to 100,000) | `C.ok(cap_mb)` | admin | writes `app_settings["tiles_cap_mb"]` |

Keys: "v/14/x/y" (OpenFreeMap vector tiles, zoom 14 only) and "t/z/x/y" (Mapterhorn terrain WebP, zoom 8-15), validated by
`parse(key)` against `KEY`. **The server fetches tiles itself** (`fetch` → `anvil.http.request`); it never stores bytes a
browser sends. OpenFreeMap's tile URL comes from its TileJSON (`OFM_TILEJSON`), cached 6 hours (`_vector_url`). A 204/404
answer is stored as a row with `missing=True` (sea, or no hills tile at that zoom; `admin_tiles_seed` then also keeps the
zoom below). Copying stops when `tiles_bytes` ≥ `tiles_cap_mb` × 1e6 (`DEFAULT_CAP_MB` = 3000). `STARTER` = 20 cities; the Admin
page calls `admin_tiles_seed` in a loop, city by city, until `done`.

### Feedback.py (the old in-app inbox; new feedback goes to Prepsto)
| Function | Args | Returns | Access / limits | Tables |
|---|---|---|---|---|
| `submit_feedback` | `kind, message, email=None, context=None` | `C.ok()`; fail if message < 5 chars or rate-limited | public; `rate_limited("feedback", 5, 3600)` | writes `feedback` |
| `list_feedback` | `status=None` | `{items, counts{new, read, done}}` | admin | reads `feedback` |
| `set_feedback_status` | `feedback_id, status, note=None` | `C.ok(item=...)` | admin | writes `feedback.status`, `note` |
| `delete_feedback` | `feedback_id` | `C.ok()` | admin | deletes from `feedback` |

No client code calls `submit_feedback` today (the Prepsto panel replaced it); it stays for the template and the tests.

### legal_server.py (Privacy & Terms kit; edit the kit, not this copy)
| Function | Args | Returns | Access | Tables |
|---|---|---|---|---|
| `legal_state` | none | `{signedIn, version, accepted_version?, accepted_at?, email?}` | public | reads `users` |
| `legal_accept` | `version, source="page"` | `{ok, accepted_version, accepted_at}` or `{ok: False, error}` (signed out, or `version` ≠ `VERSION`) | public, but needs a signed-in user to do anything | writes `users.legal_version`, `legal_accepted_at`, `legal_source` |

`VERSION = "2026-10-31"`.

### KeepAlive.py
| Function | Args | Returns | Access | Tables |
|---|---|---|---|---|
| `session_ping` | none | `True` | public | none |

Called by `client_code/session_guard.py` (`check_now`): if the session is gone the call raises `SessionExpiredError` and the
page reloads quietly.

### AppStatus.py (shared admin status report)
| Function | Args | Returns | Access | Tables |
|---|---|---|---|---|
| `admin_status_report` | `error_limit=20` (0-200) | `build_report()`: `{app, users, database, errors, background_tasks, feedback}` | admin (`_require_admin`, which also promotes `admin_emails` users) | reads every table; `users`, `error_log`, `feedback` in detail |
| `log_client_error` | `kind, message, traceback, page` | True/False | public; capped at `PER_SESSION_LIMIT` (30) per session per hour, trimmed | writes `error_log` (prunes to `KEEP_ERRORS` = 1000 newest, on ~5% of calls) |

`log_server_error(where, exc)` is a plain function for server code that catches an error but still wants it reported (not
used by this app's modules yet). `signed_by_addanapp(headers)` verifies an RSA signature from Addanapp's App health page
(`SIGNING_KEY_N`, `SIGNING_KEY_E`, headers `X-Addanapp-Ts`, `X-Addanapp-Nonce`, `X-Addanapp-Sig`, max age `SIGNATURE_MAX_AGE`).

### AdminAccess.py (who becomes admin)
No callables. `ADMIN_EMAILS` reads the App Secret `admin_emails` at use time (comma/semicolon/space separated).
`may_promote(user)` = listed email **and** `verified(user)`: `confirmed_email` ticked, or no `password_hash` (Google account),
or the app runs on a local App Server (`get_app_origin()` starts with `http://localhost:` / `http://127.0.0.1:`; used by the
Docker UI tests). Used by `get_me` and AppStatus `_admin`.

### DemoData.py
No callables (reached through Admin and `leaderboard`). `ensure_loaded()` loads the demo the first time (setting
`app_settings["demo"]` is `"never"`); `load()` replaces demo rows with `DEMO_PLAYERS` (6 users with `is_demo=True`,
`enabled=False`, `@example.com` emails, no password) and their saves (`demo_save(...)` → `Game.store(..., is_demo=True)`);
`remove(remember=True)` deletes every `is_demo` row in `DEMO_TABLES` (`saves`) and `users` and records `"removed"` so it
never comes back by itself; `state()` → `"never" | "loaded" | "removed"`; `counts()`.

### SchemaCheck.py, seo_routes.py (HTTP only)
| Path | Function | What |
|---|---|---|
| **GET /_/api/schema-check?tables=a,b** | `schema_check` (http endpoint "/schema-check") | `{"tables": {name: [column names] or null}}` for up to 60 tables; names only, never data. Used by the App Board to spot an unaccepted Schema Mismatch. |
| **GET /_/api/admin/status?errors=N** | `admin_status_endpoint` (http endpoint "/admin/status") | The status report as JSON. Allowed: a valid Addanapp signature, a signed-in admin in the same browser, or HTTP Basic auth with an admin's email + password; else 401 / 403. `Cache-Control: no-store`. |
| **/robots.txt** | `seo_robots` | `@anvil.server.route` (only when the runtime has `route`). |
| **/sitemap.xml** | `seo_sitemap` | |
| **/llms.txt**, **/llms-full.txt**, **/about.md** | `seo_llms`, `seo_llms_full`, `seo_about_md` | Plain-text story for AI assistants. |
| **/about** | `seo_about` | Plain-HTML about page for crawlers that don't run JavaScript. |
| every key of `VERIFY` (Google, Bing, IndexNow files) | `seo_verify_<i>` | Search-console verification files. |

`seo_routes.py` is generated by the SEO kit from C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/seo/apps/cityfuntime.json
(`C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/seo/seo.py`): don't edit it here. `tools/check.py` reports type warnings in
`seo_routes.py` and `legal_server.py` without failing (`KIT_FILES`).

### Lifetime access (`Lifetime.py`, `lifetime_config.py`)

`Lifetime.py` is the same file in every app (from `APP_MAKER/template-forms`; do not edit it here). It sells one $34
payment through Stripe Checkout and is **off** until the App Secret `stripe_secret_key` is set: then `Lifetime.unlocked`
is True for everyone and nothing changes. Public: `lifetime_status`, `lifetime_confirm`, the webhook
`/_/api/lifetime/stripe`; signed in: `lifetime_checkout`; admin: `admin_lifetime`, `admin_lifetime_settings`,
`admin_lifetime_action`, `admin_lifetime_grant` (Admin -> Overview -> "Lifetime sales ($34)"). Nothing in the game is
gated yet (2026-11-27: there are no separate city packs or cosmetics). A future pack: client
`if not lifetime.gate("Pack name"): return`, server `if not Lifetime.unlocked(user): return C.fail(Lifetime.LOCKED_MESSAGE)`,
and a line in `lifetime_config.py` `PAID`. Setup: `C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/money/lifetime/STRIPE_SETUP.md`.

## 3. Data tables (`anvil.yaml` → `db_schema`)

All tables are `client: none, server: full`: the browser can never read tables directly; everything goes through callables.

| Table | Columns (type) | Written by | Read by |
|---|---|---|---|
| `users` | `email` (string), `enabled` (bool), `last_login` (datetime), `password_hash` (string), `n_password_failures` (number), `confirmed_email` (bool), `signed_up` (datetime), `display_name` (string), `is_admin` (bool), `is_demo` (bool), `last_seen` (datetime), `legal_version` (string), `legal_accepted_at` (datetime), `legal_source` (string) | Anvil Users service; `get_me` (`is_admin`, `last_seen`); `update_profile`; `set_admin`; `set_enabled`; DemoData `load` / `remove`; `legal_accept`; AppStatus `_admin` | Accounts, Admin, Game (`admin_players` email), AdminAccess, AppStatus, legal_server |
| `saves` | `user` (link → users), `data` (simpleObject: the whole save), `name` (string), `level`, `xp`, `worth`, `missions`, `turfs`, `biz`, `kids` (number), `partner` (bool), `day` (number), `hidden` (bool), `created`, `updated` (datetime), `is_demo` (bool) | `put_save` / `Game.store`, `reset_save`, `admin_set_player`, DemoData | `get_save`, `leaderboard`, `admin_players`, `player_count`, `admin_overview` |
| `tiles` | `key` (string), `kind` (string "v" or "t"), `data` (media), `size` (number), `missing` (bool), `created` (datetime) | `tile_archive`, `admin_tiles_seed` (via `_archive` / `_store`) | `tile_backup`, `admin_tiles_status`, `_archive` |
| `app_settings` | `key` (string), `value` (simpleObject) | `C.set_setting` | `C.get_setting` |
| `feedback` | `user` (link → users), `name`, `email`, `kind` (string), `message` (string), `context` (simpleObject), `status`, `note` (string), `created` (datetime) | `submit_feedback`, `set_feedback_status`, `delete_feedback` | `list_feedback`, `Feedback.new_count`, AppStatus `_feedback` |
| `error_log` | `when` (datetime), `source`, `kind`, `message`, `traceback`, `page`, `session` (string), `user` (link → users) | `log_client_error`, `log_server_error`, `_prune` | AppStatus `_errors` |
| `lifetime_purchases` | `user` (link → users), `email`, `status`, `amount`, `currency`, `session`, `payment_intent`, `note` (string/number), `created`, `updated` (datetime) | `Lifetime.py` (checkout return, webhook, admin actions) | `Lifetime.py` |

Keys used in `app_settings`: `lifetime` (Lifetime.py), `balance`, `balance_history` (Balance.py), `tiles_bytes`, `tiles_cap_mb` (Tiles.py), `demo`
(DemoData.py).

**Changing the schema:** edit `db_schema` in `anvil.yaml`. The server-test mock reads `anvil.yaml` itself (environment
variable `ANVIL_APP_YAML`, set by `tools/testing/test_server.py`), so tests follow automatically. The local App Server
applies it with `--auto-migrate`. On hosted Anvil the owner must accept the **Schema Mismatch** alert ("The schema of the
source code is correct") after the push; until then new columns are missing live (the legal kit's `_get` tolerates that,
other code does not). See [deploy.md](deploy.md).

## 4. App Secrets and services

- App Secrets `stripe_secret_key` and `stripe_webhook_secret` (Lifetime.py): optional; without the key the lifetime gate is off.
- App Secret used by code: **`admin_emails`** (AdminAccess.py; the admin's email is never in the repo). AppStatus reports
  whether it is set (`admin_emails_secret`). The Docker UI tests pass `--secret admin_emails=admin@example.com`; the server
  tests fake it in `anvil.secrets.SECRETS`.
- Services in `anvil.yaml`: Data Tables (**/runtime/services/tables.yml**, `enable_v2`), Users
  (**/runtime/services/anvil/users.yml**: email + Google, sign-up allowed, `confirm_email: false`, remember-me 30 days,
  secure passwords, user table `users`), Google (**/runtime/services/google.yml**), Secrets
  (**/runtime/services/anvil/secrets.yml**). There is no Email service; nothing here sends email except the Users service's own
  password-reset mail.
- Outside HTTP from the server: only Tiles.py (`tiles.openfreemap.org`, `tiles.mapterhorn.com`). No background tasks are
  defined (AppStatus still lists any that exist).

## 5. Adding a server function

1. Put it in the module that owns the data (or a new module); `@anvil.server.callable(require_user=True)` plus
   `C.require_user()` / `C.require_admin()` unless it is genuinely public (then add it to `PUBLIC` in
   `tools/testing/test_server.py` with a reason in review).
2. Validate every argument (`C.text`, `C.row_by_id`, type checks); check ownership of rows; rate-limit anything public that
   writes or does outside work.
3. Return JSON-friendly values; `C.fail(...)` for expected problems.
4. Add tests in `tools/testing/test_server.py`: happy path, bad input, a caller who isn't allowed (`denied(...)`).
5. Call it with `state.call("name", ...)` (Forms) or `CFT.api('name', [...], true)` (engine).

## 6. Review checklist for AI-made diffs (server_code, anvil.yaml schema)

- [ ] Every new callable has `require_user=True` and an explicit `C.require_user()` / `C.require_admin()`, or is listed in
      `PUBLIC` in `tools/testing/test_server.py` for a stated reason.
- [ ] Rows looked up from browser ids use `C.row_by_id` and are checked for ownership (`row["user"] == me`) or admin rights.
- [ ] No datetimes, rows or Media in replies (use `C.iso`, ids, base64); `test_server.py` `call()` enforces `json.dumps`.
- [ ] Expected problems return `C.fail(...)`, not exceptions; exceptions are for permission errors and bugs.
- [ ] Public writers are rate-limited (`C.rate_limited`); public reads expose no personal data (leaderboard: game names only).
- [ ] `put_save` limits unchanged unless intended (`MAX_SAVE`, required keys, 240 per hour); `summarize` stays in step with
      `cft-content.js` prices (`BIZ_COST`, `APT_VALUE`) and the level curve (`level_of` / `D.calc`).
- [ ] Balance overrides still pass through `Balance.clean` (no arbitrary paths, finite numbers only).
- [ ] Tiles: the server still fetches tiles itself; `parse` still rejects keys outside "v/14/..." and "t/8-15/...".
- [ ] Column names used in code exist in `anvil.yaml` `db_schema` (the mock fails on unknown columns); schema changes are
      called out so the owner accepts the Schema Mismatch alert.
- [ ] No secrets or admin emails in code; new secrets are named in this page and in [deploy.md](deploy.md).
- [ ] Kit files (`legal_server.py`, `seo_routes.py`, `AppStatus.py`, `AdminAccess.py`, `SchemaCheck.py`) are not hand-edited
      unless the change is also made in the shared template.
- [ ] `python tools/check.py` → ALL CHECKS PASSED (includes `test_server.py`); `python tools/testing/test_app_status.py`
      → ALL OK if AppStatus/AdminAccess changed (check.py does not run it).
