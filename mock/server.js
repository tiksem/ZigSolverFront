/**
 * Dev-only stand-ins for the two hosts: `node mock/server.js [botPort] [apiPort]`.
 *
 * Bot host (default 8080)
 *   GET  /commands?mode=0&tableIndex=96782   -> "Indexes: 0,3,7"
 *   GET  /commands?mode=0&tableIndex=N       -> a table snapshot in /move body
 *                                               format, then status lines
 *   POST /checkScreenshot                    -> echoes the uploaded image back
 *
 * ZigSolver API (default 8000)
 *   POST /move                               -> a /move answer, after a delay
 *                                               so cancellation is observable
 *   GET  /health                             -> the health payload
 *
 * Both send CORS headers, which the real API does not — see the README.
 * No dependencies: the WebSocket handshake and text framing are done by hand.
 */
import http from 'node:http'
import crypto from 'node:crypto'

const BOT_PORT = Number(process.argv[2] || 8080)
const API_PORT = Number(process.argv[3] || 8000)
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const INDEXES_TABLE_INDEX = 96782
const TABLES = [0, 1, 3, 7, 9]

/** How long a fake solve takes, so an aborted one is visible in the log. */
const SOLVE_MS = 2500

const SNAPSHOT = `This is online poker tournament, 781 players left, 78.9BB average stack, 92 players paid. Total pot 21.5BB

K Barsukov
position=UTG
fold
VPIP=25%
PFR=19%
3BET=8%
stack=147.8BB

Dmitri O
position=LJ
raise 2.5BB
VPIP=31%
PFR=24%
3BET=11%
ATS=44%
stack=96.4BB

*me*
position=CO
call
hand=Q♠J♠
stack=88.2BB

Nikolai V
position=BTN
fold
VPIP=19%
PFR=14%
stack=54.0BB

Sasha M
position=SB
fold
VPIP=42%
PFR=12%
stack=61.7BB

Big Stack Bob
position=BB
call
VPIP=38%
PFR=12%
3BET=6%
AF=1.64
WTSD=41%
stack=203.5BB

Board: 4♥ T♦ 8♣

Big Stack Bob
position=BB
check
stack=201.0BB

Dmitri O
position=LJ
bet 4.1BB
stack=91.8BB

*me*
position=CO
waiting
hand=Q♠J♠
stack=85.7BB
`

/**
 * Table 1: a 6-max pot that is heads-up FROM the flop — the one shape the
 * Exploit regime covers, so this is the table to point at when working on it
 * (and on Manual, which only raises its question where the choice is real).
 */
const SNAPSHOT_HU_FLOP = `This is online poker tournament, 412 players left, 61.0BB average stack, 45 players paid. Total pot 12.4BB

K Barsukov
position=UTG
fold
VPIP=25%
PFR=19%
stack=147.8BB

Dmitri O
position=MP
fold
VPIP=31%
PFR=24%
stack=96.4BB

*me*
position=CO
raise 2.3BB
VPIP=24%
PFR=20%
3BET=9%
ATS=42%
hand=A♦J♦
stack=60.0BB

Nikolai V
position=BTN
fold
VPIP=19%
PFR=14%
stack=54.0BB

Sasha M
position=SB
fold
VPIP=42%
PFR=12%
stack=61.7BB

Big Stack Bob
position=BB
call
VPIP=41%
PFR=11%
3BET=4%
ATS=20%
Flop Fold to C-BET=45%
WTSD=38%
AF=1.0
statHands=1500
stack=60.0BB

Board: K♠ 8♦ 3♦

Big Stack Bob
position=BB
check
stack=57.7BB

*me*
position=CO
bet 2.1BB
hand=A♦J♦
stack=55.6BB

Big Stack Bob
position=BB
call
stack=55.6BB

Board: K♠ 8♦ 3♦ 7♣

Big Stack Bob
position=BB
check
stack=55.6BB

*me*
position=CO
waiting
hand=A♦J♦
stack=55.6BB
`

