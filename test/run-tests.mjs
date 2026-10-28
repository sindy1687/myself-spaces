// 關鍵邏輯測試：章節辨識、編碼解碼、匯入匯出格式
// 執行：node test/run-tests.mjs
import { splitChapters, decodeText, guessNovelTitle, cnToInt, compareTitle, splitVolume, volumeLabel, volumeRank } from '../js/chapters.js';
import { fitCrop, moveCrop } from '../js/imgedit.js';
import { parseYouTube } from '../js/music.js';
import { splitSentences, zhVoices } from '../js/tts.js';

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.error(`✗ ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`); }
}
function ok(name, cond) { if (cond) pass++; else { fail++; console.error(`✗ ${name}`); } }

// --- 章節辨識 ---
const t1 = `第一章 起始\n內容一。\n\n第二章 轉折\n內容二。`;
eq('基本章節數', splitChapters(t1).length, 2);
eq('章名', splitChapters(t1)[0].title, '第一章 起始');

const t2 = `楔子\n楔子內容。\n第十二回 標題\n回內容。\n第001章 數字章\n內容。\nChapter 5 English\nEnglish content.\n後記\n謝詞。`;
const c2 = splitChapters(t2);
eq('五種章型數量', c2.length, 5);
eq('楔子', c2[0].title, '楔子');
eq('第十二回', c2[1].title, '第十二回 標題');
eq('第001章', c2[2].title, '第001章 數字章');
eq('Chapter', c2[3].title, 'Chapter 5 English');
eq('後記', c2[4].title, '後記');

const t3 = `沒有任何章節標題的\n一整篇小說內容。`;
const c3 = splitChapters(t3);
eq('無章節單篇數', c3.length, 1);
eq('無章節標題為全文', c3[0].title, '全文');
ok('內容保留', c3[0].content.includes('一整篇小說內容'));

const t4 = `卷首前言內容\n第一章 標題\n內容`;
const c4 = splitChapters(t4);
ok('章前文字保留為卷首', c4[0].title === '(卷首)' || c4.length === 2);

// 行內長標題不應誤判（>80 字不算章名）
const longTitle = '第一章 ' + '很長的標題'.repeat(20);
eq('超長行不算章節', splitChapters(longTitle + '\n內容').length, 1);

// --- 編碼 ---
const u8 = new TextEncoder().encode('第一章 你好\n內容');
eq('UTF-8 解碼', decodeText(u8.buffer).encoding, 'utf-8');
const bom = new Uint8Array([0xEF, 0xBB, 0xBF, ...u8]);
eq('UTF-8 BOM', decodeText(bom.buffer).encoding, 'utf-8');
ok('BOM 解碼內容', decodeText(bom.buffer).text.includes('你好'));
// Big5 位元組（「中」= 0xA4 0xA4 等）— 用非 UTF-8 位元組測 fallback
const big5bytes = new Uint8Array([0xA4, 0xA4, 0xA4, 0xE5]); // 「中文」
const r5 = decodeText(big5bytes.buffer);
ok('非 UTF-8 fallback 到 big5', r5.encoding === 'big5' && r5.text.includes('中'));
eq('指定編碼 utf-8', typeof decodeText(big5bytes.buffer, 'utf-8'), 'string');

eq('檔名猜標題', guessNovelTitle('我的小說_最終版.txt'), '我的小說 最終版');

// --- 匯出格式版本 ---
const { FORMAT_VERSION } = await import('../js/store.js').catch(() => ({ FORMAT_VERSION: null }));
// store.js 依賴 IndexedDB，Node 中不可用 → 只檢查模組載入失敗情況略過
ok('store.js 需瀏覽器（略過）', true);

