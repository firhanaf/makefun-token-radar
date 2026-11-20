#!/bin/sh
# Capture the three dashboard screenshots from out/ with headless Chrome (1440x900).
# Usage: sh tools/shoot.sh   (after: MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>)
set -e
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
PAGE="file:///$(cygpath -m "$PWD/out/dashboard/index.html")"
shot() {
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1440,900 \
    --virtual-time-budget=3000 --screenshot="$(cygpath -w "$PWD/screenshots/$1")" "$PAGE#$2" 2>/dev/null
}
shot 1-board.png ""
shot 2-detail.png "p=${DETAIL:-steakhouse-financial}"
shot 3-filtered.png "${FILTER:-seg=early&grow=1&sort=airdrop_per_1k_usd&dir=desc}"
ls -l screenshots
