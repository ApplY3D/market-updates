import { InstrumentMetrics } from '../domain/metrics';
import { ProducerSettings } from '../domain/producer-settings';

export interface RunStats {
  readonly batches: number;
  readonly updates: number;
  readonly lastBatchAt: number | null;
}

export type ProducerCommand =
  | { readonly type: 'init'; readonly wasmUrl: string }
  | {
      readonly type: 'start';
      readonly runId: number;
      readonly settings: ProducerSettings;
      readonly seed: bigint;
    }
  | { readonly type: 'pause'; readonly runId: number }
  | { readonly type: 'resume'; readonly runId: number };

export type ProducerEvent =
  | { readonly type: 'ready' }
  | {
      readonly type: 'snapshot';
      readonly runId: number;
      readonly rows: readonly InstrumentMetrics[];
      readonly stats: RunStats;
    }
  | {
      readonly type: 'error';
      readonly runId: number | null;
      readonly phase: 'init' | 'run';
      readonly message: string;
    };
