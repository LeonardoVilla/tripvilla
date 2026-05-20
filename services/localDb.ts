import { getDb } from './db';

export function genLocalId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─────────────────────── PLACES ───────────────────────

export async function getLocalPlaces(uid: string) {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, any>>(
    'SELECT * FROM places WHERE uid = ? ORDER BY createdAt DESC',
    [uid],
  );
  return rows.map((r) => ({
    id: r.id as string,
    firestoreId: r.firestoreId as string | null | undefined,
    name: r.name as string | undefined,
    location: r.location as string | undefined,
    openingTime: r.openTime as string | undefined,
    closingTime: r.closeTime as string | undefined,
    commuteDuration: r.travelTime as string | undefined,
    transportSchedule: r.transport as string | undefined,
    createdAt: r.createdAt as string | undefined,
    _synced: Boolean(r.synced),
  }));
}

export async function upsertLocalPlace(
  uid: string,
  id: string,
  data: Record<string, any>,
  synced: boolean,
  firestoreId: string | null,
) {
  const db = await getDb();

  // Se estamos sincronizando do Firestore (id === firestoreId),
  // verificar se já existe registro local com esse firestoreId para evitar duplicata.
  if (firestoreId && id === firestoreId) {
    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM places WHERE firestoreId = ?',
      [firestoreId],
    );
    if (existing) {
      // Já existe registro local vinculado a esse doc do Firestore — apenas atualiza
      await db.runAsync(
        `UPDATE places SET synced = 1, firestoreId = ? WHERE id = ?`,
        [firestoreId, existing.id],
      );
      return;
    }
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO places
     (id, uid, name, location, openTime, closeTime, travelTime, transport, createdAt, synced, firestoreId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, uid,
      data.name ?? null, data.location ?? null,
      data.openingTime ?? data.openTime ?? null,
      data.closingTime ?? data.closeTime ?? null,
      data.commuteDuration ?? data.travelTime ?? null,
      data.transportSchedule ?? data.transport ?? null,
      data.createdAt ?? new Date().toISOString(),
      synced ? 1 : 0, firestoreId,
    ],
  );
}

export async function deleteLocalPlace(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM places WHERE id = ?', [id]);
}

