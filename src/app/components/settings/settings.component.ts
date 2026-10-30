import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-settings',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  // Add a new settings page here and in settings-routing.ts
  readonly menu = [
    { path: 'shop', label: 'Shop' },
    { path: 'stock', label: 'Stock' },
    { path: 'printer', label: 'Printer' },
  ];
}
