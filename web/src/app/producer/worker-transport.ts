import { ProducerTransportFactory } from './producer-transport';
import { ProducerEvent, WorkerBoot } from './protocol';
import { errorMessage } from './worker/error-message';

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

export const workerTransportFactory: ProducerTransportFactory = (onEvent) => {
  try {
    const worker = new Worker(new URL('./worker/producer.worker', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = ({ data }: MessageEvent<ProducerEvent>) => onEvent(data);
    worker.onerror = (event) => onEvent(initError(workerFailure(event)));
    worker.onmessageerror = () =>
      onEvent(initError('Producer worker sent a message that could not be decoded.'));
    const boot: WorkerBoot = { type: 'init', baseUri: document.baseURI };
    worker.postMessage(boot);
    return { send: (command) => worker.postMessage(command), dispose: () => worker.terminate() };
  } catch (error) {
    const message = `Could not start the producer worker: ${errorMessage(error)}`;
    queueMicrotask(() => onEvent(initError(message)));
    return { send: () => undefined, dispose: () => undefined };
  }
};
