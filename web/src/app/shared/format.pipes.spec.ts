import { ImbalancePipe, IntegerPipe, SeedPipe, TrendPipe, UsdPipe } from './format.pipes';

describe('format pipes', () => {
  it('delegate to the shared formatters', () => {
    expect(new UsdPipe().transform(10_150)).toBe('$101.50');
    expect(new UsdPipe().transform(null)).toBe('—');
    expect(new IntegerPipe().transform(1_234_567)).toBe('1,234,567');
    expect(new ImbalancePipe().transform(-0.15)).toBe('−0.15');
    expect(new TrendPipe().transform(0.2)).toBe('up');
    expect(new SeedPipe().transform(42n)).toBe('0x000000000000002a');
  });
});
