# 0011. Deck-to-deck style sampling via audio embeddings

- **Status:** Accepted
- **Date:** 2026-06-11
- **Deciders:** Daniel Peter

## Context

M15 adds "make deck B sound like deck A, right now": MusicCoCa embeds
audio as well as text (`embed_style(str | Waveform)`, a measured API
fact since the M1 spike), so the most useful style reference in a
booth — the other deck — can become a pad target. The spike
(`backend/scripts/spike_style_transfer.py`, judged by ear 2026-06-11)
settled the two open risks: a 10 s audio embedding audibly carries the
source's character when regenerated, blends sensibly 50/50 with a
contrasting text style, and embeds in **under 0.5 s** — comfortably
inside the worker's ~3 s pacing lead, so embedding runs inline between
chunks without underrunning a playing deck.

Decisions needed: where the sample comes from, how it reaches the
worker, how styles reference it, and what happens to it over time.

## Decision

- **The sample is what was heard.** Capture comes from the source
  deck's player-ring history (the M13 freeze-pad machinery) — the last
  10 s *played*, pre-EQ/FX, so the embedding hears the model's
  character, not the mixer's current colouring. Captures under 3 s are
  refused on both sides of the wire.
- **Upload once, embed once, reference by id.** The browser POSTs the
  wire-format PCM to `/api/deck/{deck}/style-sample?id=` on the
  *target* deck; the controller queues an `embed_sample` command and
  returns. The worker embeds via MusicCoCa's audio path and caches the
  vector under the client-issued id; the clip itself is dropped.
- **FIFO ordering instead of a readiness handshake.** Style entries
  gain an optional `sample` id next to their display label, and the
  pad target is added the moment the POST resolves — safe because the
  worker's command queue is FIFO: the embed always lands before any
  `set_style` that references it. No event-wait, no pending states.
- **Sampled targets are deliberately mortal.** Embeddings live in the
  worker's memory (a small LRU, one pad's worth), so they die with the
  worker. The UI tells the truth about that: sampled chips never
  persist to localStorage, and a crash or model switch strips them
  from the pad in the same render that shows the banner — re-sampling
  is the recovery, matching the freeze-loop philosophy (ADR-0009:
  performance state, not configuration). A `set_style` that still
  references a dead id fails with an explicit "re-sample the deck"
  error rather than silently restyling.

## Consequences

- Easier: one new endpoint and one worker command; the blend math is
  untouched (audio embeddings are the same 768-dim vectors text
  produces), so weights, the cursor, and the XY pad work unchanged.
- A sampled target captures a *moment*, not a live link — deck A
  moving on does not move deck B's target. Re-sampling is one press.
- The 10 s capture is ~3.8 MB through the command queue once per
  press; negligible against the audio stream itself.
- Sampling needs the source deck to have played ≥3 s in this session;
  the button gates on the other deck playing.
- File-drop styles (the roadmap stretch) would reuse everything from
  the POST down; deliberately not built until wanted.

## Alternatives considered

- **Backend-side ring (worker keeps its own recent audio)** — avoids
  the upload, but adds cross-worker plumbing through the controller,
  duplicates a 30 s buffer the frontend already maintains, and embeds
  *queued* audio rather than what was heard.
- **Readiness handshake (add the chip on `sample_embedded`)** — extra
  protocol and pending-UI states to solve an ordering problem the FIFO
  queue already solves.
- **Persisting sampled targets (store the clip, re-embed on load)** —
  megabytes of IndexedDB for a target whose musical moment has passed;
  crates (M16) is the deliberate persistence story.
- **Embedding in the controller process** — would need its own
  MusicCoCa instance per ADR-0002's process isolation; the worker
  already has one and the latency measurement says inline is fine.

<!-- Status values: Proposed | Accepted | Rejected | Deprecated |
     Superseded by ADR-NNNN -->
