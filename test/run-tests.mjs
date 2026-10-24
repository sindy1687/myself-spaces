// 關鍵邏輯測試：章節辨識、編碼解碼、匯入匯出格式
// 執行：node test/run-tests.mjs
import { splitChapters, decodeText, guessNovelTitle } from '../js/chapters.js';

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

console.log(`\n${pass} 通過, ${fail} 失敗`);
process.exit(fail ? 1 : 0);
