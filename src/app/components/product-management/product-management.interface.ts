import { IBaseEntity } from 'src/app/core.index';

export interface ICategory extends IBaseEntity {
  name: string;
}

export interface IProduct extends IBaseEntity {
  name: string;
  shortName: string;
  categoryId: string;
  buyPrice: number;
  sellPrice: number;
  stock: number;
}

export type ProductRequestModel = Omit<IProduct, keyof IBaseEntity>;
