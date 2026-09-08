# ZigSolver Front

Vue 3 front end for the poker bot host: pick a table, watch the hand it is in,
and read ZigSolver's answer for the decision in front of you.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # -> dist/
```

`dist/` is a static bundle with **relative asset paths and hash routing**
(`#/`, `#/table/0`, `#/check`), so it drops into any directory the Kotlin server
serves without rewrite rules.

## Two hosts

The app talks to both ends itself:

| host | what it is for |
|---|---|
| **bot host** | the Kotlin runner. One WebSocket per table, `mode=0`: it pushes the table snapshots and takes the commands. |
| **ZigSolver API** | the solver. Every snapshot is POSTed to `/move`, and the answer is what you read. |

Both are typed once on the root view and remembered. There is **no `mode=1`
socket** — the front end is the one calling the solver, which is what lets the
regime picker re-ask the same spot as a different question.

The API must send CORS headers for a browser to accept its responses; the
bundled `api/server.py` change does that (`--cors-origin` to pin it). The
connect screen probes `GET /health` and says so plainly if it cannot.

## The three views

**`#/` — Tables.** Two fields (bot host, ZigSolver API) and Connect. It opens
`mode=0` on the hardcoded indexes table (`96782`) and reads the broadcast

```
Indexes: 0,3,7
```

into one card per running table, while `GET /health` confirms the solver.
`allbot` / `autoenablebot` are here, and so is the link to the check view.

**`#/table/:index` — one table.** The socket pushes snapshots; each one goes
straight to `/move` and the answer lands in the panel. Tables of **2 to 10
seats** are drawn (9-max is the client's largest ring).

A frame carrying a `position=` line is parsed as a snapshot
([handBody.js](src/lib/handBody.js), a port of ZigSolver's
`api/handhistory.py`) and drawn as a felt: seats around an oval with the hero at
the bottom, each with position, stack behind, HUD stats (typeable — see below),
the action it took **on
the street being played**, and the chips it has in front this street. Blinds are
posted the way the solver's own replay posts them, so a limped pot shows the 1BB
it actually contains. The centre carries the board, the authoritative header pot
and what the hero has to call. Anything that is not a snapshot is a **notification** — it appears for a few
seconds bottom-right and is kept in the **message dock** underneath, which is
**minimized by default**, badges what arrived while it was closed, and remembers
whether you left it open.

**`#/check` — Screenshot check.** The same `POST /checkScreenshot` multipart
`check.html` sent (image, `check2`, `crop`, `tableIndex`), except you can drop or
paste the image and the response renders inline.

## The regime, and re-asking

One picker on the table screen decides **which question** goes out with each
snapshot. It is not in the settings sheet on purpose: everything in there is
*how* a solve is requested and you set it once, while this is *what you are
asking for*, and it changes hand to hand.

| | sent as | what comes back |
|---|---|---|
| **GTO** | `regime: "gto"` | The equilibrium strategy at the node — a distribution, mix at those frequencies. |
| **Exploit** | `regime: "exploit"` | The maximum-EV action against this villain's measured behaviour. An expectimax over models fitted to real players, so there is no equilibrium in it and nothing to mix: one action, with the EV of every alternative next to it. |
| **Manual** | neither | Nothing is sent until you pick. Each decision the table pushes stops and asks, and that choice applies to that decision only. |

**The two are never computed together.** An exploit answer is a different
question from an equilibrium one rather than a deviation from it, so there is no
GTO column beside it and no delta — pricing both would double the wall clock of
every decision to illustrate a comparison you did not ask for. Switch the
picker to see the other one.

**Exploit is heads-up postflop only.** Preflop, a flop dealt three or more ways,
and a two-handed table are outside what the models were fitted on
(`api/exploit_spot.py` is the list, and this app mirrors it in
[regime.js](src/lib/regime.js)). Those answer GTO instead: the picker greys the
Exploit chip and says why, Manual skips the question rather than asking one with
a single answer, and if it happens anyway the answer panel says
*“Exploit was asked for and could not be answered here”* with the reason in the
warnings. There is no ICM in it either — a bubble spot gets a cash-game answer.

Picking a regime **re-solves the snapshot on screen**. A `handId` still rides
along so a later street reuses the tree the earlier one built, but that is a GTO
thing only: an exploit answer walks the hand rather than a subgame, so it is
recomputed every call by design.

The answer panel is deliberately small — a strip, not a page:

* **Play**, the action to take — one random draw from the distribution under
  GTO, and simply the top row under Exploit.
* One row per action. Under GTO that is the **frequency**; under Exploit it is
  **EV in BB**, the same as **% of pot**, and the **support** the size models
  have at that size. The decision category the engine gave the hero's hand rides
  along each row where the solve provides one.
* The regime that actually ran as a chip, the solver regime as a badge with a
  **?** for what that rung does to the answer, and a **Details** button holding
  the rest: every `meta` field, the warnings and the raw response.

**EV is counted from this decision on.** Chips already in the pot are sunk, so
folding is `0` by construction and every other number is read against it.
**Support** is the share of real play the size models saw at that size; a
winning branch under ~2% is one the models are extrapolating on, and the panel
flags it.

## Typing the stats the HUD does not carry

Every stat the snapshot does not carry is **imputed from the population** on the
solver side, so a villain the HUD says nothing about is answered as the average
player — and those four numbers are not decoration: the preflop chart's widths
are bent by the opponents' VPIP / PFR / ATS / 3BET, and the exploit models are
fitted on them. A fresh table, an anonymising client or a villain the tracker
has never seen is exactly the spot where you know more than the body does.

So the pod takes them. The **✎** on a villain's stat row (a dashed **+ stats**
where the HUD carried none) opens the four fields; anything typed is **written
into the snapshot in the host's own format** — `VPIP=41%`, above `stack=`, where
the client would have put it — **before that snapshot is parsed**.