/** Table 3: heads-up preflop — the chart path, which has no GTO twin. */
const SNAPSHOT_HU = `Total pot 1.5BB

Anna K
position=SB
raise 3BB
VPIP=49%
PFR=31%
3BET=14%
stack=37.2BB

*me*
position=BB
waiting
hand=A♠K♦
stack=52.8BB
`

/** Table 9: a full 9-max ring, the largest table the client deals. */
const SNAPSHOT_9MAX = `This is online poker tournament, 214 players left, 41.2BB average stack, 40 players paid. Total pot 12.5BB

Ivan P
position=UTG
fold
VPIP=21%
PFR=15%
stack=38.4BB

Marta L
position=UTG+1
fold
VPIP=33%
PFR=11%
stack=52.1BB

Duy N
position=UTG+2
call
VPIP=44%
PFR=13%
3BET=4%
stack=27.9BB

老虎
position=LJ
fold
VPIP=18%
PFR=14%
stack=61.3BB

Grzegorz W
position=HJ
raise 3BB
VPIP=27%
PFR=21%
3BET=9%
ATS=48%
stack=73.6BB

*me*
position=CO
call
hand=8♦8♣
stack=45.2BB

Ana Sofia
position=BTN
fold
VPIP=30%
PFR=19%
stack=19.8BB

Kenji T
position=SB
fold
VPIP=25%
PFR=16%
stack=88.0BB

Big Stack Bob
position=BB
call
VPIP=38%
PFR=12%
AF=1.64
stack=140.5BB

Board: 8♠ K♦ 2♥

Big Stack Bob
position=BB
check
stack=140.5BB

Duy N
position=UTG+2
check
stack=27.9BB

Grzegorz W
position=HJ
bet 6BB
stack=67.6BB

*me*
position=CO
waiting
hand=8♦8♣
stack=45.2BB
`

/** Table 7 sends a body the endpoint refuses, to exercise the error path. */
const SNAPSHOT_BAD = `Total pot 1.5BB

Anna K
position=SB
waiting
VPIP=49%
stack=37.2BB

*me*
position=BB
call
hand=A♠K♦
stack=52.8BB
`

/**
 * The heads-up flop ladder, cheapest budget last — the real balancer runs the
 * strongest flow that fits `maxSolveTime`, so keying off the budget is what
 * exercises every branch of the panel's flow copy from the settings sheet.
 */
const flowFor = (budget) => {
  const s = Number(budget) || 0
  if (s >= 15) return 'exact'
  if (s >= 8) return 'exact-reduced'
  if (s >= 4) return 'exact-clustered'
  return 'net'
}

/**
 * One answer per call, under the request's `regime`.
 *
 * GTO is a distribution to mix at; exploit is a ranking by EV whose top row is
 * the move, so `probability` is 1 there and 0 everywhere else. The mock also
 * models the fallback: exploit is heads-up postflop only, so a request for it
 * on a spot this mock is pretending is preflop comes back as GTO with
 * `regimeRequested` still saying what was asked.
 */
const GTO_ACTIONS = [
  { action: 'fold', probability: 0.1904 },
  { action: 'call(4.1BB)', probability: 0.5218 },
  { action: 'raise 60%(14.2BB)', probability: 0.2451 },
  { action: 'all-in(85.7BB)', probability: 0.0427 },
]

// Ranked by EV, best first — the calculator's own output order.
const EXPLOIT_ACTIONS = [
  { action: 'raise 60%(14.2BB)', probability: 1, evBB: 6.412, evPot: 0.298, support: 0.3502 },
  { action: 'call(4.1BB)', probability: 0, evBB: 4.883, evPot: 0.227, support: 1.0 },
  { action: 'fold', probability: 0, evBB: 0.0, evPot: 0.0, support: 1.0 },
  { action: 'all-in(85.7BB)', probability: 0, evBB: -3.117, evPot: -0.145, support: 0.2525 },
]

/**
 * The street the body actually ends on, from its last `Board:` line.
 *
 * The canned answers are fixed, but the street they claim must not be: a
 * snapshot showing a turn and an answer labelled "flop" is a trap for whoever
 * works on the panel next.
 */
