// 共用工具
import { createHistory } from './edit-history.js';
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const nowISO = () => new Date().toISOString();
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 是否為本機媒體檔 ID（非網址 / data: / blob:）
export const isFid = s => !!s && /^[\w-]+$/.test(s);
// 未登入時打開私人作品：顯示提示與登入按鈕，登入成功就重新顯示這一頁
// 列表標題旁的鎖頭（作品有設定密碼時）
export const lockBadge = it => (it?.lock?.hash ? ' <span class="lock-badge" title="需要密碼才能觀看">🔒</span>' : '');

// 密碼保護的作品：顯示輸入密碼畫面，答對就重新顯示這頁
export function lockNotice(it) {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="empty lock-box"><h2>🔒 ${esc(it.title || it.name || '這件作品')}</h2><p>這件作品有設定密碼，請輸入密碼觀看。</p>
    <form id="lk-f" class="row" style="justify-content:center;max-width:340px;margin:0 auto">
      <input id="lk-pw" type="password" placeholder="輸入密碼" autocomplete="off" style="flex:1" required>
      <button class="primary">解鎖</button></form>
    <p class="muted" id="lk-hint"></p>
    <p class="muted" id="lk-msg" role="alert"></p>
    <p><a href="#/">回首頁</a></p></div>`;
  const pw = app.querySelector('#lk-pw');
  pw.focus();
  // 圖片放在上鎖的相簿裡時，要輸入的是相簿的密碼
  import('./store.js').then(({ lockOf }) => {
    const src = lockOf(it) || it;
    const tip = [src !== it ? `這張圖片在上鎖的相簿「${src.name || src.title || ''}」裡，請輸入相簿密碼。` : '', src.lock?.hint ? `提示：${src.lock.hint}` : ''].filter(Boolean).join('　');
    app.querySelector('#lk-hint').textContent = tip;
  });
  app.querySelector('#lk-f').onsubmit = async e => {
    e.preventDefault();
    const { tryUnlock } = await import('./store.js');
    if (await tryUnlock(it, pw.value)) { toast('已解鎖', 'success'); dispatchEvent(new HashChangeEvent('hashchange')); }
    else { app.querySelector('#lk-msg').textContent = '密碼不對，請再試一次。'; pw.select(); }
  };
}

export function privateNotice() {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="empty"><h2>🔒 這是私人作品</h2><p>作者設定為私人，登入後才能觀看。</p>
    <div class="row" style="justify-content:center"><button class="primary" id="pv-login">登入</button><a href="#/"><button>回首頁</button></a></div></div>`;
  app.querySelector('#pv-login').onclick = async () => {
    const h = location.hash;
    if (await (await import('./auth.js')).requireAuth()) { location.hash = h; dispatchEvent(new HashChangeEvent('hashchange')); }
  };
}
// 沒有封面時的佔位字：略過開頭的【示範】、括號與符號，取第一個有意義的字
export const initialOf = (t, fb = '作') => String(t || '').replace(/^\s*[【\[（(][^】\]）)]*[】\]）)]\s*/, '').replace(/^[\s\p{P}\p{S}]+/u, '')[0] || fb;
export const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('zh-TW') : '';

// 簡易 HTML 消毒：只允許安全標籤
const ALLOWED = new Set(['P','BR','B','I','EM','STRONG','U','S','STRIKE','A','UL','OL','LI','BLOCKQUOTE','H1','H2','H3','H4','IMG','HR','CODE','PRE','SPAN','DIV','TABLE','THEAD','TBODY','TR','TD','TH','VIDEO','SOURCE','FIGURE','FIGCAPTION','MARK','SUB','SUP','SECTION','SMALL','EM']);
const ATTRS = {
  A: ['href','title','target','rel'],
  P: ['style','class'], H1: ['style','class'], H2: ['style','class'], H3: ['style','class'], H4: ['style','class'],
  IMG: ['src','alt','title','width','height','style','data-fid'],
  VIDEO: ['src','controls','poster','style','data-fid','width','height','preload'],
  SOURCE: ['src','type'],
  TD: ['colspan','rowspan','style'], TH: ['colspan','rowspan','style'],
  TABLE: ['style'], FIGCAPTION: ['style'], FIGURE: ['style','class','data-ph','contenteditable','data-lock'],
  SPAN: ['style','class','data-stk','role','aria-label','title','contenteditable'],
  // data-tb：模板區塊類型；data-layout：照片區排版（flow 整齊 / free 自由拼貼）
  DIV: ['style','class','contenteditable','data-tb','data-layout'], SECTION: ['style','class','data-tpl'],
};
export function sanitizeHTML(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const walk = node => {
    [...node.children].forEach(el => {
      if (!ALLOWED.has(el.tagName)) { el.replaceWith(...[...el.childNodes]); return; }
      const allow = ATTRS[el.tagName];
      [...el.attributes].forEach(a => {
        const n = a.name.toLowerCase();
        if (n.startsWith('on')) { el.removeAttribute(a.name); return; }
        if (allow ? !allow.includes(n) : n !== 'style') el.removeAttribute(a.name);
      });
      const src = el.getAttribute('src');
      if (src && !/^(https?:|data:image\/)/i.test(src)) el.removeAttribute('src');
      const href = el.getAttribute('href');
      if (href && !/^(https?:|#|mailto:)/i.test(href)) el.removeAttribute('href');
      if (el.tagName === 'A') el.setAttribute('rel', 'noopener noreferrer');
      walk(el);
    });
  };
  walk(doc.body);
  return doc.body.firstElementChild.innerHTML;
}

export function toast(msg, type = '') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function modal(html, { onOpen } = {}) {
  const root = document.getElementById('modal-root');
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => bg.remove();
  bg.addEventListener('click', e => { if (e.target === bg) close(); });
  bg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  root.appendChild(bg);
  if (onOpen) onOpen(bg, close);
  const f = bg.querySelector('input,textarea,select,button');
  if (f) f.focus();
  return { el: bg, close };
}

export function confirmDialog(message, { danger = false, okText = '確定' } = {}) {
  return new Promise(resolve => {
    modal(`
      <h3>確認</h3><p>${esc(message)}</p>
      <div class="row" style="justify-content:flex-end">
        <button data-close>取消</button>
        <button id="cf-ok" class="${danger ? 'danger' : 'primary'}">${esc(okText)}</button>
      </div>`, {
      onOpen(bg, close) {
        bg.querySelector('#cf-ok').onclick = () => { close(); resolve(true); };
        bg.addEventListener('click', e => { if (e.target === bg) resolve(false); });
      }
    });
  });
}

export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export function blobToDataURL(blob) {
  return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
}
export function dataURLToBlob(durl) {
  const [h, b] = durl.split(',');
  const mime = /data:(.*?);/.exec(h)[1];
  const bin = atob(b);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// 上傳圖片 → 縮放至 maxSize 內 → dataURL（可直接存入設定/作品欄位）
export function pickImageFile({ maxSize = 1200, quality = 0.85 } = {}) {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return resolve(null);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(f);
    };
    inp.click();
  });
}

