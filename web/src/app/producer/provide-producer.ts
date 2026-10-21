import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
} from '@angular/core';
import { ProducerStore } from './producer.store';
import { PRODUCER_TRANSPORT } from './producer-transport';
import { workerTransportFactory } from './worker-transport';

/** Binds the producer to a Web Worker and starts it with the app, whichever route is opened first. */
export const provideProducer = (): EnvironmentProviders =>
  makeEnvironmentProviders([
    { provide: PRODUCER_TRANSPORT, useValue: workerTransportFactory },
    provideEnvironmentInitializer(() => inject(ProducerStore)),
  ]);
