import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readUpdate, UPDATE_STRIDE, updateCount } from '../../domain/market-update';
import { GeneratorFactory } from './ports';
import { loadWasmGenerator } from './wasm-generator';

describe('loadWasmGenerator (real Wasm)', () => {
  let create: GeneratorFactory;

  beforeAll(async () => {
    create = await loadWasmGenerator(
      await readFile(resolve(process.cwd(), 'src/wasm/pkg/market_gen_bg.wasm')),
    );
  });

  it.each([1, 7, 1_000])('returns %i packed updates', (n) => {
    const generator = create(1n, 5);
    expect(generator.generate(n)).toHaveLength(n * UPDATE_STRIDE);
    generator.dispose();
  });

  it('upholds market invariants', () => {
    const count = 13;
    const generator = create(7n, count);
    const packed = Array.from({ length: 20 }, () => generator.generate(1_000));
    generator.dispose();
    for (const batch of packed)
      for (let i = 0; i < updateCount(batch); i++) {
        const u = readUpdate(batch, i);
        expect(u.instrument).toBeLessThan(count);
        expect(u.priceCents).toBeGreaterThan(0);
        expect(u.bidCents).toBeGreaterThan(0);
        expect(u.bidCents).toBeLessThan(u.askCents);
        expect([u.bidCents, u.askCents]).toContain(u.priceCents);
        expect(u.tradeQuantity).toBeGreaterThanOrEqual(1);
      }
  });

  it('is deterministic for the same seed', () => {
    const [a, b, c] = [123n, 123n, 124n].map((seed) => create(seed, 10));
    const batches = [a, b, c].map((g) => [g!.generate(500), g!.generate(500)]);
    [a, b, c].forEach((g) => g!.dispose());
    expect(batches[0]).toEqual(batches[1]);
    expect(batches[0]).not.toEqual(batches[2]);
  });

  it('throws on invalid configuration', () => {
    expect(() => create(1n, 0)).toThrow();
    expect(() => create(1n, 1_001)).toThrow();
    const generator = create(1n, 1);
    expect(() => generator.generate(0)).toThrow();
    expect(() => generator.generate(100_001)).toThrow();
    generator.dispose();
  });

  it('cannot be used after dispose', () => {
    const generator = create(1n, 1);
    generator.dispose();
    expect(() => generator.generate(1)).toThrow();
  });
});
