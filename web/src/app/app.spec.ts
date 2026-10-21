import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { fakeProducerStore, provideFakeProducerStore } from './shared/testing/fake-producer-store';

describe('App', () => {
  it('renders the shell with navigation and producer status', async () => {
    const store = fakeProducerStore();
    TestBed.configureTestingModule({
      providers: [provideFakeProducerStore(store), provideRouter(routes)],
    });
    const fixture = TestBed.createComponent(App);
    const el: HTMLElement = fixture.nativeElement;

    await TestBed.inject(Router).navigateByUrl('/settings');
    await fixture.whenStable();

    const links = [...el.querySelectorAll('nav a')];
    expect(links.map((a) => a.textContent?.trim())).toEqual(['Dashboard', 'Settings']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/dashboard', '/settings']);
    expect(links[1]?.getAttribute('aria-current')).toBe('page');
    expect(links[0]?.hasAttribute('aria-current')).toBe(false);
    expect(el.querySelector('header app-status-badge')?.textContent).toContain('Running');
  });

  it('redirects unknown paths to the dashboard', async () => {
    TestBed.configureTestingModule({
      providers: [provideFakeProducerStore(fakeProducerStore()), provideRouter(routes)],
    });
    TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/nope');
    expect(router.url).toBe('/dashboard');
  });
});
