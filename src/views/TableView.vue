<script setup>
/**
 * One table: one socket, one API.
 *
 * The mode=0 socket pushes the table snapshots (the /move `body` format) and
 * takes the commands. Every snapshot is POSTed straight to the ZigSolver API,
 * and the answer is what the panel renders — there is no mode=1 socket in this
 * flow; the front end is the one calling the solver.
 *
 * The regime picks which question goes out with the snapshot. `manual` is the
 * one that changes the flow rather than the payload: the solve is HELD until
 * the operator picks, so a decision they have not answered yet has spent no
 * budget. It is only held where the choice matters — a spot the exploit regime
 * cannot answer would come back GTO either way, so it goes straight out.
 *
 * Both of the modes that CHOOSE a regime — manual's answer and advanced's coin
 * — are decided once per hand and reused by that hand's later streets, so the
 * turn is answered by whatever the flop was. `handIdFor` draws the boundary: it
 * changes when the hero's cards change or the board or the pot goes backwards,
 * which means it does not depend on the host announcing a new hand.
 */
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import AppNav from '../components/AppNav.vue'
import StatusDot from '../components/StatusDot.vue'
import PokerTable from '../components/PokerTable.vue'
import RegimeBar from '../components/RegimeBar.vue'
import RegimePrompt from '../components/RegimePrompt.vue'
import SolverPanel from '../components/SolverPanel.vue'
import { useSocket } from '../lib/useSocket'
import { parseHandBody, isHandOverLine, decisionKey } from '../lib/handBody'
import { solveMove, cancelSolve, createHandIds } from '../lib/zigsolver'
import { captureScreenError, resetScreenErrors } from '../lib/screenError'
import SettingsSheet from '../components/SettingsSheet.vue'
import SeatStatsSheet from '../components/SeatStatsSheet.vue'
import TournamentSheet from '../components/TournamentSheet.vue'
import MessageDock from '../components/MessageDock.vue'
import { notify } from '../lib/notify'
import { applyManualStats, manualStats, statsFor } from '../lib/manualStats'
import {
  applyManualTournament,
  manualTournament,
  tournamentFor,
} from '../lib/manualTournament'
// Under the shell this view IS the tab, so there is nothing to go back to
// within it — the tables list is the tab next door, and closing is the ✕.
import { isNative } from '../lib/native'
import {
  MODE_HAND,
  server,
  api,
  socketUrl,
  apiUrl,
  displayHost,
  displayApi,
} from '../lib/server'
import { settings } from '../lib/settings'
import { t, tv } from '../lib/i18n'
import {
  regime,
  setRegime,
  exploitAvailability,
  flipRegimeCoin,
  resolveAdvanced,
  villainRead,
} from '../lib/regime'
import {
  preflop,
  gtoAvailable,
  flipPreflopCoin,
  resolvePreflop,
} from '../lib/preflop'

const props = defineProps({ index: { type: Number, required: true } })
const router = useRouter()

if (!server.value || !api.value) router.replace({ name: 'connect' })

const hand = ref(null)
const result = ref(null)
const solving = ref(false)
/**
 * `performance.now()` at the moment the /move fetch went out, or null.
 *
 * The panel counts up from it while the answer is outstanding, and the same
 * clock is stopped on arrival and carried on the result as `clientSeconds` —
 * so what the operator watched tick and what is compared against the API's own
 * `responseTime` are the one measurement, not two that can disagree.
 */
const solveStartedAt = ref(null)
const feed = ref([])
const showSettings = ref(false)

/**
 * Manual mode: the snapshot waiting for a regime to be picked, or null.
 *
 * Holding the BODY rather than a flag, because a newer snapshot supersedes an
 * unanswered question — you should never be answering a spot the table has
 * already moved past.
 */
const pending = ref(null)

/**
 * The snapshot currently being answered — what a re-solve re-sends. A ref, not
 * a plain variable: `canSolve` is computed from it.
 */
const lastBody = ref(null)

/**
 * The same snapshot as the HOST wrote it, before anything typed by hand was
 * written into it (lib/manualStats, lib/manualTournament).
 *
 * Kept beside `lastBody` because typing a value rebuilds the body of the spot
 * already on screen, and the rewrite is not reversible: writing over an
 * already-written body would replace a value happily and could never take a
 * line back out, so CLEARING a typed one would leave it in the snapshot.
 */
const hostBody = ref(null)

/**
 * The host's snapshot with everything typed by hand written into it — the seats'
 * stats and the table's tournament header, in the host's own formats.
 *
 * One function because there is one body: from here on the felt, the exploit
 * gate, the /move request and the failed-call capture all read the same text,
 * and nothing downstream has to know a number was typed rather than read.
 */
