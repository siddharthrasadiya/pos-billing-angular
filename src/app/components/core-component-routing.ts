import { Routes } from '@angular/router';

export const coreComponentRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./core-component.component').then((c) => c.CoreComponentComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'billing' },
      {
        path: 'billing',
        loadComponent: () =>
          import('./billing/billing.component').then((c) => c.BillingComponent),
      },
      {
        path: 'products',
        loadComponent: () =>
          import('./product-management/product-management.component').then(
            (c) => c.ProductManagementComponent,
          ),
      },
      {
        path: 'customers',
        loadComponent: () =>
          import('./customer-management/customer-management.component').then(
            (c) => c.CustomerManagementComponent,
          ),
      },
      {
        path: 'history',
        loadComponent: () =>
          import('./bill-history/bill-history.component').then((c) => c.BillHistoryComponent),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./settings/settings.component').then((c) => c.SettingsComponent),
      },
    ],
  },
];
