# fakebot — a bot host with a game behind it

A stand-in for the Kotlin runner that **plays poker** instead of replaying fixed
text: it deals cards, posts blinds, moves the button, lets each villain act to
its own persona, runs the streets, shows hands down and carries stacks over to
the next hand. What comes out of the socket is the same thing the real runner
puts out — a snapshot body every time the hero is on the clock, log lines in
between.

```bash
node fakebot/server.js                    # http://localhost:8080
npm run fakebot -- 8080 --speed 3 --seed 7
```

Dependency-free (the WebSocket handshake and framing are done by hand, as in
`mock/server.js`).

## Endpoints

| | |
|---|---|
| `ws /commands?mode=0&tableIndex=96782` | `Indexes: 0,3,7,9`, repeated every 8s |
| `ws /commands?mode=0&tableIndex=N` | a live table |
| `POST /checkScreenshot` | echoes the uploaded image back |
| `GET /tables` | what is running, as JSON |

This is the **bot host only** — there is no `/move` here. It is meant to be
pointed at the real solver:

```bash
cd ../ZigSolver && ./runapi.sh --port 8000 --cors-origin http://localhost:5173
node fakebot/server.js 8080
```

then `localhost:8080` and `localhost:8000` in the app. Every snapshot it sends
is a spot the solver has never seen, which is the point of it.

Two things the real API changes about how you run this:

* **A real solve is slow** — measured here: ~20s for a flop on the net regime,
  ~70s for an exact turn or river. The hero plays its decision after
  `--hero-delay` (9s by default, tuned to the 2.5s fake `/move` in
  [mock/](../mock)), so it will act before an answer lands and the app will
  cancel the superseded solve. That is a fine thing to watch on purpose; to
  *read* the answers, give it `--hero-delay 60000`.
* **Postflop is served up to 3 players**, so the table does not deal wider
  fields — see `--max-flop-players` below.

Every body this generates has been run through the real
[`api/handhistory.py`](../../ZigSolver/api/handhistory.py): 312 of 312 accepted,
including its `require_decision()`.

## Options

| option | |
|---|---|
| `--tables 0:6,3:2,7:9,9:8` | table index : seat count (2..10). Default is those four |
| `--speed 1` | clock multiplier; 3 is a brisk game, 40 is a stress test |
| `--seed 12345` | same seed, same cards — a spot can be replayed |
| `--hero-delay 9000` | ms the hero sits on a decision before playing it out; give a real solver ~60000 |
| `--max-flop-players 3` | how wide a flop may be dealt; `0` lifts the cap |
| `--quiet` | do not print what goes out |

`--max-flop-players` exists because ZigSolver's postflop advice supports up to
three players: a wider field comes back as `the flop was dealt 5-way`, a 400
rather than an answer. So a seat that is not in the pot yet does not cold-call
into a field that is already full. Uncapped, 21% of flops here were dealt 4+
ways; capped, 1.3% are — the remainder is the big blind checking its option into
a limped field, which it cannot fold. Those spots produce the endpoint's refusal
in the app, which is worth seeing too. Hero decisions per hand are unaffected.

An index that is not in `--tables` is created on demand with 6 seats, so
`#/table/42` works without restarting anything.

A table only runs while something is connected to it, and freezes mid-hand when
the last client goes away.

## What arrives on the socket

**Snapshots** — a body with `position=` lines, sent every time the hero is on
the clock, which is the only frame the front end solves. It is the format
[handBody.js](../src/lib/handBody.js) parses: an optional tournament header, one
block per action in acting order, `Board:` lines between streets, and the hero
closing it on `waiting`.

**Log lines** — everything else, which the app shows as notifications and keeps
in the message dock:

```
New hand #4851 — 6 seats, blinds 0.5/1BB
Flop: 8♣ T♦ 5♠ — pot 6.9BB
Big Stack Bob (BB) is all in for 41.2BB
Showdown: *me* 8♦T♣ (two pair, Ts and 8s), Zara A Q♥7♥ (high card, K high)
Hand #4850: *me* wins 6.9BB with two pair, Ts and 8s
Kenji T busts out; Lars H sits down with 74.3BB
Bot (auto): call 4.1BB
```

