import { firebaseApp } from '@/firebaseInit';
import { addDoc, collection, deleteDoc, doc, getDocs, getFirestore, increment, setDoc, updateDoc } from 'firebase/firestore';
import { getDb } from './db';
import {
  addToSyncQueue,
  Buddy,
  BuddyRole,
  deleteLocalBuddy,
  deleteLocalDayPlan,
  deleteLocalDayPlanItem,
  deleteLocalPlace,
  deleteLocalTrip,
  deleteLocalTripItem,
  genLocalId,
  getDayPlanOwnerUid,
  getLocalBuddies,
  getLocalDayPlanItems,
  getLocalDayPlans,
  getLocalPlaces,
  getLocalTripItems,
  getLocalTrips,
  getPlaceOwnerUid,
  getPlanFirestoreId,
  markSynced,
  removeSyncEntryByLocalId,
  Trip,
  TripItem,
  updateLocalBuddyFirestoreId,
  updateLocalBuddyTripIds,
  updateLocalDayPlanFields,
  toggleLocalDayPlanItemVisited,
  updateLocalDayPlanItemFields,
  updateLocalPlaceFields,
  updateLocalPlanTotals,
  updateLocalTripFields,
  updateLocalTripItemFields,
  upsertLocalBuddy,
  upsertLocalDayPlan,
  upsertLocalDayPlanItem,
  upsertLocalPlace,
  upsertLocalTrip,
  upsertLocalTripItem,
} from './localDb';

const firestoreDb = getFirestore(firebaseApp);

export type DayPlanSource = 'user' | 'root';

export type { Trip, TripItem };

export type DayPlan = {
  id: string;
  firestoreId?: string | null;
  tripId?: string | null;
  title?: string;
  date?: string;
  notes?: string;
  createdAt?: string;
  itemCount?: number;
  totalSpent?: number;
  participants?: string[];
  _source: DayPlanSource;
};

