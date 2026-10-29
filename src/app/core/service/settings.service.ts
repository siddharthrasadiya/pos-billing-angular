import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { SHOP_SETTINGS_ID } from '../constants/db.constant';
import { DEFAULT_SHOP_SETTINGS } from '../constants/demo-data.constant';
import { DbStore } from '../enums/db-store.enum';
import { stamp } from '../helpers/entity.helper';
import { IShopSettings, IShopSettingsEntity } from '../models/models';
import { DatabaseService, idbRequest } from './database.service';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  constructor(private db: DatabaseService) {}

  getShopSettings(): Observable<IShopSettings> {
    return this.db
      .get<IShopSettingsEntity>(DbStore.Settings, SHOP_SETTINGS_ID)
      .pipe(map((row) => (row ? { name: row.name, address: row.address, gst: row.gst } : DEFAULT_SHOP_SETTINGS)));
  }

  saveShopSettings(settings: IShopSettings): Observable<IShopSettingsEntity> {
    return this.db.transaction([DbStore.Settings], 'readwrite', async (tx) => {
      const store = tx.objectStore(DbStore.Settings);
      const existing = await idbRequest<IShopSettingsEntity | undefined>(
        store.get(SHOP_SETTINGS_ID),
      );
      const row = stamp(settings, existing ?? { id: SHOP_SETTINGS_ID });
      await idbRequest(store.put(row));
      return row;
    });
  }
}
