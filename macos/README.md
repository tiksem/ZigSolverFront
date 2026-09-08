# ZigSolver for macOS

The web app, in a window, with the solver behind it.

```bash
macos/buildinstaller.sh            # -> macos/dist/ZigSolver-1.0.0-arm64.pkg
macos/buildinstaller.sh --run      # build and run it here, installing nothing
```

The package puts **ZigSolver.app** in `/Applications` and the solver in
`/Library/Application Support/ZigSolver`, then provisions the machine —
Homebrew, python3, the wheels. It asks for a password, because it installs for
everyone on the Mac, and it **needs a network**: the last step downloads
PyTorch.

## What is different about the app

**One field.** The bot host, and that is all. There is no ZigSolver API to
type, because the solver is not somewhere else — the app starts it, on the
loopback interface, when the window opens.

**Tables are tabs.** The tables list lives in the root tab, which cannot be
closed; clicking a table opens it beside the list and ⌘W closes it. Two tables
at once is the normal way this gets used, and one route at a time cannot say
that. Each tab is its own web view, so a table that wedges is a wedged tab.

**Zoom is a browser's.** ⌘+ / ⌘= / ⌘− / ⌘0, ⌘-scroll and pinch, on Safari's
ladder, applied to every tab and remembered. Page zoom, so the text reflows
instead of being scaled.

Everything else is the same application the browser runs, because it is
literally the same bundle.

## How it is closed off

Two separate things, each doing a job the other cannot.

### The interface has no address

The UI is not served over HTTP by anything. `dist/` is packed into one
AES-256-GCM file (`pack/packassets.mjs`) that ships inside the bundle, and the
web view resolves `zigsolver://app/…` against it through a scheme handler
reading from memory (`AssetPack.swift`, `AppScheme.swift`). There is no port,
so there is nothing to point a browser at; the navigation delegate refuses
every URL that is not that scheme, so a link out opens in the user's own
browser rather than in a window holding the app's token.

Be clear about how far the encryption goes: the key is generated per build and
compiled into the binary, so it ships with the lock it opens. It turns "drag
the Resources folder out and open index.html" into "read the Mach-O". It is not
a secret kept from someone holding the app, and nothing security-relevant rests
on it.

### The solver only answers this app

`api/auth.py` in the ZigSolver repo adds a bearer token to the API — one shared
secret on `Authorization: Bearer …`, checked on the whole surface including
`/health`. It lives in the server itself rather than in a proxy in front of it,
so there is still exactly one thing to deploy.

The app mints 32 bytes per launch, hands them to the server it spawned through
the environment (never the command line, which `ps` can read) and injects the
same string into the web view. Nothing writes it down. Quitting the app ends
both copies.

So: bound to loopback, which stops the network; behind a token, which stops
everything else on the machine; and rotated every launch, so there is no
long-lived secret to leak and no file to leak it from.

**A server started any other way is unchanged.** `./runapi.sh`, `deploy_api.sh`
and a bare `python -m api.server` are open exactly as they were — the token is
off unless one is given. Only the app passes one.

## Where things go

```
/Applications/ZigSolver.app                     the UI, and the app icon
/Library/Application Support/ZigSolver/
    runtime/        the service, laid out like the repo (api/, turn_net/,
                    models/, flopml/, zig-out/, cache/showdown …)
    venv/           fastapi, uvicorn, numpy, torch, xgboost
    install.log     everything provisioning said
~/Library/Application Support/ZigSolver/logs/   one file per launch
```

`runtime/` is owned by the user the installer ran for, deliberately: the
service writes into its own tree the way it does from a checkout — the
multiplayer abstraction cache, `logs/`, `screenerrors/`, `predfails/`, a
showdown matrix computed on a miss.

## What is in the package and what is downloaded

**In it**, because it cannot be fetched: `zig-out/bin/zigsolver` and
`libzigsolver.dylib` (so nothing on the target needs Zig, or a compiler at
all), the turn-net checkpoint, the xgboost boosters behind the exploit regime
and the stats imputer, `flopml/board_tables.npz`, the battery serve bank, and
the precomputed showdown cache.

**Downloaded at install time**: Command Line Tools, Homebrew, python3, libomp
and the wheels. An interpreter and a few hundred megabytes of torch per
architecture are better fetched than vendored.

The runtime payload is an explicit allow-list — the same one `deploy_api.sh`
uses, for the same reason. A directory sweep would ship 570 MB of `turn_net`
datasets and 1.8 GB of `profilegen` corpus that the service never opens.
Anything left out surfaces as an `ImportError` from provisioning's sanity
check, not as a 500 mid-hand.

Because the binaries are copied rather than built, **the package is for the
architecture it was built on**, and `buildinstaller.sh` checks that.

## Options

| | |
|---|---|
| `--no-showdown-cache` | ~6 GB smaller. A miss then costs ~2.5s of setup instead of a ~5ms read. |
| `--no-exploit` | ~400 MB smaller. `regime: "exploit"` answers GTO with the reason in `warnings`. |
| `--skip-frontend` | reuse `dist/` instead of `npm run build` |
| `--run` | build, provision into `macos/build/`, launch. Nothing outside that directory is touched, and the venv survives rebuilds. |
| `--solver DIR` | the ZigSolver checkout (default `../ZigSolver`) |
| `SIGN_APP=` / `SIGN_PKG=` | Developer ID identities. Ad-hoc otherwise, which installs on the machine it was built on; another Mac wants right-click ▸ Open, or a real identity and notarization. |

## If the install fails

Provisioning is the step that can fail, and it fails on the network. The
transcript is in `/Library/Application Support/ZigSolver/install.log`, and it
re-runs without reinstalling:

```bash
sudo '/Library/Application Support/ZigSolver/runtime/provision.sh'
```

Everything in it checks before it acts, so running it again is cheap and safe.

If the app opens but the solver does not start, the window says so and **Show
log** is the server's own output — a missing model or a wheel that did not
install says so there. `ZIGSOLVER_DEVTOOLS=1` turns on the web inspector.

## Layout

```
macos/
  buildinstaller.sh       the whole build: UI -> pack -> app -> runtime -> pkg
  app/
    Sources/
      main.swift          NSApplication, no nib
      AppDelegate.swift   the root tab, the table tabs, the menu
      WebController.swift one tab: the web view, the injected config, the bridge
      AppScheme.swift     zigsolver:// -> the pack
      AssetPack.swift     the encrypted bundle, opened once into memory
      SolverProcess.swift spawn the server, mint the token, take it down with us
      StartupView.swift   what the window shows while the models load
      Zoom.swift          ⌘+ / ⌘− / ⌘0, ⌘-scroll, pinch
      Runtime.swift       where the installer put everything
    Info.plist.in         version substituted at build time
    zigsolver_serve.py    -m api.server in its own process group, dying with us
  pack/
    packassets.mjs        dist/ -> one AES-256-GCM file
    makeicon.mjs          public/favicon.svg, drawn at icon resolutions
  installer/
    provision.sh          brew, python3, the venv — re-runnable
    scripts/postinstall    calls it
    resources/            what Installer.app shows
```
