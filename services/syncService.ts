import { firebaseApp } from '@/firebaseInit';
import { getAuth } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDocs, getFirestore, setDoc, updateDoc } from 'firebase/firestore';
import {
    clearBuddyOwners,
    getFirestoreId,
    getLocalBuddies,
    getPlanFirestoreId,
    getSyncQueue,
    incrementSyncRetry,
    markSynced,
    removeSyncEntry,
    updateLocalBuddyFirestoreId,
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

          // Pull trips compartilhadas com este buddy
          // tripIds do buddyIndex são os IDs das trips permitidas (local ou firestoreId)
          try {
            const ownerTripsSnap = await getDocs(collection(firestoreDb, `users/${ownerUid}/trips`));
            for (const tripDoc of ownerTripsSnap.docs) {
              // Inclui a trip se seu firestoreId (tripDoc.id) está na lista OU
              // se qualquer entry de tripIds coincide (cobre o caso de local vs firestore IDs)
              if (tripIds.length > 0 && !tripIds.includes(tripDoc.id)) continue;
              await upsertLocalTrip(uid, tripDoc.id, tripDoc.data() as Record<string, any>, true, tripDoc.id, ownerUid);
            }
          } catch { /* no access or offline */ }

          // Pull locais — sem filtro de tripId no app (Firestore Rules já garantem acesso)
          try {
            const placesSnap = await getDocs(collection(firestoreDb, `users/${ownerUid}/places`));
            for (const d of placesSnap.docs) {
              const placeData = d.data() as Record<string, any>;
              await upsertLocalPlace(uid, d.id, { ...placeData, ownerUid }, true, d.id);
            }
          } catch { /* no access or offline */ }

          // Pull day plans + seus items — sem filtro de tripId no app
          try {
            const plansSnap = await getDocs(collection(firestoreDb, `users/${ownerUid}/day_plans`));
            for (const planDoc of plansSnap.docs) {
              const planData = planDoc.data() as Record<string, any>;
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
  await syncPendingBuddies(uid);

  const queue = await getSyncQueue();
  if (queue.length === 0) return 0;

  const MAX_RETRIES = 5;

  // Deduplicate: for the same (entity, localId), keep only the last update/create.
  // Deletes are always kept.
  const deduped = (() => {
    const seen = new Map<string, typeof queue[number]>();
    for (const entry of queue) {
      if (entry.operation === 'delete') continue; // handled separately below
      const key = `${entry.entity}:${entry.localId}`;
      const existing = seen.get(key);
      if (!existing || entry.createdAt > existing.createdAt) {
        seen.set(key, entry);
      }
    }
    const deletes = queue.filter((e) => e.operation === 'delete');
    return [...seen.values(), ...deletes];
  })();

  // Remove queue entries that were collapsed by deduplication
  const dedupedIds = new Set(deduped.map((e) => e.id));
  for (const entry of queue) {
    if (!dedupedIds.has(entry.id)) {
      await removeSyncEntry(entry.id);
    }
  }

  // Process in dependency order: places → day_plans → day_plan_items
  const ORDER: Record<string, number> = { place: 0, day_plan: 1, day_plan_item: 2 };
  const sorted = [...deduped].sort(
    (a, b) => (ORDER[a.entity] ?? 3) - (ORDER[b.entity] ?? 3),
  );

  let synced = 0;

  for (const entry of sorted) {
    if (entry.retryCount >= MAX_RETRIES) {
      // Dead-letter: too many failures, remove to prevent infinite growth
      console.warn('[SyncService] Dropping entry after max retries', entry.id, entry.entity, entry.localId);
      await removeSyncEntry(entry.id);
      continue;
    }
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
      console.warn('[SyncService] Failed to sync entry', entry.id, err);
      await incrementSyncRetry(entry.id);
    }
  }

  return synced;
}

/**
 * Re-syncs any buddies that were added offline and never reached Firestore.
 * Runs as part of push to guarantee buddyIndex is always created.
 */
async function syncPendingBuddies(uid: string): Promise<void> {
  const ownerEmail = getAuth(firebaseApp).currentUser?.email ?? '';
  const buddies = await getLocalBuddies(uid);

  for (const buddy of buddies) {
    try {
      if (!buddy.firestoreId) {
        const ref = await addDoc(collection(firestoreDb, `users/${uid}/buddies`), {
          email: buddy.email,
          role: buddy.role,
          tripIds: buddy.tripIds ?? [],
          addedAt: buddy.addedAt ?? new Date().toISOString(),
        });
        await updateLocalBuddyFirestoreId(buddy.id, ref.id);
        buddy.firestoreId = ref.id;
      }
      // Always keep buddyIndex in sync (idempotent)
      await setDoc(doc(firestoreDb, `buddyIndex/${buddy.email}/owners/${uid}`), {
        role: buddy.role,
        tripIds: buddy.tripIds ?? [],
        ownerEmail,
      });
    } catch {
      // Network error — retries on next pushQueueToFirestore call
    }
  }
}

/** Push pending queue, then pull fresh data from Firestore. */
export async function syncAll(uid: string): Promise<void> {
  await pushQueueToFirestore(uid);
  await pullFromFirestore(uid);
}
