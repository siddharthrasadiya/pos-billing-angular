import { IBaseEntity } from '../models/models';

export function newId(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

export function stamp<T extends object>(record: T, existing?: Partial<IBaseEntity>): T & IBaseEntity {
  const now = new Date().toISOString();
  return {
    ...record,
    id: existing?.id ?? newId(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}