function withManual(text) {
  return applyManualTournament(props.index, applyManualStats(props.index, text))
}
let lastHandId = null
let solveSeq = 0
let coalesceTimer = null

/**
 * The solves in flight, oldest first: seq -> { controller, rid, key }.
 *
 * Usually one. It holds more than one only while a SHIELDED solve is running —
 * a re-read of the decision already being answered, sent without tearing down
 * the answer in progress (see `sameDecisionAsLive`). Every entry in here is
 * therefore the same question, which is what makes "the first one to answer
 * wins, and cancels the rest" the right rule.
 */
const live = new Map()

/**
 * The seq of the answer on screen — nothing older may overwrite it.
 *
 * Replaces the old `seq === solveSeq` test, which asked "are you the newest
 * request?" and so threw away an older solve's answer the moment a shielded
 * re-read went out behind it. That is precisely the answer worth keeping.
 */
let acceptedSeq = 0

/**
 * A new snapshot lands while an older one is still solving all the time (the
 * villain acts, the client re-reads). The old answer is worthless the moment
 * that happens, so the request is aborted rather than awaited.
 *
 * The short window before firing coalesces a burst of snapshots into one solve
 * — the case where cancelling after the fact would already have spent the
 * budget. It is invisible next to a multi-second solve.
 */
const COALESCE_MS = 150

/**
 * Cancellation handles. Every solve gets its OWN id, and /cancel names it.
 *
 * A stable per-table id looks tidier and is wrong: /cancel is fire-and-forget,
 * so it races the replacement /move, and if the replacement wins the race the
 * cancel arrives afterwards and kills the request we just made. A unique id per
 * solve makes a late cancel harmless — it names a request that has already
 * finished, which the endpoint answers with `found: false`.
 */
const idBase = `zs-${Math.random().toString(36).slice(2, 8)}-t${props.index}`

/**
 * How many times what is typed by hand has changed here — it rides on the
 * handId.
 *
 * The endpoint's per-hand cache reuses the tree an earlier call built, and a
 * tree built while the villain had no read — or while the body said nothing
 * about the payout ladder — is not the tree this question wants: the ranges it
 * was solved on were bent by stats the body no longer carries, and it was
 * priced in chips rather than under ICM. Typing either is a different question
 * about the same hand, so it asks under a different id rather than collecting a
 * cache hit on the old answer.
 */
let bodyRev = 0

const handIdFor = createHandIds(props.index)

const handUrl = computed(() => socketUrl(MODE_HAND, props.index))
const canSolve = computed(() => !!lastBody.value && !!api.value)

/** Whether the exploit regime can answer this hand — 'ok' / 'pending' / 'no'. */
const exploit = computed(() => exploitAvailability(hand.value))

/** The HUD stats read on this spot's villain — Advanced's gate reads them. */
const villainStats = computed(() => villainRead(hand.value).stats)

/** How this hand's Advanced PREFLOP coin came up, for the bar to report. */
const pfDrew = ref(null)

/** How this hand's Advanced coin came up, for the bar to report. */
const drew = ref(null)

/**
 * This hand's choice under the two modes that make one, keyed by the hand it
 * was made for. A key that no longer matches `lastHandId` is a stale answer to
 * a hand that is over, which is the same thing as not having one.
 */
let coinHandId = null
let coinValue = null
let pickHandId = null
let pickValue = null
let pfCoinHandId = null
let pfCoinValue = null

/**
 * Advanced: this hand's coin, flipped on its FLOP and kept for the rest of it.
 *
 * Only ever called once the hand is past preflop, so the flip lands on the
 * street the mode says it does — drawing preflop would spend the hand's coin on
 * a decision the preflop algorithm was always going to play.
 */
function handCoin() {
  if (coinHandId !== lastHandId) {
    coinHandId = lastHandId
    coinValue = flipRegimeCoin()
  }
  return coinValue
}

/** Manual: what the operator answered for this hand, or null while unanswered. */
function handPick() {
  return pickHandId === lastHandId ? pickValue : null
}

function forgetHandChoice() {
  coinHandId = null
  coinValue = null
  pickHandId = null
  pickValue = null
  pfCoinHandId = null
  pfCoinValue = null
}

/**
 * Advanced preflop: this hand's coin, drawn on its FIRST PREFLOP DECISION and
 * kept for the rest of its preflop.
 *
 * Same rule as the regime coin, for the same reason: a hand is one line.
 * Opening off the blueprint and then facing the 3-bet off the chart is a line
 * neither engine would have played.
 */
