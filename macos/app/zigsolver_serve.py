"""Start the ZigSolver API the way a GUI app needs it started.

    python3 zigsolver_serve.py --parent-pid 4211 --host 127.0.0.1 --port 53411 …

Everything after `--parent-pid` is handed to `api.server` untouched; this is a
wrapper, not a second entry point, and the service it starts is the same one
`./runapi.sh` starts.

It exists for two things a `Process` on the AppKit side cannot arrange for
itself:

  * **its own process group.** A solve is not one process: the service shells
    out to `zig-out/bin/zigsolver`, and keeps an xgboost child for the stats
    imputer and another for the exploit models. Signalling the interpreter
    leaves those behind. Calling `setpgrp()` here makes this process the leader
    of a group its children inherit, so the app can take the whole tree down
    with one `killpg` (macos/app/Sources/SolverProcess.swift).

  * **dying with the app.** A crashed or force-quit app cannot run cleanup, and
    an orphaned solver would hold the port, the RAM and the GPU until someone
    noticed. So the parent's pid is watched: the moment this process is
    reparented — which is exactly what happens when the parent goes away — the
    group is killed, this one included.

The watchdog compares `getppid()` rather than probing the recorded pid with
signal 0: pids are reused, and "is 4211 still alive" can be true about a
completely different process an hour later. "Is 4211 still my parent" cannot.
"""
from __future__ import annotations

import os
import signal
import sys
import threading
import time

POLL_SECONDS = 2.0


def _watch_parent(parent_pid: int) -> None:
    while True:
        time.sleep(POLL_SECONDS)
        if os.getppid() != parent_pid:
            # SIGKILL, not SIGTERM: nobody is left to read a graceful shutdown
            # and the point is that nothing survives this call.
            try:
                os.killpg(os.getpgrp(), signal.SIGKILL)
            except OSError:
                os._exit(1)


def main() -> None:
    argv = sys.argv[1:]
    parent_pid = None
    if len(argv) >= 2 and argv[0] == "--parent-pid":
        parent_pid = int(argv[1])
        argv = argv[2:]

    # Leader of a new group, so the app can signal this process and everything
    # the service spawns under it in one call.
    try:
        os.setpgrp()
    except OSError as exc:                    # nothing to do about it but say so
        print(f"[serve] could not create a process group: {exc}", file=sys.stderr)

    if parent_pid is not None:
        threading.Thread(target=_watch_parent, args=(parent_pid,),
                         daemon=True).start()

    here = os.path.dirname(os.path.abspath(__file__))
    if here not in sys.path:
        sys.path.insert(0, here)

    # argv[0] is what the server's own `starting: …` line reports and what
    # argparse names in a usage error, so make it read as the module it is.
    sys.argv = ["api.server"] + argv
    from api.server import main as server_main

    server_main(argv)


if __name__ == "__main__":
    main()
