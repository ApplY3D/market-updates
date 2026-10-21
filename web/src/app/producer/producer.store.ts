import {
  computed,
  DestroyRef,
  DOCUMENT,
  inject,
  InjectionToken,
  Service,
  Signal,
  signal,
} from '@angular/core';
import { InstrumentMetrics, MarketMetrics } from '../domain/metrics';
import { DEFAULT_SETTINGS, isValidSettings, ProducerSettings } from '../domain/producer-settings';
import { PRODUCER_TRANSPORT, ProducerTransport } from './producer-transport';
import { ProducerEvent, RunStats } from './protocol';

export type ProducerStatus = 'loading' | 'running' | 'paused' | 'error';

export const PRODUCER_SEED = new InjectionToken<() => bigint>('PRODUCER_SEED', {
  factory: () => () => crypto.getRandomValues(new BigUint64Array(1))[0] ?? 0n,
});

interface Run {
  readonly id: number;
  readonly settings: ProducerSettings;
  readonly seed: bigint;
  readonly rows: readonly InstrumentMetrics[];
  readonly stats: RunStats;
}

const newRun = (id: number, settings: ProducerSettings, seed: bigint): Run => ({
  id,
  settings,
  seed,
  rows: new MarketMetrics(settings.instrumentCount).snapshot(),
  stats: { batches: 0, updates: 0, lastBatchAt: null },
});

const isStale = (event: ProducerEvent, runId: number): boolean =>
  'runId' in event && event.runId !== null && event.runId !== runId;

/** Owns the app's single producer: one transport (Web Worker) and the state of the current run. */
@Service()
export class ProducerStore {
  readonly #createTransport = inject(PRODUCER_TRANSPORT);
  readonly #nextSeed = inject(PRODUCER_SEED);
  readonly #wasmUrl = new URL('wasm/market_gen_bg.wasm', inject(DOCUMENT).baseURI).href;

  readonly #status = signal<ProducerStatus>('loading');
  readonly #error = signal<string | null>(null);
  readonly #run = signal(newRun(1, DEFAULT_SETTINGS, this.#nextSeed()));
  #ready = false;
  #transport = this.#connect();

  readonly status = this.#status.asReadonly();
  readonly error = this.#error.asReadonly();
  readonly settings = computed(() => this.#run().settings);
  readonly runId = computed(() => this.#run().id);
  readonly seed: Signal<bigint | null> = computed(() => this.#run().seed);
  readonly rows = computed(() => this.#run().rows);
  readonly stats = computed(() => this.#run().stats);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.#transport.dispose());
  }

  apply(settings: ProducerSettings): void {
    if (!isValidSettings(settings)) throw new RangeError('Invalid producer settings');
    if (this.#status() === 'error') this.#reconnect();
    this.#startRun(settings);
  }

  pause(): void {
    this.#control('running', 'paused', 'pause');
  }

  resume(): void {
    this.#control('paused', 'running', 'resume');
  }

  retry(): void {
    this.#reconnect();
    this.#startRun(this.#run().settings);
  }

  #control(from: ProducerStatus, to: ProducerStatus, type: 'pause' | 'resume'): void {
    if (this.#status() !== from) return;
    this.#status.set(to);
    this.#transport.send({ type, runId: this.#run().id });
  }

  #startRun(settings: ProducerSettings): void {
    this.#run.update(({ id }) => newRun(id + 1, settings, this.#nextSeed()));
    this.#error.set(null);
    this.#status.set('loading');
    this.#sendStart();
  }

  #sendStart(): void {
    if (!this.#ready) return;
    const { id: runId, settings, seed } = this.#run();
    this.#transport.send({ type: 'start', runId, settings, seed });
    this.#status.set('running');
  }

  #connect(): ProducerTransport {
    this.#ready = false;
    const transport = this.#createTransport((event) => this.#handle(transport, event));
    transport.send({ type: 'init', wasmUrl: this.#wasmUrl });
    return transport;
  }

  #reconnect(): void {
    this.#transport.dispose();
    this.#transport = this.#connect();
  }

  #handle(source: ProducerTransport, event: ProducerEvent): void {
    if (source !== this.#transport || isStale(event, this.#run().id)) return;
    switch (event.type) {
      case 'ready':
        this.#ready = true;
        this.#sendStart();
        break;
      case 'snapshot':
        this.#run.update((run) => ({ ...run, rows: event.rows, stats: event.stats }));
        break;
      case 'error':
        this.#error.set(event.message);
        this.#status.set('error');
    }
  }
}
