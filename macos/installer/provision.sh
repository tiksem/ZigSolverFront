#!/bin/bash
# Everything the solver needs that cannot be shipped inside a package.
#
#     sudo /Library/Application\ Support/ZigSolver/runtime/provision.sh
#
# The installer runs this from its postinstall; it is installed alongside the
# runtime and stays runnable afterwards, because "reinstall the whole thing" is
# a bad answer to "pip died halfway through the torch download".  Running it
# again is safe and cheap: every step checks before it acts.
#
# What it puts on the machine, and why none of it is in the package:
#
#   Command Line Tools  Homebrew refuses to run without them.
#   Homebrew            the way python3 gets onto a Mac and stays patched.
#   python3             the service is a Python service. 3.10 or newer.
#   libomp              xgboost's runtime on macOS; without it the exploit
#                       regime's models and the stats imputer do not load.
#   a virtualenv        fastapi/uvicorn/pydantic/numpy + torch + xgboost,
#                       under the install root rather than in the user's own
#                       python, so nothing here can break their environment and
#                       nothing they do to it can break this.
#
# Shipping the wheels instead was the alternative and it is worse: torch alone
# is hundreds of megabytes per Python version and per architecture, and a
# vendored interpreter is a thing to keep patched forever.
#
# NETWORK REQUIRED.  This downloads Homebrew, Python and the wheels.
#
# Exit status: 0 if the service can start.  The optional halves (torch,
# xgboost) only warn -- the server runs --no-net without torch and answers
# every exploit request GTO without xgboost, which is a degraded install rather
# than a dead one, and that is the operator's call to make.
set -uo pipefail

ROOT=${1:-/Library/Application Support/ZigSolver}
RUNTIME="$ROOT/runtime"
VENV="$ROOT/venv"
LOG="$ROOT/install.log"

PY_FORMULA=${PY_FORMULA:-python@3.12}
PIP_PACKAGES=(fastapi uvicorn "pydantic>=2" numpy)

mkdir -p "$ROOT"
# Everything below is teed: the Installer's own log keeps stdout, and this file
# is the one to point someone at afterwards.
exec > >(tee -a "$LOG") 2>&1
printf '\n===== provision %s =====\n' "$(date '+%F %T')"

RED=$'\033[31m'; YEL=$'\033[33m'; GRN=$'\033[32m'; NC=$'\033[0m'
log()  { echo "${GRN}[provision]${NC} $*"; }
warn() { echo "${YEL}[provision]${NC} $*" >&2; }
die()  { echo "${RED}[provision]${NC} $*" >&2; exit 1; }

[[ -d "$RUNTIME" ]] || die "no runtime at $RUNTIME — run the installer first"

# --- who this is for ----------------------------------------------------------
# The postinstall runs as root, and two of the steps below must NOT: Homebrew
# refuses to be root, and a venv created by root would leave a user unable to
# repair their own install.  The console user is who the machine belongs to.
if [[ $EUID -eq 0 ]]; then
    OWNER=$(stat -f%Su /dev/console)
    [[ -n "$OWNER" && "$OWNER" != "root" ]] \
        || die "no console user — run this from a logged-in session"
    OWNER_HOME=$(dscl . -read "/Users/$OWNER" NFSHomeDirectory 2>/dev/null | awk '{print $2}')
    as_owner() { sudo -u "$OWNER" -H "$@"; }
else
    OWNER=$(id -un)
    OWNER_HOME=$HOME
    as_owner() { "$@"; }
fi
log "installing for $OWNER (home $OWNER_HOME), root $ROOT"

# --- Command Line Tools -------------------------------------------------------
# Homebrew's first act is to look for these.  Installing them without a dialog
# is the softwareupdate dance: the sentinel file is what makes the tools show up
# in its list at all.
if ! /usr/bin/xcode-select -p >/dev/null 2>&1; then
    log "installing the Command Line Tools (a few hundred MB)"
    sentinel=/tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress
    touch "$sentinel"
    label=$(softwareupdate -l 2>/dev/null \
            | grep -B1 -E 'Command Line Tools' \
            | awk -F'* ' '/\*/ {print $2}' | sed 's/^Label: //' | tail -1)
    if [[ -n "$label" ]]; then
        softwareupdate -i "$label" --verbose || warn "the Command Line Tools install failed"
    else
        warn "could not find a Command Line Tools update to install"
    fi
    rm -f "$sentinel"
    /usr/bin/xcode-select -p >/dev/null 2>&1 \
        || warn "still no Command Line Tools — run: xcode-select --install"
