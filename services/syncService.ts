import { firebaseApp } from '@/firebaseInit';
import { getAuth } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDocs, getFirestore, updateDoc } from 'firebase/firestore';
import {
    clearBuddyOwners,
    getFirestoreId,
    getPlanFirestoreId,
    getSyncQueue,
    markSynced,
    removeSyncEntry,
    upsertBuddyOwner,
    upsertLocalDayPlan,
    upsertLocalDayPlanItem,
    upsertLocalPlace,
    upsertLocalTrip,
    upsertLocalTripItem,
} from './localDb';

const firestoreDb = getFirestore(firebaseApp);

// Lock para evitar pulls simultâneos (race condition → duplicatas)
let _pulling = false;

/** Pull all Firestore data into SQLite (used on first login and manual refresh). */
export async function pullFromFirestore(uid: string): Promise<void> {
  if (_pulling) return;
  _pulling = true;
  try {
    // Own trips + their items
    try {
      const tripsSnap = await getDocs(collection(firestoreDb, `users/${uid}/trips`));
      for (const tripDoc of tripsSnap.docs) {
        await upsertLocalTrip(uid, tripDoc.id, tripDoc.data() as Record<string, any>, true, tripDoc.id);
        try {
          const itemsSnap = await getDocs(
            collection(firestoreDb, `users/${uid}/trips/${tripDoc.id}/items`),
          );
          for (const itemDoc of itemsSnap.docs) {
            await upsertLocalTripItem(uid, tripDoc.id, itemDoc.id, itemDoc.data() as Record<string, any>, true, itemDoc.id);
          }
        } catch { /* ignore */ }
      }
    } catch { /* offline */ }

    // Own places
    try {
      const snap = await getDocs(collection(firestoreDb, `users/${uid}/places`));
      for (const d of snap.docs) {
        await upsertLocalPlace(uid, d.id, d.data() as Record<string, any>, true, d.id);
      }
    } catch {
      // Permission denied or offline — ignore
    }

    // Own day plans + their items
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

    // Buddy owners' data — look up all owners who added the current user as a buddy
    const myEmail = getAuth(firebaseApp).currentUser?.email;
    if (myEmail) {
      await clearBuddyOwners();
      try {
        const ownersSnap = await getDocs(
          collection(firestoreDb, `buddyIndex/${myEmail}/owners`),
        );
        for (const ownerDoc of ownersSnap.docs) {
          const ownerUid = ownerDoc.id;
          const ownerData = ownerDoc.data();
          const ownerEmail: string = ownerData.ownerEmail ?? '';
          const role: 'admin' | 'user' = ownerData.role === 'admin' ? 'admin' : 'user';
          const tripIds: string[] = Array.isArray(ownerData.tripIds) ? ownerData.tripIds : [];
          await upsertBuddyOwner(ownerUid, ownerEmail, role, tripIds);

          // Só puxa dados das viagens às quais o buddy foi adicionado
          if (tripIds.length === 0) continue;

          // Pull locais filtrados pelo tripId
          try {
            const placesSnap = await getDocs(collection(firestoreDb, `users/${ownerUid}/places`));
            for (const d of placesSnap.docs) {
              const placeData = d.data() as Record<string, any>;
              if (!tripIds.includes(placeData.tripId)) continue;
              await upsertLocalPlace(uid, d.id, { ...placeData, ownerUid }, true, d.id);
            }
          } catch { /* no access or offline */ }

          // Pull day plans filtrados pelo tripId + seus items
          try {
            const plansSnap = await getDocs(collection(firestoreDb, `users/${ownerUid}/day_plans`));
            for (const planDoc of plansSnap.docs) {
              const planData = planDoc.data() as Record<string, any>;
              if (!tripIds.includes(planData.tripId)) continue;
              await upsertLocalDayPlan(
                uid, planDoc.id,
                { ...planData, _source: 'root', ownerUid },
                true, planDoc.id,
              );
              try {
                const itemsSnap = await getDocs(
                  collection(firestoreDb, `users/${ownerUid}/day_plans/${planDoc.id}/items`),
                );
                for (const itemDoc of itemsSnap.docs) {
                  await upsertLocalDayPlanItem(
                    uid, planDoc.id, itemDoc.id,
                    { ...itemDoc.data(), _source: 'root', ownerUid } as Record<string, any>,
                    true, itemDoc.id,
                  );
                }
              } catch { /* ignore */ }
            }
          } catch { /* no access or offline */ }
        }
      } catch { /* buddyIndex not accessible or offline */ }
    }
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
    try {
      const { _dayPlanLocalId, uid: _uid, ...payload } = entry.payload;

      if (entry.operation === 'delete') {
        // Handle deletes
        if (entry.entity === 'trip') {
          const fsId = await getFirestoreId('trip', entry.localId);
          if (fsId) await deleteDoc(doc(firestoreDb, `users/${uid}/trips/${fsId}`));
        } else if (entry.entity === 'place') {
          const fsId = await getFirestoreId('place', entry.localId);
          if (fsId) await deleteDoc(doc(firestoreDb, `users/${uid}/places/${fsId}`));
        } else if (entry.entity === 'day_plan') {
          const fsId = await getPlanFirestoreId(entry.localId);
          if (fsId) await deleteDoc(doc(firestoreDb, `users/${uid}/day_plans/${fsId}`));
        } else if (entry.entity === 'day_plan_item') {
          const planFirestoreId = await getPlanFirestoreId(_dayPlanLocalId as string);
          const fsId = await getFirestoreId('day_plan_item', entry.localId);
          if (planFirestoreId && fsId) {
            await deleteDoc(doc(firestoreDb, `users/${uid}/day_plans/${planFirestoreId}/items/${fsId}`));
          }
        }
        await removeSyncEntry(entry.id);
        synced++;
        continue;
      }

      if (entry.operation === 'update') {
        // Handle updates
        if (entry.entity === 'trip') {
          const fsId = await getFirestoreId('trip', entry.localId);
          if (fsId) await updateDoc(doc(firestoreDb, `users/${uid}/trips/${fsId}`), payload);
        } else if (entry.entity === 'day_plan') {
          const fsId = await getPlanFirestoreId(entry.localId);
          if (fsId) await updateDoc(doc(firestoreDb, `users/${uid}/day_plans/${fsId}`), payload);
        } else if (entry.entity === 'day_plan_item') {
          const planFirestoreId = await getPlanFirestoreId(_dayPlanLocalId as string);
          const fsId = await getFirestoreId('day_plan_item', entry.localId);
          if (planFirestoreId && fsId) {
            await updateDoc(doc(firestoreDb, `users/${uid}/day_plans/${planFirestoreId}/items/${fsId}`), payload);
          }
        }
        await removeSyncEntry(entry.id);
        synced++;
        continue;
      }

      // Handle creates
      if (entry.entity === 'trip') {
        const ref = await addDoc(collection(firestoreDb, `users/${uid}/trips`), payload);
        await markSynced('trip', entry.localId, ref.id);
      } else if (entry.entity === 'place') {
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
