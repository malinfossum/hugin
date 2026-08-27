// Zero-dep CDP screenshot: node cdp-shot.mjs input.html output.png [width] [height]
// Recipe from ~/.claude/memory/tools/html-to-pdf.md (Brave persistent CDP host).
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [input, output, width = '1400', height = '900'] = process.argv.slice(2)
if (!input || !output) { console.error('usage: node cdp-shot.mjs in.html out.png [w] [h]'); process.exit(1) }

const brave = 'C:\\Program Files\\BraveSoftware\\Brave-Origin\\Application\\brave.exe'
const profile = mkdtempSync(join(tmpdir(), 'cdp-shot-'))
const proc = spawn(brave, [
  '--headless', '--disable-gpu', '--no-first-run', '--mute-audio',
  `--user-data-dir=${profile}`, '--remote-debugging-port=0',
  `--window-size=${width},${height}`, 'about:blank',
])

const wsUrl = await new Promise((resolve, reject) => {
  let buf = ''
  proc.stderr.on('data', (d) => {
    buf += d
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/)
    if (m) resolve(m[1])
  })
  proc.on('exit', () => reject(new Error('brave exited early:\n' + buf)))
  setTimeout(() => reject(new Error('timeout waiting for DevTools ws')), 20000)
})

const ws = new WebSocket(wsUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let id = 0
const pending = new Map()
const events = []
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
  else events.push(msg)
}
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const msgId = ++id
  pending.set(msgId, (m) => m.error ? reject(new Error(`${method}: ${JSON.stringify(m.error)}`)) : resolve(m.result))
  ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }))
})
const waitEvent = (method, sessionId) => new Promise((resolve) => {
  const check = () => {
    const i = events.findIndex((m) => m.method === method && m.sessionId === sessionId)
    if (i >= 0) { resolve(events[i]); return }
    setTimeout(check, 50)
  }
  check()
})

const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
await send('Page.enable', {}, sessionId)
await send('Emulation.setDeviceMetricsOverride', { width: +width, height: +height, deviceScaleFactor: 1, mobile: false }, sessionId)
await send('Page.navigate', { url: pathToFileURL(input).href }, sessionId)
await waitEvent('Page.loadEventFired', sessionId)
await new Promise((r) => setTimeout(r, 600))
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId)
writeFileSync(output, Buffer.from(shot.data, 'base64'))
proc.kill()
try { rmSync(profile, { recursive: true, force: true }) } catch {}
console.log('wrote', output)
process.exit(0)
