// Played-history bookkeeping for the pcm-player ring (M13, ADR-0009).
// Everything behind the ring's read position is recently played audio
// that nothing has overwritten yet; these helpers track how much of it
// is valid and copy the most recent frames out. Pure and worklet-free
// (the crusher-kernel pattern) so the logic is unit-testable.

export function createCaptureState() {
  return { history: 0 };
}

// After the player consumed `frames`: they become history, bounded by
// the ring space the writer is not occupying (history + unread audio
// can never exceed the capacity).
export function noteConsumed(state, frames, available, capacity) {
  state.history = Math.min(state.history + frames, capacity - available);
}

// After an enqueue: a writer that laps the ring overwrites the oldest
// history first, so the bound shrinks as `available` grows.
export function clampHistory(state, available, capacity) {
  state.history = Math.min(state.history, capacity - available);
}

// Copy the most recent `requested` played frames (fewer when less
// history exists), ending at the read position, wrap-aware. Two block
// copies per channel, not a per-frame loop: this runs in the worklet's
// message handler ON the audio rendering thread, where an 8 s capture
// must not stall the graph. `requested` is clamped — the port is the
// worklet's trust boundary.
export function captureRecent(left, right, readPos, capacity, state, requested) {
  const frames = Math.max(0, Math.min(requested, state.history));
  const outLeft = new Float32Array(frames);
  const outRight = new Float32Array(frames);
  const start = (readPos - frames + capacity) % capacity;
  const firstSpan = Math.min(frames, capacity - start);
  outLeft.set(left.subarray(start, start + firstSpan));
  outRight.set(right.subarray(start, start + firstSpan));
  if (firstSpan < frames) {
    outLeft.set(left.subarray(0, frames - firstSpan), firstSpan);
    outRight.set(right.subarray(0, frames - firstSpan), firstSpan);
  }
  return { left: outLeft, right: outRight };
}
