import type { DeepReadonly } from '../domain/deep-readonly';
import { InstrumentMetrics } from '../domain/metrics';
import { ProducerSettings } from '../domain/producer-settings';

export type RunStats = DeepReadonly<{
  batches: number;
  updates: number;
}>;

/** Posted by the worker transport on connect. The store never sends it. */
export type WorkerBoot = DeepReadonly<{ type: 'init'; baseUri: string }>;

export type ProducerCommand = DeepReadonly<
  | { type: 'start'; runId: number; settings: ProducerSettings; seed: bigint }
  | { type: 'pause'; runId: number }
  | { type: 'resume'; runId: number }
>;

export type ProducerEvent = DeepReadonly<
  | { type: 'ready' }
  | { type: 'snapshot'; runId: number; rows: InstrumentMetrics[]; stats: RunStats }
  | { type: 'error'; runId: number | null; phase: 'init' | 'run'; message: string }
>;