// 讓 input 旁的上傳按鈕把選到的圖片寫進 input.value
export function attachUploadBtn(btn, input) {
  btn.onclick = async e => {
    e.preventDefault();
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const f = inp.files[0];
      if (!f) return;
      const chosen = await imageUploadDialog([f]);
      if (!chosen?.length) return;
      const d = await blobToDataURL(chosen[0].file);
      input.value = d; input.dispatchEvent(new Event('input'));
      toast('圖片已載入', 'success');
    };
    inp.click();
  };
}

// 讓 input 旁的按鈕從畫廊/相簿挑一張圖，把圖片的 fileId 寫進 input.value
export function attachGalleryBtn(btn, input) {
  btn.onclick = async e => {
    e.preventDefault();
    const fid = await pickGalleryImage();
    if (!fid) return;
    input.value = fid; input.dispatchEvent(new Event('input'));
    toast('已選擇相簿圖片', 'success');
  };
}
// 圖片挑選視窗：依相簿分頁，回傳 fileId 或 null（取消）；multi 時可複選，依點選順序回傳 fileId 陣列
export async function pickGalleryImage({ multi = false, title = '從相簿選擇封面' } = {}) {
  const { db } = await import('./db.js');
  const [images, albums] = await Promise.all([db.all('images'), db.all('albums')]);
  const pics = images.filter(i => !i.deleted && i.fileId)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  if (!pics.length) { toast('畫廊還沒有圖片，請先到「圖片」上傳', 'error'); return null; }
  const albumIds = new Set(albums.map(a => a.id));
  const tabs = [['', '全部'], ...albums.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(a => [a.id, a.name]), ['none', '未放相簿']];
  return new Promise(resolve => {
    let picked = null;
    const sel = [];
    const isOn = fid => multi ? sel.includes(fid) : fid === picked;
    modal(`<h3>${esc(title)}</h3>${multi ? '<p class="muted" style="margin:0 0 .5rem">可複選，依點選順序排列</p>' : ''}
      <div class="row" id="gp-tabs" style="flex-wrap:wrap;gap:.3rem">${tabs.map(([v, n], i) => `<button type="button" data-tab="${esc(v)}" class="${i ? '' : 'primary'}">${esc(n)}</button>`).join('')}</div>
      <div id="gp-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:.5rem;max-height:55vh;overflow:auto;margin:.8rem 0"></div>
      <div class="row" style="justify-content:flex-end"><button data-close>取消</button><button id="gp-ok" class="primary" disabled>${multi ? '加入' : '使用這張'}</button></div>`,
    {
      onOpen(bg, close) {
        const grid = bg.querySelector('#gp-grid'), ok = bg.querySelector('#gp-ok');
        const draw = tab => {
          const shown = tab === 'none' ? pics.filter(i => !albumIds.has(i.albumId)) : tab ? pics.filter(i => i.albumId === tab) : pics;
          grid.innerHTML = shown.length ? shown.map(i => `<img data-fid="${esc(i.fileId)}" title="${esc(i.title || '')}" alt="${esc(i.alt || i.title || '')}" style="width:100%;aspect-ratio:3/4;object-fit:cover;cursor:pointer;border-radius:6px;border:3px solid ${isOn(i.fileId) ? 'var(--primary)' : 'transparent'}">`).join('')
            : '<span class="muted">這裡沒有圖片</span>';
          hydrateMedia(grid);
        };
        bg.querySelector('#gp-tabs').onclick = e => {
          const b = e.target.closest('[data-tab]'); if (!b) return;
          bg.querySelectorAll('#gp-tabs button').forEach(x => x.classList.toggle('primary', x === b));
          draw(b.dataset.tab);
        };
        grid.onclick = e => {
          const im = e.target.closest('img[data-fid]'); if (!im) return;
          const fid = im.dataset.fid;
          if (multi) { const k = sel.indexOf(fid); k < 0 ? sel.push(fid) : sel.splice(k, 1); ok.disabled = !sel.length; ok.textContent = sel.length ? `加入 ${sel.length} 張` : '加入'; }
          else { picked = fid; ok.disabled = false; }
          grid.querySelectorAll('img').forEach(x => x.style.borderColor = isOn(x.dataset.fid) ? 'var(--primary)' : 'transparent');
        };
        grid.ondblclick = e => { if (!multi && e.target.closest('img[data-fid]')) ok.click(); };
        ok.onclick = () => { resolve(multi ? [...sel] : picked); close(); };
        // 取消、點背景或其他方式關閉 → null（Promise 只會採用第一次 resolve）
        const mo = new MutationObserver(() => { if (!bg.isConnected) { mo.disconnect(); resolve(null); } });
        mo.observe(bg.parentNode, { childList: true });
        draw('');
      },
    });
  });
}

