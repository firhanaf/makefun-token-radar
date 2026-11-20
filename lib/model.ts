// SPDX-License-Identifier: MIT
// Token radar model "calibrated-1": the snapshot in, a ranked board of pre-token protocols out.
//
// The idea: the snapshot already prices tokens. Its 129-odd protocols whose token trades carry both a
// TVL and a market cap, so the market's own mcap / TVL multiple can be read per category. A protocol
// that records no token is then valued as if it launched today at its category's multiple, adjusted by
// what its own record says:
//
//   implied = TVL x categoryMultiple x momentum x track x structure
//
//   categoryMultiple  median mcap/TVL of the category's live tokens, shrunk toward the median of all
//                     live tokens (weight n / (n + SHRINK)), clamped to [MULT_MIN, MULT_MAX]
//   momentum          1 + MOMENTUM_WEIGHT x clamp(change_7d, MOM_FLOOR, MOM_CAP) / 100
//   track             TRACK_FLOOR + (1 - TRACK_FLOOR) x min(days listed with no token, TRACK_DAYS) / TRACK_DAYS
//                     (no listing date: UNKNOWN_TRACK)
//   structure         DERIVATIVE_HAIRCUT for a wrapper / staked / bridged / versioned product, else 1
//
// No protocol name is special-cased: the same function scores every row, and every constant is in MODEL.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export const MODEL = {
  version: 'calibrated-1',
  shrink: 4,
  mult_min: 0.04,
  mult_max: 2.5,
  momentum_weight: 1.2,
  mom_floor: -40,
  mom_cap: 60,
  track_floor: 0.55,
  track_days: 730,
  unknown_track: 0.7,
  derivative_haircut: 0.2,
  airdrop_share: 0.1,
};
export type Model = typeof MODEL;

/** Categories whose products are usually a wrapper of an asset that already trades. */
const DERIVATIVE_CATS = new Set(['Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'Bridge', 'Canonical Bridge', 'Staking Pool', 'Stablecoin Wrapper', 'Anchor BTC']);
const VERSIONED = /\s(v\d+(\.\d+)?|\d+\.\d+)$/i;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** An exchange's own product: its value accrues to the exchange's token or equity, not a new token. */
const EXCHANGE_PREFIX = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini|htx|kucoin|gate|mexc|crypto\.com)\b/i;

/** Why a protocol's structure is discounted, or null for a stand-alone protocol. */
export function structureReason(p: SnapshotProtocol): string | null {
  if (EXCHANGE_PREFIX.test(p.name)) return 'an exchange\'s own product: value accrues to the exchange';
  if (p.category !== null && DERIVATIVE_CATS.has(p.category)) return `${p.category}: a wrapper of an asset that already trades`;
  if (WRAPPED_WORD.test(p.name)) return 'wrapped or staked product of a traded asset';
  if (VERSIONED.test(p.name)) return 'a versioned deployment of a larger protocol';
  return null;
}

export function isDerivative(p: SnapshotProtocol): boolean {
  return structureReason(p) !== null;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`), b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / 86_400_000));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export interface Calibration {
  category: string;
  live_count: number;
  raw_median: number | null;
  multiple: number;
  examples: string[];
}

/** The market's own mcap/TVL multiple for every category, read from the snapshot's live tokens. */
export function calibrate(snap: Snapshot, model: Model = MODEL): { global: number; byCat: Map<string, Calibration> } {
  const live = snap.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX');
  // Work in logs: multiples are spread over four orders of magnitude.
  const logs = live.map((p) => Math.log(p.mcap_usd! / p.tvl_usd));
  const globalLog = median(logs);
  const groups = new Map<string, SnapshotProtocol[]>();
  for (const p of live) {
    const k = p.category ?? 'Uncategorised';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(p);
  }
  const cats = new Set(snap.protocols.map((p) => p.category ?? 'Uncategorised'));
  const byCat = new Map<string, Calibration>();
  for (const c of cats) {
    const g = groups.get(c) ?? [];
    const n = g.length;
    const catLog = n ? median(g.map((p) => Math.log(p.mcap_usd! / p.tvl_usd))) : globalLog;
    const w = n / (n + model.shrink);
    const mult = Math.min(model.mult_max, Math.max(model.mult_min, Math.exp(w * catLog + (1 - w) * globalLog)));
    byCat.set(c, {
      category: c,
      live_count: n,
      raw_median: n ? round(Math.exp(catLog), 4) : null,
      multiple: round(mult, 4),
      examples: g.sort((a, b) => b.mcap_usd! - a.mcap_usd!).slice(0, 3).map((p) => p.name),
    });
  }
  return { global: round(Math.exp(globalLog), 4), byCat };
}

const round = (n: number, d: number): number => Math.round(n * 10 ** d) / 10 ** d;

export interface Factors {
  multiple: number;
  momentum: number;
  track: number;
  structure: number;
  age_days: number | null;
}

export function factorsFor(p: SnapshotProtocol, asOf: string, cal: Calibration, model: Model = MODEL): Factors {
  const g = Math.min(model.mom_cap, Math.max(model.mom_floor, p.change_7d ?? 0));
  const momentum = 1 + (model.momentum_weight * g) / 100;
  const age = ageDays(asOf, p.listed_at);
  const track = age === null ? model.unknown_track : model.track_floor + (1 - model.track_floor) * (Math.min(age, model.track_days) / model.track_days);
  const structure = isDerivative(p) ? model.derivative_haircut : 1;
  return { multiple: cal.multiple, momentum: round(momentum, 4), track: round(track, 4), structure, age_days: age };
}

export function implied(p: SnapshotProtocol, f: Factors): number {
  return Math.max(1, Math.round(p.tvl_usd * f.multiple * f.momentum * f.track * f.structure));
}
