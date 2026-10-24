import type { DeepReadonly } from '../../domain/deep-readonly';
import { updateCount } from '../../domain/market-update';
import { MarketMetrics } from '../../domain/metrics';
import { isValidSettings, ProducerSettings } from '../../domain/producer-settings';
import { ProducerCommand, ProducerEvent, RunStats } from '../protocol';
import { errorMessage } from './error-message';
import { GeneratorFactory, MarketGenerator, Scheduler } from './ports';

type StartCommand = Extract<ProducerCommand, { type: 'start' }>;

type Run = DeepReadonly<{
  id: number;
  settings: ProducerSettings;
  generator: MarketGenerator;
  metrics: MarketMetrics;
}> & {
  state: 'running' | 'paused';
  stats: RunStats;
  cancelTick: (() => void) | null;
};

/** Drives one producer run at a time: generate → aggregate → emit snapshot → schedule next batch. */
export class ProducerEngine {
  #run: Run | null = null;

  constructor(
    private readonly createGenerator: GeneratorFactory,
    private readonly emit: (event: ProducerEvent) => void,
    private readonly scheduler: Scheduler,
  ) {}

  handle(command: ProducerCommand): void {
    if (command.type === 'start') return this.#start(command);
    const run = this.#run;
    if (run?.id !== command.runId) return;
    if (command.type === 'pause' && run.state === 'running') return this.#pause(run);
    if (command.type === 'resume' && run.state === 'paused') return this.#resume(run);
  }

  dispose(): void {
    this.#stop();
  }

  #start({ runId, settings, seed }: StartCommand): void {
    this.#stop();
    if (!isValidSettings(settings)) return this.#fail(runId, 'Invalid producer settings');
    let generator: MarketGenerator;
    try {
      generator = this.createGenerator(seed, settings.instrumentCount);
    } catch (error) {
      return this.#fail(runId, errorMessage(error));
    }
    this.#run = {
      id: runId,
      settings,
      generator,
      metrics: new MarketMetrics(settings.instrumentCount),
      state: 'running',
      stats: { batches: 0, updates: 0 },
      cancelTick: null,
    };
    this.#resume(this.#run);
  }

  #pause(run: Run): void {
    run.cancelTick?.();
    run.cancelTick = null;
    run.state = 'paused';
  }

  #resume(run: Run): void {
    run.state = 'running';
    this.#tick(run);
  }

  #tick(run: Run): void {
    const startedAt = this.scheduler.now();
    let updates: number;
    try {
      const packed = run.generator.generate(run.settings.updatesPerBatch);
      run.metrics.applyPacked(packed);
      updates = updateCount(packed);
    } catch (error) {
      this.#fail(run.id, errorMessage(error));
      return this.#stop();
    }
    const delay = Math.max(0, run.settings.batchIntervalMs - (this.scheduler.now() - startedAt));
    run.stats = { batches: run.stats.batches + 1, updates: run.stats.updates + updates };
    this.emit({ type: 'snapshot', runId: run.id, rows: run.metrics.snapshot(), stats: run.stats });
    run.cancelTick = this.scheduler.schedule(() => this.#tick(run), delay);
  }

  #stop(): void {
    this.#run?.cancelTick?.();
    this.#run?.generator.dispose();
    this.#run = null;
  }

  #fail(runId: number, message: string): void {
    this.emit({ type: 'error', runId, phase: 'run', message });
  }
}