// ---- Word 風格富文字工具列（execCommand，跨瀏覽器零依賴）----
// 用法：richToolbar(container, editableEl, { draftKey })
//   draftKey：有給就自動暫存到本機（重新整理或意外關閉後可還原）
export function richToolbar(bar, ce, opts = {}) {
  // 自己的復原／重做（涵蓋照片移動、縮放、區塊排序等，不只打字）
  const hist = createHistory(ce, { onRestore: () => { hydrateMedia(ce); docEd?.onRestore(); } });
  ce._hist = hist;
  let docEd = null;
  import('./doc-editor.js').then(m => { if (ce.isConnected) ce._docEd = docEd = m.attachDocEditor(ce, hist); });
  const B = (icon, title, cmd, v) => `<button type="button" data-cmd="${cmd}" ${v !== undefined ? `data-v="${v}"` : ''} title="${esc(title)}" aria-label="${esc(title)}" style="min-width:2.2em">${icon}</button>`;
  bar.innerHTML = `
    <div class="row" style="flex-wrap:wrap;gap:.15rem" role="toolbar" aria-label="編輯工具列">
      ${B('↶', '復原 (Ctrl+Z)', 'undo')}${B('↷', '重做 (Ctrl+Y)', 'redo')}
      <select data-cmd="formatBlock" title="段落樣式" aria-label="段落樣式" style="max-width:7.5em">
        <option value="p">正文</option><option value="h1">標題一</option><option value="h2">標題二</option><option value="h3">標題三</option><option value="blockquote">引用</option>
      </select>
      <select data-cmd="fontName" title="字體" aria-label="字體" style="max-width:7.5em">
        <option value="">預設字體</option><option value="'Noto Sans TC',sans-serif">黑體</option><option value="'Noto Serif TC',serif">明體</option><option value="KaiTi,'DFKai-SB',serif">楷體</option><option value="Georgia,serif">Georgia</option><option value="'Courier New',monospace">等寬</option>
      </select>
      <select data-cmd="fontSize" title="字體大小" aria-label="字體大小" style="max-width:4.5em">
        <option value="">大小</option><option value="1">極小</option><option value="2">小</option><option value="3" selected>中</option><option value="4">大</option><option value="5">特大</option><option value="6">超大</option>
      </select>
      ${B('<b>B</b>', '粗體 (Ctrl+B)', 'bold')}${B('<i>I</i>', '斜體 (Ctrl+I)', 'italic')}${B('<u>U</u>', '底線 (Ctrl+U)', 'underline')}${B('<s>S</s>', '刪除線', 'strikeThrough')}
      <input type="color" data-cmd="foreColor" value="#333333" title="文字顏色" aria-label="文字顏色" style="width:2.4em;height:2.1em;padding:0;border:1px solid var(--border)">
      <input type="color" data-cmd="hiliteColor" value="#fff3b0" title="螢光標記" aria-label="螢光標記" style="width:2.4em;height:2.1em;padding:0;border:1px solid var(--border)">
      ${B('⇤', '靠左', 'justifyLeft')}${B('⇹', '置中', 'justifyCenter')}${B('⇥', '靠右', 'justifyRight')}${B('☰', '左右對齊', 'justifyFull')}
      ${B('•≡', '項目清單', 'insertUnorderedList')}${B('1≡', '編號清單', 'insertOrderedList')}
      ${B('⇒', '增加縮排', 'indent')}${B('⇐', '減少縮排', 'outdent')}
      ${B('—', '分隔線', 'insertHorizontalRule')}
      <button type="button" id="tb-link" title="插入連結" aria-label="插入連結">🔗</button>
      <button type="button" id="tb-table" title="插入表格" aria-label="插入表格">▦</button>
      <button type="button" id="tb-img" title="插入圖片" aria-label="插入圖片">🖼</button>
      <button type="button" id="tb-video" title="插入影片" aria-label="插入影片">🎬</button>
      <button type="button" id="tb-emoji" title="表情符號" aria-label="表情符號">😊</button>
      <button type="button" id="tb-stk" title="可愛圖示／貼紙" aria-label="可愛圖示／貼紙">🐻</button>
      <button type="button" id="tb-tpl" title="套用模板（旅遊、手帳、簡約…）" aria-label="套用模板">📋 套用模板</button>
      ${B('⌫', '清除格式', 'removeFormat')}
      <small class="muted" id="tb-draft-st" style="margin-left:auto"></small>
    </div>`;
  const exec = (cmd, v) => { ce.focus(); document.execCommand(cmd, false, v); };
  // mousedown 阻止失焦，保住文字選取範圍
  bar.querySelectorAll('button[data-cmd]').forEach(b => {
    b.onmousedown = e => e.preventDefault();
    b.onclick = () => {
      if (b.dataset.cmd === 'undo') return hist.undo();
      if (b.dataset.cmd === 'redo') return hist.redo();
      exec(b.dataset.cmd, b.dataset.v || null);
    };
  });
  bar.querySelectorAll('select[data-cmd]').forEach(s => {
    s.onmousedown = () => { s._sel = getSelection().toString() ? true : false; };
    s.onchange = () => { ce.focus(); exec(s.dataset.cmd, s.value); s.selectedIndex = 0; };
  });
  bar.querySelectorAll('input[type=color]').forEach(i => i.onchange = () => exec(i.dataset.cmd, i.value));
  const insertNode = html => { ce.focus(); document.execCommand('insertHTML', false, html); };
  bar.querySelector('#tb-link').onclick = () => { const u = prompt('連結網址', 'https://'); if (u) exec('createLink', u); };
  bar.querySelector('#tb-table').onclick = () => {
    const r = +prompt('列數', '3'), c = +prompt('欄數', '3');
    if (r > 0 && c > 0) insertNode(`<table border="1" style="border-collapse:collapse;width:100%">${'<tr>' + '<td style="padding:.4em">　</td>'.repeat(c) + '</tr>'.repeat(r)}</table><p><br></p>`);
  };
  bar.querySelector('#tb-emoji').onclick = () => { const e = prompt('貼上表情符號或符號', '⭐'); if (e) insertNode(esc(e)); };
  const pickMedia = (accept, maxMB) => new Promise(res => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept;
    inp.onchange = () => res(inp.files[0]);
    inp.click();
  });
  bar.querySelector('#tb-img').onclick = async () => {
    const f = await pickMedia('image/*', 15);
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) return toast('圖片超過 15MB', 'error');
    const chosen = await imageUploadDialog([f]);
    if (!chosen) return;
    const { db } = await import('./db.js');
    for (const it of chosen) {
      const fid = uid();
      await db.put('files', { id: fid, blob: it.file });
      insertNode(`<img data-fid="${fid}" alt="" style="max-width:100%" data-name="${esc(it.name)}">`);
      toast(`已插入 ${it.name}（${(it.file.size / 1024).toFixed(0)}KB）`, 'success');
    }
  };
  bar.querySelector('#tb-video').onclick = async () => {
    const f = await pickMedia('video/mp4,video/webm,video/*');
    if (!f) return;
    if (!f.type.startsWith('video/')) return toast('不支援的影片格式（建議 MP4/WebM）', 'error');
    if (f.size > 200 * 1024 * 1024) return toast('影片超過 200MB 上限', 'error');
    const { db } = await import('./db.js');
    const fid = uid();
    await db.put('files', { id: fid, blob: f });
    insertNode(`<figure><video data-fid="${fid}" controls preload="metadata" style="max-width:100%"></video><figcaption class="muted">${esc(f.name)}</figcaption></figure><p><br></p>`);
    toast(`已插入影片 ${f.name}（${(f.size / 1048576).toFixed(1)}MB）`, 'success');
  };
  bar.querySelector('#tb-stk').onclick = async () => {
    // 記住游標位置再開面板
    const sel = getSelection();
    let range = null;
    if (sel.rangeCount && ce.contains(sel.getRangeAt(0).commonAncestorContainer)) range = sel.getRangeAt(0).cloneRange();
    const { stickerPicker, stickerHTML } = await import('./stickers.js');
    stickerPicker((id, mode) => {
      ce.focus();
      if (range) { sel.removeAllRanges(); sel.addRange(range); }
      insertNode(stickerHTML(id, mode));
      hydrateMedia(ce);
    });
  };
  // 套用模板 → 分類（旅遊／手帳／簡約…）→ 縮圖預覽；開視窗前先記住游標位置
  let tplRange = null;
  bar.querySelector('#tb-tpl').onmousedown = e => {
    e.preventDefault();
    const sel = getSelection();
    tplRange = sel.rangeCount && ce.contains(sel.getRangeAt(0).startContainer) ? sel.getRangeAt(0).cloneRange() : null;
  };
  bar.querySelector('#tb-tpl').onclick = async () => {
    const { openTemplatePicker } = await import('./doc-templates/picker.js');
    openTemplatePicker(ce, hist, tplRange);
  };
  if (opts.draftKey) localDraft(bar, ce, hist, opts.draftKey);
  // 佔位圖：點擊 → 選檔 → 替換成真圖片（free 模式可拖曳/縮放）
  ce.addEventListener('click', async e => {
    const ph = e.target.closest('.ph');
    if (!ph) return;
    const f = await pickMedia('image/*');
    if (!f) return;
    const chosen = await imageUploadDialog([f]);
    if (!chosen?.length) return;
    const { db } = await import('./db.js');
    const fid = uid();
    await db.put('files', { id: fid, blob: chosen[0].file });
    const img = document.createElement('img');
    img.dataset.fid = fid; img.alt = ph.dataset.ph || ''; img.style.maxWidth = '100%';
    img.src = URL.createObjectURL(chosen[0].file);
    ph.replaceChildren(img);
    if (ph.classList.contains('ph-free')) {
      img.style.cssText = 'width:100%;height:auto;display:block';
      ph.style.border = 'none'; ph.style.padding = '0';
      // 自由拼貼：拖曳移動
      ph.onmousedown = ev => {
        ev.preventDefault();
        const box = ph.parentElement, br = box.getBoundingClientRect();
        const sx = ev.clientX, sy = ev.clientY, sl = ph.offsetLeft, stt = ph.offsetTop;
        const mv = ev2 => { ph.style.left = Math.max(0, sl + ev2.clientX - sx) + 'px'; ph.style.top = Math.max(0, stt + ev2.clientY - sy) + 'px'; };
        const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
        addEventListener('mousemove', mv); addEventListener('mouseup', up);
      };
    } else {
      ph.style.border = 'none'; ph.style.padding = '0';
    }
    hist.record();
  });
  // 游標處格式反映在工具列（選取狀態）
  const reflect = () => {
    for (const [cmd, sel] of [['bold', '[data-cmd=bold]'], ['italic', '[data-cmd=italic]'], ['underline', '[data-cmd=underline]'], ['strikeThrough', '[data-cmd=strikeThrough]'], ['insertUnorderedList', '[data-cmd=insertUnorderedList]'], ['insertOrderedList', '[data-cmd=insertOrderedList]']]) {
      const b = bar.querySelector(sel);
      if (b) b.classList.toggle('primary', document.queryCommandState(cmd));
    }
  };
  ce.addEventListener('keyup', reflect); ce.addEventListener('mouseup', reflect);
}

