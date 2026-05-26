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
    ownerUid: r.ownerUid as string | null | undefined,
    tripId: r.tripId as string | null | undefined,
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

  if (firestoreId && id === firestoreId) {
    const existing = await db.getFirstAsync<{ id: string; synced: number }>(
      'SELECT id, synced FROM places WHERE firestoreId = ?',
      [firestoreId],
    );
    if (existing) {
      if (existing.synced === 0) {
        // Local has pending changes — only update sync metadata, preserve data
        await db.runAsync(
          `UPDATE places SET firestoreId = ?, uid = ?, ownerUid = ? WHERE id = ?`,
          [firestoreId, uid, data.ownerUid ?? null, existing.id],
        );
      } else {
        // Local is clean — update all fields with remote data
        await db.runAsync(
          `UPDATE places SET synced = 1, firestoreId = ?, uid = ?, ownerUid = ?,
           name = ?, location = ?, openTime = ?, closeTime = ?, travelTime = ?, transport = ?, tripId = ?
           WHERE id = ?`,
          [
            firestoreId, uid, data.ownerUid ?? null,
            data.name ?? null, data.location ?? null,
            data.openingTime ?? data.openTime ?? null,
            data.closingTime ?? data.closeTime ?? null,
            data.commuteDuration ?? data.travelTime ?? null,
            data.transportSchedule ?? data.transport ?? null,
            data.tripId ?? null,
            existing.id,
          ],
        );
      }
      return;
    }
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO places
     (id, uid, name, location, openTime, closeTime, travelTime, transport, createdAt, synced, firestoreId, ownerUid, tripId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, uid,
      data.name ?? null, data.location ?? null,
      data.openingTime ?? data.openTime ?? null,
      data.closingTime ?? data.closeTime ?? null,
      data.commuteDuration ?? data.travelTime ?? null,
      data.transportSchedule ?? data.transport ?? null,
      data.createdAt ?? new Date().toISOString(),
      synced ? 1 : 0, firestoreId,
      data.ownerUid ?? null,
      data.tripId ?? null,
    ],
  );
}

export async function getPlaceOwnerUid(id: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ ownerUid: string | null }>(
    'SELECT ownerUid FROM places WHERE id = ?', [id],
  );
  return row?.ownerUid ?? null;
}

export async function deleteLocalPlace(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM places WHERE id = ?', [id]);
}

export async function updateLocalPlaceFields(id: string, data: Record<string, any>) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE places SET name=?, location=?, openTime=?, closeTime=?, travelTime=?, transport=?, tripId=? WHERE id=?`,
    [
      data.name ?? null, data.location ?? null,
      data.openingTime ?? data.openTime ?? null,
      data.closingTime ?? data.closeTime ?? null,
      data.commuteDuration ?? data.travelTime ?? null,
      data.transportSchedule ?? data.transport ?? null,
      data.tripId ?? null,
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
    ownerUid: r.ownerUid as string | null | undefined,
    tripId: r.tripId as string | null | undefined,
    title: r.title as string | undefined,
    date: r.date as string | undefined,
    notes: r.notes as string | undefined,
    itemCount: (r.itemCount as number) ?? 0,
    totalSpent: (r.totalSpent as number) ?? 0,
    createdAt: r.createdAt as string | undefined,
    _source: (r.source ?? 'user') as 'user' | 'root',
    _synced: Boolean(r.synced),
    participants: r.participants ? JSON.parse(r.participants as string) as string[] : undefined,
  }));
}

export async function updateDayPlanParticipants(planId: string, participants: string[]): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE day_plans SET participants = ? WHERE id = ?`,
    [JSON.stringify(participants), planId],
  );
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
    const existing = await db.getFirstAsync<{ id: string; synced: number; source: string }>(
      'SELECT id, synced, source FROM day_plans WHERE firestoreId = ?',
      [firestoreId],
    );
    if (existing) {
      // Preserve 'user' source: own plans must never be downgraded to 'root'.
      // If incoming _source is 'user', promote the record; otherwise keep existing source.
      const resolvedSource = data._source === 'user' ? 'user' : (existing.source ?? 'root');
      if (existing.synced === 0) {
        await db.runAsync(
          `UPDATE day_plans SET firestoreId = ?, source = ? WHERE id = ?`,
          [firestoreId, resolvedSource, existing.id],
        );
      } else {
        await db.runAsync(
          `UPDATE day_plans SET synced = 1, uid = ?, firestoreId = ?, title = ?, date = ?, notes = ?,
           itemCount = ?, totalSpent = ?, tripId = ?, ownerUid = ?, source = ? WHERE id = ?`,
          [
            uid, firestoreId,
            data.title ?? null, data.date ?? null, data.notes ?? null,
            data.itemCount ?? 0, data.totalSpent ?? 0,
            data.tripId ?? null, data.ownerUid ?? null,
            resolvedSource, existing.id,
          ],
        );
      }
      return;
    }
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO day_plans
     (id, uid, title, date, notes, itemCount, totalSpent, createdAt, synced, firestoreId, source, ownerUid, tripId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, uid,
      data.title ?? null, data.date ?? null, data.notes ?? null,
      data.itemCount ?? 0, data.totalSpent ?? 0,
      data.createdAt ?? new Date().toISOString(),
      synced ? 1 : 0, firestoreId, data._source ?? 'user',
      data.ownerUid ?? null,
      data.tripId ?? null,
    ],
  );
}

