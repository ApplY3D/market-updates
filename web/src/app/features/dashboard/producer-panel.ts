import { Component, computed, input, output } from '@angular/core';
import { nominalRate, type ProducerSettings } from '../../domain/producer-settings';
import type { ProducerStatus } from '../../producer/producer.store';
import type { RunStats } from '../../producer/protocol';
import { formatRate } from '../../shared/format';
import { IntegerPipe, SeedPipe } from '../../shared/format.pipes';
import { StatusBadge } from '../../shared/status-badge';

@Component({
  selector: 'app-producer-panel',
  imports: [StatusBadge, IntegerPipe, SeedPipe],
  templateUrl: './producer-panel.html',
  styleUrl: './producer-panel.css',
})
export class ProducerPanel {
  readonly status = input.required<ProducerStatus>();
  readonly runId = input.required<number>();
  readonly seed = input.required<bigint | null>();
  readonly stats = input.required<RunStats>();
  readonly settings = input.required<ProducerSettings>();
  readonly pause = output();
  readonly resume = output();

  protected readonly paused = computed(() => this.status() === 'paused');
  protected readonly locked = computed(() => ['loading', 'error'].includes(this.status()));
  protected readonly rate = computed(() => formatRate(nominalRate(this.settings())));

  protected toggle(): void {
    if (this.paused()) this.resume.emit();
    else this.pause.emit();
  }
}
