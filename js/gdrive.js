// Google Drive 同步（OAuth + Drive API, scope: drive.file）
// 需要使用者在管理後台填入自己的 OAuth Client ID（Web 應用程式類型，不需 secret）
import { exportAll, importAll, getSettings, saveSettings } from './store.js';
import { WS, wsKey } from './workspace.js';

// 讀取網址加上 u=名字（其他人的網站讀他自己的資料檔）
const withUser = (url, extra = '') => url + (url.includes('?') ? '&' : '?') + [WS ? 'u=' + encodeURIComponent(WS) : '', extra].filter(Boolean).join('&');
import { db } from './db.js';
import { blobToDataURL, dataURLToBlob } from './util.js';

// 注意：寫入「使用者指定的既有資料夾」需要 drive scope（drive.file 只能存取本應用建立的檔案）。
// 若未設定資料夾 ID，應用會自建 MyPortfolioSiteData 資料夾。
const SCOPE = 'https://www.googleapis.com/auth/drive';
const FOLDER_NAME = 'MyPortfolioSiteData';
const DEFAULT_FOLDER_ID = '1OEQ7Cjq6AK6QAeU1CgaxYN0GjdAaIwdF';
let token = null;
let folderId = null;
const listeners = new Set();
export const syncState = { status: 'offline', lastSync: null, progress: '', error: null };
export function onSyncChange(fn) { listeners.add(fn); }
function setState(patch) { Object.assign(syncState, patch); listeners.forEach(f => f(syncState)); }

export function isConfigured() { return getSettings().then(s => !!s.driveClientId); }
export const hasToken = () => !!token;

function gisLoaded() {
  return new Promise((res, rej) => {
    if (window.google?.accounts?.oauth2) return res();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = res; s.onerror = () => rej(new Error('無法載入 Google Identity Services'));
    document.head.appendChild(s);
  });
}

export async function signIn() {
  const { driveClientId } = await getSettings();
  if (!driveClientId) throw new Error('請先在「管理 → Google Drive」填入 OAuth Client ID');
  await gisLoaded();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: driveClientId, scope: SCOPE,
      callback: resp => {
        if (resp.error) return reject(new Error(resp.error));
        token = resp.access_token;
        sessionStorage.setItem('gdrive-token', token);
        setState({ status: 'connected', error: null });
        resolve(token);
      },
    });
    client.requestAccessToken({ prompt: token ? '' : 'consent' });
  });
}
export function signOut() {
  if (token) google?.accounts?.oauth2?.revoke(token, () => {});
  token = null; sessionStorage.removeItem('gdrive-token');
  setState({ status: 'offline' });
}
export function restoreToken() { token = sessionStorage.getItem('gdrive-token'); if (token) setState({ status: 'connected' }); return !!token; }

async function api(path, opts = {}) {
  if (!token) throw new Error('尚未登入 Google');
  const r = await fetch(`https://www.googleapis.com${path}`, {
    ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  if (r.status === 401) { token = null; sessionStorage.removeItem('gdrive-token'); setState({ status: 'offline', error: '登入已過期' }); throw new Error('登入已過期，請重新登入'); }
  if (!r.ok) throw new Error(`Drive API ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

async function ensureFolder() {
  if (folderId) return folderId;
  const s = await getSettings();
  const target = s.driveFolderId || DEFAULT_FOLDER_ID;
  if (target) {
    // 驗證資料夾可存取
    try { await api(`/drive/v3/files/${target}?fields=id,name`); return folderId = target; }
    catch (e) { throw new Error(`無法存取資料夾 ${target}：${e.message}（請確認資料夾已共用給此 Google 帳號，且有編輯權限）`); }
  }
  const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await api(`/drive/v3/files?q=${q}&fields=files(id)`);
  if (res.files.length) return folderId = res.files[0].id;
  const created = await api('/drive/v3/files', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  return folderId = created.id;
}

async function findFile(name) {
  const fid = await ensureFolder();
  const q = encodeURIComponent(`name='${name}' and '${fid}' in parents and trashed=false`);
  const res = await api(`/drive/v3/files?q=${q}&fields=files(id,modifiedTime)`);
  return res.files[0] || null;
}

async function uploadFile(name, blob, mime) {
  const fid = await ensureFolder();
  const existing = await findFile(name);
  const meta = existing ? { name } : { name, parents: [fid] };
  const boundary = 'x' + Math.random().toString(36).slice(2);
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`, blob, `\r\n--${boundary}--`,
  ]);
  const url = existing
    ? `/upload/drive/v3/files/${existing.id}?uploadType=multipart`
    : '/upload/drive/v3/files?uploadType=multipart&fields=id';
  const r = await fetch(`https://www.googleapis.com${url}`, {
    method: existing ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!r.ok) throw new Error(`上傳失敗 ${r.status}`);
  return r.json();
}

async function downloadFile(id) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`下載失敗 ${r.status}`);
  return r.blob();
}

