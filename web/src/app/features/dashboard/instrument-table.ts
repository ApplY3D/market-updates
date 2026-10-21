import { Component, input } from '@angular/core';
import type { InstrumentMetrics } from '../../domain/metrics';
import { formatImbalance, formatInteger, formatUsdCents, trendOf } from '../../shared/format';
import { FormattedValue } from '../../shared/formatted-value';

@Component({
  selector: 'app-instrument-table',
  imports: [FormattedValue],
  templateUrl: './instrument-table.html',
  styleUrl: './instrument-table.css',
})
export class InstrumentTable {
  readonly rows = input.required<readonly InstrumentMetrics[]>();

  protected readonly usd = formatUsdCents;
  protected readonly integer = formatInteger;
  protected readonly imbalance = formatImbalance;
  protected readonly trend = trendOf;
}