function handPreflopCoin() {
  if (pfCoinHandId !== lastHandId) {
    pfCoinHandId = lastHandId
    pfCoinValue = flipPreflopCoin()
  }
  return pfCoinValue
}

/**
 * The preflop engine to actually send, and what it cost to get there.
 *
 * Only decided for a PREFLOP decision: past the flop the field is irrelevant
 * and drawing there would spend the hand's coin on a street it does not
 * govern. `advanced` is not an engine — it is how this hand's engine is drawn.
 */
function preflopToSend() {
  const isPreflop = !hand.value || !hand.value.street
  if (!isPreflop) {
    pfDrew.value = null
    return null
  }
  const coin = preflop.selected === 'advanced' ? handPreflopCoin() : null
  const out = resolvePreflop(coin, gtoAvailable.value)
  pfDrew.value = preflop.selected === 'advanced' || out.forced ? out : null
  return out.engine
}

/**
 * The regime to actually send.
 *
 * `manual` and `advanced` are not ones — they are how the regime for THIS HAND
 * is chosen, by asking or by drawing on the flop, and either way the answer is
 * reused by the turn and the river rather than re-asked. `picked` is the manual
 * answer on its way in from the prompt, and it is recorded against the hand.
 *
 * Preflop leaves all of that alone. It goes out as `gto` because that is the
 * endpoint's name for "play it with the preflop algorithm", and it neither
 * spends the hand's coin nor counts as the hand having been answered.
 */
function regimeToSend(picked = null) {
  if (picked && regime.selected === 'manual') {
    pickHandId = lastHandId
    pickValue = picked
  }

  if (exploit.value.status === 'pending') {
    drew.value = null
    return 'gto'
  }

  if (regime.selected === 'advanced') {
    const out = resolveAdvanced(hand.value, handCoin())
    drew.value = out
    return out.regime
  }
  drew.value = null

  // Manual with nothing answered yet only reaches here on a hand not worth
  // asking about, which is GTO by definition.
  const want = regime.selected === 'manual' ? handPick() || 'gto' : regime.selected
  if (want === 'exploit' && !exploit.value.ok) return 'gto'
  return want
}

const handSock = useSocket({
  url: handUrl,
  onMessage: (data) => onHandMessage(String(data)),
})

/**
 * Is this snapshot LESS of the spot already on the felt, rather than a new one?
 *
 * The host builds the body by appending and re-reads the table on a timer, so a
 * poll that lands on a spot nothing has happened on can still come back
 * DIFFERENT: the tail is missing, most often the hero's own trailing block —
 * the one that says whose turn it is. (KScanner does it deterministically: it
 * appends `*me* waiting` only on the poll where the hero BECOMES to act, so
 * every later poll of the same decision drops it.)
 *
 * A different string is what makes this dangerous. The byte-equality check
 * below lets it through, and acting on it aborts the solve in flight and starts
 * it again from zero for a decision already being answered — two 10s solves for
 * one spot, and the first answer thrown away (measured on QJo 3-way,
 * 2026-08-23).
 *
 * Two shapes, both meaning "no action has been added since":
 *
 *   * every byte of the new body is already in the old one — a straight
 *     truncation, whatever it cut;
 *   * the same board, and a client that WAS marking someone to act has stopped
 *     — the partial read that also lost a digit somewhere, so it is not a
 *     prefix. Only the hero's own block carries that mark on the street being
 *     played, so losing it is the tell rather than a legitimate change: the
 *     host pushes a snapshot to ask what to do, and this one asks nothing.
 */
function isPartialReread(parsed) {
  const prev = hand.value
  if (!prev || !lastBody.value) return false
  const before = lastBody.value.trimEnd()
  const after = parsed.raw.trimEnd()
  if (after.length < before.length && before.startsWith(after)) return true
  return (
    !!prev.waitingOn &&
    !parsed.waitingOn &&
    parsed.board.join('') === prev.board.join('')
  )
}

/**
 * Is this snapshot the DECISION already being solved, arriving again?
 *
 * `isPartialReread` above catches the re-read that lost bytes. This catches the
 * one that gained wrong ones: same street, same hole cards, same number of
 * actions replayed, but a body that has drifted — a name read with a different
 * capital, a stack short a digit, an action label the client got wrong. Nothing
 * in that list is an ACTION, so the question has not moved on, but the text is
 * neither identical nor a prefix and both guards let it straight through to
 * `scheduleSolve`, which tears down the solve in flight to ask again.
 *
 * That is how the KQo flop on 2026-09-07 lost a 36-second answer: the re-read
 * turned the hero's own `raise 2.5BB` into `call`, the endpoint refused the body
 * it could no longer balance against the pot, and the good solve had already
 * been cancelled to make room for it.
 *
 * The caller does not drop the snapshot — a drifted read can also be a BETTER
 * one (a HUD block that has finally loaded) and there is no telling which from
 * here. It sends it SHIELDED instead: alongside the running solve rather than
 * over its corpse, so a refusal costs nothing and an answer is still an answer.
 */
