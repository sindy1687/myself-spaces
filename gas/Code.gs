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
    if (body.action === 'ownerSetup') return json(ownerSetup(body.pw, body.key));

    // 市集：瀏覽不用登入，其餘要登入
    if (String(body.action || '').indexOf('m.') === 0) return json(market(body));

    // 寫入與讀完整資料都要驗證：其他人只能動自己的子資料夾，站長要帶站長金鑰
    var folder, metaKey = 'exportedAt';
    if (body.u) {
      var auth = login(body.u, body.key);
      if (!auth.ok) return json({ ok: false, code: 'bad-login', error: '登入已失效' });
      folder = userFolder(body.u, true);
      metaKey = 'exportedAt:' + body.u;
    } else {
      if (!ownerLogin(body.key).ok) return json({ ok: false, code: 'bad-login', error: '登入已失效' });
      folder = DriveApp.getFolderById(body.folderId || DEFAULT_FOLDER_ID);
    }

    // 本人讀自己的完整資料（含私人作品），訪客只能用 GET 讀公開的部分
    if (body.action === 'getData') {
      var gd = folder.getFilesByName('data.json');
      if (!gd.hasNext()) return json({ ok: false, error: '這個網站還沒有上傳資料' });
      var full = JSON.parse(gd.next().getBlob().getDataAsString());
      return json({ ok: true, exportedAt: full.exportedAt, data: body.lite ? full : withFiles(folder, full) });
    }
    if (body.action === 'getFiles') return json({ ok: true, files: pickFiles(folder, String(body.ids || '').split(',').slice(0, 30)) });

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
      // 發文獎勵：伺服器自己看上傳的資料決定，網站端無法造假；出錯也不影響存檔
      var reward = null;
      try { reward = rewardPosts(body.u || ownerName(), body.data); } catch (re) { reward = { error: String(re) }; }
      return json({ ok: true, reward: reward });
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
    // 訪客只能拿公開作品用到的檔案
    var pubText = JSON.stringify(publicView(readData(dir) || {}));
    var ids = String(P.files).split(',').slice(0, 30).filter(function (id) { return /^[\w-]+$/.test(id) && pubText.indexOf(id) >= 0; });
    return json({ ok: true, files: pickFiles(dir, ids) });
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
    var data = publicView(JSON.parse(it.next().getBlob().getDataAsString()));
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
    if (getAccount(u) || u === ownerName() || u === MARKET_FOLDER) return { ok: false, code: 'taken', error: '帳號已被使用' };
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