export async function getDayPlanOwnerUid(id: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ ownerUid: string | null }>(
    'SELECT ownerUid FROM day_plans WHERE id = ?', [id],
  );
  return row?.ownerUid ?? null;
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
    ownerUid: r.ownerUid as string | null | undefined,
    dayPlanId: r.dayPlanId as string | undefined,
    placeId: r.placeId as string | undefined,
    placeName: r.placeName as string | undefined,
    placeLocation: r.placeLocation as string | undefined,
    arrivalTime: r.arrivalTime as string | undefined,
    leaveTime: r.leaveTime as string | undefined,
    amountSpent: (r.amountSpent as number) ?? 0,
    notes: r.notes as string | undefined,
    addedAt: r.addedAt as string | undefined,
    visited: r.visited === null || r.visited === undefined ? true : Boolean(r.visited),
    _source: (r.source ?? 'user') as 'user' | 'root',
    _synced: Boolean(r.synced),
  }));
}

export async function toggleLocalDayPlanItemVisited(itemId: string, visited: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE day_plan_items SET visited = ? WHERE id = ?`, [visited ? 1 : 0, itemId]);
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
    const existing = await db.getFirstAsync<{ id: string; synced: number }>(
      'SELECT id, synced FROM day_plan_items WHERE firestoreId = ?',
      [firestoreId],
    );
    if (existing) {
      if (existing.synced === 0) {
        await db.runAsync(
          `UPDATE day_plan_items SET firestoreId = ? WHERE id = ?`,
          [firestoreId, existing.id],
        );
      } else {
        await db.runAsync(
          `UPDATE day_plan_items SET synced = 1, firestoreId = ?,
           arrivalTime = ?, leaveTime = ?, amountSpent = ?, notes = ?,
           placeName = ?, placeLocation = ?, ownerUid = ? WHERE id = ?`,
          [
            firestoreId,
            data.arrivalTime ?? null, data.leaveTime ?? null,
            data.amountSpent ?? 0, data.notes ?? null,
            data.placeName ?? null, data.placeLocation ?? null,
            data.ownerUid ?? null,
            existing.id,
          ],
        );
      }
      return;
    }
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO day_plan_items
     (id, uid, dayPlanId, placeId, placeName, placeLocation, arrivalTime, leaveTime,
      amountSpent, notes, addedAt, synced, firestoreId, source, ownerUid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, uid, dayPlanId,
      data.placeId ?? null, data.placeName ?? null, data.placeLocation ?? null,
      data.arrivalTime ?? null, data.leaveTime ?? null,
      data.amountSpent ?? 0, data.notes ?? null,
      data.addedAt ?? new Date().toISOString(),
      synced ? 1 : 0, firestoreId, data._source ?? 'user',
      data.ownerUid ?? null,
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
    'UPDATE day_plans SET title=?, date=?, notes=?, tripId=? WHERE id=?',
    [data.title ?? null, data.date ?? null, data.notes ?? null, data.tripId ?? null, id],
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
  trip: 'trips',
  trip_item: 'trip_items',
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

export async function getFirestoreId(
  entity: keyof typeof TABLE_MAP,
  localId: string,
): Promise<string | null> {
  const db = await getDb();
  const table = TABLE_MAP[entity];
  const row = await db.getFirstAsync<{ firestoreId: string | null }>(
    `SELECT firestoreId FROM ${table} WHERE id = ?`,
    [localId],
  );
  return row?.firestoreId ?? null;
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
  retryCount: number;
}>> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, any>>(
    'SELECT * FROM pending_sync ORDER BY createdAt ASC',
  );
  return rows.map((r) => ({
    ...r,
    payload: JSON.parse(r.payload as string),
    retryCount: (r.retryCount as number) ?? 0,
  })) as any;
}

export async function incrementSyncRetry(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE pending_sync SET retryCount = retryCount + 1 WHERE id = ?',
    [id],
  );
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

// ─────────────────────── BUDDIES ───────────────────────

export type BuddyRole = 'admin' | 'user';

export type Buddy = {
  id: string;
  ownerUid: string;
  email: string;
  role: BuddyRole;
  tripIds: string[];
  addedAt?: string;
  firestoreId?: string | null;
};

export async function getLocalBuddies(ownerUid: string): Promise<Buddy[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, any>>(
    'SELECT * FROM buddies WHERE ownerUid = ? ORDER BY addedAt DESC',
    [ownerUid],
  );
  return rows.map((r) => ({
    id: r.id as string,
    ownerUid: r.ownerUid as string,
    email: r.email as string,
    role: r.role as BuddyRole,
    tripIds: r.tripIds ? (JSON.parse(r.tripIds) as string[]) : [],
    addedAt: r.addedAt as string | undefined,
    firestoreId: r.firestoreId as string | null | undefined,
  }));
}

export async function upsertLocalBuddy(
  ownerUid: string,
  id: string,
  email: string,
  role: BuddyRole,
  firestoreId: string | null,
  tripIds: string[] = [],
): Promise<void> {
  const db = await getDb();
  if (firestoreId) {
    await db.runAsync(
      'DELETE FROM buddies WHERE ownerUid = ? AND firestoreId = ? AND id != ?',
      [ownerUid, firestoreId, id],
    );
  }
  await db.runAsync(
    `INSERT OR REPLACE INTO buddies (id, ownerUid, email, role, addedAt, firestoreId, tripIds)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, ownerUid, email, role, new Date().toISOString(), firestoreId, JSON.stringify(tripIds)],
  );
}

