export interface MarketUpdate {
  readonly instrument: number;
  readonly priceCents: number;
  readonly tradeQuantity: number;
  readonly bidCents: number;
  readonly askCents: number;
  readonly bidQuantity: number;
  readonly askQuantity: number;
}

/** Fields per update in the packed `Uint32Array` produced by the Wasm generator. */
export const UPDATE_STRIDE = 7;

type PackedUpdate = readonly [number, number, number, number, number, number, number];

export const updateCount = (packed: Uint32Array): number => packed.length / UPDATE_STRIDE;

export const readUpdate = (packed: Uint32Array, index: number): MarketUpdate => {
  const offset = index * UPDATE_STRIDE;
  const [instrument, priceCents, tradeQuantity, bidCents, askCents, bidQuantity, askQuantity] =
    packed.subarray(offset, offset + UPDATE_STRIDE) as unknown as PackedUpdate;
  return { instrument, priceCents, tradeQuantity, bidCents, askCents, bidQuantity, askQuantity };
};

export const packUpdates = (updates: readonly MarketUpdate[]): Uint32Array =>
  Uint32Array.from(
    updates.flatMap((u) => [
      u.instrument,
      u.priceCents,
      u.tradeQuantity,
      u.bidCents,
      u.askCents,
      u.bidQuantity,
      u.askQuantity,
    ]),
  );