// ---- 同步 ----
// 策略：data.json 存所有文字資料；圖片以 images/<id> 個別存。
// 衝突：遠端較新且本地也有修改 → 遠端另存為 conflict 檔案，讓使用者選擇，不自動覆蓋。
export async function syncNow({ direction = 'auto' } = {}) {
  if (!token) throw new Error('尚未登入');
  setState({ status: 'syncing', progress: '檢查遠端資料…', error: null });
  try {
    const remote = await findFile('data.json');
    const localStamp = (await db.get('settings', 'site'))?.updatedAt || '';
    if (remote && direction !== 'upload') {
      const remoteTime = new Date(remote.modifiedTime).getTime();
      const localTime = new Date(localStamp || 0).getTime();
      if (remoteTime > localTime + 2000) {
        // 遠端較新：下載比對；若有本地更新則記為衝突
        const blob = await downloadFile(remote.id);
        const data = JSON.parse(await blob.text());
        setState({ progress: '遠端資料較新，匯入中…' });
        await importAll(data);
        await saveLocalStamp(remote.modifiedTime);
      } else {
        await upload(direction);
      }
    } else {
      await upload('upload');
    }
    setState({ status: 'connected', lastSync: new Date().toISOString(), progress: '' });
  } catch (e) {
    setState({ status: 'error', error: e.message, progress: '' });
    throw e;
  }
}

async function upload() {
  setState({ progress: '匯出本地資料…' });
  const data = await exportAll();
  // 圖片抽離為個別檔案，data.json 只留 fileId 引用
  const imageFiles = [];
  data.images = data.images.map(im => {
    imageFiles.push({ id: im.fileId, data: im.data });
    for (const v of im.versions || []) imageFiles.push({ id: v.fileId, data: v.data });
    return { ...im, data: null, versions: (im.versions || []).map(v => ({ ...v, data: null })) };
  });
  setState({ progress: '上傳文字資料…' });
  await uploadFile('data.json', new Blob([JSON.stringify(data)], { type: 'application/json' }), 'application/json');
  let i = 0;
  for (const f of imageFiles) {
    if (!f.data) continue;
    setState({ progress: `上傳圖片 ${++i}/${imageFiles.length}…` });
    await uploadFile(`img-${f.id}`, dataURLToBlob(f.data), 'application/octet-stream');
  }
  await saveLocalStamp(new Date().toISOString());
}

export async function downloadRemote() {
  const remote = await findFile('data.json');
  if (!remote) throw new Error('雲端尚無資料');
  const blob = await downloadFile(remote.id);
  const data = JSON.parse(await blob.text());
  // 補回圖片
  const fid = await ensureFolder();
  const q = encodeURIComponent(`'${fid}' in parents and name contains 'img-' and trashed=false`);
  const list = await api(`/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1000`);
  const map = {};
  for (const f of list.files) map[f.name.slice(4)] = f.id;
  for (const im of data.images) {
    const ids = [im.fileId, ...(im.versions || []).map(v => v.fileId)];
    for (const id of ids) {
      if (map[id]) {
        const b = await downloadFile(map[id]);
        im.data = im.data ?? (id === im.fileId ? await blobToDataURL(b) : im.data);
        for (const v of im.versions || []) if (v.fileId === id) v.data = await blobToDataURL(b);
      }
    }
  }
  await importAll(data);
  await saveLocalStamp(remote.modifiedTime);
}

// 衝突版本：讓使用者選擇保留哪一邊
export async function resolveConflict(choice) {
  if (choice === 'remote') await downloadRemote();
  else await upload('upload');
  setState({ status: 'connected', lastSync: new Date().toISOString() });
}

// ---- 經由 Google Apps Script Web App 上傳/讀取（免 OAuth）----
export async function loadViaAppsScript(webAppUrl) {
  const r = await fetch(WS ? withUser(webAppUrl) : webAppUrl); // GET 回傳最新完整備份
  const res = await r.json();
  if (!res.ok) throw new Error(res.error || '讀取失敗');
  return res.data;
}

