// SPDX-License-Identifier: MIT
// Farm plans: concrete steps, each with what it costs and how long it takes, derived from a protocol's
// own record (category, chains, TVL, seven-day change, days listed). No name is special-cased.

import type { SnapshotProtocol } from './model.ts';

export interface Step {
  phase: 'check' | 'enter' | 'keep' | 'launch';
  text: string;
  cost: string;
  time: string;
}

/** A rough gas cost per transaction on the chain, in dollars, as a reader would budget it. */
export function gasPerTx(chain: string): { usd: number; label: string } {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return { usd: 6, label: '$3-10' };
  if (c === 'bitcoin') return { usd: 4, label: '$2-8' };
  if (['solana', 'sui', 'aptos', 'ton', 'tron', 'near', 'stellar', 'xrpl', 'algorand', 'hedera', 'cardano'].includes(c)) return { usd: 0.05, label: 'under $0.10' };
  return { usd: 0.3, label: 'under $0.50' };
}

/** The position size a reader can farm without moving the pool: scales with TVL, in dollars. */
export function capitalFor(tvl: number): number {
  if (tvl >= 1e9) return 2000;
  if (tvl >= 2e8) return 1000;
  if (tvl >= 5e7) return 500;
  if (tvl >= 1.5e7) return 300;
  return 200;
}

/** How long to stay in: a protocol with a short record usually runs its points season longer. */
export function holdDays(age: number | null): number {
  if (age === null) return 60;
  if (age < 120) return 90;
  if (age < 365) return 60;
  if (age < 900) return 45;
  return 30;
}

interface Play {
  enter: (n: string, cap: number, chain: string) => string;
  keep: string;
  risk: string;
}

/** One play per family of categories. The family is matched on the category text. */
function playFor(category: string | null): Play {
  const c = (category ?? '').toLowerCase();
  const fam = (keys: string[]) => keys.some((k) => c.includes(k));
  if (fam(['lending', 'cdp', 'credit'])) return {
    enter: (n, cap, ch) => `Supply $${cap} of USDC to ${n} on ${ch}, then borrow 20-30% of it in a second asset so the account shows both sides of the market.`,
    keep: 'Repay and re-borrow a small amount once a week; keep the health factor above 2.',
    risk: 'liquidation if the borrowed asset rallies: keep the loan small',
  };
  if (fam(['dex', 'liquidity manager', 'farm', 'leveraged'])) return {
    enter: (n, cap, ch) => `Split $${cap} into the two assets of ${n}'s deepest stable or blue-chip pool on ${ch} and add them as liquidity.`,
    keep: 'Make two or three swaps a week through the protocol and re-centre the range when price leaves it.',
    risk: 'impermanent loss on a volatile pair: prefer a stable pair',
  };
  if (fam(['derivative', 'perp', 'options', 'basis'])) return {
    enter: (n, cap, ch) => `Deposit $${cap} of USDC as margin on ${n} (${ch}) and open a delta-neutral position: a small long and an equal short, or its liquidity vault.`,
    keep: 'Trade a few hundred dollars of volume a week at low leverage (2x or less); volume is what perp points usually count.',
    risk: 'fees and funding eat into small accounts: track the net cost in the log',
  };
  if (fam(['staking', 'restak', 'btc'])) return {
    enter: (n, cap, ch) => `Stake $${cap} of the chain's base asset through ${n} on ${ch} and keep the receipt token in the same wallet.`,
    keep: 'Use the receipt token once a fortnight in one partner app the protocol lists, then return it.',
    risk: 'the receipt can trade below its asset: check the peg before exiting',
  };
  if (fam(['bridge'])) return {
    enter: (n, cap, ch) => `Bridge $${cap} of USDC to ${ch} through ${n}, then bridge part of it back a few days later.`,
    keep: 'Make one bridge transfer each week in alternating directions, on more than one route if offered.',
    risk: 'funds in flight are exposed to the bridge: never leave large sums in transit',
  };
  if (fam(['curator', 'allocator', 'yield', 'aggregator', 'vault', 'onchain capital'])) return {
    enter: (n, cap, ch) => `Deposit $${cap} of USDC into ${n}'s largest stablecoin vault on ${ch} and keep the vault shares.`,
    keep: 'Top up once a month instead of withdrawing; points are usually counted on time-weighted balance.',
    risk: 'a curator inherits the risk of every market it allocates to: read the vault\'s market list',
  };
  if (fam(['rwa', 'stable', 'treasur', 'cedefi'])) return {
    enter: (n, cap, ch) => `Mint or buy $${cap} of ${n}'s yield-bearing asset on ${ch} (finish its KYC first if it asks) and hold it.`,
    keep: 'Use the asset once a month in a lending market or pool that accepts it, so the balance shows real use.',
    risk: 'redemptions can be gated or delayed: read the redemption terms',
  };
  if (fam(['prediction', 'gaming', 'social', 'nft'])) return {
    enter: (n, cap, ch) => `Fund the account with $${Math.min(cap, 300)} on ${ch} and make your first few small positions or actions on ${n}.`,
    keep: 'Be active on several separate days each week; streaks and active days usually count more than size.',
    risk: 'activity rewards favour consistency: a missed fortnight can reset a tier',
  };
  if (fam(['chain'])) return {
    enter: (n, cap, ch) => `Bridge $${cap} to ${n} and spread it over two or three of its native apps (a DEX, a lending market).`,
    keep: 'Transact on several different days each week and try each new app the chain announces.',
    risk: 'chain-level drops weigh breadth of use, not size',
  };
  return {
    enter: (n, cap, ch) => `Deposit $${cap} of USDC into ${n}'s main product on ${ch} and keep the position open.`,
    keep: 'Make one qualifying action a week: a deposit, a claim or a vote.',
    risk: 'a new product carries contract risk: keep the position small',
  };
}