// 本機自動暫存：打字或改照片後 1 秒存一次；開啟時若有比目前新的暫存，提示還原
// 存的是消毒後的 HTML（圖片只存 data-fid 參照，檔案本身已在 IndexedDB）
function localDraft(bar, ce, hist, key) {
  key = 'draft:' + key;
  const st = bar.querySelector('#tb-draft-st');
  const read = () => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  const old = read(), now = sanitizeHTML(ce.innerHTML);
  if (old?.html && old.html !== now) {
    const box = document.createElement('div');
    box.className = 'card';
    box.style.cssText = 'margin:.3rem 0;padding:.5rem .8rem;display:flex;gap:.5rem;align-items:center;flex-wrap:wrap';
    box.innerHTML = `<span style="flex:1">📝 有一份 ${new Date(old.at).toLocaleString('zh-TW')} 自動暫存、尚未儲存的內容。</span><button type="button" class="primary" data-d="restore">還原暫存</button><button type="button" data-d="drop">捨棄</button>`;
    bar.prepend(box);
    box.onclick = e => {
      const a = e.target.dataset.d; if (!a) return;
      if (a === 'restore') { hist.change(() => { ce.innerHTML = old.html; }); hydrateMedia(ce); toast('已還原暫存內容', 'success'); }
      else { try { localStorage.removeItem(key); } catch {} }
      box.remove();
    };
  }
  let t = null;
  ce.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify({ html: sanitizeHTML(ce.innerHTML), at: Date.now() }));
        st.textContent = '已自動暫存 ' + new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
      } catch { st.textContent = '無法自動暫存（瀏覽器儲存空間不足）'; }
    }, 1000);
  });
  // 正式儲存後呼叫，清掉暫存
  ce._clearDraft = () => { clearTimeout(t); try { localStorage.removeItem(key); } catch {} };
}

