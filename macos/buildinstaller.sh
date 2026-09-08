#!/usr/bin/env bash
# Build the macOS installer: the app, the solver runtime, one .pkg.
#
#     macos/buildinstaller.sh                     # everything, into macos/dist
#     macos/buildinstaller.sh --no-showdown-cache # ~6 GB smaller, slower turns
#     macos/buildinstaller.sh --run               # build and run it, no install
#
# What comes out is a single package that puts ZigSolver.app in /Applications
# and the solver beside it in /Library/Application Support/ZigSolver, then
# provisions the machine (Homebrew, python3, the wheels — installer/provision.sh).
#
# The package carries the DATA and the BINARIES, because those are the parts
# that cannot be fetched: the two Zig artifacts, the value-net checkpoint, the
# xgboost boosters behind the exploit regime and the stats imputer, the board
# tables, the battery serve bank and — unless you say otherwise — the precomputed
# showdown cache.  It does NOT carry Zig, Python or the wheels: nothing on the
# target compiles the solver (that is what shipping the binaries is for), and
# an interpreter and a few hundred megabytes of torch per architecture are
# better downloaded than vendored.
#
# Because the binaries are copied rather than built, the package is
# ARCHITECTURE-SPECIFIC: it is for the machine this script runs on.  Building an
# arm64 installer on an arm64 Mac is the normal case and is checked for below.
#
# Signing is ad-hoc unless you have identities:
#
#     SIGN_APP="Developer ID Application: …" SIGN_PKG="Developer ID Installer: …" \
#         macos/buildinstaller.sh
#
# An ad-hoc package installs fine when it was built on the machine it is
# installed on.  Moved to another Mac it needs a right-click > Open, or a real
# Developer ID and a notarization pass.
set -euo pipefail

cd "$(dirname "$0")"
MACOS=$PWD
FRONT=$(cd .. && pwd)

RED=$'\033[31m'; YEL=$'\033[33m'; GRN=$'\033[32m'; BLD=$'\033[1m'; NC=$'\033[0m'
log()  { echo "${GRN}[build]${NC} $*"; }
step() { echo; echo "${BLD}==> $*${NC}"; }
warn() { echo "${YEL}[build]${NC} $*" >&2; }
die()  { echo "${RED}[build]${NC} $*" >&2; exit 1; }

# --- options ------------------------------------------------------------------
SOLVER=${SOLVER:-$(cd "$FRONT/../ZigSolver" 2>/dev/null && pwd || true)}
OUT="$MACOS/dist"
BUILD="$MACOS/build"
VERSION=1.0.0
WITH_SHOWDOWN=1
WITH_EXPLOIT=1
SKIP_FRONTEND=0
DO_RUN=0
SIGN_APP=${SIGN_APP:-}
SIGN_PKG=${SIGN_PKG:-}

usage() {
    sed -n '2,/^set -euo/p' "$0" | sed 's/^# \{0,1\}//; $d'
    cat <<EOF

Options
  --solver DIR          the ZigSolver checkout (default: ../ZigSolver)
  --out DIR             where the .pkg lands (default: macos/dist)
  --version V           marketing version (default: $VERSION)
  --no-showdown-cache   leave out cache/showdown (~6 GB); the server computes
                        a miss in ~2.5s instead of reading it in ~5ms
  --no-exploit          leave out flopml/ (~400 MB); regime=exploit then
                        answers GTO with the reason in the response
  --skip-frontend       reuse the existing dist/ instead of npm run build
  --run                 build, provision into macos/build/root, and launch the
                        app against it — no installer, nothing touched outside
                        this directory
  --help
EOF
    exit 0
}

while (($#)); do
    case $1 in
        --solver) SOLVER=$2; shift 2 ;;
        --out) OUT=$2; shift 2 ;;
        --version) VERSION=$2; shift 2 ;;
        --no-showdown-cache) WITH_SHOWDOWN=0; shift ;;
        --no-exploit) WITH_EXPLOIT=0; shift ;;
        --skip-frontend) SKIP_FRONTEND=1; shift ;;
        --run) DO_RUN=1; shift ;;
        -h|--help) usage ;;
        *) die "unknown option: $1 (--help)" ;;
    esac
done

WORK="$BUILD/work"
APPSTAGE="$BUILD/appstage"
APP="$APPSTAGE/ZigSolver.app"
ROOT="$BUILD/root"
RUNTIME="$ROOT/runtime"
PKGDIR="$BUILD/pkg"

