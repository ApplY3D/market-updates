import { Component, input } from '@angular/core';
import type { ProducerStatus } from '../producer/producer.store';

@Component({
  selector: 'app-status-badge',
  template: `<span class="dot" aria-hidden="true"></span>{{ status() }}`,
  host: { '[attr.data-status]': 'status()' },
  styles: `
    :host {
      --tone: var(--muted);
      display: inline-flex;
      align-items: center;
      gap: 0.45em;
      font: 600 var(--text-xs) / 1 var(--font-mono);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--tone);
    }
    :host([data-status='running']) {
      --tone: var(--up);
    }
    :host([data-status='paused']) {
      --tone: var(--warn);
    }
    :host([data-status='error']) {
      --tone: var(--down);
    }
    .dot {
      inline-size: 0.55em;
      block-size: 0.55em;
      border-radius: 50%;
      background: var(--tone);
    }
    :host([data-status='loading']) .dot {
      animation: pulse 1s ease-in-out infinite alternate;
    }
    @keyframes pulse {
      to {
        opacity: 0.25;
      }
    }
  `,
})
export class StatusBadge {
  readonly status = input.required<ProducerStatus>();
}