export async function deleteLocalBuddy(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM buddies WHERE id = ?', [id]);
}

export async function updateLocalBuddyFirestoreId(localId: string, firestoreId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE buddies SET firestoreId = ? WHERE id = ?', [firestoreId, localId]);
}

export async function updateLocalBuddyTripIds(id: string, tripIds: string[]): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE buddies SET tripIds = ? WHERE id = ?', [JSON.stringify(tripIds), id]);
}

// ─────────────────────── BUDDY OWNERS ───────────────────────

export type BuddyOwner = {
  ownerUid: string;
  ownerEmail: string;
  role: BuddyRole;
  tripIds: string[];
};

/** Upsert an owner entry (called during pullFromFirestore for each buddyIndex entry). */
export async function upsertBuddyOwner(
  ownerUid: string,
  ownerEmail: string,
  role: BuddyRole,
  tripIds: string[] = [],
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO buddy_owners (ownerUid, ownerEmail, role, tripIds) VALUES (?, ?, ?, ?)`,
    [ownerUid, ownerEmail, role, JSON.stringify(tripIds)],
  );
}

/** Returns all owners who have added the current device user as a buddy. */
export async function getBuddyOwners(): Promise<BuddyOwner[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, any>>('SELECT * FROM buddy_owners');
  return rows.map((r) => ({
    ownerUid: r.ownerUid as string,
    ownerEmail: r.ownerEmail as string,
    role: r.role as BuddyRole,
    tripIds: r.tripIds ? (JSON.parse(r.tripIds) as string[]) : [],
  }));
}

/** Remove all owner entries (called before re-sync to keep the table fresh). */
export async function clearBuddyOwners(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM buddy_owners');
}

// ─────────────────────── TRIPS ───────────────────────

export type Trip = {
  id: string;
  firestoreId?: string | null;
  uid: string;
  ownerUid?: string | null;
  description?: string;
  country?: string;
  state?: string;
  city?: string;
  maxCost: number;
  createdAt?: string;
  _synced: boolean;
};

export async function getLocalTrips(uid: string): Promise<Trip[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, any>>(
    'SELECT * FROM trips WHERE uid = ? ORDER BY createdAt DESC',
    [uid],
  );
  return rows.map((r) => ({
    id: r.id as string,
    firestoreId: r.firestoreId as string | null | undefined,
    uid: r.uid as string,
    ownerUid: r.ownerUid as string | null | undefined,
    description: r.description as string | undefined,
    country: r.country as string | undefined,
    state: r.state as string | undefined,
    city: r.city as string | undefined,
    maxCost: (r.maxCost as number) ?? 0,
    createdAt: r.createdAt as string | undefined,
    _synced: Boolean(r.synced),
  }));
}

export async function upsertLocalTrip(
  uid: string,
  id: string,
  data: Record<string, any>,
  synced: boolean,
  firestoreId: string | null,
  ownerUid?: string | null,
): Promise<void> {
  const db = await getDb();

  if (firestoreId && id === firestoreId) {
    const existing = await db.getFirstAsync<{ id: string; synced: number }>(
      'SELECT id, synced FROM trips WHERE firestoreId = ? AND uid = ?',
      [firestoreId, uid],
    );
    if (existing) {
      if (existing.synced === 0) {
        await db.runAsync(
          `UPDATE trips SET firestoreId = ?, ownerUid = ? WHERE id = ?`,
          [firestoreId, ownerUid ?? data.ownerUid ?? null, existing.id],
        );
      } else {
        await db.runAsync(
          `UPDATE trips SET synced = 1, uid = ?, firestoreId = ?,
           description = ?, country = ?, state = ?, city = ?, maxCost = ?, ownerUid = ? WHERE id = ?`,
          [
            uid, firestoreId,
            data.description ?? null, data.country ?? null,
            data.state ?? null, data.city ?? null,
            data.maxCost ?? 0,
            ownerUid ?? data.ownerUid ?? null,
            existing.id,
          ],
        );
      }
      return;
    }
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO trips
     (id, uid, description, country, state, city, maxCost, createdAt, synced, firestoreId, ownerUid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, uid,
      data.description ?? null,
      data.country ?? null,
      data.state ?? null,
      data.city ?? null,
      data.maxCost ?? 0,
      data.createdAt ?? new Date().toISOString(),
      synced ? 1 : 0,
      firestoreId,
      ownerUid ?? data.ownerUid ?? null,
    ],
  );
}

export async function deleteLocalTrip(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM trips WHERE id = ?', [id]);
  await db.runAsync('DELETE FROM trip_items WHERE tripId = ?', [id]);
}

export async function updateLocalTripFields(id: string, data: Record<string, any>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE trips SET description=?, country=?, state=?, city=?, maxCost=? WHERE id=?',
    [data.description ?? null, data.country ?? null, data.state ?? null, data.city ?? null, data.maxCost ?? 0, id],
  );
}

// ─────────────────────── TRIP ITEMS ───────────────────────

export type TripItem = {
  id: string;
  firestoreId?: string | null;
  tripId: string;
  uid: string;
  type?: string;
  description?: string;
  amount: number;
  createdAt?: string;
  _synced: boolean;
};

export async function getLocalTripItems(uid: string, tripId: string): Promise<TripItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, any>>(
    'SELECT * FROM trip_items WHERE uid = ? AND tripId = ? ORDER BY createdAt ASC',
    [uid, tripId],
  );
  return rows.map((r) => ({
    id: r.id as string,
    firestoreId: r.firestoreId as string | null | undefined,
    tripId: r.tripId as string,
    uid: r.uid as string,
    type: r.type as string | undefined,
    description: r.description as string | undefined,
    amount: (r.amount as number) ?? 0,
    createdAt: r.createdAt as string | undefined,
    _synced: Boolean(r.synced),
  }));
}

export async function upsertLocalTripItem(
  uid: string,
  tripId: string,
  id: string,
  data: Record<string, any>,
  synced: boolean,
  firestoreId: string | null,
): Promise<void> {
  const db = await getDb();

  if (firestoreId && id === firestoreId) {
    const existing = await db.getFirstAsync<{ id: string; synced: number }>(
      'SELECT id, synced FROM trip_items WHERE firestoreId = ?',
      [firestoreId],
    );
    if (existing) {
      if (existing.synced === 0) {
        await db.runAsync(
          `UPDATE trip_items SET firestoreId = ? WHERE id = ?`,
          [firestoreId, existing.id],
        );
      } else {
        await db.runAsync(
          `UPDATE trip_items SET synced = 1, firestoreId = ?,
           type = ?, description = ?, amount = ? WHERE id = ?`,
          [
            firestoreId,
            data.type ?? null, data.description ?? null, data.amount ?? 0,
            existing.id,
          ],
        );
      }
      return;
    }
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO trip_items
     (id, uid, tripId, type, description, amount, createdAt, synced, firestoreId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, uid, tripId,
      data.type ?? null,
      data.description ?? null,
      data.amount ?? 0,
      data.createdAt ?? new Date().toISOString(),
      synced ? 1 : 0,
      firestoreId,
    ],
  );
}

export async function deleteLocalTripItem(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM trip_items WHERE id = ?', [id]);
}

export async function updateLocalTripItemFields(id: string, data: Record<string, any>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE trip_items SET type=?, description=?, amount=? WHERE id=?',
    [data.type ?? null, data.description ?? null, data.amount ?? 0, id],
  );
}

/** Sum of all trip_items.amount for a given tripId. */
export async function getTripFixedTotal(tripId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number | null }>(
    'SELECT SUM(amount) as total FROM trip_items WHERE tripId = ?',
    [tripId],
  );
  return row?.total ?? 0;
}

/** Sum of totalSpent of all day_plans belonging to a tripId. */
export async function getTripVariableTotal(tripId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number | null }>(
    'SELECT SUM(totalSpent) as total FROM day_plans WHERE tripId = ?',
    [tripId],
  );
  return row?.total ?? 0;
}
