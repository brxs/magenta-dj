# 0001. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-06-09
- **Deciders:** Engineering

## Context

Significant technical decisions tend to lose their rationale over time. Months
later, the constraints and trade-offs that produced a design are no longer
obvious, so the decision is either second-guessed or accidentally reversed. We
need a lightweight, durable way to capture *why* a decision was made, close to
the code it affects.

## Decision

We will record significant architecture decisions as Architecture Decision
Records (ADRs) - short Markdown files kept in `docs/adr/`, numbered sequentially
and written from the [`template.md`](template.md) in this directory. New ADRs
are scaffolded with the `write-adr` skill.

## Consequences

- The reasoning behind a decision lives in version control, reviewable in the
  same pull request as the change it describes.
- Contributors gain a clear, low-friction path for proposing and recording
  decisions.
- ADRs are immutable once accepted; a changed decision is a new ADR that
  supersedes the old one, preserving the historical record.
- It costs a few minutes per significant decision - a deliberate, small tax.

## Alternatives considered

- **A wiki or external doc tool** - drifts from the code, easily missed in
  review, and not versioned alongside the change.
- **No formal record** - the status quo; rationale is lost and decisions are
  relitigated.