function sameDecisionAsLive(parsed) {
  if (!live.size) return false
  const key = decisionKey(parsed)
  if (!key) return false
  for (const s of live.values()) if (s.key === key) return true
  return false
}

/** Drop whatever is solving or waiting to be asked: its spot is gone. */
function stopSolving() {
  abortInFlight()
  clearTimeout(coalesceTimer)
  coalesceTimer = null
  solveStartedAt.value = null
  pending.value = null
  updateBusy()
}

/**
 * The hand is over.
 *
 * The final table stays on the felt — with `parsed`, the snapshot that carried
 * the marker — but nothing more goes out for it. `lastBody` is cleared rather
 * than kept, so neither the auto-solve nor the Re-solve button can spend a
 * request on a body /move will refuse: it only answers one that ends on the
 * hero's decision, and this one ends on the hand ending.
 */
function handOver(parsed) {
  stopSolving()
  if (parsed) hand.value = parsed
  lastBody.value = null
  hostBody.value = null
  lastHandId = null
  drew.value = null
  forgetHandChoice()
}

function onHandMessage(text) {
  // Whatever has been typed by hand goes in BEFORE the parse, so there is one
  // body from here on: the felt, the exploit gate, the request and the failed-
  // call capture all read the same text (withManual, above).
  const parsed = parseHandBody(withManual(text))
  if (parsed) {
    // A snapshot that ends on "Hand finished" is a RESULT, not a question — the
    // hand it describes has no decision left in it. Held here, before anything
    // is sent: the endpoint refuses it ("block for 'Hand finished' has no
    // position="), so solving it costs a round trip to be told what we already
    // know. Repeats of the same finished body are ignored outright.
    if (parsed.finished) {
      if (hand.value?.finished && hand.value.raw === parsed.raw) return
      // No notification: the host narrates the result on its own line a moment
      // later, and the felt says HAND FINISHED for as long as it is on screen.
      handOver(parsed)
      return
    }
    // Byte-for-byte the same body as the one already on the felt: the client is
    // re-reading a spot nothing has happened on. Ignore it outright — the answer
    // on screen (or the one being solved, or the question waiting to be picked)
    // is for exactly this snapshot.
    //
    // Ignoring rather than re-solving is what makes a chatty client survivable:
    // a re-read while the solve is in flight would abort that solve and start it
    // again from zero, so a host that re-reads faster than the solver answers
    // would never get an answer at all. Re-parsing it would also swap `hand` for
    // an identical object and redraw the whole table for nothing.
    const unchanged = parsed.raw === lastBody.value
    if (unchanged && (solving.value || result.value || pending.value)) return
    // The same spot arriving with its tail cut off. Held to the same rule as an
    // identical re-read, and for the same reason — except that this one must be
    // dropped even with nothing on screen yet, since there is no newer question
    // in it to replace the one being solved.
    if (isPartialReread(parsed)) return
    // The same DECISION arriving under a body that has drifted. Read before the
    // felt moves, because it is a question about what is still running.
    const shielded = sameDecisionAsLive(parsed)
    // One shield per decision, and no more. A host that re-reads every second
    // through a 35-second solve would otherwise put a request out for each read,
    // and the endpoint solves one at a time — so the tail of them would queue up
    // behind an answer that has already been given. Two calls covers what the
    // shield is for; the third read of the same decision is just noise.
    if (shielded && live.size > 1) return
    hand.value = parsed
    lastBody.value = parsed.raw
    hostBody.value = text
    lastHandId = handIdFor(parsed)
    if (settings.autoSolve) {
      // Manual mode asks first — and asks about the NEWEST snapshot, so a
      // question raised for a spot the table has moved past is replaced rather
      // than answered. Once per hand: a later street of a hand already answered
      // goes straight out under that answer.
      if (regime.selected === 'manual' && exploit.value.ok && !handPick()) {
        abortInFlight()
        clearTimeout(coalesceTimer)
        coalesceTimer = null
        updateBusy()
        pending.value = parsed
      } else {
        pending.value = null
        scheduleSolve({ supersede: !shielded })
      }
    }
    return
  }
  // The same news as a plain line, with no snapshot under it: the felt keeps the
  // last decision, but that decision is no longer live.
  if (isHandOverLine(text)) handOver(null)
  if (/new hand/i.test(text)) {
    // The spot on screen is over; anything still solving for it is wasted.
    stopSolving()
    hand.value = null
    result.value = null
    lastBody.value = null
    hostBody.value = null
    lastHandId = null
    drew.value = null
    forgetHandChoice()
    feed.value = []
  }
  // Everything the host says that is not a snapshot: a notification now, and
  // the dock's history afterwards.
  notify(text, { tone: /not running|error|fail/i.test(text) ? 'warn' : 'info' })
  feed.value = [{ text, at: Date.now() }, ...feed.value].slice(0, 200)
}

