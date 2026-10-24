// IndexedDB 存取層
const DB_NAME = 'portfolio-site';
const DB_VERSION = 2;
const STORES = ['novels', 'images', 'albums', 'diaries', 'crafts', 'categories', 'settings', 'progress', 'trash', 'files'];

let _db;
export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const os = t.objectStore(store);
    const out = fn(os);
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
  }));
}

function promisify(req) {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

export const db = {
  put: (store, obj) => openDB().then(d => promisify(d.transaction(store, 'readwrite').objectStore(store).put(obj))),
  get: (store, id) => openDB().then(d => promisify(d.transaction(store).objectStore(store).get(id))),
  del: (store, id) => openDB().then(d => promisify(d.transaction(store, 'readwrite').objectStore(store).delete(id))),
  all: (store) => openDB().then(d => promisify(d.transaction(store).objectStore(store).getAll())),
  clear: (store) => openDB().then(d => promisify(d.transaction(store, 'readwrite').objectStore(store).clear())),
  bulkPut: (store, arr) => tx(store, 'readwrite', os => { for (const o of arr) os.put(o); }),
};