fi

# --- Homebrew -----------------------------------------------------------------
# The prefix is the platform's, not a choice: /opt/homebrew on Apple silicon,
# /usr/local on Intel.  An existing brew anywhere on PATH is used as it is.
case "$(uname -m)" in
    arm64) BREW_PREFIX=/opt/homebrew ;;
    *)     BREW_PREFIX=/usr/local ;;
esac
BREW="$BREW_PREFIX/bin/brew"
if ! [[ -x "$BREW" ]] && command -v brew >/dev/null 2>&1; then
    BREW=$(command -v brew)
    BREW_PREFIX=$("$BREW" --prefix)
fi

if [[ -x "$BREW" ]]; then
    log "Homebrew: $("$BREW" --version | head -1) ($BREW)"
else
    log "installing Homebrew into $BREW_PREFIX"
    # The documented "untar anywhere" install rather than install.sh: that
    # script calls sudo for itself, which cannot prompt from a package's
    # postinstall.  We are already root, so the privileged half is done here
    # and the tree is handed to the user, which is the state install.sh would
    # have left it in anyway.
    mkdir -p "$BREW_PREFIX"
    if ! curl -fsSL https://github.com/Homebrew/brew/tarball/master \
         | tar xz --strip 1 -C "$BREW_PREFIX"; then
        die "could not download Homebrew — check the network and run this again"
    fi
    # admin, so a second user on the machine can also run brew.
    chown -R "$OWNER":admin "$BREW_PREFIX" 2>/dev/null || true
    mkdir -p "$BREW_PREFIX"/{Cellar,Caskroom,Frameworks,etc,include,lib,opt,sbin,share,var}
    chown -R "$OWNER":admin "$BREW_PREFIX" 2>/dev/null || true
    [[ -x "$BREW" ]] || die "Homebrew did not land at $BREW"
    log "Homebrew: $(as_owner "$BREW" --version | head -1)"
fi

export HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_ANALYTICS=1 HOMEBREW_NO_ENV_HINTS=1
brew_install() {                       # a formula, or a warning and carry on
    as_owner "$BREW" list --formula "$1" >/dev/null 2>&1 && { log "$1: present"; return 0; }
    log "brew install $1"
    as_owner "$BREW" install "$1" || { warn "brew install $1 failed"; return 1; }
}

# --- python3 ------------------------------------------------------------------
# A system python3 that is new enough is used as it is; the formula is only
# reached for when there is not one.  macOS ships 3.9 as of this writing, which
# is not.
find_python() {
    local candidate
    for candidate in "$BREW_PREFIX/opt/$PY_FORMULA/libexec/bin/python3" \
                     "$BREW_PREFIX/bin/python3" "$(command -v python3 || true)"; do
        [[ -x "$candidate" ]] || continue
        "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' \
            2>/dev/null && { echo "$candidate"; return 0; }
    done
    return 1
}

PYTHON=$(find_python || true)
if [[ -z "$PYTHON" ]]; then
    brew_install "$PY_FORMULA" || die "could not install $PY_FORMULA"
    PYTHON=$(find_python || true)
fi
[[ -n "$PYTHON" ]] || die "no python 3.10+ after installing $PY_FORMULA"
log "python: $("$PYTHON" --version 2>&1) ($PYTHON)"

# xgboost's OpenMP.  Not optional in practice on macOS: without it the wheel
# imports and then fails to load its library, which surfaces as the exploit
# regime quietly answering GTO.
brew_install libomp || warn "libomp is missing — xgboost may not load"

# --- the virtualenv -----------------------------------------------------------
# Rebuilt when the interpreter under it has moved (a brew upgrade relocates the
# framework and every venv pointing at the old one breaks in a confusing way).
venv_ok() {
    [[ -x "$VENV/bin/python3" ]] && "$VENV/bin/python3" -c 'pass' 2>/dev/null
}
if venv_ok; then
    log "virtualenv: $VENV"
