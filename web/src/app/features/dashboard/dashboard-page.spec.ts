import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  fakeProducerStore,
  provideFakeProducerStore,
  type FakeProducerStore,
} from '../../shared/testing/fake-producer-store';
import DashboardPage from './dashboard-page';

describe('DashboardPage', () => {
  let store: FakeProducerStore;
  let fixture: ComponentFixture<DashboardPage>;
  const el = (): HTMLElement => fixture.nativeElement;
  const cells = (row: number) =>
    [...el().querySelectorAll(`tbody tr:nth-child(${row}) :is(th, td)`)].map((c) =>
      c.textContent?.trim(),
    );
  const toggle = () => el().querySelector<HTMLButtonElement>('button.toggle')!;

  beforeEach(async () => {
    store = fakeProducerStore();
    store.rows.set([
      {
        symbol: 'ALFA',
        lastPriceCents: 10150,
        spreadCents: 4,
        volume: 1234567,
        vwapCents: 10_120.5,
        imbalance: 0.2,
      },
      {
        symbol: 'BETA',
        lastPriceCents: null,
        spreadCents: null,
        volume: 0,
        vwapCents: null,
        imbalance: null,
      },
    ]);
    store.stats.set({ batches: 1200, updates: 120_000, lastBatchAt: 0 });
    TestBed.configureTestingModule({ providers: [provideFakeProducerStore(store)] });
    fixture = TestBed.createComponent(DashboardPage);
    await fixture.whenStable();
  });

  it('renders one formatted row per instrument', () => {
    expect(el().querySelectorAll('tbody tr')).toHaveLength(2);
    expect(cells(1)).toEqual(['ALFA', '$101.50', '$0.04', '1,234,567', '$101.21', '+0.20']);
    expect(el().querySelector('tbody tr td:last-child')?.getAttribute('data-trend')).toBe('up');
  });

  it('marks unavailable values with a dash and an accessible label', () => {
    const price = el().querySelector('tbody tr:nth-child(2) td')!;
    expect(price.querySelector('[aria-hidden="true"]')?.textContent).toBe('—');
    expect(price.querySelector('.visually-hidden')?.textContent).toBe('unavailable');
    expect(cells(2)[3]).toBe('0');
  });

  it('uses a semantic table that is not a live region', () => {
    const table = el().querySelector('table')!;
    expect(table.querySelector('caption')).not.toBeNull();
    expect(table.querySelectorAll('th[scope="col"]')).toHaveLength(6);
    expect(table.closest('[aria-live]')).toBeNull();
    expect(el().querySelector('[aria-live="polite"]')?.textContent).toContain('Running');
  });

  it('shows run details, stats and the nominal rate', () => {
    const text = el().textContent;
    expect(text).toContain('run #1');
    expect(text).toContain('0x000000000000002a');
    expect(text).toContain('1,200');
    expect(text).toContain('120,000');
    expect(text).toContain('200 updates/s');
  });

  it('pauses and resumes through the store', async () => {
    expect(toggle().textContent).toContain('Pause');
    toggle().click();
    expect(store.pause).toHaveBeenCalledOnce();

    store.status.set('paused');
    await fixture.whenStable();
    expect(toggle().textContent).toContain('Resume');
    toggle().click();
    expect(store.resume).toHaveBeenCalledOnce();
  });

  it('disables the toggle while loading or failed', async () => {
    for (const status of ['loading', 'error'] as const) {
      store.status.set(status);
      await fixture.whenStable();
      expect(toggle().disabled).toBe(true);
    }
  });

  it('shows the error with a retry action', async () => {
    expect(el().querySelector('[role="alert"]')).toBeNull();
    store.status.set('error');
    store.error.set('Wasm failed to load');
    await fixture.whenStable();

    const banner = el().querySelector('[role="alert"]')!;
    expect(banner.textContent).toContain('Wasm failed to load');
    banner.querySelector('button')!.click();
    expect(store.retry).toHaveBeenCalledOnce();
  });
});
