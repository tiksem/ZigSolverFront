/**
 * A fake bot host: the Kotlin runner's socket, with a poker game behind it.
 *
 *     node fakebot/server.js                       # http://localhost:8080
 *     node fakebot/server.js 8080 --speed 3 --seed 7
 *
 *   GET  /commands?mode=0&tableIndex=96782   -> "Indexes: 0,3,7,9", repeated
 *   GET  /commands?mode=0&tableIndex=N       -> a live table: a snapshot every
 *                                               time the hero is on the clock,
 *                                               log lines in between
 *   POST /checkScreenshot                    -> echoes the uploaded image back
 *   GET  /image/N                            -> table N's screen, as a PNG
 *   GET  /tables                             -> what is running, as JSON
 *
 * Unlike mock/server.js — which replays four fixed snapshots — this deals real
 * hands: cards, blinds, positions that move with the button, villains that act
 * to their own persona, streets, showdowns and stacks that carry over. It is
 * the bot host only; run the solver side with `node mock/server.js 8081 8000`
 * (its bot port moved out of the way) or point the app at the real API.
 *
 * Options
 *   --tables 0:6,3:2,7:9,9:9   table index : seat count (2..10)
 *   --speed 1                  clock multiplier; 3 is a brisk game
 *   --seed 12345               same seed, same cards
 *   --hero-delay 9000          ms the hero sits on a decision before playing it
 *   --max-flop-players 3       how wide a flop may be dealt; 0 lifts the cap.
 *                              ZigSolver serves up to 3 postflop, so a wider
 *                              field would only come back as a 400.
 *   --encrypt                  send every frame as base64 AES-256-CBC, the way
 *                              a host built with a hashSecret does
 *   --quiet                    do not print what goes out
 */

import http from 'node:http'
import { createTable } from './table.js'
import { makeRng } from './rng.js'
import { serveSocket, sealBytes } from './ws.js'
import { tableImage } from './png.js'

const INDEXES_TABLE_INDEX = 96782
const DEFAULT_TABLES = '0:6,3:2,7:9,9:8'

function parseArgs(argv) {
  const opts = {
    port: 8080,
    tables: DEFAULT_TABLES,
    speed: 1,
    seed: 12345,
    heroDelay: 9000,
    maxFlopPlayers: 3,
    quiet: false,
    encrypt: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--quiet') opts.quiet = true
    else if (arg === '--encrypt') opts.encrypt = true
    else if (arg === '--tables') opts.tables = argv[++i]
    else if (arg === '--speed') opts.speed = Number(argv[++i])
    else if (arg === '--seed') opts.seed = Number(argv[++i])
    else if (arg === '--hero-delay') opts.heroDelay = Number(argv[++i])
    else if (arg === '--max-flop-players') opts.maxFlopPlayers = Number(argv[++i])
    else if (/^\d+$/.test(arg)) opts.port = Number(arg)
    else throw new Error(`unknown argument ${arg}`)
  }
  if (!(opts.speed > 0)) throw new Error('--speed must be > 0')
  return opts
}

const opts = parseArgs(process.argv.slice(2))
const rng = makeRng(opts.seed)

const log = (index, text) => {
  if (opts.quiet) return
  const snapshot = /^\s*position\s*=/im.test(text)
  const first = text.split('\n')[0]
  console.log(
    snapshot
      ? `[${index}] -> snapshot (${text.split('\n\n').length} blocks) ${first.slice(0, 60)}…`
      : `[${index}] -> ${first}`,
  )
}

/** index -> table. Configured up front; unknown indexes are created on demand. */
const tables = new Map()
const layout = new Map()
for (const part of opts.tables.split(',').filter(Boolean)) {
  const [index, seats] = part.split(':').map(Number)
  if (!Number.isInteger(index) || !Number.isInteger(seats)) {
    throw new Error(`--tables wants index:seats pairs, got "${part}"`)
  }
  layout.set(index, seats)
}