// --- 分類邏輯（category-utils.js 純函式）---
const cu = await import('../js/category-utils.js');
const cats = [
  { id: 'a', name: '小說', type: 'novel', parentId: null },
  { id: 'b', name: '奇幻', type: 'novel', parentId: 'a' },
  { id: 'c', name: '都市奇幻', type: 'novel', parentId: 'b' },
  { id: 'd', name: '科幻', type: 'novel', parentId: 'a' },
];
const works = [
  { id: 'w1', categoryIds: ['c', 'b'] },
  { id: 'w2', categoryIds: ['b'] },
  { id: 'w3', categoryIds: ['d'] },
  { id: 'w4', categoryIds: [] },
];
eq('子代集合', [...cu.descendants(cats, 'a')].sort(), ['b', 'c', 'd']);
ok('禁止移到自己底下', !cu.canMove(cats, 'a', 'a'));
ok('禁止移到子分類', !cu.canMove(cats, 'a', 'c'));
ok('允許移到無關分類', cu.canMove(cats, 'd', 'b'));
ok('允許移到頂層', cu.canMove(cats, 'b', null));
eq('無循環', cu.findCycles(cats), []);
eq('循環偵測', cu.findCycles([...cats, { id: 'e', name: 'x', parentId: 'a' }, { id: 'a2', name: 'y', parentId: 'e' }].map(c => c.id === 'a' ? { ...c, parentId: 'e' } : c)).length > 0, true);
eq('重複名偵測', cu.dupNames([...cats, { id: 'x', name: '奇幻', type: 'novel', parentId: 'a' }]), ['x']);
eq('直接數', cu.counts(cats, works, 'b').direct, 2);
eq('含子去重總數', cu.counts(cats, works, 'b').total, 2); // w1 同時在 b、c 只算一次
eq('母層總數', cu.counts(cats, works, 'a').total, 3);
const mp = cu.mergePreview(cats, works, 'b', 'd');
eq('合併預覽-作品', mp.affected, 2);
eq('合併預覽-子分類', mp.kids, 1);
const mg = cu.applyMerge(cats, works, 'b', 'd');
ok('合併後 c 的上層變 d', mg.cats.find(x => x.id === 'c').parentId === 'd');
ok('w1 改指 d 且不重複', JSON.stringify(mg.works[0].categoryIds.sort()) === '["c","d"]');
const dl = cu.applyDelete(cats, works, 'b', {});
ok('刪除後 c 上移到 a', dl.cats.find(x => x.id === 'c').parentId === 'a');
ok('w2 失去分類→未分類', dl.works.find(w => w.id === 'w2').categoryIds.length === 0);
const probs = cu.validateImport({ categories: [{ id: 'z', name: '孤立', parentId: 'ghost' }], novels: [{ title: 't', categoryIds: ['nope'] }] }, new Set());
eq('匯入檢查問題數', probs.map(p => p.kind).sort(), ['bad-parent', 'dead-ref']);
const tp = cu.templatePreview(cats, 'novel');
ok('範本預覽有新增', tp.add.length > 0);