function updateBusy() {
  solving.value = live.size > 0 || coalesceTimer !== null
}

/** Kill one solve — on both ends — and forget it. */
function drop(seq) {
  const s = live.get(seq)
  if (!s) return
  live.delete(seq)
  s.controller.abort()
  // Aborting the fetch only frees the browser; POST /cancel is what stops the
  // solver and releases the solve semaphore, so the replacement request is not
  // queued behind an answer nobody will read.
  if (settings.cancelSuperseded) cancelSolve(apiUrl('/cancel'), s.rid)
}

/**
 * Kill every request in flight — on both ends.
 *
 * What a caller means by this is "the spot is gone": a new hand, the hand
 * ending, a regime picked by hand. Answering any of them is wasted, shielded or
 * not, so they all go.
 */
function abortInFlight() {
  for (const seq of [...live.keys()]) drop(seq)
}

/** Kill every solve except `keep` — the decision it asked about is answered. */
function abortOthers(keep) {
  for (const seq of [...live.keys()]) if (seq !== keep) drop(seq)
}

/**
 * Solve the newest snapshot.
 *
 * `supersede: false` leaves whatever is running alone — the caller has decided
 * this snapshot asks the SAME question as a solve already in flight, so the two
 * race instead of one replacing the other (see `sameDecisionAsLive`). Nothing
 * doubles up on the box for long: the endpoint serialises solves on one
 * semaphore and refuses a body it cannot balance before taking it, so the
 * shielded call either fails in milliseconds or waits, and the first real answer
 * cancels whatever is left.
 */
function scheduleSolve({ supersede = true } = {}) {
  if (supersede) {
    abortInFlight()
    // The superseded solve's clock stops with it: the coalescing window belongs
    // to the replacement, and counting on from the old start would then jump
    // back to zero when the new request actually goes out.
    solveStartedAt.value = null
  }
  clearTimeout(coalesceTimer)
  coalesceTimer = setTimeout(() => {
    coalesceTimer = null
    solve(null, { supersede })
  }, COALESCE_MS)
  updateBusy()
}

/**
 * A call came back an error: photograph the table it failed on.
 *
 * The endpoint refuses a body that describes a table that cannot exist — a pot
 * the seats do not add up to, a card dealt twice, a block with no position — and
 * that is a MISREAD, not a solve that went wrong. The snapshot says what the
 * host read; only the screen says what there was to read. So the picture is
 * pulled off the host and filed against this hand (lib/screenError.js).
 *
 * Fire-and-forget, and quiet unless it works: the operator has already been
 * shown the error that matters, and a diagnostic that could not be taken is not
 * a second thing to read.
 */
function captureFailure(err, request) {
  // Nothing to send it to. The endpoint being unreachable is exactly the one
  // error whose capture cannot be delivered, and the screenshot is megabytes —
  // so this skips the fetch rather than spending it to fail.
  if (err.message?.key === 'api.unreachable') return

  captureScreenError({
    tableIndex: props.index,
    handId: request.handId || lastHandId,
    requestId: request.requestId,
    regime: request.regime,
    street: hand.value?.streetName ?? null,
    error: err.message,
    hint: err.hint,
    status: err.status ?? null,
    body: request.body,
  }).then((out) => {
    if (out.ok) notify(t('table.screenCaptured'), { tone: 'info' })
    else if (out.reason) console.warn(`[screenError] not captured: ${out.reason}`)
  })
}

/** The id this hand's tree is cached under, at the read it is being asked on. */
function cacheKey() {
  if (!lastHandId) return null
  return bodyRev ? `${lastHandId}s${bodyRev}` : lastHandId
}

/**
 * POST the current snapshot under `picked`, or the selected regime.
 *
 * `supersede: false` is the shielded call — see `scheduleSolve`.
 */
