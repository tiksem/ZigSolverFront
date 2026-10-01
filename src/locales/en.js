/**
 * English — the default language and the fallback for every other one.
 *
 * Grouped by where the string appears rather than alphabetically, so a screen
 * and its copy are read together. A `{name}` is filled by `t()`; an object of
 * `one` / `other` keys is a counted string and belongs to `tp()`.
 */

export default {
  // --- chrome ------------------------------------------------------------
  nav: {
    tables: 'Tables',
    settings: 'Settings',
    appearance: 'Appearance: {value}',
    theme: { system: 'system', light: 'light', dark: 'dark' },
    language: 'Language: {value}',
  },

  status: {
    idle: 'Not connected',
    connecting: 'Connecting…',
    open: 'Live',
    retrying: 'Reconnecting…',
    closed: 'Disconnected',
  },

  common: {
    close: 'Close',
    retry: 'Retry',
    clear: 'Clear',
    details: 'Details',
    warningsHeading: 'Warnings',
    rawHeading: 'Raw response',
    dismiss: 'Dismiss',
    minimize: 'Minimize',
    whatIsThis: 'What is this?',
  },

  street: {
    preflop: 'Preflop',
    flop: 'Flop',
    turn: 'Turn',
    river: 'River',
    decision: 'Decision',
  },

  card: {
    label: '{rank} of {suit}',
    suit: { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' },
  },

  // --- connect view ------------------------------------------------------
  connect: {
    title: 'ZigSolver',
    notConnected: 'Not connected',
    heading: 'Tables',
    lede:
      'Connect to a running bot host to list its tables. The coordinator prepares each ' +
      'table’s snapshots for the ZigSolver API, and its answer is what you read.',
    coordinator: 'Coordinator',
    coordinatorApply: 'Use',
    coordinatorReady: 'connected',
    coordinatorHint:
      'Nothing answers there. Start it from the ZigSolverCoordinator checkout — ' +
      '<code>uv run zigsolver-coordinator</code> — or point this field at where it runs.',
    botHost: 'Bot host',
    api: 'ZigSolver API',
    apiToken: 'API token',
    apiTokenPlaceholder: 'only if the API requires one',
    apiTokenSaved: 'saved — type to replace',
    optional: 'optional',
    connect: 'Connect',
    disconnect: 'Disconnect',
    bothRequired: 'Both hosts are required.',
    hostRequired: 'A bot host is required.',
    embedded: 'Embedded — started by this app, on loopback.',
    checking: 'Checking…',
    apiLine: 'ZigSolver: {text}',
    turnNetOn: 'turn net on ({device})',
    turnNetOff: 'turn net off',
    libVersion: 'lib {version}',
    flopDevice: 'flop {device}',
    unreachable: 'Could not reach {url}',
    unreachableHint:
      'The coordinator could not reach the API there: it is not running, the address is ' +
      'wrong, or it wants a token (--auth-token) that has not been given.',
    runningTables: 'Running tables',
    table: 'Table {index}',
    waitingBroadcast: 'Connected — waiting for the <code>Indexes:</code> broadcast.',
    reaching: 'Reaching {host}…',
    toggleAllBots: 'Toggle all bots',
    autoEnableBots: 'Auto-enable bots',
    placeholder: 'Enter both hosts above to see the tables the bot is running.',
    placeholderNative: 'Enter the bot host above to see the tables it is running.',
    checkLink: 'Screenshot check',
    checkLinkSub: 'Run a screenshot through the extractor, or crop a region.',
    hostMessages: 'Host messages',
  },

  // --- table view --------------------------------------------------------
  table: {
    title: 'Table {index}',
    subtitle: '{host}  ·  solver {api}',
    socket: 'Table · {status}',
    socketLive: 'live',
    solverSolving: 'Solver · solving',
    solverError: 'Solver · error',
    solverReady: 'Solver · ready',
    coordinatorStatus: 'Coordinator · {status}',
    connectingCoordinator: 'Connecting to the coordinator at {address}',
    connectingCoordinatorNote:
      'It holds the table’s socket and runs the solves; this page only draws them. The ' +
      'connection retries on its own — start the coordinator, or fix its address in the settings.',
    connecting: 'Connecting to {host}',
    connectingNote:
      'The table socket retries automatically. If the table is not running the host replies ' +
      'with a message on the feed below.',
    noSnapshot: 'No snapshot yet',
    noSnapshotNote:
      'The table pushes its state when the hero has a decision, and it is sent to the solver ' +
      'as it arrives. Hit <kbd>Read</kbd> to ask the runner to re-read the table.',
    sent: 'Sent “{token}”',
    dropped: 'Not connected — command dropped',
    screenCaptured: 'Screen saved to the API for this failure',
    hostMessages: 'Host messages',
    history: 'History',
    historyTitle: 'Solve history — {count}',
  },

  // --- the solve history -------------------------------------------------
  history: {
    title: 'Solve history',
    subtitle: 'Table {index} · {hands} · {decisions}',
    hands: { one: '{count} hand', other: '{count} hands' },
    decisions: { one: '{count} decision', other: '{count} decisions' },
    empty:
      'Nothing answered at this table yet. Every answer that lands on screen is kept here, ' +
      'with the snapshot it was asked on.',
    rejected: 'Rejected',
    note:
      'Kept by the coordinator, per table, up to the last 150 decisions. Open a hand for its ' +
      'players, action, answers and ranges; the live table keeps solving underneath.',
    clear: 'Clear history',
    clearConfirm: 'Click again to clear',
    reviewing: 'Reviewing a past decision',
    older: 'Older decision',
    newer: 'Newer decision',
    backToLive: 'Back to live',
    liveSolving: 'Live table is solving',
    handTitle: 'Hand at table {index}',
    allHands: 'All hands',
    openHand: 'Open hand',
    finished: 'Played to the end',
    lastSeen: 'Last seen on the {street}',
    decisionsLabel: 'Decisions',
    handSection: 'The hand',
    decisionsSection: 'Decisions and answers',
    rangesSection: 'Ranges',
    noRanges:
      'No ranges for this hand: none of its answers was a postflop GTO solve, which is the only ' +
      'kind that reports them.',
    unreadable: 'This snapshot could not be read back.',
    showOnFelt: 'Show on felt',
    onFelt: 'On the felt',
  },

  // --- the preflop engine picker -----------------------------------------
  preflopBar: {
    heading: 'Preflop',
    note: 'which engine plays the hand before the flop',
    noService: 'The blueprint service is not configured on this API — preflop is played by the algorithm.',
    drew: 'This hand drew {engine}.',
    forced: 'The blueprint was drawn, but {reason} — played by the algorithm.',
  },

  preflopMix: {
    title: 'Advanced preflop',
    subtitle: 'How each hand picks its preflop engine',
    mix: 'Mix',
    mixDesc:
      'One coin per hand, thrown on its first preflop decision and kept for the rest of the ' +
      'preflop. The percentage is how often the blueprint wins the toss — not a blend of the ' +
      'two answers.',
    sliderLabel: 'Share of hands played by the blueprint',
  },

  // --- the three preflop engines -----------------------------------------
  preflop: {
    alg: {
      short: 'Alg',
      title: 'Algorithm',
      tagline: 'The chart, bent by the opponents\u2019 stats',
      detail:
        'Preflop ranges from rangegen: a fast heuristic keyed on position, stack depth and the ' +
        'table\u2019s measured tendencies. It answers every spot instantly and never declines one, ' +
        'which is why it is the default and the fallback.',
    },
    gto: {
      short: 'GTO',
      title: 'Blueprint',
      tagline: 'An exact solve of the actual game',
      detail:
        'A presolved equilibrium looked up from the blueprint grid: the real game for this table ' +
        'size, stack depth and tournament pressure, solved exactly rather than approximated. ' +
        'Where the grid does not cover a spot the answer falls back to the algorithm and says so.',
    },
    advanced: {
      short: 'Advanced',
      title: 'Advanced preflop',
      tagline: 'Draw one per hand at a mix you set',
      detail:
        'Neither engine outright — a coin thrown once per hand, on its first preflop decision, ' +
        'at the mix you set. The whole preflop of that hand is then played by whichever won: ' +
        'opening off the blueprint and facing the 3-bet off the chart would be a line neither ' +
        'engine would have played.',
    },
  },

  // --- the regime picker -------------------------------------------------
  regimeBar: {
    heading: 'Regime',
    note: 'Define how to select a strategy to play postflop',
    solving: 'Solving…',
    solve: 'Solve',
    resolve: 'Re-solve',
    solveSettings: 'Solve settings',
    manualSend: 'manual send',
    noCache: 'no cache',
    tableCommands: 'Table',
    read: 'Read',
    bot: 'Bot',
    pause: 'Pause',
    about: 'About {name}',
    limitsHeading: 'Where it does not apply',
    answerHeading: 'Reading the answer',
    exploitAnswer:
      'The panel lists every action with its EV, best first, and the top row is the move — ' +
      'there is no frequency to mix at. <b>EV</b> is counted from this decision on: chips ' +
      'already in the pot are sunk, so folding is 0 and everything else is read against it. ' +
      '<b>Support</b> is how much real play the size models saw at that size; a winning ' +
      'branch with thin support is one the models are extrapolating on, and the warnings say so.',
    pending: {
      exploit:
        'Play exploit when available: preflop it prices short-stack and all-in spots, the ' +
        'rest from the flop.',
      manual:
        'You are asked on the flop, once for the whole hand. Preflop is not asked about.',
      advanced:
        'The coin is drawn on the flop, for the whole hand. Nothing is drawn preflop.',
    },
    manualAsks: 'This hand stops and asks once, before anything is sent.',
    manualSkipped: 'Answered GTO without asking: {why}.',
    exploitRefused: 'This hand is GTO instead: {why}.',
    exploitDeep: 'This preflop spot is the preflop algorithm’s: {why}.',
    advancedRefused: 'This hand is GTO: {why}.',
    parkedGto: 'Every hand is GTO — the mix is parked at no Exploit.',
    parkedExploit: 'Every hand is Exploit — the mix is parked at no GTO.',
    mix: '{pct}% of hands drawn Exploit, the rest GTO.',
    drew: ' This hand drew {regime}.',
  },

  /** The refusals the coordinator hands back, rendered wherever they are quoted. */
  reason: {
    headsUpTable: 'a two-handed table is outside the models’ training data',
    multiwayFlop: 'the flop was {count}-way and the models are heads-up postflop',
    noPreflopService: 'this API has no blueprint service configured',
    deepPreflop:
      'the effective stack is {count}BB, deeper than the all-in calculator prices preflop',
    noStats: 'the HUD carries no stats on the villain',
    fewStats: {
      one: 'the HUD carries only {count} stat on the villain',
      other: 'the HUD carries only {count} stats on the villain',
    },
  },

  // --- the four regimes --------------------------------------------------
  regime: {
    gto: {
      short: 'GTO',
      title: 'GTO',
      tagline: 'Play the equilibrium strategy.',
      detail:
        'A real CFR solve of the spot: both ranges estimated from the players’ own preflop ' +
        'action and HUD stats, the postflop line replayed through the solved tree, and the ' +
        'answer is the hero hand’s strategy there. It is a distribution — mix at the stated ' +
        'frequencies. It gives up nothing to an opponent who is playing you back, and it also ' +
        'gives up whatever this particular villain is handing out.',
    },
    exploit: {
      short: 'Exploit',
      title: 'Exploit',
      tagline: 'The maximum-EV action against this villain’s measured behaviour.',
      detail:
        'Not a solve and not a deviation from one. Villain’s action, size and showdown ' +
        'probabilities come from models fitted to real players with these HUD stats, and the ' +
        'hero simply maximizes against them — an expectimax, so there is no equilibrium in it ' +
        'and nothing to mix. The answer is one action with the EV of every alternative next to ' +
        'it. It is also maximally exploitable back, and only as good as the read: with no HUD ' +
        'stats on the villain the models describe the average player, not this one.',
      limits:
        'Preflop it is the all-in calculator, where the effective stack is 30BB or under or a ' +
        'shove is already in front of the hero — every move priced against these opponents’ ' +
        'measured jam and call ranges, in chips and in prize equity. A deeper preflop spot is ' +
        'played by the preflop algorithm: not a fallback, a spot this question was never about. ' +
        'Of the hands that do see a flop, one dealt three or more ways and one at a two-handed ' +
        'table are outside what the postflop models were fitted on, and those are answered GTO ' +
        'for the whole hand — the panel says so when it happens. Postflop there is no ICM in it: ' +
        'a bubble spot gets a cash-game answer there.',
    },
    manual: {
      short: 'Manual',
      title: 'Manual',
      tagline: 'Ask once per hand.',
      detail:
        'Nothing is sent until you pick. The flop stops and asks GTO or Exploit, and the turn and ' +
        'the river of that hand are answered the same way without asking again — the question is ' +
        'which regime the hand is played under, and it is only a real question once. Preflop is ' +
        'never asked about: the preflop algorithm plays it either way. Neither are hands exploit ' +
        'cannot answer, which go straight to GTO. Clicking Manual again re-asks about the spot on ' +
        'screen, which is how you change your mind mid-hand.',
    },
    advanced: {
      short: 'Advanced',
      title: 'Advanced',
      tagline: 'Draw one per hand, at a mix you set.',
      detail:
        'A coin weighted the way you set it is flipped on the flop, once, and the winner is the ' +
        'question the rest of that hand asks — nothing is blended, each answer is wholly one ' +
        'regime or the other. It exists because the two are exploitable in opposite directions: ' +
        'playing every hand for maximum EV against a read is itself a pattern, and a mix leaves ' +
        'the equilibrium in enough hands that there is nothing steady to play back at. The draw ' +
        'is per hand, not per decision, so a hand that comes up Exploit on the flop is still ' +
        'Exploit on the turn and the river.',
      limits:
        'Nothing is drawn preflop — the preflop algorithm plays it and the coin waits for the ' +
        'flop. Exploit’s own limits then apply to the draw: a hand it cannot answer is GTO ' +
        'whatever the coin says. The stats gate, when on, is the other half — a villain the HUD ' +
        'barely covers is answered GTO rather than exploited against the population average.',
    },
  },

  // --- advanced sheet ----------------------------------------------------
  advanced: {
    title: 'Advanced',
    subtitle: 'How each hand picks its regime',
    mix: 'Mix',
    mixDesc:
      'One weighted coin per hand, thrown on the flop. Nothing is blended — the winner is the ' +
      'only question asked, so each answer is a whole GTO distribution or a whole Exploit ' +
      'ranking. The draw is per hand, not per decision: a hand that comes up Exploit stays ' +
      'Exploit through the turn and the river.',
    sliderLabel: 'Share of hands answered Exploit',
    gate: 'Exploit only on {n}+ stats',
    gateDesc:
      'Skip the coin and answer GTO whenever the HUD carries fewer than {n} readable stats on ' +
      'the villain — VPIP, PFR, ATS and the rest. Everything the HUD does not carry is imputed ' +
      'from the population, so under a few of them the exploit answer is maximum EV against the ' +
      'average player, not this one, and it is maximally exploitable back for the trouble.',
    gatePending: 'Checked on the flop, against the villain the hand is heads-up with.',
    gateNoVillain: 'No villain to read here: {why}.',
    gateNone: 'The HUD carries no stats on this villain — the draw is GTO while this is on.',
    gateThin: {
      one: 'This villain: {count} stat ({list}) — the draw is GTO while this is on.',
      other: 'This villain: {count} stats ({list}) — the draw is GTO while this is on.',
    },
    gateOk: 'This villain: {count} stats ({list}) — the draw runs.',
    foot:
      'Nothing is drawn preflop — the preflop algorithm plays it whatever is selected, and the ' +
      'coin waits for the flop. Exploit’s own limits then come first: a flop dealt three or more ' +
      'ways and a two-handed table are answered GTO for the whole hand whatever the coin says.',
  },

  // --- manual prompt -----------------------------------------------------
  prompt: {
    eyebrow: 'Manual',
    ask: 'Which answer do you want for this hand?',
    sub: 'It holds for every street of it — pick Manual again to change your mind.',
  },

  // --- the answer panel --------------------------------------------------
  panel: {
    rejected: 'Rejected',
    waiting: 'Waiting',
    asked: 'asked {regime}',
    howSolved: 'How this was solved',
    solving: 'solving',
    playMaxEv: 'Play (max EV)',
    playGto: 'Play (GTO)',
    colAction: 'Action',
    colEv: 'EV (BB)',
    colPctPot: '% pot',
    colSupport: 'Support',
    colFrequency: 'Frequency',
    colEvIcm: 'EV ICM',
    colWin: 'Win',
    blurbPreflopAllin:
      'Every move priced against these opponents’ measured jam and call ranges — in chips and, ' +
      'in a tournament, in prize equity. The top row is the move.',
    blurbChartAllin:
      'The chart, with the stack-off decided on equity against this opponent’s measured range, ' +
      'everyone behind, and the prize ladder.',
    allinHeading: 'All-in calculator',
    allinLine:
      'Best <b>{action}</b>: EV {ev} BB{icm} · wins the pot {win}% · folds through {fold}%',
    allinIcmPart: ', {icm} BB in prize equity',
    allinMetricChips: 'decided on chip EV',
    allinMetricIcm: 'decided on prize equity (ICM)',
    allinShow: 'Show rows',
    allinHide: 'Hide rows',
    numbersAllin:
      '<b>EV ICM</b> is the same expectation in tournament prize equity, in chip-equivalent BB ' +
      'against this decision’s fold; without a tournament it equals EV (BB). <b>Win</b> is how ' +
      'often the hero ends up with the pot — everyone folding, or winning the showdown.',
    blurbExploit:
      'Maximum EV against this villain’s measured behaviour. The top row is the move — there is ' +
      'nothing to mix at, and every EV is counted from this decision on.',
    blurbPreflop: 'A chart, already bent by the opponents’ stats — mix at these frequencies.',
    blurbGto: 'The equilibrium strategy at this node — mix at these frequencies.',
    fellBack:
      '<b>{regime} was asked for and could not be answered here</b> — this is the GTO answer ' +
      'instead.',
    why: 'Why',
    thinSupport:
      'The recommended size has thin population support — the models are extrapolating there.',
    warningCount: {
      one: '{count} warning —',
      other: '{count} warnings —',
    },
    seeDetails: 'see details',
    solvingEllipsis: 'Solving…',
    idle: 'Each snapshot is sent to the ZigSolver API, and its answer lands here.',
    solverSubtitle: 'solver: {name}',
    flowHeading: 'Flow: {flow}',
    numbersHeading: 'Reading the numbers',
    numbersMix:
      'In the <b>GTO</b> regime the column is a distribution: mix at those frequencies, and ' +
      '<b>Play</b> is one random draw from it. In the <b>Exploit</b> regime there is nothing to ' +
      'mix — the rows are ranked by EV against the modelled opponent and the top one is the move.',
    numbersEv:
      '<b>EV (BB)</b> counts from this decision on: chips already in the pot are sunk, so folding ' +
      'is 0 by construction and every other number is read against it. <b>% pot</b> is the same ' +
      'number over the pot at the node. <b>Support</b> is the share of real play the size models ' +
      'saw at that size — a winning branch under about 2% is one the models are extrapolating on, ' +
      'which the warnings also say.',
    detailsTitle: 'How it was solved',
    // The stopwatch: `wall` is what the browser measured around the call, `api`
    // is the responseTime the endpoint reported for the same call.
    wallShort: 'wall',
    apiShort: 'api',
    timingTitle: 'Measured in the browser, against the responseTime the API reported',
  },

  /** Labels of the details dump. The values stay as the API reported them. */
  facts: {
    regime: 'Regime',
    requested: 'Requested',
    solver: 'Solver',
    flow: 'Flow',
    street: 'Street',
    hand: 'Hand',
    pot: 'Pot',
    toCall: 'To call',
    seats: 'Seats',
    actingSeat: 'Acting seat',
    board: 'Board',
    solveTime: 'Solve time',
    predicted: 'Predicted',
    responseTime: 'Response time',
    measured: 'Measured here',
    overhead: 'Overhead',
    cached: 'Cached',
    rootedAt: 'Rooted at',
    entryRanges: 'Entry ranges',
    players: 'Players',
    iterations: 'Iterations',
    infosets: 'Infosets',
    itersPerInfoset: 'Iters / infoset',
    depthLimit: 'Depth limit',
    depthValue: 'Past the limit',
    thinnedFrom: 'Thinned from',
    thinnedValue: '{n}-way at the {street}',
    narrowedOn: 'Narrowed on',
    narrowTime: 'Narrow time',
    runouts: 'Runouts',
    leaf: 'Leaf',
    cardRemoval: 'Card removal',
    betMenu: 'Bet menu',
    raiseMenu: 'Raise menu',
    nodes: 'Nodes',
    modelCalls: 'Model calls',
    villainStats: 'Villain stats read',
    overHands: 'Over hands',
    handClass: 'Hand class',
    effectiveStack: 'Effective stack',
    raisesBefore: 'Raises before',
    callersBefore: 'Callers before',
    aggressor: 'Aggressor',
    node: 'Node',
    budgetSent: 'Budget sent',
    handId: 'handId',
    allinMetric: 'All-in metric',
    allinStackOff: 'Stack-off',
    allinDecides: 'Calculator decides',
    allinReopened: 'Betting reopened',
    allinRunouts: 'Runouts sampled',
    allinNodes: 'All-in nodes',
    allinModelCalls: 'All-in model calls',
    allinSeconds: 'All-in calc time',
  },

  /** The ranges sheet: what the solve was actually run against. */
  ranges: {
    open: 'Ranges',
    noneAllin:
      'No ranges: the all-in calculator prices the hero’s hand against each opponent’s ' +
      'measured jam and call composition, scaled to their own frequency, and those are not ' +
      'returned as charts.',
    title: 'Ranges the solve ran on',
    subtitle: 'From {source}',
    heading: 'Ranges',
    available:
      'This answer carries the ranges it was solved against, per player and per street.',
    noneExploit:
      'No ranges: the exploit regime never enumerates villain’s. It walks the hand against ' +
      'behavioural models fitted on real play, so there is no range to draw — the models are ' +
      'the opponent.',
    nonePreflop:
      'No ranges: preflop is answered by a chart bent by the opponents’ VPIP / PFR / ATS / ' +
      '3BET, not solved against their ranges. They are built for the first postflop street.',
    noneOther:
      'No ranges on this answer. The endpoint reports them for a postflop GTO solve; an older ' +
      'API does not report them at all.',
    playersLabel: 'Players',
    streetsLabel: 'Streets',
    hero: 'You',
    width: 'Width',
    combos: 'Combos',
    narrowed: 'Narrowed',
    widened: 'Widened',
    points: 'pts',
    since: 'since the {street}',
    notInGame:
      'No range for this player at the {street}: they had no seat in the game solved there. A ' +
      'player who has folded leaves their chips in the pot as dead money and is not in the tree.',
    empty: 'Nothing has come back carrying ranges for this hand yet.',
    chartLabel: 'The 13 × 13 hand chart',
    cellTitle: '{hand} — held at {pct}%, {held} of {combos} combos',
    cellDead: '{hand} — no combos left on this board',
    note:
      'Each cell is how much of that hand the range holds, averaged over the combos the board ' +
      'leaves live. Hatched cells are hands the board has taken every combo of. Width is the ' +
      'share of every live combo, so two players on one board are comparable.',
  },

  // --- settings sheet ----------------------------------------------------
  settings: {
    title: 'Settings',
    subtitle: 'How each solve is requested',
    solveGroup: 'Solve',
    budget: 'Solve budget',
    budgetDesc:
      '<code>maxSolveTime</code> — the wall-time budget for the flop solve. The balancer runs ' +
      'the strongest regime that fits it: full menus, then reduced menus, then reduced menus ' +
      'with clustered turn runouts, then the net-truncated flow. Three-way pots ladder the same ' +
      'way over the blueprint’s betting menus. More time buys a better answer, not a different ' +
      'question.',
    netBudget: 'Net solve budget',
    netBudgetDesc:
      '<code>maxNetSolveTime</code> — seconds, used only when the balancer settles on the ' +
      'net-truncated flow. The ladder is still priced against the solve budget above, so this ' +
      'does not change which regime runs — only how long the net solve gets once it does. It ' +
      'times the solve <b>itself</b>: range generation, building the tree and loading the net ' +
      'come on top. The net keeps improving with every second, so it can be worth more time ' +
      'than an exact solve needs. Leave empty to give it the solve budget. Flop only.',
    netBudgetPlaceholder: '= {value}s',
    autoSolve: 'Solve every snapshot',
    autoSolveDesc:
      'Send each snapshot to the API the moment it arrives. Off, the table still draws and only ' +
      'Re-solve or a change of regime calls the solver.',
    cancel: 'Cancel superseded solves',
    cancelDesc:
      'When a newer snapshot arrives, <code>POST /cancel</code> kills the one still running: it ' +
      'SIGKILLs the solver subprocess and frees the solve semaphore, so the answer you do want ' +
      'is not queued behind one you do not. Off, the old solve runs to completion and its answer ' +
      'is discarded on arrival. A newer READ of the decision already being solved — same street, ' +
      'same cards, no new action — never supersedes it either way: it goes out alongside, so a ' +
      'misread cannot cost you an answer that was on its way.',
    cache: 'Per-hand tree cache',
    cacheDesc:
      '<code>handId</code> — keys the solved tree to this hand, so the next street and any ' +
      're-solve reuse it instead of solving from scratch. GTO only: an Exploit answer walks the ' +
      'hand rather than a subgame, so there is nothing for a later street to inherit and it is ' +
      'recomputed every time either way.',
    statHands: 'Stat sample size',
    statHandsDesc:
      '<code>statHands</code> — how many hands the HUD stats in the snapshot cover. It prices ' +
      'the read the Exploit regime runs on: everything the HUD does not carry is imputed from ' +
      'the population, and a thin sample widens those imputations rather than pretending to a ' +
      'measurement. Leave empty when you do not know — it is then read as “a lot”, i.e. the read ' +
      'at full strength.',
    statHandsPlaceholder: 'unknown',
    stableSample: 'Hold the sampled action',
    stableSampleDesc:
      'Keep one draw while the same spot is re-solved, so a re-solve does not also re-roll the ' +
      'dice. Off, every answer samples fresh. GTO only — an Exploit answer is a ranking by EV, ' +
      'not a distribution, and its top row is the move.',
    qualityGroup: 'Flop solve quality',
    qualityNote:
      'The three numbers the flop regime ladder runs on. Leave a field empty to use the API’s ' +
      'own default (shown greyed). Flop only — turn and river are always solved as their own ' +
      'street at the widest sizing grid. A hand that reaches the river is solved with a wider ' +
      'raise menu on top of that (50 / 75 / 100% of pot, plus all-in): nothing follows the ' +
      'river, so the extra sizes are nearly free there — inside a flop or turn tree they would ' +
      'not be.',
    gate: 'Solve exactly when it beats',
    gateDesc:
      '<code>gateExploitability</code> — % of pot. Before choosing, the balancer predicts how ' +
      'exploitable each regime’s solve would be at the iterations your budget buys, and takes ' +
      'the strongest one at or under this. The net-truncated flow it falls back to measures ' +
      '5.6–12% itself, so anything below that is a real preference for an exact solve. Lower is ' +
      'stricter: fewer spots qualify and more drop to the net. <b>0</b> never solves exactly.',
    target: 'Stop at',
    targetDesc:
      '<code>targetExploitability</code> — % of pot. The solve runs its own best-response check ' +
      'as it goes and stops once it reaches this. Lower keeps it iterating longer for a sharper ' +
      'answer; the budget still ends it either way.',
    minTime: 'Minimum solve time',
    minTimeDesc:
      '<code>minSolveTime</code> — seconds. A floor under the stop above: a flop that reaches ' +
      'the target in two seconds keeps improving until this much time is spent, which is most of ' +
      'what the budget buys on an easy board. It never runs past the solve budget — a value ' +
      'above it is clamped, and the answer says so.',
    serverDefault: 'server default',
    endpointsGroup: 'Endpoints',
    coordinator: 'Coordinator',
    coordinatorDesc:
      'Where ZigSolverCoordinator runs — the one server this page talks to. Kept in this ' +
      'browser; everything else on this sheet is kept by the coordinator.',
    botHost: 'Bot host',
    botHostDesc:
      'The runner the coordinator connects to: its table sockets, its screenshots and the ' +
      'screenshot check.',
    api: 'ZigSolver API',
    apiDesc: 'Where the coordinator POSTs the snapshots. Changing it applies to the next solve.',
    apiEmbeddedDesc:
      'The solver this app started, on loopback and behind a token minted for ' +
      'this launch. Nothing else on the machine can reach it, and there is no ' +
      'other one to point at.',
    apiToken: 'API token',
    apiTokenDesc:
      'The coordinator sends it as “Authorization: Bearer …” with every call to the API, ' +
      'and never back to a page. Needed only for an API started with --auth-token.',
    apiTokenPlaceholder: 'only if the API requires one',
    apiTokenSaved: 'saved — type to replace',
    apiTokenForget: 'Forget',
    reset: 'Reset solve settings',
  },

  // --- hand details ------------------------------------------------------
  details: {
    tabPlayers: 'Players',
    tabAction: 'Action',
    tabSpot: 'Spot',
    player: 'Player',
    position: 'Pos',
    stack: 'Stack',
    inPot: 'In pot',
    you: 'You',
    allIn: 'all in',
    folded: 'folded',
    playersFine:
      'Stacks are chips <i>behind</i> — posted and bet chips are excluded. Missing stats fall ' +
      'back to population averages on the solver side; <code>3BET</code> is the GG Smart HUD ' +
      'definition and is converted before it reaches rangegen.',
    noAction: 'No action recorded on this street.',
    yourTurn: 'Your turn — the client is asking for a decision.',
    street: 'Street',
    tableSize: 'Table size',
    seatCount: {
      one: '{count} seat',
      other: '{count} seats',
    },
    contenders: 'Contenders',
    totalPot: 'Total pot',
    replayedPot: 'Replayed pot',
    currentBet: 'Current bet',
    heroToCall: 'Hero to call',
    heroHand: 'Hero hand',
    playersLeft: 'Players left',
    playersPaid: 'Players paid',
    averageStack: 'Average stack',
    showRaw: 'Show raw snapshot',
    hideRaw: 'Hide snapshot',
  },

  /** Past-tense action lines in the history pane. */
  act: {
    fold: 'folds',
    check: 'checks',
    call: 'calls',
    callAmount: 'calls {amount}',
    bet: 'bets {amount}',
    raise: 'raises to {amount}',
    allIn: 'is all in',
    allInAmount: 'is all in for {amount}',
  },

  // --- the felt ----------------------------------------------------------
  felt: {
    totalPot: 'Total pot',
    toCall: 'To call {amount}',
    handOver: 'HAND FINISHED',
    // Short forms — the chips are on the felt, and `details.*` carries the full
    // wording as their tooltip.
    playersLeft: 'Left',
    playersPaid: 'Paid',
    averageStack: 'Avg stack',
  },

  seat: {
    you: 'You',
    dealerButton: 'Dealer button',
    allInTag: 'ALL IN',
    foldedTag: 'FOLDED',
    inFront: 'In front this street',
    toAct: 'To act…',
    fold: 'Fold',
    check: 'Check',
    call: 'Call',
    callAmount: 'Call {amount}',
    bet: 'Bet {amount}',
    raise: 'Raise {amount}',
    allIn: 'All in',
  },

  // --- message dock ------------------------------------------------------
  dock: {
    title: 'Messages',
    empty: 'Nothing from the host yet.',
  },

  // --- screenshot check --------------------------------------------------
  check: {
    navTitle: 'Screenshot check',
    heading: 'Check a screenshot',
    lede:
      'Posts to <code>/checkScreenshot</code>. With no crop the image goes through the ' +
      'extractor’s debug pass; with a crop it comes back cropped to those coordinates.',
    server: 'Server',
    selected: 'Selected screenshot',
    replace: 'Replace',
    clear: 'Clear',
    dropzone: 'Drop an image, paste, or choose a file',
    dropzoneKinds: 'PNG or JPEG',
    check2: 'Check 2',
    check2Desc: 'Second-pass processor instead of the extractor debug pass',
    crop: 'Crop',
    cropDesc: 'Four integers: x1, y1, x2, y2. Leave empty for a full check.',
    tableIndex: 'Table index for crop',
    tableIndexDesc: 'Which table the crop coordinates belong to',
    submit: 'Check screenshot',
    submitting: 'Checking…',
    ms: '{ms} ms',
    response: 'Response',
    download: 'Download',
    resultAlt: 'Check result',
    emptyResponse: '(empty response)',
    badCrop: 'Crop must be four comma-separated integers, e.g. 100,80,640,480',
    noServer: 'Set a server URL first',
    failed: 'Request failed: {error}. Check the bot host address and that the coordinator is connected.',
  },

  // --- the coordinator's socket -------------------------------------------
  coordinator: {
    offline: 'Not connected to the coordinator',
    lost: 'The connection to the coordinator was lost',
    timeout: 'The coordinator did not answer',
    refused: 'The coordinator refused the request',
  },

  // --- API client --------------------------------------------------------
  api: {
    unreachable: 'Could not reach the ZigSolver API at {url}',
    unreachableHint:
      'The coordinator could not reach it: either the API is not running at that address, or ' +
      'it wants a token (--auth-token) the coordinator was not given.',
    refusedHint:
      'The endpoint refused the snapshot — /move is strict about the sequence and only answers ' +
      'when the body ends on the hero’s decision.',
    notAnAnswer: 'The API returned a body that is not a /move answer',
  },

  /** Snapshot-parser warnings, shown on the Spot pane. */
  parse: {
    unknownPosition: 'line {line}: unknown position {value}',
    unreadableStat: 'line {line}: unreadable stat {text}',
    secondAction: 'line {line}: second action {text} for {name}',
    unrecognizedLine: 'line {line}: unrecognized line {text}',
  },

  // --- HUD stat names ----------------------------------------------------
  // --- the four stats, typed by hand --------------------------------------
  stats: {
    edit: 'Type stats by hand',
    add: '+ stats',
    typedTitle: '{stat} — typed by hand, not read off the table',
    title: 'Stats: {name}',
    subtitle: '{position} at table {index} — kept under the name the snapshot carries',
    lede:
      'Every stat the snapshot does not carry is imputed from the population, so a villain the ' +
      'HUD says nothing about is answered as the average player. What you type here is written ' +
      'into the snapshot the way the host writes it, and the solver reads it exactly as it reads ' +
      'the client’s own.',
    imputed: 'imputed',
    writes: 'Written into every snapshot',
    noneTyped: 'Nothing typed — this seat goes out as the host wrote it.',
    clear: 'Clear typed stats',
  },

  // --- the tournament header, typed by hand ------------------------------
  tourney: {
    edit: 'Type the tournament header by hand',
    add: '+ tournament',
    // On the chip beside the header it has to be findable at a glance, and the
    // three chips next to it have already said what the numbers are.
    editShort: 'Tournament',
    typedTitle: '{field} — typed by hand, not read off the table',
    title: 'Tournament header',
    subtitle: 'Table {index} — written into every snapshot this table sends',
    lede:
      'The three numbers the header carries are what turn a chip answer into a money one. A ' +
      'client that does not report them is answered as a cash game, at a pay jump where folding ' +
      'is worth more than the chips say. What you type here is written into the header the way ' +
      'the host writes it, and the solver reads it exactly as it reads the client’s own.',
    desc: {
      playersLeft: 'Runners still in the tournament',
      playersPaid: 'How many places the payout ladder covers',
      averageStack: 'What the field averages, in big blinds',
    },
    absent: 'absent',
    needBoth:
      'Players left and players paid are both needed before the solver prices anything under ' +
      'ICM — with one of them the answer comes back in chips.',
    needAverage:
      'Without an average stack the answer comes back in chips: the payout ladder has no field ' +
      'to weigh the hero against.',
    icm: 'The header is complete — this table’s answers are priced under ICM.',
    writes: 'Written into every snapshot',
    noneTyped: 'Nothing typed — the header goes out as the host wrote it.',
    clear: 'Clear typed header',
  },
  stat: {
    VPIP: 'Voluntarily put money in pot',
    PFR: 'Preflop raise',
    '3BET': '3-bet (GG Smart HUD definition)',
    ATS: 'Attempt to steal',
    F3B: 'Fold to a 3-bet',
    'FTS BB': 'Fold the big blind to a steal',
    'FTS SB': 'Fold the small blind to a steal',
    'W$SD': 'Won money at showdown',
    WTSD: 'Went to showdown',
    WWSF: 'Won when saw flop',
    AF: 'Aggression factor (a ratio, not a percent)',
    'FLOP C-BET': 'Flop continuation bet',
    'TURN C-BET': 'Turn continuation bet',
    'RIVER C-BET': 'River continuation bet',
    'FLOP FOLD TO C-BET': 'Folds to a flop c-bet',
    'TURN FOLD TO C-BET': 'Folds to a turn c-bet',
    'RIVER FOLD TO C-BET': 'Folds to a river c-bet',
    'ALL-IN FREQUENCY': 'All-in frequency (accepted; not yet calibrated)',
  },

  // --- the decision category the engine assigned -------------------------
  decision: {
    value_bet: 'Value bet',
    thin_value: 'Thin value',
    protection: 'Protection',
    semi_bluff: 'Semi-bluff',
    bluff: 'Bluff',
    bluff_raise: 'Bluff raise',
    trap: 'Trap',
    bluff_catch: 'Bluff catch',
    regular_call: 'Regular call',
    regular_check: 'Regular check',
    give_up_fold: 'Give-up fold',
    give_up_check: 'Give-up check',
    no_equity_fold: 'No-equity fold',
    no_equity_call: 'No-equity call',
  },

  // --- what the `solver` field of an answer means ------------------------
  solver: {
    'preflop-allin': {
      title: 'Preflop all-in calculator',
      summary:
        'Preflop, short stacks: every move priced in chips and prize equity against these opponents.',
      detail:
        'The Exploit regime’s preflop answer. Not a chart and not a solve: an expectimax over ' +
        'what THESE opponents do. Each of them gets a fold / call / jam probability from the ' +
        'fitted preflop action model — their HUD stats, the exact spot (stacks, pot, raises, ' +
        'callers, players behind, antes) and the tournament stage, where the bubble, the money ' +
        'and the final table move the fold rates — and the measured all-in compositions say ' +
        'which hands they do it with: a player all-in before the flop shows their cards ' +
        'whatever they hold, so those reveals ARE the ranges. The hero’s hand is priced against ' +
        'them with exact card removal heads-up and sampled runouts three-way, and every leaf ' +
        'goes through the same ICM model the GTO path solves with, so a tournament answer is ' +
        'prize equity (EV ICM) and a cash answer is chips. A small open carries the 3bet-or-fold ' +
        'continuation it commits to: facing a jam the hero calls or folds, facing a small 3bet ' +
        'jams or folds, whichever is worth more. The top row is the move.\n\n' +
        'It applies where a shove is the move to price — the effective stack at 30BB or under, ' +
        'or a shove already in front of the hero; deeper preflop spots keep the chart. What it ' +
        'abstracts, it says in the warnings: at most two opponents reach a showdown, an ' +
        'opponent’s raise over a shove is priced as a call, and a flat call is priced as a ' +
        'realized-equity share of the pot rather than a played-out street.',
    },
    'chart+allin': {
      title: 'Chart + all-in calculator',
      summary: 'The preflop chart, with its all-in decisions made by the all-in calculator.',
      detail:
        'A GTO-regime preflop answer where the hero’s chips go all in: the hero faces an ' +
        'all-in, calling would leave no more than a pot behind (a stack-off in disguise), or ' +
        'the hero’s re-raise is itself a shove (a 3bet, 4bet or squeeze jam). The chart has ' +
        'nothing to price such a decision with (it ramps a playability ordering, and a ' +
        'stack-off runs out), so the all-in calculator decides it: the hero’s equity against ' +
        'what these opponents actually shove or call with, everyone still behind, and the ' +
        'prize ladder. Facing an all-in or a committed call it decides the whole continue ' +
        'leg; for a re-raise shove it decides jam against fold, and the chart’s flat call ' +
        'stays as it was. The verdict is served as a frequency — pure beyond a small EV band, ' +
        'a linear mix inside it — and the chart’s own rows stay in the details as ' +
        'chartActions. A re-raise appears only where the betting is reopened for the hero: ' +
        'an incomplete all-in does not reopen it.',
    },
    chart: {
      title: 'Preflop chart',
      summary: 'No solver ran — the preflop answer is a chart.',
      detail:
        'The baseline is the measured TAG cluster deviated to 3bet-or-fold: never limp, ' +
        'unopened pots are open-raise or fold, facing aggression re-raise or fold. Two ' +
        'exceptions produce calls — small pocket pairs set-mining at a priced call, and the ' +
        'BB flatting a single raiser when nobody else is in. The opponents’ VPIP / PFR / ' +
        'ATS / 3BET bend the widths. There is no GTO twin preflop: the chart IS the baseline.',
    },
    blueprint: {
      title: 'Preflop blueprint',
      summary: 'An exact preflop solve, looked up in the presolved grid.',
      detail:
        'The preflop service has a presolved blueprint covering this spot, so the answer is ' +
        'that solve’s own strategy rather than the chart. Used only when the service is ' +
        'configured and its grid covers the spot; everything else stays on the chart.',
    },
    exact: {
      title: 'Exact CFR',
      summary: 'Heads-up, solved exactly by the CPU/GPU CFR engine.',
      detail:
        'The strongest 2-player path: a real tree solved to a 1%-of-pot early-stop target ' +
        'within the request budget. The hero’s combo is injected into the flop entry range ' +
        'when the estimate does not contain it, so the answer is about the hand actually held. ' +
        'A flop this badge covers may still have been solved on a cheaper abstraction of the ' +
        'same exact engine — trimmed bet menus, or clustered turn runouts — when the full one ' +
        'did not fit; the Flow line below says which.',
    },
    exploit: {
      title: 'Behavioural expectimax',
      summary: 'Not a solve: maximum EV against models fitted to real players.',
      detail:
        'Against a FIXED opponent model there is no equilibrium to compute, so this is an ' +
        'expectimax rather than CFR — villain’s fold/call/raise probabilities and bet sizes come ' +
        'from boosters trained on millions of real hands with these HUD stats, the showdown ' +
        'model supplies E[share], and the hero maximizes. Villain’s range is never enumerated; ' +
        'it is absorbed into the models’ weights, learned from the betting line. Nothing is ' +
        'cached: the tree it walks is this hand, so every call rebuilds it.\n\n' +
        'Three honest limits. Only BET sizes were trained, so the hero’s raise branches come ' +
        'from the measured population raise-TO distribution rather than a model. The raise chain ' +
        'is capped at one raise, so facing a raise the menu is call-or-fold — a re-raise was ' +
        'never priced rather than priced and rejected, and the warnings say so. And there is no ' +
        'ICM in it at all: a bubble spot gets a cash-game answer.',
    },
    net: {
      title: 'Net-truncated flop',
      summary: 'Flop solved against the turn value net instead of a full tree.',
      detail:
        'The balancer picked the net regime because a full solve did not fit the time budget. ' +
        'Turn leaves are evaluated by the neural value net rather than played out. Cheaper and ' +
        'still close, but this flow retains no solver session — a profile answer may be ' +
        'unavailable, in which case the GTO strategy is served instead.',
    },
    'exact-thinned': {
      title: 'Exact CFR (thinned from multiway)',
      summary: 'The flop was 3-way; it is heads-up now, so the exact solver took over.',
      detail:
        'When a player folds postflop, everything from the next street on is a genuine ' +
        '2-player game, and the exact solver is roughly an order of magnitude closer to ' +
        'equilibrium than the blueprint. The folded player’s chips stay in as dead money and ' +
        'both survivors’ ranges are the blueprint’s reach-weighted ranges at the thin point, ' +
        'conditioned on the whole multiway prefix actually played.',
    },
    'net-thinned': {
      title: 'Net-truncated (thinned from multiway)',
      summary: 'Thinned to heads-up, then answered on the net-truncated flop flow.',
      detail:
        'Same hand-off as exact-thinned, but the 2-player balancer landed on the net regime ' +
        'for the budget available. Turn leaves come from the value net rather than a solved ' +
        'subtree.',
    },
    'exact-allin': {
      title: 'Exact solve — all-in players in the pot',
      summary: 'Two players with chips left, plus preflop all-ins contesting main pots.',
      detail:
        'Postflop is heads-up between the two players who still have chips, but the players ' +
        'who went all-in preflop still hold cards. The exact 2-player engine solves it with ' +
        'their ranges contesting the main pots they are in, so each pot is priced against ' +
        'everyone who can win it.',
    },
    'flop-full': {
      title: 'MCCFR blueprint — full menu',
      summary: '3-way flop on the top rung: the full betting menu, 100 card buckets.',
      detail:
        'The multiway path is a sampling MCCFR blueprint, not the 2-player exact engine. ' +
        'This is its best rung — every bet size in the abstraction is available on every ' +
        'street. Profiles shape the entry ranges only; the answer is the blueprint’s own ' +
        'strategy.',
    },
    'flop-shove-turn-river': {
      title: 'MCCFR blueprint — shove/fold later streets',
      summary: 'The flop keeps its menu; the turn and river are cut to check/all-in.',
      detail:
        'Rung 2 of the flop ladder — taken when a full-menu solve did not fit the budget. ' +
        'The flop decision is still solved properly, but later-street play is abstracted to ' +
        'check or all-in, which biases the flop frequencies toward that shape.',
    },
    'flop-shove-turn-river-cap1': {
      title: 'MCCFR blueprint — shove/fold later streets, one raise',
      summary: 'Same as the rung above, with the flop capped at a single raise per street.',
      detail:
        'On real 3-way ranges the uncapped rung prices at 20–31s, so a 15s request used to ' +
        'fall all the way to the checkdown leaf. Cutting the flop raise chain to one raise ' +
        '(bet, raise, then fold or call — no re-raise and no shove over it) is 45% fewer ' +
        'infosets and fits any stack depth. Measured against a converged full-menu ' +
        'reference it is indistinguishable from the uncapped rung: the boundary that ' +
        'matters is betting versus no betting, not how deep the raise chain goes.',
    },
    'flop-shove-turn-cap1': {
      title: 'MCCFR blueprint — shove/fold turn, one raise',
      summary: 'The flop keeps its menu, the turn is check/all-in, the river is checked down.',
      detail:
        'The cheapest rung that still keeps a real decision on every street it models — ' +
        'about 7s at any stack depth. The river carries no betting, which costs roughly ' +
        '0.01–0.02 total variation against a full-menu reference, but the flop still plays ' +
        'for a genuine turn decision. Well clear of the checkdown leaf below it, which has ' +
        'twice the error on the hero’s own seat.',
    },
    'flop-checkdown': {
      title: 'MCCFR blueprint — checkdown leaf',
      summary: 'Last resort: no postflop betting after the flop at all.',
      detail:
        'The cheapest rung. Everything past the flop is checked down, so the answer knows ' +
        'nothing about future streets — treat the frequencies as a rough guide and raise ' +
        'maxSolveTime if you can. Measured error on the hero’s seat is about twice any rung ' +
        'that keeps postflop betting, so this one is worth spending budget to escape.',
    },
    'flop-checkdown-cap1': {
      title: 'MCCFR blueprint — checkdown leaf, one raise',
      summary: 'No betting after the flop, and the flop capped at one raise per street.',
      detail:
        'A 4–6-way budget rung: the flop raise chain is cut to one raise so the tree fits the ' +
        'budget. The checkdown caveat above applies in full — the answer knows nothing about ' +
        'later streets.',
    },
    'flop-checkdown-cap1-1size': {
      title: 'MCCFR blueprint — checkdown leaf, one raise, one size',
      summary: 'The cheapest multiway rung: one raise, a single 50% flop bet, no later betting.',
      detail:
        'The last resort at 4–6 players, when even the capped rung does not fit the budget. ' +
        'Treat the frequencies as a rough guide.',
    },
    'flop-lines': {
      title: 'MCCFR blueprint — continuation-lines leaf',
      summary:
        'The flop is solved; after it, every player commits to one of four plans for the turn ' +
        'and river.',
      detail:
        'The multiway rung that replaces the checkdown leaf. Instead of assuming nobody bets ' +
        'after the flop, each player still in the hand picks a plan for the rest of it — ' +
        'check-call, check-fold, bet 75% of the pot on each street, or jam — and the plans ' +
        'are played out to a real showdown. The choice is learned per hand, so strong hands ' +
        'can plan to get value and weak ones to bluff or give up. Against full-menu solves ' +
        'at 4–5 players it sits roughly half as far off as the checkdown leaf. Where the ' +
        'shove/fold rungs fit the budget they are still better facing a bet, because they ' +
        'play the turn for real.',
    },
    'flop-lines-cap1': {
      title: 'MCCFR blueprint — continuation-lines leaf, one raise',
      summary: 'Same as the rung above, with the flop capped at a single raise per street.',
      detail:
        'Taken when the uncapped lines rung does not fit the budget. At this table width a ' +
        'street’s size is its number of betting sequences, and the raise chain is the ' +
        'longest of them, so one raise is the cheap cut.',
    },
    'flop-lines-cap1-1size': {
      title: 'MCCFR blueprint — continuation-lines leaf, one raise, one size',
      summary: 'One raise per street and a single 50% flop bet; the plans take over after it.',
      detail:
        'The cheapest lines rung. The flop keeps a real bet, raise and all-in decision at one ' +
        'size, and everything past it is played by the committed plans.',
    },
    'turn-unabstracted': {
      title: 'MCCFR turn — no card abstraction',
      summary: 'Turn-rooted blueprint with the card abstraction dropped entirely.',
      detail:
        'The finest turn rung: still the sampling blueprint, but each combo is its own ' +
        'infoset rather than one of 500 buckets. Expensive (~71M iterations) and gated ' +
        'behind a large budget.',
    },
    'turn-full-fine': {
      title: 'MCCFR turn — 500 buckets',
      summary: 'Turn-rooted, full menu, the fine card abstraction.',
      detail:
        'On a turn root the card abstraction is what binds, not the iteration count: 100 ' +
        'buckets sits at a 16.0% pot NashConv floor iterations cannot cross, while 500 ' +
        'reaches 11.8%. This rung buys that fidelity.',
    },
    'turn-full': {
      title: 'MCCFR turn — full menu',
      summary: 'Turn-rooted, full betting menu, the coarse (100-bucket) abstraction.',
      detail:
        'All bet sizes available, but combos are pooled into 100 buckets — the measured ' +
        'abstraction floor on a turn root. Fine for the shape of the answer, coarse for ' +
        'thin distinctions between similar hands.',
    },
    'turn-shove-river': {
      title: 'MCCFR turn — shove/fold river',
      summary: 'The turn keeps its menu; the river is cut to check/all-in.',
      detail: 'A budget rung: river play is abstracted, which tilts turn frequencies.',
    },
    'turn-checkdown-river': {
      title: 'MCCFR turn — river checkdown',
      summary: 'No river betting at all.',
      detail: 'The cheapest turn rung. The river is checked down in the model.',
    },
    'turn-checkdown-river-cap1': {
      title: 'MCCFR turn — river checkdown, one raise',
      summary: 'No river betting, and the turn capped at one raise per street.',
      detail: 'A 4–6-way budget rung. The river is checked down in the model.',
    },
    'turn-checkdown-river-cap1-1size': {
      title: 'MCCFR turn — river checkdown, one raise, one size',
      summary: 'The cheapest multiway turn rung: one raise, a single 50% turn bet.',
      detail: 'The last resort at 4–6 players. The river is checked down in the model.',
    },
    'turn-lines-river': {
      title: 'MCCFR turn — continuation-lines river',
      summary: 'The turn is solved; on the river every player commits to one of four plans.',
      detail:
        'The turn counterpart of the flop lines rung. Instead of checking the river down, ' +
        'each player picks check-call, check-fold, bet 75% of the pot or jam for the river, ' +
        'played out to a real showdown. Against full-menu solves at 5 players it sits about ' +
        '30–60% closer than the checkdown river.',
    },
    'turn-lines-river-cap1': {
      title: 'MCCFR turn — continuation-lines river, one raise',
      summary: 'Same as the rung above, with the turn capped at a single raise per street.',
      detail: 'Taken when the uncapped lines rung does not fit the budget.',
    },
    'turn-lines-river-cap1-1size': {
      title: 'MCCFR turn — continuation-lines river, one raise, one size',
      summary: 'One raise per street and a single 50% turn bet; the plans take the river.',
      detail: 'The cheapest lines rung on the turn.',
    },
    'river-unabstracted': {
      title: 'MCCFR river — no card abstraction',
      summary: 'A 3-way river solved with every combo as its own infoset.',
      detail:
        'A 3-way river is only ~13.5k infosets unabstracted and solves in about half a ' +
        'second, so it carries no card-abstraction error at all.',
    },
    'river-full-fine': {
      title: 'MCCFR river — 500 buckets',
      summary: 'River-rooted with the fine card abstraction.',
      detail: 'Full menu, 500 buckets — the fallback when the unabstracted rung did not fit.',
    },
    'river-full': {
      title: 'MCCFR river — 100 buckets',
      summary: 'River-rooted, full menu, coarse abstraction.',
      detail: 'All sizes available; combos pooled into 100 buckets.',
    },
    'river-full-cap1': {
      title: 'MCCFR river — 100 buckets, one raise',
      summary: 'River-rooted, full menu, the raise chain capped at one raise.',
      detail:
        'A 4–6-way budget rung. The river is still solved for real; only the re-raise depth ' +
        'is cut.',
    },
    'river-full-cap1-1size': {
      title: 'MCCFR river — one raise, one size',
      summary: 'River-rooted, one raise and a single 50% bet size.',
      detail: 'The cheapest 4–6-way river rung.',
    },
    undertrained: {
      title: 'Undertrained',
      titleOf: '{base} — undertrained',
      summary: 'No rung fit the budget — the cheapest one ran at whatever iterations it bought.',
      detail:
        'A blueprint run for too few iterations is not a weaker answer, it is an untrained ' +
        'one. Unvisited infosets fall back to uniform noise. Treat this answer as ' +
        'provisional and give the request more time.',
    },
    unknown: {
      summary: 'Solver regime reported by the API.',
      detail: 'No local description for this regime name.',
    },
  },

  // --- how the street was actually solved (`meta.flow`) ------------------
  flow: {
    exact: 'Exact CFR over the full betting menu.',
    'exact-reduced':
      'Exact CFR over a reduced bet menu (the balancer trimmed sizes to fit).',
    'exact-clustered':
      'Reduced menus plus turn-runout clustering: the flop→turn chance node solves two ' +
      'representatives per cluster instead of all ~49 runouts, so the turn and river subtrees ' +
      'under the rest disappear. 2–5× faster for 0.2–1.6% deployment exploitability depending ' +
      'on the group count, which is well inside the bar that makes a full solve preferable to ' +
      'the net — so every rung of it is spent before the net is.',
    net: 'Flop truncated at the turn, leaves valued by the neural net.',
    mccfr: 'Sampling MCCFR blueprint (3+ players).',
    expectimax:
      'Expectimax over the trained behavioural models — hero maximizes, villain’s nodes are ' +
      'expectations under the fitted action and size distributions, chance nodes average over ' +
      'runouts (enumerated on the river, bucketed from a flop root).',
    unknownExact:
      'An exact CFR solve on a regime this build has no description for — the balancer ' +
      'picked it to fit the budget, so expect some abstraction against the full menu.',
    unknown: 'Solve regime reported by the API; no local description for this flow name.',
  },
}
