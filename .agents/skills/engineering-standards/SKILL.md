---
name: engineering-standards
description: Use when planning or reviewing a non-trivial change, when writing or changing tests, or when asked about the team's engineering standards. The full playbook - engineering principles, the testing deep-dive, code review & PRs, architecture & ADRs, and quality & safety.
---

# Engineering standards

The full team playbook behind the short **Definition of Done** in `AGENTS.md`
(imported into `CLAUDE.md` via `@AGENTS.md`). `AGENTS.md` is kept lean on
purpose; this skill carries the depth and loads only when it is relevant - so
it costs no context until you need it.

## Definition of Done

The Definition of Done is the always-on checklist in `AGENTS.md` - that is the
single source of truth for when a change is complete. This skill is the depth
behind it. `/berlitz-engineering:pre-pr-check` walks that checklist automatically before a
pull request.

## Engineering principles

Rule 1 - Think Before Coding.
No silent assumptions. State what you're assuming. Surface tradeoffs. Ask before guessing. Push back when a simpler approach exists.

Rule 2 - Simplicity First.
Minimum code that solves the problem. No speculative features. No abstractions for single-use code. If a senior engineer would call it overcomplicated - simplify.

Rule 3 - Surgical Changes.
Touch only what you must. Don't "improve" adjacent code, comments, or formatting. Don't refactor what isn't broken. Match existing style.

Rule 4 - Goal-Driven Execution.
Define success criteria. Loop until verified. Don't tell Claude what steps to follow, tell it what success looks like and let it iterate.

Rule 5 - Use the model only for judgment calls
Use Claude for: classification, drafting, summarization, extraction from unstructured text.
Do NOT use Claude for: routing, retries, status-code handling, deterministic transforms.
If a status code already answers the question, plain code answers the question.

Rule 6 - Token budgets are not advisory
Per-task budget: 4,000 tokens.
Per-session budget: 30,000 tokens.
If a task is approaching budget, summarize and start fresh. Do not push through.
Surfacing the breach > silently overrunning.

Rule 7 - Surface conflicts, don't average them
If two existing patterns in the codebase contradict, don't blend them.
Pick one (the more recent / more tested), explain why, and flag the other for cleanup.
"Average" code that satisfies both rules is the worst code.

Rule 8 - Read before you write
Before adding code in a file, read the file's exports, the immediate caller, and any obvious shared utilities.
If you don't understand why existing code is structured the way it is, ask before adding to it.
"Looks orthogonal to me" is the most dangerous phrase in this codebase.

Rule 9 - Tests verify intent, not just behavior
Every test must encode WHY the behavior matters, not just WHAT it does.
A test like `expect(getUserName()).toBe('John')` is worthless if the function takes a hardcoded ID.
If you can't write a test that would fail when business logic changes, the function is wrong.

Rule 10 - Checkpoint after every significant step
After completing each step in a multi-step task: summarize what was done, what's verified, what's left.
Don't continue from a state you can't describe back to me.
If you lose track, stop and restate.

Rule 11 - Match the codebase's conventions, even if you disagree
If the codebase uses snake_case and you'd prefer camelCase: snake_case.
If the codebase uses class-based components and you'd prefer hooks: class-based.
Disagreement is a separate conversation. Inside the codebase, conformance > taste.
If you genuinely think the convention is harmful, surface it. Don't fork it silently.

Rule 12 - Fail loud
If you can't be sure something worked, say so explicitly.
"Migration completed" is wrong if 30 records were skipped silently.
"Tests pass" is wrong if you skipped any.
"Feature works" is wrong if you didn't verify the edge case I asked about.
Default to surfacing uncertainty, not hiding it.

## Testing

Apply this whenever you write, change, fix, or plan tests. The goal is a suite
that **catches real regressions, survives refactors, and reads as
documentation**.

### What to test

Write a test when behaviour is worth protecting:

- **New behaviour** - every new public function, endpoint, or component path.
- **Changed behaviour** - update the tests that pin it; don't leave them stale.
- **Bug fixes** - start with a test that **reproduces the bug and fails**, then
  fix the code until it passes. This proves the fix and prevents regression.
- **Edge cases and failure modes** - empty, zero, negative, boundary, maximum,
  null/undefined, malformed input, and the error paths. Most bugs hide here, so
  most tests belong here.