const streetOf = (body) => {
  const lines = String(body || '').match(/^\s*board\s*:?(.*)$/gim) || []
  if (!lines.length) return 'preflop'
  const cards = (lines[lines.length - 1].split(':')[1] || '').trim().split(/[\s,]+/).filter(Boolean)
  return ['preflop', 'preflop', 'preflop', 'flop', 'turn', 'river'][cards.length] || 'flop'
}

const answerFor = (req) => {
  const asked = req.regime === 'exploit' ? 'exploit' : 'gto'
  const flow = flowFor(req.maxSolveTime)
  const street = streetOf(req.body)
  if (asked === 'exploit') {
    return {
      actions: EXPLOIT_ACTIONS,
      regime: 'exploit',
      regimeRequested: 'exploit',
      solver: 'exploit',
      street,
      hand: 'QsJs',
      responseTime: +(SOLVE_MS / 1000).toFixed(3),
      meta: {
        flow: 'expectimax',
        board: '4h Td 8c',
        seats: { ip: "'*me*' (CO)", oop: "'Dmitri O' (LJ)" },
        potBB: 21.5,
        solveSeconds: SOLVE_MS / 1000,
        chance: { t: 'bucket', r: 'bucket' },
        leaf: 'model',
        removal: 'root',
        menuBets: [33, 50, 75],
        menuRaises: [75, 150],
        nodes: 8270,
        predicts: 16,
        villainStats: ['vpip', 'pfr', 'three_bet', 'cbet_f'],
        villainStatHands: 1500,
        warnings: [
          'raise sizes come from the measured population raise-TO distribution — no ' +
            'raise-size model exists',
          "villain's raise mass is scored as a call at the raise cap (max_raises=1)",
        ],
      },
    }
  }
  return {
    actions: GTO_ACTIONS,
    regime: 'gto',
    regimeRequested: asked,
    solver: flow === 'net' ? 'net' : 'exact',
    street,
    hand: 'QsJs',
    responseTime: +(SOLVE_MS / 1000).toFixed(3),
    meta: {
      flow,
      cached: null,
      board: '4h Td 8c',
      actingSeat: 'ip',
      seats: { ip: "'*me*' (CO)", oop: "'Dmitri O' (LJ)" },
      potBB: 21.5,
      toCallBB: 4.1,
      solveSeconds: SOLVE_MS / 1000,
      predictedSolveSeconds: 2.04,
      handDecisions: {
        fold: 'give_up_fold',
        'call(4.1BB)': 'bluff_catch',
        'raise 60%(14.2BB)': 'semi_bluff',
        'all-in(85.7BB)': 'bluff_raise',
      },
      warnings: [],
    },
  }
}

const ANSWER_CHART = {
  actions: [
    { action: 'fold', probability: 0.0 },
    { action: 'call', probability: 0.1832 },
    { action: 'raise 11.4BB', probability: 0.8168 },
  ],
  regime: 'gto',
  regimeRequested: 'gto',
  solver: 'chart',
  street: 'preflop',
  hand: 'AsKd',
  responseTime: 0.004,
  meta: {
    node: 'bb_vs_sb_open',
    seat: 'BB',
    handClass: 'AKo',
    potBB: 4.5,
    toCallBB: 2,
    effectiveBB: 37.2,
    raisesBefore: 1,
    callersBefore: 0,
    aggressor: 'SB',
    adjustments: { openWidth: '1.42x the SB baseline (ATS 49)' },
    raiseWeightPct: 81.68,
    warnings: [],
  },
}

// --- minimal websocket ------------------------------------------------------

function accept(key) {
  return crypto.createHash('sha1').update(key + GUID).digest('base64')
}

