# M13 hardware checklist — freeze pads on the DDJ-FLX4

Manual verification of the M13 exit criteria with the physical device.
The seam math, capture bookkeeping, pad semantics, and mapping rows are
unit-tested; this covers ears and firmware: seamless loops on a real
stream, the glitch-free return to live, and the SAMPLER bank behaving
as the bank scheme promises.

## Setup

- [ ] App open in Chromium, **Connect MIDI** green, deck A playing with
      a style it can hold for a few minutes.

## Firmware spot-check (the SAMPLER bank)

The bank base (`0x97`/`0x99` notes `0x30`–`0x37`) comes from the
firmware's 0x10-per-bank scheme — verify it first:

- [ ] Switch the pads to **SAMPLER** mode and press pad 1: the monitor
      shows `97 30 7F` (deck 1) / `99 30 7F` (deck 2). If a different
      note range appears, stop and record it.
- [ ] Hold SHIFT and press SAMPLER pad 1: the monitor shows the shift
      pad layer — `98 30 7F` (deck 1) / `9A 30 7F` (deck 2). (First
      found as a bug: the pads are not soft-shifted like the CFX knob;
      the original soft-shift assumption never fired on hardware.) If
      yet another range appears, stop and record it.

## Freeze, on a playing deck

- [ ] With deck A playing, press SAMPLER pad 1: the last bars loop on
      air — no click, gap, or level jump at the moment of capture.
- [ ] The loop wraps seamlessly: let it cycle several times; the splice
      point is not audible as a tick or a jump.
- [ ] The deck status reads **Frozen — looping** and the on-screen slot
      button 1 shows filled + active; the pad's LED is lit.
- [ ] Press pad 1 again: the live stream returns — again no click or
      underrun (watch the health row), and fresh material plays (not a
      replay of the loop).
- [ ] Capture a second loop on pad 2, then press pad 1: the decks swaps
      straight onto loop 1 (a hard cut, like a sampler), pad LEDs show
      both slots filled.
- [ ] EQ, Color FX, channel fader, and crossfader all still shape the
      frozen loop — kill the lows on a looping deck and they die.
- [ ] Re-steer the style pad while frozen, unfreeze: the new direction
      is what comes back.
- [ ] With the channel's headphone cue on, the frozen loop is what the
      phones hear (the loop sits above the cue tap).
- [ ] Press a SAMPLER pad on a deck that has not played yet: nothing
      happens (the press is refused, no empty loop appears).
- [ ] STOP on a frozen deck silences it; the slot stays filled and can
      be re-frozen after play resumes.

## Clear and length

- [ ] SHIFT + a filled pad clears it: LED goes dark, the on-screen slot
      empties; if it was looping, the deck returns to live first.
- [ ] Shift-click on the on-screen slot button does the same.
- [ ] Set loop length to 1 s and capture: a one-second loop; set 8 s
      and capture another slot: an eight-second loop.
- [ ] Reload: the loop length comes back; the slots are empty (loops
      are session-only by design, ADR-0009).

## Integration

- [ ] Mode round-trip keeps LEDs truthful: SAMPLER → HOT CUE → PAD FX →
      SAMPLER — after every switch each bank shows its own state again
      (style pads 1–N, the active effect, the filled slots).
- [ ] Each deck's SAMPLER pads drive only their own deck.
- [ ] Recording while frozen: the WAV contains the loop, exactly as
      heard.
- [ ] The other deck streams untouched through all of the above (zero
      new underruns).

When every box ticks, flip M13 in [`ROADMAP.md`](ROADMAP.md) to ✅ done.
