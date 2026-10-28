// 多裝置自動同步
// ・登入後在這台改了資料 → 幾秒後自動上傳（只傳有變的：文字資料有變才傳，圖片只傳雲端沒有的）
// ・別台裝置上傳了新資料 → 這台自動讀回來並刷新畫面（只下載有變的作品與缺少的圖片）
// ・同一件作品兩邊都改過：以最後修改的為準；刪除（含回收筒、永久刪除）也會同步
import { db, SYNCED } from './db.js';
import { getSettings, saveSettings } from './store.js';
import { dataURLToBlob } from './util.js';
import { WS, authed } from './workspace.js';

const POLL_MS = 45000, UPLOAD_DELAY = 4000;
const dataURLToBlobSafe = d => { try { return dataURLToBlob(d); } catch { return null; } };
const rev = it => it?._rev || Date.parse(it?.updatedAt || it?.deletedAt || it?.createdAt || '') || 0;

let onApplied = () => {}, busy = null, dirty = false, upTimer = null, status = 'idle', lastError = '';
const listeners = new Set();
export const syncStatus = () => ({ status, error: lastError });
export const onSyncStatus = fn => listeners.add(fn);
const setStatus = (s, err = '') => { status = s; lastError = err; listeners.forEach(fn => fn(syncStatus())); };

const gasGet = async (url, params) => {
  const q = [WS ? 'u=' + encodeURIComponent(WS) : '', params].filter(Boolean).join('&');
  const r = await fetch(url + (url.includes('?') ? '&' : '?') + q).then(x => x.json());
  if (!r.ok) throw Object.assign(new Error(r.error || '讀取失敗'), { code: r.code });
  return r;
};

