import { InjectionToken } from '@angular/core';
import { ProducerCommand, ProducerEvent } from './protocol';

/** Port between the store and wherever the producer runs (a Web Worker in production, a fake in tests). */
export interface ProducerTransport {
  send(command: ProducerCommand): void;
  dispose(): void;
}

export type ProducerTransportFactory = (
  onEvent: (event: ProducerEvent) => void,
) => ProducerTransport;

export const PRODUCER_TRANSPORT = new InjectionToken<ProducerTransportFactory>(
  'PRODUCER_TRANSPORT',
);
