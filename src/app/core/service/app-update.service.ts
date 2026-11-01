import { Injectable, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';

// After start-up work is done, so the check does not slow down opening the app
const FIRST_CHECK_MS = 5000;
const CHECK_EVERY_MS = 30 * 60 * 1000;

// The service worker downloads a new deploy in the background; this tells the shop when it is
// ready, so they can switch now instead of waiting for the next app start.
// Does nothing during ng serve, where the service worker is off.
@Injectable({
  providedIn: 'root',
})
export class AppUpdateService {
  readonly ready = signal(false);

  constructor(private swUpdate: SwUpdate) {
    if (!swUpdate.isEnabled) return;
    swUpdate.versionUpdates
      .pipe(filter((event) => event.type === 'VERSION_READY'))
      .subscribe(() => this.ready.set(true));
    // The cached app can no longer start (old files gone from the server): load the new one
    swUpdate.unrecoverable.subscribe(() => location.reload());

    // Ask soon after opening (the worker alone may not check until later), then now and then
    // and whenever the app comes back to the front, since a shop keeps it open all day
    setTimeout(() => this.check(), FIRST_CHECK_MS);
    setInterval(() => this.check(), CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.check();
    });
  }

  // The unsaved bill is kept as a draft, so reloading never loses work
  async update(): Promise<void> {
    try {
      await this.swUpdate.activateUpdate();
    } finally {
      location.reload();
    }
  }

  dismiss(): void {
    this.ready.set(false);
  }

  private check(): void {
    this.swUpdate.checkForUpdate().catch(() => undefined);
  }
}
