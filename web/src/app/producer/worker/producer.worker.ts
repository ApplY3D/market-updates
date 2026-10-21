/// <reference lib="webworker" />
import { ProducerCommand, ProducerEvent } from '../protocol';
import { errorMessage } from './error-message';
import { ProducerEngine } from './producer-engine';
import { timerScheduler } from './timer-scheduler';
import { loadWasmGenerator } from './wasm-generator';

const emit = (event: ProducerEvent) => postMessage(event);

const boot = async (wasmUrl: string): Promise<ProducerEngine | null> => {
  try {
    const engine = new ProducerEngine(await loadWasmGenerator(wasmUrl), emit, timerScheduler);
    emit({ type: 'ready' });
    return engine;
  } catch (error) {
    const message = `Failed to load market generator from ${wasmUrl}: ${errorMessage(error)}`;
    emit({ type: 'error', runId: null, phase: 'init', message });
    return null;
  }
};

let engine: Promise<ProducerEngine | null> | null = null;

addEventListener('message', ({ data }: MessageEvent<ProducerCommand>) => {
  if (data.type === 'init') engine ??= boot(data.wasmUrl);
  else void engine?.then((e) => e?.handle(data));
});
