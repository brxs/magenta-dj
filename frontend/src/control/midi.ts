/** Web MIDI plumbing for the DDJ-FLX4 (ADR-0005). Framework-free so the
 * connect/hot-plug/permission flow is unit-testable with a fake MIDIAccess;
 * the React side lives in useMidi. Access is only requested from an explicit
 * user gesture — the browser permission prompt should never appear
 * unprompted. */

export type MidiStatus =
  | 'unsupported'
  | 'idle'
  | 'requesting'
  | 'connected'
  | 'no-device'
  | 'denied'

export const FLX4_NAME_FRAGMENT = 'DDJ-FLX4'

/** Makes the FLX4 dump every analog control's current position as
 * ordinary CC traffic — knobs are silent until moved, so this is how a
 * fresh connection syncs to the hardware. From the Mixxx FLX4 script
 * ("query the controller for current control positions on startup");
 * reverse-engineered there with Wireshark, doubles as its keep-alive. */
export const FLX4_STATUS_QUERY = [
  0xf0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x04, 0x05, 0x00, 0x50, 0x02, 0xf7,
]

export type MidiLink = {
  /** Request access and bind the FLX4; safe to call again to retry. */
  connect: () => Promise<void>
  /** Send bytes to the controller (LED feedback); no-op without a device. */
  send: (data: number[]) => void
}

type MidiLinkOptions = {
  onMessage: (data: Uint8Array) => void
  onStatus: (status: MidiStatus, deviceName: string | null) => void
  /** Injectable for tests; defaults to navigator.requestMIDIAccess. */
  requestAccess?: () => Promise<MIDIAccess>
}

function findFlx4<Port extends MIDIPort>(ports: ReadonlyMap<string, Port>) {
  for (const port of ports.values()) {
    if (port.name?.includes(FLX4_NAME_FRAGMENT)) return port
  }
  return null
}

export function createMidiLink({
  onMessage,
  onStatus,
  requestAccess,
}: MidiLinkOptions): MidiLink {
  const request =
    requestAccess ??
    (typeof navigator !== 'undefined' &&
    typeof navigator.requestMIDIAccess === 'function'
      ? // The position query is SysEx, so access must ask for it.
        () => navigator.requestMIDIAccess({ sysex: true })
      : null)

  let access: MIDIAccess | null = null
  let input: MIDIInput | null = null
  let output: MIDIOutput | null = null

  // Re-scan on every state change so unplugging and replugging the deck
  // mid-set recovers without another permission round-trip.
  function bind(granted: MIDIAccess) {
    const nextInput = findFlx4(granted.inputs)
    if (nextInput !== input) {
      if (input) input.onmidimessage = null
      input = nextInput
      if (input) {
        input.onmidimessage = (event) => {
          if (event.data) onMessage(event.data)
        }
      }
    }
    output = findFlx4(granted.outputs)
    // Every (re)bind syncs the app to the hardware: the controller
    // answers the query by reporting all current knob/fader positions,
    // which flow through the translator like any other move.
    if (input) output?.send(FLX4_STATUS_QUERY)
    onStatus(input ? 'connected' : 'no-device', input?.name ?? null)
  }

  return {
    async connect() {
      // Access already granted (a no-device retry): just re-scan, keeping
      // the existing statechange handler single-bound.
      if (access) {
        bind(access)
        return
      }
      if (!request) {
        onStatus('unsupported', null)
        return
      }
      onStatus('requesting', null)
      let granted: MIDIAccess
      try {
        granted = await request()
      } catch {
        onStatus('denied', null)
        return
      }
      access = granted
      granted.onstatechange = () => bind(granted)
      bind(granted)
    },
    send(data) {
      output?.send(data)
    },
  }
}
