import { firebaseApp } from '@/firebaseInit';
import { addDoc, collection, deleteDoc, doc, getFirestore, increment, updateDoc } from 'firebase/firestore';
import {
    addToSyncQueue,
    deleteLocalDayPlan,
    deleteLocalDayPlanItem,
    deleteLocalPlace,
    genLocalId,
    getLocalDayPlanItems,
    getLocalDayPlans,
    getLocalPlaces,
    getPlanFirestoreId,
    markSynced,
    removeSyncEntryByLocalId,
    updateLocalDayPlanFields,
    updateLocalDayPlanItemFields,
    updateLocalPlaceFields,
    updateLocalPlanTotals,
    upsertLocalDayPlan,
    upsertLocalDayPlanItem,
    upsertLocalPlace
} from './localDb';

const firestoreDb = getFirestore(firebaseApp);

export type DayPlanSource = 'user' | 'root';

export type DayPlan = {
  id: string;
  firestoreId?: string | null;
  title?: string;
  date?: string;
  notes?: string;
  createdAt?: string;
  itemCount?: number;
  totalSpent?: number;
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
  _source: DayPlanSource;
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ PLACES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getUserPlaces(uid: string) {
  return getLocalPlaces(uid);
}

export async function addUserPlace(uid: string, data: Record<string, unknown>) {
  const localId = genLocalId();
  await upsertLocalPlace(uid, localId, data as Record<string, any>, false, null);
  await addToSyncQueue('create', 'place', localId, { ...data });

  // Best-effort immediate sync
  try {
    const ref = await addDoc(collection(firestoreDb, `users/${uid}/places`), data);
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
  const target = firestoreId ?? placeId;
  try {
    await updateDoc(doc(firestoreDb, `users/${uid}/places/${target}`), data as any);
  } catch { /* offline — TODO: queue update */ }
}

export async function deleteUserPlace(
  uid: string,
  placeId: string,
  firestoreId?: string | null,
) {
  await deleteLocalPlace(placeId);
  if (firestoreId) {
    try {
      await deleteDoc(doc(firestoreDb, `users/${uid}/places/${firestoreId}`));
    } catch { /* offline — TODO: queue delete */ }
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ DAY PLANS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getUserDayPlans(uid: string): Promise<DayPlan[]> {
  return getLocalDayPlans(uid);
}

export async function addUserDayPlan(uid: string, data: Record<string, unknown>) {
  const localId = genLocalId();
  await upsertLocalDayPlan(uid, localId, data as Record<string, any>, false, null);
  await addToSyncQueue('create', 'day_plan', localId, { ...data });

  // Best-effort immediate sync
  try {
    const ref = await addDoc(collection(firestoreDb, `users/${uid}/day_plans`), data);
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

export async function deleteUserDayPlan(uid: string, localId: string, firestoreId?: string | null) {
  await deleteLocalDayPlan(localId);
  await addToSyncQueue('delete', 'day_plan', localId, {});
  if (firestoreId) {
    try {
      await deleteDoc(doc(firestoreDb, `users/${uid}/day_plans/${firestoreId}`));
    } catch { /* will sync later */ }
  }
}

export async function updateUserDayPlan(
  uid: string,
  localId: string,
  data: { title?: string; date?: string; notes?: string },
  firestoreId?: string | null,
) {
  await updateLocalDayPlanFields(localId, data);
  await addToSyncQueue('update', 'day_plan', localId, data);
  if (firestoreId) {
    try {
      await updateDoc(doc(firestoreDb, `users/${uid}/day_plans/${firestoreId}`), data);
    } catch { /* will sync later */ }
  }
}

export async function deleteDayPlanItem(
  uid: string,
  dayPlanLocalId: string,
  itemLocalId: string,
  itemFirestoreId?: string | null,
) {
  await deleteLocalDayPlanItem(itemLocalId);
  await updateLocalPlanTotals(dayPlanLocalId);
  await addToSyncQueue('delete', 'day_plan_item', itemLocalId, {});
  if (itemFirestoreId) {
    try {
      const planFirestoreId = await getPlanFirestoreId(dayPlanLocalId);
      if (planFirestoreId) {
        await deleteDoc(
          doc(firestoreDb, `users/${uid}/day_plans/${planFirestoreId}/items/${itemFirestoreId}`),
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
  await updateLocalDayPlanItemFields(itemLocalId, data);
  await updateLocalPlanTotals(dayPlanLocalId);
  await addToSyncQueue('update', 'day_plan_item', itemLocalId, data);
  if (itemFirestoreId) {
    try {
      const planFirestoreId = await getPlanFirestoreId(dayPlanLocalId);
      if (planFirestoreId) {
        await updateDoc(
          doc(firestoreDb, `users/${uid}/day_plans/${planFirestoreId}/items/${itemFirestoreId}`),
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
        collection(firestoreDb, `users/${uid}/day_plans/${planFirestoreId}/items`),
        data,
      );
      await markSynced('day_plan_item', localId, ref.id);
      await removeSyncEntryByLocalId(localId);
      // Update Firestore plan totals
      const amount = typeof data.amountSpent === 'number' ? data.amountSpent : 0;
      try {
        await updateDoc(doc(firestoreDb, `users/${uid}/day_plans/${planFirestoreId}`), {
          itemCount: increment(1),
          totalSpent: increment(amount),
        });
      } catch { /* non-critical */ }
    }
  } catch { /* will sync later */ }
}

