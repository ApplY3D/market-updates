import {
  formatImbalance,
  formatInteger,
  formatRate,
  formatSeed,
  formatUsdCents,
  trendOf,
  UNAVAILABLE,
} from './format';

describe('format', () => {
  it('formats cents as USD with two decimals', () => {
    expect(formatUsdCents(10150)).toBe('$101.50');
    expect(formatUsdCents(4)).toBe('$0.04');
    expect(formatUsdCents(0)).toBe('$0.00');
    expect(formatUsdCents(123456789)).toBe('$1,234,567.89');
  });

  it('rounds fractional cents only for display', () => {
    expect(formatUsdCents(100.5)).toBe('$1.01');
    expect(formatUsdCents(100.49)).toBe('$1.00');
    expect(formatUsdCents(10149.6)).toBe('$101.50');
  });

  it('shows unavailable values as a dash', () => {
    expect(UNAVAILABLE).toBe('—');
    expect(formatUsdCents(null)).toBe('—');
    expect(formatImbalance(null)).toBe('—');
  });

  it('formats volume as a grouped integer', () => {
    expect(formatInteger(0)).toBe('0');
    expect(formatInteger(1234567)).toBe('1,234,567');
  });

  it('formats imbalance as signed fixed two decimals', () => {
    expect(formatImbalance(0.2)).toBe('+0.20');
    expect(formatImbalance(-0.15)).toBe('−0.15');
    expect(formatImbalance(1)).toBe('+1.00');
    expect(formatImbalance(-1)).toBe('−1.00');
    expect(formatImbalance(0)).toBe('0.00');
    expect(formatImbalance(-0.001)).toBe('0.00');
    expect(formatImbalance(0.004)).toBe('0.00');
  });

  it('derives the trend from the displayed value', () => {
    expect(trendOf(0.2)).toBe('up');
    expect(trendOf(-0.15)).toBe('down');
    expect(trendOf(0.004)).toBeNull();
    expect(formatImbalance(-0.005)).toBe('−0.01');
    expect(trendOf(-0.005)).toBe('down');
    expect(trendOf(0.005)).toBe('up');
    expect(trendOf(null)).toBeNull();
  });

  it('formats the nominal rate and seed', () => {
    expect(formatRate(200)).toBe('200 updates/s');
    expect(formatRate(1000 / 3)).toBe('333.3 updates/s');
    expect(formatRate(20_000)).toBe('20,000 updates/s');
    expect(formatSeed(42n)).toBe('0x000000000000002a');
  });
});
