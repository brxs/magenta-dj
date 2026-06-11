// Plain JS on purpose: the kernel lives in public/ (the worklet imports
// it as a sibling module), outside the TypeScript project's include.

import { describe, expect, it } from 'vitest'

import {
  captureRecent,
  clampHistory,
  createCaptureState,
  noteConsumed,
} from '../../public/loop-capture-kernel.js'

// A tiny stand-in for the pcm-player ring: write interleaved-equal
// channels, consume, and let the kernel track what stays capturable.
function ring(capacity) {
  return {
    left: new Float32Array(capacity),
    right: new Float32Array(capacity),
    readPos: 0,
    writePos: 0,
    available: 0,
    capacity,
    state: createCaptureState(),
    write(samples) {
      for (const sample of samples) {
        this.left[this.writePos] = sample
        this.right[this.writePos] = -sample
        this.writePos = (this.writePos + 1) % this.capacity
      }
      this.available = Math.min(this.available + samples.length, this.capacity)
      clampHistory(this.state, this.available, this.capacity)
    },
    consume(frames) {
      this.readPos = (this.readPos + frames) % this.capacity
      this.available -= frames
      noteConsumed(this.state, frames, this.available, this.capacity)
    },
  }
}

describe('loop capture kernel', () => {
  it('captures the most recent played frames, both channels', () => {
    const r = ring(16)
    r.write([1, 2, 3, 4, 5, 6])
    r.consume(6)
    const { left, right } = captureRecent(
      r.left, r.right, r.readPos, r.capacity, r.state, 4,
    )
    expect(Array.from(left)).toEqual([3, 4, 5, 6])
    expect(Array.from(right)).toEqual([-3, -4, -5, -6])
  })

  it('returns only what has actually been played', () => {
    const r = ring(16)
    r.write([1, 2, 3, 4])
    r.consume(2) // two frames still queued, unplayed
    const { left } = captureRecent(
      r.left, r.right, r.readPos, r.capacity, r.state, 10,
    )
    expect(Array.from(left)).toEqual([1, 2])
  })

  it('captures across the ring wrap', () => {
    const r = ring(8)
    r.write([1, 2, 3, 4, 5, 6])
    r.consume(6)
    r.write([7, 8, 9, 10]) // writePos wraps past the start
    r.consume(4)
    const { left } = captureRecent(
      r.left, r.right, r.readPos, r.capacity, r.state, 5,
    )
    expect(Array.from(left)).toEqual([6, 7, 8, 9, 10])
  })

  it('forgets history the writer has overwritten', () => {
    const r = ring(8)
    r.write([1, 2, 3, 4, 5, 6, 7, 8])
    r.consume(8) // 8 frames of history fill the ring
    r.write([9, 10, 11, 12]) // overwrites the four oldest played frames
    expect(r.state.history).toBe(4)
    r.consume(4)
    const { left } = captureRecent(
      r.left, r.right, r.readPos, r.capacity, r.state, 8,
    )
    expect(Array.from(left)).toEqual([5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('caps history at the ring space the buffer is not using', () => {
    const r = ring(8)
    for (let round = 0; round < 5; round++) {
      r.write([1, 2, 3, 4])
      r.consume(2)
    }
    // 10 frames still buffered would exceed capacity; available is
    // capped at 8 by the ring, leaving no room for history.
    expect(r.state.history).toBe(r.capacity - r.available)
  })

  it('starts empty', () => {
    const r = ring(8)
    const { left, right } = captureRecent(
      r.left, r.right, r.readPos, r.capacity, r.state, 4,
    )
    expect(left).toHaveLength(0)
    expect(right).toHaveLength(0)
  })

  it('treats a malformed request as zero frames, not a crash', () => {
    const r = ring(8)
    r.write([1, 2, 3, 4])
    r.consume(4)
    const { left } = captureRecent(
      r.left, r.right, r.readPos, r.capacity, r.state, -3,
    )
    expect(left).toHaveLength(0)
  })
})