// 把雲端資料合併進本機；authoritative＝訪客（雲端說了算，本機多的也刪掉）
// 回傳 { changed, needFiles }
export async function mergeRemote(data, { authoritative = false, dbx = db } = {}) {
  let changed = false;
  const needFiles = new Set();
  const local = {};
  for (const s of SYNCED) local[s] = new Map((await dbx.all(s)).map(x => [x.id, x]));

  // 1) 刪除：墓碑比本機版本新就刪
  const tombs = data.tombstones || [];
  for (const t of tombs) {
    const cur = local[t.s]?.get(t.id);
    if (cur && rev(cur) <= t.at) { await dbx.delRaw(t.s, t.id); local[t.s].delete(t.id); changed = true; }
  }
  if (tombs.length) {
    const mine = (await dbx.get('settings', 'tombstones'))?.list || [];
    const merged = new Map([...mine, ...tombs].map(t => [t.s + ':' + t.id, t]));
    for (const t of [...mine, ...tombs]) { const k = t.s + ':' + t.id; if (t.at > merged.get(k).at) merged.set(k, t); }
    await dbx.putRaw('settings', { id: 'tombstones', list: [...merged.values()].sort((a, b) => a.at - b.at).slice(-3000) });
  }

  // 2) 各作品：雲端版本比較新（或訪客模式下不一樣）才寫入
  const remoteIds = {};
  for (const s of SYNCED) {
    remoteIds[s] = new Set();
    for (const raw of data[s] || []) {
      const { data: _d, origData: _o, ...it } = raw;
      if (s === 'images') it.versions = (it.versions || []).map(({ data: _v, ...v }) => v);
      remoteIds[s].add(it.id);
      const cur = local[s].get(it.id);
      const take = !cur || (authoritative ? JSON.stringify({ ...cur, views: 0 }) !== JSON.stringify({ ...it, views: 0 }) : rev(it) > rev(cur));
      if (take) {
        await dbx.putRaw(s, authoritative && cur ? { ...it, views: Math.max(cur.views || 0, it.views || 0) } : it);
        changed = true;
        // 回收筒跟著作品狀態走
        const type = Object.entries({ novels: 'novel', images: 'image', diaries: 'diary', crafts: 'craft', books: 'book' }).find(([k]) => k === s)?.[1];
        if (type) {
          if (it.deleted) await dbx.putRaw('trash', { id: `${type}:${it.id}`, type, itemId: it.id, title: it.title || it.name || '', deletedAt: it.deletedAt });
          else if (cur?.deleted) await dbx.delRaw('trash', `${type}:${it.id}`);
        }
      }
      // 圖片檔：本機沒有的才需要下載（雲端資料若已附圖就直接存）
      if (s === 'images' && !it.deleted) {
        for (const [fid, inline] of [[it.fileId, raw.data], [it.origFileId, raw.origData], ...(raw.versions || []).map(v => [v.fileId, v.data])]) {
          if (!fid) continue;
          if (inline) { const b = dataURLToBlobSafe(inline); if (b) await dbx.putRaw('files', { id: fid, blob: b }); }
          else if (!(await dbx.get('files', fid))) needFiles.add(fid);
        }
      }
    }
    // 訪客：雲端沒有的作品就移除（例如本機的示範資料、站長已刪掉的）；登入者只清掉本機的示範資料
    for (const [id, cur] of local[s]) if (!remoteIds[s].has(id) && (authoritative || cur.demo)) { await dbx.delRaw(s, id); changed = true; }
  }
  for (const mf of data.mediaFiles || []) {
    if (mf.data) { const b = dataURLToBlobSafe(mf.data); if (b) await dbx.putRaw('files', { id: mf.id, blob: b }); }
    else if (!(await dbx.get('files', mf.id))) needFiles.add(mf.id);
  }

  // 3) 設定：雲端比較新才套用；本機的同步紀錄（底線開頭）保留
  if (data.settings) {
    const rec = await dbx.get('settings', 'site'), cur = rec?.value || {};
    const rr = data.settings._srev || 0, lr = cur._srev || 0;
    const pub = o => JSON.stringify(Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_') && k !== 'demoLoaded').sort()));
    // 訪客：和雲端不同就套用；登入者：雲端較新才套用（舊資料都沒有版本時，以雲端為準）
    if (authoritative ? pub(data.settings) !== pub(cur) : rr > lr || (!rr && !lr)) {
      const keepLocal = Object.fromEntries(Object.entries(cur).filter(([k]) => k.startsWith('_') && k !== '_srev'));
      const remote = Object.fromEntries(Object.entries(data.settings).filter(([k]) => !k.startsWith('_') || k === '_srev'));
      await dbx.putRaw('settings', { id: 'site', value: { ...remote, ...keepLocal, demoLoaded: true }, updatedAt: new Date().toISOString() });
      changed = true;
    }
  }
  // 4) 閱讀進度：比較新的才用
  for (const p of data.progress || []) {
    const cur = await dbx.get('progress', p.id);
    if (!cur || (p.updatedAt || '') > (cur.updatedAt || '')) await dbx.putRaw('progress', p);
  }
  return { changed, needFiles: [...needFiles] };
}

// 只下載缺少的圖片（每次最多 15 個）
async function fetchFiles(url, ids) {
  for (let i = 0; i < ids.length; i += 15) {
    try {
      const r = await gasGet(url, 'files=' + ids.slice(i, i + 15).join(','));
      for (const [id, d] of Object.entries(r.files || {})) { const b = dataURLToBlobSafe(d); if (b) await db.putRaw('files', { id, blob: b }); }
    } catch (e) { console.warn('下載圖片失敗', e); return; }
  }
}

// 雲端有新版本就讀回來；回傳是否有變
export async function pull({ force = false } = {}) {
  const s = await getSettings();
  if (!s.gasUrl) return false;
  const head = await gasGet(s.gasUrl, 'meta=1');
  const stamp = head.exportedAt || head.data?.exportedAt || '';
  if (!stamp || (!force && stamp === s._appliedRemote)) return false;
  const r = head.data ? head : await gasGet(s.gasUrl, 'lite=1');
  const data = r.data;
  if (!data) return false;
  const { changed, needFiles } = await mergeRemote(data, { authoritative: !authed() });
  if (needFiles.length) await fetchFiles(s.gasUrl, needFiles);
  await saveSettings({ _appliedRemote: stamp });
  return changed || needFiles.length > 0;
}

// 先讀回別台的修改，再上傳這台的（只傳有變的）
async function pushNow() {
  if (!authed()) return;
  const s = await getSettings();
  if (!s.gasUrl) return;
  setStatus('syncing');
  try {
    if (await pull()) onApplied();
    const { uploadViaAppsScript } = await import('./gdrive.js');
    dirty = false;
    await uploadViaAppsScript(s.gasUrl, s.driveFolderId);
    setStatus(dirty ? 'pending' : 'ok');
  } catch (e) {
    setStatus('error', e.message || String(e));
    dirty = true;
  }
}
const run = fn => { busy = (busy || Promise.resolve()).then(fn).catch(e => console.warn('同步', e)).finally(() => {}); return busy; };

function scheduleUpload() {
  if (!authed()) return;
  dirty = true; setStatus('pending');
  clearTimeout(upTimer);
  upTimer = setTimeout(() => run(pushNow), UPLOAD_DELAY);
}

async function poll() {
  if (document.hidden) return;
  await run(async () => {
    try {
      if (await pull()) onApplied();
      if (status === 'error' && !dirty) setStatus('ok');
    } catch (e) { if (authed()) setStatus('error', e.message); }
  });
}

// 啟動：先讀一次雲端，之後定時檢查；登入狀態下本機一改就自動上傳
export function startSync(applied) {
  onApplied = applied || onApplied;
  addEventListener('data-changed', scheduleUpload);
  addEventListener('focus', poll);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  setInterval(poll, POLL_MS);
  // 關閉分頁前還有沒上傳的：盡量提醒
  addEventListener('beforeunload', e => { if (dirty && authed()) { e.preventDefault(); e.returnValue = ''; } });
  return poll();
}
export const syncNow = () => run(pushNow);