export async function updateLocalPlaceFields(id: string, data: Record<string, any>) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE places SET name=?, location=?, openTime=?, closeTime=?, travelTime=?, transport=? WHERE id=?`,
    [
      data.name ?? null, data.location ?? null,
      data.openingTime ?? data.openTime ?? null,
      data.closingTime ?? data.closeTime ?? null,
      data.commuteDuration ?? data.travelTime ?? null,
      data.transportSchedule ?? data.transport ?? null,
      id,
    ],
  );
}

export async function countLocalPlaces(uid: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM places WHERE uid = ?', [uid],
  );
  return row?.cnt ?? 0;
}

// ─────────────────────── DAY PLANS ───────────────────────

export async function getLocalDayPlans(uid: string) {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, any>>(
    'SELECT * FROM day_plans WHERE uid = ? ORDER BY date DESC, createdAt DESC',
    [uid],
  );
  return rows.map((r) => ({
    id: r.id as string,
    firestoreId: r.firestoreId as string | null | undefined,
    title: r.title as string | undefined,
    date: r.date as string | undefined,
    notes: r.notes as string | undefined,
    itemCount: (r.itemCount as number) ?? 0,
    totalSpent: (r.totalSpent as number) ?? 0,
    createdAt: r.createdAt as string | undefined,
    _source: (r.source ?? 'user') as 'user' | 'root',
    _synced: Boolean(r.synced),
  }));
}

export async function upsertLocalDayPlan(
  uid: string,
  id: string,
  data: Record<string, any>,
  synced: boolean,
  firestoreId: string | null,
) {
  const db = await getDb();

  if (firestoreId && id === firestoreId) {
    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM day_plans WHERE firestoreId = ?',
      [firestoreId],
    );
    if (existing) {
      await db.runAsync(
        `UPDATE day_plans SET synced = 1, firestoreId = ? WHERE id = ?`,
        [firestoreId, existing.id],
      );
      return;
    }
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO day_plans
     (id, uid, title, date, notes, itemCount, totalSpent, createdAt, synced, firestoreId, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, uid,
      data.title ?? null, data.date ?? null, data.notes ?? null,
      data.itemCount ?? 0, data.totalSpent ?? 0,
      data.createdAt ?? new Date().toISOString(),
      synced ? 1 : 0, firestoreId, data._source ?? 'user',
    ],
  );
}

export async function updateLocalPlanTotals(planId: string) {
  const db = await getDb();
  const result = await db.getFirstAsync<{ cnt: number; total: number | null }>(
    'SELECT COUNT(*) as cnt, SUM(amountSpent) as total FROM day_plan_items WHERE dayPlanId = ?',
    [planId],
  );
  await db.runAsync(
    'UPDATE day_plans SET itemCount = ?, totalSpent = ? WHERE id = ?',
    [result?.cnt ?? 0, result?.total ?? 0, planId],
  );
}

export async function getPlanFirestoreId(localId: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ firestoreId: string | null }>(
    'SELECT firestoreId FROM day_plans WHERE id = ?', [localId],
  );
  return row?.firestoreId ?? null;
}

export async function countLocalDayPlans(uid: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM day_plans WHERE uid = ?', [uid],
  );
  return row?.cnt ?? 0;
}

// ─────────────────────── DAY PLAN ITEMS ───────────────────────

export async function getLocalDayPlanItems(uid: string, dayPlanId: string) {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, any>>(
    'SELECT * FROM day_plan_items WHERE uid = ? AND dayPlanId = ? ORDER BY arrivalTime ASC',
    [uid, dayPlanId],
  );
  return rows.map((r) => ({
    id: r.id as string,
    firestoreId: r.firestoreId as string | null | undefined,
    dayPlanId: r.dayPlanId as string | undefined,
    placeId: r.placeId as string | undefined,
    placeName: r.placeName as string | undefined,
    placeLocation: r.placeLocation as string | undefined,
    arrivalTime: r.arrivalTime as string | undefined,
    leaveTime: r.leaveTime as string | undefined,
    amountSpent: (r.amountSpent as number) ?? 0,
    notes: r.notes as string | undefined,
    addedAt: r.addedAt as string | undefined,
    _source: (r.source ?? 'user') as 'user' | 'root',
    _synced: Boolean(r.synced),
  }));
}

export async function upsertLocalDayPlanItem(
  uid: string,
  dayPlanId: string,
  id: string,
  data: Record<string, any>,
  synced: boolean,
  firestoreId: string | null,
) {
  const db = await getDb();

  if (firestoreId && id === firestoreId) {
    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM day_plan_items WHERE firestoreId = ?',
      [firestoreId],
    );
    if (existing) {
      await db.runAsync(
        `UPDATE day_plan_items SET synced = 1, firestoreId = ? WHERE id = ?`,
        [firestoreId, existing.id],
      );
      return;
    }
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO day_plan_items
     (id, uid, dayPlanId, placeId, placeName, placeLocation, arrivalTime, leaveTime,
      amountSpent, notes, addedAt, synced, firestoreId, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, uid, dayPlanId,
      data.placeId ?? null, data.placeName ?? null, data.placeLocation ?? null,
      data.arrivalTime ?? null, data.leaveTime ?? null,
      data.amountSpent ?? 0, data.notes ?? null,
      data.addedAt ?? new Date().toISOString(),
      synced ? 1 : 0, firestoreId, data._source ?? 'user',
    ],
  );
}

export async function deleteLocalDayPlan(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM day_plans WHERE id = ?', [id]);
}

export async function updateLocalDayPlanFields(id: string, data: Record<string, any>) {
  const db = await getDb();
  await db.runAsync(
    'UPDATE day_plans SET title=?, date=?, notes=? WHERE id=?',
    [data.title ?? null, data.date ?? null, data.notes ?? null, id],
  );
}

export async function deleteLocalDayPlanItem(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM day_plan_items WHERE id = ?', [id]);
}

export async function updateLocalDayPlanItemFields(id: string, data: Record<string, any>) {
  const db = await getDb();
  await db.runAsync(
    'UPDATE day_plan_items SET arrivalTime=?, leaveTime=?, amountSpent=?, notes=? WHERE id=?',
    [data.arrivalTime ?? null, data.leaveTime ?? null, data.amountSpent ?? 0, data.notes ?? null, id],
  );
}

export async function getItemFirestoreId(localId: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ firestoreId: string | null }>(
    'SELECT firestoreId FROM day_plan_items WHERE id = ?', [localId],
  );
  return row?.firestoreId ?? null;
}

export async function getItemDayPlanLocalId(itemLocalId: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ dayPlanId: string | null }>(
    'SELECT dayPlanId FROM day_plan_items WHERE id = ?', [itemLocalId],
  );
  return row?.dayPlanId ?? null;
}

// ─────────────────────── GENERIC MARK SYNCED ───────────────────────

const TABLE_MAP = {
  place: 'places',
  day_plan: 'day_plans',
  day_plan_item: 'day_plan_items',
} as const;

export async function markSynced(
  entity: keyof typeof TABLE_MAP,
  localId: string,
  firestoreId: string,
) {
  const db = await getDb();
  const table = TABLE_MAP[entity];
  await db.runAsync(
    `UPDATE ${table} SET synced = 1, firestoreId = ? WHERE id = ?`,
    [firestoreId, localId],
  );
}

// ─────────────────────── SYNC QUEUE ───────────────────────

export async function addToSyncQueue(
  operation: 'create' | 'update' | 'delete',
  entity: keyof typeof TABLE_MAP,
  localId: string,
  payload: Record<string, any>,
) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO pending_sync (id, operation, entity, localId, payload, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    [genLocalId(), operation, entity, localId, JSON.stringify(payload), new Date().toISOString()],
  );
}

export async function getSyncQueue(): Promise<Array<{
  id: string;
  operation: string;
  entity: string;
  localId: string;
  payload: Record<string, any>;
  createdAt: string;
}>> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, any>>(
    'SELECT * FROM pending_sync ORDER BY createdAt ASC',
  );
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload as string) }));
}

export async function removeSyncEntry(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM pending_sync WHERE id = ?', [id]);
}

export async function removeSyncEntryByLocalId(localId: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM pending_sync WHERE localId = ?', [localId]);
}

export async function pendingSyncCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM pending_sync');
  return row?.cnt ?? 0;
}
