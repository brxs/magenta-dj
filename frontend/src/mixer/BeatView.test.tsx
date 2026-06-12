import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BeatView } from './BeatView'

describe('BeatView', () => {
  it('stacks both decks’ close-ups', () => {
    render(<BeatView getSourceA={() => null} getSourceB={() => null} />)
    expect(
      screen.getByRole('img', { name: 'Deck A close-up' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Deck B close-up' }),
    ).toBeInTheDocument()
  })

  it('turns the strips on their side in the vertical layout', () => {
    render(
      <BeatView vertical getSourceA={() => null} getSourceB={() => null} />,
    )
    const strip = screen.getByRole('img', { name: 'Deck A close-up' })
    expect(strip.className).toContain('ui-zoomstrip--vertical')
    // The canvas swaps its axes: time runs down the long side.
    expect(Number(strip.getAttribute('height'))).toBeGreaterThan(
      Number(strip.getAttribute('width')),
    )
  })
})
