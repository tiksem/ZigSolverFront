/**
 * Parser for the /move `body` — the poker client's textual table snapshot,
 * which is exactly what the mode=0 socket pushes for each decision.
 *
 * Mirrors api/handhistory.py of ZigSolver: an optional tournament header, then
 * one block per action in acting order, with `Board: 4♥ T♦ 8♣` lines
 * separating the streets (each carrying the full board so far).
 *
 *     K Barsukov          <- player name; the hero is "*me*"
 *     position=CO         <- UTG UTG+1 UTG+2 LJ MP HJ CO BTN SB BB
 *     call                <- fold|check|call|bet 4.1BB|raise 2.0BB|all in 41.3BB
 *     VPIP=25%            <- HUD stats, kept verbatim
 *     stack=147.8BB       <- chips BEHIND right now
 *
 * The Python side is strict about sequence (it has to solve the spot); here we
 * only need to *render* it, so parsing is deliberately forgiving — anything
 * unreadable lands in `warnings` and the rest of the snapshot still draws.
 *
 * Those warnings are `{ key, params }` pairs rather than sentences: a snapshot
 * parsed an hour ago should read in the language selected NOW, so the string is
 * built where it is shown (i18n.tk) instead of here.
 */

export const POSITION_ORDER = [
  'UTG', 'UTG+1', 'UTG+2', 'LJ', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB',
]

export const HERO_NAME = '*me*'

const POS_CANON = Object.fromEntries(POSITION_ORDER.map((p) => [p, p]))
POS_CANON.UTG1 = 'UTG+1'
POS_CANON.UTG2 = 'UTG+2'

const SUIT_SYM = {
  '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c',
  s: 's', h: 'h', d: 'd', c: 'c', S: 's', H: 'h', D: 'd', C: 'c',
}

const RANKS = '23456789TJQKA'

const ACT_RE = /^(fold|check|call|raise|bet|all[\s-]?in|allin|waiting|wait)\b\s*([\d.]*)\s*(?:bb)?\s*$/i

const STREET_NAMES = ['preflop', 'flop', 'turn', 'river']

/**
 * The line the host appends when the hand is OVER instead of asking anything.
 *
 * It is not a player block — it has no `position=` — and the endpoint says so:
 * `line 67: block for 'Hand finished' has no position=`. /move only answers a
 * body that ends on the hero's decision, so a snapshot carrying this marker is
 * never worth sending; `parseHandBody` flags it (`finished`) and the table stops
 * short of the API rather than spending a request on a refusal.
 */
const HAND_OVER_RE = /^hand\s*(?:is\s*)?(?:finished|finish|over|ended|complete[d]?)\b/i

/** Is this line the host's "the hand is over" marker rather than a block? */
export function isHandOverLine(text) {
  return HAND_OVER_RE.test(String(text || '').trim())
}

/** Does this socket frame look like a table snapshot rather than a log line? */
export function looksLikeBody(text) {
  return /^\s*position\s*=/im.test(text || '')
}

function normCard(tok) {
  const t = String(tok).trim().replace('10', 'T')
  if (t.length !== 2) return null
  const suit = SUIT_SYM[t[1]]
  const rank = t[0].toUpperCase()
  if (!suit || !RANKS.includes(rank)) return null
  return rank + suit
}

/** 'Q♠J♠' / 'Q♠ J♠' / 'QsJs' -> ['Qs', 'Js'] (or null). */
export function normHand(text) {
  let t = String(text).trim().replace(/10/g, 'T')
  t = [...t].map((ch) => SUIT_SYM[ch] || ch).join('')
  t = t.replace(/[\s,]+/g, '')
  if (t.length !== 4) return null
  const a = normCard(t.slice(0, 2))
  const b = normCard(t.slice(2))
  if (!a || !b || a === b) return null
  return [a, b]
}

function canonPos(text) {
  return POS_CANON[String(text).trim().toUpperCase().replace(/\s/g, '')] || null
}

