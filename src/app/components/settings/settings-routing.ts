import { Routes } from '@angular/router';

export const settingsRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'shop' },
  {
    path: 'shop',
    loadComponent: () =>
      import('./shop-settings/shop-settings.component').then((c) => c.ShopSettingsComponent),
  },
  {
    path: 'stock',
    loadComponent: () =>
      import('./stock-settings/stock-settings.component').then((c) => c.StockSettingsComponent),
  },
  {
    path: 'purchase',
    loadComponent: () =>
      import('./purchase-settings/purchase-settings.component').then(
        (c) => c.PurchaseSettingsComponent,
      ),
  },
  {
    path: 'printer',
    loadComponent: () =>
      import('./printer-settings/printer-settings.component').then(
        (c) => c.PrinterSettingsComponent,
      ),
  },
  {
    path: 'setup',
    loadComponent: () =>
      import('./setup-guide/setup-guide.component').then((c) => c.SetupGuideComponent),
  },
];
