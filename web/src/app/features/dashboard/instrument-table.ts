import { Component, input } from '@angular/core';
import type { InstrumentMetrics } from '../../domain/metrics';
import { ImbalancePipe, IntegerPipe, TrendPipe, UsdPipe } from '../../shared/format.pipes';
import { FormattedValue } from '../../shared/formatted-value';

@Component({
  selector: 'app-instrument-table',
  imports: [FormattedValue, UsdPipe, IntegerPipe, ImbalancePipe, TrendPipe],
  templateUrl: './instrument-table.html',
  styleUrl: './instrument-table.css',
})
export class InstrumentTable {
  readonly rows = input.required<readonly InstrumentMetrics[]>();
}
