import { TestBed } from '@angular/core/testing';
import { MarketMetrics } from '../domain/metrics';
import { DEFAULT_SETTINGS, ProducerSettings } from '../domain/producer-settings';
import { PRODUCER_SEED, ProducerStore } from './producer.store';
import { PRODUCER_TRANSPORT, ProducerTransport } from './producer-transport';
import { ProducerCommand, ProducerEvent } from './protocol';

class FakeTransport implements ProducerTransport {
  readonly sent: ProducerCommand[] = [];
  disposed = false;

  constructor(readonly emit: (event: ProducerEvent) => void) {}

  send(command: ProducerCommand): void {
    this.sent.push(command);
  }

  dispose(): void {
    this.disposed = true;
  }
}

const SETTINGS: ProducerSettings = {
  instrumentCount: 3,
  updatesPerBatch: 10,
  batchIntervalMs: 100,
};
const STATS = { batches: 2, updates: 20 };
const ROWS = new MarketMetrics(5).snapshot().map((row) => ({ ...row, volume: 7 }));

const setup = () => {
  const transports: FakeTransport[] = [];
  let seeds = 100n;
  TestBed.configureTestingModule({
    providers: [
      {
        provide: PRODUCER_TRANSPORT,
        useValue: (onEvent: (event: ProducerEvent) => void) => {
          const transport = new FakeTransport(onEvent);
          transports.push(transport);
          return transport;
        },
      },
      { provide: PRODUCER_SEED, useValue: () => ++seeds },
    ],
  });
  const store = TestBed.inject(ProducerStore);
  const transport = () => transports.at(-1)!;
  const lastSent = () => transport().sent.at(-1);
  const ready = () => transport().emit({ type: 'ready' });
  return { store, transports, transport, lastSent, ready };
};