async function solve(picked = null, { supersede = true } = {}) {
  clearTimeout(coalesceTimer)
  coalesceTimer = null
  pending.value = null
  const url = apiUrl('/move')
  if (!url || !lastBody.value) return updateBusy()

  // A newer snapshot supersedes an older solve: without this a slow answer for
  // a spot that has already moved on could land after the fresh one.
  if (supersede) abortInFlight()
  const controller = new AbortController()
  const seq = ++solveSeq
  const rid = `${idBase}-${seq}`
  live.set(seq, { controller, rid, key: decisionKey(hand.value) })

  const request = {
    body: lastBody.value,
    handId: settings.useHandCache ? cacheKey() : null,
    requestId: rid,
    maxSolveTime: settings.maxSolveTime,
    statHands: settings.statHands,
    gateExploitability: settings.gateExploitability,
    targetExploitability: settings.targetExploitability,
    minSolveTime: settings.minSolveTime,
    regime: regimeToSend(picked),
    preflop: preflopToSend(),
  }

  const started = performance.now()
  // A shielded call does not restart the clock: the solve it went out beside is
  // still running and still the one being waited on, and the panel counting from
  // zero again would say the opposite.
  if (supersede || solveStartedAt.value == null) solveStartedAt.value = started
  updateBusy()
  try {
    const out = await solveMove(url, request, controller.signal)
    const clientSeconds = (performance.now() - started) / 1000
    live.delete(seq)
    if (out.type === 'cancelled') return
    // A REFUSAL while a sibling is still solving is the case this whole path
    // exists for: the two asked the same question, one of them could not be
    // read, and the one that could is still working. Drop it on the floor —
    // showing the error would replace an answer that is on its way with a
    // complaint about a snapshot nobody needs. The picture is still filed,
    // because a body the endpoint cannot balance is a MISREAD and the screen is
    // the only place the reason for it exists.
    if (out.type === 'error' && live.size) {
      captureFailure(out, request)
      return
    }
    if (seq > acceptedSeq) {
      acceptedSeq = seq
      // The question has been answered; anything still running asked the same
      // one and is now just occupying the solver.
      abortOthers(seq)
      // What the browser actually waited, next to what the API says it spent.
      out.clientSeconds = clientSeconds
      // Re-solving the same spot should not also re-roll the dice. Only a GTO
      // answer has a draw to hold; an exploit answer's top row is the move.
      //
      // THE SAME SPOT, by the snapshot the two answers were asked on: the answer
      // on screen is not cleared when the table moves, so without this the turn
      // would inherit the flop's draw whenever the key survives the street (a
      // bare `check` almost always does), and a hand that starts without a "new
      // hand" line would inherit the last one of the hand before it. Identical
      // bodies are exactly the re-solves this setting is about — Re-solve, a
      // regime pick, a settings change — and nothing else.
      if (
        settings.stableSample &&
        out.type === 'answer' &&
        out.regime === 'gto' &&
        result.value?.type === 'answer' &&
        result.value.regime === 'gto' &&
        result.value.request?.body === request.body
      ) {
        const held = result.value.sampled
        const still = held && out.actions.find((a) => a.action === held.action)
        // A draw the new answer no longer plays is not a draw to keep: the table
        // below would render that row dead under a pick that names it.
        if (still && still.probability > 0) out.sampled = still
      }
      result.value = out
      if (out.type === 'error') captureFailure(out, request)
    }
  } catch (e) {
    live.delete(seq)
    // An abort is us superseding ourselves — never an error to show. Nor is a
    // transport failure on a shielded call that a live sibling may still answer.
    if (e.name === 'AbortError' || live.size) return
    if (seq > acceptedSeq) {
      acceptedSeq = seq
      const failed = {
        type: 'error',
        id: seq,
        message: String(e),
        request,
        clientSeconds: (performance.now() - started) / 1000,
      }
      result.value = failed
      captureFailure(failed, request)
    }
  } finally {
    live.delete(seq)
    // The clock belongs to the solves still out, not to this one: an older solve
    // finishing (or being superseded) must not stop the timer a replacement just
    // started, and a shielded call failing must not stop the one it went out
    // beside.
    if (!live.size) solveStartedAt.value = null
    updateBusy()
  }
}

function selectRegime(value) {
  setRegime(value)
  // Picking a regime is a deliberate gesture about the hand in front of you, so
  // it drops whatever that hand had already been assigned — otherwise clicking
  // Manual mid-hand would silently reuse the answer you clicked in order to
  // change, and clicking Advanced would keep a coin drawn at the old mix.
  forgetHandChoice()
  if (value === 'manual') {
    // Switching INTO manual mid-hand asks about the spot on screen rather than
    // waiting for the table to move; there is an answer up already, so nothing
    // is lost by leaving it there until the question is answered.
    abortInFlight()
    updateBusy()
    if (lastBody.value && exploit.value.ok) pending.value = hand.value
    return
  }
  pending.value = null
  // Advanced opens its knobs on the same click; the bar re-solves when they
  // close, so the draw is made at the mix the operator has just settled on
  // rather than at the one they are still moving.
  if (value === 'advanced') return
  if (lastBody.value) solve()
}