function num(text) {
  const m = String(text).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}

function parseAction(line) {
  const m = ACT_RE.exec(line.trim())
  if (!m) return null
  let kind = m[1].toLowerCase().replace(/[\s-]/g, '')
  if (kind === 'allin') kind = 'all-in'
  else if (kind === 'waiting' || kind === 'wait') kind = null
  return { kind, amount: m[2] ? parseFloat(m[2]) : null }
}

function parseHeader(text) {
  const grab = (re) => {
    const m = re.exec(text)
    return m ? parseFloat(m[1].replace(/,/g, '')) : null
  }
  const playersLeft = grab(/(\d[\d,]*)\s*players?\s+left/i)
  const playersPaid = grab(/(\d[\d,]*)\s*players?\s+paid/i)
  const averageStack =
    grab(/(\d+(?:\.\d+)?)\s*BB\s+average/i) ??
    grab(/average\s+stack[^\d]*(\d+(?:\.\d+)?)/i)
  const totalPot = grab(/total\s+pot[^\d]*(\d+(?:\.\d+)?)/i)
  // Any ONE of the three is worth showing: clients word the header differently
  // and a missing "players paid" should not hide the average stack.
  const tournament =
    playersLeft != null || playersPaid != null || averageStack != null
      ? { playersLeft, playersPaid, averageStack }
      : null
  return { tournament, totalPot, text: text.trim() }
}

function parseBlock(lines, warnings) {
  const name = lines[0].text
  const block = {
    name,
    isHero: name.trim() === HERO_NAME,
    position: null,
    stack: null,
    stats: {},
    hand: null,
    kind: null,
    amount: null,
    waiting: true,
  }
  let haveAction = false
  for (const { no, text } of lines.slice(1)) {
    const eq = text.indexOf('=')
    if (eq > 0) {
      const key = text.slice(0, eq).trim().toUpperCase()
      const val = text.slice(eq + 1)
      if (key === 'POSITION') {
        const pos = canonPos(val)
        if (pos) block.position = pos
        else warnings.push({ key: 'parse.unknownPosition', params: { line: no, value: val.trim() } })
      } else if (key === 'STACK') {
        block.stack = num(val)
      } else if (['HAND', 'CARDS', 'HOLECARDS', 'HOLE CARDS'].includes(key)) {
        block.hand = normHand(val)
      } else {
        const v = num(val)
        if (v != null) block.stats[key] = v
        else warnings.push({ key: 'parse.unreadableStat', params: { line: no, text } })
      }
      continue
    }
    const act = parseAction(text)
    if (act) {
      if (haveAction) {
        warnings.push({ key: 'parse.secondAction', params: { line: no, text, name } })
        continue
      }
      block.kind = act.kind
      block.amount = act.amount
      block.waiting = act.kind === null
      haveAction = true
      continue
    }
    const hand = normHand(text)
    if (hand) block.hand = hand
    else warnings.push({ key: 'parse.unrecognizedLine', params: { line: no, text } })
  }
  return block
}

