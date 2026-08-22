#!/usr/bin/env bash
# Build the app and serve it, no dev server.
#
#   ./run.sh            # http://localhost:4173
#   ./run.sh 8090       # somewhere else
#
# dist/ is a static bundle (relative asset paths + hash routing), so any file
# server will do -- this one is just the shortest one everybody already has.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
PORT="${1:-4173}"

npm run build
echo "serving dist/ on http://localhost:${PORT}"
python3 -m http.server "$PORT" --directory dist