/**
 * The seat whose four HUD stats are being typed, or null.
 *
 * It carries the HOST's own stats for that seat rather than the felt's: what is
 * on the felt already has the typed values written into it, and a placeholder
 * reading back what you just typed says nothing about what the client read.
 */
const editing = ref(null)
let editingBefore = null

function editStats(seat) {
  const host = hostBody.value ? parseHandBody(hostBody.value) : null
  const hostSeat = host ? host.seats.find((s) => s.name === seat.name) : null
  editing.value = {
    name: seat.name,
    position: seat.position,
    hud: hostSeat ? hostSeat.stats : {},
  }
  editingBefore = JSON.stringify(statsFor(props.index, seat.name))
}

/**
 * Closing the editor is what re-solves — the same bargain the Advanced knobs
 * make: the question goes out once, under the numbers you have settled on,
 * rather than on every keystroke. Opened and closed untouched, it costs nothing.
 */
function closeStats() {
  const name = editing.value?.name
  editing.value = null
  if (!name) return
  resolveTyped(JSON.stringify(statsFor(props.index, name)) !== editingBefore)
}

/**
 * The tournament header, and what the HOST's own snapshot said about it.
 *
 * Same reason the stats editor carries the host's stats: what is on the felt
 * already has the typed values written into it, and a placeholder reading back
 * what you just typed says nothing about what the client reported.
 */
const editingTourney = ref(null)
let tourneyBefore = null

function editTournament() {
  const host = hostBody.value ? parseHandBody(hostBody.value) : null
  editingTourney.value = { host: host?.tournament || null }
  tourneyBefore = JSON.stringify(tournamentFor(props.index))
}

function closeTournament() {
  editingTourney.value = null
  resolveTyped(JSON.stringify(tournamentFor(props.index)) !== tourneyBefore)
}

/** An editor closed: re-ask the spot if what it writes into the body changed. */
function resolveTyped(changed) {
  if (!changed) return
  // The body has changed, so the tree cached against this hand was solved on
  // ranges — or a pay ladder — it no longer describes.
  bodyRev += 1
  // A manual question still waiting to be answered stays waiting: re-solving
  // here would answer it as GTO on the operator's behalf.
  if (pending.value || !lastBody.value) return
  solve()
}

/**
 * Something typed changed: restate the snapshot on screen under it, so the felt
 * and the answer's body are the text that will actually go out.
 *
 * The hand id is deliberately not re-minted — this is the same hand and the
 * same decision, and `handIdFor` reads the spot rather than what is known about
 * the players or the tournament. Which read it is asked under is `bodyRev`'s
 * job, above.
 */
function restate() {
  if (!hostBody.value) return
  const parsed = parseHandBody(withManual(hostBody.value))
  if (!parsed) return
  hand.value = parsed
  lastBody.value = parsed.raw
}

watch(manualStats, restate, { deep: true })
watch(manualTournament, restate, { deep: true })

function command(token) {
  const ok = handSock.send(token)
  showToast(ok ? t('table.sent', { token }) : t('table.dropped'), ok)
}

function showToast(text, ok = true) {
  notify(text, { tone: ok ? 'ok' : 'bad' })
}

watch(
  () => props.index,
  () => {
    stopSolving()
    hand.value = null
    result.value = null
    feed.value = []
    lastBody.value = null
    hostBody.value = null
    editing.value = null
    editingTourney.value = null
    lastHandId = null
    drew.value = null
    forgetHandChoice()
    // A capture is remembered so one bug is photographed once; a different
    // table is a different set of bugs.
    resetScreenErrors()
    handSock.reconnect()
  },
)

// Leaving the table kills the solve with it.
onBeforeUnmount(() => {
  abortInFlight()
  clearTimeout(coalesceTimer)
})

</script>

