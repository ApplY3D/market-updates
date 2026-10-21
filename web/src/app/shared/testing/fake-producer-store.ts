import { signal } from '@angular/core';
import { vi } from 'vitest';
import type { InstrumentMetrics } from '../../domain/metrics';
import { DEFAULT_SETTINGS, type ProducerSettings } from '../../domain/producer-settings';
import type { RunStats } from '../../producer/protocol';
import { ProducerStore, type ProducerStatus } from '../../producer/producer.store';

export const fakeProducerStore = () => ({
  status: signal<ProducerStatus>('running'),
  error: signal<string | null>(null),
  settings: signal<ProducerSettings>(DEFAULT_SETTINGS),
  runId: signal(1),
  seed: signal<bigint | null>(42n),
  rows: signal<readonly InstrumentMetrics[]>([]),
  stats: signal<RunStats>({ batches: 0, updates: 0, lastBatchAt: null }),
  apply: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  retry: vi.fn(),
});

export type FakeProducerStore = ReturnType<typeof fakeProducerStore>;

export const provideFakeProducerStore = (fake: FakeProducerStore) => ({
  provide: ProducerStore,
  useValue: fake,
});
