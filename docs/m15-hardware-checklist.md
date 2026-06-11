# M15 checklist — deck-to-deck style sampling by ear

Manual verification of the M15 exit criteria. The capture, upload,
ordering, and blend math are unit-tested on both sides; the spike
(`spike-style-transfer`, ADR-0011) already judged raw resemblance.
This covers the integrated flow: one action, audible character
transfer, clean streams.

## Setup

- [ ] App open in Chromium, deck A playing a distinctive style (e.g.
      "driving techno, four on the floor") for at least ~15 s; deck B
      playing something clearly different (e.g. "ambient drone, soft
      pads").

## The one action

- [ ] Deck B's **Sample deck A** button is enabled (and deck A's
      mirror button likewise); on a fresh deck that has not played,
      the button is disabled.
- [ ] Press **Sample deck A** on deck B: a `⏺ A·1` chip and pad target
      appear within a moment — no error banner, no glitch on either
      deck's stream (watch both health rows: zero new underruns).

## Audible transfer

- [ ] Drag deck B's cursor fully onto the `⏺ A·1` target: within a few
      seconds (the next chunk boundaries) deck B audibly shifts toward
      deck A's character — same kind of music, not the same notes.
- [ ] Blend: position the cursor between `⏺ A·1` and a text target —
      the output sits audibly between the two, and riding the cursor
      glides it like any text-only blend.
- [ ] Re-sample: press the button again later (deck A having moved
      on) — a `⏺ A·2` target lands and sounds like A's *new* moment.
- [ ] Remove: clicking the chip removes the target like any other.

## Honest lifetimes

- [ ] Reload the page: text targets come back, sampled chips are gone
      (session-only by design, ADR-0011).
- [ ] Switch deck B's model (or restart after a crash): sampled chips
      vanish from deck B's pad on their own; the deck keeps working
      with its text targets, no stuck error.
- [ ] Sampling while deck B is loading a model: the button press
      surfaces a clear inline error and nothing lands on the pad.

## Integration

- [ ] Both decks keep streaming cleanly through capture, upload, and
      embed (zero new underruns on either health row).
- [ ] Recording during a sampled blend: the WAV contains what was
      heard.

When every box ticks, flip M15 in [`ROADMAP.md`](ROADMAP.md) to ✅ done.
