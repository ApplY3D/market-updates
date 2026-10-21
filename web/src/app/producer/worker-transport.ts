import { ProducerTransport, ProducerTransportFactory } from './producer-transport';
import { ProducerEvent } from './protocol';
import { errorMessage } from './worker/error-message';

type OnEvent = (event: ProducerEvent) => void;

const initError = (message: string): ProducerEvent => ({
  type: 'error',
  runId: null,
  phase: 'init',
  message,
});

const workerFailure = (event: Event): string =>
  event instanceof ErrorEvent && event.message
    ? `Producer worker crashed: ${event.message}`
    : 'Could not load the producer worker script.';

const failed = (onEvent: OnEvent, message: string): ProducerTransport => {
  queueMicrotask(() => onEvent(initError(message)));
  return { send: () => undefined, dispose: () => undefined };
};

const spawn = (): Worker | string => {
  try {
    return new Worker(new URL('./worker/producer.worker', import.meta.url), { type: 'module' });
  } catch (error) {
    return `Could not start the producer worker: ${errorMessage(error)}`;
  }
};

export const workerTransportFactory: ProducerTransportFactory = (onEvent) => {
  if (typeof Worker === 'undefined')
    return failed(onEvent, 'This browser does not support Web Workers.');
  const worker = spawn();
  if (typeof worker === 'string') return failed(onEvent, worker);
  const listeners = new AbortController();
  const { signal } = listeners;
  worker.addEventListener('message', ({ data }: MessageEvent<ProducerEvent>) => onEvent(data), {
    signal,
  });
  worker.addEventListener('error', (event) => onEvent(initError(workerFailure(event))), { signal });
  worker.addEventListener(
    'messageerror',
    () => onEvent(initError('Producer worker sent a message that could not be decoded.')),
    { signal },
  );
  return {
    send: (command) => worker.postMessage(command),
    dispose: () => {
      listeners.abort();
      worker.terminate();
    },
  };
};