/** Body text -> { header, events: [{type:'act'|'board', ...}], finished }. */
function splitBody(body, warnings) {
  const events = []
  const headerLines = []
  let block = []
  let sawPlayer = false
  let finished = false

  const flush = () => {
    if (!block.length) return
    const hasPosition = block.some((l) => /position\s*=/i.test(l.text))
    if (!sawPlayer && !hasPosition) {
      headerLines.push(...block.map((l) => l.text))
      block = []
      return
    }
    events.push({ type: 'act', ...parseBlock(block, warnings) })
    sawPlayer = true
    block = []
  }

  body.split(/\r?\n/).forEach((raw, i) => {
    const text = raw.trim()
    const no = i + 1
    if (!text) return flush()
    if (isHandOverLine(text)) {
      // Dropped rather than parsed: as a block of its own it would otherwise
      // become a seat named "Hand finished", and glued to the last player's
      // block it would be an unrecognized line. Either way it is the hand
      // ending, which is the one thing the whole snapshot now means.
      finished = true
      return
    }
    const low = text.toLowerCase()
    if (low.startsWith('board:') || low.startsWith('board ')) {
      flush()
      const toks = text.includes(':') ? text.split(/:(.*)/s)[1] : text.slice(5)
      const cards = toks
        .replace(/,/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .map(normCard)
        .filter(Boolean)
      events.push({ type: 'board', cards })
      return
    }
    block.push({ no, text })
  })
  flush()
  return { header: headerLines.join('\n'), events, finished }
}

/**
 * Full snapshot -> a render-ready table state.
 *
 * Returns null when the text carries no player block at all (a plain log line).
 */
export function parseHandBody(body) {
  if (!looksLikeBody(body)) return null
  const warnings = []
  const { header, events, finished } = splitBody(body, warnings)
  const { tournament, totalPot, text: headerText } = parseHeader(header)

  // --- seats, in the order the body first mentions them --------------------
  const seats = new Map()
  const seatOf = (b) => {
    let s = seats.get(b.name)
    if (!s) {
      s = {
        name: b.name,
        isHero: b.isHero,
        position: b.position,
        order: POSITION_ORDER.indexOf(b.position),
        stack: null,
        stats: {},
        hand: null,
        folded: false,
        allIn: false,
        streetCommit: 0,
        totalCommit: 0,
        lastAction: null,
        actions: [],
        toAct: false,
        blindPosted: false,
      }
      seats.set(b.name, s)
    }
    return s
  }

  // --- replay, street by street --------------------------------------------
  let street = 0
  let board = []
  const boardByStreet = [[]]
  // Preflop opens at the big blind even before the BB's own block shows up, so
  // a limp ("call" with no amount) commits 1BB rather than nothing.
  let currentBet = 1
  let pot = 0
  const streetLog = [[], [], [], []]

  const openStreet = () => {
    for (const s of seats.values()) {
      pot += s.streetCommit
      s.streetCommit = 0
    }
    currentBet = 0
  }

  // Blinds are auto-posted by the solver's replay; the body never renders them.
  // Posted per seat as it first appears — the seat map is empty when the first
  // block is read, so there is no one moment to post them all.
  const postBlind = (s) => {
    if (s.blindPosted || street !== 0) return
    s.blindPosted = true
    if (s.position === 'SB') s.streetCommit = Math.max(s.streetCommit, 0.5)
    else if (s.position === 'BB') s.streetCommit = Math.max(s.streetCommit, 1)
  }

  for (const ev of events) {
    if (ev.type === 'board') {
      board = ev.cards
      street = Math.min(3, Math.max(1, board.length - 2))
      boardByStreet[street] = ev.cards.slice()
      openStreet()
      continue
    }
    const s = seatOf(ev)
    if (ev.position) {
      s.position = ev.position
      s.order = POSITION_ORDER.indexOf(ev.position)
    }
    if (ev.stack != null) s.stack = ev.stack
    if (ev.hand) s.hand = ev.hand
    if (Object.keys(ev.stats).length) s.stats = { ...s.stats, ...ev.stats }
    postBlind(s)

    if (ev.waiting) {
      s.toAct = true
      continue
    }
    s.toAct = false

    const entry = { street, kind: ev.kind, amount: ev.amount, name: s.name }
    switch (ev.kind) {
      case 'fold':
        s.folded = true
        break
      case 'check':
        break
      case 'call':
        s.streetCommit = ev.amount != null ? ev.amount : currentBet
        break
      case 'bet':
      case 'raise':
        if (ev.amount != null) {
          s.streetCommit = ev.amount
          currentBet = Math.max(currentBet, ev.amount)
        }
        break
      case 'all-in':
        s.allIn = true
        if (ev.amount != null) {
          s.streetCommit = ev.amount
          currentBet = Math.max(currentBet, ev.amount)
        } else if (s.stack != null) {
          s.streetCommit += s.stack
          currentBet = Math.max(currentBet, s.streetCommit)
        }
        break
      default:
        break
    }
    entry.commit = s.streetCommit
    s.lastAction = entry
    s.actions.push(entry)
    streetLog[street].push(entry)
  }

  const seatList = [...seats.values()]
  for (const s of seatList) {
    s.totalCommit = s.actions.reduce((m, a) => Math.max(m, a.commit || 0), 0)
    // What a client shows next to a seat is its action on the street being
    // played, not whatever it did three streets ago.
    s.lastAction = [...s.actions].reverse().find((a) => a.street === street) || null
    s.streetActions = s.actions.filter((a) => a.street === street)
  }

  // Nobody is on the clock on a hand that is over — including whoever the body
  // still marks as waiting, since the marker came in after that block.
  if (finished) for (const s of seatList) s.toAct = false

  // The hero block may close the body with no action line ("your turn"); if the
  // client did not mark anyone waiting, the hero is still who we answer for.
  const hero = seatList.find((s) => s.isHero) || null
  const waiting = seatList.filter((s) => s.toAct)
  const heroToAct =
    !finished && !!hero && (hero.toAct || (!waiting.length && !hero.lastAction))

  const replayedPot =
    pot + seatList.reduce((sum, s) => sum + (s.streetCommit || 0), 0)

  const contenders = seatList.filter((s) => !s.folded)
  const toCall = Math.max(
    0,
    currentBet - (hero ? hero.streetCommit || 0 : 0),
  )

  const byOrder = [...seatList].sort((a, b) => a.order - b.order)
  // The effective button: the last non-blind seat dealt in — or, heads-up
  // (no non-blind seats at all), the SB, who deals.
  const nonBlind = byOrder.filter((s) => s.position !== 'SB' && s.position !== 'BB')
  const buttonName = nonBlind.length
    ? nonBlind[nonBlind.length - 1].name
    : byOrder.find((s) => s.position === 'SB')?.name || null

  return {
    kind: 'snapshot',
    raw: body,
    // The hand is over: this body is a result, not a question. Nothing solves it.
    finished,
    headerText,
    tournament,
    totalPot,
    replayedPot,
    pot: totalPot != null ? totalPot : replayedPot,
    street,
    streetName: STREET_NAMES[street],
    board,
    boardByStreet,
    currentBet,
    toCall,
    seats: byOrder,
    seatsInActionOrder: seatList,
    hero,
    heroHand: hero ? hero.hand : null,
    heroToAct,
    waitingOn: waiting.length ? waiting[waiting.length - 1].name : null,
    buttonName,
    tableSize: seatList.length,
    contenders: contenders.length,
    streetLog,
    warnings,
  }
}

/** Stat keys the endpoint actually reads, in the order worth showing first. */
export const CORE_STATS = ['VPIP', 'PFR', '3BET', 'ATS']

/**
 * Every stat key the endpoint has a coefficient for.
 *
 * The KEYS live here and their prose lives in the message files under `stat.*`:
 * this list is what decides whether a HUD value counts as a read (see
 * regime.villainRead), and that must not depend on which language is selected.
 */
export const STAT_KEYS = [
  'VPIP',
  'PFR',
  '3BET',
  'ATS',
  'F3B',
  'FTS BB',
  'FTS SB',
  'W$SD',
  'WTSD',
  'WWSF',
  'AF',
  'FLOP C-BET',
  'TURN C-BET',
  'RIVER C-BET',
  'FLOP FOLD TO C-BET',
  'TURN FOLD TO C-BET',
  'RIVER FOLD TO C-BET',
  'ALL-IN FREQUENCY',
]

const KNOWN_STATS = new Set(STAT_KEYS)

/** Does the endpoint read this stat at all? */
export function isKnownStat(key) {
  return KNOWN_STATS.has(key)
}

export function isRatioStat(key) {
  return key === 'AF'
}
