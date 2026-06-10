// M5 exit-criteria verification (docs/ROADMAP.md): record a mix to WAV that
// matches what was heard, and close/reopen the app picking up previous
// settings. Run against a running backend (just run).
//
// Run: node scripts/verify_m5.mjs            (default 30s recording)
//      M5_RECORD_SECONDS=300 node scripts/verify_m5.mjs   (5-minute run)

import { readFile } from 'node:fs/promises'

import { chromium } from 'playwright'

const URL = 'http://127.0.0.1:8000/'
const RECORD_SECONDS = Number(process.env.M5_RECORD_SECONDS ?? 30)
const TARGETS = ['warm disco funk', 'dark minimal techno']

const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required'],
})

try {
  const page = await browser.newPage()
  await page.goto(URL)
  const deck = page.locator('section[aria-label="Deck a"]')
  await deck.getByText('Connected', { exact: true }).waitFor({ timeout: 10_000 })

  for (const target of TARGETS) {
    await deck.getByLabel('Style target').fill(target)
    await deck.getByRole('button', { name: 'Add' }).click()
  }
  await deck.getByText(/^Playing: /).waitFor({ timeout: 20_000 })
  await deck.getByRole('button', { name: 'Play' }).click()
  await deck.getByRole('button', { name: 'Stop', exact: true }).waitFor()
  await page.waitForTimeout(5_000) // let the stream settle past prebuffer

  // --- Recording ---
  await page.getByRole('button', { name: 'Record' }).click()
  await page.getByText(/^REC /).waitFor({ timeout: 5_000 })
  console.log(`recording: started, holding for ${RECORD_SECONDS}s`)
  await page.waitForTimeout(RECORD_SECONDS * 1000)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Stop recording' }).click()
  const download = await downloadPromise
  const path = await download.path()
  const wav = await readFile(path)

  const ascii = (offset, length) => wav.subarray(offset, offset + length).toString('ascii')
  const channels = wav.readUInt16LE(22)
  const sampleRate = wav.readUInt32LE(24)
  const dataBytes = wav.readUInt32LE(40)
  const seconds = dataBytes / (sampleRate * channels * 2)
  let sumSquares = 0
  const samples = dataBytes / 2
  for (let i = 0; i < samples; i++) {
    const value = wav.readInt16LE(44 + i * 2) / 32768
    sumSquares += value * value
  }
  const rms = Math.sqrt(sumSquares / samples)
  console.log(
    `wav: ${ascii(0, 4)}/${ascii(8, 4)} ${channels}ch ${sampleRate}Hz ` +
      `${seconds.toFixed(1)}s rms=${rms.toFixed(4)} (${download.suggestedFilename()})`,
  )
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') throw new Error('not a WAV file')
  if (channels !== 2 || sampleRate !== 48_000) throw new Error('wrong format')
  if (Math.abs(seconds - RECORD_SECONDS) > RECORD_SECONDS * 0.15 + 2) {
    throw new Error(`duration ${seconds.toFixed(1)}s != ~${RECORD_SECONDS}s recorded`)
  }
  if (rms < 0.005) throw new Error(`recording is silent (rms ${rms.toFixed(5)})`)

  // --- Persistence across reload ---
  await page.getByLabel('Crossfade').fill('0.8')
  const volumeBefore = '0.65'
  const channelA = page.getByRole('group', { name: 'Channel a' })
  await channelA.getByLabel('Volume').fill(volumeBefore)
  await page.waitForTimeout(300)
  await page.reload()

  await deck.getByText('Connected', { exact: true }).waitFor({ timeout: 10_000 })
  for (const target of TARGETS) {
    await deck
      .getByRole('button', { name: `Remove ${target}` })
      .waitFor({ timeout: 5_000 })
  }
  await deck.getByText(/^Playing: /).waitFor({ timeout: 10_000 })
  if ((await page.getByLabel('Crossfade').inputValue()) !== '0.8') {
    throw new Error('crossfade not restored after reload')
  }
  if ((await channelA.getByLabel('Volume').inputValue()) !== volumeBefore) {
    throw new Error('deck volume not restored after reload')
  }
  console.log('persistence: targets, style, crossfade, volume restored after reload')

  // --- Focus shortcuts ---
  await page.keyboard.press('x')
  const focusedShortcut = await page.evaluate(
    () => document.activeElement?.getAttribute('data-shortcut'),
  )
  if (focusedShortcut !== 'crossfade') {
    throw new Error(`shortcut x focused ${focusedShortcut}, not the crossfader`)
  }
  await page.keyboard.press('Escape')
  console.log('shortcuts: x focuses the crossfader')

  console.log('VERDICT: PASS')
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
