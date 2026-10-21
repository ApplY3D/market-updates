import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { ProducerSettings } from '../../domain/producer-settings';
import { ProducerStore } from '../../producer/producer.store';
import { SettingsForm } from './settings-form';

@Component({
  imports: [SettingsForm],
  template: `
    <h1>Settings</h1>
    <p class="lead">Changes take effect when applied and start a new run.</p>
    <app-settings-form [current]="store.settings()" (submitted)="apply($event)" />
  `,
  styles: `
    .lead {
      margin: 0 0 var(--space-3);
      color: var(--muted);
    }
  `,
})
export default class SettingsPage {
  protected readonly store = inject(ProducerStore);
  readonly #router = inject(Router);

  protected apply(settings: ProducerSettings): void {
    this.store.apply(settings);
    void this.#router.navigateByUrl('/dashboard');
  }
}