<template>
  <div class="wrap">
    <AppNav
      :title="t('table.title', { index })"
      :subtitle="t('table.subtitle', { host: displayHost(), api: displayApi() })"
      :back="isNative ? null : { name: 'connect' }"
      wide
    >
      <StatusDot
        :status="handSock.status.value"
        :label="
          t('table.socket', {
            status:
              handSock.status.value === 'open'
                ? t('table.socketLive')
                : tv(`status.${handSock.status.value}`, handSock.status.value),
          })
        "
      />
      <StatusDot
        :status="solving ? 'connecting' : result?.type === 'error' ? 'closed' : 'open'"
        :label="
          solving
            ? t('table.solverSolving')
            : result?.type === 'error'
              ? t('table.solverError')
              : t('table.solverReady')
        "
      />
      <button class="gear" :title="t('nav.settings')" @click="showSettings = true">
        <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
          <circle cx="10" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="1.7" />
          <path
            d="M10 2.2l1 2.1 2.3-.5.5 2.3 2.1 1-1 2.1 1 2.1-2.1 1-.5 2.3-2.3-.5-1 2.1-1-2.1-2.3.5-.5-2.3-2.1-1 1-2.1-1-2.1 2.1-1 .5-2.3 2.3.5z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </AppNav>

    <!-- Two columns: the felt on the left, everything that reads it on the
         right. The right column scrolls on its own so the table never leaves
         the screen while you read the answer. -->
    <div class="page">
      <div class="felt-col">
        <div v-if="handSock.status.value !== 'open'" class="offline card">
          <div class="spinner" />
          <div>
            <strong>{{ t('table.connecting', { host: displayHost() }) }}</strong>
            <p class="muted">{{ t('table.connectingNote') }}</p>
          </div>
        </div>

        <!-- No swap transition and no :key here on purpose: the felt updates in
             place on every snapshot, and an out-in transition stalls whenever the
             tab is backgrounded (rAF throttling), which would strand the table. -->
        <PokerTable
          v-if="hand"
          :hand="hand"
          :table-index="index"
          @edit-stats="editStats"
          @edit-tournament="editTournament"
        />
        <div v-else class="empty card">
          <p><strong>{{ t('table.noSnapshot') }}</strong></p>
          <!-- v-html: the <kbd> is the message file's own. -->
          <p class="muted" v-html="t('table.noSnapshotNote')" />
        </div>
      </div>

      <aside class="side">
        <RegimeBar
          :disabled="handSock.status.value !== 'open'"
          :selected="regime.selected"
          :exploit="exploit"
          :stat-names="villainStats"
          :drew="drew"
          :preflop-drew="pfDrew"
          :solving="solving"
          :can-solve="canSolve"
          @select="selectRegime"
          @command="command"
          @resolve="solve()"
          @settings="showSettings = true"
        />

        <RegimePrompt
          v-if="pending"
          :hand="pending.heroHand ? pending.heroHand.join('') : null"
          :street="pending.streetName"
          @pick="solve"
        />

        <SolverPanel
          :result="result"
          :pending="solving"
          :started-at="solveStartedAt"
          :regime="regime.selected"
        />
      </aside>
    </div>

    <MessageDock :messages="feed" :title="t('table.hostMessages')" @clear="feed = []" />

    <SettingsSheet v-if="showSettings" @close="showSettings = false" />

    <SeatStatsSheet
      v-if="editing"
      :table-index="index"
      :name="editing.name"
      :position="editing.position"
      :hud="editing.hud"
      @close="closeStats"
    />

    <TournamentSheet
      v-if="editingTourney"
      :table-index="index"
      :host="editingTourney.host"
      @close="closeTournament"
    />
  </div>
</template>

<style scoped>
.wrap {
  min-height: 100%;
}

/* Wider than the shared .page so both columns get room. The felt is capped at a
   comfortable size and the right column takes everything left over, so no width
   goes to waste between them. */
.page {
  max-width: 1760px;
  display: grid;
  grid-template-columns: minmax(0, 820px) minmax(340px, 1fr);
  align-items: start;
  gap: 20px;
  padding-top: 18px;
  padding-bottom: 24px;
}

.felt-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* Sticky and self-scrolling: the answer can be as long as it likes without
   pushing the felt off the screen. */
.side {
  position: sticky;
  top: 70px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  max-height: calc(100vh - 112px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

@media (max-width: 1100px) {
  .page {
    grid-template-columns: minmax(0, 1fr);
  }

  .side {
    position: static;
    max-height: none;
    overflow: visible;
  }
}

.gear {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 50%;
  background: var(--fill);
  color: var(--label-2);
  cursor: pointer;
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
}

.gear:hover {
  background: var(--fill-strong);
  color: var(--label);
}

.offline {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
}

.offline p {
  margin: 2px 0 0;
  font-size: 13px;
}

.empty {
  padding: 40px 24px;
  text-align: center;
}

.empty p {
  margin: 0;
}

.empty p + p {
  margin-top: 6px;
  font-size: 13.5px;
}

/* :deep, because the <kbd> arrives through v-html on the empty-state note. */
.empty :deep(kbd) {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--fill);
  font-family: var(--font-mono);
  font-size: 11px;
}

.spinner {
  width: 18px;
  height: 18px;
  flex: none;
  border-radius: 50%;
  border: 2px solid var(--fill-strong);
  border-top-color: var(--blue);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

</style>
