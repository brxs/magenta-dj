# 0009. Freeze pads loop played audio at the channel head

- **Status:** Accepted
- **Date:** 2026-06-11
- **Deciders:** Daniel Peter

## Context

M13 adds freeze pads: a generative deck never plays the same thing
twice, so when the model lands on something great the player needs a
way to hold it — capture the last bars into a loop, keep it on air,
and re-steer the model underneath. Three questions need settling:

1. **Where to capture.** "The last bars" must mean what was *heard*,
   not what was *queued*: the player worklet buffers seconds of lead,
   so a main-thread tap on the incoming PCM would capture audio the
   listener hasn't heard yet.
2. **Where the loop plays back.** A frozen deck should still respond
   to EQ, Color FX, the fader, and the cue tap — the loop replaces
   the *source*, not the channel.
3. **What the live stream does while frozen.** Unfreezing must return
   to fresh material without a buffer rebuild or an underrun.

## Decision

We will capture from the player worklet's played history and loop at
the channel head, behind a live/loop gain pair:

- **Capture = the worklet's own ring, behind the read position.** The
  `pcm-player` ring holds 30 s; everything behind `readPos` is recently
  *played* audio that nothing has overwritten yet. A `capture` port
  message copies the last N frames out — no extra node, no per-sample
  cost while not capturing. The history bookkeeping and the wrap-aware
  copy live in a pure kernel (`loop-capture-kernel.js`, the
  crusher-kernel pattern) so they are unit-testable.
- **Loop playback at the chain head, pre-EQ.** The graph grows a gain
  pair in front of the EQ: `worklet → liveGain → EQ → …` with an
  `AudioBufferSourceNode → loopGain` summing into the same EQ input.
  Freezing snap-ramps `liveGain → 0` and `loopGain → 1` (the ADR-0008
  exact-landing ramp), so the swap is a short crossfade, never a click,
  and everything downstream — EQ, Color FX, cue, fader, meters — keeps
  working on the loop.
- **The live stream keeps running, muted.** The worklet keeps
  consuming and the worker keeps generating while frozen (the M10
  primed-deck precedent: a running, inaudible deck). Unfreeze is just
  the reverse ramp — the stream is still warm, so there is nothing to
  rebuild. The style pad stays live, so the model can be re-steered
  under the loop.
- **Seamless loops by construction.** The captured tail is `loop
  length + 30 ms`; a pure function crossfades the extra 30 ms into the
  head so the wrap point is continuous. The fade is **linear**, not
  equal-power: the seam blends the same deck's material moments apart
  (strongly correlated), where linear is exact for sustained content
  and equal-power would bump it by up to 3 dB.
- **Slots are session-only.** Four slots per deck hold built
  `AudioBuffer`s in the channel; captured audio is deliberately not
  persisted — loops are performance state, like the headphone cue
  (M9), not configuration. The loop *length* setting persists.

Hardware: the slots live on the FLX4's SAMPLER pad bank (note base
`0x30`, already confirmed by the 0x10-per-bank scheme measured in
M12). An empty pad captures and freezes in one press, a filled pad
swaps the loop in, the active pad returns to live; SHIFT + pad clears
the slot. LEDs mirror filled slots.

## Consequences

- Easier: capture costs nothing until used (the history is the ring
  the player already owns); the loop inherits every downstream
  feature for free; no protocol or backend change at all.
- The capture window is bounded by the ring: at most ~27 s of history
  exists (30 s capacity minus the buffered lead), far above the 8 s
  maximum loop — but a freshly started deck may hold less than the
  requested length, in which case the capture returns what exists and
  presses with under half a second of history are refused.
- While frozen, the deck plays generated audio nobody hears — the
  price of an instant, glitch-free unfreeze (and exactly what a primed
  deck already does).
- The worklet's stats port gains a second message type (`captured`),
  so the channel demultiplexes on `type` — stats messages stay
  shapeless for compatibility.
- A reset (stop, model switch, crash) clears the played history:
  capturing across a discontinuity would splice two unrelated streams
  into one "loop".

## Alternatives considered

- **Main-thread tap on `postPcm`** — no worklet change, but it
  captures the enqueue stream, which runs seconds *ahead* of the
  speakers; "freeze what I just heard" would freeze the future.
- **A recorder-style always-on capture node** — works, but burns a
  message per 100 ms per deck forever to keep a history the player's
  ring already contains.
- **Pausing generation while frozen** — saves compute, but unfreezing
  would wait on the prebuffer (1.5 s of silence or a stale tail), and
  the M10 machinery deliberately keeps primed decks rolling for the
  same reason.
- **Persisting loops** — audio blobs in localStorage/IndexedDB for a
  state that is meaningless after the moment has passed; rejected as
  scope without a use case (crates, M16, is the persistence story).

<!-- Status values: Proposed | Accepted | Rejected | Deprecated |
     Superseded by ADR-NNNN -->
