# 0004. Style is a weighted prompt blend; tempo is not a parameter

- **Status:** Accepted
- **Date:** 2026-06-10
- **Deciders:** Daniel Peter

## Context

M4 turned deck steering from a single prompt into a performance surface.
Two questions had to be settled:

1. **What is a deck's style, on the wire and in the engine?** MusicCoCa
   style embeddings are plain 768-dim vectors, so any weighted set of
   prompts has a well-defined blend (their weighted average), and the UI
   wanted to grow from one prompt → two-prompt morph → N-target 2D pad
   without re-plumbing each time.
2. **Is tempo controllable?** Three spike rounds
   ([`spike-bpm.md`](../spike-bpm.md)) measured it: text bpm hints are
   unreliable and sometimes push tempo the *wrong* way; per-frame drum/notes
   conditioning pulse trains are not interpreted as a clock (a 100 bpm and
   an 88 bpm clock land on the same attractor); combining both lands on a
   third attractor. The exported model's sampling is deterministic, so these
   are stable behaviours, not noise.

## Decision

We will model a deck's style as **a list of 1–8 weighted prompts**
(`set_style {prompts: [{text, weight}…]}`), blended in embedding space by
the worker from cached per-text embeddings. This replaces the earlier
single-prompt/pair forms on the wire (`prompt_applied` → `style_applied`);
`set_prompt` remains as sugar for a single-prompt style.

We will **not expose a tempo parameter anywhere** — not in the UI, the wire
protocol, or the engine API. Tempo in MRT2 is emergent from style; users
who want to nudge it can put a bpm phrase inside a prompt text, which is
exactly as powerful as any control we could build and carries no false
promise of precision.

## Consequences

- Easier: the pad, clusters, and future style sources (presets, audio
  prompts) all speak one shape; weights are recomputed client-side at
  gesture rate while embeddings stay cached server-side.
- Harder: any future tempo feature must start from new evidence (upstream
  tempo conditioning or post-hoc time-stretching), not from re-adding a
  knob — this ADR is the record of why the knob was removed.
- The wire change was breaking; all in-repo clients (frontend, e2e and
  verification scripts) moved in lockstep. External clients do not exist
  yet.

## Alternatives considered

- **Keep the bpm hint field (shipped briefly in M4)** - removed after
  round 3 of the spike: a dedicated numeric control implies an agency the
  model demonstrably lacks, and sometimes steers the wrong way.
- **Tempo via injected clock conditioning** - measured; the drums channel
  acts as a density/feel knob, not a rate input.
- **Fixed two-slot morph protocol (`prompt_a`/`prompt_b`/`mix`)** - shipped
  briefly, then generalized: it could not express the N-target pad and
  would have needed another breaking change later.

<!-- Status values: Proposed | Accepted | Rejected | Deprecated |
     Superseded by ADR-NNNN -->
