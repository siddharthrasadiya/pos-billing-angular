import { IBaseEntity } from 'src/app/core.index';

export interface ICartLine {
  productId: string;
  name: string;
  rate: number;
  cost: number;
  qty: number;
}

export interface IBillRequestModel {
  no: string;
  date: string;
  total: number;
  items: ICartLine[];
}

export interface IBill extends IBaseEntity {
  no: string;
  date: string;
  total: number;
  itemCount: number;
}

export interface IBillItem extends IBaseEntity {
  billId: string;
  productId: string;
  name: string;
  qty: number;
  rate: number;
  cost: number;
  amount: number;
}

export interface IBillWithItems extends IBill {
  items: IBillItem[];
}
