import { Routes } from '@angular/router';
import { coreComponentRoutes } from './components/core-component-routing';

export const routes: Routes = [...coreComponentRoutes, { path: '**', redirectTo: 'billing' }];