That last part is the whole design. There is one body from there on, so the
felt, the exploit gate, the `/move` request and the failed-call capture all read
the same text and nothing downstream has to know a number was typed. What the
editor's footer shows is the lines themselves.

Four details:

* **A typed value is marked blue on the felt.** It is in the snapshot either
  way, which is precisely why it must not look like something the client read.
* **An empty field is not a zero.** It is the HUD's own value where there is one
  — which the placeholder shows — and the population average where there is not.
  Only filled fields are written, so PFR can be left alone while ATS is typed.
* **Kept per table**, under the name the body carries. Clients that anonymise
  ("Player 3") reuse the same handful of names at every table, and a global map
  would put one table's read on another table's stranger.
* **It re-asks under a new `handId`.** The cached tree was solved on ranges bent
  by stats the body no longer carries, so typing one is a different question
  about the same hand rather than a cache hit on the old answer. The re-solve
  fires when the editor is closed, not on every keystroke.

The hero has no fields: the endpoint reads these to model the *opponents*.

## Typing the tournament header

The other thing a client leaves out is the tournament itself. The snapshot's
header is prose — `781 players left, 78.9BB average stack, 92 players paid` —
and it is not decoration either: the endpoint prices a hand **under ICM only
when the body carries players left AND players paid**, and it can only weigh the
hero against a field when it also carries an **average stack**
(`api/move.py::_tournament_data`). A snapshot with none of that is answered as a
cash game — which on the bubble is the wrong question rather than a slightly
worse answer, since folding is worth more there than the chips say.

Plenty of hosts never report it. The lobby has it on screen, the extractor reads
the felt, and you can see both. So the **✎ on the header chips** — a dashed
**+ tournament** where the client reported none — takes the three numbers, and
they are **written into the header in the host's own prose** before the snapshot
is parsed.

It is the same machinery as the typed stats, so the same four things hold: one
body downstream, a typed value marked blue on the felt, an empty field meaning
the host's own value rather than a zero, and a re-solve under a new `handId`
when the editor closes — the cached tree was priced in chips, and asking again
under a pay ladder is a different question about the same hand.

