/**
 * 個人作品網站 → Google Drive 上傳接收端
 *
 * 部署方式：
 * 1. 到 https://script.google.com 建立新專案，貼上此檔。
 * 2. 「部署」→「新增部署作業」→ 類型選「網路應用程式」。
 * 3. 「執行身分」選「我」（你的帳號）；「存取權」選「僅限自己」或「知道連結的任何人」。
 *    ※ 選「任何人」方便網站跨來源 POST；資料夾內容只有你能看。
 * 4. 複製產生的 /exec 網址，貼到網站「管理 → Google Drive → Apps Script Web App URL」。
 *
 * 更新此檔後：「部署」→「管理部署作業」→ 編輯（鉛筆）→ 版本選「新版本」→ 部署（網址不變）。
 *
 * 資料夾結構（每個人分開）：
 *   目標資料夾/
 *     data.json、圖片/          ← 站長（你）
 *     使用者A/
 *       data.json              ← A 的文字資料與設定
 *       圖片/                  ← A 的所有圖片、媒體檔（img-xxx）
 *     使用者B/ …
 * 帳號存在指令碼屬性（只存加鹽雜湊，不存密碼）。舊的「user-帳號」資料夾會自動改名、圖片自動搬進「圖片」。
 */

// 目標資料夾（可在網站後台覆寫，或在此改預設值）
var DEFAULT_FOLDER_ID = '1OEQ7Cjq6AK6QAeU1CgaxYN0GjdAaIwdF';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    // 帳號功能
    if (body.action === 'register') return json(register(body.user, body.key));
    if (body.action === 'login') return json(login(body.user, body.key));
    if (body.action === 'changePw') {
      var chk = login(body.user, body.key);
      if (!chk.ok) return json(chk);
      if (!/^[0-9a-f]{64}$/.test(body.newKey || '')) return json({ ok: false, error: '新密碼格式錯誤' });
      var acc = getAccount(body.user);
      acc.salt = Utilities.getUuid(); acc.hash = digest(acc.salt + ':' + body.newKey);
      PropertiesService.getScriptProperties().setProperty('acct:' + body.user, JSON.stringify(acc));
      return json({ ok: true });
    }

    // 其他人的網站：驗證帳號後只能寫入自己的子資料夾
    var folder, metaKey = 'exportedAt';
    if (body.u) {
      var auth = login(body.u, body.key);
      if (!auth.ok) return json({ ok: false, code: 'bad-login', error: '登入已失效' });
      folder = userFolder(body.u, true);
      metaKey = 'exportedAt:' + body.u;
    } else {
      folder = DriveApp.getFolderById(body.folderId || DEFAULT_FOLDER_ID);
    }

    // 列出雲端已有的檔案（id → 大小），網站只上傳還沒有的
    if (body.action === 'listFiles') {
      var have = {};
      [folder, imageFolder(folder, false)].forEach(function (dir) {
        if (!dir) return;
        var fs = dir.getFiles();
        while (fs.hasNext()) { var x = fs.next(); if (x.getName().indexOf('img-') === 0) have[x.getName().slice(4)] = x.getSize(); }
      });
      var dj = folder.getFilesByName('data.json');
      return json({ ok: true, files: have, exportedAt: PropertiesService.getScriptProperties().getProperty(metaKey) || '', hasData: dj.hasNext() });
    }

    // 分批模式：putJson 存文字資料；putFile 存單一檔案（img-<id>）
    if (body.action === 'putJson') {
      upsert(folder, 'data.json', Utilities.newBlob(JSON.stringify(body.data), 'application/json', 'data.json'));
      PropertiesService.getScriptProperties().setProperty(metaKey, body.data.exportedAt || '');
      if (body.u) tidyImages(folder); // 舊版放在根目錄的圖片搬進「圖片」
      return ContentService.createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (body.action === 'putFile') {
      if (!/^[\w-]+$/.test(String(body.id))) return json({ ok: false, error: '檔名不合法' });
      var fb64 = body.data.split(',')[1];
      var fmime = /data:(.*?);/.exec(body.data)[1];
      putImage(folder, 'img-' + body.id, Utilities.newBlob(Utilities.base64Decode(fb64), fmime, 'img-' + body.id));
      return ContentService.createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (body.u) return json({ ok: false, error: 'unknown action' });
    var data = body.data; // 舊格式：一次傳全部

    // 1) 文字資料 → data.json（圖片 base64 抽離成個別檔）
    var images = data.images || [];
    var imageFiles = [];
    data.images = images.map(function (im) {
      if (im.data) imageFiles.push({ id: im.fileId, data: im.data });
      (im.versions || []).forEach(function (v) {
        if (v.data) imageFiles.push({ id: v.fileId, data: v.data });
      });
      return Object.assign({}, im, {
        data: null,
        versions: (im.versions || []).map(function (v) { return Object.assign({}, v, { data: null }); }),
      });
    });

    upsert(folder, 'data.json', Utilities.newBlob(JSON.stringify(data), 'application/json', 'data.json'));
    PropertiesService.getScriptProperties().setProperty('exportedAt', data.exportedAt || '');

    // 2) 圖片檔
    imageFiles.forEach(function (f) {
      var b64 = f.data.split(',')[1];
      var mime = /data:(.*?);/.exec(f.data)[1];
      var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, 'img-' + f.id);
      putImage(folder, 'img-' + f.id, blob);
    });

    return ContentService.createTextOutput(JSON.stringify({ ok: true, images: imageFiles.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// GET ?ping=1 → 健康檢查；?meta=1 → 只回傳版本時間；?lite=1 → 只回傳文字資料（不含圖片）；
// ?files=id1,id2 → 只回傳指定的圖片檔；無參數 → 回傳最新完整備份（含圖片 base64）
// 以上都可加 &u=帳號 讀那個人的網站
function doGet(e) {
  var P = (e && e.parameter) || {};
  var u = P.u;
  if (P.files) {
    var dir = u ? (validName(u) && getAccount(u) && userFolder(u, false)) : DriveApp.getFolderById(DEFAULT_FOLDER_ID);
    if (!dir) return json({ ok: false, code: 'no-account', error: '沒有這個網站' });
    return json({ ok: true, files: pickFiles(dir, String(P.files).split(',').slice(0, 30)) });
  }
  if (u) return getUser(u, !!P.meta, !!P.lite);
  if (e && e.parameter && e.parameter.ping) {
    return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'portfolio-drive-upload' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.meta) {
    // 上傳時記下的版本時間；沒有就讀 data.json（不處理圖片，仍比完整備份快很多）
    var stamp = PropertiesService.getScriptProperties().getProperty('exportedAt');
    if (!stamp) {
      var mit = DriveApp.getFolderById(DEFAULT_FOLDER_ID).getFilesByName('data.json');
      stamp = mit.hasNext() ? JSON.parse(mit.next().getBlob().getDataAsString()).exportedAt : '';
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, exportedAt: stamp || '' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  try {
    var folder = DriveApp.getFolderById(DEFAULT_FOLDER_ID);
    var it = folder.getFilesByName('data.json');
    if (!it.hasNext()) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: '資料夾內尚無 data.json' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var data = JSON.parse(it.next().getBlob().getDataAsString());
    if (!P.lite) data = withFiles(folder, data);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, exportedAt: data.exportedAt, data: data }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ---- 多人帳號 ----
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function validName(u) { return /^[\p{L}\p{N}_-]{2,20}$/u.test(u || ''); }
function digest(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function getAccount(u) {
  var raw = PropertiesService.getScriptProperties().getProperty('acct:' + u);
  return raw ? JSON.parse(raw) : null;
}
function register(u, key) {
  if (!validName(u)) return { ok: false, error: '帳號名稱不合法' };
  if (!/^[0-9a-f]{64}$/.test(key || '')) return { ok: false, error: '密碼格式錯誤' };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    if (getAccount(u)) return { ok: false, code: 'taken', error: '帳號已被使用' };
    // 不能和目標資料夾裡已有的資料夾同名（例如站長的「圖片」），以免拿到別人的檔案
    var root = DriveApp.getFolderById(DEFAULT_FOLDER_ID);
    if (u === IMG_FOLDER || root.getFoldersByName(u).hasNext() || root.getFoldersByName('user-' + u).hasNext()) return { ok: false, code: 'taken', error: '帳號已被使用' };
    // 簡單防濫用：帳號總數上限
    var count = Object.keys(props.getProperties()).filter(function (k) { return k.indexOf('acct:') === 0; }).length;
    if (count >= 500) return { ok: false, error: '註冊人數已達上限，請聯絡站長' };
    var salt = Utilities.getUuid();
    var folder = userFolder(u, true);
    props.setProperty('acct:' + u, JSON.stringify({ salt: salt, hash: digest(salt + ':' + key), folderId: folder.getId(), created: new Date().toISOString() }));
    return { ok: true };
  } finally { lock.releaseLock(); }
}
function login(u, key) {
  var acc = validName(u) && getAccount(u);
  if (!acc) return { ok: false, code: 'no-account', error: '沒有這個帳號' };
  // 連續輸錯 10 次鎖 10 分鐘
  var cache = CacheService.getScriptCache(), failKey = 'fail:' + u, fails = +(cache.get(failKey) || 0);
  if (fails >= 10) return { ok: false, code: 'too-many', error: '密碼錯誤太多次，請 10 分鐘後再試' };
  if (digest(acc.salt + ':' + key) !== acc.hash) { cache.put(failKey, String(fails + 1), 600); return { ok: false, code: 'bad-login', error: '帳號或密碼錯誤' }; }
  cache.remove(failKey);
  return { ok: true };
}
// 每個人一個以帳號命名的資料夾（舊版名稱 user-帳號 會自動改成帳號）
function userFolder(u, create) {
  var acc = getAccount(u), f = null;
  if (acc && acc.folderId) { try { f = DriveApp.getFolderById(acc.folderId); if (f.isTrashed()) f = null; } catch (e) { f = null; /* 被刪除就重建 */ } }
  var root = DriveApp.getFolderById(DEFAULT_FOLDER_ID);
  if (!f) {
    var it = root.getFoldersByName(u), old = root.getFoldersByName('user-' + u);
    f = it.hasNext() ? it.next() : old.hasNext() ? old.next() : create ? root.createFolder(u) : null;
    if (f && acc && acc.folderId !== f.getId()) { acc.folderId = f.getId(); PropertiesService.getScriptProperties().setProperty('acct:' + u, JSON.stringify(acc)); }
  }
  if (f && f.getName() === 'user-' + u) f.setName(u);
  if (f && create) imageFolder(f);
  return f;
}

// ---- 圖片資料夾：每個人的圖片都放在自己資料夾裡的「圖片」 ----
var IMG_FOLDER = '圖片';
function imageFolder(folder, create) {
  var it = folder.getFoldersByName(IMG_FOLDER);
  if (it.hasNext()) return it.next();
  return create === false ? null : folder.createFolder(IMG_FOLDER);
}
// 存進「圖片」，並清掉舊版直接放在外層的同名檔
function putImage(folder, name, blob) {
  upsert(imageFolder(folder), name, blob);
  var old = folder.getFilesByName(name);
  while (old.hasNext()) old.next().setTrashed(true);
}
// 把外層的 img- 檔搬進「圖片」（舊版資料夾整理用）
function tidyImages(folder) {
  var img = imageFolder(folder), files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next(), n = f.getName();
    if (n.indexOf('img-') !== 0) continue;
    if (img.getFilesByName(n).hasNext()) f.setTrashed(true); else f.moveTo(img);
  }
}
// 讀某人的網站資料（公開讀取，和站長的 data.json 一樣）
function getUser(u, metaOnly, lite) {
  if (!validName(u) || !getAccount(u)) return json({ ok: false, code: 'no-account', error: '沒有這個網站' });
  if (metaOnly) return json({ ok: true, exportedAt: PropertiesService.getScriptProperties().getProperty('exportedAt:' + u) || '' });
  var folder = userFolder(u, false);
  var it = folder && folder.getFilesByName('data.json');
  if (!it || !it.hasNext()) return json({ ok: false, error: '這個網站還沒有上傳資料' });
  var data = JSON.parse(it.next().getBlob().getDataAsString());
  return json({ ok: true, exportedAt: data.exportedAt, data: lite ? data : withFiles(folder, data) });
}
// 只取指定的幾個檔案（先找「圖片」，再找外層舊檔）
function pickFiles(folder, ids) {
  var out = {}, img = imageFolder(folder, false);
  ids.forEach(function (id) {
    if (!/^[\w-]+$/.test(id)) return;
    var dirs = img ? [img, folder] : [folder];
    for (var i = 0; i < dirs.length; i++) {
      var it = dirs[i].getFilesByName('img-' + id);
      if (it.hasNext()) { var b = it.next().getBlob(); out[id] = 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()); break; }
    }
  });
  return out;
}
// 補回圖片與媒體檔 base64
function withFiles(folder, data) {
  // 先讀外層（舊版），再讀「圖片」資料夾（新版優先）
  var map = {};
  [folder, imageFolder(folder, false)].forEach(function (dir) {
    if (!dir) return;
    var files = dir.getFiles();
    while (files.hasNext()) { var f = files.next(); if (f.getName().indexOf('img-') === 0) map[f.getName().slice(4)] = f; }
  });
  var encode = function (file) { return 'data:' + file.getBlob().getContentType() + ';base64,' + Utilities.base64Encode(file.getBlob().getBytes()); };
  (data.images || []).forEach(function (im) {
    if (map[im.fileId]) im.data = encode(map[im.fileId]);
    if (im.origFileId && map[im.origFileId]) im.origData = encode(map[im.origFileId]);
    (im.versions || []).forEach(function (v) { if (map[v.fileId]) v.data = encode(map[v.fileId]); });
  });
  (data.mediaFiles || []).forEach(function (mf) { if (map[mf.id]) mf.data = encode(map[mf.id]); });
  return data;
}

// 同名檔案覆寫（保留單一最新版）；舊版移至垃圾桶以免堆積
function upsert(folder, name, blob) {
  var it = folder.getFilesByName(name);
  while (it.hasNext()) it.next().setTrashed(true);
  folder.createFile(blob);
}
