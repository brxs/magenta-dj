---
name: write-adr
description: Use when authoring, scaffolding, or superseding an Architecture Decision Record (ADR) - recording a significant, hard-to-reverse, or cross-team decision in docs/adr/. Loaded by /berlitz-engineering:write-issue and /berlitz-engineering:fix-issue, and usable on its own.
---

# Write an ADR

Author a clear Architecture Decision Record in `docs/adr/`. An ADR captures a
**significant decision, the context that forced it, and the consequences
accepted** - so a future reader understands not just what was decided but why.

Reach for one when a decision is **hard to reverse, affects more than one team,
or a future reader would reasonably ask "why was it done this way?"**. Routine,
easily-reversible choices do not need an ADR. (For the *when and why* of
recording decisions, see the `engineering-standards` skill; this skill is the
*how*.)

## Where ADRs live

One file per decision in `docs/adr/`, named `NNNN-short-title.md` - a
zero-padded, sequential number and a slug. ADRs are never renumbered or deleted;
a superseded one is marked, not removed.

## Scaffold the file

1. **Pick the number.** List the existing records (`docs/adr/[0-9]*.md`), take
   the highest `NNNN` prefix, and add one; zero-pad to four digits. If there are
   none, use `0001`.
2. **Slug the title.** Lowercase it and replace each run of non-alphanumeric
   characters with a single hyphen - e.g. "Adopt event sourcing for orders" →
   `adopt-event-sourcing-for-orders`.
3. **Pick the template.** Prefer `docs/adr/template.md` if the project has one;
   otherwise use the bundled ADR template
   (`$CLAUDE_PLUGIN_ROOT/templates/adr/template.md`, or find it under `~/.claude`
   at `*berlitz-engineering/templates/adr/template.md`). If neither exists, use the
   Context / Decision / Consequences / Alternatives structure below.
4. **Write** `docs/adr/NNNN-<slug>.md` (create `docs/adr/` if missing). Set the
   `NNNN. <Title>` heading, `Status: Proposed`, and `Date:` to today
   (`date +%Y-%m-%d`). Name the deciders if known.

## Write content worth keeping

One decision per ADR. Fill the sections so they stand on their own:

- **Context** - the forces that make a decision necessary: the problem, the
  constraints, the requirements in tension. State them as facts, not opinions. A
  reader should see why doing nothing was not an option.
- **Decision** - the choice, in active voice: "We will …". Be specific and
  unambiguous. This is the part people will cite.
- **Consequences** - what gets easier and what gets harder once this is in
  place. Name the trade-offs you are accepting and any follow-up work it
  creates. Honest negatives here are what make an ADR trustworthy.
- **Alternatives considered** - the other options you weighed and why each lost.
  This is what stops the decision being re-litigated later.

Keep it short and concrete. An ADR is a memo, not an essay.

## Status lifecycle

- **Proposed** - drafted, under review (typically in a decisions-only pull
  request).
- **Accepted** - agreed and merged. An accepted ADR is **immutable**: don't
  rewrite the decision.
- **Superseded by ADR-NNNN** - to change an accepted decision, write a *new* ADR
  and set the old one's status to point at it. Never edit the old decision away.

## After scaffolding

If you reached this skill from `/berlitz-engineering:write-issue` or `/berlitz-engineering:fix-issue`,
hand the finished ADR(s) back so the caller can open the **decisions-only pull
request** and gate the implementation on it. Invoked on its own, the ADR is
reviewed and merged the same way - decision first, code later.
