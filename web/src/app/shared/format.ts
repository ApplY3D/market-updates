export const UNAVAILABLE = '—';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const rate = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const signed = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});

const orUnavailable =
  <T>(format: (value: T) => string) =>
  (value: T | null): string =>
    value === null ? UNAVAILABLE : format(value);

// Rounds to whole cents first so binary fractions like 100.5 / 100 don't round down.
export const formatUsdCents = orUnavailable((cents: number) => usd.format(Math.round(cents) / 100));

export const formatInteger = orUnavailable((value: number) => integer.format(value));

export const formatImbalance = orUnavailable((value: number) =>
  signed.format(value).replace('-', '−'),
);

export const formatSeed = orUnavailable(
  (seed: bigint) => `0x${seed.toString(16).padStart(16, '0')}`,
);

export const formatRate = (perSecond: number): string => `${rate.format(perSecond)} updates/s`;

export type Trend = 'up' | 'down';

/** Direction of a value as displayed with two decimals; `null` when it shows as zero. */
export const trendOf = (value: number | null): Trend | null =>
  value === null || Math.round(Math.abs(value) * 100) === 0 ? null : value > 0 ? 'up' : 'down';