// 啟動時自動同步：遠端較新就匯入，回傳是否已更新
export async function autoLoadFromDrive() {
  const s = await getSettings();
  if (!s.gasUrl) return false;
  try {
    // 先只問遠端版本時間（輕量）；舊版 Apps Script 不認得 meta 參數，會直接回傳完整備份
    const head = await fetch(withUser(s.gasUrl, 'meta=1')).then(r => r.json());
    if (!head.ok) throw new Error(head.error || '讀取失敗');
    const stamp = head.exportedAt || head.data?.exportedAt;
    if (!stamp || stamp <= (s._appliedRemote || '')) return false; // 已是最新
    const remote = head.data || await loadViaAppsScript(s.gasUrl);
    if (!remote?.exportedAt) return false;
    await importAll(remote);
    await saveSettings({ _appliedRemote: remote.exportedAt });
    return true;
  } catch (e) { console.warn('Drive 自動載入失敗', e); return false; }
}
// data URL 解碼後的位元組數（和雲端檔案大小比對用）
export function dataUrlSize(d) {
  const b64 = String(d || '').split(',')[1] || '';
  return Math.floor(b64.length * 3 / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
}
// 文字資料的指紋：去掉每次都會變的時間戳與同步紀錄，內容一樣指紋就一樣
export function fingerprint(data) {
  const { exportedAt, ...rest } = data;
  const settings = Object.fromEntries(Object.entries(rest.settings || {}).filter(([k]) => !k.startsWith('_')));
  const s = JSON.stringify({ ...rest, settings });
  let h1 = 0x811c9dc5, h2 = 0;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = (h2 * 31 + c) | 0; }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + s.length.toString(36);
}
const LAST_KEY = 'last-upload' + (WS ? '@' + WS : '');
const lastUpload = () => { try { return JSON.parse(localStorage.getItem(LAST_KEY)) || {}; } catch { return {}; } };
const saveLastUpload = v => { try { localStorage.setItem(LAST_KEY, JSON.stringify(v)); } catch { /* 無痕模式 */ } };

// 分批上傳：data.json 一次；圖片/媒體每批 ~5MB 逐次 POST（避免 Apps Script 請求上限）
// deps 讓測試可以換掉匯出與存設定
export async function uploadViaAppsScript(webAppUrl, folderId, deps = {}) {
  const doExport = deps.exportAll || exportAll, doSave = deps.saveSettings || saveSettings;
  setState({ status: 'syncing', progress: '匯出資料中…', error: null });
  const post = payload => fetch(webAppUrl, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' }, // 避免 CORS preflight
    // 其他人的網站：帶上帳號與金鑰，Apps Script 只讓本人寫入自己的資料夾
    body: JSON.stringify(WS ? { ...payload, u: WS, key: wsKey() } : payload),
  }).then(r => r.json()).then(res => {
    if (res.code === 'bad-login') throw new Error('登入已失效，請登出後重新登入再上傳');
    if (!res.ok) throw new Error(res.error || 'Apps Script 回傳錯誤'); return res;
  });
  try {
    const data = await doExport();
    // 抽離所有檔案：圖片（主圖/原檔/版本）＋內文媒體檔
    const files = [];
    data.images = data.images.map(im => {
      if (im.data) files.push({ id: im.fileId, data: im.data });
      if (im.origData) files.push({ id: im.origFileId, data: im.origData });
      for (const v of im.versions || []) if (v.data) files.push({ id: v.fileId, data: v.data });
      return { ...im, data: null, origData: null, versions: (im.versions || []).map(v => ({ ...v, data: null })) };
    });
    for (const mf of data.mediaFiles || []) if (mf.data) files.push(mf);
    data.mediaFiles = (data.mediaFiles || []).map(mf => ({ id: mf.id, data: null }));

    // 只上傳雲端還沒有的：先問雲端有哪些檔案（同一個 id 的內容不會變，大小相同就跳過）
    setState({ progress: '比對雲端已有的資料…' });
    let remote = null;
    try { remote = await post({ action: 'listFiles', folderId }); } catch { /* 舊版 Apps Script：全部上傳 */ }
    const todo = remote ? files.filter(f => remote.files?.[f.id] !== dataUrlSize(f.data)) : files;

    // 文字資料沒變、雲端也還是上次傳的那一份，就不重傳
    const fp = fingerprint(data), last = lastUpload();
    const jsonSame = remote?.hasData && last.fp === fp && last.at && last.at === remote.exportedAt;
    if (!jsonSame) {
      setState({ progress: '上傳文字資料…' });
      await post({ action: 'putJson', folderId, data });
    }

    let sent = 0;
    for (const f of todo) {
      setState({ progress: `上傳新檔案 ${++sent}/${todo.length}…` });
      await post({ action: 'putFile', folderId, id: f.id, data: f.data });
    }
    const at = jsonSame ? last.at : data.exportedAt;
    saveLastUpload({ fp, at });
    if (!jsonSame) await doSave({ _appliedRemote: data.exportedAt });
    const skipped = files.length - todo.length;
    const msg = jsonSame && !todo.length ? '雲端已經是最新的，沒有需要上傳的資料'
      : `已上傳${jsonSame ? '' : '文字資料、'}${todo.length} 個新檔案${skipped ? `（${skipped} 個雲端已有，略過）` : ''}`;
    setState({ status: 'connected', lastSync: new Date().toISOString(), progress: msg });
    return { ok: true, images: todo.length, skipped, jsonSkipped: jsonSame, message: msg };
  } catch (e) {
    setState({ status: 'error', error: e.message, progress: '' });
    throw e;
  }
}

async function saveLocalStamp(ts) {
  const s = await db.get('settings', 'site');
  await db.put('settings', { id: 'site', value: { ...(s?.value || {}), _syncStamp: ts }, updatedAt: ts });
}
