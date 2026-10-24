/// <reference lib="webworker" />
import { ProducerCommand, ProducerEvent, WorkerBoot } from '../protocol';
import { errorMessage } from './error-message';
import { ProducerEngine } from './producer-engine';
import { timerScheduler } from './timer-scheduler';
import { loadWasmGenerator, wasmUrl } from './wasm-generator';

const emit = (event: ProducerEvent) => postMessage(event);

const boot = async (baseUri: string): Promise<ProducerEngine | null> => {
  const url = wasmUrl(baseUri);
  try {
    const engine = new ProducerEngine(await loadWasmGenerator(url), emit, timerScheduler);
    emit({ type: 'ready' });
    return engine;
  } catch (error) {
    const message = `Failed to load market generator from ${url}: ${errorMessage(error)}`;
    emit({ type: 'error', runId: null, phase: 'init', message });
    return null;
  }
};

let engine: Promise<ProducerEngine | null> | null = null;

addEventListener('message', ({ data }: MessageEvent<WorkerBoot | ProducerCommand>) => {
  if (data.type === 'init') engine ??= boot(data.baseUri);
  else void engine?.then((e) => e?.handle(data));
});