## Which spots are worth generating

The endpoint answers a 3-way flop, but it answers it *differently*: the flow is
`mccfr`, the regime `flop-checkdown` or similar, and the response says so —
`multiway pots are answered GTO: opponent reads shape the entry ranges but not
the returned frequencies`. No value net, no exploit pass, and a read changes
nothing you can see.

**Heads-up is where the solver does its real work.** Measured on this host's own
snapshots, against the real API on this box (no CUDA flop solver):

| spot | flow | time | does a read move it? |
|---|---|---|---|
| 3-way flop | `mccfr` | ~2s | no — multiway is answered GTO |
| heads-up flop | `net` | ~17s | no — `net` keeps no solver session, so the profile answer comes back unavailable and you get GTO. A 120s budget did not change that here |
| heads-up turn / river | `exact` | ~35–70s | **yes** — `station` on one turn spot took check from 73.2% (GTO) to 99.8% |

So table **3** (2 seats) is the one to point at when you want to watch solving,
and a turn or river there is the one to point at when you want to watch a read
change the answer. The 6-, 8- and 9-seat tables are for the felt, the HUD stats
and the message dock.

## Solving one by hand

Pull the next hero decision off the host into a file:

```bash
node -e 'const fs=require("fs");const ws=new WebSocket("ws://localhost:8080/commands?mode=0&tableIndex=3");ws.onmessage=e=>{if(/^\s*position\s*=/im.test(e.data)){fs.writeFileSync("/tmp/body.txt",e.data);console.log(e.data);process.exit(0)}}'
```

and ask the solver about it — the JSON is built by python so the body's newlines
and `♠♥♦♣` do not have to be escaped by hand:

```bash
curl -s -X POST http://localhost:8000/move -H 'Content-Type: application/json' -d "$(python3 -c 'import json,sys; print(json.dumps({"body": sys.stdin.read(), "maxSolveTime": 15, "statHands": 500}))' < /tmp/body.txt)"
```

Add `"autoProfile": false` for no read at all, or `"profile": "station"` to ask
under a read — which only shows on a spot that solves `exact`, per the table
above.

## Commands it takes

`read` re-sends the pending snapshot · `pause` freezes the clock · `bot` stops
the hero from acting on its own · `allbot` / `autoenablebot` are acknowledged ·
anything else is treated as a profile token and acknowledged, the way the runner
acknowledges a read.

## Two shapes worth expecting

* **A body with a single block.** When the hero opens the action — UTG, or the
  SB heads-up — nobody has acted yet, so there is nothing else to print. The
  format records actions, not seats, so that body really is one block long, and
  the pot in the header (the blinds) is larger than the pot the blocks replay.
  This is the real shape, not a bug in the fake host, and it is worth having in
  the sample data.
* **Villains folding without a word.** Only the hero's spots are snapshotted, so
  a pot can be won between two frames.

## Deliberately not modelled

**Side pots.** An all-in short stack that wins takes the whole pot. Nothing
downstream reads chip totals — the front end draws stacks and the solver reads
the body — and leaving them out keeps the settle step to a few lines.

**Rake, antes, blind levels.** Blinds are 0.5/1BB forever and stacks are only
topped up when a seat busts.

Stack sizes, HUD stats and personas are generated together, so a station's
numbers and a station's play agree: the read the answer panel shows should match
what you watch it do.

## Layout

```
rng.js        seeded PRNG (mulberry32) — a run can be replayed
cards.js      deck, ♠♥♦♣ printing, a 7-card evaluator for showdowns
players.js    personas, the HUD stats generated from them, the name pool
hand.js       one hand: blinds, betting, streets, settle, and the body text
strategy.js   how a seat picks its action — hand strength, pot odds, persona
table.js      the hand loop, the clock, and the commands
ws.js         the handshake and text framing, by hand
server.js     the CLI and the two routes
```
