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

      return db;
    })();
  }
  return _dbPromise;
}
