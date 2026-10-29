import { Component, effect, input, output } from '@angular/core';

@Component({
  selector: 'app-side-drawer',
  templateUrl: './side-drawer.component.html',
  styleUrl: './side-drawer.component.scss',
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class SideDrawerComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly closed = output<void>();

  constructor() {
    effect(() => document.body.classList.toggle('drawer-open', this.open()));
  }

  onEscape(): void {
    if (this.open()) this.closed.emit();
  }
}
