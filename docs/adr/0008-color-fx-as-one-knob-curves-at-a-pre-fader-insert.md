# 0008. Color FX as one-knob curves at a pre-fader insert

- **Status:** Accepted
- **Date:** 2026-06-10
- **Deciders:** Daniel Peter

## Context

M12 adds per-deck effects to the running streams, driven from the SMART
CFX knob. DJ software ships two effect families: Beat FX (delays,
rolls — beat-synced) and Sound Color FX (one knob per channel shaping
wet amount and character together). We have no tempo grid, deliberately
(ADR-0004), so the synced family is out of reach honestly; the one-knob
family needs exactly one continuous control, which the CFX knob already
is.

Three placement/behaviour questions need settling:

1. Where the effect sits in the channel chain — the cue feed should
   preview effects on a primed deck like a real mixer's Color FX.
2. How "off" sounds — an in-line filter at its resting frequency still
   colors the signal slightly; the M12 exit criteria demand
   bit-transparency at rest.
3. Where the style sweep goes — it currently owns the CFX knob (M7),
   and the FLX4's own paradigm says the knob belongs to effects. The
   Mixxx mapping shows the firmware sends distinct bytes for many
   shifted *buttons* but lists no shifted variant of the CFX knob, and
   the SHIFT buttons themselves arrive as plain press/release notes
   (`0x90`/`0x91` note `0x3F`) — so shift is software-trackable.

## Decision

We will implement Color FX as **pure one-knob curves over swappable
node graphs at a per-deck insert**:

- **Insert point: post-EQ, pre-fader, pre-cue-tap.** The effect output
  feeds both the master path (via fader/crossfade) and the headphone
  cue, so a primed deck's effect is auditioned in the phones.
- **Branch-pair routing for honest bypass.** The insert is a parallel
  pair — a unity dry branch and the effect chain — blended by ramped
  gains. Each effect declares a rest position (centre for the bipolar
  filter, zero otherwise) and a dead zone around it; inside the dead
  zone the wet gain is exactly 0 and the dry gain exactly 1, so "off"
  is bit-transparent regardless of what the chain would do.
- **Pure curves.** Each effect is a tested `amount → parameters`
  function (the EQ-math pattern); the graph builders only apply what
  the curves compute.
- **Soft-shift CFX handover.** The translator tracks held SHIFT per
  deck from the press/release notes; the CFX knob emits the new
  `fx_amount` intent unshifted and the existing `style_sweep` while
  SHIFT is held. If the firmware turns out to send different bytes for
  the shifted knob, the monitor will show them and the table gains
  rows — the design accommodates either.

The launch set is the canonical six (Filter, Dub Echo, Space, Crush,
Noise, Sweep), with the Sweep LFO free-running by design.

## Consequences

- Easier: one intent, one knob, one persistence story per deck; new
  effects are a curve + a graph builder; the cue feed needs no special
  casing because the insert sits above the split.
- The dead-zone hard-handoff briefly sums dry and near-identical wet
  audio during the ~20 ms gain ramps; at rest-adjacent settings the
  two are near-identical, so comb artefacts are below audibility — the
  price of true transparency at rest.
- Crush needs a small AudioWorklet processor (the existing worklet
  file gains a third registration).
- The style sweep becomes a chord (SHIFT + CFX) instead of a bare
  knob; pads still jump styles, and the XY pad remains the primary
  morph surface.
- Effect tails (echo feedback) decay through the wet gain rather than
  being cut; switching effects disposes the old graph outright.

## Alternatives considered

- **Beat FX family** - rolls and synced delays need the tempo grid
  ADR-0004 deliberately rejects; free-running approximations of synced
  effects feel broken rather than charming.
- **Post-fader insert** - cheaper (no parallel branch) but a
  faded-down primed deck couldn't preview its effect in the cue, which
  defeats the prep workflow (M10/M11).
- **Always-in-line filter without a bypass branch** - simpler graph,
  but a biquad parked at 20 kHz is not bit-transparent, failing the
  exit criterion outright.
- **A second physical knob for effects** - the FLX4 has no free knob;
  EQ and CFX are the full complement.

<!-- Status values: Proposed | Accepted | Rejected | Deprecated |
     Superseded by ADR-NNNN -->
