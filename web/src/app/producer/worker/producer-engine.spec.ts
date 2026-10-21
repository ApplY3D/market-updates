import { MarketUpdate, packUpdates } from '../../domain/market-update';
import { ProducerSettings } from '../../domain/producer-settings';
import { ProducerEvent } from '../protocol';
import { GeneratorFactory, MarketGenerator, Scheduler } from './ports';
import { ProducerEngine, RunCommand } from './producer-engine';

const settings: ProducerSettings = { instrumentCount: 2, updatesPerBatch: 3, batchIntervalMs: 500 };

const update = (instrument: number): MarketUpdate => ({
  instrument,
  priceCents: 10_000,
  tradeQuantity: 10,
  bidCents: 9_999,
  askCents: 10_000,
  bidQuantity: 500,
  askQuantity: 500,
});

class FakeScheduler implements Scheduler {
  time = 0;
  readonly pending: { task: () => void; delayMs: number }[] = [];
  now = () => this.time;
  schedule = (task: () => void, delayMs: number) => {
    const entry = { task, delayMs };
    this.pending.push(entry);
    return () => {
      const index = this.pending.indexOf(entry);
      if (index >= 0) this.pending.splice(index, 1);
    };
  };
  fire(): void {
    const next = this.pending.shift();
    if (!next) throw new Error('No pending task');
    this.time += next.delayMs;
    next.task();
  }
}

const setup = (generateCostMs = 0) => {
  const scheduler = new FakeScheduler();
  const events: ProducerEvent[] = [];
  const generators: (MarketGenerator & { seed: bigint })[] = [];
  const createGenerator: GeneratorFactory = (seed, count) => {
    const generator = {
      seed,
      generate: vi.fn((n: number) => {
        scheduler.time += generateCostMs;
        return packUpdates(Array.from({ length: n }, (_, i) => update(i % count)));
      }),
      dispose: vi.fn(),
    };
    generators.push(generator);
    return generator;
  };
  const engine = new ProducerEngine(createGenerator, (e) => events.push(e), scheduler);
  const send = (command: RunCommand) => engine.handle(command);
  const drain = () => events.splice(0);
  return { scheduler, generators, engine, send, drain };
};

const start = (runId = 1, overrides: Partial<ProducerSettings> = {}): RunCommand => ({
  type: 'start',
  runId,
  seed: 42n,
  settings: { ...settings, ...overrides },
});

const stats = (events: ProducerEvent[]) =>
  events.flatMap((e) => (e.type === 'snapshot' ? [e.stats] : []));

describe('ProducerEngine', () => {
  it('starts running and emits an immediate snapshot with exact totals', () => {
    const { send, drain, generators, scheduler } = setup();
    send(start());
    const [snapshot, ...rest] = drain();
    expect(snapshot).toMatchObject({
      type: 'snapshot',
      runId: 1,
      stats: { batches: 1, updates: 3, lastBatchAt: 0 },
    });
    expect(snapshot?.type === 'snapshot' && snapshot.rows.map((r) => r.volume)).toEqual([20, 10]);
    expect(rest).toEqual([]);
    expect(generators[0]?.seed).toBe(42n);
    expect(scheduler.pending).toHaveLength(1);
  });

  it('accumulates batches across ticks', () => {
    const { send, drain, scheduler } = setup();
    send(start());
    scheduler.fire();
    scheduler.fire();
    const events = drain();
    expect(stats(events).at(-1)).toEqual({ batches: 3, updates: 9, lastBatchAt: 1_000 });
    expect(events.at(-1)?.type === 'snapshot' && events.at(-1)).toMatchObject({
      rows: [{ volume: 60 }, { volume: 30 }],
    });
    expect(scheduler.pending).toHaveLength(1);
  });

  it('compensates the next delay for time spent generating', () => {
    const { send, scheduler } = setup(120);
    send(start());
    expect(scheduler.pending[0]?.delayMs).toBe(380);
  });

  it('never schedules a negative delay', () => {
    const { send, scheduler } = setup(800);
    send(start());
    expect(scheduler.pending[0]?.delayMs).toBe(0);
  });

  it('pauses without ticking and resumes immediately keeping totals', () => {
    const { send, drain, scheduler } = setup();
    send(start());
    scheduler.fire();
    drain();
    send({ type: 'pause', runId: 1 });
    expect(scheduler.pending).toHaveLength(0);
    expect(() => scheduler.fire()).toThrow();
    expect(drain()).toEqual([]);

    scheduler.time = 10_000;
    send({ type: 'resume', runId: 1 });
    const events = drain();
    expect(events).toMatchObject([{ type: 'snapshot', runId: 1 }]);
    expect(stats(events)).toEqual([{ batches: 3, updates: 9, lastBatchAt: 10_000 }]);
    expect(scheduler.pending).toHaveLength(1);
  });

  it('ignores stale or redundant pause/resume', () => {
    const { send, drain, scheduler } = setup();
    send(start(2));
    drain();
    send({ type: 'pause', runId: 1 });
    send({ type: 'resume', runId: 2 });
    expect(drain()).toEqual([]);
    expect(scheduler.pending).toHaveLength(1);
    send({ type: 'pause', runId: 2 });
    send({ type: 'pause', runId: 2 });
    send({ type: 'resume', runId: 1 });
    expect(drain()).toEqual([]);
    expect(scheduler.pending).toHaveLength(0);
  });

  it('restarts with a fresh generator, totals and run id', () => {
    const { send, drain, generators, scheduler } = setup();
    send(start(1));
    scheduler.fire();
    drain();
    send(start(2, { updatesPerBatch: 5 }));
    expect(generators[0]?.dispose).toHaveBeenCalledOnce();
    expect(generators).toHaveLength(2);
    const events = drain();
    expect(events).toMatchObject([{ type: 'snapshot', runId: 2 }]);
    expect(stats(events)).toEqual([{ batches: 1, updates: 5, lastBatchAt: 500 }]);
    expect(scheduler.pending).toHaveLength(1);
  });

  it('rejects invalid settings', () => {
    const { send, drain, generators, scheduler } = setup();
    send(start(1));
    drain();
    send(start(2, { batchIntervalMs: 0 }));
    expect(drain()).toEqual([
      { type: 'error', runId: 2, phase: 'run', message: expect.any(String) },
    ]);
    expect(generators).toHaveLength(1);
    expect(generators[0]?.dispose).toHaveBeenCalledOnce();
    expect(scheduler.pending).toHaveLength(0);
  });

  it('stops and reports when the generator throws', () => {
    const { send, drain, generators, scheduler } = setup();
    send(start());
    drain();
    vi.mocked(generators[0]!.generate).mockImplementation(() => {
      throw new Error('boom');
    });
    scheduler.fire();
    expect(drain()).toEqual([{ type: 'error', runId: 1, phase: 'run', message: 'boom' }]);
    expect(generators[0]?.dispose).toHaveBeenCalledOnce();
    expect(scheduler.pending).toHaveLength(0);
    send({ type: 'resume', runId: 1 });
    expect(drain()).toEqual([]);
  });

  it('dispose cancels the timer and frees the generator', () => {
    const { send, engine, generators, scheduler } = setup();
    send(start());
    engine.dispose();
    expect(scheduler.pending).toHaveLength(0);
    expect(generators[0]?.dispose).toHaveBeenCalledOnce();
  });
});