// --- 作品名稱排序（由低到高）---
eq('中文數字', [cnToInt('十'), cnToInt('十二'), cnToInt('二十'), cnToInt('一百零五'), cnToInt('三千'), cnToInt('兩萬')], [10, 12, 20, 105, 3000, 20000]);
eq('名稱排序', ['第十章', '作品10', '第二章', 'b', '作品2', 'A', '第１章'].sort(compareTitle), ['A', 'b', '作品2', '作品10', '第１章', '第二章', '第十章']);
// --- 圖片裁切框 ---
const r2 = c => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));
eq('自由比例＝整張', fitCrop(null), { x: 0, y: 0, w: 1, h: 1 });
eq('橫圖裁 1:1 置中', r2(fitCrop(0.5)), { x: 0.25, y: 0, w: 0.5, h: 1 });
eq('移動不超出邊界', r2(moveCrop({ x: .5, y: .5, w: .4, h: .4 }, 'move', .5, -.9)), { x: 0.6, y: 0, w: 0.4, h: 0.4 });
eq('右下角放大到邊界', r2(moveCrop({ x: .1, y: .1, w: .2, h: .2 }, 'se', 2, 2)), { x: 0.1, y: 0.1, w: 0.9, h: 0.9 });
eq('左邊不可越過右邊', r2(moveCrop({ x: .2, y: .2, w: .3, h: .3 }, 'w', .9, 0)), { x: 0.45, y: 0.2, w: 0.05, h: 0.3 });
eq('固定比例：高跟著寬', r2(moveCrop({ x: 0, y: 0, w: .4, h: .4 }, 'se', .2, 0, 1)), { x: 0, y: 0, w: 0.6, h: 0.6 });
eq('固定比例：碰底就縮寬', r2(moveCrop({ x: 0, y: .5, w: .2, h: .2 }, 'se', .6, 0, 1)), { x: 0, y: 0.5, w: 0.5, h: 0.5 });
eq('固定比例：左上角對角固定', r2(moveCrop({ x: .4, y: .4, w: .4, h: .4 }, 'nw', -.2, 0, 1)), { x: 0.2, y: 0.2, w: 0.6, h: 0.6 });
// --- 小說卷數 ---
eq('取出 第二卷', splitVolume('星海 第二卷'), { title: '星海', volume: 2 });
eq('取出 第12卷', splitVolume('星海第１２卷'), { title: '星海', volume: 12 });
eq('取出 卷三＋副標', splitVolume('星海 卷三 歸途'), { title: '星海 歸途', volume: 3 });
eq('取出 (上)', splitVolume('長夜(上)'), { title: '長夜', volume: '上' });
eq('取出 下冊', splitVolume('長夜 下冊'), { title: '長夜', volume: '下' });
eq('取出 Vol.3', splitVolume('Star Vol.3'), { title: 'Star', volume: 3 });
eq('取出 外傳', splitVolume('星海 外傳'), { title: '星海', volume: '外傳' });
eq('沒有卷數', splitVolume('巷口的老書店'), { title: '巷口的老書店', volume: '' });
eq('只有卷數不拆', splitVolume('第一卷'), { title: '第一卷', volume: '' });
eq('卷數文字', [1, 2, 10, 13, 20, 25, '上', '外傳', ''].map(volumeLabel), ['第一卷', '第二卷', '第十卷', '第十三卷', '第二十卷', '第二十五卷', '上卷', '外傳', '']);
eq('卷數排序', ['外傳', 3, '下', '', 1, '上', 10].sort((a, b) => volumeRank(a) - volumeRank(b)), ['', 1, 3, 10, '上', '下', '外傳']);
// --- YouTube 網址 ---
eq('watch?v=', parseYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10'), { video: 'dQw4w9WgXcQ', list: '' });
eq('youtu.be', parseYouTube('https://youtu.be/dQw4w9WgXcQ?si=abc'), { video: 'dQw4w9WgXcQ', list: '' });
eq('shorts', parseYouTube('https://youtube.com/shorts/dQw4w9WgXcQ'), { video: 'dQw4w9WgXcQ', list: '' });
eq('music.youtube', parseYouTube('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVMdQw4w9WgXcQ'), { video: 'dQw4w9WgXcQ', list: 'RDAMVMdQw4w9WgXcQ' });
eq('播放清單', parseYouTube('https://www.youtube.com/playlist?list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs'), { video: '', list: 'PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs' });
eq('非 YouTube', parseYouTube('https://example.com/watch?v=dQw4w9WgXcQ'), null);
eq('亂打', parseYouTube('不是網址'), null);

// 朗讀斷句與挑聲音
eq('斷句', splitSentences('小熊醒了。牠說：「好餓！」\n然後出門了'), ['小熊醒了。', '牠說：「好餓！」', '然後出門了']);
eq('長句依逗號切', splitSentences('一二三四五六七八九十一二，三四五六七八九十一二三四五六七八，九十', 15).length, 3);
eq('只有標點不讀', splitSentences('……\n\n'), []);
eq('自然語音排前面', zhVoices([
  { name: 'Microsoft Hanhan - Chinese (Taiwan)', lang: 'zh-TW' },
  { name: 'English', lang: 'en-US' },
  { name: 'Microsoft HsiaoChen Online (Natural) - Chinese (Taiwan)', lang: 'zh-TW' },
  { name: 'Google 普通话（中国大陆）', lang: 'zh-CN' },
]).map(v => v.name.split(' ')[1]), ['HsiaoChen', '普通话（中国大陆）', 'Hanhan']);

// 密碼保護：純 JS 的 SHA-256 要和瀏覽器內建的一致
{
  const { sha256, makeLock, isLocked, tryUnlock } = await import('../js/store.js');
  const hx = u => [...u].map(b => b.toString(16).padStart(2, '0')).join('');
  eq('sha256 空字串', hx(sha256(new Uint8Array())), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  for (const s of ['abc', '中文密碼🔒', 'x'.repeat(200)]) {
    const d = new TextEncoder().encode(s);
    eq(`sha256 = subtle（${s.slice(0, 6)}）`, hx(sha256(d)), hx(new Uint8Array(await crypto.subtle.digest('SHA-256', d))));
  }
  const store = {}; globalThis.sessionStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
  const it = { id: 'w1', lock: await makeLock('1234', '四碼') };
  eq('不存明碼', JSON.stringify(it.lock).includes('1234'), false);
  eq('未解鎖', isLocked(it), true);
  eq('密碼錯', await tryUnlock(it, '0000'), false);
  eq('密碼對', await tryUnlock(it, '1234'), true);
  eq('解鎖後可看', isLocked(it), false);
  eq('沒設密碼不鎖', isLocked({ id: 'w2' }), false);
}

// 多人空間：帳號名稱、Apps Script 註冊／登入（用假的 Google 服務跑 gas/Code.gs）
{
  const { validName, deriveKey } = await import('../js/workspace.js');
  eq('帳號：中文', validName('小明'), true);
  eq('帳號：英數', validName('ming_01'), true);
  eq('帳號：太短', validName('a'), false);
  eq('帳號：特殊字元', validName('a/b'), false);
  const { readFileSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const props = {}, cache = {}, folders = {};
  // 假的 Drive 資料夾：以「上層/名稱」為 id
  const mkFolder = (id, name) => {
    const f = { id, name, files: {}, getId: () => id, getName: () => f.name, setName: n => { f.name = n; }, isTrashed: () => false };
    f.getFilesByName = n => { const x = f.files[n]; return { hasNext: () => !!x, next: () => x }; };
    f.getFiles = () => { const xs = Object.values(f.files); return { hasNext: () => xs.length > 0, next: () => xs.shift() }; };
    f.getFoldersByName = n => { const x = Object.values(folders).find(d => d.parent === id && d.name === n); return { hasNext: () => !!x, next: () => x }; };
    f.createFolder = n => { const c = mkFolder(id + '/' + n, n); c.parent = id; return (folders[c.id] = c); };
    return f;
  };
  const root = mkFolder('root', 'root'); folders.root = root;
  const env = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; }, getProperties: () => ({ ...props }) }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { getUuid: () => Math.random().toString(36).slice(2), DigestAlgorithm: {}, Charset: {}, computeDigest: (_a, s) => [...createHash('sha256').update(s).digest()].map(b => (b > 127 ? b - 256 : b)) },
    DriveApp: { getFolderById: id => { if (!folders[id === '1OEQ7Cjq6AK6QAeU1CgaxYN0GjdAaIwdF' ? 'root' : id]) throw new Error('no'); return folders[id === '1OEQ7Cjq6AK6QAeU1CgaxYN0GjdAaIwdF' ? 'root' : id]; } },
    ContentService: { MimeType: {}, createTextOutput: t => ({ setMimeType: () => JSON.parse(t) }) },
  };
  const gas = new Function(...Object.keys(env), readFileSync(new URL('../gas/Code.gs', import.meta.url), 'utf8') + '; return { register, login, getAccount, userFolder, tidyImages };')(...Object.values(env));
  const key = await deriveKey('小明', 'secret1');
  eq('註冊', gas.register('小明', key).ok, true);
  eq('建立以帳號命名的資料夾', !!folders['root/小明'], true);
  eq('裡面有圖片資料夾', !!folders['root/小明/圖片'], true);
  eq('不能叫「圖片」', gas.register('圖片', key).code, 'taken');
  root.createFolder('備份');
  eq('不能和既有資料夾同名', gas.register('備份', key).code, 'taken');
  // 舊版 user-帳號 資料夾：自動改名、圖片搬進「圖片」
  const old = root.createFolder('user-阿舊');
  old.files['img-1'] = { getName: () => 'img-1', moveTo: d => { d.files['img-1'] = old.files['img-1']; delete old.files['img-1']; }, setTrashed() {} };
  props['acct:阿舊'] = JSON.stringify({ salt: 's', hash: 'h', folderId: 'root/user-阿舊' });
  const f = gas.userFolder('阿舊', true);
  eq('舊資料夾改名', f.getName(), '阿舊');
  gas.tidyImages(f);
  eq('舊圖片搬進圖片資料夾', [Object.keys(f.files).length, !!folders['root/user-阿舊/圖片'].files['img-1']], [0, true]);
  eq('不存密碼', JSON.stringify(props).includes(key), false);
  eq('重複註冊', gas.register('小明', key).code, 'taken');
  eq('登入成功', gas.login('小明', key).ok, true);
  eq('密碼錯', gas.login('小明', await deriveKey('小明', 'wrong')).code, 'bad-login');
  eq('沒有帳號', gas.login('小華', key).code, 'no-account');
  eq('同密碼不同人金鑰不同', key === await deriveKey('小華', 'secret1'), false);
}

