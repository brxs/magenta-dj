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

- Build / run / test: _add the exact commands for this project_
- Branch & PR naming: _add the convention_
- Gotchas / required env vars: _add anything non-obvious_

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
