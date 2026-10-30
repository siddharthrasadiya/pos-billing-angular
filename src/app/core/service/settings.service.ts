import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { SHOP_SETTINGS_ID } from '../constants/db.constant';
import { DEFAULT_SHOP_SETTINGS } from '../constants/demo-data.constant';
import { DbStore } from '../enums/db-store.enum';
import { DEFAULT_COSTING_METHOD } from '../enums/stock.enum';
import { roundMoney } from '../helpers/bill.helper';
import { stamp } from '../helpers/entity.helper';
import { IInventoryBatch } from '../models/inventory.models';
import { IShopSettings, IShopSettingsEntity } from '../models/models';
import { DatabaseService, idbRequest } from './database.service';

interface ICostedProduct {
  id: string;
  stock: number;
  avgCost?: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  constructor(private db: DatabaseService) {}

  getShopSettings(): Observable<IShopSettings> {
    return this.db
      .get<IShopSettingsEntity>(DbStore.Settings, SHOP_SETTINGS_ID)
      .pipe(
        map((row) =>
          row
            ? {
                name: row.name,
                address: row.address,
                gst: row.gst,
                costingMethod: row.costingMethod ?? '',
              }
            : DEFAULT_SHOP_SETTINGS,
        ),
      );
  }

  saveShopSettings(settings: IShopSettings): Observable<IShopSettingsEntity> {
    return this.db.transaction(
      [DbStore.Settings, DbStore.Products, DbStore.InventoryBatches],
      'readwrite',
      async (tx) => {
        const store = tx.objectStore(DbStore.Settings);
        const existing = await idbRequest<IShopSettingsEntity | undefined>(
          store.get(SHOP_SETTINGS_ID),
        );
        const oldMethod = existing?.costingMethod || DEFAULT_COSTING_METHOD;
        const newMethod = settings.costingMethod || DEFAULT_COSTING_METHOD;
        if (oldMethod !== newMethod) await this.resetAverageCosts(tx);

        const row = stamp(settings, existing ?? { id: SHOP_SETTINGS_ID });
        await idbRequest(store.put(row));
        return row;
      },
    );
  }

  // Switching costing method starts the running average fresh from the batches in hand,
  // so costs from the old method do not carry over into the new one
  private async resetAverageCosts(tx: IDBTransaction): Promise<void> {
    const products = await idbRequest<ICostedProduct[]>(tx.objectStore(DbStore.Products).getAll());
    const batches = await idbRequest<IInventoryBatch[]>(
      tx.objectStore(DbStore.InventoryBatches).getAll(),
    );
    for (const product of products) {
      const open = batches.filter((b) => b.productId === product.id && b.remainingQty > 0);
      const qty = open.reduce((sum, b) => sum + b.remainingQty, 0);
      if (!qty) continue;
      const value = open.reduce((sum, b) => sum + b.remainingQty * b.unitCost, 0);
      await idbRequest(
        tx.objectStore(DbStore.Products).put(
          stamp({ ...product, avgCost: roundMoney(value / qty) }, product),
        ),
      );
    }
  }
}
