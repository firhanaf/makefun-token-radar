# makefun-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/firhanaf/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/firhanaf/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

**Pre-Token Radar**: ranks every DeFi protocol that records no token in the sealed DefiLlama snapshot by an
implied value calibrated on the market's own prices, and gives each one a costed farm plan.

- **Model `calibrated-1`** (`lib/model.ts`): `implied = TVL × categoryMultiple × momentum × track × structure`.
  The category multiple is the median mcap/TVL of the snapshot's *live* tokens in that category, shrunk
  toward the all-token median; momentum comes from the 7-day TVL change; track rewards days listed with no
  token; wrappers, staked/bridged products and exchanges' own products are discounted. No protocol is
  named in the model.
- **Board**: all 40 watchlist protocols plus every other pre-token protocol (300 rows), tagged
  watchlist / early (under the floor) / off-list / derivative. Live tokens are kept apart and only calibrate.
- **Farm plans** (`lib/farm.ts`): 7 steps per protocol (check, enter, keep, launch) with cost and time,
  sized from the protocol's TVL, chain gas, category play and age.
- **Dashboard** (`dashboard/`): sortable, filterable board, detail drawer with the value build-up and plan,
  Live-tokens calibration view and a Model page. No framework, no network; state in the URL hash.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
sh tools/shoot.sh   # optional: re-capture screenshots with headless Chrome
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
