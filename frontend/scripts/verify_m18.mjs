// M18 exit-criteria verification (docs/ROADMAP.md): typing a prompt
// fills a pad slot while both decks keep streaming with zero underruns;
// the pending → ready story is honest; a musical loop's request is
// whole bars against the deck's locked BPM (asserted by intercepting
// /api/generate); and the generated loop engages the freeze-loop path
// (the deck reports Frozen) while a one-shot overlays without touching
// it. The audible half lives in docs/m18-checklist.md. Run against a
// running backend (just run) with the sa3_mlx checkout installed.
//
// Run: node scripts/verify_m18.mjs

import { chromium } from 'playwright'

const URL = 'http://127.0.0.1:8000/'

const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required'],
})

try {
  const page = await browser.newPage()
  const generateRequests = []
  page.on('request', (request) => {
    if (request.url().endsWith('/api/generate')) {
      generateRequests.push(JSON.parse(request.postData()))
    }
  })
  await page.goto(URL)
  const deckA = page.locator('section[aria-label="Deck a"]')
  const deckB = page.locator('section[aria-label="Deck b"]')
  for (const deck of [deckA, deckB]) {
    await deck.getByText('Connected', { exact: true }).waitFor({ timeout: 10_000 })
  }

  async function startDeck(deck, style) {
    await deck.getByLabel('Style target').fill(style)
    await deck.getByRole('button', { name: 'Add' }).click()
    await deck.getByText(/^Playing: /).waitFor({ timeout: 20_000 })
    await deck.getByRole('button', { name: 'Play' }).click()
    await deck.getByRole('button', { name: 'Stop', exact: true }).waitFor()
  }

  const underruns = (deck) =>
    deck.locator('.ui-stat', { hasText: 'Underruns' }).locator('.ui-stat__value')

  async function generate(deck, prompt, kind, padName) {
    await deck.getByLabel('Generate prompt').fill(prompt)
    await deck.getByLabel('Type').selectOption(kind)
    await deck.getByRole('button', { name: 'Generate', exact: true }).click()
    // Honesty first: the slot must announce the flight, then the result.
    await deck
      .getByRole('button', { name: `${padName} — generating` })
      .waitFor({ timeout: 2_000 })
    await deck
      .getByRole('button', { name: padName, exact: true })
      .waitFor({ timeout: 60_000 })
  }

  // ── Both decks streaming, then generate under load ─────────────────
  await startDeck(deckA, 'driving techno, four on the floor, 126 BPM')
  await startDeck(deckB, 'warm dub, deep bass')
  await page.waitForTimeout(8_000) // settle past the prebuffer

  await generate(deckA, 'air horn blast', 'sfx', 'Loop slot 1')
  console.log('sfx one-shot: pending → ready, slot 1 lit')

  // The loop needs the locked tempo; the techno deck acquires within
  // the gate's three confident ticks.
  await page.waitForFunction(
    () => {
      const stats = [...document.querySelectorAll('.ui-stat')]
      const bpm = stats.find((stat) => stat.textContent.includes('BPM'))
      return bpm && !bpm.textContent.includes('—')
    },
    { timeout: 30_000 },
  )
  const bpmText = await deckA
    .locator('.ui-stat', { hasText: 'BPM' })
    .locator('.ui-stat__value')
    .textContent()
  const bpm = Number(bpmText)
  await generate(deckA, 'rolling techno percussion loop', 'loop', 'Loop slot 2')
  console.log(`musical loop generated against a locked ${bpm} BPM`)

  // ── The request was shaped by the tempo ────────────────────────────
  const loopRequest = generateRequests.at(-1)
  const bars = ((loopRequest.seconds - 0.03) * bpm) / 60 / 4
  console.log(
    `loop request: ${loopRequest.seconds.toFixed(3)}s = ${bars.toFixed(4)} bars, prompt "${loopRequest.prompt}"`,
  )

  // ── Playback semantics: loop replaces, one-shot overlays ───────────
  await deckA.getByRole('button', { name: 'Loop slot 2', exact: true }).click()
  await deckA.getByText('Frozen — looping').waitFor({ timeout: 5_000 })
  await deckA.getByRole('button', { name: 'Loop slot 1', exact: true }).click()
  await page.waitForTimeout(1_000)
  const stillFrozen = await deckA.getByText('Frozen — looping').isVisible()
  await deckA.getByRole('button', { name: 'Loop slot 2', exact: true }).click()
  await page.waitForTimeout(500)

  // ── Stream health: nobody skipped a beat ───────────────────────────
  const underrunsA = (await underruns(deckA).textContent()).trim()
  const underrunsB = (await underruns(deckB).textContent()).trim()
  console.log(`underruns through it all: deck a=${underrunsA} deck b=${underrunsB}`)

  await page.screenshot({ path: 'm18-verification.png', fullPage: true })
  await deckA.getByRole('button', { name: 'Stop', exact: true }).click()
  await deckB.getByRole('button', { name: 'Stop', exact: true }).click()

  if (generateRequests.length !== 2) {
    throw new Error(`expected 2 generate requests, saw ${generateRequests.length}`)
  }
  if (generateRequests[0].kind !== 'sfx') {
    throw new Error('the one-shot request did not use the sfx model')
  }
  if (loopRequest.kind !== 'music') {
    throw new Error('the loop request did not use the music model')
  }
  if (!loopRequest.prompt.includes(`${Math.round(bpm)} BPM`)) {
    throw new Error(`the loop prompt lost the tempo: "${loopRequest.prompt}"`)
  }
  if (Math.abs(bars - Math.round(bars)) > 1e-6) {
    throw new Error(`loop request is ${bars} bars — not on the bar grid`)
  }
  if (!stillFrozen) {
    throw new Error('firing the one-shot disturbed the active loop (no overlay)')
  }
  if (underrunsA !== '0' || underrunsB !== '0') {
    throw new Error('a deck underran while generating')
  }

  console.log('VERDICT: PASS (screenshot: m18-verification.png)')
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
