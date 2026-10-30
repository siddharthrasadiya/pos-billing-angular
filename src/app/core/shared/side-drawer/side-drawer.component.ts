import { Component, DestroyRef, effect, input, output } from '@angular/core';

// Drawers can stack (cart, then customer picker); body scroll stays locked while any is open
const openDrawers: SideDrawerComponent[] = [];

function syncBodyLock(): void {
  document.body.classList.toggle('drawer-open', openDrawers.length > 0);
}

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

  constructor(destroyRef: DestroyRef) {
    effect(() => {
      this.remove();
      if (this.open()) openDrawers.push(this);
      syncBodyLock();
    });
    destroyRef.onDestroy(() => {
      this.remove();
      syncBodyLock();
    });
  }

  onEscape(): void {
    if (openDrawers.at(-1) === this) this.closed.emit();
  }

  private remove(): void {
    const index = openDrawers.indexOf(this);
    if (index >= 0) openDrawers.splice(index, 1);
  }
}
