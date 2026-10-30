import { IBaseEntity } from 'src/app/core.index';

export interface ICustomer extends IBaseEntity {
  name: string;
  mobile: string;
  categoryId: string;
  email: string;
  gstin: string;
  address: string;
}

export type CustomerRequestModel = Omit<ICustomer, keyof IBaseEntity>;
