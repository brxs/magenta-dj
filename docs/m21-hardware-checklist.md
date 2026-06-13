# M21 hardware checklist — hot cues and track loops

Manual verification of the M21 exit criteria with the device and
ears. The measurable half is `verify_m21.mjs` (in `just verify-ui`):
cue jump landing, the playhead folding through a closed loop, the
clean release. This covers the pad LEDs, the audible seam, and the
loop-section bytes no script can confirm (ADR-0015).

## Setup

- [ ] FLX4 connected (green LED), a composed techno track loaded on
      deck B and playing, the beat view showing (any layout but Off),
      red beat ticks visible on its close-up (a grid).

## Hot cues (HOT CUE pad bank)

- [ ] An **empty pad** sets a cue at the playhead — the pad LED
      lights, a mint cue marker appears on the beat-view close-up, and
      with a grid it sits on a beat tick (quantise).
- [ ] A **filled pad** jumps there while the track plays — no click,
      music continues from the cue.
- [ ] **SHIFT + pad** clears the cue: LED dark, marker gone. (The
      shift pad layer `0x98`/`0x9A`, the M13-measured firmware
      habit — if nothing happens, the monitor shows what SHIFT+pad
      actually sends.)
- [ ] Switching the deck to realtime and back: the HOT CUE bank LEDs
      repaint truthfully for each mode (style targets vs filled
      cues) — never both, never stale.

## Track loop (LOOP section)

- [ ] **LOOP IN** then **LOOP OUT** a few beats later closes a loop:
      the region shades on the overview and washes on the beat-view
      close-up (entry/exit caps at its edges), the length reads in
      beats, and the seam is **seamless by ear** — no click, no
      stutter, the kick pattern stays in time across the wrap.
- [ ] **RELOOP/EXIT** releases it: playback runs straight past the
      old boundary, no jump. (Bytes `0x10`/`0x11`/`0x4D` are from
      the Mixxx chart — confirm with the monitor; the tempo slider
      taught us charts lie.)
- [ ] With SYNC engaged and a loop running, the phase meter stays
      steady — looping must not break the beat clock.

## Honest degrade and expected behaviours

- [ ] On an ambient (gridless) track: cues set free (no snap), the
      loop closes but **claims no beat length**, and a too-tight
      IN→OUT refuses rather than buzzing.
- [ ] **Any seek exits the loop — deliberately** (ADR-0015, one
      rule): a hot-cue jump, an overview click, transport CUE
      (back-to-top), and a **paused** jog tick all drop an active
      loop. Confirm this feels predictable rather than surprising;
      if a dormant-loop RELOOP is genuinely missed in the hands,
      that's a recorded Later refinement, not a bug.

When every box ticks, flip M21's status in [`ROADMAP.md`](ROADMAP.md)
to ✅ done and ADR-0015 to Accepted.