// ---- 站長帳號：站長的網站在根目錄，金鑰另外存在 owner:acct ----
// 站長登入時把密碼送來一次，和 data.json 裡的 adminPwHash（不加鹽 SHA-256）比對，對了就記下這次的金鑰
var OWNER_FALLBACK = { user: 'sindy16872000', pwHash: '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0' };
function ownerInfo() {
  var s = (readData(DriveApp.getFolderById(DEFAULT_FOLDER_ID)) || {}).settings || {};
  return { user: s.adminUser || OWNER_FALLBACK.user, pwHash: s.adminPwHash || OWNER_FALLBACK.pwHash };
}
function ownerAccount() {
  var raw = PropertiesService.getScriptProperties().getProperty('owner:acct');
  return raw ? JSON.parse(raw) : null;
}
function ownerName() { var a = ownerAccount(); return a ? a.user : ownerInfo().user; }
function ownerSetup(pw, key) {
  if (!pw || !/^[0-9a-f]{64}$/.test(key || '')) return { ok: false, error: '格式錯誤' };
  var cache = CacheService.getScriptCache(), fails = +(cache.get('fail:owner') || 0);
  if (fails >= 10) return { ok: false, code: 'too-many', error: '密碼錯誤太多次，請 10 分鐘後再試' };
  var info = ownerInfo();
  if (digest(String(pw)) !== info.pwHash) { cache.put('fail:owner', String(fails + 1), 600); return { ok: false, code: 'bad-login', error: '帳號或密碼錯誤' }; }
  cache.remove('fail:owner');
  var salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('owner:acct', JSON.stringify({ user: info.user, salt: salt, hash: digest(salt + ':' + key) }));
  return { ok: true, user: info.user };
}
function ownerLogin(key) {
  var acc = ownerAccount();
  if (!acc || !key) return { ok: false, code: 'bad-login', error: '登入已失效' };
  var cache = CacheService.getScriptCache(), fails = +(cache.get('fail:owner') || 0);
  if (fails >= 10) return { ok: false, code: 'too-many', error: '密碼錯誤太多次，請 10 分鐘後再試' };
  if (digest(acc.salt + ':' + key) !== acc.hash) { cache.put('fail:owner', String(fails + 1), 600); return { ok: false, code: 'bad-login', error: '登入已失效' }; }
  return { ok: true, user: acc.user };
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
  var data = publicView(JSON.parse(it.next().getBlob().getDataAsString()));
  return json({ ok: true, exportedAt: data.exportedAt, data: lite ? data : withFiles(folder, data) });
}
function readData(folder) {
  var it = folder.getFilesByName('data.json');
  return it.hasNext() ? JSON.parse(it.next().getBlob().getDataAsString()) : null;
}
// 給訪客的版本：只留公開、沒刪除的作品；不公開相簿和裡面的圖片拿掉；設定裡的密碼雜湊、閱讀進度拿掉
var WORK_STORES = ['novels', 'images', 'diaries', 'crafts', 'books'];
function publicView(data) {
  var out = {}, hiddenAlbum = {};
  Object.keys(data).forEach(function (k) { out[k] = data[k]; });
  (data.albums || []).forEach(function (a) { if (a.visibility === 'private' || a.deleted) hiddenAlbum[a.id] = true; });
  out.albums = (data.albums || []).filter(function (a) { return !hiddenAlbum[a.id]; });
  WORK_STORES.forEach(function (s) {
    out[s] = (data[s] || []).filter(function (it) { return it.visibility === 'public' && !it.deleted && !(it.albumId && hiddenAlbum[it.albumId]); });
  });
  if (data.settings) {
    out.settings = {};
    Object.keys(data.settings).forEach(function (k) { if (!/hash|password|secret/i.test(k)) out.settings[k] = data.settings[k]; });
  }
  out.progress = [];
  // 內文媒體檔（日記插圖、背景音樂等）：只留公開內容有用到的
  var used = JSON.stringify([out.settings, out.albums, out.categories].concat(WORK_STORES.map(function (s) { return out[s]; })));
  out.mediaFiles = (data.mediaFiles || []).filter(function (mf) { return used.indexOf(mf.id) >= 0; });
  return out;
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

// ==================== 市集與點數 ====================
// 資料存在「市集」資料夾：wallet.json（點數、購買紀錄、明細）、listings.json（上架清單）、作品/<id>.json（完整內容）
// 點數只記在這裡，網站端改不了；所有加扣點都在鎖裡做，兩筆交易同時進來也不會算錯
var MARKET_FOLDER = '市集';
var MARKET = { SIGNUP: 50, POST_REWARD: 10, DAILY_MAX: 3, MIN_LEN: 800, MAX_PRICE: 100, FREE_CHARS: 300 };
var MARKET_TYPES = { novel: 1, diary: 1, image: 1 };

function marketFolder(sub) {
  var root = DriveApp.getFolderById(DEFAULT_FOLDER_ID), it = root.getFoldersByName(MARKET_FOLDER);
  var f = it.hasNext() ? it.next() : root.createFolder(MARKET_FOLDER);
  if (!sub) return f;
  var s = f.getFoldersByName(sub);
  return s.hasNext() ? s.next() : f.createFolder(sub);
}
function readJson(folder, name, dflt) {
  var it = folder.getFilesByName(name);
  return it.hasNext() ? JSON.parse(it.next().getBlob().getDataAsString()) : dflt;
}
function writeJson(folder, name, obj) {
  var it = folder.getFilesByName(name), text = JSON.stringify(obj);
  if (it.hasNext()) it.next().setContent(text); else folder.createFile(name, text, 'application/json');
}
function whoami(body) {
  if (!body.key) return null;
  if (body.u) return login(body.u, body.key).ok ? body.u : null;
  return ownerLogin(body.key).ok ? ownerName() : null;
}
function today() { return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd'); }
function addTx(w, u, e) { e.t = new Date().toISOString(); w.tx[u] = [e].concat(w.tx[u] || []).slice(0, 100); }
function ensureWallet(w, u) {
  if (w.bal[u] == null) { w.bal[u] = MARKET.SIGNUP; addTx(w, u, { type: 'signup', amt: MARKET.SIGNUP, note: '新會員贈點' }); }
}
function dailyCount(w, u) { var d = (w.daily[u] || '').split('|'); return d[0] === today() ? +d[1] : 0; }
function emptyWallet() { return { bal: {}, bought: {}, daily: {}, hashes: {}, tx: {}, posted: {} }; }
// 內容指紋：同樣的文字只會拿一次發文點數（刪掉重發、複製成新作品都不算）
function textHash(text) { return digest('t:' + text); }
function novelText(chs) { return (chs || []).map(function (c) { return String(c.content || ''); }).join('\n'); }

// 在自己網站發文就給點數（每次同步上傳 data.json 時檢查）
// 第一次檢查某人時，把他 24 小時以前的作品記成「舊作」不給點，之後新發的才算；字數不夠的先不記，之後補滿再給
// 記錄放在 w.posted（舊版 w.seen 會把剛發的文也當舊作，所以換新欄位讓大家重新判斷一次；給過點的有內容指紋，不會重複給）
var RECENT_MS = 24 * 3600 * 1000;
function rewardPosts(user, data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var mf = marketFolder(), w = readJson(mf, 'wallet.json', emptyWallet());
    w.posted = w.posted || {};
    var first = !w.posted[user], seen = w.posted[user] || {}, changed = first, got = [], skipped = [], short = [];
    var works = [], now = Date.now();
    var textWork = function (kind) { return function (d) { if (d.status !== 'draft') works.push({ key: kind + ':' + d.id, it: d, title: d.title, text: plainText(d.content) }); }; };
    (data.novels || []).forEach(function (n) { works.push({ key: 'novel:' + n.id, it: n, title: n.title, text: novelText(n.chapters) }); });
    (data.diaries || []).forEach(textWork('diary'));
    (data.crafts || []).forEach(textWork('craft'));
    (data.images || []).forEach(function (im) { works.push({ key: 'image:' + im.id, it: im, title: im.title || '圖片', image: true }); });
    works.forEach(function (x) {
      if (x.it.deleted || x.it.demo || seen[x.key]) return;
      var recent = now - Date.parse(x.it.createdAt || x.it.updatedAt || 0) < RECENT_MS;
      if (first && !recent) { seen[x.key] = 1; return; }
      if (!x.image && x.text.length < MARKET.MIN_LEN) { if (recent) short.push({ title: x.title, len: x.text.length }); return; } // 字數還不夠：下次同步再看
      seen[x.key] = 1; changed = true;
      var h = x.image ? digest('img:' + (x.it.fileId || x.it.id)) : textHash(x.text);
      if (w.hashes[h]) return;
      if (dailyCount(w, user) >= MARKET.DAILY_MAX) { skipped.push(x.title); return; }
      w.hashes[h] = x.key;
      ensureWallet(w, user);
      w.bal[user] += MARKET.POST_REWARD;
      w.daily[user] = today() + '|' + (dailyCount(w, user) + 1);
      addTx(w, user, { type: 'post', amt: MARKET.POST_REWARD, note: '發文獎勵：' + x.title });
      got.push(x.title);
    });
    w.posted[user] = seen;
    if (changed) writeJson(mf, 'wallet.json', w);
    return { got: got, each: MARKET.POST_REWARD, capped: skipped, short: short, minLen: MARKET.MIN_LEN, balance: w.bal[user] == null ? null : w.bal[user] };
  } finally { lock.releaseLock(); }
}
function plainText(html) { return String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, '').replace(/\s+/g, ''); }