else
    [[ -e "$VENV" ]] && { warn "the virtualenv is broken — rebuilding it"; rm -rf "$VENV"; }
    log "creating the virtualenv at $VENV"
    "$PYTHON" -m venv "$VENV" || die "python -m venv failed"
fi
VPY="$VENV/bin/python3"
"$VPY" -m pip install --quiet --upgrade pip setuptools wheel \
    || warn "could not update pip — continuing with the one in the venv"

pip_have() { "$VPY" -c "import importlib.util,sys;sys.exit(0 if importlib.util.find_spec('$1') else 1)" 2>/dev/null; }

# The four the service cannot start without.
missing=()
for spec in fastapi:fastapi uvicorn:uvicorn pydantic:'pydantic>=2' numpy:numpy; do
    pip_have "${spec%%:*}" || missing+=("${spec##*:}")
done
if ((${#missing[@]})); then
    log "installing: ${missing[*]}"
    "$VPY" -m pip install --quiet "${missing[@]}" \
        || die "could not install ${missing[*]} — check the network and run this again"
else
    log "fastapi/uvicorn/pydantic/numpy: present"
fi

# torch: the turn value net.  Without it the server runs --no-net, which is a
# real service with a weaker flop flow -- so a failed download is a warning.
if pip_have torch; then
    log "torch: present"
else
    log "installing torch (a few hundred MB — this is the slow part)"
    "$VPY" -m pip install --quiet torch \
        || warn "torch did not install — the solver will run without the turn value net"
fi

# xgboost: the exploit regime's behavioural models and the stats imputer.
if pip_have xgboost; then
    log "xgboost: present"
else
    log "installing xgboost (exploit regime + stats imputer)"
    "$VPY" -m pip install --quiet xgboost \
        || warn "xgboost did not install — regime=exploit will answer GTO and the \
stats imputer falls back to its numpy tree walker"
fi

# --- ownership ----------------------------------------------------------------
# The service writes into its own tree exactly as it does from a checkout: the
# multiplayer abstraction cache, logs/, screenerrors/, predfails/, and a
# showdown matrix computed on a miss.  A root-owned runtime would start and then
# fail on the first of those, hours later.
if [[ $EUID -eq 0 ]]; then
    log "handing $ROOT to $OWNER"
    chown -R "$OWNER":staff "$ROOT" || warn "could not chown $ROOT"
fi

# --- does it actually work ----------------------------------------------------
log "checking the install"
cd "$RUNTIME" || die "cannot enter $RUNTIME"

lib="$RUNTIME/zig-out/lib/libzigsolver.dylib"
as_owner "$VPY" -c "import ctypes,sys; ctypes.CDLL(sys.argv[1])" "$lib" \
    || die "the solver library will not load: $lib
  (a wrong architecture, or the file did not survive the copy)"
[[ -x "$RUNTIME/zig-out/bin/zigsolver" ]] || die "no solver binary at $RUNTIME/zig-out/bin/zigsolver"

# Importing api.server is the check that the shipped module list is complete:
# anything missed shows up here as an ImportError rather than as a 500 on the
# first hand of a session.
if ! as_owner env PYTHONPATH="$RUNTIME" "$VPY" -c "import api.server" ; then
    die "the service does not import — the runtime is incomplete (see above)"
fi

as_owner "$VPY" - <<'EOF' || true
import importlib.util
for name, why in (("torch", "the turn value net"),
                  ("xgboost", "the exploit regime and the stats imputer")):
    have = importlib.util.find_spec(name) is not None
    print(f"[provision] {name}: {'ok' if have else 'MISSING — ' + why + ' is off'}")
EOF

printf '{"at":"%s","python":"%s","root":"%s"}\n' \
    "$(date -u '+%FT%TZ')" "$("$VPY" --version 2>&1)" "$ROOT" > "$ROOT/provisioned.json"
[[ $EUID -eq 0 ]] && chown "$OWNER":staff "$ROOT/provisioned.json"

log "done — ZigSolver.app can start the solver now"
exit 0