const MISSING_IMG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90"><rect width="120" height="90" rx="8" fill="#efe9dd"/><text x="60" y="52" font-size="11" text-anchor="middle" fill="#a09484">圖片尚未同步</text></svg>');
const BROKEN_IMG = MISSING_IMG.replace(encodeURIComponent('圖片尚未同步'), encodeURIComponent('圖片無法載入'));
export const LOCKED_IMG = MISSING_IMG.replace(encodeURIComponent('圖片尚未同步'), encodeURIComponent('🔒 需要密碼'));

// 把內容中的 data-fid 媒體補上 src（顯示用）
export async function hydrateMedia(root) {
  (await import('./stickers.js')).hydrateStickers(root);
  const { db } = await import('./db.js');
  for (const m of root.querySelectorAll('img[src]')) {
    const s = m.getAttribute('src') || '';
    if (isFid(s)) { m.dataset.fid = s; m.removeAttribute('src'); }
  }
  // 網址失效（過期連結、舊 blob: 位址）時改顯示佔位圖，而不是破圖
  for (const m of root.querySelectorAll('img')) {
    const broken = () => { if (m.src !== BROKEN_IMG && m.src !== MISSING_IMG) { console.warn('圖片無法載入', m.src.slice(0, 120)); m.src = BROKEN_IMG; } };
    m.addEventListener('error', broken);
    if (m.complete && m.getAttribute('src') && !m.naturalWidth) broken();
  }
  // 設了密碼、還沒解鎖的圖片，在列表、相簿、拼貼牆等處都只顯示鎖頭
  const { lockedFileIds } = await import('./store.js');
  const locked = await lockedFileIds();
  for (const m of root.querySelectorAll('[data-fid]')) {
    if (locked.has(m.dataset.fid)) { m.src = LOCKED_IMG; m.title = '這張圖片有設定密碼'; continue; }
    if (m.src && !/^blob:/i.test(m.src)) continue;
    let f = null;
    try { f = await db.get('files', m.dataset.fid); } catch (e) { console.warn('讀取媒體檔失敗', m.dataset.fid, e); }
    if (f?.blob instanceof Blob) m.src = URL.createObjectURL(f.blob);
    else {
      // 缺檔：顯示佔位圖（不破圖、不破壞版面）
      m.src = MISSING_IMG;
      m.title = '此圖片檔案在本機不存在（可能尚未同步）；請重新上傳或等待雲端載入';
    }
  }
}

