import {
  DEFAULT_SETTINGS,
  isValidSetting,
  isValidSettings,
  nominalRate,
  SETTINGS_LIMITS,
} from './producer-settings';

describe('producer settings', () => {
  it('defaults are valid', () => expect(isValidSettings(DEFAULT_SETTINGS)).toBe(true));

  it.each(
    Object.entries(SETTINGS_LIMITS) as [
      keyof typeof SETTINGS_LIMITS,
      { min: number; max: number },
    ][],
  )('%s accepts its bounds and rejects values outside them', (key, { min, max }) => {
    expect(isValidSetting(key, min)).toBe(true);
    expect(isValidSetting(key, max)).toBe(true);
    expect(isValidSetting(key, min - 1)).toBe(false);
    expect(isValidSetting(key, max + 1)).toBe(false);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects non-integer %s', (value) =>
    expect(isValidSetting('instrumentCount', value)).toBe(false),
  );

  it('rejects settings with any invalid field', () =>
    expect(isValidSettings({ ...DEFAULT_SETTINGS, batchIntervalMs: 49 })).toBe(false));

  it('computes the nominal rate across all instruments', () =>
    expect(nominalRate(DEFAULT_SETTINGS)).toBe(200));
});
