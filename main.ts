// SPDX-License-Identifier: MIT
// Token radar entry for make.fun's token-radar-01 (Node 22, standard library only).
//
// Reads /input/snapshot.json (or --input), ranks every protocol that records no token by an implied value
// calibrated on the snapshot's own live tokens (lib/model.ts), attaches a farm plan to each (lib/farm.ts),
// and writes /output/board.json, /output/data.js, the dashboard, the screenshots and /output/dossier.json.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL, calibrate, factorsFor, implied, isDerivative, isPreToken, structureReason, type Snapshot, type SnapshotProtocol } from './lib/model.ts';
import { farmPlan, stepText } from './lib/farm.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1]! : fallback;
}

function fail(msg: string): never {
  process.stderr.write(`token radar: ${msg}\n`);
  process.exit(1);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) fail(`no snapshot at ${inputFile}`);
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snap = JSON.parse(readFileSync(inputFile, 'utf8')) as Snapshot;
if (!Array.isArray(snap.protocols) || !Array.isArray(snap.watchlist)) fail('snapshot has no protocols or watchlist');
const watch = new Set(snap.watchlist);
const { global, byCat } = calibrate(snap);

// Who goes on the board: every watchlist slug, and every other protocol that records no token, except
// exchanges (a CEX's reserves are customer deposits, not a protocol's TVL).
const chosen = snap.protocols.filter((p) => watch.has(p.slug) || (isPreToken(p) && p.category !== 'CEX'));

function segmentOf(p: SnapshotProtocol): 'watchlist' | 'early' | 'derivative' | 'off-list' {
  if (watch.has(p.slug)) return 'watchlist';
  if (isDerivative(p)) return 'derivative';
  return p.tvl_usd < snap.floor_usd ? 'early' : 'off-list';
}

const scored = chosen.map((p) => {
  const cal = byCat.get(p.category ?? 'Uncategorised')!;
  const f = factorsFor(p, snap.as_of, cal);
  return { p, f, value: implied(p, f), steps: farmPlan(p, f.age_days) };
});
scored.sort((a, b) => b.value - a.value || (a.p.slug < b.p.slug ? -1 : 1));

const rows = scored.map((s, i) => ({
  rank: i + 1,
  slug: s.p.slug,
  name: s.p.name,
  category: s.p.category,
  chains: s.p.chains,
  tvl_usd: s.p.tvl_usd,
  change_7d: s.p.change_7d,
  listed_at: s.p.listed_at,
  age_days: s.f.age_days,
  token_status: 'pre-token',
  segment: segmentOf(s.p),
  implied_value_usd: s.value,
  implied_mcap_to_tvl: Math.round((s.value / s.p.tvl_usd) * 1e4) / 1e4,
  factors: s.f,
  structure_note: structureReason(s.p),
  airdrop_per_1k_usd: Math.round((1000 / s.p.tvl_usd) * s.value * MODEL.airdrop_share * 100) / 100,
  farm_steps: s.steps.map(stepText),
  farm_plan: s.steps,
}));

// The gate's own checks, before anything is written.
const slugs = new Set(rows.map((r) => r.slug));
const missing = snap.watchlist.filter((s) => !slugs.has(s));
if (missing.length) fail(`board misses watchlist slugs: ${missing.join(', ')}`);
if (rows.length < 100 || rows.length > 4000) fail(`board has ${rows.length} rows`);
for (let i = 1; i < rows.length; i++) if (rows[i]!.implied_value_usd > rows[i - 1]!.implied_value_usd) fail(`row ${i + 1} out of order`);
for (const r of rows) {
  if (r.farm_steps.length < 3 || r.farm_steps.length > 12) fail(`${r.slug}: ${r.farm_steps.length} steps`);
  for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) fail(`${r.slug}: step of ${s.length} chars`);
}

// The live tokens: the market's own values, kept apart from the board and used to calibrate it.
const live = snap.protocols
  .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.category !== 'CEX')
  .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, symbol: p.symbol, change_7d: p.change_7d }))
  .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0));

const data = {
  as_of: snap.as_of,
  source: snap.source,
  floor_usd: snap.floor_usd,
  protocol_count: snap.protocols.length,
  watchlist_size: snap.watchlist.length,
  model: MODEL,
  global_multiple: global,
  calibration: [...byCat.values()].filter((c) => rows.some((r) => (r.category ?? 'Uncategorised') === c.category)).sort((a, b) => b.multiple - a.multiple),
  rows: rows.map(({ farm_steps, ...r }) => r),
  live,
};

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ model: MODEL.version, as_of: snap.as_of, rows: rows.map(({ farm_plan, ...r }) => r) })}\n`);
writeFileSync(join(out, 'data.js'), `window.RADAR=${JSON.stringify(data)};\n`);

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names = readdirSync(from).filter((n) => !n.startsWith('.') && statSync(join(from, n)).isFile()).sort();
  for (const n of names) copyFileSync(join(from, n), join(to, n));
  return names;
}
copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) fail(`screenshots/ holds ${shots.length} images: hand in 3`);

writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));
const counts = rows.reduce<Record<string, number>>((m, r) => ((m[r.segment] = (m[r.segment] ?? 0) + 1), m), {});
process.stdout.write(`token radar: ${rows.length} rows (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}), ${live.length} live tokens for calibration, global multiple ${global}\n`);