function frame(text) {
  const payload = Buffer.from(text, 'utf8')
  const len = payload.length
  let header
  if (len < 126) {
    header = Buffer.from([0x81, len])
  } else if (len < 65536) {
    header = Buffer.alloc(4)
    header[0] = 0x81
    header[1] = 126
    header.writeUInt16BE(len, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x81
    header[1] = 127
    header.writeBigUInt64BE(BigInt(len), 2)
  }
  return Buffer.concat([header, payload])
}

/** Pull complete text frames out of a client buffer (masked, per spec). */
function readFrames(buf) {
  const out = []
  let off = 0
  while (buf.length - off >= 2) {
    const opcode = buf[off] & 0x0f
    const masked = (buf[off + 1] & 0x80) !== 0
    let len = buf[off + 1] & 0x7f
    let pos = off + 2
    if (len === 126) {
      if (buf.length < pos + 2) break
      len = buf.readUInt16BE(pos)
      pos += 2
    } else if (len === 127) {
      if (buf.length < pos + 8) break
      len = Number(buf.readBigUInt64BE(pos))
      pos += 8
    }
    const maskKey = masked ? buf.slice(pos, pos + 4) : null
    if (masked) pos += 4
    if (buf.length < pos + len) break
    const payload = buf.slice(pos, pos + len)
    if (maskKey) for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4]
    if (opcode === 0x1) out.push(payload.toString('utf8'))
    if (opcode === 0x8) out.push(null) // close
    off = pos + len
  }
  return { messages: out, rest: buf.slice(off) }
}

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
}

// --- bot host ---------------------------------------------------------------

const bot = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  cors(res)
  if (req.method === 'OPTIONS') return res.writeHead(204).end()

  if (req.method === 'POST' && url.pathname === '/checkScreenshot') {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      // Crude multipart scrape: echo the uploaded image straight back.
      const body = Buffer.concat(chunks)
      const start = body.indexOf(Buffer.from('\r\n\r\n', 'utf8'))
      const boundary = req.headers['content-type']?.split('boundary=')[1]
      let image = body.slice(start + 4)
      if (boundary) {
        const end = image.indexOf(Buffer.from(`--${boundary}`, 'utf8'))
        if (end > 0) image = image.slice(0, end - 2)
      }
      res.writeHead(200, { 'Content-Type': 'image/png' }).end(image)
    })
    return
  }
  res.writeHead(404).end('not found')
})