Two details of the writing:

* **A clause the header already has is replaced where it stands**, so a typed
  count beats the client's rather than arriving twice, and one it does not have
  is appended to the sentence — ahead of `Total pot`, which closes the host's
  line. A body with no header at all gets the whole line, opener included.
* **Kept per table**, because two tables are two tournaments at different stages
  of different fields.

The sheet says which of the two answers the header currently buys, counting the
host's own values and yours together: both counts and an average stack is ICM,
anything less is chips.

## Cancelling superseded solves

A new snapshot while one is still solving makes that answer worthless. Aborting
the `fetch` only frees the browser — the endpoint would solve to completion and
keep the solve semaphore, so the question you *do* want queues behind a dead
one. So the app also calls **`POST /cancel`**, which SIGKILLs the solver
subprocess and frees the lock (see `api/cancel.py` and the `/cancel` section of
the API README).

Three details that matter:

* **The cancel id is unique per solve.** A stable per-table id looks tidier and
  is wrong: `/cancel` is fire-and-forget, so it races the replacement `/move`,
  and if the replacement wins the race the cancel arrives afterwards and kills
  the request you just made. (Observed, then fixed.)
* **A 150ms coalescing window** before firing means a burst of snapshots costs
  one solve rather than a cancel-storm.
* **An identical body** re-sent (a re-read of the same spot) does not spend a
  solve at all.

## Photographing a failed call

A `/move` that comes back an error is almost never a solver problem: it is a
**misread**. The host's extractor wrote a stack the table never had, dealt a
card twice, or lost the block that says whose turn it is, and the endpoint
refused a body describing a table that cannot exist. The snapshot is evidence of
*what was read* — only the pixels show what there was to read.

