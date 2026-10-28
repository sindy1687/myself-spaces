// 小說：列表、匯入精靈（編碼+章節預覽編輯）、詳情、閱讀器
import { list, get, save, trash, getProgress, saveProgress, listCategories } from '../store.js';
import { splitChapters, decodeText, guessNovelTitle, parseNovelMeta } from '../chapters.js';
import { esc, uid, modal, toast, confirmDialog, debounce, fmtDate, attachUploadBtn } from '../util.js';
import { db } from '../db.js';
import { isAuthed } from '../auth.js';
import { setNav } from './home.js';

// 觀看次數（同一工作階段不重複計）
export async function countView(type, id) {
  const key = `viewed:${type}:${id}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');
  const it = await get(type, id);
  if (it) await save(type, { ...it, views: (it.views || 0) + 1 });
}

function statusBadge(s) {
  if (!s) return '';
  const cls = s === '已完結' ? 'badge-done' : s === '暫停' ? 'badge-pause' : 'badge-serial';
  return `<span class="badge ${cls}">${esc(s)}</span>`;
}

export async function renderNovels() {
  const novels = await list('novel');
  const { getSettings } = await import('../store.js');
  const defCover = (await getSettings()).defaultNovelCover || '';
  const catId = new URLSearchParams(location.hash.split('?')[1] || '').get('cat');
  sessionStorage.setItem('lastType', 'novel');
  if (catId) sessionStorage.setItem('cat:novel', catId);
  const cats = await listCategories('novel');
  const shown = catId === 'uncategorized' ? novels.filter(n => !(n.categoryIds || []).length && !n.categoryId)
    : catId ? novels.filter(n => (n.categoryIds || []).includes(catId) || n.categoryId === catId) : novels;
  document.getElementById('app').innerHTML = `
    <div class="row"><h1 style="margin-right:auto">小說庫</h1>${isAuthed() ? `<a class="primary" href="#/novels/import${catId && catId !== 'uncategorized' ? '?cat=' + catId : ''}"><button class="primary">＋ 匯入小說</button></a>` : ''}</div>
    ${catChips(cats, 'novel', '#/novels', catId)}
    ${shown.length ? `<div class="grid">${shown.map(n => `
      <a class="card" href="#/novel/${n.id}" style="color:var(--text)">
        ${n.cover || defCover ? `<img class="cover" src="${esc(n.cover || defCover)}" alt="${esc(n.title)}封面">` : `<div class="cover" style="display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:2rem">${esc(n.title[0])}</div>`}
        <h3>${esc(n.title)} ${n.demo ? '<span class="tag">示範</span>' : ''}</h3>
        <div>${statusBadge(n.status)} <span class="muted">${esc(n.author || '')} ・ ${(n.chapters || []).length} 章</span></div>
        <div>${(n.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      </a>`).join('')}</div>` : '<div class="empty">尚未匯入小說</div>'}
  `;
  setNav();
  bindCatChips('novel', renderNovels);
}

// 小說簡介排版：TXT 匯入的文案常把段落擠成一行（以全形空白分隔），這裡拆回段落，
// 並把「內容標籤／搜索關鍵字／一句話簡介／立意」整理成資訊欄
const DESC_META = /^(內容標籤|内容标签|搜索關鍵字|搜索关键字|關鍵字|关键字|一句話簡介|一句话简介|立意|主角|配角|其它|其他|標籤|标签)[:：]\s*/;
export function formatDesc(desc, n = {}) {
  let s = String(desc || '').trim();
  if (!s) return '';
  // 去掉開頭殘留的「書名》作者：xxx」與「文案：」
  s = s.replace(/^[^\n]{0,60}》\s*/, m => (n.title && m.includes(n.title.slice(-4))) || m.length < 40 ? '' : m)
    .replace(/^(?:作者|作\s*者)[:：]\s*\S+\s*/, '')
    .replace(/^(?:文案|簡介|简介|內容簡介|内容简介)[:：]\s*/, '');
  const parts = s.split(/\s*(?:\r?\n|[ \t　]{2,})\s*/).map(p => p.trim()).filter(Boolean);
  const paras = [], meta = [];
  for (const p of parts) {
    // 一行裡可能還有「主角：顾苒 一句话简介：…」→ 依標籤再切一次
    const segs = p.split(/(?=(?:內容標籤|内容标签|搜索關鍵字|搜索关键字|一句話簡介|一句话简介|立意)[:：])/);
    for (const seg of segs.map(x => x.trim()).filter(Boolean)) {
      const m = DESC_META.exec(seg);
      if (m) {
        const val = seg.slice(m[0].length).trim();
        const kv = /^(主角|配角)[:：]/.exec(val); // 「搜索关键字：主角：顾苒」
        meta.push(kv ? [kv[1], val.slice(kv[0].length).trim()] : [m[1], val]);
      } else if (/^[—\-─_=*]{2,}$/.test(seg)) paras.push('<hr class="desc-hr">');
      else paras.push(`<p>${esc(seg)}</p>`);
    }
  }
  const tagLike = /標籤|标签/;
  const metaHTML = meta.length ? `<dl class="desc-meta">${meta.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${tagLike.test(k) ? v.split(/[\s,，、]+/).filter(Boolean).map(t => `<span class="tag">${esc(t)}</span>`).join('') : esc(v)}</dd>`).join('')}</dl>` : '';
  const long = paras.length > 5 || s.length > 260;
  return `<div class="novel-desc${long ? ' clamp' : ''}">${paras.join('')}</div>${long ? '<button type="button" class="desc-more" onclick="this.previousElementSibling.classList.toggle(\'clamp\');this.textContent=this.previousElementSibling.classList.contains(\'clamp\')?\'展開全文 ▾\':\'收起 ▴\'">展開全文 ▾</button>' : ''}${metaHTML}`;
}

// 類型分類列（導覽連動核心）
// 只顯示第一層；選到某分類時，才在下方逐層展開它的子分類，避免整片分類佔滿畫面
const CAT_TOP_LIMIT = 10;
export function catChips(cats, type, base, cur) {
  const ids = new Set(cats.map(c => c.id));
  const kids = pid => cats.filter(c => (c.parentId && ids.has(c.parentId) ? c.parentId : null) === pid);
  const icon = c => c.icon?.startsWith('stk:') ? `<span class="stk" data-stk="${esc(c.icon.slice(4))}" style="width:1.3em;height:1.3em"></span>` : esc(c.icon || '');
  // 目前選取分類的祖先路徑（含自己）
  const path = [];
  for (let c = cats.find(x => x.id === cur); c && !path.includes(c.id); c = cats.find(x => x.id === c.parentId)) path.unshift(c.id);
  const chip = c => `<a class="album-chip ${path.includes(c.id) ? 'on' : ''}" href="${base}?cat=${c.id}">${icon(c)} ${esc(c.name)}${kids(c.id).length ? ' <small>▾</small>' : ''}</a>`;

  const top = kids(null);
  const shown = top.slice(0, CAT_TOP_LIMIT), more = top.slice(CAT_TOP_LIMIT);
  // 被收起的分類若正被選取，仍放在可見區
  for (const c of more.filter(c => path.includes(c.id))) shown.push(c);
  const hidden = more.filter(c => !path.includes(c.id));
  const rows = [`<div class="cat-row">
    <a class="album-chip ${!cur ? 'on' : ''}" href="${base}">全部</a>
    ${shown.map(chip).join('')}
    ${hidden.length ? `<details class="cat-more"><summary class="album-chip">更多 ${hidden.length} ▾</summary><div class="cat-row">${hidden.map(chip).join('')}</div></details>` : ''}
  </div>`];
  for (const id of path) {
    const sub = kids(id);
    if (sub.length) rows.push(`<div class="cat-row cat-sub">${sub.map(chip).join('')}</div>`);
  }
  if (isAuthed()) {
    const dup = dupGroups(cats).reduce((n, g) => n + g.length - 1, 0);
    rows.push(`<div class="cat-row cat-tools"><button id="cat-add" type="button">＋分類</button><button id="cat-tpl" type="button">套用範本</button>${dup ? `<button id="cat-dedup" type="button">整理重複（${dup}）</button>` : ''}</div>`);
  }
  return `<div class="cat-bar">${rows.join('')}</div>`;
}
// 同上層、同名的分類視為重複；保留共用（shared）或最早的一個
function dupGroups(cats) {
  const m = new Map();
  for (const c of cats) { const k = `${c.parentId || ''}|${c.name.trim()}`; (m.get(k) || m.set(k, []).get(k)).push(c); }
  return [...m.values()].filter(g => g.length > 1)
    .map(g => g.sort((a, b) => (b.type === 'shared') - (a.type === 'shared') || (a.order ?? 0) - (b.order ?? 0)));
}
export async function bindCatChips(type, redraw) {
  (await import('../util.js')).hydrateMedia(document.getElementById('app'));
  document.getElementById('cat-add')?.addEventListener('click', async () => {
    const name = prompt('新增分類名稱');
    if (name?.trim()) { const { saveCategory } = await import('../store.js'); await saveCategory({ name: name.trim(), type }); redraw(); }
  });
  document.getElementById('cat-tpl')?.addEventListener('click', async () => {
    const { TEMPLATES } = await import('../category-utils.js');
    const { saveCategory } = await import('../store.js');
    const t = TEMPLATES[type]; if (!t) return toast('此類型無範本', 'error');
    const cats = await listCategories(type, { includeArchived: true });
    let n = 0;
    for (const [g, names] of Object.entries(t.groups)) {
      let gc = cats.find(c => c.name === g && !c.parentId);
      if (!gc) gc = await saveCategory({ name: g, type, order: cats.length });
      for (const nm of names) if (!cats.find(c => c.name === nm && c.parentId === gc.id)) { await saveCategory({ name: nm, type, parentId: gc.id }); n++; }
    }
    toast(`已套用範本，新增 ${n} 個分類`, 'success'); redraw();
  });
  document.getElementById('cat-dedup')?.addEventListener('click', async () => {
    if (!await confirmDialog('把同一層裡名稱相同的分類合併成一個？作品與子分類會移到保留的那個分類，不會刪除作品。', { okText: '合併' })) return;
    const { mergeCategories } = await import('../store.js');
    let merged = 0;
    // 父分類合併後，子分類會變成新的重複，所以重複執行直到沒有
    for (let round = 0; round < 10; round++) {
      const groups = dupGroups(await listCategories(type, { includeArchived: true }));
      if (!groups.length) break;
      for (const [keep, ...rest] of groups) for (const c of rest) { await mergeCategories(c.id, keep.id); merged++; }
    }
    toast(`已合併 ${merged} 個重複分類`, 'success'); redraw();
  });
}

// ---- 匯入精靈 ----
export function renderNovelImport() {
  const preCat = new URLSearchParams(location.hash.split('?')[1] || '').get('cat');
  const app = document.getElementById('app');
  app.innerHTML = `
    <h1>匯入小說</h1>
    <div class="card">
      <div class="drop-zone" id="dz">
        <p>拖曳 TXT 檔案到此，或</p>
        <input type="file" id="file" accept=".txt,.text,text/plain" class="hidden">
        <button id="pick" class="primary">選擇 TXT 檔案</button>
        <p class="muted">或直接<a href="#" id="paste-link">貼上完整文字</a></p>
      </div>
      <div id="paste-area" class="hidden">
        <label>貼上小說全文</label>
        <textarea id="paste-text" rows="12" placeholder="在此貼上小說全文…"></textarea>
        <div class="row" style="margin-top:.5rem"><button id="parse-paste" class="primary">解析章節</button></div>
      </div>
      <div class="row" style="margin-top:.8rem">
        <label style="margin:0">文字編碼</label>
        <select id="enc" style="max-width:160px"><option value="auto">自動偵測</option><option value="utf-8">UTF-8</option><option value="big5">Big5</option><option value="gb18030">GB18030</option></select>
        <span id="enc-info" class="muted"></span>
      </div>
    </div>
    <div id="preview"></div>`;

  const dz = document.getElementById('dz'), fi = document.getElementById('file');
  let lastBuffer = null;
  document.getElementById('pick').onclick = () => fi.click();
  document.getElementById('paste-link').onclick = e => { e.preventDefault(); document.getElementById('paste-area').classList.toggle('hidden'); };
  fi.onchange = () => fi.files[0] && readFile(fi.files[0]);
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); };
  dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) readFile(f); };
  document.getElementById('enc').onchange = () => lastBuffer && parse(lastBuffer, lastBuffer.name);
  const autoParse = debounce(() => {
    const text = document.getElementById('paste-text').value;
    if (text.trim().length < 10) return;
    showPreview(splitChapters(text), '未命名小說', text.length, parseNovelMeta(text, ''));
  }, 500);
  document.getElementById('paste-text').addEventListener('input', autoParse);
  document.getElementById('parse-paste').onclick = () => {
    const text = document.getElementById('paste-text').value;
    if (!text.trim()) return toast('請先貼上文字', 'error');
    showPreview(splitChapters(text), '未命名小說', text.length, parseNovelMeta(text, ''));
  };

  async function readFile(file) {
    const buf = await file.arrayBuffer();
    buf.name = file.name;
    lastBuffer = buf;
    parse(buf, file.name);
  }
  function parse(buf, name) {
    const enc = document.getElementById('enc').value;
    const res = decodeText(buf, enc);
    const text = typeof res === 'string' ? res : res.text;
    document.getElementById('enc-info').textContent = typeof res === 'string' ? `手動指定 ${enc.toUpperCase()}` : `偵測為 ${res.encoding.toUpperCase()}`;
    showPreview(splitChapters(text), guessNovelTitle(name), text.length, parseNovelMeta(text, guessNovelTitle(name)));
  }

  function showPreview(chapters, title, totalLen, meta = {}) {
    const pv = document.getElementById('preview');
    if (!chapters.length) chapters = [{ title: '全文', content: '' }];
    pv.innerHTML = `
      <h2 class="section-title">章節預覽（共 ${chapters.length} 章・${totalLen} 字）</h2>
      <div class="card">
        <label>小說名稱</label><input id="n-title" value="${esc(meta.title || title)}">
        <label>作者</label><input id="n-author" value="${esc(meta.author || '')}">
        <label>簡介 / 大綱</label><textarea id="n-desc" rows="3">${esc(meta.desc || '')}</textarea>
        <label>封面圖片</label><div class="field-inline"><input id="n-cover" placeholder="貼上圖片網址，或上傳"><button id="n-cover-up" type="button">上傳</button></div>
        <div id="ch-list" style="margin-top:.8rem"></div>
        <div class="row" style="margin-top:.8rem">
          <button id="add-ch">＋ 新增章節</button>
          <button id="conv-s2t">簡→繁</button>
          <button id="conv-t2s">繁→簡</button>
          <button id="import-btn" class="primary">確認匯入</button>
        </div>
      </div>`;
    const listEl = document.getElementById('ch-list');
    let chs = chapters.map(c => ({ id: uid(), ...c }));

    function draw() {
      listEl.innerHTML = chs.map((c, i) => `
        <div class="chapter-item" draggable="true" data-i="${i}">
          <span class="muted">${i + 1}.</span>
          <input value="${esc(c.title)}" data-field="title" style="flex:1">
          <span class="muted">${c.content.length} 字</span>
          <button data-act="up" ${i === 0 ? 'disabled' : ''} title="上移">↑</button>
          <button data-act="down" ${i === chs.length - 1 ? 'disabled' : ''} title="下移">↓</button>
          <button data-act="merge" ${i === 0 ? 'disabled' : ''} title="與上一章合併">合併↑</button>
          <button data-act="del" title="刪除此章">✕</button>
        </div>`).join('');
    }
    draw();
    listEl.addEventListener('input', e => { const i = +e.target.closest('[data-i]').dataset.i; chs[i].title = e.target.value; });
    listEl.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const i = +btn.closest('[data-i]').dataset.i;
      const act = btn.dataset.act;
      if (act === 'up') [chs[i - 1], chs[i]] = [chs[i], chs[i - 1]];
      if (act === 'down') [chs[i + 1], chs[i]] = [chs[i], chs[i + 1]];
      if (act === 'del') chs.splice(i, 1);
      if (act === 'merge') { chs[i - 1].content += '\n' + chs[i].title + '\n' + chs[i].content; chs.splice(i, 1); }
      draw();
    });
    // 拖曳排序
    let dragI = null;
    listEl.addEventListener('dragstart', e => dragI = +e.target.dataset.i);
    listEl.addEventListener('dragover', e => e.preventDefault());
    listEl.addEventListener('drop', e => {
      e.preventDefault();
      const i = +e.target.closest('[data-i]')?.dataset.i;
      if (i == null || dragI == null || i === dragI) return;
      const [m] = chs.splice(dragI, 1); chs.splice(i, 0, m); draw();
    });
    attachUploadBtn(document.getElementById('n-cover-up'), document.getElementById('n-cover'));
    document.getElementById('add-ch').onclick = () => { chs.push({ id: uid(), title: `第 ${chs.length + 1} 章`, content: '' }); draw(); };
    const conv = async dir => {
      const { convert } = await import('../zhconv.js');
      chs = chs.map(c => ({ ...c, title: convert(c.title, dir), content: convert(c.content, dir) }));
      document.getElementById('n-title').value = convert(document.getElementById('n-title').value, dir);
      draw();
      toast(dir === 's2t' ? '已轉為繁體' : '已轉為簡體', 'success');
    };
    document.getElementById('conv-s2t').onclick = () => conv('s2t');
    document.getElementById('conv-t2s').onclick = () => conv('t2s');
    document.getElementById('import-btn').onclick = async () => {
      const t = document.getElementById('n-title').value.trim();
      if (!t) return toast('請輸入小說名稱', 'error');
      if (!chs.length) return toast('至少要有一章', 'error');
      const n = await save('novel', { title: t, author: document.getElementById('n-author').value.trim(), desc: document.getElementById('n-desc').value.trim(), cover: document.getElementById('n-cover').value.trim(), chapters: chs, status: '連載中', tags: [], categoryIds: preCat ? [preCat] : [] });
      toast('匯入成功', 'success');
      location.hash = `#/novel/${n.id}`;
    };
    pv.scrollIntoView({ behavior: 'smooth' });
  }
}

