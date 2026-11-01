import { inject } from '@angular/core';
import { CanActivateFn, Routes } from '@angular/router';
import { SecurityService } from 'src/app/core.index';

// With an owner PIN set, settings pages ask for it; Printer and Setup guide stay open for staff
const ownerOnly: CanActivateFn = () => inject(SecurityService).allow('open these settings');

export const settingsRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: () => (inject(SecurityService).needsPin() ? 'printer' : 'shop'),
  },
  {
    path: 'shop',
    canActivate: [ownerOnly],
    loadComponent: () =>
      import('./shop-settings/shop-settings.component').then((c) => c.ShopSettingsComponent),
  },
  {
    path: 'stock',
    canActivate: [ownerOnly],
    loadComponent: () =>
      import('./stock-settings/stock-settings.component').then((c) => c.StockSettingsComponent),
  },
  {
    path: 'purchase',
    canActivate: [ownerOnly],
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
  {
    path: 'backup',
    canActivate: [ownerOnly],
    loadComponent: () =>
      import('./backup-settings/backup-settings.component').then((c) => c.BackupSettingsComponent),
  },
  {
    path: 'customers',
    canActivate: [ownerOnly],
    loadComponent: () =>
      import('./customer-settings/customer-settings.component').then(
        (c) => c.CustomerSettingsComponent,
      ),
  },
  {
    path: 'security',
    canActivate: [ownerOnly],
    loadComponent: () =>
      import('./security-settings/security-settings.component').then(
        (c) => c.SecuritySettingsComponent,
      ),
  },
];
