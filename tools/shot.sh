#!/bin/sh
# Screenshot a local page with headless Chrome.
#
#   sh tools/shot.sh <url-path> <out.png> [width] [height]
#   sh tools/shot.sh /team.html /tmp/team.png 1280 900
#
# The flags matter:
#   --password-store=basic --use-mock-keychain   Chrome otherwise asks the
#       desktop to unlock its keyring, which pops a dialog on the machine of
#       whoever happens to be sitting there.
#   --user-data-dir=<throwaway>                  a fresh profile each run, so
#       nothing is shared with the browser you actually use.
#   --disable-dev-shm-usage                      headless dies on small /dev/shm.
set -e
path=${1:-/}
out=${2:-/tmp/shot.png}
width=${3:-1280}
height=${4:-900}
profile=$(mktemp -d)
trap 'rm -rf "$profile"' EXIT

google-chrome \
  --headless=new --disable-gpu --no-sandbox --disable-dev-shm-usage \
  --password-store=basic --use-mock-keychain \
  --user-data-dir="$profile" \
  --hide-scrollbars --virtual-time-budget=4000 \
  --window-size="$width","$height" \
  --screenshot="$out" \
  "http://localhost:8899$path" 2>/dev/null

echo "$out"
