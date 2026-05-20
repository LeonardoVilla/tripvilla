import * as SQLite from 'expo-sqlite';

let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!_dbPromise) {
    _dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('tripvilla.db');

      await db.execAsync(`PRAGMA journal_mode = WAL;`);

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS places (
          id TEXT PRIMARY KEY,
          uid TEXT NOT NULL,
          name TEXT,
          location TEXT,
          openTime TEXT,
          closeTime TEXT,
          travelTime TEXT,
          transport TEXT,
          createdAt TEXT,
          synced INTEGER DEFAULT 0,
          firestoreId TEXT
        );
      `);

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS day_plans (
          id TEXT PRIMARY KEY,
          uid TEXT NOT NULL,
          title TEXT,
          date TEXT,
          notes TEXT,
          itemCount INTEGER DEFAULT 0,
          totalSpent REAL DEFAULT 0,
          createdAt TEXT,
          synced INTEGER DEFAULT 0,
          firestoreId TEXT,
          source TEXT DEFAULT 'user'
        );
      `);

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS day_plan_items (
          id TEXT PRIMARY KEY,
          uid TEXT NOT NULL,
          dayPlanId TEXT NOT NULL,
          placeId TEXT,
          placeName TEXT,
          placeLocation TEXT,
          arrivalTime TEXT,
          leaveTime TEXT,
          amountSpent REAL DEFAULT 0,
          notes TEXT,
          addedAt TEXT,
          synced INTEGER DEFAULT 0,
          firestoreId TEXT,
          source TEXT DEFAULT 'user'
        );
      `);

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS pending_sync (
          id TEXT PRIMARY KEY,
          operation TEXT NOT NULL,
          entity TEXT NOT NULL,
          localId TEXT NOT NULL,
          payload TEXT NOT NULL,
          createdAt TEXT NOT NULL
        );
      `);

      // Remove duplicatas geradas por race condition:
      // Quando pullFromFirestore criou um segundo registro com id=firestoreId,
      // sendo que já existia um local com id='local_xxx' e firestoreId=mesmo valor.
      await db.execAsync(`
        DELETE FROM places
        WHERE id = firestoreId
          AND firestoreId IN (
            SELECT firestoreId FROM places
            WHERE id LIKE 'local_%' AND firestoreId IS NOT NULL
          );
      `);
      await db.execAsync(`
        DELETE FROM day_plans
        WHERE id = firestoreId
          AND firestoreId IN (
            SELECT firestoreId FROM day_plans
            WHERE id LIKE 'local_%' AND firestoreId IS NOT NULL
          );
      `);
      await db.execAsync(`
        DELETE FROM day_plan_items
        WHERE id = firestoreId
          AND firestoreId IN (
            SELECT firestoreId FROM day_plan_items
            WHERE id LIKE 'local_%' AND firestoreId IS NOT NULL
          );
      `);

      // Remove sync queue entries for records already synced (firestoreId set)
      // These were left behind by the bug where immediate sync succeeded but didn't remove the queue entry.
      await db.execAsync(`
        DELETE FROM pending_sync
        WHERE operation = 'create'
          AND entity = 'place'
          AND localId IN (SELECT id FROM places WHERE synced = 1 AND firestoreId IS NOT NULL);
      `);
      await db.execAsync(`
        DELETE FROM pending_sync
        WHERE operation = 'create'
          AND entity = 'day_plan'
          AND localId IN (SELECT id FROM day_plans WHERE synced = 1 AND firestoreId IS NOT NULL);
      `);
      await db.execAsync(`
        DELETE FROM pending_sync
        WHERE operation = 'create'
          AND entity = 'day_plan_item'
          AND localId IN (SELECT id FROM day_plan_items WHERE synced = 1 AND firestoreId IS NOT NULL);
      `);

      return db;
    })();
  }
  return _dbPromise;
}
