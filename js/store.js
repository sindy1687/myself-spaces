// 資料層：作品 CRUD、分類、回收筒、設定、匯出匯入、示範資料
import { db } from './db.js';
import { uid, nowISO, blobToDataURL, dataURLToBlob } from './util.js';

export const FORMAT_VERSION = 1;
export const TYPES = { novel: 'novels', image: 'images', diary: 'diaries', craft: 'crafts' };

// ---- 設定 ----
const DEFAULT_SETTINGS = {
  siteName: '我的作品空間', siteDesc: '', theme: 'literary', avatar: '', cover: '',
  primaryColor: '', driveClientId: '', demoLoaded: false,
  gasUrl: 'https://script.google.com/macros/s/AKfycbwdpICzohPVFrd0RGz8FDhFUTpOmBuU55O1zwzy6cfi1weIvsGFe4y0YIcgN371_R3BQw/exec',
  driveFolderId: '1OEQ7Cjq6AK6QAeU1CgaxYN0GjdAaIwdF',
  defaultNovelCover: 'https://i.pinimg.com/1200x/ce/30/eb/ce30ebb9eb6448c6f5e1cb6208a24000.jpg',
  adminUser: 'sindy16872000',
  adminPwHash: '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0',
};
export async function getSettings() {
  const s = await db.get('settings', 'site');
  return { ...DEFAULT_SETTINGS, ...(s?.value || {}) };
}
export async function saveSettings(patch) {
  const cur = await getSettings();
  await db.put('settings', { id: 'site', value: { ...cur, ...patch }, updatedAt: nowISO() });
}

