import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AudioEngineProvider } from '../audio/AudioEngineProvider'
import type { AudioEngine } from '../audio/engine'
import { Mixer } from './Mixer'

function makeEngine(overrides: Partial<AudioEngine> = {}): AudioEngine {
  return {
    createDeckChannel: vi.fn(),
    resume: vi.fn(async () => {}),
    setCrossfade: vi.fn(),
    startRecording: vi.fn(async () => {}),
    stopRecording: vi.fn(async () => new Blob(['x'], { type: 'audio/wav' })),
    ...overrides,
  }
}

function renderMixer(engine: AudioEngine) {
  return render(
    <AudioEngineProvider engine={engine}>
      <Mixer crossfade={0.5} onCrossfadeChange={() => {}} />
    </AudioEngineProvider>,
  )
}

describe('Mixer recording', () => {
  it('records the master bus and downloads the WAV on stop', async () => {
    const engine = makeEngine()
    const objectUrl = vi.fn(() => 'blob:fake')
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: objectUrl,
      revokeObjectURL: vi.fn(),
    })
    try {
      renderMixer(engine)

      fireEvent.click(screen.getByRole('button', { name: 'Record' }))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Stop recording' })).toBeVisible(),
      )
      expect(engine.startRecording).toHaveBeenCalled()
      expect(engine.resume).toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))
      await waitFor(() => expect(engine.stopRecording).toHaveBeenCalled())
      await waitFor(() => expect(objectUrl).toHaveBeenCalled())
      expect(screen.getByRole('button', { name: 'Record' })).toBeVisible()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('surfaces a recording failure instead of swallowing it', async () => {
    const engine = makeEngine({
      startRecording: vi.fn(async () => {
        throw new Error('no audio context')
      }),
    })
    renderMixer(engine)
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('no audio context'),
    )
  })
})
