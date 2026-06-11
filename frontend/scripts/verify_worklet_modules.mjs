// Loads the built worklet module graph in real Chromium — jsdom can't
// execute AudioWorklet code, so a broken sibling import (crusher or
// loop-capture kernel) would otherwise only surface at runtime.
// Usage: serve dist first (python3 -m http.server 4173 -d dist), then
// node scripts/verify_worklet_modules.mjs

import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173'

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.goto(BASE)
  const result = await page.evaluate(async () => {
    const context = new AudioContext()
    try {
      await context.audioWorklet.addModule('/player-worklet.js')
      // Constructing proves each processor registered.
      new AudioWorkletNode(context, 'pcm-player', {
        numberOfOutputs: 1,
        outputChannelCount: [2],
      })
      new AudioWorkletNode(context, 'pcm-recorder', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
      })
      new AudioWorkletNode(context, 'bit-crusher')
      return 'ok'
    } catch (error) {
      return String(error)
    } finally {
      void context.close()
    }
  })
  if (result !== 'ok') {
    console.error(`worklet module load FAILED: ${result}`)
    process.exitCode = 1
  } else {
    console.log('worklet module graph loads, all processors register: ok')
  }
} finally {
  await browser.close()
}
