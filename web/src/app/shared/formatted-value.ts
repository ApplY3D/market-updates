import { Component, computed, input } from '@angular/core';
import { UNAVAILABLE } from './format';

/** Renders formatted text; the unavailable dash gets a spoken label. */
@Component({
  selector: 'app-value',
  template: `
    @if (unavailable()) {
      <span aria-hidden="true">{{ text() }}</span
      ><span class="visually-hidden">unavailable</span>
    } @else {
      {{ text() }}
    }
  `,
})
export class FormattedValue {
  readonly text = input.required<string>();
  protected readonly unavailable = computed(() => this.text() === UNAVAILABLE);
}