ARCH=$(uname -m)
BUILD_ID=$(date '+%Y%m%d%H%M')
PKG_ID_APP=com.zigsolver.desktop.app
PKG_ID_RUNTIME=com.zigsolver.desktop.runtime

# --- what has to be here ------------------------------------------------------
step "Checking the toolchain"
for tool in node npm swiftc iconutil pkgbuild productbuild codesign rsync plutil; do
    command -v "$tool" >/dev/null 2>&1 || die "$tool not found on PATH"
done
[[ -n "$SOLVER" && -d "$SOLVER/api" ]] \
    || die "no ZigSolver checkout at '${SOLVER:-<unset>}' (--solver DIR)"
SOLVER=$(cd "$SOLVER" && pwd)
log "front end: $FRONT"
log "solver:    $SOLVER"
log "arch:      $ARCH"

# The two artifacts the target will never build for itself.  Checked here
# rather than discovered as a missing file two gigabytes into a package.
SOLVER_BIN="$SOLVER/zig-out/bin/zigsolver"
SOLVER_LIB="$SOLVER/zig-out/lib/libzigsolver.dylib"
for f in "$SOLVER_BIN" "$SOLVER_LIB"; do
    [[ -f $f ]] || die "$f is missing — build it first:
  cd $SOLVER && zig build -Doptimize=ReleaseFast"
done
# A Debug binary is ~8x slower and prices its own solves wrongly; shipping one
# would look like a bad machine rather than a bad package.
MODE=$("$SOLVER_BIN" --build-mode 2>&1 | tr -d '[:space:]' || true)
[[ $MODE == ReleaseFast ]] \
    || die "zig-out/bin/zigsolver reports a ${MODE:-<unknown>} build, not ReleaseFast.
  cd $SOLVER && rm -rf zig-out && zig build -Doptimize=ReleaseFast"
for f in "$SOLVER_BIN" "$SOLVER_LIB"; do
    have=$(lipo -archs "$f" 2>/dev/null || echo unknown)
    [[ " $have " == *" $ARCH "* ]] \
        || die "$(basename "$f") is $have, and this would be a $ARCH installer.
  Rebuild the solver on this machine."
done
log "solver binaries: ReleaseFast, $ARCH"

MODEL=$(python3 -c "import re,sys;m=re.search(r'DEFAULT_MODEL\s*=\s*\"([^\"]+)\"',open('$SOLVER/api/constants.py').read());print(m.group(1) if m else '')" 2>/dev/null || true)
[[ -n "$MODEL" && -f "$SOLVER/$MODEL" ]] \
    || warn "the turn-net checkpoint (${MODEL:-<unreadable>}) is not in the checkout — \
the installed solver will run --no-net"

# Everything a build produces, and nothing else: $ROOT/venv survives, because
# it is several hundred megabytes of wheels that a rebuild has no reason to
# download again. It is --run's environment and is never part of the package.
rm -rf "$WORK" "$APPSTAGE" "$RUNTIME" "$PKGDIR"
mkdir -p "$WORK" "$APPSTAGE" "$RUNTIME" "$PKGDIR" "$OUT"

# --- 1. the web UI ------------------------------------------------------------
step "Building the interface"
if ((SKIP_FRONTEND)); then
    [[ -f "$FRONT/dist/index.html" ]] || die "--skip-frontend, but there is no dist/"
    log "reusing $FRONT/dist"
else
    (cd "$FRONT" && npm run build)
fi

# One key per build, 32 bytes from the system CSPRNG, compiled into the binary
# and used to encrypt the pack.  What that is worth is written down in
# pack/packassets.mjs, and it is not the API's security — that is the per-launch
# token in api/auth.py.
PACK_KEY=$(openssl rand -hex 32)
node "$MACOS/pack/packassets.mjs" "$FRONT/dist" "$WORK/app.zsp" "$PACK_KEY"

{
    echo "// Generated by buildinstaller.sh — one key per build, never committed."
    echo "enum Secrets {"
    echo "    static let assetKey: [UInt8] = ["
    echo "$PACK_KEY" | fold -w2 | sed 's/^/0x/; s/$/,/' | paste -sd' ' - \
        | fold -s -w 62 | sed 's/^/        /; s/ *$//'
    echo "    ]"
    echo "}"
} > "$WORK/Secrets.swift"

