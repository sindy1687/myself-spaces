// Google Drive 同步（OAuth + Drive API, scope: drive.file）
// 需要使用者在管理後台填入自己的 OAuth Client ID（Web 應用程式類型，不需 secret）
import { exportAll, importAll, getSettings, saveSettings } from './store.js';
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
  const r = await fetch(webAppUrl); // GET 回傳最新完整備份
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
    const head = await fetch(s.gasUrl + (s.gasUrl.includes('?') ? '&' : '?') + 'meta=1').then(r => r.json());
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
// 分批上傳：data.json 一次；圖片/媒體每批 ~5MB 逐次 POST（避免 Apps Script 請求上限）
export async function uploadViaAppsScript(webAppUrl, folderId) {
  setState({ status: 'syncing', progress: '匯出資料中…', error: null });
  const post = payload => fetch(webAppUrl, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' }, // 避免 CORS preflight
    body: JSON.stringify(payload),
  }).then(r => r.json()).then(res => { if (!res.ok) throw new Error(res.error || 'Apps Script 回傳錯誤'); return res; });
  try {
    const data = await exportAll();
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

    setState({ progress: '上傳文字資料…' });
    await post({ action: 'putJson', folderId, data });

    let sent = 0;
    for (const f of files) {
      setState({ progress: `上傳檔案 ${++sent}/${files.length}…` });
      await post({ action: 'putFile', folderId, id: f.id, data: f.data });
    }
    await saveSettings({ _appliedRemote: data.exportedAt });
    setState({ status: 'connected', lastSync: new Date().toISOString(), progress: `已上傳（${files.length} 個檔案）` });
    return { ok: true, images: files.length };
  } catch (e) {
    setState({ status: 'error', error: e.message, progress: '' });
    throw e;
  }
}

async function saveLocalStamp(ts) {
  const s = await db.get('settings', 'site');
  await db.put('settings', { id: 'site', value: { ...(s?.value || {}), _syncStamp: ts }, updatedAt: ts });
}
