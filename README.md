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
socket** — the front end is the one calling the solver, which is what makes the
read buttons able to re-ask the same question a different way.

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
the bottom, each with position, stack behind, HUD stats, the action it took **on
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

## Reads, and re-asking

The read buttons are ZigSolver's own opponent profiles —
[profiles.js](src/lib/profiles.js) is generated from its `profiles.json`, the
same list `api/constants.PROFILE_INTENSITY` is built from, so every one is a
name `/move` accepts:

> population · reg · tag · lag · aggro_reg · tight_reg · passive_reg ·
> weak_tight · sticky_reg · spewer · trapper · station · limper · maniac · nit

plus two that are not profiles: **Auto** (the endpoint fits a read from the
villain's own HUD stats) and **GTO** (`autoProfile: false`, no read at all).
Each has a **?** with what the cluster is, how it differs from the pool, its
signature, and the temperature the exploit pass regularizes with.

Picking one **re-solves the snapshot on screen** under that read, and — for a
real profile name — also sends the token to the runner, so the bot's own play
follows the read you are looking at. Because the call carries a `handId`, the
endpoint answers off the tree it already solved (one best-response pass, ~0.2s)
instead of solving the spot again.

The answer panel is deliberately small — a strip, not a page:

* **Play** and **GTO**, the two randomly sampled actions, side by side.
* One row per action with **GTO %, Exploit % and the delta** — numbers, no bars.
  The decision category the engine gave the hero's hand rides along each row.
* **One line on the read** ("passive and does not fold: AF 1.30, folds a river
  bet 51.9% …") with a **?** for the full cluster description and signature.
* The solver regime as a badge with a **?** for what that rung does to the
  answer, and a **Details** button holding the rest: every `meta` field, the
  warnings and the raw response.

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
| Hold the sampled action | keep one draw while comparing reads |

Endpoints are editable here too.

## Mock hosts

No bot and no solver needed to work on the UI:

```bash
node mock/server.js 8080 8000
```

Dependency-free (the WebSocket handshake and framing are done by hand). It
serves `Indexes: 0,3,7,9`; table **0** is a 6-max flop decision, table **3** a
heads-up preflop chart answer, table **7** a body the endpoint refuses, table
**9** a full 9-max ring. The fake
`/move` takes 2.5s so cancellation is observable, implements `/cancel` and
supersede-on-reuse like the real one, and shifts its exploit per profile so a
re-solve visibly changes the answer.

Those four snapshots never move, and the answers are canned. To point the app at
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

## Layout

```
src/
  lib/        handBody.js   snapshot parser (port of api/handhistory.py)
              zigsolver.js  /move + /cancel client, handId minting
              moveResult.js answer normalizer + action sampling
              settings.js   persisted solve settings
              notify.js     transient notifications
              profiles.js   generated from ZigSolver/profiles.json
              solvers.js    what each solver regime means
              server.js     the two hosts; socket and http URLs
              useSocket.js  reconnecting WebSocket composable
  components/ PokerTable · SeatPod · PlayingCard · ProfileBar · SolverPanel
              HandDetails · SettingsSheet · InfoSheet · HelpButton
              MessageDock · NotificationStack · AppNav · StatusDot
  views/      ConnectView · TableView · CheckView
mock/         the two hosts as fixed snapshots
fakebot/      a bot host with a simulated game behind it
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