// ---- 裁切視窗：拖曳框身移動到想要的位置、拖四角調大小、可選固定比例 ----
// 回傳 Promise<{crop, ratio} | undefined>（undefined＝取消；crop 為 null＝不裁切）
const CROP_RATIOS = [['free', '自由'], ['1', '1:1 方形'], ['0.75', '3:4'], ['1.3333', '4:3'], ['0.6667', '2:3 書封'], ['0.5625', '9:16 手機'], ['1.7778', '16:9 橫幅']];
export function cropDialog(blob, { crop = null, ratio = '1' } = {}) {
  return new Promise(async resolve => {
    const { fitCrop, moveCrop } = await import('./imgedit.js');
    const url = URL.createObjectURL(blob);
    let result;
    const { close } = modal(`
      <h3>✂ 裁切圖片</h3>
      <p class="muted" style="margin-top:0">拖曳框框移到想要的位置，拖四個角調整大小。</p>
      <div class="row" id="cd-ratios" style="flex-wrap:wrap;gap:.3rem;margin-bottom:.6rem">${CROP_RATIOS.map(([v, n]) => `<button type="button" data-r="${v}">${n}</button>`).join('')}</div>
      <div class="ed-stage"><img id="cd-img" src="${url}" alt="" draggable="false"><div id="cd-box" class="ed-crop">${['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(h => `<span class="ed-h ed-${h}" data-h="${h}"></span>`).join('')}</div></div>
      <p class="muted" id="cd-size" style="text-align:center;margin:.4rem 0"></p>
      <div class="row" style="justify-content:flex-end;flex-wrap:wrap">
        <button type="button" id="cd-none" style="margin-right:auto">不裁切</button>
        <button type="button" data-close>取消</button><button type="button" id="cd-ok" class="primary">完成</button>
      </div>`, {
      onOpen(bg) {
        const img = bg.querySelector('#cd-img'), box = bg.querySelector('#cd-box');
        const rf = () => (ratio === 'free' || !img.naturalWidth ? null : +ratio * img.naturalHeight / img.naturalWidth);
        const draw = () => {
          Object.assign(box.style, { left: crop.x * 100 + '%', top: crop.y * 100 + '%', width: crop.w * 100 + '%', height: crop.h * 100 + '%' });
          box.classList.toggle('fixed', !!rf());
          bg.querySelectorAll('[data-r]').forEach(b => b.classList.toggle('primary', b.dataset.r === ratio));
          bg.querySelector('#cd-size').textContent = `裁切後 ${Math.round(img.naturalWidth * crop.w)} × ${Math.round(img.naturalHeight * crop.h)} px`;
        };
        const ready = () => { if (!crop) crop = fitCrop(rf()); draw(); };
        img.complete && img.naturalWidth ? ready() : (img.onload = ready);
        bg.querySelector('#cd-ratios').onclick = e => {
          const b = e.target.closest('[data-r]'); if (!b) return;
          ratio = b.dataset.r; crop = fitCrop(rf()); draw();
        };
        let drag = null;
        box.addEventListener('pointerdown', e => {
          e.preventDefault();
          const r = img.getBoundingClientRect();
          drag = { h: e.target.dataset.h || 'move', sx: e.clientX, sy: e.clientY, W: r.width, H: r.height, c0: { ...crop } };
          box.setPointerCapture(e.pointerId);
        });
        box.addEventListener('pointermove', e => {
          if (!drag) return;
          crop = moveCrop(drag.c0, drag.h, (e.clientX - drag.sx) / drag.W, (e.clientY - drag.sy) / drag.H, rf());
          draw();
        });
        const end = () => { drag = null; };
        box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
        // 鍵盤微調位置（方向鍵，按住 Shift 移動多一點）
        bg.addEventListener('keydown', e => {
          const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
          if (!d || !crop) return;
          e.preventDefault();
          const s = e.shiftKey ? 0.05 : 0.01;
          crop = moveCrop(crop, 'move', d[0] * s, d[1] * s); draw();
        });
        bg.querySelector('#cd-ok').onclick = () => { result = { crop: crop.w > 0.999 && crop.h > 0.999 ? null : crop, ratio }; close(); };
        bg.querySelector('#cd-none').onclick = () => { result = { crop: null, ratio }; close(); };
        // 不論怎麼關閉都回傳結果並釋放圖片網址
        new MutationObserver((_, ob) => { if (!bg.isConnected) { ob.disconnect(); URL.revokeObjectURL(url); resolve(result); } }).observe(bg.parentNode, { childList: true });
      },
    });
  });
}