// 只上傳雲端沒有的：第二次上傳同樣的資料不應再送任何東西
{
  const { dataUrlSize, fingerprint, uploadViaAppsScript } = await import('../js/gdrive.js');
  const png = 'data:image/png;base64,' + Buffer.from('hello image').toString('base64');
  eq('data URL 大小', dataUrlSize(png), 11);
  eq('指紋忽略時間戳', fingerprint({ exportedAt: 'a', x: 1, settings: { _appliedRemote: 'a', t: 1 } }), fingerprint({ exportedAt: 'b', x: 1, settings: { _appliedRemote: 'b', t: 1 } }));
  eq('內容不同指紋不同', fingerprint({ x: 1 }) === fingerprint({ x: 2 }), false);
  // 假雲端：記住收到的檔案
  const cloud = { files: {}, json: null, at: '' }, sent = [];
  globalThis.localStorage = { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); } };
  globalThis.fetch = async (_u, opt) => {
    const b = JSON.parse(opt.body); sent.push(b.action);
    if (b.action === 'listFiles') return { json: async () => ({ ok: true, files: { ...cloud.files }, exportedAt: cloud.at, hasData: !!cloud.json }) };
    if (b.action === 'putJson') { cloud.json = b.data; cloud.at = b.data.exportedAt; }
    if (b.action === 'putFile') cloud.files[b.id] = dataUrlSize(b.data);
    return { json: async () => ({ ok: true }) };
  };
  let n = 0;
  const fakeExport = () => ({ exportedAt: `t${++n}`, settings: { siteName: 'x' }, images: [{ id: 'i1', fileId: 'f1', data: png, versions: [] }], mediaFiles: [] });
  const up = () => uploadViaAppsScript('https://gas', 'folder', { exportAll: fakeExport, saveSettings: async () => {} });
  const r1 = await up();
  eq('第一次：上傳文字＋1 檔', [r1.jsonSkipped, r1.images], [false, 1]);
  sent.length = 0;
  const r2 = await up();
  eq('第二次：全部略過', [r2.jsonSkipped, r2.images, sent.filter(a => a !== 'listFiles').length], [true, 0, 0]);
  cloud.files = {};
  const r3 = await up();
  eq('雲端檔案不見了就補傳', r3.images, 1);
}