bot.on('upgrade', (req, socket) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  if (url.pathname !== '/commands') return socket.destroy()
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept(req.headers['sec-websocket-key'])}\r\n\r\n`,
  )

  const mode = Number(url.searchParams.get('mode') || 0)
  const tableIndex = Number(url.searchParams.get('tableIndex') || 0)
  const send = (text) => socket.writable && socket.write(frame(text))
  const timers = []
  console.log(`[bot] client on mode=${mode} tableIndex=${tableIndex}`)

  const snapshotFor = (i) =>
    i === 0
      ? SNAPSHOT
      : i === 1
        ? SNAPSHOT_HU_FLOP
        : i === 3
          ? SNAPSHOT_HU
          : i === 9
            ? SNAPSHOT_9MAX
            : SNAPSHOT_BAD

  if (tableIndex === INDEXES_TABLE_INDEX) {
    send(`Indexes: ${TABLES.join(',')}`)
    timers.push(setInterval(() => send(`Indexes: ${TABLES.join(',')}`), 8000))
  } else if (mode === 0) {
    timers.push(setTimeout(() => send('New hand #4711'), 300))
    timers.push(setTimeout(() => send(snapshotFor(tableIndex)), 700))
    timers.push(setTimeout(() => send('Hood: reading stats'), 1400))
  }

  let buf = Buffer.alloc(0)
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk])
    const { messages, rest } = readFrames(buf)
    buf = rest
    for (const m of messages) {
      if (m === null) return socket.end()
      console.log(`[bot] <- ${m}`)
      if (m === 'read') setTimeout(() => send(snapshotFor(tableIndex)), 200)
      else if (m === 'bot') send('Bot toggled')
      else if (m === 'pause') send('Paused')
      else if (m === 'allbot') send('All bots enabled')
      else if (m !== 'autoenablebot') send(`Profile set to ${m}`)
    }
  })
  const stop = () => timers.forEach((t) => (clearTimeout(t), clearInterval(t)))
  socket.on('close', stop)
  socket.on('error', stop)
})

// --- ZigSolver API ----------------------------------------------------------

let solveNo = 0
/** requestId -> {kill()} for the solves currently "running" (api/cancel.py). */
const inFlight = new Map()

const apiServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  cors(res)
  if (req.method === 'OPTIONS') return res.writeHead(204).end()

  if (req.method === 'POST' && url.pathname === '/cancel') {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      let body = {}
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        /* answered as not-found below */
      }
      const job = inFlight.get(body.requestId)
      if (job) job.kill('cancelled')
      console.log(
        `[api] ${job ? 'XX cancelled' : '-- unknown'} requestId=${body.requestId}`,
      )
      res
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ requestId: body.requestId, found: !!job, killed: job ? 1 : 0 }))
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    return res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        status: 'ok',
        cellsPerMs: 812,
        libVersion: 'mock-1.0',
        netEnabled: true,
        netDevice: 'mps',
        flopSolveDevice: 'cpu (mock)',
        // Which /move regimes this build can serve. A box whose behavioural
        // models are missing reports ["gto"] only.
        moveRegimes: ['gto', 'exploit'],
      }),
    )
  }

  if (req.method === 'POST' && url.pathname === '/move') {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      let body = {}
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        /* fall through to the 400 below */
      }
      const id = ++solveNo
      const label = `#${id} handId=${body.handId || '-'} regime=${
        body.regime || 'gto'
      } budget=${body.maxSolveTime || '-'}s`
      console.log(`[api] -> solve ${label}`)

      // The point of the delay: a snapshot that arrives mid-solve should cancel
      // this request, which shows up here as "cancelled" / "client gone".
      let done = false
      const finish = (why) => {
        if (done) return false
        done = true
        clearTimeout(timer)
        if (body.requestId) inFlight.delete(body.requestId)
        if (why) {
          console.log(`[api] XX ${why} ${label}`)
          if (!res.writableEnded) res.writeHead(499).end()
        }
        return true
      }
      if (body.requestId) {
        // A re-used id supersedes the older call, exactly like api/cancel.py.
        inFlight.get(body.requestId)?.kill('superseded')
        inFlight.set(body.requestId, { kill: (why) => finish(why) })
      }
      // Once the body has been read Node reports a client abort on the RESPONSE
      // as 'close', not on the request as 'aborted'.
      res.on('close', () => {
        if (!res.writableEnded) finish('client gone')
      })

      const timer = setTimeout(() => {
        if (done) return
        done = true
        if (body.requestId) inFlight.delete(body.requestId)
        if (!body.body || !/position\s*=/i.test(body.body)) {
          console.log(`[api] <- 400 ${label}`)
          return res.writeHead(400, { 'Content-Type': 'application/json' }).end(
            JSON.stringify({ detail: 'no player blocks found in the body' }),
          )
        }
        // The real endpoint only answers when the body ends on the hero's
        // decision; table 7 sends one that ends on somebody else's.
        const blocks = body.body.trim().split(/\n\s*\n/)
        if (!/^\s*\*me\*/.test(blocks[blocks.length - 1] || '')) {
          console.log(`[api] <- 400 ${label}`)
          return res.writeHead(400, { 'Content-Type': 'application/json' }).end(
            JSON.stringify({
              detail:
                "the body does not end on a hero decision: it is 'Anna K' (SB)'s turn, " +
                "not *me*'s",
            }),
          )
        }
        const answer = /Board:/.test(body.body) ? answerFor(body) : ANSWER_CHART
        console.log(`[api] <- 200 ${label}`)
        res
          .writeHead(200, { 'Content-Type': 'application/json' })
          .end(JSON.stringify(answer))
      }, SOLVE_MS)
    })
    return
  }
  res.writeHead(404).end('not found')
})

bot.listen(BOT_PORT, () => console.log(`[bot] http://localhost:${BOT_PORT}`))
apiServer.listen(API_PORT, () => console.log(`[api] http://localhost:${API_PORT}`))