describe('ProducerStore', () => {
  it('creates one transport and sends nothing until it is ready', () => {
    const { store, transports, transport } = setup();
    expect(transports).toHaveLength(1);
    expect(transport().sent).toEqual([]);
    expect(store.status()).toBe('loading');
  });

  it('starts the first run with default settings only once the worker is ready', () => {
    const { store, transport, lastSent, ready } = setup();
    expect(transport().sent.some((c) => c.type === 'start')).toBe(false);
    expect(store.rows()).toEqual(new MarketMetrics(DEFAULT_SETTINGS.instrumentCount).snapshot());

    ready();

    expect(lastSent()).toEqual({ type: 'start', runId: 1, settings: DEFAULT_SETTINGS, seed: 101n });
    expect(store.status()).toBe('running');
    expect(store.seed()).toBe(101n);
  });

  it('applies snapshots of the current run', () => {
    const { store, transport, ready } = setup();
    ready();
    transport().emit({ type: 'snapshot', runId: 1, rows: ROWS, stats: STATS });
    expect(store.rows()).toBe(ROWS);
    expect(store.stats()).toEqual(STATS);
  });

  it('apply starts a new run with cleared values and totals', () => {
    const { store, transport, lastSent, ready } = setup();
    ready();
    transport().emit({ type: 'snapshot', runId: 1, rows: ROWS, stats: STATS });

    store.apply(SETTINGS);

    expect(store.runId()).toBe(2);
    expect(store.settings()).toEqual(SETTINGS);
    expect(store.rows()).toEqual(new MarketMetrics(3).snapshot());
    expect(store.stats()).toEqual({ batches: 0, updates: 0 });
    expect(lastSent()).toEqual({ type: 'start', runId: 2, settings: SETTINGS, seed: 102n });
    expect(store.status()).toBe('running');
  });

  it('ignores events from previous runs', () => {
    const { store, transport, ready } = setup();
    ready();
    store.apply(SETTINGS);

    transport().emit({ type: 'snapshot', runId: 1, rows: ROWS, stats: STATS });
    transport().emit({ type: 'error', runId: 1, phase: 'run', message: 'old' });

    expect(store.rows()).toEqual(new MarketMetrics(3).snapshot());
    expect(store.stats().batches).toBe(0);
    expect(store.status()).toBe('running');
    expect(store.error()).toBeNull();
  });

  it('starts only the latest settings when applied before the worker is ready', () => {
    const { store, transport, ready } = setup();
    store.apply(SETTINGS);
    expect(store.status()).toBe('loading');

    ready();

    expect(transport().sent.filter((c) => c.type === 'start')).toEqual([
      { type: 'start', runId: 2, settings: SETTINGS, seed: 102n },
    ]);
  });

  it('pauses and resumes the current run keeping its data', () => {
    const { store, transport, lastSent, ready } = setup();
    store.resume();
    store.pause();
    expect(transport().sent).toEqual([]);

    ready();
    transport().emit({ type: 'snapshot', runId: 1, rows: ROWS, stats: STATS });
    store.pause();
    expect(lastSent()).toEqual({ type: 'pause', runId: 1 });
    expect(store.status()).toBe('paused');

    store.resume();
    expect(lastSent()).toEqual({ type: 'resume', runId: 1 });
    expect(store.status()).toBe('running');
    expect(store.rows()).toBe(ROWS);
    expect(store.stats()).toEqual(STATS);
  });

  it('sends every command of a quick pause, resume, pause sequence', () => {
    const { store, transport, ready } = setup();
    ready();
    store.pause();
    store.resume();
    store.pause();
    expect(transport().sent.slice(1)).toEqual([
      { type: 'pause', runId: 1 },
      { type: 'resume', runId: 1 },
      { type: 'pause', runId: 1 },
    ]);
    expect(store.status()).toBe('paused');
  });

  it('apply while paused starts generating the new run', () => {
    const { store, lastSent, ready } = setup();
    ready();
    store.pause();
    store.apply(SETTINGS);
    expect(store.status()).toBe('running');
    expect(lastSent()).toMatchObject({ type: 'start', runId: 2 });
  });

  it('reports run and initialisation errors', () => {
    const { store, transport, ready } = setup();
    transport().emit({ type: 'error', runId: null, phase: 'init', message: 'wasm missing' });
    expect(store.status()).toBe('error');
    expect(store.error()).toBe('wasm missing');

    store.retry();
    ready();
    transport().emit({ type: 'error', runId: 2, phase: 'run', message: 'boom' });
    expect(store.status()).toBe('error');
    expect(store.error()).toBe('boom');
  });

  it('retry replaces the transport and starts a new run with the current settings', () => {
    const { store, transports, transport, lastSent, ready } = setup();
    ready();
    store.apply(SETTINGS);
    const old = transport();
    old.emit({ type: 'error', runId: 2, phase: 'run', message: 'boom' });

    store.retry();

    expect(old.disposed).toBe(true);
    expect(transports).toHaveLength(2);
    expect(transport().sent).toEqual([]);
    expect(store.status()).toBe('loading');
    expect(store.error()).toBeNull();

    old.emit({ type: 'ready' });
    expect(transport().sent).toHaveLength(0);

    ready();
    expect(lastSent()).toEqual({ type: 'start', runId: 3, settings: SETTINGS, seed: 103n });
    expect(store.status()).toBe('running');
  });

  it('apply after an error replaces the transport', () => {
    const { store, transports, transport } = setup();
    transport().emit({ type: 'error', runId: null, phase: 'init', message: 'wasm missing' });
    store.apply(SETTINGS);
    expect(transports[0]?.disposed).toBe(true);
    expect(transports).toHaveLength(2);
    expect(store.status()).toBe('loading');
  });

  it('rejects invalid settings', () => {
    const { store, lastSent, ready } = setup();
    ready();
    expect(() => store.apply({ ...SETTINGS, instrumentCount: 0 })).toThrow(RangeError);
    expect(store.runId()).toBe(1);
    expect(store.settings()).toEqual(DEFAULT_SETTINGS);
    expect(lastSent()).toMatchObject({ type: 'start', runId: 1 });
  });

  it('disposes the transport when destroyed', () => {
    const { transport } = setup();
    TestBed.resetTestingModule();
    expect(transport().disposed).toBe(true);
  });
});