function market(body) {
  var a = body.action, mf = marketFolder();
  if (a === 'm.list') {
    var me = whoami(body), w0 = me ? readJson(mf, 'wallet.json', emptyWallet()) : null;
    var list = readJson(mf, 'listings.json', []).filter(function (l) { return !l.removed; }).reverse();
    return { ok: true, rules: MARKET, listings: list, me: me ? { user: me, balance: w0.bal[me] == null ? MARKET.SIGNUP : w0.bal[me], bought: w0.bought[me] || [] } : null };
  }
  if (a === 'm.get') return marketGet(body, mf);
  // 頁首顯示用：只讀餘額，不上鎖、不寫檔
  if (a === 'm.bal') {
    var who = whoami(body);
    if (!who) return { ok: false, code: 'bad-login', error: '請先登入' };
    var wb = readJson(mf, 'wallet.json', emptyWallet());
    return { ok: true, user: who, balance: wb.bal[who] == null ? MARKET.SIGNUP : wb.bal[who] };
  }

  var user = whoami(body);
  if (!user) return { ok: false, code: 'bad-login', error: '請先登入' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var w = readJson(mf, 'wallet.json', emptyWallet());
    ensureWallet(w, user);
    var res;
    if (a === 'm.me') {
      var mine = readJson(mf, 'listings.json', []).filter(function (l) { return l.seller === user && !l.removed; }).reverse();
      res = { ok: true, rules: MARKET, user: user, balance: w.bal[user], bought: w.bought[user] || [], tx: (w.tx[user] || []).slice(0, 50), postedToday: dailyCount(w, user), mine: mine, isOwner: user === ownerName() };
    } else if (a === 'm.publish') res = marketPublish(body, user, w, mf);
    else if (a === 'm.buy') res = marketBuy(body, user, w, mf);
    else if (a === 'm.remove') res = marketRemove(body, user, mf);
    else if (a === 'm.edit') res = marketEdit(body, user, mf);
    else if (a === 'm.comment') res = marketComment(body, user, w, mf);
    else if (a === 'm.uncomment') res = marketUncomment(body, user, mf);
    else return { ok: false, error: 'unknown action' };
    if (res.ok) writeJson(mf, 'wallet.json', w);
    return res;
  } finally { lock.releaseLock(); }
}

