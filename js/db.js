// IndexedDB 存取層
import { WS } from './workspace.js';
// 每個人的空間各用一個資料庫，資料互不相混
const DB_NAME = WS ? 'portfolio-site@' + WS : 'portfolio-site';
const DB_VERSION = 3;
const STORES = ['novels', 'images', 'albums', 'diaries', 'crafts', 'books', 'categories', 'settings', 'progress', 'trash', 'files'];

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

// ---- 多裝置同步 ----
// 會同步的資料：每次在本機寫入都蓋上版本時間 _rev，並通知「資料變了」（sync.js 會自動上傳）
// 刪除時留下墓碑，別台裝置讀到後也會刪掉；從雲端套用資料時用 putRaw/delRaw，不蓋章、不通知
export const SYNCED = ['novels', 'images', 'albums', 'diaries', 'crafts', 'books', 'categories'];
export const notifyChange = () => { if (typeof dispatchEvent === 'function') dispatchEvent(new CustomEvent('data-changed')); };
const rawPut = (store, obj) => openDB().then(d => promisify(d.transaction(store, 'readwrite').objectStore(store).put(obj)));
const rawDel = (store, id) => openDB().then(d => promisify(d.transaction(store, 'readwrite').objectStore(store).delete(id)));
async function addTombstone(store, id) {
  const t = (await openDB().then(d => promisify(d.transaction('settings').objectStore('settings').get('tombstones')))) || { id: 'tombstones', list: [] };
  t.list = [...t.list.filter(x => !(x.s === store && x.id === id)), { s: store, id, at: Date.now() }].slice(-3000);
  await rawPut('settings', t);
}

export const db = {
  put: async (store, obj) => {
    if (!SYNCED.includes(store)) return rawPut(store, obj);
    const r = await rawPut(store, { ...obj, _rev: Date.now() });
    notifyChange();
    return r;
  },
  putRaw: rawPut,
  get: (store, id) => openDB().then(d => promisify(d.transaction(store).objectStore(store).get(id))),
  del: async (store, id) => {
    const r = await rawDel(store, id);
    if (SYNCED.includes(store)) { await addTombstone(store, id); notifyChange(); }
    return r;
  },
  delRaw: rawDel,
  all: (store) => openDB().then(d => promisify(d.transaction(store).objectStore(store).getAll())),
  clear: (store) => openDB().then(d => promisify(d.transaction(store, 'readwrite').objectStore(store).clear())),
  bulkPut: (store, arr) => tx(store, 'readwrite', os => { for (const o of arr) os.put(o); }),
};