function tableFor(index) {
  let table = tables.get(index)
  if (!table) {
    const seatCount = layout.get(index) || 6
    table = createTable({ index, seatCount, rng, opts, log })
    tables.set(index, table)
    if (!layout.has(index)) console.log(`[bot] table ${index} created on demand (6 seats)`)
  }
  return table
}

// --- http -------------------------------------------------------------------

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  cors(res)
  if (req.method === 'OPTIONS') return res.writeHead(204).end()

  if (req.method === 'POST' && url.pathname === '/checkScreenshot') {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      // Crude multipart scrape: hand the uploaded image straight back.
      const body = Buffer.concat(chunks)
      const start = body.indexOf(Buffer.from('\r\n\r\n', 'utf8'))
      const boundary = req.headers['content-type']?.split('boundary=')[1]
      let image = body.subarray(start + 4)
      if (boundary) {
        const end = image.indexOf(Buffer.from(`--${boundary}`, 'utf8'))
        if (end > 0) image = image.subarray(0, end - 2)
      }
      res.writeHead(200, { 'Content-Type': 'image/png' }).end(image)
    })
    return
  }

  // The table as it looks right now. The app asks for this when a /move comes
  // back an error — the refusal is almost always a misread, and the picture is
  // the only evidence of what was there to read — and forwards it to the API's
  // /screenError. Encrypted under --encrypt, the same as every frame.
  const image = /^\/image\/(\d+)$/.exec(url.pathname)
  if (req.method === 'GET' && image) {
    const png = tableImage(Number(image[1]))
    if (!opts.quiet) console.log(`[${image[1]}] -> screenshot (${png.length} bytes)`)
    const body = opts.encrypt ? sealBytes(png) : png
    return res
      .writeHead(200, {
        'Content-Type': opts.encrypt ? 'application/octet-stream' : 'image/png',
        'Content-Length': body.length,
      })
      .end(body)
  }

  if (req.method === 'GET' && url.pathname === '/tables') {
    return res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        indexesTableIndex: INDEXES_TABLE_INDEX,
        speed: opts.speed,
        seed: opts.seed,
        tables: [...layout].map(([index, seats]) => ({
          index,
          seats,
          running: !!tables.get(index),
          clients: tables.get(index)?.clients ?? 0,
        })),
      }),
    )
  }

  if (req.method === 'GET' && url.pathname === '/') {
    return res
      .writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      .end(
        `fake bot host\n\n` +
          `ws  /commands?mode=0&tableIndex=${INDEXES_TABLE_INDEX}  the running-table list\n` +
          `ws  /commands?mode=0&tableIndex=N       a live table\n` +
          `GET /image/N                            table N's screen, as a PNG\n` +
          `GET /tables                             what is running\n`,
      )
  }

  res.writeHead(404).end('not found')
})

// --- the socket -------------------------------------------------------------

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  if (url.pathname !== '/commands') return socket.destroy()

  const mode = Number(url.searchParams.get('mode') || 0)
  const index = Number(url.searchParams.get('tableIndex') || 0)
  console.log(`[bot] client on mode=${mode} tableIndex=${index}`)

  if (index === INDEXES_TABLE_INDEX) {
    const list = () => `Indexes: ${[...layout.keys()].join(',')}`
    const send = serveSocket(req, socket, {
      onMessage: (m) => console.log(`[bot] <- ${m}`),
      onClose: () => clearInterval(timer),
      encrypt: opts.encrypt,
    })
    send(list())
    const timer = setInterval(() => send(list()), 8000)
    return
  }

  const table = tableFor(index)
  const send = serveSocket(req, socket, {
    onMessage: (m) => {
      console.log(`[${index}] <- ${m}`)
      table.command(m, send)
    },
    onClose: () => table.detach(send),
    encrypt: opts.encrypt,
  })
  table.attach(send)
})

server.listen(opts.port, () => {
  console.log(`[bot] http://localhost:${opts.port}`)
  console.log(
    `[bot] tables ${[...layout].map(([i, s]) => `${i} (${s} seats)`).join(', ')} · ` +
      `speed ${opts.speed}x · seed ${opts.seed} · hero delay ${opts.heroDelay}ms`,
  )
})