function marketPublish(b, user, w, mf) {
  if (!MARKET_TYPES[b.type]) return { ok: false, error: '不支援的作品類型' };
  var title = String(b.title || '').trim().slice(0, 100);
  if (!title) return { ok: false, error: '請輸入標題' };
  var price = Math.floor(+b.price || 0);
  if (price < 0 || price > MARKET.MAX_PRICE) return { ok: false, error: '價格要在 0–' + MARKET.MAX_PRICE + ' 點之間' };
  var c = b.content || {}, content, preview, words = 0, chapters = 0;
  if (b.type === 'novel') {
    var chs = (c.chapters || []).map(function (x) { return { title: String(x.title || '').slice(0, 200), content: String(x.content || '') }; });
    if (!chs.length) return { ok: false, error: '至少要有一章' };
    chs.forEach(function (x) { words += x.content.length; });
    chapters = chs.length;
    var free = Math.max(0, Math.min(chs.length, Math.floor(+b.freeChapters || 0)));
    content = { chapters: chs };
    preview = { chapters: chs.slice(0, free), free: free };
  } else if (b.type === 'diary') {
    var html = String(c.html || '');
    words = plainText(html).length;
    content = { html: html };
    preview = { text: plainText(html).slice(0, MARKET.FREE_CHARS) };
  } else {
    if (!/^data:image\//.test(c.data || '')) return { ok: false, error: '圖片格式錯誤' };
    content = { data: c.data };
    preview = {};
  }
  var cover = /^data:image\//.test(b.cover || '') && b.cover.length < 80000 ? b.cover : '';
  var id = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  writeJson(marketFolder('作品'), id + '.json', { content: content, preview: preview });

  // 上架到市集不給點數；點數只來自在自己網站寫作、發文（見 rewardPosts）和作品賣出
  var listings = readJson(mf, 'listings.json', []);
  var l = { id: id, seller: user, type: b.type, title: title, desc: String(b.desc || '').slice(0, 500), price: price, cover: cover, words: words, chapters: chapters, free: preview.free || 0, sales: 0, createdAt: new Date().toISOString() };
  setInfo(l, b);
  listings.push(l);
  writeJson(mf, 'listings.json', listings);
  return { ok: true, id: id, balance: w.bal[user] };
}

function marketBuy(b, user, w, mf) {
  var listings = readJson(mf, 'listings.json', []), l = listings.filter(function (x) { return x.id === b.id; })[0];
  if (!l || l.removed) return { ok: false, error: '這件作品已下架' };
  if (l.seller === user) return { ok: false, error: '這是你自己的作品' };
  var mine = w.bought[user] || [];
  if (mine.indexOf(l.id) >= 0) return { ok: true, balance: w.bal[user], already: true };
  if (w.bal[user] < l.price) return { ok: false, code: 'poor', error: '點數不夠：需要 ' + l.price + ' 點，你有 ' + w.bal[user] + ' 點' };
  if (l.price > 0) {
    ensureWallet(w, l.seller);
    w.bal[user] -= l.price;
    w.bal[l.seller] += l.price;
    addTx(w, user, { type: 'buy', amt: -l.price, id: l.id, other: l.seller, note: '購買：' + l.title });
    addTx(w, l.seller, { type: 'sale', amt: l.price, id: l.id, other: user, note: '賣出：' + l.title });
  }
  w.bought[user] = mine.concat(l.id);
  l.sales = (l.sales || 0) + 1;
  writeJson(mf, 'listings.json', listings);
  return { ok: true, balance: w.bal[user] };
}

// 書的資料：作者（筆名，可和上架帳號不同）、叢書名、卷數（顯示文字，例如「第三卷」）
function setInfo(l, b) {
  if (b.sourceId) l.sourceId = String(b.sourceId).slice(0, 40); // 原作在作者網站上的 id，之後可以同步作者名稱
  l.author = String(b.author || '').trim().slice(0, 50);
  l.series = String(b.series || '').trim().slice(0, 100);
  l.volume = l.series ? String(b.volume == null ? '' : b.volume).trim().slice(0, 20) : '';
  // 小說狀態，和作者網站上的一樣
  if (b.status !== undefined) l.status = ['連載中', '已完結', '暫停'].indexOf(b.status) >= 0 ? b.status : '';
}
// 改書的資料（不能改價格與內容）：作者或站長
function marketEdit(b, user, mf) {
  var listings = readJson(mf, 'listings.json', []), l = listings.filter(function (x) { return x.id === b.id; })[0];
  if (!l) return { ok: false, error: '找不到這件作品' };
  if (l.seller !== user && user !== ownerName()) return { ok: false, error: '只有作者可以修改' };
  var title = String(b.title || '').trim().slice(0, 100);
  if (!title) return { ok: false, error: '請輸入標題' };
  l.title = title;
  l.desc = String(b.desc || '').slice(0, 500);
  setInfo(l, b);
  writeJson(mf, 'listings.json', listings);
  return { ok: true, listing: l };
}

// ---- 讀者留言：存在 市集/留言/<作品id>.json ----
// 看得到全文的人才能留言（買過的、免費作品、作者、站長）；大家都看得到留言
function findListing(listings, id) { return listings.filter(function (x) { return x.id === id; })[0]; }
function marketComment(b, user, w, mf) {
  var listings = readJson(mf, 'listings.json', []), l = findListing(listings, b.id);
  if (!l) return { ok: false, error: '找不到這件作品' };
  var allowed = l.price === 0 || user === l.seller || user === ownerName() || (w.bought[user] || []).indexOf(l.id) >= 0;
  if (!allowed) return { ok: false, error: '購買後才能留言' };
  var text = String(b.text || '').trim().slice(0, 500);
  if (!text) return { ok: false, error: '請輸入留言' };
  // 防洗版：同一個人 10 秒內只能留一則
  var cache = CacheService.getScriptCache(), ck = 'cmt:' + user;
  if (cache.get(ck)) return { ok: false, error: '留言太快了，請稍等幾秒' };
  cache.put(ck, '1', 10);
  var cf = marketFolder('留言'), list = readJson(cf, l.id + '.json', []);
  list.push({ id: Utilities.getUuid().slice(0, 8), user: user, text: text, t: new Date().toISOString() });
  writeJson(cf, l.id + '.json', list);
  l.comments = list.length;
  writeJson(mf, 'listings.json', listings);
  return { ok: true, comments: list };
}
// 刪留言：留言的人、這本書的作者、站長
function marketUncomment(b, user, mf) {
  var listings = readJson(mf, 'listings.json', []), l = findListing(listings, b.id);
  if (!l) return { ok: false, error: '找不到這件作品' };
  var cf = marketFolder('留言'), list = readJson(cf, l.id + '.json', []);
  var c = list.filter(function (x) { return x.id === b.cid; })[0];
  if (!c) return { ok: false, error: '找不到這則留言' };
  if (c.user !== user && l.seller !== user && user !== ownerName()) return { ok: false, error: '不能刪別人的留言' };
  list = list.filter(function (x) { return x.id !== b.cid; });
  writeJson(cf, l.id + '.json', list);
  l.comments = list.length;
  writeJson(mf, 'listings.json', listings);
  return { ok: true, comments: list };
}

// 作者或站長可以下架；已經買的人還是看得到
function marketRemove(b, user, mf) {
  var listings = readJson(mf, 'listings.json', []), l = listings.filter(function (x) { return x.id === b.id; })[0];
  if (!l) return { ok: false, error: '找不到這件作品' };
  if (l.seller !== user && user !== ownerName()) return { ok: false, error: '只有作者可以下架' };
  l.removed = true;
  writeJson(mf, 'listings.json', listings);
  return { ok: true };
}

// 看作品：免費、自己的、買過的、站長 → 完整內容；其他人只給試看
function marketGet(b, mf) {
  var l = readJson(mf, 'listings.json', []).filter(function (x) { return x.id === b.id; })[0];
  if (!l) return { ok: false, error: '找不到這件作品' };
  var user = whoami(b), w = readJson(mf, 'wallet.json', emptyWallet());
  var mine = !!user && (user === l.seller || user === ownerName());
  var bought = !!user && (w.bought[user] || []).indexOf(l.id) >= 0;
  if (l.removed && !bought && !mine) return { ok: false, error: '這件作品已下架' };
  var full = l.price === 0 || bought || mine;
  var item = readJson(marketFolder('作品'), l.id + '.json', null);
  if (!item) return { ok: false, error: '作品內容遺失' };
  return { ok: true, listing: l, full: full, comments: readJson(marketFolder('留言'), l.id + '.json', []), canComment: !!user && full, bought: bought, admin: !!user && user === ownerName(), content: full ? item.content : null, preview: item.preview, me: user || null };
}
