/**
 * Versioned IndexedDB persistence for explicitly supported offline workflows.
 * Every record is scoped by user ID, and identity changes purge other users'
 * records. Never stores credentials or tokens; Supabase keeps its session in
 * cookies, not here.
 *
 * v1: outbox (pending mutations), drafts (unsaved editors), cache (saved routes).
 */
export const DB_NAME = 'kindamoving';
export const DB_VERSION = 1;
export type StoreName = 'outbox' | 'drafts' | 'cache';

let opening: Promise<IDBDatabase> | null = null;
export function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined')
    return Promise.reject(new Error('IndexedDB unavailable'));
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      // Migrations are additive per version; never drop user data silently.
      if (e.oldVersion < 1) {
        db.createObjectStore('outbox', { keyPath: 'id' }).createIndex(
          'user',
          'userId',
        );
        db.createObjectStore('drafts', { keyPath: 'key' }).createIndex(
          'user',
          'userId',
        );
        db.createObjectStore('cache', { keyPath: 'key' }).createIndex(
          'user',
          'userId',
        );
      }
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => {
        req.result.close();
        opening = null;
      };
      resolve(req.result);
    };
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  return opening;
}

function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}
export const put = <T extends { userId: string }>(store: StoreName, value: T) =>
  run(store, 'readwrite', (s) => s.put(value));
export const get = <T>(store: StoreName, key: string) =>
  run<T | undefined>(
    store,
    'readonly',
    (s) => s.get(key) as IDBRequest<T | undefined>,
  );
export const del = (store: StoreName, key: string) =>
  run(store, 'readwrite', (s) => s.delete(key));
export const allFor = <T>(store: StoreName, userId: string) =>
  run<T[]>(
    store,
    'readonly',
    (s) => s.index('user').getAll(IDBKeyRange.only(userId)) as IDBRequest<T[]>,
  );

/** Remove every record not belonging to `keepUserId` (or everything when null): shared-device privacy. */
export async function purgeOtherUsers(keepUserId: string | null) {
  // Signing out (null) also drops service-worker page caches, which may hold personalised HTML.
  if (
    keepUserId === null &&
    typeof navigator !== 'undefined' &&
    navigator.serviceWorker?.controller
  )
    navigator.serviceWorker.controller.postMessage('purge');
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return;
  }
  await Promise.all(
    (['outbox', 'drafts', 'cache'] as StoreName[]).map(
      (name) =>
        new Promise<void>((resolve) => {
          const tx = db.transaction(name, 'readwrite');
          const cursor = tx.objectStore(name).openCursor();
          cursor.onsuccess = () => {
            const c = cursor.result;
            if (!c) return;
            if ((c.value as { userId?: string }).userId !== keepUserId)
              c.delete();
            c.continue();
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        }),
    ),
  );
}
