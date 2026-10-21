import { MarketUpdate, packUpdates } from './market-update';
import { MarketMetrics } from './metrics';

const trade = (overrides: Partial<MarketUpdate> = {}): MarketUpdate => ({
  instrument: 0,
  priceCents: 10_000,
  tradeQuantity: 10,
  bidCents: 9_999,
  askCents: 10_000,
  bidQuantity: 500,
  askQuantity: 500,
  ...overrides,
});

describe('MarketMetrics', () => {
  it('starts with unavailable values and zero volume', () =>
    expect(new MarketMetrics(2).snapshot()).toEqual([
      {
        symbol: 'ALFA',
        lastPriceCents: null,
        spreadCents: null,
        volume: 0,
        vwapCents: null,
        imbalance: null,
      },
      {
        symbol: 'BETA',
        lastPriceCents: null,
        spreadCents: null,
        volume: 0,
        vwapCents: null,
        imbalance: null,
      },
    ]));

  it('matches the worked example', () => {
    const metrics = new MarketMetrics(1);
    metrics.apply(trade({ priceCents: 10_000, tradeQuantity: 10 }));
    metrics.apply(
      trade({
        priceCents: 10_200,
        tradeQuantity: 30,
        bidCents: 10_196,
        askCents: 10_200,
        bidQuantity: 600,
        askQuantity: 400,
      }),
    );

    expect(metrics.snapshot()[0]).toEqual({
      symbol: 'ALFA',
      lastPriceCents: 10_200,
      spreadCents: 4,
      volume: 40,
      vwapCents: 10_150,
      imbalance: 0.2,
    });
  });

  it('reports unavailable imbalance when both book quantities are zero', () => {
    const metrics = new MarketMetrics(1);
    metrics.apply(trade({ bidQuantity: 0, askQuantity: 0 }));
    expect(metrics.snapshot()[0]?.imbalance).toBeNull();
  });

  it('uses only the latest quote for spread and imbalance', () => {
    const metrics = new MarketMetrics(1);
    metrics.apply(trade({ bidCents: 100, askCents: 200, bidQuantity: 900, askQuantity: 100 }));
    metrics.apply(trade({ bidCents: 150, askCents: 151, bidQuantity: 0, askQuantity: 10 }));
    expect(metrics.snapshot()[0]).toMatchObject({ spreadCents: 1, imbalance: -1 });
  });

  it('keeps instruments isolated', () => {
    const metrics = new MarketMetrics(3);
    metrics.apply(trade({ instrument: 0, priceCents: 100, tradeQuantity: 1 }));
    metrics.apply(trade({ instrument: 2, priceCents: 300, tradeQuantity: 5 }));
    metrics.apply(trade({ instrument: 2, priceCents: 400, tradeQuantity: 5 }));

    const [first, second, third] = metrics.snapshot();
    expect(first).toMatchObject({ lastPriceCents: 100, volume: 1, vwapCents: 100 });
    expect(second).toMatchObject({ lastPriceCents: null, volume: 0, vwapCents: null });
    expect(third).toMatchObject({ lastPriceCents: 400, volume: 10, vwapCents: 350 });
  });

  it('applies packed batches like individual updates, counting every trade', () => {
    const updates = [
      trade({ instrument: 1, priceCents: 200, tradeQuantity: 2 }),
      trade({ instrument: 0, priceCents: 100, tradeQuantity: 1 }),
      trade({ instrument: 1, priceCents: 250, tradeQuantity: 2 }),
    ];
    const packed = new MarketMetrics(2);
    const individual = new MarketMetrics(2);
    packed.applyPacked(packUpdates(updates));
    updates.forEach((u) => individual.apply(u));

    expect(packed.snapshot()).toEqual(individual.snapshot());
    expect(packed.snapshot()[1]).toMatchObject({ volume: 4, vwapCents: 225 });
  });

  it('rejects updates for unknown instruments', () =>
    expect(() => new MarketMetrics(1).apply(trade({ instrument: 1 }))).toThrow(RangeError));
});
