/** Audio output device discovery for the cue feed (ADR-0006). */

export type AudioOutputDevice = { deviceId: string; label: string }

function labelledOutputs(devices: MediaDeviceInfo[]): AudioOutputDevice[] {
  return devices
    .filter((device) => device.kind === 'audiooutput' && device.label)
    .map(({ deviceId, label }) => ({ deviceId, label }))
}

/** List output devices the cue feed can be routed to. Device labels are
 * only exposed once some media permission is granted, so when they come
 * back blank this takes a throwaway microphone stream — the one-off
 * prompt ADR-0006 accepts — and releases it immediately. */
export async function listAudioOutputs(): Promise<AudioOutputDevice[]> {
  const media = navigator.mediaDevices
  const outputs = labelledOutputs(await media.enumerateDevices())
  if (outputs.length > 0) return outputs
  const stream = await media.getUserMedia({ audio: true })
  try {
    return labelledOutputs(await media.enumerateDevices())
  } finally {
    for (const track of stream.getTracks()) track.stop()
  }
}
