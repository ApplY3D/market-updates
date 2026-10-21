import { MarketUpdate, packUpdates, readUpdate, UPDATE_STRIDE, updateCount } from './market-update';
import { symbolFor } from './instruments';

const update: MarketUpdate = {
  instrument: 1,
  priceCents: 10_200,
  tradeQuantity: 30,
  bidCents: 10_196,
  askCents: 10_200,
  bidQuantity: 600,
  askQuantity: 400,
};

describe('market update decoding', () => {
  it('round-trips through the packed layout', () => {
    const packed = packUpdates([{ ...update, instrument: 0 }, update]);
    expect(packed).toHaveLength(2 * UPDATE_STRIDE);
    expect(updateCount(packed)).toBe(2);
    expect(readUpdate(packed, 1)).toEqual(update);
  });
});

describe('symbolFor', () => {
  it('returns 50 unique symbols', () =>
    expect(new Set(Array.from({ length: 50 }, (_, i) => symbolFor(i))).size).toBe(50));
});
