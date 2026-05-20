import { firebaseApp } from '@/firebaseInit';
import { addDoc, collection, getDocs, getFirestore } from 'firebase/firestore';
import {
    getPlanFirestoreId,
    getSyncQueue,
    markSynced,
    removeSyncEntry,
    upsertLocalDayPlan,
    upsertLocalDayPlanItem,
    upsertLocalPlace,
} from './localDb';

const firestoreDb = getFirestore(firebaseApp);

// Lock para evitar pulls simultâneos (race condition → duplicatas)
let _pulling = false;

/** Pull all Firestore data into SQLite (used on first login and manual refresh). */
export async function pullFromFirestore(uid: string): Promise<void> {
  if (_pulling) return;
  _pulling = true;
  try {
    // Places
    try {
      const snap = await getDocs(collection(firestoreDb, `users/${uid}/places`));
      for (const d of snap.docs) {
        await upsertLocalPlace(uid, d.id, d.data() as Record<string, any>, true, d.id);
      }
    } catch {
      // Permission denied or offline — ignore
    }

    // Day plans + their items
    try {
      const plansSnap = await getDocs(collection(firestoreDb, `users/${uid}/day_plans`));
      for (const planDoc of plansSnap.docs) {
        await upsertLocalDayPlan(
          uid, planDoc.id,
          { ...planDoc.data(), _source: 'user' } as Record<string, any>,
          true, planDoc.id,
        );
        try {
          const itemsSnap = await getDocs(
            collection(firestoreDb, `users/${uid}/day_plans/${planDoc.id}/items`),
          );
          for (const itemDoc of itemsSnap.docs) {
            await upsertLocalDayPlanItem(
              uid, planDoc.id, itemDoc.id,
              { ...itemDoc.data(), _source: 'user' } as Record<string, any>,
              true, itemDoc.id,
            );
          }
        } catch { /* ignore item fetch errors */ }
      }
    } catch { /* ignore */ }
  } finally {
    _pulling = false;
  }
}

/**
 * Process the pending sync queue and push records to Firestore.
 * Returns the number of successfully synced entries.
 */
export async function pushQueueToFirestore(uid: string): Promise<number> {
  const queue = await getSyncQueue();
  if (queue.length === 0) return 0;

  // Process in dependency order: places → day_plans → day_plan_items
  const ORDER: Record<string, number> = { place: 0, day_plan: 1, day_plan_item: 2 };
  const sorted = [...queue].sort(
    (a, b) => (ORDER[a.entity] ?? 3) - (ORDER[b.entity] ?? 3),
  );

  let synced = 0;

  for (const entry of sorted) {
    if (entry.operation !== 'create') {
      // update/delete not yet implemented — remove stale entry
      await removeSyncEntry(entry.id);
      continue;
    }

    try {
      const { _dayPlanLocalId, uid: _uid, ...payload } = entry.payload;

      if (entry.entity === 'place') {
        const ref = await addDoc(collection(firestoreDb, `users/${uid}/places`), payload);
        await markSynced('place', entry.localId, ref.id);
      } else if (entry.entity === 'day_plan') {
        const ref = await addDoc(collection(firestoreDb, `users/${uid}/day_plans`), payload);
        await markSynced('day_plan', entry.localId, ref.id);
      } else if (entry.entity === 'day_plan_item') {
        const planFirestoreId = await getPlanFirestoreId(_dayPlanLocalId as string);
        if (!planFirestoreId) {
          // Parent plan not yet synced — skip, retry next cycle
          continue;
        }
        const ref = await addDoc(
          collection(firestoreDb, `users/${uid}/day_plans/${planFirestoreId}/items`),
          payload,
        );
        await markSynced('day_plan_item', entry.localId, ref.id);
      }

      await removeSyncEntry(entry.id);
      synced++;
    } catch (err) {
      // Network error — leave in queue for next attempt
      console.warn('[SyncService] Failed to sync entry', entry.id, err);
    }
  }

  return synced;
}

/** Push pending queue, then pull fresh data from Firestore. */
export async function syncAll(uid: string): Promise<void> {
  await pushQueueToFirestore(uid);
  await pullFromFirestore(uid);
}
