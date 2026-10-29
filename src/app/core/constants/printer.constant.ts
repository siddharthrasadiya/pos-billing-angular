export const PRINTER_SERVICES: BluetoothServiceUUID[] = [
  0x18f0,
  0xff00,
  0xffe0,
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
];

export const ESC = {
  init: '\x1B\x40',
  left: '\x1B\x61\x00',
  center: '\x1B\x61\x01',
  right: '\x1B\x61\x02',
  boldOn: '\x1B\x45\x01',
  boldOff: '\x1B\x45\x00',
  bigOn: '\x1D\x21\x11',
  bigOff: '\x1D\x21\x00',
  tallOn: '\x1D\x21\x01',
  feed: '\n\n\n',
};

export const LINE_WIDTH = 32;

// Android Chrome does not negotiate a larger BLE MTU, so each write must fit in 20 bytes
export const BLE_CHUNK_SIZE = 20;