// ---- 分類（多層、欄位完整）----
const CAT_DEFAULTS = {
  type: 'shared', parentId: null, order: 0, slug: '', desc: '', color: '', icon: '', cover: '',
  showHome: true, showNav: false, display: 'cards', archived: false,
};
export async function listCategories(type, { includeArchived = false } = {}) {
  const all = await db.all('categories');
  return all.filter(c => (!type || c.type === type || c.type === 'shared') && (includeArchived || !c.archived))
    .sort((a, b) => a.order - b.order);
}
export async function saveCategory(cat) {
  const c = { ...CAT_DEFAULTS, ...cat, updatedAt: nowISO() };
  if (!c.id) c.id = uid();
  await db.put('categories', c);
  return c;
}
// 批次：對作品集合執行 add/remove/replace/primary
export async function batchCategory(op, catId, { targetId = null, ids = null } = {}) {
  let affected = 0;
  for (const store of Object.values(TYPES)) {
    const items = await db.all(store);
    for (const it of items) {
      if (ids && !ids.includes(it.id)) continue;
      const s = new Set(it.categoryIds || []);
      const had = s.has(catId);
      let changed = false;
      if (op === 'add' && !had) { s.add(catId); changed = true; }
      if (op === 'remove' && had) { s.delete(catId); changed = true; }
      if (op === 'replace' && had) { s.delete(catId); if (targetId) s.add(targetId); changed = true; }
      if (op === 'primary') { it.primaryCategoryId = catId; changed = true; }
      if (changed) { it.categoryIds = [...s]; it.updatedAt = nowISO(); await db.put(store, it); affected++; }
    }
  }
  return affected;
}
export async function deleteCategory(id, { moveTo = null, moveChildrenTo = undefined } = {}) {
  // moveTo: 作品移至目標分類；moveChildrenTo: 子分類目標（undefined=上移一層）
  const cats = await db.all('categories');
  const parent = cats.find(c => c.id === id)?.parentId ?? null;
  for (const store of Object.values(TYPES)) {
    const items = await db.all(store);
    for (const it of items) {
      let changed = false;
      if (it.categoryId === id) { it.categoryId = moveTo; changed = true; }
      if (it.primaryCategoryId === id) { it.primaryCategoryId = moveTo; changed = true; }
      if (Array.isArray(it.categoryIds) && it.categoryIds.includes(id)) {
        it.categoryIds = it.categoryIds.filter(c => c !== id);
        if (moveTo) it.categoryIds.push(moveTo);
        changed = true;
      }
      if (changed) { it.updatedAt = nowISO(); await db.put(store, it); }
    }
  }
  for (const c of cats) {
    if (c.parentId === id) { c.parentId = moveChildrenTo === undefined ? parent : moveChildrenTo; await db.put('categories', c); }
  }
  await db.del('categories', id);
}
export async function mergeCategories(srcId, dstId) {
  for (const store of Object.values(TYPES)) {
    for (const it of await db.all(store)) {
      let changed = false;
      if (Array.isArray(it.categoryIds) && it.categoryIds.includes(srcId)) {
        it.categoryIds = [...new Set([...it.categoryIds.filter(c => c !== srcId), dstId])]; changed = true;
      }
      if (it.categoryId === srcId) { it.categoryId = dstId; changed = true; }
      if (it.primaryCategoryId === srcId) { it.primaryCategoryId = dstId; changed = true; }
      if (changed) { it.updatedAt = nowISO(); await db.put(store, it); }
    }
  }
  for (const c of await db.all('categories')) if (c.parentId === srcId) { c.parentId = dstId; await db.put('categories', c); }
  await db.del('categories', srcId);
}
// 標籤：使用統計、改名、合併、刪除
export async function tagStats() {
  const m = new Map();
  for (const store of Object.values(TYPES))
    for (const it of await db.all(store))
      for (const t of it.tags || []) m.set(t, (m.get(t) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
export async function renameTag(oldName, newName) {
  newName = newName.trim();
  if (!newName) return 0;
  let n = 0;
  for (const store of Object.values(TYPES))
    for (const it of await db.all(store)) {
      if ((it.tags || []).includes(oldName)) {
        it.tags = [...new Set(it.tags.map(t => t === oldName ? newName : t))];
        it.updatedAt = nowISO(); await db.put(store, it); n++;
      }
    }
  return n;
}
export async function deleteTag(name) {
  let n = 0;
  for (const store of Object.values(TYPES))
    for (const it of await db.all(store)) {
      if ((it.tags || []).includes(name)) {
        it.tags = it.tags.filter(t => t !== name);
        it.updatedAt = nowISO(); await db.put(store, it); n++;
      }
    }
  return n;
}
export async function allWorks() {
  const out = [];
  for (const [t, s] of Object.entries(TYPES)) for (const it of await db.all(s)) if (!it.deleted) out.push({ type: t, ...it });
  return out;
}

// ---- 作品通用 ----
export async function list(type) {
  const items = await db.all(TYPES[type]);
  return items.filter(i => !i.deleted).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}
export async function get(type, id) { return db.get(TYPES[type], id); }
export async function save(type, obj) {
  const o = { ...obj, updatedAt: nowISO() };
  if (!o.id) { o.id = uid(); o.createdAt = o.updatedAt; }
  if (o.visibility === undefined) o.visibility = 'private';
  await db.put(TYPES[type], o);
  return o;
}
// 軟刪除 → 回收筒
export async function trash(type, id) {
  const o = await get(type, id);
  if (!o) return;
  o.deleted = true; o.deletedAt = nowISO();
  await db.put(TYPES[type], o);
  await db.put('trash', { id: `${type}:${id}`, type, itemId: id, title: o.title || o.name || '', deletedAt: o.deletedAt });
}
export async function restore(trashId) {
  const t = await db.get('trash', trashId);
  if (!t) return;
  const o = await get(t.type, t.itemId);
  if (o) { delete o.deleted; delete o.deletedAt; await db.put(TYPES[t.type], o); }
  await db.del('trash', trashId);
}
export async function purge(trashId) {
  const t = await db.get('trash', trashId);
  if (!t) return;
  const item = await get(t.type, t.itemId);
  // 一併刪除圖片檔案與編輯版本
  if (item?.fileId) await db.del('files', item.fileId);
  if (item?.origFileId) await db.del('files', item.origFileId);
  for (const v of item?.versions || []) if (v.fileId) await db.del('files', v.fileId);
  await db.del(TYPES[t.type], t.itemId);
  await db.del('trash', trashId);
}
export const listTrash = () => db.all('trash');

// ---- 閱讀進度 / 書籤 ----
export async function saveProgress(novelId, data) {
  await db.put('progress', { id: novelId, ...data, updatedAt: nowISO() });
}
export const getProgress = novelId => db.get('progress', novelId);

// ---- 匯出 / 匯入 ----
export async function exportAll() {
  const out = { formatVersion: FORMAT_VERSION, exportedAt: nowISO(), settings: await getSettings(), categories: await db.all('categories'), novels: [], images: [], albums: await db.all('albums'), diaries: [], progress: await db.all('progress') };
  out.novels = (await db.all('novels')).filter(n => !n.deleted);
  out.diaries = (await db.all('diaries')).filter(d => !d.deleted);
  out.crafts = (await db.all('crafts')).filter(c => !c.deleted);
  // 內文引用的媒體檔案（data-fid）一併匯出
  out.mediaFiles = [];
  const fids = new Set();
  for (const it of [...out.diaries, ...out.crafts])
    for (const m of (it.content || '').matchAll(/data-fid="([^"]+)"/g)) fids.add(m[1]);
  for (const c of (out.settings.customStickers || [])) fids.add(c.fileId);
  for (const c of (out.settings.canvasItems || [])) fids.add(c.fileId);
  for (const fid of fids) {
    const f = await db.get('files', fid);
    if (f) out.mediaFiles.push({ id: fid, data: await blobToDataURL(f.blob) });
  }
  const imgs = (await db.all('images')).filter(i => !i.deleted);
  for (const im of imgs) {
    const blob = await db.get('files', im.fileId);
    const e = { ...im, data: blob ? await blobToDataURL(blob.blob) : null, versions: [] };
    if (im.origFileId) { const ob = await db.get('files', im.origFileId); e.origData = ob ? await blobToDataURL(ob.blob) : null; }
    for (const v of im.versions || []) {
      const vb = await db.get('files', v.fileId);
      e.versions.push({ ...v, data: vb ? await blobToDataURL(vb.blob) : null });
    }
    out.images.push(e);
  }
  return out;
}

export async function importAll(data, { merge = true } = {}) {
  if (data.formatVersion > FORMAT_VERSION) throw new Error(`不支援的備份格式版本 ${data.formatVersion}`);
  // 匯入前檢查：重複 ID、無效上層、循環、失效關聯
  const { validateImport } = await import('./category-utils.js');
  const problems = validateImport(data, new Set((await db.all('categories')).map(c => c.id)));
  if (problems.length) console.warn('匯入檢查', problems);
  if (!merge) for (const s of ['novels','images','albums','diaries','crafts','categories','progress','trash']) await db.clear(s);
  for (const c of data.categories || []) await db.put('categories', c);
  for (const n of data.novels || []) await db.put('novels', n);
  for (const d of data.diaries || []) await db.put('diaries', d);
  for (const c of data.crafts || []) await db.put('crafts', c);
  for (const f of data.mediaFiles || []) if (f.data) await db.put('files', { id: f.id, blob: dataURLToBlob(f.data) });
  for (const a of data.albums || []) await db.put('albums', a);
  for (const p of data.progress || []) await db.put('progress', p);
  for (const im of data.images || []) {
    const { data: durl, versions, origData, ...meta } = im;
    await db.put('images', { ...meta, versions: (versions || []).map(v => ({ ...v, data: undefined })) });
    if (durl) await db.put('files', { id: meta.fileId, blob: dataURLToBlob(durl) });
    if (origData && meta.origFileId) await db.put('files', { id: meta.origFileId, blob: dataURLToBlob(origData) });
    for (const v of versions || []) if (v.data) await db.put('files', { id: v.fileId, blob: dataURLToBlob(v.data) });
  }
  if (data.settings) await saveSettings(data.settings);
}

// ---- 示範資料（明確標示，可一鍵移除）----
export async function loadDemoData() {
  const cat = await saveCategory({ name: '示範分類', type: 'shared' });
  const novel = await save('novel', {
    title: '【示範】巷口的老書店', author: '示範作者', desc: '這是示範小說，可隨時刪除。',
    categoryIds: [cat.id], tags: ['示範'], status: '已完結', demo: true,
    chapters: [
      { id: uid(), title: '第一章 初見', content: '雨下了整個午後，巷口的書店亮起昏黃的燈。\n\n她推開木門，門上的銅鈴輕輕響了一聲。' },
      { id: uid(), title: '第二章 書頁之間', content: '書頁裡夾著一張泛黃的票根，日期是三十年前。\n\n「這是本店第一位客人留下的。」店主說。' },
      { id: uid(), title: '後記', content: '感謝每一位願意停下來翻書的人。' },
    ],
  });
  await save('diary', {
    title: '【示範】搬家後的第一個早晨', date: new Date().toISOString().slice(0, 10),
    mood: '期待', weather: '晴', categoryIds: [cat.id], tags: ['示範'], status: 'published', demo: true,
    content: '<p>新的房間有一扇面向東邊的窗。六點半，光線準時落在書桌上。</p><blockquote>把日子過成想要的样子，從整理桌面開始。</blockquote>',
  });
  await save('novel', { title: '__demo_marker__', demo: true, deleted: true, chapters: [] }); // 標記用
  await saveSettings({ demoLoaded: true });
  return novel;
}
export async function removeDemoData() {
  for (const store of Object.values(TYPES)) {
    for (const it of await db.all(store)) if (it.demo) await db.del(store, it.id);
  }
  for (const c of await db.all('categories')) if (c.name === '示範分類') await db.del('categories', c.id);
  await saveSettings({ demoLoaded: false });
}
