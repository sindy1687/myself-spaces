// 章節辨識與文字編碼處理（純函式，可測試）

// 章節標記：出現在行首即算新章（標題後可接篇名，甚至內文）
const NUM = '0-9０-９零一二三四五六七八九十百千兩萬壹貳參肆伍陸柒捌玖拾';
const MARKER = new RegExp(
  '^(?:[【（(\\[「]*\\s*)?' +
  '(?:' +
  `第[${NUM}]+[章回節卷集部篇話]` +
  '|序章|序曲|楔子|前言|引子|後記|尾聲|終章|番外篇?|外傳' +
  `|卷[${NUM}]+` +
  '|Chapter\\s+[0-9０-９]+|CHAPTER\\s+[0-9０-９]+|Prologue|Epilogue' +
  ')[】）)\\]」]?'
);

// 標題結束：空格/全形空格/冒號/破折號之後的短篇名（≤40 字，遇句號類標點截斷）
function parseHeaderLine(line) {
  const m = line.match(MARKER);
  if (!m) return null;
  const isNumbered = /^(?:第|Chapter|CHAPTER|卷)/i.test(m[0].replace(/^[【（(\[「\s]+/, ''));
  let title = m[0].replace(/^[【（(\[「\s]+|[】）)\]」]+$/g, '').trim();
  let rest = line.slice(m[0].length);
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
