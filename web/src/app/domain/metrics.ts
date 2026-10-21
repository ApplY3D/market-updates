import { symbolFor } from './instruments';
import { MarketUpdate, readUpdate, updateCount } from './market-update';

export interface InstrumentMetrics {
  readonly symbol: string;
  readonly lastPriceCents: number | null;
  readonly spreadCents: number | null;
  readonly volume: number;
  readonly vwapCents: number | null;
  readonly imbalance: number | null;
}

interface Accumulator {
  latest: MarketUpdate | null;
  volume: number;
  notionalCents: number;
}

const ratio = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator;

const toMetrics = (
  { latest, volume, notionalCents }: Accumulator,
  index: number,
): InstrumentMetrics => ({
  symbol: symbolFor(index),
  lastPriceCents: latest?.priceCents ?? null,
  spreadCents: latest ? latest.askCents - latest.bidCents : null,
  volume,
  vwapCents: ratio(notionalCents, volume),
  imbalance: latest
    ? ratio(latest.bidQuantity - latest.askQuantity, latest.bidQuantity + latest.askQuantity)
    : null,
});

/** Cumulative per-instrument metrics; keeps only running totals and the latest update. */
export class MarketMetrics {
  readonly #accumulators: Accumulator[];

  constructor(instrumentCount: number) {
    this.#accumulators = Array.from({ length: instrumentCount }, () => ({
      latest: null,
      volume: 0,
      notionalCents: 0,
    }));
  }

  apply(update: MarketUpdate): void {
    const acc = this.#accumulators[update.instrument];
    if (!acc) throw new RangeError(`Unknown instrument ${update.instrument}`);
    acc.latest = update;
    acc.volume += update.tradeQuantity;
    acc.notionalCents += update.priceCents * update.tradeQuantity;
  }

  applyPacked(packed: Uint32Array): void {
    for (let i = 0; i < updateCount(packed); i++) this.apply(readUpdate(packed, i));
  }

  snapshot(): InstrumentMetrics[] {
    return this.#accumulators.map(toMetrics);
  }
}
