import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { DEFAULT_SETTINGS } from '../../domain/producer-settings';
import {
  fakeProducerStore,
  provideFakeProducerStore,
  type FakeProducerStore,
} from '../../shared/testing/fake-producer-store';
import SettingsPage from './settings-page';

describe('SettingsPage', () => {
  let store: FakeProducerStore;
  let fixture: ComponentFixture<SettingsPage>;
  let navigate: ReturnType<typeof vi.spyOn>;
  const el = (): HTMLElement => fixture.nativeElement;
  const field = (id: string) => el().querySelector<HTMLInputElement>(`#${id}`)!;
  const error = (id: string) => el().querySelector(`#${id}-error`)?.textContent?.trim();
  const apply = () => el().querySelector<HTMLButtonElement>('button[type="submit"]')!;

  const enter = async (id: string, value: string) => {
    const input = field(id);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    store = fakeProducerStore();
    store.settings.set({ instrumentCount: 7, updatesPerBatch: 250, batchIntervalMs: 1000 });
    TestBed.configureTestingModule({
      providers: [provideFakeProducerStore(store), provideRouter([])],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(SettingsPage);
    await fixture.whenStable();
  });

  it('starts from the currently applied settings', () => {
    expect(field('instrumentCount').value).toBe('7');
    expect(field('updatesPerBatch').value).toBe('250');
    expect(field('batchIntervalMs').value).toBe('1000');
    expect(el().textContent).toContain('250 updates/s');
    expect(el().textContent).not.toContain('Unsaved changes');
    expect(apply().disabled).toBe(false);
  });

  it('exposes native constraints and labels', () => {
    const input = field('batchIntervalMs');
    expect(input.min).toBe('50');
    expect(input.max).toBe('2000');
    expect(input.step).toBe('1');
    expect(el().querySelector('label[for="batchIntervalMs"]')?.textContent).toContain('interval');
  });

  it.each([
    ['instrumentCount', '0', 'Must be at least 1'],
    ['instrumentCount', '51', 'Must be at most 50'],
    ['updatesPerBatch', '1.5', 'Must be a whole number'],
    ['batchIntervalMs', '', 'Enter a value'],
  ])('rejects %s = "%s"', async (id, value, message) => {
    await enter(id, value);
    expect(error(id)).toBe(message);
    expect(field(id).getAttribute('aria-invalid')).toBe('true');
    expect(apply().disabled).toBe(true);

    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(store.apply).not.toHaveBeenCalled();
  });

  it('edits a draft without touching the producer', async () => {
    await enter('updatesPerBatch', '500');
    expect(el().textContent).toContain('500 updates/s');
    expect(el().textContent).toContain('Unsaved changes');
    expect(store.apply).not.toHaveBeenCalled();
  });

  it('hides the rate while any field is invalid', async () => {
    await enter('instrumentCount', '75');
    expect(el().textContent).toContain('Nominal rate —');
    await enter('instrumentCount', '7');
    expect(el().textContent).toContain('250 updates/s');
  });

  it('resets the draft to defaults only', async () => {
    el().querySelector<HTMLButtonElement>('button[type="button"]')!.click();
    await fixture.whenStable();
    expect(field('instrumentCount').value).toBe(String(DEFAULT_SETTINGS.instrumentCount));
    expect(store.apply).not.toHaveBeenCalled();
  });

  it('applies the values and returns to the dashboard', async () => {
    await enter('instrumentCount', '12');
    apply().click();
    await fixture.whenStable();
    expect(store.apply).toHaveBeenCalledExactlyOnceWith({
      instrumentCount: 12,
      updatesPerBatch: 250,
      batchIntervalMs: 1000,
    });
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });
});
