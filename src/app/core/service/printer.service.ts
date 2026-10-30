import { Injectable, signal } from '@angular/core';
import { BLE_CHUNK_SIZE, ESC, PRINTER_SERVICES } from '../constants/printer.constant';
import { encodeReceipt } from '../helpers/escpos-encoder.helper';
import { ToastersService } from './toasters.service';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The printer belongs to this phone or PC, so it is kept in local storage, not in the database
// (a backup restored on another device must not point at this device's printer)
const DEFAULT_PRINTER_KEY = 'pos.defaultPrinter';

export interface IDefaultPrinter {
  id: string;
  name: string;
}

type RememberedBluetooth = Bluetooth & { getDevices?: () => Promise<BluetoothDevice[]> };
type ForgettableDevice = BluetoothDevice & { forget?: () => Promise<void> };

@Injectable({
  providedIn: 'root',
})
export class PrinterService {
  readonly deviceName = signal<string | null>(null);
  readonly busy = signal(false);
  readonly defaultPrinter = signal<IDefaultPrinter | null>(this.readDefault());
  readonly supported = 'bluetooth' in navigator;
  // Chrome can reconnect to a printer picked before only where getDevices() is available
  readonly canReconnect = this.supported && 'getDevices' in navigator.bluetooth;
  private device?: BluetoothDevice;
  private writer?: BluetoothRemoteGATTCharacteristic;

  constructor(private toasters: ToastersService) {
    // A page reload always drops the Bluetooth link; reconnect the saved printer quietly
    if (this.defaultPrinter() && this.canReconnect) {
      this.reconnectDefault().catch(() => undefined);
    }
  }

  get connected(): boolean {
    return Boolean(this.writer && this.device?.gatt?.connected);
  }

  // Reconnects through Chrome's picker; with a saved printer the picker lists only that printer,
  // so after a reload it is a single tap
  async connect(): Promise<void> {
    const saved = this.defaultPrinter();
    if (!saved?.name) {
      await this.selectPrinter();
      return;
    }
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ name: saved.name }],
      optionalServices: PRINTER_SERVICES,
    });
    await this.useDevice(device);
    this.saveDefault({ id: device.id, name: device.name || saved.name });
  }

  // Shows every nearby device; the chosen printer becomes the default for this device
  async selectPrinter(): Promise<void> {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICES,
    });
    await this.useDevice(device);
    this.saveDefault({ id: device.id, name: device.name || '' });
  }

  disconnect(): void {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
  }

  async reconnectDefault(): Promise<boolean> {
    const saved = this.defaultPrinter();
    if (!saved || !this.canReconnect) return false;
    const devices = (await (navigator.bluetooth as RememberedBluetooth).getDevices?.()) ?? [];
    const device = devices.find((d) => d.id === saved.id);
    if (!device) return false;
    await this.useDevice(device);
    return true;
  }

  async forgetDefault(): Promise<void> {
    const saved = this.defaultPrinter();
    this.disconnect();
    if (saved && this.canReconnect) {
      const devices = (await (navigator.bluetooth as RememberedBluetooth).getDevices?.()) ?? [];
      const device = devices.find((d) => d.id === saved.id) as ForgettableDevice | undefined;
      await device?.forget?.();
    }
    this.device = undefined;
    this.writer = undefined;
    this.deviceName.set(null);
    try {
      localStorage.removeItem(DEFAULT_PRINTER_KEY);
    } catch {}
    this.defaultPrinter.set(null);
  }

  async print(text: string): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      this.toasters.info('Printing...');
      await this.ensureConnected();
      await this.writeChunked(encodeReceipt(ESC.init + text + ESC.feed));
      this.toasters.success('Printed');
      return true;
    } catch (err) {
      this.toasters.error('Print failed: ' + (err as Error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  private async useDevice(device: BluetoothDevice): Promise<void> {
    if (this.device !== device) {
      device.addEventListener('gattserverdisconnected', () => {
        this.writer = undefined;
        this.deviceName.set(null);
      });
    }
    this.device = device;
    await this.attach();
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

  // Order: current printer, then the saved default without a picker, then the picker
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
    try {
      if (await this.reconnectDefault()) return;
    } catch {
      this.writer = undefined;
    }
    await this.connect();
  }

  private readDefault(): IDefaultPrinter | null {
    try {
      const value = localStorage.getItem(DEFAULT_PRINTER_KEY);
      return value ? (JSON.parse(value) as IDefaultPrinter) : null;
    } catch {
      return null;
    }
  }

  private saveDefault(printer: IDefaultPrinter): void {
    try {
      localStorage.setItem(DEFAULT_PRINTER_KEY, JSON.stringify(printer));
    } catch {}
    this.defaultPrinter.set(printer);
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
