/**
 * 個人作品網站 → Google Drive 上傳接收端
 *
 * 部署方式：
 * 1. 到 https://script.google.com 建立新專案，貼上此檔。
 * 2. 「部署」→「新增部署作業」→ 類型選「網路應用程式」。
 * 3. 「執行身分」選「我」（你的帳號）；「存取權」選「僅限自己」或「知道連結的任何人」。
 *    ※ 選「任何人」方便網站跨來源 POST；資料夾內容只有你能看。
 * 4. 複製產生的 /exec 網址，貼到網站「管理 → Google Drive → Apps Script Web App URL」。
 */

// 目標資料夾（可在網站後台覆寫，或在此改預設值）
var DEFAULT_FOLDER_ID = '1OEQ7Cjq6AK6QAeU1CgaxYN0GjdAaIwdF';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var folderId = body.folderId || DEFAULT_FOLDER_ID;
    var folder = DriveApp.getFolderById(folderId);

    // 分批模式：putJson 存文字資料；putFile 存單一檔案（img-<id>）
    if (body.action === 'putJson') {
      upsert(folder, 'data.json', Utilities.newBlob(JSON.stringify(body.data), 'application/json', 'data.json'));
      PropertiesService.getScriptProperties().setProperty('exportedAt', body.data.exportedAt || '');
      return ContentService.createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (body.action === 'putFile') {
      var fb64 = body.data.split(',')[1];
      var fmime = /data:(.*?);/.exec(body.data)[1];
      upsert(folder, 'img-' + body.id, Utilities.newBlob(Utilities.base64Decode(fb64), fmime, 'img-' + body.id));
      return ContentService.createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

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
      upsert(folder, 'img-' + f.id, blob);
    });

    return ContentService.createTextOutput(JSON.stringify({ ok: true, images: imageFiles.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// GET ?ping=1 → 健康檢查；?meta=1 → 只回傳版本時間；無參數 → 回傳最新完整備份（含圖片 base64）
function doGet(e) {
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
    // 補回圖片 base64
    var map = {};
    var files = folder.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      if (f.getName().indexOf('img-') === 0) map[f.getName().slice(4)] = f;
    }
    var encode = function (file) {
      return 'data:' + file.getBlob().getContentType() + ';base64,' + Utilities.base64Encode(file.getBlob().getBytes());
    };
    (data.images || []).forEach(function (im) {
      if (map[im.fileId]) im.data = encode(map[im.fileId]);
      if (im.origFileId && map[im.origFileId]) im.origData = encode(map[im.origFileId]);
      (im.versions || []).forEach(function (v) { if (map[v.fileId]) v.data = encode(map[v.fileId]); });
    });
    (data.mediaFiles || []).forEach(function (mf) {
      if (map[mf.id]) mf.data = encode(map[mf.id]);
    });
    return ContentService.createTextOutput(JSON.stringify({ ok: true, exportedAt: data.exportedAt, data: data }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 同名檔案覆寫（保留單一最新版）；舊版移至垃圾桶以免堆積
function upsert(folder, name, blob) {
  var it = folder.getFilesByName(name);
  while (it.hasNext()) it.next().setTrashed(true);
  folder.createFile(blob);
}
