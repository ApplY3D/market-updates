import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    title: 'Dashboard · Market Dashboard',
    loadComponent: () => import('./features/dashboard/dashboard-page'),
  },
  {
    path: 'settings',
    title: 'Settings · Market Dashboard',
    loadComponent: () => import('./features/settings/settings-page'),
  },
  { path: '**', redirectTo: 'dashboard' },
];
