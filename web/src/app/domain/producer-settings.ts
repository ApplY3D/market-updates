export interface ProducerSettings {
  readonly instrumentCount: number;
  readonly updatesPerBatch: number;
  readonly batchIntervalMs: number;
}

export type SettingKey = keyof ProducerSettings;

export const SETTINGS_LIMITS = {
  instrumentCount: { min: 1, max: 50 },
  updatesPerBatch: { min: 1, max: 1_000 },
  batchIntervalMs: { min: 50, max: 2_000 },
} as const satisfies Record<SettingKey, { min: number; max: number }>;

export const DEFAULT_SETTINGS: ProducerSettings = {
  instrumentCount: 5,
  updatesPerBatch: 100,
  batchIntervalMs: 500,
};

export const isValidSetting = (key: SettingKey, value: number): boolean =>
  Number.isInteger(value) && value >= SETTINGS_LIMITS[key].min && value <= SETTINGS_LIMITS[key].max;

export const isValidSettings = (settings: ProducerSettings): boolean =>
  (Object.keys(SETTINGS_LIMITS) as SettingKey[]).every((key) => isValidSetting(key, settings[key]));

/** Nominal updates per second across all instruments. */
export const nominalRate = ({ updatesPerBatch, batchIntervalMs }: ProducerSettings): number =>
  (updatesPerBatch * 1_000) / batchIntervalMs;