So a failed call takes a picture. The app fetches **`GET /image/{tableIndex}`**
from the bot host (the same host its socket is on; a PNG, optionally encrypted
with the same key as the socket frames — `lib/crypto.js` sniffs it the same way,
on PNG's signature rather than on "does this decode as text") and posts it to
the API's **`POST /screenError`**, which files it under `screenerrors/` named
for the hand and the moment, with the error, the refused body and the
`requestId` beside it. See `lib/screenError.js` and the API README.

The image is forwarded **byte for byte, at full resolution** — no canvas, no
re-encode, no resize. A rank read as the wrong rank is a handful of pixels, and
a resample would take exactly the evidence the capture exists to preserve.

Three rules, all of them about not making a bad moment worse:

* **Every failure is swallowed.** You have already been shown the error that
  matters; a diagnostic that could not be taken is not a second one to read.
* **One capture at a time**, and none at all when the failure was the API being
  unreachable — that is the one error whose capture has nowhere to go, and a
  screenshot is megabytes.
* **The same hand failing the same way is captured once.** Auto-solve re-sends
  on every re-read, and those are all pictures of one bug.

## Settings

The gear in the nav, or the chip next to Re-solve. Each row says what the option
does at the endpoint:

| setting | request field |
|---|---|
| Solve budget | `maxSolveTime` — which regime the balancer can afford |
| Solve every snapshot | auto-solve on arrival, or only on demand |
| Cancel superseded solves | whether to `POST /cancel` on supersede |
| Per-hand tree cache | `handId` — reuse the solved tree across streets and reads |
| Stat sample size | `statHands` — how much history the HUD stats cover |
| Hold the sampled action | keep one draw while the same spot is re-solved (GTO only) |

Endpoints are editable here too.

## Mock hosts

No bot and no solver needed to work on the UI:

```bash
node mock/server.js 8080 8000
```

Dependency-free (the WebSocket handshake and framing are done by hand). It
serves `Indexes: 0,1,3,5,7,9`; table **0** is a 3-way 6-max flop decision whose
SB carries no HUD stats at all (the seat to try typing some into), table
**1** a 6-max pot that is heads-up from the flop (the one shape the Exploit
regime covers, so it is the table to point at for that and for Manual), table
**3** a heads-up preflop chart answer, table **5** the same heads-up hand on the
river facing a bet (a river root is solved with the wider raise menu — 50/75/100%
of pot — so it is the longest action list the panel has to draw), table **7** a
body the endpoint refuses, table **9** a full 9-max ring whose header carries
the pot and nothing about the tournament (the table to try typing one into). The fake
`/move` takes 2.5s so cancellation is observable, implements `/cancel` and
supersede-on-reuse like the real one, and answers both regimes — the exploit one
with EVs and support, so the panel's second column set is exercised. Both hosts
carry the failed-call capture path: `GET /image/N` serves a stand-in screenshot
(a felt with the table number on it, drawn by [fakebot/png.js](fakebot/png.js)),
and the fake `/screenError` logs what it was posted instead of storing it.

Those snapshots never move, and the answers are canned. To point the app at
the **real solver** and still not need a poker client, there is
[fakebot/](fakebot/): a bot host with a game behind it — cards, blinds, a button
that moves, villains acting to their own persona, streets, showdowns, stacks
that carry over — pushing a fresh snapshot every time the hero is on the clock.

```bash
cd ../ZigSolver && ./runapi.sh --port 8000 --cors-origin http://localhost:5173
node fakebot/server.js 8080 --hero-delay 60000
```

Every spot it sends is one the solver has never seen. The long hero delay is
because a real solve takes ~20s on a flop and ~70s on an exact turn or river; at
the default 9s the hero acts first and you watch the supersede-and-cancel path
instead.

`--encrypt` puts every frame **and** the `/image/N` body through the same
AES-256-CBC the Kotlin host uses, which is what proves the sniffing in
`lib/crypto.js` against real ciphertext. To watch a capture happen end to end,
lift the flop-width cap: the solver serves up to 5 players postflop and refuses
anything wider, so a 6-way flop is a genuine 400 with a real screenshot behind
it.

```bash
node fakebot/server.js 8080 --encrypt --max-flop-players 0 --speed 4
```

## Layout

```
src/
  lib/        handBody.js   snapshot parser (port of api/handhistory.py)
              zigsolver.js  /move + /cancel client, handId minting
              moveResult.js answer normalizer + action sampling
              settings.js   persisted solve settings
              regime.js     gto|exploit|manual, and where exploit applies
              manualStats.js the four HUD stats, typed by hand
              manualTournament.js the tournament header, typed by hand
              notify.js     transient notifications
              solvers.js    what each solver regime means
              screenError.js the failed-call screen capture
              server.js     the two hosts; socket and http URLs
              useSocket.js  reconnecting WebSocket composable
  components/ PokerTable · SeatPod · PlayingCard · SolverPanel
              RegimeBar · RegimePrompt · HandDetails · SettingsSheet
              SeatStatsSheet · TournamentSheet · InfoSheet · HelpButton
              MessageDock · NotificationStack · AppNav · StatusDot
  views/      ConnectView · TableView · CheckView
mock/         the two hosts as fixed snapshots
fakebot/      a bot host with a simulated game behind it (png.js draws the
              stand-in screenshot /image/N serves)
legacy/       the original static pages, kept for reference
```

Three deliberate choices worth knowing about:

* **No route or table swap transitions.** A backgrounded tab throttles
  `requestAnimationFrame`, and a Vue `<Transition>` started there can stall on
  its first frame and strand the view — this app is meant to sit in a background
  tab.
* **The seat ring is a box inset by half a pod**, so a seat lands fully inside
  the felt at any seat count and any window size.
* **Seats are spaced by arc length, not by angle.** Equal angles look right on a
  circle and bunch up on an ellipse, where the same angular step covers far less
  perimeter at the left and right extremes. Measured: a 9-max table put two pods
  7px *into* each other on a narrow felt; by arc length the tightest pair clears
  by 25px, and every count from 2 to 10 is positive. Pods also shrink slightly
  at 8+ seats.
