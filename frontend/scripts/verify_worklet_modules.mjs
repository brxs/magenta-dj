// Loads the built worklet module graph in real Chromium — jsdom can't
// execute AudioWorklet code, so a broken sibling import (crusher or
// loop-capture kernel) would otherwise only surface at runtime.
// Serves dist/ itself; run via `just verify-worklets` (or directly from
// frontend/ after a build).

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

import { chromium } from 'playwright'

const DIST = new URL('../dist', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const server = createServer((request, response) => {
  const path = normalize(request.url === '/' ? '/index.html' : request.url)
  readFile(join(DIST, path))
    .then((body) => {
      response.setHeader('Content-Type', TYPES[extname(path)] ?? 'application/octet-stream')
      response.end(body)
    })
    .catch(() => {
      response.statusCode = 404
      response.end()
    })
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address()

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${port}/`)
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
  server.close()
}