// ---- 上傳前「原檔／縮小」選擇流程 ----
// 回傳 [{file:Blob, name, keepOrig:boolean, orig:File}] 或 null（取消）
export function imageUploadDialog(files) {
  const prefs = JSON.parse(localStorage.getItem('upPrefs') || '{}');
  return new Promise(resolve => {
    const fmt = n => n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.round(n / 1024) + 'KB';
    modal(`<h3>上傳圖片（${files.length} 張）</h3>
      <label><input type="checkbox" id="up-all" style="width:auto"> 全部套用第一張的設定</label>
      <div id="up-rows" style="max-height:50vh;overflow:auto"></div>
      <p class="muted" id="up-total"></p>
      <div class="row" style="justify-content:flex-end"><button data-close>取消</button><button id="up-ok" class="primary">確認上傳</button></div>`,
      {
        onOpen(bg, close) {
          const rows = bg.querySelector('#up-rows');
          const state = files.map(f => ({ f, mode: prefs.mode || 'orig', side: prefs.side || 1920, custom: prefs.custom || 1600, quality: prefs.quality || 85, format: prefs.format || 'keep', bg: prefs.bg || '#ffffff', keepOrig: false, dims: null, crop: null, ratio: prefs.ratio || '1' }));
          const draw = () => {
            rows.innerHTML = '';
            let total = 0;
            state.forEach((st, i) => {
              const div = document.createElement('div');
              div.className = 'card'; div.style.cssText = 'padding:.6rem;margin:.4rem 0';
              div.innerHTML = `
                <div class="row">
                  <img class="thumb" id="up-th${i}" src="${URL.createObjectURL(st.f)}" style="width:56px;height:56px;object-fit:contain">
                  <div style="flex:1"><b>${esc(st.f.name)}</b> <span class="muted">${fmt(st.f.size)}</span><br><span class="muted" id="up-info${i}"></span></div>
                </div>
                <div class="row" style="margin-top:.3rem;flex-wrap:wrap;gap:.4rem">
                  <label><input type="radio" name="upm${i}" value="orig" ${st.mode === 'orig' ? 'checked' : ''} style="width:auto"> 原檔</label>
                  <label><input type="radio" name="upm${i}" value="resize" ${st.mode === 'resize' ? 'checked' : ''} style="width:auto"> 縮小</label>
                  <select id="up-side${i}" ${st.mode !== 'resize' ? 'disabled' : ''}>${[2560, 1920, 1280, 800, 0].map(v => `<option value="${v}" ${st.side === v ? 'selected' : ''}>${v ? `最長邊 ${v}px` : '自訂'}</option>`).join('')}</select>
                  <input type="number" id="up-cust${i}" value="${st.custom}" min="50" style="width:80px;display:${st.side === 0 ? '' : 'none'}" placeholder="自訂 px">
                  <select id="up-fmt${i}" ${st.mode !== 'resize' ? 'disabled' : ''}><option value="keep" ${st.format === 'keep' ? 'selected' : ''}>保留格式</option><option value="image/jpeg" ${st.format === 'image/jpeg' ? 'selected' : ''}>JPEG</option><option value="image/webp" ${st.format === 'image/webp' ? 'selected' : ''}>WebP</option></select>
                  <label id="up-q-w${i}" style="display:${st.mode === 'resize' ? '' : 'none'}">品質 <input type="range" id="up-q${i}" min="30" max="100" value="${st.quality}" style="width:80px;vertical-align:middle"><span id="up-qv${i}">${st.quality}%</span></label>
                  <label id="up-bg-w${i}" style="display:none">背景 <input type="color" id="up-bg${i}" value="${st.bg}"></label>
                  <label id="up-keep-w${i}" style="display:${st.mode === 'resize' || st.crop ? '' : 'none'}"><input type="checkbox" id="up-keep${i}" ${st.keepOrig ? 'checked' : ''} style="width:auto"> 同時保留原檔</label>
                  ${st.f.type === 'image/gif' ? '' : `<button type="button" id="up-crop${i}" class="${st.crop ? 'primary' : ''}">${st.crop ? '✂ 已裁切（再調整）' : '✂ 裁切'}</button>`}
                </div>
                <p class="muted" id="up-prev${i}" style="margin:.2rem 0 0"></p>`;
              rows.appendChild(div);
              const dims = new Image();
              dims.onload = () => { st.dims = [dims.naturalWidth, dims.naturalHeight]; update(i); };
              dims.src = URL.createObjectURL(st.f);
              div.querySelectorAll(`[name=upm${i}]`).forEach(r => r.onchange = () => { st.mode = r.value; draw(); });
              div.querySelector(`#up-side${i}`).onchange = e => { st.side = +e.target.value; draw(); };
              div.querySelector(`#up-cust${i}`).onchange = e => { st.custom = +e.target.value; update(i); };
              div.querySelector(`#up-fmt${i}`).onchange = e => { st.format = e.target.value; draw(); };
              div.querySelector(`#up-q${i}`).oninput = e => { st.quality = +e.target.value; div.querySelector(`#up-qv${i}`).textContent = st.quality + '%'; update(i); };
              div.querySelector(`#up-bg${i}`).onchange = e => { st.bg = e.target.value; update(i); };
              div.querySelector(`#up-keep${i}`).onchange = e => { st.keepOrig = e.target.checked; updTotal(); };
              div.querySelector(`#up-crop${i}`)?.addEventListener('click', async () => {
                const r = await cropDialog(st.f, { crop: st.crop, ratio: st.ratio });
                if (r) { st.crop = r.crop; st.ratio = r.ratio; draw(); }
              });
            });
            updTotal();
          };
          const updTotal = () => {
            const n = state.reduce((a, s) => a + (s.mode === 'orig' ? s.f.size : (s._est || s.f.size)) + (s.keepOrig ? s.f.size : 0), 0);
            bg.querySelector('#up-total').textContent = `預估上傳總容量：${fmt(n)}`;
          };
          const update = async i => {
            const st = state[i];
            const info = bg.querySelector(`#up-info${i}`), prev = bg.querySelector(`#up-prev${i}`);
            const d = st.dims ? `${st.dims[0]}×${st.dims[1]}` : '…';
            const th = bg.querySelector(`#up-th${i}`);
            if (st.mode === 'orig' && !st.crop) { info.textContent = d; prev.textContent = ''; st._est = st.f.size; st._res = null; updTotal(); return; }
            if (st.f.type === 'image/gif') { info.textContent = d; prev.textContent = '⚠ GIF 動畫無法縮小，將使用原檔'; st._est = st.f.size; updTotal(); return; }
            // 原檔＋裁切：不縮小、保留格式，只裁掉範圍
            const side = st.mode === 'orig' ? Infinity : st.side || st.custom;
            const isJpeg = st.mode === 'resize' && st.format === 'image/jpeg';
            bg.querySelector(`#up-bg-w${i}`).style.display = isJpeg ? '' : 'none';
            bg.querySelector(`#up-q-w${i}`).style.display = st.mode !== 'resize' || st.format === 'image/png' ? 'none' : '';
            if (isJpeg) prev.textContent = '⚠ 轉 JPEG 會失去透明背景，已套用背景色';
            try {
              const { resizeImageFile } = await import('./imgedit.js');
              const r = await resizeImageFile(st.f, st.mode === 'orig' ? { maxSide: side, quality: 92, crop: st.crop } : { maxSide: side, quality: st.quality, format: st.format, bg: st.bg, crop: st.crop });
              if (th) th.src = URL.createObjectURL(r.blob);
              st._est = r.size; st._res = r;
              const save = Math.round((1 - r.size / st.f.size) * 100);
              prev.textContent = st.mode === 'orig' ? `✂ 已裁切：${d} → ${r.width}×${r.height}，${fmt(r.size)}` : `${d} → ${r.width}×${r.height}，${fmt(st.f.size)} → ${fmt(r.size)}${save > 0 ? `，省 ${save}%` : ' ⚠ 處理後更大，建議改用原檔'}`;
            } catch { prev.textContent = '⚠ 無法處理此圖片，將使用原檔'; st._est = st.f.size; }
            updTotal();
          };
          bg.querySelector('#up-all').onchange = e => {
            if (e.target.checked) state.forEach((s, i) => { if (i) { s.mode = state[0].mode; s.side = state[0].side; s.quality = state[0].quality; s.format = state[0].format; } });
            draw();
          };
          draw();
          bg.querySelector('#up-ok').onclick = async () => {
            const out = [];
            for (let i = 0; i < state.length; i++) {
              const st = state[i];
              if ((st.mode === 'resize' || st.crop) && st.f.type !== 'image/gif' && st._res) {
                const nf = new File([st._res.blob], st.f.name.replace(/\.[^.]+$/, '') + '.' + st._res.format.split('/')[1], { type: st._res.format });
                out.push({ file: nf, name: st.f.name, orig: st.keepOrig ? st.f : null });
              } else out.push({ file: st.f, name: st.f.name, orig: null });
            }
            localStorage.setItem('upPrefs', JSON.stringify({ mode: state[0].mode, side: state[0].side, custom: state[0].custom, quality: state[0].quality, format: state[0].format, bg: state[0].bg, ratio: state[0].ratio }));
            close(); resolve(out);
          };
          bg.querySelector('[data-close]').onclick = () => { close(); resolve(null); };
        }
      });
  });
}
