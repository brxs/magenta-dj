import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DeckPanel } from './DeckPanel'
import { initialDeckState, type DeckState } from './deckState'

const noop = () => {}

function renderPanel(state: Partial<DeckState>, handlers: Record<string, () => void> = {}) {
  return render(
    <DeckPanel
      deckId="a"
      state={{ ...initialDeckState, ...state }}
      volume={0.8}
      onPlay={handlers.onPlay ?? noop}
      onStop={handlers.onStop ?? noop}
      onSetPrompt={(handlers.onSetPrompt as (p: string) => void) ?? noop}
      onSetVolume={noop}
    />,
  )
}

describe('DeckPanel', () => {
  it('makes underruns visible, highlighted when above zero', () => {
    renderPanel({ connection: 'open', playing: true, underruns: 3 })
    const stat = screen.getByText('Underruns').parentElement!
    expect(stat).toHaveTextContent('3')
    expect(stat.className).toContain('ui-stat--danger')
  })

  it('shows the buffer level in seconds', () => {
    renderPanel({ connection: 'open', bufferedSeconds: 2.4 })
    expect(screen.getByText('2.4s')).toBeInTheDocument()
  })

  it('flags a generation speed below real time', () => {
    renderPanel({ connection: 'open', generationSpeed: 0.84 })
    const stat = screen.getByText('Gen speed').parentElement!
    expect(stat).toHaveTextContent('0.84×')
    expect(stat.className).toContain('ui-stat--danger')
  })

  it('disables transport until the deck is connected', () => {
    renderPanel({ connection: 'closed' })
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
  })

  it('starts playback from the play button', () => {
    const onPlay = vi.fn()
    renderPanel({ connection: 'open' }, { onPlay })
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(onPlay).toHaveBeenCalled()
  })

  it('stops playback from the stop button while playing', () => {
    const onStop = vi.fn()
    renderPanel({ connection: 'open', playing: true }, { onStop })
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(onStop).toHaveBeenCalled()
  })

  it('applies a trimmed prompt on Enter', () => {
    const onSetPrompt = vi.fn()
    renderPanel({ connection: 'open' }, { onSetPrompt: onSetPrompt as () => void })
    const input = screen.getByLabelText('Style prompt')
    fireEvent.change(input, { target: { value: '  warm disco funk  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSetPrompt).toHaveBeenCalledWith('warm disco funk')
  })

  it('announces worker errors', () => {
    renderPanel({ connection: 'open', error: 'generation failed; deck stopped' })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'generation failed; deck stopped',
    )
  })
})
