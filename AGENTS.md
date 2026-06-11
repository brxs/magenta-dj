# Engineering Standards

> Always-on engineering baseline from
> [`ai-kit`](https://github.com/berlitz-global/ai-kit).
> Kept deliberately short - the depth lives in load-on-demand skills, the
> `berlitz-engineering:code-reviewer` subagent, and the `/berlitz-engineering:pre-pr-check` gate.
>
> This file is the canonical agent-instructions file for any AI coding tool
> (Claude Code, Codex, Cursor, etc.). `CLAUDE.md` imports it via `@AGENTS.md`
> so Claude Code picks it up automatically.

## Definition of Done

A change is **done** only when every item holds. Treat these as the acceptance
criteria for every task; if you cannot verify one, say so explicitly rather
than reporting the change as complete.

- [ ] **Behaviour verified by running it** - not by inspection alone.
- [ ] **Tests cover it and the full suite is green.** New behaviour has tests;
      a bug fix has a test that fails without the fix.
- [ ] **Format, lint, type-check, and build pass** with no new warnings.
- [ ] **The diff is self-reviewed** - focused, minimal, nothing unrelated.
- [ ] **Docs and ADRs are updated** when behaviour or a significant decision
      changed.
- [ ] **No secrets committed; no obvious security or data-loss risk.**

Run **`/berlitz-engineering:pre-pr-check`** to verify this list before opening a pull request.

## Project conventions

<!-- Fill in only what the agent cannot infer from the code itself. Keep each
     line concrete and verifiable - "run `npm test`", not "test your work". -->

- Build / run / test: use the root `justfile` — `just setup`, `just run`,
  `just test`, `just lint`, `just check` (lint + tests; what a PR must pass).
  Underlying tools: uv + pytest + ruff in `backend/`, npm + vitest + eslint
  in `frontend/`
- Branch & PR naming: one branch per roadmap milestone or issue, kebab-case
  (e.g. `m1-one-deck-audible`)
- Gotchas: model weights live outside the repo in
  `~/Documents/Magenta/magenta-rt-v2` (override with `MAGENTA_HOME`); first
  run needs `uv run mrt models init` + `uv run mrt models download mrt2_small`.
  Only `backend/magenta_dj/engine.py` may import `magenta_rt` (ADR-0002);
  measured API facts are in `docs/spike-mrt2.md`. More in
  [Codebase gotchas](#codebase-gotchas) below.

## Working with your agent here

The end-to-end process - idea → issue → plan → build → verify → PR - is written
up in [`docs/WORKFLOW.md`](docs/WORKFLOW.md). Start there if you're new.

- **`/berlitz-engineering:pre-pr-check`** - format → lint → build → test, then a standards review (add `--loop` to fix findings with you, re-review, and open the PR).
- **`write-adr`** skill - record a significant architectural decision (scaffolds the next numbered ADR).
- **`engineering-standards`** skill - the full team playbook (engineering
  principles, the testing deep-dive, reviews, architecture, quality); loads on
  demand.
- **`berlitz-engineering:code-reviewer`** subagent - reviews a diff against these standards.
- **`berlitz-engineering:architecture-reviewer`** subagent - reviews a plan before you build.

<!-- Project-specific guidance goes below this line: architecture overview,
     conventions unique to this codebase, anything a new contributor needs.
     The standards above are maintained centrally in ai-kit -
     re-run /berlitz-engineering:setup to pull updates. -->

## Architecture overview

- The browser app (`frontend/`, React + Vite) does **all audio mixing** in Web
  Audio (ADR-0003): per-deck worklet player → EQ → Color FX insert → cue tap →
  fader/crossfade. The backend (`backend/magenta_dj/`, FastAPI) runs one
  Magenta RT model worker per deck and streams PCM over WebSocket (ADR-0002).
- `frontend/src/` map: `audio/` (engine graph, FX curves in `fx.ts`, FX node
  graphs in `fxGraphs.ts`), `control/` (Web MIDI link, FLX4 byte translator,
  `ControlIntent` bus), `deck/`, `mixer/`, `ui/` primitives. Worklet modules
  live in `frontend/public/` and are plain JS.
- Hardware control is Web MIDI in the frontend (ADR-0005). The DDJ-FLX4 byte
  map — including the position-query SysEx and the PAD FX banks — is
  *measured*, not assumed; it lives in `docs/midi-ddj-flx4.md`. Keep it
  current when adding mappings.
- Headphone cue has two routes: a second browser audio sink (ADR-0006) and the
  FLX4's own phones jack via the backend cue sink over `/ws/cue` (ADR-0007).
  Color FX are pure amount→parameter curves at a pre-fader insert with a
  bit-exact bypass (ADR-0008).
- Changes that touch hardware behaviour cannot be fully verified by tests:
  add/extend a checklist in `docs/` (`m7-`, `m9-m10-`,
  `m12-hardware-checklist.md`) and have a human tick it before calling the
  work done.

## Codebase gotchas

- The frontend has **no formatter** on purpose. House style: single quotes, no
  semicolons — except `frontend/public/*.js` (worklet modules), which use
  semicolons. Match the file you're in.
- `npx tsc --noEmit` at the frontend root checks **nothing** (solution-style
  tsconfig), and `tsc -b` can pass on stale buildinfo. To type-check for real:
  `npx tsc -p tsconfig.app.json --noEmit` from `frontend/`.
- Playwright's Chromium (headed *and* headless) crashes its renderer when a
  script sends MIDI **output** while the FLX4 is attached — keep verify
  scripts input-only. Headless Chromium also hides real audio/MIDI devices;
  use headed runs for device spikes. `grantPermissions` origins must have no
  trailing slash, and plain `requestMIDIAccess` needs both `midi` and
  `midi-sysex` grants.
- npm commands must run from `frontend/`, not the repo root.