# --- 2. the app bundle --------------------------------------------------------
step "Building ZigSolver.app"
node "$MACOS/pack/makeicon.mjs" "$WORK/AppIcon.iconset"
iconutil -c icns "$WORK/AppIcon.iconset" -o "$WORK/AppIcon.icns"

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
# macos12.0 matches LSMinimumSystemVersion: WKWebView.pageZoom is 11+ and
# CryptoKit is 10.15+, so the floor is set by taste rather than by an API.
swiftc -swift-version 5 -O \
    -target "$ARCH-apple-macos12.0" \
    -framework AppKit -framework WebKit -framework CryptoKit -framework Security \
    -o "$APP/Contents/MacOS/ZigSolver" \
    "$MACOS/app/Sources/"*.swift "$WORK/Secrets.swift"

sed -e "s/__VERSION__/$VERSION/" -e "s/__BUILD__/$BUILD_ID/" \
    "$MACOS/app/Info.plist.in" > "$APP/Contents/Info.plist"
plutil -lint "$APP/Contents/Info.plist" >/dev/null || die "the Info.plist is malformed"
cp "$WORK/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
cp "$WORK/app.zsp" "$APP/Contents/Resources/app.zsp"
printf 'APPL????' > "$APP/Contents/PkgInfo"

if [[ -n "$SIGN_APP" ]]; then
    log "signing the app as: $SIGN_APP"
    codesign --force --deep --timestamp --options runtime \
        --sign "$SIGN_APP" "$APP"
else
    # arm64 refuses to execute an unsigned binary at all, so ad hoc is the
    # floor rather than a nicety.
    log "signing the app ad hoc (set SIGN_APP for a Developer ID)"
    codesign --force --deep --sign - "$APP"
fi
codesign --verify --deep "$APP" || die "the signature did not verify"
log "app: $(du -sh "$APP" | cut -f1)"

# --- 3. the solver runtime ----------------------------------------------------
# An explicit ALLOW-LIST, the same one deploy_api.sh uses and for the same
# reason: this is the import closure of api.server plus the data those modules
# read at serve time.  A directory sweep would put 570 MB of turn_net datasets
# and 1.8 GB of profilegen corpus in the package, none of which the service
# opens.  Anything missed shows up as an ImportError from provision.sh's sanity
# check rather than as a 500 mid-hand.
step "Staging the solver runtime"
PAYLOAD=(
    # the service
    api/__init__.py api/actions.py api/auth.py api/cache.py api/cancel.py
    api/cards_util.py api/classify.py api/constants.py
    api/exploit_spot.py api/exploit_worker.py api/handhistory.py
    api/logs.py api/models.py api/move.py api/mp_ledger.py
    api/multiplayer.py api/multiway_thinned.py api/predfail.py
    api/preflop.py api/profiles_api.py api/ranges_util.py
    api/screenerror.py api/server.py api/service.py api/solver.py
    api/tree.py
    # the opponent-stat model, module by module — profilegen/ on a dev box is
    # 1.9 GB of corpus and the service reads a sliver of it
    profilegen/__init__.py profilegen/bridge.py profilegen/extract.py
    profilegen/hh.py profilegen/impute.py profilegen/model.py
    profilegen/native.py profilegen/stats.py profilegen/treemodel.py
    profilegen/xgb_worker.py
    profilegen/data/impute profilegen/data/cluster_profiles.json
    profilegen/data/jacobian.npz profilegen/data/serve_bank.json
    # the preflop chart package (api/preflop.py puts preflop/ on sys.path)
    preflop/rangegen
    # lazily imported by api.solver / api.service
    tools/zsb.py tools/deviate.py
    # turn_net: only what the serve path imports
    turn_net/__init__.py turn_net/cards.py turn_net/dataset.py
    turn_net/deepstack.py turn_net/layout.py turn_net/model.py
    turn_net/native.py turn_net/ranges.py turn_net/showdown_cache.py
    turn_net/solve.py turn_net/spot.py turn_net/validate.py
    turn_net/value.py
    # the archetype table api/exploit_spot.py reads the hero off
    profiles.json
    # the binaries — this is what "we do not need zig on the target" means
    zig-out/bin/zigsolver zig-out/lib/libzigsolver.dylib
)
[[ -n "$MODEL" && -f "$SOLVER/$MODEL" ]] && PAYLOAD+=("$MODEL")

