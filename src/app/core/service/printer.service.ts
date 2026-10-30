import { Injectable, signal } from '@angular/core';
import { BLE_CHUNK_SIZE, ESC, PRINTER_SERVICES } from '../constants/printer.constant';
import { ToastersService } from './toasters.service';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable({
  providedIn: 'root',
})
export class PrinterService {
  readonly deviceName = signal<string | null>(null);
  readonly busy = signal(false);
  readonly supported = 'bluetooth' in navigator;
  private device?: BluetoothDevice;
  private writer?: BluetoothRemoteGATTCharacteristic;

  constructor(private toasters: ToastersService) {}

  get connected(): boolean {
    return Boolean(this.writer && this.device?.gatt?.connected);
  }

  async connect(): Promise<void> {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICES,
    });

    if (this.device !== device) {
      device.addEventListener('gattserverdisconnected', () => {
        this.writer = undefined;
        this.deviceName.set(null);
      });
    }
    this.device = device;
    await this.attach();
  }

  disconnect(): void {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
  }

  async print(text: string): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      this.toasters.info('Printing...');
      await this.ensureConnected();
      await this.writeChunked(new TextEncoder().encode(ESC.init + text + ESC.feed));
      this.toasters.success('Printed');
      return true;
    } catch (err) {
      this.toasters.error('Print failed: ' + (err as Error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  private async attach(): Promise<void> {
    const device = this.device!;
    const server = await device.gatt!.connect();
    for (const service of await server.getPrimaryServices()) {
      for (const c of await service.getCharacteristics()) {
        if (c.properties.write || c.properties.writeWithoutResponse) {
          this.writer = c;
          this.deviceName.set(device.name || 'Connected');
          return;
        }
      }
    }
    device.gatt!.disconnect();
    throw new Error('No writable characteristic found on this device');
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) return;
    if (this.device) {
      try {
        await this.attach();
        return;
      } catch {
        this.writer = undefined;
      }
    }
    await this.connect();
  }

  private async writeChunked(bytes: Uint8Array): Promise<void> {
    const writer = this.writer!;
    for (let i = 0; i < bytes.length; i += BLE_CHUNK_SIZE) {
      const part = bytes.slice(i, i + BLE_CHUNK_SIZE);
      if (writer.properties.write) {
        await writer.writeValueWithResponse(part);
      } else {
        await writer.writeValueWithoutResponse(part);
        await wait(20);
      }
    }
  }
}
