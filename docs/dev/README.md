# City Fun Time — developer documentation

City Fun Time is a 3D life-sim on real city streets: an Anvil app (Python Forms + server) wrapped around a plain-JavaScript
three.js engine. These pages explain what happens, where the code is, how to test it and how to change it safely. They
are also the reference for checking AI-written changes.

Written 2026-11-22 from the code at commit `3626c5f`, with the graphify code graph (`graphify-out/`).

## Reading order

1. [architecture.md](architecture.md) — the big picture: boot, load order, the objects `D`/`G`/`W`/`U`, how modules talk,
   units, saves.
2. The page for the area you're working on (table below).
3. [testing.md](testing.md) — every test and which one to run.
4. [changing-code.md](changing-code.md) — the change loop, engine rules, the **AI review checklist** and known issues.
5. [deploy.md](deploy.md) — shipping.

## All pages

**Cross-cutting**

| Page | What it covers |
|---|---|
| [architecture.md](architecture.md) | how everything fits together |
| [systems-combat.md](systems-combat.md) | one fight end to end, every formula and knob |
| [systems-progression.md](systems-progression.md) | missions → levels → tiers → loot/talents → outposts/colour → stickers |
| [balance.md](balance.md) | `D.TUNE`, Admin > Balance, server overrides, live testing |
| [styles.md](styles.md) | app.css / theme.css / icons.css map, prefixes, z-index ladder |
| [anvil-client.md](anvil-client.md) | startup, router, state, pages, components, the `cft.py` ↔ engine bridge |
| [server.md](server.md) | every server function, endpoint, table, secret |
| [testing.md](testing.md) | check.py, server tests, UI tests, live game tests (every flag), content check |
| [deploy.md](deploy.md) | release steps, Anvil-side steps, gotchas |
| [changing-code.md](changing-code.md) | workflow, rules, AI review checklist, known issues |

**Engine modules** (`theme/assets/`): each page has the same 10 sections — at a glance, responsibilities, public API,
internal structure, state, flow, tunables, how to test, how to modify, review checklist.

| Core | Features | UI and tools |
|---|---|---|
| [cft-kit](modules/cft-kit.md) — loader, saves, page views | [cft-fun](modules/cft-fun.md) — street life + combat | [cft-ui](modules/cft-ui.md) — HUD, phone, dialogs |
| [cft-game](modules/cft-game.md) — rules `G`, loop, save schema | [cft-rpg](modules/cft-rpg.md) — loot, talents, reputation | [cft-cine](modules/cft-cine.md) — cinematics + voice pipeline |
| [cft-world](modules/cft-world.md) — 3D city `W` | [cft-hero](modules/cft-hero.md) — hype, swagger, outposts | [cft-wiki](modules/cft-wiki.md) — Admin > Balance |
| [cft-content](modules/cft-content.md) — data dictionary | [cft-chaos](modules/cft-chaos.md) — toys, mayhem, flying | [cft-debug](modules/cft-debug.md) — `?debug=1` panel |
| [cft-tiles](modules/cft-tiles.md) — map tile decoder | [cft-camp](modules/cft-camp.md) — campaign | [cft-addr](modules/cft-addr.md) — start screen address check |
| [cft-gfx](modules/cft-gfx.md) — materials | [cft-wild](modules/cft-wild.md) — stamina, climbing | |
| [cft-post](modules/cft-post.md) — post-processing | [cft-aim](modules/cft-aim.md) — shooter, web tether | |
| | [cft-color](modules/cft-color.md) — colour blocks | |
| | [cft-stunt](modules/cft-stunt.md) — car stunts | |

## Other docs in this repo

- `APP_MAP.md` — generated code map (pages, server functions, tables, function index with line numbers).
- `FIX_INDEX.md` + `python -I tools/where.py` — the fast "where is X" index for small fixes.
- `PLAYTEST.md` — play-test notes inbox and log.
- `.claude/skills/cityfuntime/SKILL.md` — the AI working guide and history of every update (some older numbers are out
  of date; these pages follow the code).
- [../colour-blocks.md](../colour-blocks.md), [../open-air-report.md](../open-air-report.md) — feature design notes.
- `graphify-out/` — code graph (`graphify query/explain/path`, `GRAPH_REPORT.md`, `graph.html`); local only, not in git.

## Keeping these docs true

- `python -I tools/doc_check.py` checks that every backticked name, file and path in `docs/dev` exists in the code.
  `tools/check.py` runs it, so a change that removes or renames something the docs name fails until the docs are fixed.
  `--lines` also reports line hints that drifted more than 80 lines (advisory).
- Cite code by **function name** with an approximate line (`updatePlayer` (~L3100)); names don't drift, lines do.
- A line that names something on purpose that doesn't exist (an old file, a placeholder) ends with
  `<!-- doc-check: skip -->`.
- Change a module → update its page in the same commit.
