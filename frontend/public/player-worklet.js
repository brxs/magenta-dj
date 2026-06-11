import { createCrusherState, crushBlock } from './crusher-kernel.js';
import {
  captureRecent,
  clampHistory,
  createCaptureState,
  noteConsumed,
} from './loop-capture-kernel.js';

// PCM deck player. Ring-buffers interleaved stereo float32 chunks posted from
// the main thread and plays them, counting underrun events. Playback starts
// (and restarts after an underrun) only once PREBUFFER_SECONDS of audio is
// queued, so one slow chunk causes a single counted gap instead of a crackle
// storm. Posts {underruns, bufferedSeconds, playing} stats every second.
// The ring doubles as the freeze-pad capture source (ADR-0009): frames
// behind the read position are recently played audio, answered on demand.
//
// Messages in: {type: 'pcm', samples: Float32Array} | {type: 'reset'}
//            | {type: 'capture', id, frames} (answered with
//              {type: 'captured', id, left, right})

const CAPACITY_SECONDS = 30;
const PREBUFFER_SECONDS = 1.5;
const STATS_INTERVAL_SECONDS = 1;

class PCMPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = sampleRate * CAPACITY_SECONDS;
    this.left = new Float32Array(this.capacity);
    this.right = new Float32Array(this.capacity);
    this.readPos = 0;
    this.writePos = 0;
    this.available = 0;
    this.started = false;
    this.underruns = 0;
    this.framesSinceStats = 0;
    this.capture = createCaptureState();
    this.port.onmessage = (event) => {
      const message = event.data;
      if (message.type === 'pcm') {
        this.enqueue(message.samples);
      } else if (message.type === 'reset') {
        // Flushes queued audio only; underruns intentionally survive — the
        // counter reports the whole page session, not one play.
        // History goes too: a capture spanning a reset would splice two
        // unrelated streams into one "loop".
        this.readPos = 0;
        this.writePos = 0;
        this.available = 0;
        this.started = false;
        this.capture = createCaptureState();
        this.postStats();
      } else if (message.type === 'capture') {
        const { left, right } = captureRecent(
          this.left,
          this.right,
          this.readPos,
          this.capacity,
          this.capture,
          message.frames,
        );
        this.port.postMessage(
          { type: 'captured', id: message.id, left, right },
          [left.buffer, right.buffer],
        );
      }
    };
  }

  enqueue(interleaved) {
    const frames = interleaved.length / 2;
    for (let i = 0; i < frames; i++) {
      this.left[this.writePos] = interleaved[2 * i];
      this.right[this.writePos] = interleaved[2 * i + 1];
      this.writePos = (this.writePos + 1) % this.capacity;
    }
    this.available = Math.min(this.available + frames, this.capacity);
    clampHistory(this.capture, this.available, this.capacity);
  }

  postStats() {
    this.port.postMessage({
      underruns: this.underruns,
      bufferedSeconds: this.available / sampleRate,
      playing: this.started,
    });
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const frames = out[0].length;

    if (!this.started && this.available >= sampleRate * PREBUFFER_SECONDS) {
      this.started = true;
    }

    if (this.started && this.available >= frames) {
      for (let i = 0; i < frames; i++) {
        out[0][i] = this.left[this.readPos];
        out[1][i] = this.right[this.readPos];
        this.readPos = (this.readPos + 1) % this.capacity;
      }
      this.available -= frames;
      noteConsumed(this.capture, frames, this.available, this.capacity);
    } else if (this.started) {
      this.underruns += 1;
      this.started = false; // re-arm the prebuffer; outputs stay silent
    }

    this.framesSinceStats += frames;
    if (this.framesSinceStats >= sampleRate * STATS_INTERVAL_SECONDS) {
      this.framesSinceStats = 0;
      this.postStats();
    }
    return true;
  }
}

registerProcessor('pcm-player', PCMPlayer);

// Recorder: taps the master bus (post-crossfade, post-volume — exactly the
// speaker feed) and batches interleaved stereo float32 to the main thread.
// Messages in: {type: 'start'} | {type: 'stop'} (stop flushes, then posts
// {type: 'done'}).

const RECORD_BATCH_FRAMES = 4800; // 0.1s per message

class PCMRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.stopped = false;
    this.batch = new Float32Array(RECORD_BATCH_FRAMES * 2);
    this.batchFrames = 0;
    this.port.onmessage = (event) => {
      if (event.data.type === 'start') {
        this.recording = true;
        this.batchFrames = 0;
      } else if (event.data.type === 'stop') {
        this.recording = false;
        this.flush();
        this.port.postMessage({ type: 'done' });
        this.stopped = true; // lets process() return false → node reclaimable
      }
    };
  }

  flush() {
    if (this.batchFrames === 0) return;
    const out = this.batch.slice(0, this.batchFrames * 2);
    this.port.postMessage({ type: 'pcm', samples: out }, [out.buffer]);
    this.batchFrames = 0;
  }

  process(inputs) {
    if (this.stopped) return false;
    if (!this.recording) return true;
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const left = input[0];
    const right = input[1] ?? input[0];
    for (let i = 0; i < left.length; i++) {
      this.batch[2 * this.batchFrames] = left[i];
      this.batch[2 * this.batchFrames + 1] = right[i];
      this.batchFrames += 1;
      if (this.batchFrames === RECORD_BATCH_FRAMES) this.flush();
    }
    return true;
  }
}

registerProcessor('pcm-recorder', PCMRecorder);

// Bit crusher (roadmap M12): quantises to a bit depth and sample-holds
// across `reduction` frames. Parameters arrive as port messages
// {bits, reduction}; at the transparent settings (16 bits, hold 1) the
// stream passes through unchanged.

class BitCrusher extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bits = 16;
    this.reduction = 1;
    this.state = createCrusherState();
    this.port.onmessage = (event) => {
      this.bits = event.data.bits;
      this.reduction = event.data.reduction;
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;
    crushBlock(input, output, this.bits, this.reduction, this.state);
    return true;
  }
}

registerProcessor('bit-crusher', BitCrusher);