export type DayPlanItem = {
  id: string;
  firestoreId?: string | null;
  dayPlanId?: string;
  placeId?: string;
  placeName?: string;
  placeLocation?: string;
  arrivalTime?: string;
  leaveTime?: string;
  amountSpent?: number;
  notes?: string;
  addedAt?: string;
  visited?: boolean;
  _source: DayPlanSource;
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ PLACES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getUserPlaces(uid: string) {
  return getLocalPlaces(uid);
}

export async function addUserPlace(uid: string, data: Record<string, unknown>, ownerUid?: string) {
  const localId = genLocalId();
  const targetPath = ownerUid ?? uid;
  const localData = ownerUid ? { ...data, ownerUid } : data;
  await upsertLocalPlace(uid, localId, localData as Record<string, any>, false, null);
  await addToSyncQueue('create', 'place', localId, { ...localData });

  // Best-effort immediate sync
  try {
    const ref = await addDoc(collection(firestoreDb, `users/${targetPath}/places`), data);
    await markSynced('place', localId, ref.id);
    await removeSyncEntryByLocalId(localId);
  } catch { /* will sync later via queue */ }
}

export async function updateUserPlace(
  uid: string,
  placeId: string,
  data: Record<string, unknown>,
  firestoreId?: string | null,
) {
  await updateLocalPlaceFields(placeId, data as Record<string, any>);
  const firestoreOwner = (await getPlaceOwnerUid(placeId)) ?? uid;
  const target = firestoreId ?? placeId;
  try {
    await updateDoc(doc(firestoreDb, `users/${firestoreOwner}/places/${target}`), data as any);
  } catch { /* offline — TODO: queue update */ }
}

export async function deleteUserPlace(
  uid: string,
  placeId: string,
  firestoreId?: string | null,
) {
  await deleteLocalPlace(placeId);
  if (firestoreId) {
    const firestoreOwner = (await getPlaceOwnerUid(placeId)) ?? uid;
    try {
      await deleteDoc(doc(firestoreDb, `users/${firestoreOwner}/places/${firestoreId}`));
    } catch { /* offline — TODO: queue delete */ }
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ DAY PLANS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getUserDayPlans(uid: string): Promise<DayPlan[]> {
  return getLocalDayPlans(uid);
}

export async function addUserDayPlan(uid: string, data: Record<string, unknown>, ownerUid?: string) {
  const localId = genLocalId();
  const targetPath = ownerUid ?? uid;
  const localData = ownerUid ? { ...data, ownerUid, _source: 'root' } : data;
  await upsertLocalDayPlan(uid, localId, localData as Record<string, any>, false, null);
  await addToSyncQueue('create', 'day_plan', localId, { ...localData });

  // Best-effort immediate sync
  try {
    const ref = await addDoc(collection(firestoreDb, `users/${targetPath}/day_plans`), data);
    await markSynced('day_plan', localId, ref.id);
    await removeSyncEntryByLocalId(localId);
  } catch { /* will sync later */ }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ DAY PLAN ITEMS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getDayPlanItems(
  uid: string,
  dayPlanId: string,
  _source?: DayPlanSource,
): Promise<DayPlanItem[]> {
  return getLocalDayPlanItems(uid, dayPlanId);
}

export async function toggleDayPlanItemVisited(
  uid: string,
  dayPlanId: string,
  itemId: string,
  visited: boolean,
  itemFirestoreId?: string | null,
): Promise<void> {
  await toggleLocalDayPlanItemVisited(itemId, visited);
  await updateLocalPlanTotals(dayPlanId);
  if (itemFirestoreId) {
    try {
      const firestoreOwner = (await getDayPlanOwnerUid(dayPlanId)) ?? uid;
      const planFirestoreId = await getPlanFirestoreId(dayPlanId);
      if (planFirestoreId) {
        await updateDoc(
          doc(firestoreDb, `users/${firestoreOwner}/day_plans/${planFirestoreId}/items/${itemFirestoreId}`),
          { visited },
        );
      }
    } catch { /* will sync later */ }
  }
}

export async function deleteUserDayPlan(uid: string, localId: string, firestoreId?: string | null) {
  const firestoreOwner = (await getDayPlanOwnerUid(localId)) ?? uid;
  await deleteLocalDayPlan(localId);
  await addToSyncQueue('delete', 'day_plan', localId, {});
  if (firestoreId) {
    try {
      await deleteDoc(doc(firestoreDb, `users/${firestoreOwner}/day_plans/${firestoreId}`));
    } catch { /* will sync later */ }
  }
}

export async function updateUserDayPlan(
  uid: string,
  localId: string,
  data: { title?: string; date?: string; notes?: string; tripId?: string | null },
  firestoreId?: string | null,
) {
  const firestoreOwner = (await getDayPlanOwnerUid(localId)) ?? uid;
  await updateLocalDayPlanFields(localId, data);
  await addToSyncQueue('update', 'day_plan', localId, data);
  if (firestoreId) {
    try {
      await updateDoc(doc(firestoreDb, `users/${firestoreOwner}/day_plans/${firestoreId}`), data);
    } catch { /* will sync later */ }
  }
}

export async function deleteDayPlanItem(
  uid: string,
  dayPlanLocalId: string,
  itemLocalId: string,
  itemFirestoreId?: string | null,
) {
  const firestoreOwner = (await getDayPlanOwnerUid(dayPlanLocalId)) ?? uid;
  await deleteLocalDayPlanItem(itemLocalId);
  await updateLocalPlanTotals(dayPlanLocalId);
  await addToSyncQueue('delete', 'day_plan_item', itemLocalId, {});
  if (itemFirestoreId) {
    try {
      const planFirestoreId = await getPlanFirestoreId(dayPlanLocalId);
      if (planFirestoreId) {
        await deleteDoc(
          doc(firestoreDb, `users/${firestoreOwner}/day_plans/${planFirestoreId}/items/${itemFirestoreId}`),
        );
      }
    } catch { /* will sync later */ }
  }
}

export async function updateDayPlanItem(
  uid: string,
  dayPlanLocalId: string,
  itemLocalId: string,
  data: { arrivalTime?: string; leaveTime?: string; amountSpent?: number; notes?: string },
  itemFirestoreId?: string | null,
) {
  const firestoreOwner = (await getDayPlanOwnerUid(dayPlanLocalId)) ?? uid;
  await updateLocalDayPlanItemFields(itemLocalId, data);
  await updateLocalPlanTotals(dayPlanLocalId);
  await addToSyncQueue('update', 'day_plan_item', itemLocalId, data);
  if (itemFirestoreId) {
    try {
      const planFirestoreId = await getPlanFirestoreId(dayPlanLocalId);
      if (planFirestoreId) {
        await updateDoc(
          doc(firestoreDb, `users/${firestoreOwner}/day_plans/${planFirestoreId}/items/${itemFirestoreId}`),
          data,
        );
      }
    } catch { /* will sync later */ }
  }
}

export async function addDayPlanItem(
  uid: string,
  dayPlanId: string,
  data: Record<string, unknown>,
  _source: DayPlanSource,
) {
  const firestoreOwner = (await getDayPlanOwnerUid(dayPlanId)) ?? uid;
  const localId = genLocalId();
  await upsertLocalDayPlanItem(uid, dayPlanId, localId, data as Record<string, any>, false, null);
  await updateLocalPlanTotals(dayPlanId);
  await addToSyncQueue('create', 'day_plan_item', localId, {
    ...data,
    _dayPlanLocalId: dayPlanId,
  });

  // Best-effort immediate sync
  try {
    const planFirestoreId = await getPlanFirestoreId(dayPlanId);
    if (planFirestoreId) {
      const ref = await addDoc(
        collection(firestoreDb, `users/${firestoreOwner}/day_plans/${planFirestoreId}/items`),
        data,
      );
      await markSynced('day_plan_item', localId, ref.id);
      await removeSyncEntryByLocalId(localId);
      // Update Firestore plan totals
      const amount = typeof data.amountSpent === 'number' ? data.amountSpent : 0;
      try {
        await updateDoc(doc(firestoreDb, `users/${firestoreOwner}/day_plans/${planFirestoreId}`), {
          itemCount: increment(1),
          totalSpent: increment(amount),
        });
      } catch { /* non-critical */ }
    }
  } catch { /* will sync later */ }
}

// ─────────────────────── BUDDIES ───────────────────────

export { Buddy, BuddyRole };

export async function getBuddies(ownerUid: string): Promise<Buddy[]> {
  // Read only from local SQLite — pullFromFirestore already synced Firestore → SQLite.
  // Fetching from Firestore here would overwrite local role/tripId changes made mid-session.
  return getLocalBuddies(ownerUid);
}

export async function addBuddy(
  ownerUid: string,
  email: string,
  role: BuddyRole,
  tripIds: string[] = [],
): Promise<void> {
  const localId = genLocalId();
  await upsertLocalBuddy(ownerUid, localId, email, role, null, tripIds);
  try {
    const ref = await addDoc(collection(firestoreDb, `users/${ownerUid}/buddies`), {
      email,
      role,
      tripIds,
      addedAt: new Date().toISOString(),
    });
    await updateLocalBuddyFirestoreId(localId, ref.id);
    const auth = (await import('firebase/auth')).getAuth(firebaseApp);
    await setDoc(doc(firestoreDb, `buddyIndex/${email}/owners/${ownerUid}`), {
      role,
      tripIds,
      ownerEmail: auth.currentUser?.email ?? '',
    });
  } catch { /* will sync later */ }
}

export async function removeBuddy(
  ownerUid: string,
  buddyId: string,
  firestoreId?: string | null,
  buddyEmail?: string,
): Promise<void> {
  await deleteLocalBuddy(buddyId);
  const target = firestoreId ?? buddyId;
  try {
    await deleteDoc(doc(firestoreDb, `users/${ownerUid}/buddies/${target}`));
  } catch { /* offline */ }
  if (buddyEmail) {
    try {
      await deleteDoc(doc(firestoreDb, `buddyIndex/${buddyEmail}/owners/${ownerUid}`));
    } catch { /* offline */ }
  }
}

export async function updateBuddyRole(
  ownerUid: string,
  buddyId: string,
  role: BuddyRole,
  firestoreId?: string | null,
  buddyEmail?: string,
  tripIds?: string[],
): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE buddies SET role = ? WHERE id = ?', [role, buddyId]);
  if (tripIds !== undefined) {
    await updateLocalBuddyTripIds(buddyId, tripIds);
  }
  const target = firestoreId ?? buddyId;
  try {
    await updateDoc(doc(firestoreDb, `users/${ownerUid}/buddies/${target}`), {
      role,
      ...(tripIds !== undefined ? { tripIds } : {}),
    });
  } catch { /* offline */ }
  if (buddyEmail) {
    try {
      const auth = (await import('firebase/auth')).getAuth(firebaseApp);
      const existingSnap = await (async () => {
        try {
          const { getDoc } = await import('firebase/firestore');
          return await getDoc(doc(firestoreDb, `buddyIndex/${buddyEmail}/owners/${ownerUid}`));
        } catch { return null; }
      })();
      const existingTripIds = existingSnap?.data()?.tripIds ?? [];
      await setDoc(doc(firestoreDb, `buddyIndex/${buddyEmail}/owners/${ownerUid}`), {
        role,
        tripIds: tripIds ?? existingTripIds,
        ownerEmail: auth.currentUser?.email ?? '',
      });
    } catch { /* offline */ }
  }
}

// ─────────────────────── TRIPS ───────────────────────

export async function getUserTrips(uid: string): Promise<Trip[]> {
  return getLocalTrips(uid);
}

export async function addUserTrip(uid: string, data: Record<string, unknown>): Promise<string> {
  const localId = genLocalId();
  await upsertLocalTrip(uid, localId, data as Record<string, any>, false, null);
  await addToSyncQueue('create', 'trip', localId, { ...data as Record<string, any>, uid });

  // Best-effort immediate sync
  try {
    const ref = await addDoc(collection(firestoreDb, `users/${uid}/trips`), data);
    await markSynced('trip', localId, ref.id);
    await removeSyncEntryByLocalId(localId);
  } catch (err) {
    // Log do erro para diagnóstico
    if (typeof console !== 'undefined' && console.error) {
      console.error('Erro ao gravar trip no Firestore:', err);
    }
    // will sync later via queue
  }
  return localId;
}

export async function updateUserTrip(
  uid: string,
  localId: string,
  data: Record<string, unknown>,
  firestoreId?: string | null,
): Promise<void> {
  await updateLocalTripFields(localId, data as Record<string, any>);
  if (!firestoreId) {
    // Trip not yet in Firestore — queue the update for later
    await addToSyncQueue('update', 'trip', localId, { ...data as Record<string, any>, uid });
    return;
  }
  try {
    await updateDoc(doc(firestoreDb, `users/${uid}/trips/${firestoreId}`), data as any);
  } catch {
    await addToSyncQueue('update', 'trip', localId, { ...data as Record<string, any>, uid });
  }
}

export async function deleteUserTrip(
  uid: string,
  localId: string,
  firestoreId?: string | null,
): Promise<void> {
  await deleteLocalTrip(localId);
  if (!firestoreId) {
    // Trip not yet in Firestore — queue the delete so it runs when synced
    await addToSyncQueue('delete', 'trip', localId, { uid });
    return;
  }
  try {
    await deleteDoc(doc(firestoreDb, `users/${uid}/trips/${firestoreId}`));
  } catch {
    await addToSyncQueue('delete', 'trip', localId, { uid });
  }
}

// ─────────────────────── TRIP ITEMS ───────────────────────

export async function getTripItems(uid: string, tripId: string): Promise<TripItem[]> {
  return getLocalTripItems(uid, tripId);
}

export async function addTripItem(
  uid: string,
  tripId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const localId = genLocalId();
  await upsertLocalTripItem(uid, tripId, localId, data as Record<string, any>, false, null);
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ firestoreId: string | null }>(
      'SELECT firestoreId FROM trips WHERE id = ?', [tripId],
    );
    const tripFirestoreId = row?.firestoreId ?? null;
    if (tripFirestoreId) {
      const ref = await addDoc(
        collection(firestoreDb, `users/${uid}/trips/${tripFirestoreId}/items`),
        data,
      );
      await markSynced('trip_item', localId, ref.id);
    }
  } catch { /* offline */ }
}

export async function updateTripItem(
  uid: string,
  tripId: string,
  localItemId: string,
  data: Record<string, unknown>,
  firestoreItemId?: string | null,
): Promise<void> {
  await updateLocalTripItemFields(localItemId, data as Record<string, any>);
  if (firestoreItemId) {
    try {
      const db = await getDb();
      const row = await db.getFirstAsync<{ firestoreId: string | null }>(
        'SELECT firestoreId FROM trips WHERE id = ?', [tripId],
      );
      const tripFirestoreId = row?.firestoreId ?? null;
      if (tripFirestoreId) {
        await updateDoc(
          doc(firestoreDb, `users/${uid}/trips/${tripFirestoreId}/items/${firestoreItemId}`),
          data as any,
        );
      }
    } catch { /* offline */ }
  }
}

export async function deleteTripItem(
  uid: string,
  tripId: string,
  localItemId: string,
  firestoreItemId?: string | null,
): Promise<void> {
  await deleteLocalTripItem(localItemId);
  if (firestoreItemId) {
    try {
      const db = await getDb();
      const row = await db.getFirstAsync<{ firestoreId: string | null }>(
        'SELECT firestoreId FROM trips WHERE id = ?', [tripId],
      );
      const tripFirestoreId = row?.firestoreId ?? null;
      if (tripFirestoreId) {
        await deleteDoc(
          doc(firestoreDb, `users/${uid}/trips/${tripFirestoreId}/items/${firestoreItemId}`),
        );
      }
    } catch { /* offline */ }
  }
}
