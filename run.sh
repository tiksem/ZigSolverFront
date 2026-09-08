#!/usr/bin/env bash
# Build the app and serve it, no dev server.
#
#   ./run.sh                  # http://localhost:4173
#   ./run.sh 8090             # somewhere else
#   ./run.sh --hash abc123    # http://localhost:4173/abc123/
#
# dist/ is a static bundle (relative asset paths + hash routing), so any file
# server will do -- this one is just the shortest one everybody already has.
# --hash serves dist/ nested under /<hash>/ instead of /, to check the
# "drops into any subdirectory" claim before it goes on the real host.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

PORT=4173
HASH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --hash)
      HASH="$2"
      shift 2
      ;;
    --hash=*)
      HASH="${1#--hash=}"
      shift
      ;;
    *)
      PORT="$1"
      shift
      ;;
  esac
done

npm run build

if [[ -n "$HASH" ]]; then
  SERVE_DIR="$(mktemp -d)"
  trap 'rm -rf "$SERVE_DIR"' EXIT
  ln -s "$(pwd)/dist" "$SERVE_DIR/$HASH"
  echo "serving dist/ on http://localhost:${PORT}/${HASH}/"
  # Anything outside /$HASH -- including / itself -- drops the connection
  # with no response at all, as if nothing were listening there.
  python3 - "$PORT" "$SERVE_DIR" "$HASH" <<'PY'
import functools
import sys
from http.server import SimpleHTTPRequestHandler
from socketserver import TCPServer

port, directory, prefix = int(sys.argv[1]), sys.argv[2], "/" + sys.argv[3]

class ScopedHandler(SimpleHTTPRequestHandler):
    def _in_scope(self):
        return self.path == prefix or self.path.startswith(prefix + "/")

    def do_GET(self):
        if not self._in_scope():
            self.close_connection = True
            return
        super().do_GET()

    def do_HEAD(self):
        if not self._in_scope():
            self.close_connection = True
            return
        super().do_HEAD()

    def list_directory(self, path):
        self.close_connection = True
        return None

TCPServer.allow_reuse_address = True
with TCPServer(("", port), functools.partial(ScopedHandler, directory=directory)) as httpd:
    httpd.serve_forever()
PY
else
  echo "serving dist/ on http://localhost:${PORT}"
  python3 -m http.server "$PORT" --directory dist
fi
