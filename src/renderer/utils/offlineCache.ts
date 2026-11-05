/**
 * Offline cache using IndexedDB.
 * Caches shared events and personal events for offline viewing.
 */

const DB_NAME = 'tonet_cache';
const DB_VERSION = 1;

const STORES = {
  events: 'events',
  personalEvents: 'personalEvents',
  meta: 'meta',
} as const;

const PERSONAL_OWNER_KEY = 'personal_owner';

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    try {
      // 연결이 살아있는지 확인
      dbInstance.transaction(STORES.meta, 'readonly');
      return Promise.resolve(dbInstance);
    } catch {
      dbInstance = null;
    }
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.events)) {
        db.createObjectStore(STORES.events, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.personalEvents)) {
        db.createObjectStore(STORES.personalEvents, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onclose = () => { dbInstance = null; };
      resolve(dbInstance);
    };
    request.onerror = () => reject(request.error);
  });
}

function serializeDate(obj: any): any {
  if (obj instanceof Date) return { __date: obj.toISOString() };
  if (Array.isArray(obj)) return obj.map(serializeDate);
  if (obj && typeof obj === 'object') {
    const out: any = {};
    for (const k of Object.keys(obj)) out[k] = serializeDate(obj[k]);
    return out;
  }
  return obj;
}

function deserializeDate(obj: any): any {
  if (obj && typeof obj === 'object' && '__date' in obj) return new Date(obj.__date);
  if (Array.isArray(obj)) return obj.map(deserializeDate);
  if (obj && typeof obj === 'object') {
    const out: any = {};
    for (const k of Object.keys(obj)) out[k] = deserializeDate(obj[k]);
    return out;
  }
  return obj;
}

async function putAll(storeName: string, items: any[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  store.clear();
  for (const item of items) {
    store.put(serializeDate(item));
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  const request = store.getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve((request.result || []).map(deserializeDate));
    request.onerror = () => reject(request.error);
  });
}

// ---- Public API ----

export async function cacheEvents(events: any[]): Promise<void> {
  try {
    await putAll(STORES.events, events);
    await setMeta('events_cached_at', Date.now());
  } catch (e) {
    console.warn('Failed to cache events:', e);
  }
}

export async function getCachedEvents<T>(): Promise<T[]> {
  try {
    return await getAll<T>(STORES.events);
  } catch {
    return [];
  }
}

/**
 * 공용 PC에서 다음 교사에게 앞 교사의 개인 일정이 보이면 안 된다.
 * 내용과 주인 표시를 한 번에 바꿔, 중간에 꺼져도 다른 사람 이름으로 남지 않게 한다.
 */
export async function cachePersonalEvents(userId: string, events: any[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORES.personalEvents, STORES.meta], 'readwrite');
    const store = tx.objectStore(STORES.personalEvents);
    store.clear();
    for (const item of events) store.put(serializeDate(item));
    const meta = tx.objectStore(STORES.meta);
    meta.put({ key: PERSONAL_OWNER_KEY, value: userId });
    meta.put({ key: 'personal_cached_at', value: Date.now() });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Failed to cache personal events:', e);
  }
}

/** 이 사람이 저장한 것만 돌려준다. 주인 표시가 없는 예전 캐시는 쓰지 않는다 */
export async function getCachedPersonalEvents<T>(userId: string): Promise<T[]> {
  try {
    if ((await getMeta(PERSONAL_OWNER_KEY)) !== userId) return [];
    return await getAll<T>(STORES.personalEvents);
  } catch {
    return [];
  }
}

/** 로그아웃하면 이 PC에 개인 일정을 남기지 않는다 */
export async function clearPersonalCache(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction([STORES.personalEvents, STORES.meta], 'readwrite');
  tx.objectStore(STORES.personalEvents).clear();
  tx.objectStore(STORES.meta).delete(PERSONAL_OWNER_KEY);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function setMeta(key: string, value: any): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORES.meta, 'readwrite');
  tx.objectStore(STORES.meta).put({ key, value });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMeta(key: string): Promise<any> {
  const db = await openDB();
  const tx = db.transaction(STORES.meta, 'readonly');
  const request = tx.objectStore(STORES.meta).get(key);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result?.value ?? null);
    request.onerror = () => reject(request.error);
  });
}
