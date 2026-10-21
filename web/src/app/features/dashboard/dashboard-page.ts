import { Component, inject } from '@angular/core';
import { ProducerStore } from '../../producer/producer.store';
import { InstrumentTable } from './instrument-table';
import { ProducerPanel } from './producer-panel';

@Component({
  imports: [InstrumentTable, ProducerPanel],
  template: `
    <h1>Dashboard</h1>
    @if (store.error(); as message) {
      <div class="banner" role="alert">
        <p><strong>Producer error.</strong> {{ message }}</p>
        <button type="button" class="btn" (click)="store.retry()">Retry</button>
      </div>
    }
    <app-producer-panel
      [status]="store.status()"
      [runId]="store.runId()"
      [seed]="store.seed()"
      [stats]="store.stats()"
      [settings]="store.settings()"
      (pause)="store.pause()"
      (resume)="store.resume()"
    />
    <app-instrument-table [rows]="store.rows()" />
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-3);
    }
    .banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--down);
      border-radius: var(--radius);
      background: var(--down-bg);
    }
    .banner p {
      flex: 1;
      margin: 0;
    }
  `,
})
export default class DashboardPage {
  protected readonly store = inject(ProducerStore);
}