if ((WITH_EXPLOIT)); then
    PAYLOAD+=(
        flopml/__init__.py flopml/exploit.py flopml/build.py
        flopml/build_ps.py flopml/build_sd.py flopml/dataset.py
        flopml/pack.py flopml/boards.py flopml/board_tables.npz
        flopml/results_5090/model_unbet_tex.ubj
        flopml/results_5090/model_facing_tex.ubj
        flopml/results_5090/model_meta.json
        flopml/results_turn/model_turn_unbet.ubj
        flopml/results_turn/model_turn_facing.ubj
        flopml/results_turn/model_turn_meta.json
        flopml/results_river/model_river_unbet.ubj
        flopml/results_river/model_river_facing.ubj
        flopml/results_river/model_river_meta.json
        flopml/model_size_flop_bet.ubj flopml/model_size_flop_bet_meta.json
        flopml/model_size_turn_bet.ubj flopml/model_size_turn_bet_meta.json
        flopml/model_size_river_bet.ubj flopml/model_size_river_bet_meta.json
        flopml/model_showdown.ubj flopml/model_showdown_meta.json
    )
else
    warn "--no-exploit: regime=exploit will be answered GTO with the reason in warnings"
fi

missing=()
for f in "${PAYLOAD[@]}"; do [[ -e "$SOLVER/$f" ]] || missing+=("$f"); done
((${#missing[@]})) && die "missing in the checkout: ${missing[*]}"

log "copying ${#PAYLOAD[@]} entries"
(cd "$SOLVER" && rsync -aR --exclude '__pycache__' --exclude '*.pyc' \
    "${PAYLOAD[@]}" "$RUNTIME/")

# The battery, sampled rather than swept.  A stats-derived profile is fitted by
# WALKING a stratified sample of it, and bridge.select_records is deterministic
# in its seed — so the selection made here is the one the installed box would
# have made for itself, and the pruned index shipped beside the dumps means it
# re-selects nothing.  Index AND dumps: build_bank silently skips a record whose
# file is absent, so an under-shipped battery would fit off a smaller bank
# instead of failing.
if [[ -f "$SOLVER/profilegen/data/battery/index.json" ]]; then
    list=$WORK/battery.list
    if (cd "$SOLVER" && python3 - "$list" "$RUNTIME/profilegen/data/battery/index.json" <<'PY'
import json, os, sys
sys.path.insert(0, os.getcwd())
from profilegen.bridge import select_records
from profilegen.model import SERVE_TREES

list_path, idx_out = sys.argv[1], sys.argv[2]
index = os.path.join("profilegen", "data", "battery", "index.json")
cfg = os.path.join("profilegen", "data", "serve_bank.json")
limit = SERVE_TREES
if os.path.exists(cfg):
    with open(cfg) as fh:
        limit = int(json.load(fh).get("limit", limit))
with open(index) as fh:
    records = json.load(fh)["records"]
picked = select_records(records, limit)

base = os.path.dirname(os.path.abspath(index))
root = os.path.abspath(os.getcwd())
out, files = [], []
for rec in picked:
    path = rec["path"]
    if not os.path.exists(path):          # an index solved on another box
        path = os.path.join(base, os.path.basename(path))
    if not os.path.exists(path):
        continue
    files.append(os.path.relpath(os.path.abspath(path), root))
    # basename, not this box's path: build_bank resolves a record it cannot
    # find relative to the index it came from, which is what makes a battery
    # portable.
    out.append(dict(rec, path=os.path.basename(path)))
with open(list_path, "w") as fh:
    fh.write("".join(f + "\n" for f in files))
os.makedirs(os.path.dirname(idx_out), exist_ok=True)
with open(idx_out, "w") as fh:
    json.dump({"records": out}, fh)
print(f"battery: {len(out)} of {len(records)} trees")
PY
    ); then
        (cd "$SOLVER" && rsync -aR --files-from="$list" . "$RUNTIME/")
        log "battery serve bank: $(du -sh "$RUNTIME/profilegen/data/battery" | cut -f1)"
    else
        warn "could not select the battery serve bank — a stats-derived profile \
will fail on the installed box"
    fi
else
    warn "no profilegen/data/battery in the checkout — a stats-derived profile \
will fail on the installed box"
fi

# The precomputed all-in showdown operators.  A hit is ~5ms and a miss is ~2.5s
# of setup that the server then writes back, so leaving them out is a speed
# choice rather than a correctness one — which is why it is a flag.
if ((WITH_SHOWDOWN)) && [[ -d "$SOLVER/cache/showdown" ]]; then
    size=$(du -sh "$SOLVER/cache/showdown" | cut -f1)
    log "copying the showdown cache ($size — this is the slow part)"
    (cd "$SOLVER" && rsync -a --info=progress2 cache/showdown "$RUNTIME/cache/")
elif ((WITH_SHOWDOWN)); then
    warn "no cache/showdown in the checkout — the net flow will compute each \
flop's operator on first use"
else
    log "showdown cache: skipped (--no-showdown-cache)"
fi

# The two files that are ours rather than the solver's.
install -m 0755 "$MACOS/installer/provision.sh" "$RUNTIME/provision.sh"
install -m 0644 "$MACOS/app/zigsolver_serve.py" "$RUNTIME/zigsolver_serve.py"

log "runtime: $(du -sh "$RUNTIME" | cut -f1)"

# --- 4. run it here, or package it -------------------------------------------
if ((DO_RUN)); then
    step "Provisioning $ROOT and launching"
    warn "this installs Homebrew/python3 if the machine has none, but everything \
ZigSolver-specific stays under $BUILD"
    "$RUNTIME/provision.sh" "$ROOT" || die "provisioning failed"
    log "launching with ZIGSOLVER_ROOT=$ROOT"
    exec env ZIGSOLVER_ROOT="$ROOT" "$APP/Contents/MacOS/ZigSolver"
fi

step "Building the package"
# --compression latest is LZFSE: minutes rather than tens of minutes over a
# 6 GB showdown cache, and it is what --min-os-version 12.0 buys.
pkgbuild --quiet \
    --root "$APPSTAGE" --install-location /Applications \
    --identifier "$PKG_ID_APP" --version "$VERSION" \
    --compression latest --min-os-version 12.0 \
    "$PKGDIR/app.pkg"
log "app.pkg: $(du -sh "$PKGDIR/app.pkg" | cut -f1)"

pkgbuild --quiet \
    --root "$RUNTIME" \
    --install-location "/Library/Application Support/ZigSolver/runtime" \
    --identifier "$PKG_ID_RUNTIME" --version "$VERSION" \
    --scripts "$MACOS/installer/scripts" \
    --compression latest --min-os-version 12.0 \
    "$PKGDIR/runtime.pkg"
log "runtime.pkg: $(du -sh "$PKGDIR/runtime.pkg" | cut -f1)"

# customize="never": there is nothing to choose. The two components are halves
# of one thing and an app without its runtime is an app that cannot start.
cat > "$PKGDIR/distribution.xml" <<XML
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
    <title>ZigSolver</title>
    <organization>com.zigsolver</organization>
    <options customize="never" require-scripts="true" rootVolumeOnly="true"
             hostArchitectures="$ARCH"/>
    <welcome file="welcome.html" mime-type="text/html"/>
    <conclusion file="conclusion.html" mime-type="text/html"/>
    <volume-check>
        <allowed-os-versions><os-version min="12.0"/></allowed-os-versions>
    </volume-check>
    <choices-outline>
        <line choice="default">
            <line choice="$PKG_ID_APP"/>
            <line choice="$PKG_ID_RUNTIME"/>
        </line>
    </choices-outline>
    <choice id="default"/>
    <choice id="$PKG_ID_APP" visible="false">
        <pkg-ref id="$PKG_ID_APP"/>
    </choice>
    <choice id="$PKG_ID_RUNTIME" visible="false">
        <pkg-ref id="$PKG_ID_RUNTIME"/>
    </choice>
    <pkg-ref id="$PKG_ID_APP" version="$VERSION" onConclusion="none">app.pkg</pkg-ref>
    <pkg-ref id="$PKG_ID_RUNTIME" version="$VERSION" onConclusion="none">runtime.pkg</pkg-ref>
</installer-gui-script>
XML

FINAL="$OUT/ZigSolver-$VERSION-$ARCH.pkg"
sign=()
[[ -n "$SIGN_PKG" ]] && { sign=(--sign "$SIGN_PKG"); log "signing the package as: $SIGN_PKG"; }
productbuild \
    --distribution "$PKGDIR/distribution.xml" \
    --package-path "$PKGDIR" \
    --resources "$MACOS/installer/resources" \
    ${sign[@]+"${sign[@]}"} \
    "$FINAL"

step "Done"
log "$FINAL"
log "$(du -sh "$FINAL" | cut -f1)"
if [[ -z "$SIGN_PKG" ]]; then
    warn "unsigned: it installs on this Mac, but on another one macOS will ask \
for a right-click > Open (or sign it with SIGN_PKG=… and notarize)"
fi
echo
echo "  Install:  open '$FINAL'"
echo "  Verify:   installer -pkg '$FINAL' -target / -dumplog   # as root, no UI"