// ---- 詳情 ----
export async function renderNovelDetail(id) {
  const n = await get('novel', id);
  if (!n) return document.getElementById('app').innerHTML = '<div class="empty">找不到這部小說</div>';
  const prog = await getProgress(id);
  const bmSet = new Set((prog?.bookmarks || []).map(b => b.chapterId));
  const cats = await listCategories('novel');
  const { getSettings } = await import('../store.js');
  const defCover = (await getSettings()).defaultNovelCover || '';
  const chs = n.chapters || [];
  const TOC_LIMIT = 12;
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="card" style="display:flex;gap:1.5rem;flex-wrap:wrap">
      ${n.cover || defCover ? `<img src="${esc(n.cover || defCover)}" style="width:180px;border-radius:var(--radius)" alt="封面">` : ''}
      <div style="flex:1;min-width:240px">
        <h1 style="margin-top:0">${esc(n.title)} ${n.demo ? '<span class="tag">示範</span>' : ''}</h1>
        <p>${statusBadge(n.status)} <span class="muted">${esc(n.author || '佚名')} ・ ${(n.chapters || []).length} 章 ・ 更新於 ${fmtDate(n.updatedAt)}</span></p>
        ${formatDesc(n.desc, n)}
        <div>${(n.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
        <div class="row" style="margin-top:1rem">
          <a href="#/read/${id}${prog?.chapterId ? '/' + prog.chapterId : ''}"><button class="primary">${prog?.chapterId ? '繼續閱讀' : '開始閱讀'}</button></a>
          ${isAuthed() ? `<button id="edit-meta">編輯資料</button>
          <button id="edit-chs">編輯章節</button>
          <button id="paste-chs">貼上全文</button>
          <button id="share-btn">分享</button>
          <button id="del" class="danger">刪除</button>` : ''}
          <span class="muted">👁 ${n.views || 0} 次觀看</span>
        </div>
      </div>
    </div>
    <h2 class="section-title">目錄${chs.length ? `（${chs.length} 章）` : ''}</h2>
    ${chs.length > TOC_LIMIT ? '<input id="toc-q" placeholder="搜尋章節名稱…" style="margin-bottom:.5rem">' : ''}
    <div class="card toc-grid" id="toc-list">${chs.map((c, i) => `<div class="chapter-item${c.id === prog?.chapterId ? ' read-here' : ''}" data-t="${esc(c.title)}"><span class="muted">${i + 1}</span><a href="#/read/${id}/${c.id}" style="flex:1;color:var(--text)">${esc(c.title)}</a>${bmSet.has(c.id) ? '<span class="bm-mark" title="已加書籤">🔖</span>' : ''}${c.id === prog?.chapterId ? '<span class="read-badge">讀到這裡</span>' : ''}<span class="muted">${c.content.length} 字</span></div>`).join('') || '（無章節）'}</div>
    ${chs.length > TOC_LIMIT ? '<button id="toc-more" class="toc-more"></button>' : ''}
    ${(prog?.bookmarks || []).length ? `<h2 class="section-title">書籤清單</h2>
    <div class="card">${prog.bookmarks.map((b, bi) => `<div class="chapter-item"><span class="bm-mark">🔖</span><a href="#/read/${id}/${b.chapterId}${b.pIdx != null ? '?p=' + b.pIdx : ''}" style="flex:1;color:var(--text)">${esc(b.title)}${b.snippet ? ` <span class="muted">${esc(b.snippet)}…</span>` : ''}</a><span class="muted">${fmtDate(b.at)}</span><button class="bm-del" data-b="${bi}" title="刪除書籤">✕</button></div>`).join('')}</div>` : ''}`;

  countView('novel', id);
  // 章節很多時：預設只顯示前幾章（讀到的那章永遠顯示），可搜尋或一鍵展開
  const tocList = document.getElementById('toc-list');
  if (chs.length > TOC_LIMIT) {
    const items = [...tocList.children];
    const moreBtn = document.getElementById('toc-more'), qEl = document.getElementById('toc-q');
    let expanded = false;
    const apply = () => {
      const q = qEl.value.trim();
      items.forEach((el, i) => {
        el.style.display = (!q || el.dataset.t.includes(q)) && (q || expanded || i < TOC_LIMIT || el.classList.contains('read-here')) ? '' : 'none';
      });
      moreBtn.style.display = q ? 'none' : '';
      moreBtn.textContent = expanded ? '收起 ▴' : `展開全部 ${chs.length} 章 ▾`;
    };
    moreBtn.onclick = () => { expanded = !expanded; apply(); };
    qEl.oninput = apply;
    apply();
  }
  app.querySelectorAll('.bm-del').forEach(btn => btn.onclick = async () => {
    const p = await getProgress(id);
    await saveProgress(id, { bookmarks: (p?.bookmarks || []).filter((_, i) => i !== +btn.dataset.b) });
    renderNovelDetail(id);
  });
  const delBtn = document.getElementById('del');
  if (delBtn) {
    delBtn.onclick = async () => {
      if (await confirmDialog(`確定將「${n.title}」移至回收筒？`)) { await trash('novel', id); toast('已移至回收筒'); location.hash = '#/novels'; }
    };
    document.getElementById('edit-meta').onclick = () => editMeta(n, cats);
    document.getElementById('edit-chs').onclick = () => chapterEditor(n);
    document.getElementById('paste-chs').onclick = () => chapterEditor(n, { paste: true });
    document.getElementById('share-btn').onclick = () => shareDialog(n);
  }
}

// 章節編輯器：改名/改內文/新增/刪除/排序
function chapterEditor(n, opts = {}) {
  let chs = (n.chapters || []).map(c => ({ ...c }));
  modal(`
    <h3>編輯章節「${esc(n.title)}」（${chs.length} 章）</h3>
    ${chs.length > 10 ? '<input id="ce-q" placeholder="搜尋章節…" style="margin-bottom:.4rem">' : ''}
    <div id="ce-list" style="max-height:50vh;overflow:auto"></div>
    <div class="row" style="margin-top:.8rem">
      <button id="ce-add">＋ 新增章節</button>
      <button id="ce-paste">貼上全文</button>
      <span style="flex:1"></span>
      <button data-close>取消</button>
      <button id="ce-save" class="primary">儲存全部</button>
    </div>`,
    {
      onOpen(bg, close) {
        const listEl = bg.querySelector('#ce-list');
        function draw() {
          const q = bg.querySelector('#ce-q')?.value.trim() || '';
          listEl.innerHTML = chs.map((c, i) => `
            <div class="chapter-item" data-i="${i}" style="${q && !c.title.includes(q) ? 'display:none' : ''}">
              <span class="muted">${i + 1}.</span>
              <input value="${esc(c.title)}" data-f="t" style="flex:1">
              <span class="muted">${c.content.length} 字</span>
              <button data-a="edit">編輯內文</button>
              <button data-a="up" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button data-a="down" ${i === chs.length - 1 ? 'disabled' : ''}>↓</button>
              <button data-a="del">✕</button>
            </div>`).join('');
        }
        draw();
        bg.querySelector('#ce-q')?.addEventListener('input', draw);
        listEl.addEventListener('input', e => { const i = +e.target.closest('[data-i]').dataset.i; chs[i].title = e.target.value; });
        listEl.addEventListener('click', e => {
          const b = e.target.closest('[data-a]'); if (!b) return;
          const i = +b.closest('[data-i]').dataset.i, a = b.dataset.a;
          if (a === 'up') [chs[i - 1], chs[i]] = [chs[i], chs[i - 1]];
          if (a === 'down') [chs[i + 1], chs[i]] = [chs[i], chs[i + 1]];
          if (a === 'del') chs.splice(i, 1);
          if (a === 'edit') {
            modal(`<h3>${esc(chs[i].title)}</h3>
              <label>章名</label><input id="ce-t" value="${esc(chs[i].title)}">
              <label>內文</label><textarea id="ce-c" rows="14">${esc(chs[i].content)}</textarea>
              <div class="row" style="justify-content:flex-end;margin-top:.6rem"><button data-close>取消</button><button id="ce-ok" class="primary">套用</button></div>`,
              { onOpen(bg2, close2) { bg2.querySelector('#ce-ok').onclick = () => { chs[i].title = bg2.querySelector('#ce-t').value; chs[i].content = bg2.querySelector('#ce-c').value; close2(); draw(); }; } });
            return;
          }
          draw();
        });
        bg.querySelector('#ce-add').onclick = () => { chs.push({ id: uid(), title: `第 ${chs.length + 1} 章`, content: '' }); draw(); };
        const openPaste = () => pasteChapters(chs, next => { chs = next; draw(); });
        bg.querySelector('#ce-paste').onclick = openPaste;
        if (opts.paste) openPaste();
        bg.querySelector('#ce-save').onclick = async () => {
          await save('novel', { ...n, chapters: chs });
          close(); toast('章節已儲存', 'success'); renderNovelDetail(n.id);
        };
      }
    });
}

// 對已建立的小說貼上全文（或選 TXT），自動辨識章節後取代／附加／補上新章
function pasteChapters(current, apply) {
  modal(`
    <h3>貼上小說全文</h3>
    <p class="muted">貼上後會自動辨識章節（第X章、楔子、番外…），也可<a href="#" id="pc-pick">選擇 TXT 檔案</a>。</p>
    <input type="file" id="pc-file" accept=".txt,.text,text/plain" class="hidden">
    <textarea id="pc-text" rows="12" placeholder="在此貼上小說全文…"></textarea>
    <label>套用方式</label>
    <select id="pc-mode">
      <option value="new">只補上新章節（略過同名章節）</option>
      <option value="append">全部附加到最後</option>
      <option value="replace">取代全部章節</option>
    </select>
    <div id="pc-prev" class="muted" style="margin:.6rem 0;max-height:30vh;overflow:auto"></div>
    <div class="row" style="justify-content:flex-end"><button data-close>取消</button><button id="pc-ok" class="primary">套用</button></div>`,
    {
      onOpen(bg, close) {
        const ta = bg.querySelector('#pc-text'), modeEl = bg.querySelector('#pc-mode'), prev = bg.querySelector('#pc-prev');
        const norm = t => String(t || '').replace(/\s+/g, '');
        const have = new Set(current.map(c => norm(c.title)));
        let parsed = [];
        const result = () => {
          const mode = modeEl.value;
          const add = mode === 'new' ? parsed.filter(c => !have.has(norm(c.title))) : parsed;
          return { add, next: mode === 'replace' ? add : [...current, ...add] };
        };
        const refresh = () => {
          const text = ta.value;
          parsed = text.trim() ? splitChapters(text).filter(c => c.title !== '(卷首)' || c.content.trim()).map(c => ({ id: uid(), ...c })) : [];
          if (!parsed.length) return prev.innerHTML = '';
          const { add, next } = result();
          prev.innerHTML = `辨識到 ${parsed.length} 章，將套用 ${add.length} 章（套用後共 ${next.length} 章）<ol style="margin:.3rem 0 0 1.2rem">${add.map(c => `<li>${esc(c.title)} <span class="muted">${c.content.length} 字</span></li>`).join('')}</ol>`;
        };
        ta.addEventListener('input', debounce(refresh, 400));
        modeEl.onchange = refresh;
        const fi = bg.querySelector('#pc-file');
        bg.querySelector('#pc-pick').onclick = e => { e.preventDefault(); fi.click(); };
        fi.onchange = async () => {
          if (!fi.files[0]) return;
          const res = decodeText(await fi.files[0].arrayBuffer());
          ta.value = typeof res === 'string' ? res : res.text;
          refresh();
        };
        bg.querySelector('#pc-ok').onclick = async () => {
          refresh();
          if (!parsed.length) return toast('請先貼上文字', 'error');
          const { add, next } = result();
          if (!add.length) return toast('沒有可新增的章節', 'error');
          if (modeEl.value === 'replace' && current.length && !await confirmDialog(`確定以 ${add.length} 章取代現有 ${current.length} 章？（按「儲存全部」後才會寫入）`)) return;
          apply(next); close();
          toast(`已套用 ${add.length} 章，記得按「儲存全部」`, 'success');
        };
        ta.focus();
      }
    });
}

function editMeta(n, cats) {
  modal(`
    <h3>編輯小說資料</h3>
    <label>名稱</label><input id="m-title" value="${esc(n.title)}">
    <label>作者</label><input id="m-author" value="${esc(n.author || '')}">
    <label>簡介</label><textarea id="m-desc" rows="3">${esc(n.desc || '')}</textarea>
    <label>封面圖片</label><div class="field-inline"><input id="m-cover" value="${esc(n.cover || '')}" placeholder="網址或上傳"><button id="m-cover-up" type="button">上傳</button><button id="m-cover-find" type="button">🔍 搜尋</button></div>
    <div id="cover-hits" class="row" style="margin:.4rem 0"></div>
    <div id="cover-prev" style="margin:.4rem 0">${n.cover ? `<img src="${esc(n.cover)}" style="height:120px;border-radius:6px">` : ''}</div>
    <label>連載狀態</label><select id="m-status">${['連載中', '已完結', '暫停'].map(s => `<option ${n.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
    <label>分類（可複選、可搜尋）</label>
    <input id="m-cat-q" placeholder="搜尋分類…">
    <div id="m-cat-list" style="max-height:150px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:.4em">
      ${cats.map(c => `<label style="display:flex;gap:.5em;align-items:center" data-name="${esc(c.name)}"><input type="checkbox" value="${c.id}" ${(n.categoryIds || []).includes(c.id) || n.categoryId === c.id ? 'checked' : ''} style="width:auto"> ${esc(c.name)} <span class="muted">${esc(c.type)}</span></label>`).join('')}
    </div>
    <div class="row"><input id="m-cat-new" placeholder="新小說分類名稱" style="flex:1"><button id="m-cat-add" type="button">建立並選取</button><button id="m-cat-tpl" type="button">套用範本</button></div>
    <p id="m-cat-warn" class="muted" style="color:#b3443c"></p>
    <label>主要分類</label><select id="m-primary"><option value="">（無）</option>${cats.map(c => `<option value="${c.id}" ${n.primaryCategoryId === c.id || (!n.primaryCategoryId && n.categoryId === c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    <label>標籤（逗號分隔，有建議）</label><input id="m-tags" list="tag-suggest" value="${esc((n.tags || []).join(', '))}">
    <datalist id="tag-suggest"></datalist>
    <label><input type="checkbox" id="m-feat" ${n.featured ? 'checked' : ''} style="width:auto"> 設為精選</label>
    <label><input type="checkbox" id="m-pub" ${n.visibility === 'public' ? 'checked' : ''} style="width:auto"> 公開（未設定分享連結前僅自己可見）</label>
    <div class="row" style="justify-content:flex-end;margin-top:1rem"><button data-close>取消</button><button id="m-save" class="primary">儲存</button></div>`,
    {
      async onOpen(bg, close) {
        attachUploadBtn(bg.querySelector('#m-cover-up'), bg.querySelector('#m-cover'));
        // 分類搜尋篩選
        bg.querySelector('#m-cat-q').oninput = e => {
          const k = e.target.value.trim();
          bg.querySelectorAll('#m-cat-list label').forEach(l => l.style.display = !k || l.dataset.name.includes(k) ? '' : 'none');
        };
        // 即建新分類並自動選取
        bg.querySelector('#m-cat-add').onclick = async e => {
          e.preventDefault();
          const nm = bg.querySelector('#m-cat-new').value.trim();
          if (!nm) return;
          const { saveCategory } = await import('../store.js');
          const nc = await saveCategory({ name: nm, type: 'novel' });
          const lb = document.createElement('label');
          lb.style.cssText = 'display:flex;gap:.5em;align-items:center';
          lb.dataset.name = nm;
          lb.innerHTML = `<input type="checkbox" value="${nc.id}" checked style="width:auto"> ${esc(nm)} <span class="muted">novel</span>`;
          bg.querySelector('#m-cat-list').appendChild(lb);
          bg.querySelector('#m-primary').insertAdjacentHTML('beforeend', `<option value="${nc.id}">${esc(nm)}</option>`);
          bg.querySelector('#m-cat-new').value = '';
        };
        // 舊資料誤用其他類型分類 → 提示（不自動刪作品/分類）
        const validIds = new Set(cats.map(c => c.id));
        if ((n.categoryIds || []).some(x => !validIds.has(x)) || (n.categoryId && !validIds.has(n.categoryId)))
          bg.querySelector('#m-cat-warn').textContent = '此小說含有非小說類型的舊分類，儲存時會移除，請重新選擇。';
        if (!cats.length) bg.querySelector('#m-cat-warn').textContent = '尚未建立小說分類，可用「建立並選取」或「套用範本」。';
        bg.querySelector('#m-cat-tpl').onclick = async e => {
          e.preventDefault();
          const { TEMPLATES } = await import('../category-utils.js');
          const { saveCategory } = await import('../store.js');
          for (const [g, names] of Object.entries(TEMPLATES.novel.groups)) {
            const gc = await saveCategory({ name: g, type: 'novel' });
            validIds.add(gc.id);
            for (const nm of names) { const k = await saveCategory({ name: nm, type: 'novel', parentId: gc.id }); validIds.add(k.id); }
          }
          toast('已套用小說分類範本，請重新開啟編輯視窗', 'success'); close();
        };
        // 標籤建議
        const { tagStats } = await import('../store.js');
        bg.querySelector('#tag-suggest').innerHTML = (await tagStats()).map(([t]) => `<option value="${esc(t)}">`).join('');
        bg.querySelector('#m-cover').addEventListener('input', e => {
          bg.querySelector('#cover-prev').innerHTML = e.target.value ? `<img src="${esc(e.target.value)}" style="height:120px;border-radius:6px" onerror="this.outerHTML='<span class=muted>圖片載入失敗</span>'">` : '';
        });
        bg.querySelector('#m-cover-find').onclick = async e => {
          e.preventDefault();
          const hits = bg.querySelector('#cover-hits');
          hits.innerHTML = '<span class="muted">搜尋中…</span>';
          const q = `${bg.querySelector('#m-title').value} ${bg.querySelector('#m-author').value}`.trim();
          window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q + ' 小說封面')}`, '_blank', 'noopener');
          try {
            const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8&fields=cover_i,title,author_name`);
            const { docs } = await r.json();
            const covers = (docs || []).filter(d => d.cover_i).map(d => ({ url: `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`, label: `${d.title}／${(d.author_name || [])[0] || ''}` }));
            hits.innerHTML = covers.length
              ? covers.map(c => `<img src="${c.url}" title="${esc(c.label)}" style="width:64px;height:90px;object-fit:cover;cursor:pointer;border-radius:6px;border:2px solid transparent" data-url="${c.url}">`).join('')
              : '<span class="muted">找不到封面（可改用上傳或貼網址）</span>';
            hits.querySelectorAll('img').forEach(i => i.onclick = () => {
              bg.querySelector('#m-cover').value = i.dataset.url;
              hits.querySelectorAll('img').forEach(x => x.style.borderColor = 'transparent');
              i.style.borderColor = 'var(--primary)';
              toast('已選擇封面', 'success');
            });
          } catch { hits.innerHTML = '<span class="muted">搜尋失敗，請稍後再試</span>'; }
        };
        bg.querySelector('#m-save').onclick = async () => {
          await save('novel', {
            ...n, title: bg.querySelector('#m-title').value, author: bg.querySelector('#m-author').value,
            desc: bg.querySelector('#m-desc').value, cover: bg.querySelector('#m-cover').value,
            status: bg.querySelector('#m-status').value,
            categoryIds: [...bg.querySelectorAll('#m-cat-list input:checked')].map(i => i.value).filter(x => validIds.has(x)),
            primaryCategoryId: bg.querySelector('#m-primary').value || null,
            tags: [...new Set(bg.querySelector('#m-tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean))],
            featured: bg.querySelector('#m-feat').checked,
            visibility: bg.querySelector('#m-pub').checked ? 'public' : 'private',
          });
          close(); toast('已儲存', 'success'); renderNovelDetail(n.id);
        };
      }
    });
}

export function shareDialog(item) {
  const type = item.chapters ? 'novel' : item.content ? 'diary' : 'image';
  modal(`
    <h3>分享「${esc(item.title)}」</h3>
    <p class="muted">公開分享需要分享伺服器（見 README 的 server/）。分享連結與「同步到 Google Drive」無關，同步不會公開你的資料。</p>
    <label><input type="radio" name="vis" value="private" ${item.visibility !== 'public' ? 'checked' : ''} style="width:auto"> 私人</label>
    <label><input type="radio" name="vis" value="public" ${item.visibility === 'public' ? 'checked' : ''} style="width:auto"> 公開（產生訪客連結）</label>
    <div id="share-out"></div>
    <div class="row" style="justify-content:flex-end;margin-top:1rem"><button data-close>關閉</button><button id="sh-apply" class="primary">套用</button></div>`,
    {
      onOpen(bg, close) {
        const out = bg.querySelector('#share-out');
        async function gen() {
          out.innerHTML = '產生分享中…';
          try {
            const r = await fetch('/api/share', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type, id: item.id, title: item.title, desc: item.desc || item.caption || '', payload: item }),
            });
            if (!r.ok) throw 0;
            const { token } = await r.json();
            const url = `${location.origin}/#/share/${token}`;
            out.innerHTML = `<label>分享連結</label><div class="row"><input readonly value="${esc(url)}" id="sh-url"><button id="sh-copy">複製</button></div>
              <a href="${esc(url)}" target="_blank">預覽分享頁</a>`;
            bg.querySelector('#sh-copy').onclick = () => { navigator.clipboard.writeText(url); toast('已複製連結', 'success'); };
          } catch {
            out.innerHTML = `<p class="muted">分享伺服器未啟動。請執行 <code>node server/share-server.js</code> 後再試。</p>`;
          }
        }
        if (item.visibility === 'public') gen();
        bg.querySelectorAll('[name=vis]').forEach(r => r.onchange = () => { if (r.value === 'public' && r.checked) gen(); else out.innerHTML = ''; });
        bg.querySelector('#sh-apply').onclick = async () => {
          const vis = bg.querySelector('[name=vis]:checked').value;
          await save(type, { ...item, visibility: vis });
          close(); toast(vis === 'public' ? '已設為公開' : '已取消分享', 'success'); location.hash && navigate_refresh();
        };
        function navigate_refresh() { const h = location.hash; location.hash = ''; location.hash = h; }
      }
    });
}

// ---- 閱讀器 ----
const RKEY = 'reader-prefs';
function readerPrefs() { try { return JSON.parse(localStorage.getItem(RKEY)) || {}; } catch { return {}; } }

export async function renderReader(novelId, chapterId) {
  const n = await get('novel', novelId);
  if (!n) return document.getElementById('app').innerHTML = '<div class="empty">找不到小說</div>';
  const chs = n.chapters || [];
  let idx = chs.findIndex(c => c.id === chapterId);
  if (idx < 0) idx = 0;
  const ch = chs[idx];
  const prev = await getProgress(novelId).catch(() => null);
  const paras = ch.content.split(/\n{2,}/);
  const bmPara = new Set((prev?.bookmarks || []).filter(b => b.chapterId === ch.id && b.pIdx != null).map(b => b.pIdx));
  const prefs = { fs: 18, lh: 1.9, width: 720, mode: 'light', ...readerPrefs() };

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="reader-bar">
      <button id="toc-btn" aria-label="目錄">☰ 目錄</button>
      <a href="#/novel/${novelId}">← ${esc(n.title)}</a>
      <span style="margin-left:auto" class="muted">${idx + 1}/${chs.length}</span>
      <button id="font-dec" aria-label="字體縮小">A-</button>
      <button id="font-inc" aria-label="字體放大">A+</button>
      <select id="lh" aria-label="行距"><option value="1.6">行距 1.6</option><option value="1.9">行距 1.9</option><option value="2.2">行距 2.2</option></select>
      <select id="rw" aria-label="閱讀寬度"><option value="600">窄</option><option value="720">標準</option><option value="920">寬</option></select>
      <select id="rmode" aria-label="閱讀模式"><option value="light">亮色</option><option value="dark">深色</option><option value="green">護眼</option></select>
      <button id="bm" title="點一下段落選取，再按這裡把書籤存到該段">🔖 書籤</button>
      <button id="fs-btn">🔍 全文搜尋</button>
    </div>
    <div class="reader-wrap">
      <h1 style="font-size:1.5em">${esc(ch.title)}</h1>
      ${paras.map((p, pi) => `<p data-p="${pi}"${bmPara.has(pi) ? ' class="bm-para"' : ''}>${esc(p)}</p>`).join('')}
      <div class="row" style="justify-content:space-between;margin:2rem 0">
        ${idx > 0 ? `<a href="#/read/${novelId}/${chs[idx - 1].id}"><button>← 上一章</button></a>` : '<span></span>'}
        ${idx < chs.length - 1 ? `<a href="#/read/${novelId}/${chs[idx + 1].id}"><button class="primary">下一章 →</button></a>` : '<span class="muted">已是末章</span>'}
      </div>
    </div>`;

  const wrap = app.querySelector('.reader-wrap');
  function applyPrefs() {
    wrap.style.setProperty('--reader-fs', prefs.fs + 'px');
    wrap.style.setProperty('--reader-lh', prefs.lh);
    wrap.style.setProperty('--reader-width', prefs.width + 'px');
    document.body.classList.toggle('reader-dark', prefs.mode === 'dark');
    document.body.classList.toggle('reader-green', prefs.mode === 'green');
    localStorage.setItem(RKEY, JSON.stringify(prefs));
  }
  document.getElementById('lh').value = prefs.lh;
  document.getElementById('rw').value = prefs.width;
  document.getElementById('rmode').value = prefs.mode;
  applyPrefs();
  document.getElementById('font-inc').onclick = () => { prefs.fs = Math.min(28, prefs.fs + 1); applyPrefs(); };
  document.getElementById('font-dec').onclick = () => { prefs.fs = Math.max(12, prefs.fs - 1); applyPrefs(); };
  document.getElementById('lh').onchange = e => { prefs.lh = +e.target.value; applyPrefs(); };
  document.getElementById('rw').onchange = e => { prefs.width = +e.target.value; applyPrefs(); };
  document.getElementById('rmode').onchange = e => { prefs.mode = e.target.value; applyPrefs(); };

  // 目錄抽屜
  document.getElementById('toc-btn').onclick = async () => {
    const p = await getProgress(novelId).catch(() => null);
    const bms = p?.bookmarks || [];
    const bmSet = new Set(bms.map(b => b.chapterId));
    const ov = document.createElement('div'); ov.className = 'overlay';
    const dr = document.createElement('nav'); dr.className = 'toc-drawer'; dr.setAttribute('aria-label', '章節目錄');
    dr.innerHTML = `<h3>${esc(n.title)}</h3>${chs.length > 10 ? '<input id="toc-f" placeholder="搜尋章節…" style="margin-bottom:.4rem">' : ''}`
      + (bms.length ? `<div class="toc-bms"><h4 style="margin:.3rem 0 .1rem">書籤清單</h4>${bms.map(b => `<a href="#/read/${novelId}/${b.chapterId}${b.pIdx != null ? '?p=' + b.pIdx : ''}"><span class="bm-mark">🔖</span>${esc(b.title)}${b.snippet ? `<br><small class="muted">${esc(b.snippet)}…</small>` : ''}</a>`).join('')}</div>` : '')
      + chs.map((c, i) => `<a class="ch ${i === idx ? 'current' : ''}" data-t="${esc(c.title)}" href="#/read/${novelId}/${c.id}">${bmSet.has(c.id) ? '<span class="bm-mark" title="已加書籤">🔖</span>' : ''}${esc(c.title)}${c.id === p?.chapterId ? ' <span class="read-badge">讀到這裡</span>' : ''}</a>`).join('');
    ov.onclick = () => { ov.remove(); dr.remove(); };
    document.body.append(ov, dr);
    dr.querySelector('#toc-f')?.addEventListener('input', e => {
      const q = e.target.value.trim();
      dr.querySelectorAll('a.ch').forEach(a => a.style.display = !q || a.dataset.t.includes(q) ? '' : 'none');
    });
    dr.querySelectorAll('a').forEach(a => a.onclick = () => { ov.remove(); dr.remove(); });
    dr.querySelector('a.current')?.scrollIntoView({ block: 'center' });
  };

  // 書籤：點段落選取（虛線框），按 🔖 存到該段；沒選段落就存整章。同一位置再按一次取消
  let selP = null;
  const syncBmParas = bms => wrap.querySelectorAll('p[data-p]').forEach(el =>
    el.classList.toggle('bm-para', bms.some(b => b.chapterId === ch.id && b.pIdx === +el.dataset.p)));
  wrap.querySelectorAll('p[data-p]').forEach(el => el.onclick = () => {
    const was = el.classList.contains('sel-p');
    wrap.querySelectorAll('.sel-p').forEach(x => x.classList.remove('sel-p'));
    selP = was ? null : +el.dataset.p;
    if (!was) el.classList.add('sel-p');
    refreshBmBtn();
  });
  const bmBtn = document.getElementById('bm');
  const refreshBmBtn = async () => {
    const p = await getProgress(novelId).catch(() => null);
    const has = (p?.bookmarks || []).some(b => b.chapterId === ch.id && (b.pIdx ?? null) === selP);
    bmBtn.textContent = has ? '🔖 已書籤' : selP != null ? `🔖 書籤第${selP + 1}段` : '🔖 書籤本章';
    bmBtn.classList.toggle('primary', has);
  };
  bmBtn.onclick = async () => {
    const p = await getProgress(novelId);
    const cur = p?.bookmarks || [];
    const same = b => b.chapterId === ch.id && (b.pIdx ?? null) === selP;
    const had = cur.some(same);
    const bms = cur.filter(b => !same(b));
    if (!had) bms.push({ chapterId: ch.id, pIdx: selP, title: selP != null ? `${ch.title}・第${selP + 1}段` : ch.title, snippet: selP != null ? paras[selP].slice(0, 30) : '', at: new Date().toISOString() });
    await saveProgress(novelId, { bookmarks: bms });
    toast(had ? '已移除書籤' : '已加入書籤', 'success');
    syncBmParas(bms); refreshBmBtn();
  };
  refreshBmBtn();

  // 全文搜尋
  document.getElementById('fs-btn').onclick = () => {
    modal(`<h3>全文搜尋</h3><input id="fs-q" placeholder="搜尋小說內文"><div id="fs-res" style="margin-top:.8rem"></div>`, {
      onOpen(bg) {
        const doSearch = debounce(() => {
          const q = bg.querySelector('#fs-q').value.trim();
          if (!q) return bg.querySelector('#fs-res').innerHTML = '';
          const hits = [];
          chs.forEach(c => {
            let i = c.content.indexOf(q);
            while (i >= 0 && hits.length < 30) {
              hits.push({ ch: c, snip: c.content.slice(Math.max(0, i - 20), i + q.length + 30) });
              i = c.content.indexOf(q, i + 1);
            }
          });
          bg.querySelector('#fs-res').innerHTML = hits.length
            ? hits.map(h => `<a href="#/read/${novelId}/${h.ch.id}" style="display:block;padding:.3em 0;color:var(--text)"><b>${esc(h.ch.title)}</b><br><span class="muted">…${esc(h.snip)}…</span></a>`).join('')
            : '<p class="muted">找不到結果</p>';
          bg.querySelectorAll('#fs-res a').forEach(a => a.onclick = () => bg.remove());
        }, 250);
        bg.querySelector('#fs-q').oninput = doSearch;
      }
    });
  };

  // 還原捲動位置：?p=N 跳到指定段落；否則同一章回到上次位置，換章從頂端開始
  const pParam = new URLSearchParams(location.hash.split('?')[1] || '').get('p');
  const pEl = pParam != null ? wrap.querySelector(`[data-p="${+pParam}"]`) : null;
  const resume = pEl ? 0 : (prev?.chapterId === ch.id && prev.scroll ? prev.scroll : 0);
  if (pEl) { pEl.scrollIntoView({ block: 'center' }); pEl.classList.add('bm-flash'); setTimeout(() => pEl.classList.remove('bm-flash'), 1600); }
  else scrollTo(0, resume);

  // 儲存閱讀進度（離開本章後不再寫入，避免延遲的存檔蓋掉新章節）
  let active = true;
  const saveProg = debounce(() => { if (active) saveProgress(novelId, { chapterId: ch.id, scroll: scrollY, bookmarks: undefined }).catch(() => {}); }, 800);
  saveProgress(novelId, { chapterId: ch.id, scroll: resume }).catch(() => {});
  const onScroll = () => saveProg();
  addEventListener('scroll', onScroll, { passive: true });
  const cleanup = () => { active = false; removeEventListener('scroll', onScroll); document.body.classList.remove('reader-dark', 'reader-green'); };
  const obs = new MutationObserver(() => { if (!document.contains(app) || !app.querySelector('.reader-wrap')) { cleanup(); obs.disconnect(); } });
  obs.observe(document.body, { childList: true, subtree: false });
  addEventListener('hashchange', cleanup, { once: true });
}
