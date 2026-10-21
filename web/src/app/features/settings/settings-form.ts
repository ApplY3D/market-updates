import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { form, FormField, FormRoot, max, min, required, validate } from '@angular/forms/signals';
import {
  DEFAULT_SETTINGS,
  nominalRate,
  SETTINGS_LIMITS,
  type ProducerSettings,
  type SettingKey,
} from '../../domain/producer-settings';
import { formatRate, UNAVAILABLE } from '../../shared/format';

type Draft = { [K in SettingKey]: number | null };

const FIELDS = [
  { key: 'instrumentCount', label: 'Instruments', hint: 'Rows in the dashboard table', unit: '' },
  { key: 'updatesPerBatch', label: 'Updates per batch', hint: 'Across all instruments', unit: '' },
  { key: 'batchIntervalMs', label: 'Batch interval', hint: 'Time between batches', unit: 'ms' },
] as const satisfies readonly { key: SettingKey; label: string; hint: string; unit: string }[];

@Component({
  selector: 'app-settings-form',
  imports: [FormField, FormRoot],
  templateUrl: './settings-form.html',
  styleUrl: './settings-form.css',
})
export class SettingsForm {
  /** The settings the producer currently runs with; the draft starts from (and resets to) them. */
  readonly current = input.required<ProducerSettings>();
  readonly submitted = output<ProducerSettings>();

  protected readonly fields = FIELDS;
  protected readonly limits = SETTINGS_LIMITS;
  protected readonly draft = linkedSignal<Draft>(() => ({ ...this.current() }));

  protected readonly form = form(
    this.draft,
    (path) => {
      for (const { key } of FIELDS) {
        const { min: lo, max: hi } = SETTINGS_LIMITS[key];
        required(path[key], { message: 'Enter a value' });
        min(path[key], lo, { message: `Must be at least ${lo}` });
        max(path[key], hi, { message: `Must be at most ${hi}` });
        validate(path[key], ({ value }) =>
          value() === null || Number.isInteger(value())
            ? null
            : { kind: 'integer', message: 'Must be a whole number' },
        );
      }
    },
    {
      submission: {
        // Runs only when no validator fails, so the draft has no empty or out-of-range fields.
        action: async (field) => this.submitted.emit(field().value() as ProducerSettings),
      },
    },
  );

  protected readonly rate = computed(() =>
    this.form().valid() ? formatRate(nominalRate(this.draft() as ProducerSettings)) : UNAVAILABLE,
  );

  protected readonly changed = computed(() =>
    FIELDS.some(({ key }) => this.draft()[key] !== this.current()[key]),
  );

  protected resetToDefaults(): void {
    this.draft.set({ ...DEFAULT_SETTINGS });
  }
}
