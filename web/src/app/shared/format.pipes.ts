import { Pipe, PipeTransform } from '@angular/core';
import { formatImbalance, formatInteger, formatSeed, formatUsdCents, trendOf } from './format';

// Pure pipes: Angular re-runs a formatter only when its input value changes.

@Pipe({ name: 'usd' })
export class UsdPipe implements PipeTransform {
  readonly transform = formatUsdCents;
}

@Pipe({ name: 'integer' })
export class IntegerPipe implements PipeTransform {
  readonly transform = formatInteger;
}

@Pipe({ name: 'imbalance' })
export class ImbalancePipe implements PipeTransform {
  readonly transform = formatImbalance;
}

@Pipe({ name: 'trend' })
export class TrendPipe implements PipeTransform {
  readonly transform = trendOf;
}

@Pipe({ name: 'seed' })
export class SeedPipe implements PipeTransform {
  readonly transform = formatSeed;
}