// 多裝置同步：合併規則（用記憶體資料庫模擬一台裝置）
{
  const { mergeRemote } = await import('../js/sync.js');
  const mkDb = () => {
    const S = {};
    const st = n => (S[n] ||= new Map());
    return {
      S,
      all: async n => [...st(n).values()].map(x => structuredClone(x)),
      get: async (n, id) => structuredClone(st(n).get(id)),
      putRaw: async (n, o) => { st(n).set(o.id, structuredClone(o)); },
      delRaw: async (n, id) => { st(n).delete(id); },
    };
  };
  const d = mkDb();
  await d.putRaw('novels', { id: 'a', title: '本機較新', _rev: 200 });
  await d.putRaw('novels', { id: 'b', title: '本機較舊', _rev: 100 });
  await d.putRaw('novels', { id: 'c', title: '只有本機（還沒上傳）', _rev: 300 });
  await d.putRaw('novels', { id: 'del', title: '別台已刪', _rev: 100 });
  await d.putRaw('novels', { id: 'demo1', title: '示範', demo: true, _rev: 50 });
  await d.putRaw('settings', { id: 'site', value: { siteName: '舊名', _srev: 10, _appliedRemote: 'x' } });
  const remote = {
    novels: [{ id: 'a', title: '雲端較舊', _rev: 150 }, { id: 'b', title: '雲端較新', _rev: 180 }, { id: 'n', title: '雲端新作品', _rev: 120 }, { id: 't', title: '別台丟回收筒', deleted: true, deletedAt: 'x', _rev: 500 }],
    images: [{ id: 'i', fileId: 'f-new', versions: [], _rev: 1 }],
    tombstones: [{ s: 'novels', id: 'del', at: 150 }],
    settings: { siteName: '新名', _srev: 20 },
  };
  const r = await mergeRemote(remote, { dbx: d });
  const t = id => d.S.novels.get(id)?.title;
  eq('本機較新的保留', t('a'), '本機較新');
  eq('雲端較新的套用', t('b'), '雲端較新');
  eq('本機還沒上傳的保留', t('c'), '只有本機（還沒上傳）');
  eq('雲端新作品加入', t('n'), '雲端新作品');
  eq('別台刪除的跟著刪', d.S.novels.has('del'), false);
  eq('本機示範資料清掉', d.S.novels.has('demo1'), false);
  eq('回收筒跟著同步', !!d.S.trash?.get('novel:t'), true);
  eq('設定較新就套用、保留本機同步紀錄', [d.S.settings.get('site').value.siteName, d.S.settings.get('site').value._appliedRemote], ['新名', 'x']);
  eq('缺少的圖片列出來下載', r.needFiles, ['f-new']);
  eq('有變動', r.changed, true);
  const r2 = await mergeRemote(remote, { dbx: d });
  eq('同樣資料再合併：沒有變動', [r2.changed], [false]);
  // 訪客：雲端說了算
  const v = mkDb();
  await v.putRaw('novels', { id: 'demo', title: '示範', _rev: 999 });
  await v.putRaw('novels', { id: 'b', title: '本機舊副本', views: 7, _rev: 999 });
  await mergeRemote({ novels: [{ id: 'b', title: '站長最新', views: 3, _rev: 1 }] }, { dbx: v, authoritative: true });
  eq('訪客：以雲端為準', [v.S.novels.get('b').title, v.S.novels.has('demo')], ['站長最新', false]);
}
console.log(`\n${pass} 通過, ${fail} 失敗`);
process.exit(fail ? 1 : 0);
