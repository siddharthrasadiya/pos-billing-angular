import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { SHOP_SETTINGS_ID } from '../constants/db.constant';
import { DEFAULT_SHOP_SETTINGS } from '../constants/demo-data.constant';
import { DbStore } from '../enums/db-store.enum';
import { DEFAULT_CUSTOMER_BILL_LIMIT, DEFAULT_STATEMENT_LIMIT } from '../enums/ledger.enum';
import { DEFAULT_HISTORY_LIMIT, DEFAULT_PURCHASE_RETENTION_DAYS } from '../enums/stock.enum';
import { stamp } from '../helpers/entity.helper';
import { pruneProductHistory } from '../helpers/inventory.helper';
import { pruneCustomerHistory } from '../helpers/ledger.helper';
import { IShopSettings, IShopSettingsEntity } from '../models/models';
import { DatabaseService, idbRequest } from './database.service';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  constructor(private db: DatabaseService) {}

  getShopSettings(): Observable<IShopSettings> {
    return this.db.get<IShopSettingsEntity>(DbStore.Settings, SHOP_SETTINGS_ID).pipe(
      map((row) =>
        row
          ? {
              name: row.name,
              address: row.address,
              gst: row.gst,
              priceHistoryLimit: row.priceHistoryLimit || DEFAULT_HISTORY_LIMIT,
              movementHistoryLimit: row.movementHistoryLimit || DEFAULT_HISTORY_LIMIT,
              purchaseRetentionDays: row.purchaseRetentionDays || DEFAULT_PURCHASE_RETENTION_DAYS,
              statementLimit: row.statementLimit || DEFAULT_STATEMENT_LIMIT,
              customerBillLimit: row.customerBillLimit || DEFAULT_CUSTOMER_BILL_LIMIT,
            }
          : DEFAULT_SHOP_SETTINGS,
      ),
    );
  }

  // Each settings page sends only its own fields; the rest are kept as they are
  saveShopSettings(settings: Partial<IShopSettings>): Observable<IShopSettingsEntity> {
    return this.db.transaction(
      [
        DbStore.Settings,
        DbStore.Products,
        DbStore.PriceHistory,
        DbStore.StockMovements,
        DbStore.Customers,
        DbStore.CustomerLedger,
        DbStore.Bills,
        DbStore.BillItems,
      ],
      'readwrite',
      async (tx) => {
        const store = tx.objectStore(DbStore.Settings);
        const existing = await idbRequest<IShopSettingsEntity | undefined>(
          store.get(SHOP_SETTINGS_ID),
        );
        const row = stamp(
          { ...DEFAULT_SHOP_SETTINGS, ...existing, ...settings },
          existing ?? { id: SHOP_SETTINGS_ID },
        );
        await idbRequest(store.put(row));

        // A lower limit applies right away, not only on the next stock change
        const productIds = await idbRequest<IDBValidKey[]>(
          tx.objectStore(DbStore.Products).getAllKeys(),
        );
        for (const productId of productIds) {
          await pruneProductHistory(tx, String(productId));
        }
        const customerIds = await idbRequest<IDBValidKey[]>(
          tx.objectStore(DbStore.Customers).getAllKeys(),
        );
        for (const customerId of customerIds) {
          await pruneCustomerHistory(tx, String(customerId));
        }
        return row;
      },
    );
  }
}
