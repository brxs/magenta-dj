import { useState } from 'react'

import { useControlBus } from './busContext'
import { createFlx4Translator } from './flx4'
import { createMidiLink, type MidiStatus } from './midi'

const MONITOR_SIZE = 6

export type MidiMonitorEntry = { id: number; bytes: number[] }

/** Owns the MIDI link for the app: translates FLX4 traffic onto the
 * ControlBus and keeps the last few raw messages for the monitor. The
 * monitor lives outside React state, read by polling (the LevelMeter
 * pattern), so a fader ride doesn't re-render the app per MIDI message. */
export function useMidi() {
  const bus = useControlBus()
  const [status, setStatus] = useState<MidiStatus>(() =>
    typeof navigator !== 'undefined' &&
    typeof navigator.requestMIDIAccess === 'function'
      ? 'idle'
      : 'unsupported',
  )
  const [deviceName, setDeviceName] = useState<string | null>(null)

  const [{ connect, readMonitor }] = useState(() => {
    let entries: MidiMonitorEntry[] = []
    let nextEntryId = 0
    const translate = createFlx4Translator()
    const link = createMidiLink({
      onMessage: (data) => {
        const bytes = Array.from(data)
        entries = [
          ...entries.slice(-(MONITOR_SIZE - 1)),
          { id: nextEntryId++, bytes },
        ]
        const intent = translate(bytes)
        if (intent) bus.publish(intent)
      },
      onStatus: (nextStatus, nextDeviceName) => {
        setStatus(nextStatus)
        setDeviceName(nextDeviceName)
      },
    })
    return {
      connect: () => void link.connect(),
      readMonitor: () => entries,
    }
  })

  return { status, deviceName, connect, readMonitor }
}
