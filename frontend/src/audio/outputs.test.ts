import { afterEach, describe, expect, it, vi } from 'vitest'

import { listAudioOutputs } from './outputs'

function device(kind: string, deviceId: string, label: string) {
  return { kind, deviceId, label } as MediaDeviceInfo
}

function stubMediaDevices(options: {
  beforeGrant: MediaDeviceInfo[]
  afterGrant?: MediaDeviceInfo[]
}) {
  const track = { stop: vi.fn() }
  let granted = false
  const mediaDevices = {
    enumerateDevices: vi.fn(async () =>
      granted ? (options.afterGrant ?? options.beforeGrant) : options.beforeGrant,
    ),
    getUserMedia: vi.fn(async () => {
      granted = true
      return { getTracks: () => [track] } as unknown as MediaStream
    }),
  }
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: mediaDevices,
  })
  return { mediaDevices, track }
}

afterEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: undefined,
  })
})

describe('listAudioOutputs', () => {
  it('returns labelled outputs without prompting when labels are visible', async () => {
    const { mediaDevices } = stubMediaDevices({
      beforeGrant: [
        device('audiooutput', 'flx4', 'DDJ-FLX4'),
        device('audiooutput', 'mac', 'MacBook Pro Speakers'),
        device('audioinput', 'mic', 'Microphone'),
      ],
    })
    const outputs = await listAudioOutputs()
    expect(outputs).toEqual([
      { deviceId: 'flx4', label: 'DDJ-FLX4' },
      { deviceId: 'mac', label: 'MacBook Pro Speakers' },
    ])
    expect(mediaDevices.getUserMedia).not.toHaveBeenCalled()
  })

  it('takes and releases a mic stream when labels are hidden', async () => {
    const { mediaDevices, track } = stubMediaDevices({
      beforeGrant: [device('audiooutput', '', '')],
      afterGrant: [device('audiooutput', 'flx4', 'DDJ-FLX4')],
    })
    const outputs = await listAudioOutputs()
    expect(outputs).toEqual([{ deviceId: 'flx4', label: 'DDJ-FLX4' }])
    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(track.stop).toHaveBeenCalled()
  })

  it('releases the mic stream even when re-enumeration fails', async () => {
    const { mediaDevices, track } = stubMediaDevices({
      beforeGrant: [],
    })
    mediaDevices.enumerateDevices
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('boom'))
    await expect(listAudioOutputs()).rejects.toThrow('boom')
    expect(track.stop).toHaveBeenCalled()
  })
})
