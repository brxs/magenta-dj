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
})