Don't chase coverage for its own sake: trivial getters, generated code, and
third-party libraries do not need tests. Coverage is a hint, not the target.

### Test behaviour, not implementation

Assert on **observable outcomes and contracts** - return values, emitted
events, persisted state, responses - not on private internals or call order.
A test that breaks when you refactor without changing behaviour is testing the
wrong thing. This is what lets the suite act as a safety net during refactors.

### Structure and naming

- **One scenario per test.** A test that asserts many unrelated things hides
  which one failed.
- Follow **Arrange–Act–Assert**: set up, perform the one action, assert the
  outcome. Keep the act step a single call.
- The **name states the scenario and expected outcome** - e.g.
  `returns 404 when the order does not exist`. A reader should understand the
  case without reading the body.
- Keep tests **flat and explicit**. Prefer a little duplication over a clever
  shared helper that obscures what each test actually exercises. Literal,
  obvious values beat computed ones.
- Match the project's existing test framework, layout, and conventions.

### Determinism and isolation

A test must give the same result every run, in any order, on any machine.

- **No shared mutable state** between tests; each sets up and tears down its
  own world.
- **No real wall-clock, randomness, network, or filesystem** unless that is
  precisely what is under test - inject a clock, seed the RNG, use a temp dir.
- **No reliance on test execution order.**
- A **flaky test is a bug.** Fix the root cause - never paper over it with
  retries, sleeps, or by disabling it. A disabled test is not a passing test.
- **Never weaken, skip, or delete a test to make a change pass.** If a test is
  wrong, fix it deliberately and say why.

### Test doubles

Use the lightest double that does the job, and use it sparingly:

- Prefer the **real thing** - real objects, in-memory implementations - when
  fast and deterministic.
- **Stub/fake** to supply inputs and replace slow or non-deterministic
  collaborators (clock, network, external services).
- **Mock** (assert on interactions) only when the interaction itself *is* the
  contract - e.g. that a payment was charged exactly once.
- Over-mocking couples tests to implementation and lets real integration bugs
  slip through. If a test is mostly mock setup, reconsider the boundary.

### Levels of testing

- **Unit** - fast, focused on one unit; the bulk of the suite.
- **Integration** - exercise real boundaries (database, queue, HTTP layer)
  where wiring and contracts are the risk.
- **End-to-end** - a few high-value user journeys; expensive, keep them lean.

Push coverage to the lowest level that can catch the bug. Reserve the slow,
broad tests for things only they can verify.

## Code review & pull requests

- **One concern per PR.** Keep diffs small and focused; split unrelated changes.
- **Refactor and behaviour change land separately** - never in the same commit.
- **Commit messages explain *why*,** not just what; imperative mood.
- **PR descriptions cover** what changed, why, how it was tested, and any risk
  or follow-up. Link the issue or ADR.
- **Self-review first.** Read your own diff before requesting review; the
  **`berlitz-engineering:code-reviewer`** subagent reviews it against these standards.
- **Keep changes surgical.** Touch only what the task requires; don't refactor
  or reformat adjacent code. Note unrelated issues separately instead of
  bundling them in (see *Surgical Changes* in Engineering principles).

## Architecture & decisions

- **Match the codebase.** Follow existing patterns, structure, and naming;
  consistency beats personal preference.
- **Prefer the simple, boring solution.** Add abstraction when duplication or
  change pressure demands it - not in anticipation.
- **Keep clear boundaries** between concerns; avoid reaching across layers.
- **No new dependency without justification.** Prefer the standard library and
  what the project already uses.
- **Record significant decisions as ADRs.** Anything hard to reverse, affecting
  multiple teams, or that future readers would ask "why?" about goes in
  `docs/adr/`. Use the `write-adr` skill to scaffold one.

## Quality & safety

- **Handle errors and edge cases explicitly.** No silently swallowed
  exceptions; fail loudly and early with a clear message.
- **Never commit secrets.** No credentials, tokens, or keys in code, config, or
  history. Read configuration from the environment.
- **Validate input at trust boundaries.** Treat anything external - users,
  network, files - as untrusted.
- **Be careful with destructive actions.** Migrations, deletes, and bulk writes
  need review and a way back.
- **Leave no debugging residue** - no stray prints, commented-out code, or
  `TODO` without an owner and a tracking issue.