export function farmPlan(p: SnapshotProtocol, age: number | null): Step[] {
  const chain = p.chains[0] ?? 'its main chain';
  const gas = gasPerTx(chain);
  const cap = capitalFor(p.tvl_usd);
  const hold = holdDays(age);
  const play = playFor(p.category);
  const share = (cap / p.tvl_usd) * 100;
  const weeks = Math.ceil(hold / 7);
  const weeklyGas = gas.usd * 2;
  const trend = p.change_7d === null ? 'no seven-day change is recorded' : `TVL moved ${p.change_7d >= 0 ? '+' : ''}${p.change_7d.toFixed(1)}% in the last week`;
  const extra = p.chains.length > 1 ? ` It also runs on ${p.chains.slice(1, 3).join(' and ')}; pick the chain where you already hold funds.` : '';
  return [
    {
      phase: 'check',
      text: `Open ${p.name}'s official site from its DefiLlama page, find its audit and its points or rewards page, and note that ${trend}. Skip it if there is no audit.`,
      cost: 'free',
      time: '20 minutes',
    },
    {
      phase: 'check',
      text: `Set up a fresh wallet for this farm on ${chain} and fund it with the capital plus a gas buffer.${extra}`,
      cost: `gas ${gas.label} per transaction; budget $${Math.max(1, Math.ceil(gas.usd * 6))} for setup`,
      time: '10 minutes',
    },
    {
      phase: 'enter',
      text: `${play.enter(p.name, cap, chain)} At $${cap} you are ${share < 0.001 ? 'under 0.001' : share.toFixed(3)}% of its TVL.`,
      cost: `$${cap} of capital (recoverable) plus ${gas.label} gas`,
      time: '15 minutes',
    },
    {
      phase: 'keep',
      text: play.keep,
      cost: `about $${weeklyGas < 1 ? '1' : Math.ceil(weeklyGas)} of gas a week, $${Math.max(1, Math.ceil(weeklyGas * weeks))} over the window`,
      time: '10 minutes a week',
    },
    {
      phase: 'keep',
      text: `Hold for at least ${hold} days (${weeks} weekly snapshots) and log every transaction with its date and hash. Risk to watch: ${play.risk}.`,
      cost: 'capital stays locked; opportunity cost about 1% of it at stablecoin rates',
      time: `${hold} days`,
    },
    {
      phase: 'keep',
      text: `Exit early if TVL falls 30% below where you entered, or the protocol pauses withdrawals or changes its points terms against farmers.`,
      cost: 'one withdrawal\'s gas',
      time: '5 minutes a week to check',
    },
    {
      phase: 'launch',
      text: `If ${p.name} issues a token, claim only from the link on its own site or official account, never from a DM, and decide in advance how much to sell at launch (for example half).`,
      cost: 'claim gas only; never pay a fee to claim',
      time: '15 minutes on launch day',
    },
  ];
}

export function stepText(s: Step): string {
  const t = `${s.text} Cost: ${s.cost}. Time: ${s.time}.`;
  return t.length > 600 ? `${t.slice(0, 597)}...` : t;
}
