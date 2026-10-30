import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warn' | 'info';

export interface IToast {
  id: number;
  type: ToastType;
  title: string;
  message: string;
}

const TITLES: Record<ToastType, string> = {
  success: 'Success',
  error: 'Error',
  warn: 'Warning',
  info: 'Info',
};

interface ITimer {
  handle?: ReturnType<typeof setTimeout>;
  remaining: number;
  startedAt: number;
}

@Injectable({
  providedIn: 'root',
})
export class ToastersService {
  readonly toasts = signal<IToast[]>([]);
  private nextId = 1;
  private timers = new Map<number, ITimer>();

  success(message: string, title = TITLES.success): void {
    this.add('success', message, title, 3000);
  }

  error(message: string, title = TITLES.error): void {
    this.add('error', message, title, 6000);
  }

  warn(message: string, title = TITLES.warn): void {
    this.add('warn', message, title, 4000);
  }

  info(message: string, title = TITLES.info): void {
    this.add('info', message, title, 3000);
  }

  // Hovering keeps a toast on screen so a long error can be read; leaving restarts what was left
  pause(id: number): void {
    const timer = this.timers.get(id);
    if (!timer?.handle) return;
    clearTimeout(timer.handle);
    timer.handle = undefined;
    timer.remaining -= Date.now() - timer.startedAt;
  }

  resume(id: number): void {
    const timer = this.timers.get(id);
    if (!timer || timer.handle) return;
    this.start(id, Math.max(timer.remaining, 1500));
  }

  close(id: number): void {
    clearTimeout(this.timers.get(id)?.handle);
    this.timers.delete(id);
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private add(type: ToastType, message: string, title: string, life: number): void {
    const id = this.nextId++;
    this.toasts.update((list) => [...list.slice(-3), { id, type, title, message }]);
    this.start(id, life);
  }

  private start(id: number, life: number): void {
    this.timers.set(id, {
      handle: setTimeout(() => this.close(id), life),
      remaining: life,
      startedAt: Date.now(),
    });
  }
}
