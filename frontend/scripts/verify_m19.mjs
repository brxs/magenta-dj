// M19 exit-criteria verification (docs/ROADMAP.md, ADR-0013): compose a
// track in the Media Explorer while deck A streams uninterrupted, load
// it onto deck B (the deck flips to playback with the track clock and
// overview), drive the transport and seek, then load the live stream
// back — all without a reload and with zero underruns on the live deck.
// The Magenta engine renders the track so the run needs no SA3 medium
// weights; the audible half lives in docs/m19-hardware-checklist.md.
// Run against a running backend (just run).
//
// Run: node scripts/verify_m19.mjs

import { chromium } from 'playwright'

const URL = 'http://127.0.0.1:8000/'

const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required'],
})

try {
  const page = await browser.newPage()
  const renderRequests = []
  page.on('request', (request) => {
    if (request.url().endsWith('/api/render')) {
      renderRequests.push(JSON.parse(request.postData()))
    }
  })
  await page.goto(URL)
  const deckA = page.locator('section[aria-label="Deck a"]')
  const deckB = page.locator('section[aria-label="Deck b"]')
  const explorer = page.locator('section[aria-label="Media explorer"]')
  for (const deck of [deckA, deckB]) {
    await deck.getByText('Connected', { exact: true }).waitFor({ timeout: 10_000 })
  }

  const underruns = (deck) =>
    deck.locator('.ui-stat', { hasText: 'Underruns' }).locator('.ui-stat__value')

  // ── Deck A streams throughout ───────────────────────────────────────
  await deckA.getByLabel('Style target').fill('driving techno, four on the floor')
  await deckA.getByRole('button', { name: 'Add' }).click()
  await deckA.getByText(/^Playing: /).waitFor({ timeout: 20_000 })
  await deckA.getByRole('button', { name: 'Play' }).click()
  await deckA.getByRole('button', { name: 'Stop', exact: true }).waitFor()
  await page.waitForTimeout(8_000) // settle past the prebuffer

  // ── Compose a track (Magenta — first use may carry the model load) ──
  await explorer.getByRole('button', { name: 'Generate' }).click()
  await explorer.getByLabel('Track prompt').fill('deep dub techno excursion')
  await explorer.getByLabel('Engine').selectOption('magenta')
  await explorer.getByLabel('Length').selectOption('30')
  await explorer.getByRole('button', { name: 'Compose' }).click()
  await explorer
    .getByText('deep dub techno excursion #1 — composing…')
    .waitFor({ timeout: 2_000 })
  await explorer
    .getByRole('button', { name: 'Load deep dub techno excursion #1 to deck B' })
    .waitFor({ timeout: 300_000 })
  const underrunsAfterCompose = (await underruns(deckA).textContent()).trim()
  console.log(
    `track composed while deck A streamed; underruns a=${underrunsAfterCompose}`,
  )

  // ── Deck B streams first: a load must hand over, not pause ──────────
  await deckB.getByLabel('Style target').fill('warm dub, deep bass')
  await deckB.getByRole('button', { name: 'Add' }).click()
  await deckB.getByText(/^Playing: /).waitFor({ timeout: 20_000 })
  await deckB.getByRole('button', { name: 'Play' }).click()
  await deckB.getByRole('button', { name: 'Stop', exact: true }).waitFor()
  await page.waitForTimeout(3_000)

  await explorer
    .getByRole('button', { name: 'Load deep dub techno excursion #1 to deck B' })
    .click()
  // The rolling stream hands straight to the track — no parked gap.
  await deckB.getByText('Track — playing').waitFor({ timeout: 10_000 })
  await deckB.getByText('deep dub techno excursion').waitFor()
  console.log('streaming deck kept playing through the track load')
  const overview = deckB.getByRole('slider', { name: 'Track overview b' })
  await overview.waitFor()
  const positionStat = deckB
    .locator('.ui-stat', { hasText: 'Position' })
    .locator('.ui-stat__value')
  await page.waitForTimeout(2_500)
  const playingPosition = (await positionStat.textContent()).trim()
  console.log(`playing: position advanced to ${playingPosition}`)
  await deckB.getByRole('button', { name: 'Stop', exact: true }).click()
  await deckB.getByText('Track — paused').waitFor({ timeout: 5_000 })

  // ── Seek lands the playhead where asked ─────────────────────────────
  await overview.focus()
  await overview.press('End')
  const atEnd = (await positionStat.textContent()).trim()
  await overview.press('Home')
  const atTop = (await positionStat.textContent()).trim()
  console.log(`seek: End → ${atEnd}, Home → ${atTop}`)

  // ── Back to the live stream, hands-off and no reload ────────────────
  // The track rolls again, so leaving must resume the stream by itself.
  await deckB.getByRole('button', { name: 'Play' }).click()
  await deckB.getByText('Track — playing').waitFor({ timeout: 5_000 })
  await explorer
    .getByRole('button', { name: 'Load Live stream to deck B' })
    .click()
  await deckB.getByLabel('Style target').waitFor({ timeout: 5_000 })
  await deckB
    .getByRole('button', { name: 'Stop', exact: true })
    .waitFor({ timeout: 10_000 })
  console.log('rolling track handed straight back to the stream')
  await page.waitForTimeout(4_000)
  const underrunsFinalA = (await underruns(deckA).textContent()).trim()
  const underrunsFinalB = (await underruns(deckB).textContent()).trim()
  console.log(
    `live stream restored without a reload; underruns a=${underrunsFinalA} b=${underrunsFinalB}`,
  )

  await page.screenshot({ path: 'm19-verification.png', fullPage: true })
  await deckA.getByRole('button', { name: 'Stop', exact: true }).click()
  await deckB.getByRole('button', { name: 'Stop', exact: true }).click()

  if (renderRequests.length !== 1) {
    throw new Error(`expected 1 render request, saw ${renderRequests.length}`)
  }
  if (renderRequests[0].seconds !== 30) {
    throw new Error(`the track request asked ${renderRequests[0].seconds}s, not 30`)
  }
  if (underrunsAfterCompose !== '0') {
    throw new Error('deck A underran while the track composed')
  }
  if (playingPosition === '0:00 / 0:30') {
    throw new Error('the playhead did not advance during playback')
  }
  if (!atEnd.startsWith('0:30')) {
    throw new Error(`End seek landed at "${atEnd}", not the track end`)
  }
  if (!atTop.startsWith('0:00')) {
    throw new Error(`Home seek landed at "${atTop}", not the top`)
  }
  if (underrunsFinalA !== '0' || underrunsFinalB !== '0') {
    throw new Error('a deck underran across the mode switches')
  }

  console.log('VERDICT: PASS (screenshot: m19-verification.png)')
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
