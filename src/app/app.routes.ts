import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./sld/pages/sld-page.component').then((m) => m.SldPageComponent),
  },
  // Unknown URLs fall back to the single editor route instead of a blank screen.
  { path: '**', redirectTo: '' },
];
