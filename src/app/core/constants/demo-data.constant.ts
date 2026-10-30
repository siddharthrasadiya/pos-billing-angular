import { IShopSettings } from '../models/models';

export const DEFAULT_SHOP_SETTINGS: IShopSettings = {
  name: 'ABC STORE',
  address: '12, Main Road, City',
  gst: '',
};

export const DEMO_CATEGORIES = ['Grocery', 'Dairy', 'Bakery', 'Personal Care'];

export const DEMO_CUSTOMER_CATEGORIES = ['Regular', 'Wholesale'];

export const DEMO_CUSTOMERS = [
  { name: 'ABC Traders', mobile: '9876500001', category: 1, address: 'Market Yard' },
  { name: 'XYZ Retail', mobile: '9876500002', category: 0, address: '' },
];

export const DEMO_PRODUCTS = [
  { name: 'Rice 1kg', localName: 'ચોખા 1kg', shortName: 'RC', category: 0, buyPrice: 52, sellPrice: 60, stock: 50 },
  { name: 'Sugar 1kg', localName: 'ખાંડ 1kg', shortName: 'SG', category: 0, buyPrice: 40, sellPrice: 45, stock: 40 },
  { name: 'Milk 500ml', localName: 'દૂધ 500ml', shortName: 'ML', category: 1, buyPrice: 25, sellPrice: 28, stock: 30 },
  { name: 'Bread', localName: 'બ્રેડ', shortName: 'BR', category: 2, buyPrice: 34, sellPrice: 40, stock: 20 },
  { name: 'Soap', localName: 'સાબુ', shortName: 'SP', category: 3, buyPrice: 29, sellPrice: 35, stock: 25 },
];
