import { BillLanguage, IBaseEntity } from 'src/app/core.index';

export const MAX_CONTACTS = 3;

// A shop often has more than one person to call (owner, partner, manager)
export interface ICustomerContact {
  name: string;
  mobile: string;
}

export interface ICustomer extends IBaseEntity {
  name: string;
  // Main number = contacts[0].mobile, kept here too for search, bills and old data
  mobile: string;
  contacts: ICustomerContact[];
  categoryId: string;
  billLanguage: BillLanguage;
  email: string;
  gstin: string;
  address: string;
  // Plus = due, minus = advance; changed only through statement entries
  balance: number;
}

export type CustomerRequestModel = Omit<ICustomer, keyof IBaseEntity | 'balance' | 'mobile'>;
