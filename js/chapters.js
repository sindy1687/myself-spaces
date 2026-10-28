// 章節辨識與文字編碼處理（純函式，可測試）

// 章節標記：出現在行首即算新章（標題後可接篇名，甚至內文）
// 容忍貼上來的 Markdown 前綴（#/##/###…、**粗體**）與《書名》裝飾
const NUM = '0-9０-９零一二三四五六七八九十百千兩萬壹貳參肆伍陸柒捌玖拾';
const MARKER = new RegExp(
  '^(?:#{1,6}[ \\t\\u3000]*)?(?:[*_]{1,2})?' +
  '(?:[【（(\\[「]*\\s*)?' +
  '(?:《[^》\\n]{1,60}》\\s*)?' +
  '(?:' +
  `第[${NUM}]+[章回節卷集部篇話]` +
  '|序章|序曲|楔子|前言|引子|後記|尾聲|終章|番外篇?|外傳' +
  `|卷[${NUM}]+` +
  '|Chapter\\s+[0-9０-９]+|CHAPTER\\s+[0-9０-９]+|Prologue|Epilogue' +
  ')[】）)\\]」]?(?:[*_]{1,2})?'
);

// 標題結束：空格/全形空格/冒號/破折號之後的短篇名（≤40 字，遇句號類標點截斷）
function parseHeaderLine(line) {
  const m = line.match(MARKER);
  if (!m) return null;
  const isNumbered = /^(?:第|Chapter|CHAPTER|卷)/i.test(
    m[0].replace(/^#{1,6}\s*/, '').replace(/^(?:[*_]{1,2})?[【（(\[「\s]*(?:《[^》\n]{1,60}》\s*)?/, ''));
  let title = m[0]
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[*_]{1,2}/, '')
    .replace(/^(?:[【（(\[「\s]+|《[^》\n]{1,60}》\s*)+/, '')
    .replace(/(?:[】）)\]」]+|[*_]{1,2})+$/, '')
    .trim();
  let rest = line.slice(m[0].length).replace(/[*_]{1,2}\s*$/, '');
  // 關鍵字型標記（楔子/序/後記…）：後面接長內文或句號時，不算章節
  if (!isNumbered && /[。！？!?]/.test(rest)) return null;
  if (!isNumbered && rest.replace(/^[\s\u3000:：\-—─．.]+/, '').length > 40) return null;
  const sep = rest.match(/^[\s\u3000:：\-—─．.]+/);
  if (sep) {
    rest = rest.slice(sep[0].length);
    const tm = rest.match(/^[^\n。！？!?]{1,40}/);
    if (tm) { title += ' ' + tm[0].trim(); rest = rest.slice(tm[0].length); }
  } else if (rest.trim() && rest.trim().length <= 40 && !/[。！？!?]/.test(rest)) {
    title += rest.trim(); rest = '';
  }
  return { title: title.trim(), rest: rest.trim() };
}

export function splitChapters(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const chapters = [];
  let cur = null;
  const push = () => { if (cur) chapters.push(cur); };
  for (const line of lines) {
    const t = line.trim();
    if (!t) { if (cur) cur.content += '\n'; continue; }
    // 卷首的純《書名》行是書名裝飾，不算章節也不進內文
    if (/^#{0,6}\s*《[^》\n]{1,60}》\s*$/.test(t) && (!cur || cur.title === '(卷首)')) continue;
    const h = parseHeaderLine(t);
    if (h) {
      push();
      cur = { title: h.title, content: h.rest ? h.rest + '\n' : '' };
    } else if (cur) {
      cur.content += line + '\n';
    } else {
      cur = { title: '(卷首)', content: line + '\n' };
    }
  }
  push();
  const cleaned = chapters.filter((c, i) => !(i === 0 && c.title === '(卷首)' && !c.content.trim()));
  if (cleaned.length === 1 && cleaned[0].title === '(卷首)') {
    // 整篇無換行章節 → 以「第X章」出現位置切分
    const inline = splitInline(cleaned[0].content);
    if (inline.length > 1) return inline;
    cleaned[0].title = '全文';
  }
  return cleaned.map(c => ({ ...c, content: c.content.trim() }));
}

// 在連續文字中找「第X章（可接≤30字篇名）」切分
function splitInline(text) {
  const re = new RegExp(`第[${NUM}]+[章回節卷集部篇話](?:[\\s\\u3000:：\\-—]+[^\\s\\n。！？!?]{1,20})?`, 'g');
  const hits = [];
  let m;
  while ((m = re.exec(text))) hits.push({ at: m.index, title: m[0].trim() });
  if (hits.length < 2) return [];
  const out = [];
  hits.forEach((h, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].at : text.length;
    out.push({ title: h.title, content: text.slice(h.at + h.title.length, end).trim() });
  });
  // 第一章前的前言
  if (text.slice(0, hits[0].at).trim()) out.unshift({ title: '(卷首)', content: text.slice(0, hits[0].at).trim() });
  return out;
}

// 解碼：BOM → UTF-8 strict → 候選編碼評分（� 越少、中文比例越高越好）
export function decodeText(buffer, encoding = 'auto') {
  const tryDec = (enc, fatal) => {
    try { return new TextDecoder(enc, { fatal }).decode(buffer); } catch { return null; }
  };
  if (encoding !== 'auto') return tryDec(encoding, false) ?? tryDec('utf-8', false);
  const b = new Uint8Array(buffer);
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return { text: tryDec('utf-8', false), encoding: 'utf-8' };
  if (b[0] === 0xFF && b[1] === 0xFE) return { text: tryDec('utf-16le', false), encoding: 'utf-16le' };
  if (b[0] === 0xFE && b[1] === 0xFF) return { text: tryDec('utf-16be', false), encoding: 'utf-16be' };
  const u8 = tryDec('utf-8', true);
  if (u8 !== null) return { text: u8, encoding: 'utf-8' };
  // 非 UTF-8：在候選編碼中選「� 最少＋中文字最多」的結果
  const score = t => {
    const bad = (t.match(/�/g) || []).length;
    const ctrl = (t.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []).length;
    const cjk = (t.match(/[一-鿿　-〿]/g) || []).length;
    return cjk * 2 - bad * 30 - ctrl * 10;
  };
  const cands = ['gb18030', 'big5', 'euc-jp', 'shift_jis']
    .map(enc => ({ text: tryDec(enc, false), encoding: enc }))
    .filter(c => c.text !== null);
  if (!cands.length) return { text: tryDec('utf-8', false), encoding: 'utf-8' };
  return cands.sort((a, b2) => score(b2.text) - score(a.text))[0];
}

export function guessNovelTitle(filename) {
  return filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
}

// 從全文前段自動辨識：書名、作者、簡介/大綱
export function parseNovelMeta(text, fallbackTitle = '') {
  const head = text.slice(0, 3000);
  const lines = head.split('\n').map(l => l.trim());
  let title = '', author = '', desc = '';

  // 書名：《xxx》或「書名：xxx」「书名：xxx」或第一行短行
  const tm = head.match(/《([^》\n]{1,60})》/) || head.match(/書名[:：]\s*([^\n]{1,60})/) || head.match(/书名[:：]\s*([^\n]{1,60})/);
  if (tm) title = tm[1].trim();
  else if (lines[0] && lines[0].length <= 30 && !parseHeaderLine(lines[0])) title = lines[0];

  // 作者
  const am = head.match(/作者[:：]\s*([^\n\s，,。.]{1,30})/) || head.match(/(?:by|By)\s+([^\n\s]{1,30})/);
  if (am) author = am[1].trim();

  // 簡介/大綱/內容簡介/文案：該行之後到下一個空白段或章節標記
  const dm = head.match(/(?:簡介|简介|大綱|大纲|內容簡介|内容简介|文案|作品簡介)[:：]?\s*([\s\S]{1,2000})/);
  if (dm) {
    let d = dm[1].split(/\n\s*\n/)[0];
    const chIdx = d.search(new RegExp(`第[${NUM}]+[章回節卷集部篇話]`));
    if (chIdx >= 0) d = d.slice(0, chIdx);
    desc = d.trim().slice(0, 500);
  }
  return { title: title || fallbackTitle, author, desc };
}

// ---- 作品名稱排序：由低到高（1→9、A→Z），中文數字也照數值比（第二章 < 第十章）----
const CN_DIGIT = { 零: 0, 〇: 0, 一: 1, 壹: 1, 二: 2, 兩: 2, 貳: 2, 三: 3, 參: 3, 四: 4, 肆: 4, 五: 5, 伍: 5, 六: 6, 陸: 6, 七: 7, 柒: 7, 八: 8, 捌: 8, 九: 9, 玖: 9 };
const CN_UNIT = { 十: 10, 拾: 10, 百: 100, 千: 1000, 萬: 10000 };
export function cnToInt(s) {
  let total = 0, section = 0, digit = 0;
  for (const ch of s) {
    if (ch in CN_DIGIT) digit = CN_DIGIT[ch];
    else if (ch === '萬') { total += (section + digit) * 10000; section = 0; digit = 0; }
    else { section += (digit || 1) * CN_UNIT[ch]; digit = 0; }
  }
  return total + section + digit;
}
const toHalf = s => s.replace(/[０-９Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
const titleKey = s => toHalf(String(s ?? '').trim()).replace(/[零〇一二兩三四五六七八九十百千萬壹貳參肆伍陸柒捌玖拾]+/g, m => String(cnToInt(m)));
const collator = new Intl.Collator('zh-Hant-TW', { numeric: true, sensitivity: 'base' });
// 數字、英文開頭的排在中文開頭的前面
const isHan = s => /^\p{Script=Han}/u.test(s);
export function compareTitle(a, b) {
  const ka = titleKey(a), kb = titleKey(b);
  return (isHan(ka) - isHan(kb)) || collator.compare(ka, kb) || collator.compare(String(a ?? ''), String(b ?? ''));
}

// ---- 小說卷數：數字 1,2,3… 或「上/中/下/外傳/番外」----
export const VOLUME_WORDS = ['上', '中', '下', '外傳', '番外'];
const CN_NUM = '零一二三四五六七八九';
export function intToCn(n) {
  if (n < 10) return CN_NUM[n];
  if (n < 20) return '十' + (n % 10 ? CN_NUM[n % 10] : '');
  if (n < 100) return CN_NUM[Math.floor(n / 10)] + '十' + (n % 10 ? CN_NUM[n % 10] : '');
  return String(n);
}
// 顯示文字：1 → 第一卷、'上' → 上卷、'外傳' → 外傳
export function volumeLabel(v) {
  if (v === '' || v == null) return '';
  if (typeof v === 'number' || /^\d+$/.test(v)) return `第${intToCn(+v)}卷`;
  return /^[上中下]$/.test(v) ? `${v}卷` : String(v);
}
// 排序權重：數字卷 < 上中下 < 外傳/番外；沒有卷數排最前
export function volumeRank(v) {
  if (v === '' || v == null) return -1;
  if (typeof v === 'number' || /^\d+$/.test(v)) return +v;
  const k = VOLUME_WORDS.indexOf(v);
  return k < 0 ? 9999 : 5000 + k;
}
// 從書名取出卷數：「星海 第二卷」→ { title: '星海', volume: 2 }；沒有就原樣回傳
const VOL_RE = /\s*[（(【\[〔]?\s*(?:第\s*([0-9０-９零〇一二兩三四五六七八九十百]+)\s*[卷冊部集]|卷\s*([0-9０-９一二兩三四五六七八九十]+)|vol(?:ume)?\.?\s*(\d+)|([上中下])\s*[卷冊部集]|[（(]([上中下])[）)]|(外傳|番外篇?))\s*[）)】\]〕]?\s*/i;
export function splitVolume(title) {
  const t = String(title || '');
  const m = VOL_RE.exec(t);
  if (!m) return { title: t.trim(), volume: '' };
  const num = m[1] || m[2] || m[3];
  const volume = num ? (/^[0-9０-９]+$/.test(num) ? +num.replace(/[０-９]/g, c => c.charCodeAt(0) - 0xFF10) : cnToInt(num)) : (m[4] || m[5] || m[6].replace(/篇$/, ''));
  const rest = (t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
  return rest ? { title: rest, volume } : { title: t.trim(), volume: '' };
}