// 繪本故事：清單、翻頁閱讀（朗讀／自動播放）、頁面編輯器（圖＋文、排版、排序、貼上/上傳/從相簿加頁）
import { list, get, save, trash, listCategories, getProgress, saveProgress, canView, isLocked } from '../store.js';
import { db } from '../db.js';
import { validateImage } from '../imgedit.js';
import { esc, uid, modal, toast, confirmDialog, fmtDate, attachUploadBtn, attachGalleryBtn, pickGalleryImage, imageUploadDialog, hydrateMedia, isFid, initialOf, privateNotice, lockNotice, lockBadge } from '../util.js';
import { shareDialog, countView, catChips, bindCatChips } from './novel.js';
import { isAuthed } from '../auth.js';
import { selectMode } from '../select-mode.js';
import { setNav } from './home.js';
import { splitSentences, speakSentences, voiceDialog, duckMusic } from '../tts.js';


const STATUSES = ['創作中', '已完成'];
const LAYOUTS = [['below', '圖上文下'], ['over', '文字疊在圖上'], ['image', '只有圖'], ['text', '只有文字']];

// 圖片來源可為畫廊 fileId 或網址
const imgAttr = src => isFid(src) ? `data-fid="${esc(src)}"` : `src="${esc(src)}"`;
const coverOf = b => b.cover || (b.pages || []).find(p => p.image)?.image || '';

export async function renderBooks() {
  const app = document.getElementById('app');
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const cat = q.get('cat') || '', kw = q.get('q') || '';
  sessionStorage.setItem('lastType', 'book');
  if (cat) sessionStorage.setItem('cat:book', cat);
  const [items, cats] = await Promise.all([list('book'), listCategories('book')]);
  const shown = items.filter(b =>
    (!cat || (cat === 'uncategorized' ? !(b.categoryIds || []).length : (b.categoryIds || []).includes(cat))) &&
    (!kw || (b.title + (b.desc || '') + (b.pages || []).map(p => p.text).join('')).includes(kw)));
  app.innerHTML = `
    <div class="row"><h1 style="margin-right:auto">繪本故事</h1>
      <form id="bf"><input name="q" placeholder="關鍵字" value="${esc(kw)}" style="max-width:160px"><button>搜尋</button></form>
      ${isAuthed() ? '<button id="sel-btn">☑ 選取</button><button id="new-b" class="primary">＋ 新增繪本</button>' : ''}</div>
    ${catChips(cats, 'book', '#/books', cat)}
    ${shown.length ? `<div class="album-shelf" style="margin-top:1rem">${shown.map(b => {
      const cv = coverOf(b);
      return `<a class="album-book" href="#/book/${b.id}" data-sel="${b.id}">
        <div class="album-book-cover">${cv ? `<img ${imgAttr(cv)} alt="">` : `<span style="font-size:2.4rem">${esc(initialOf(b.title, '📚'))}</span>`}</div>
        <b>${esc(b.title)}${lockBadge(b)} ${b.demo ? '<span class="tag">示範</span>' : ''}</b>
        <small class="muted">${esc(b.author || '')}${b.author ? ' ・ ' : ''}${(b.pages || []).length} 頁${b.status === '創作中' ? ' ・ 創作中' : ''}</small></a>`;
    }).join('')}</div>` : `<div class="empty">${isAuthed() ? '還沒有繪本，按「＋ 新增繪本」開始做第一本' : '還沒有繪本'}</div>`}`;
  document.getElementById('bf').onsubmit = e => { e.preventDefault(); location.hash = `#/books?q=${encodeURIComponent(new FormData(e.target).get('q'))}`; };
  document.getElementById('new-b')?.addEventListener('click', () => editor(cat && cat !== 'uncategorized' ? { categoryIds: [cat] } : null));
  bindCatChips('book', renderBooks);
  selectMode({
    button: document.getElementById('sel-btn'), root: app.querySelector('.album-shelf') || app, actions: [
      { label: '🗑 刪除', danger: true, confirm: n => `把選取的 ${n} 本繪本移到回收筒？（可在「管理 → 回收筒」還原）`,
        run: async ids => { for (const id of ids) await trash('book', id); toast(`已刪除 ${ids.length} 本`, 'success'); renderBooks(); } },
    ],
  });
  setNav();
  hydrateMedia(app);
}

// ---- 閱讀：沿用相簿的翻書版面；0 = 封面，1..n = 內頁，n+1 = 完 ----
export async function renderBook(id) {
  const app = document.getElementById('app');
  const b = await get('book', id);
  if (!b || b.deleted) return app.innerHTML = '<div class="empty">找不到這本繪本 <a href="#/books">回繪本區</a></div>';
  if (!canView(b)) return privateNotice();
  if (isLocked(b)) return lockNotice(b);
  const pages = b.pages || [];
  const authed = isAuthed();
  const canSpeak = 'speechSynthesis' in window;
  sessionStorage.setItem('lastType', 'book');
  app.innerHTML = `
    <div class="row"><a href="#/books">← 繪本故事</a><span style="margin-left:auto"></span>
      ${canSpeak ? '<button id="bk-read" title="朗讀目前這頁">🔊 朗讀</button><button id="bk-auto" title="自動朗讀並翻頁">▶ 自動播放</button><button id="bk-voice" title="選擇朗讀聲音、語速、音調">🎙 聲音</button>' : ''}
      ${authed ? '<button id="bk-edit">編輯</button><button id="bk-share">分享</button><button id="bk-del" class="danger">刪除</button>' : ''}
    </div>
    <div class="album-viewer book-viewer">
      <button class="ab-nav ab-prev" aria-label="上一頁">‹</button>
      <div class="album-spread" id="bk-spread"></div>
      <button class="ab-nav ab-next" aria-label="下一頁">›</button>
    </div>
    <p class="muted" id="bk-count" style="text-align:center"></p>
    ${b.desc ? `<div class="card" style="margin-top:.5rem"><p style="margin:0;white-space:pre-wrap">${esc(b.desc)}</p>
      <p class="muted" style="margin:.5rem 0 0">${(b.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')} 👁 ${b.views || 0} ・ 更新於 ${fmtDate(b.updatedAt)}</p></div>` : ''}`;

  const total = pages.length + 2; // 封面 + 內頁 + 完
  const pageHTML = n => {
    if (n === 0) {
      const cv = coverOf(b);
      return `<div class="album-page album-front">${cv ? `<img ${imgAttr(cv)} alt="">` : ''}
        <div class="album-front-title"><h1>${esc(b.title)}</h1><p>${esc(b.author ? '文・圖／' + b.author : '')}</p></div></div>`;
    }
    if (n === total - 1) return `<div class="album-page book-end"><p>— 完 —</p><small class="muted">${esc(b.title)}</small></div>`;
    const p = pages[n - 1];
    if (!p) return '<div class="album-page album-blank"></div>';
    const lay = !p.image ? 'text' : !p.text?.trim() ? 'image' : p.layout || 'below';
    return `<div class="album-page book-page lay-${lay}">
      ${lay !== 'text' ? `<img ${imgAttr(p.image)} alt="">` : ''}
      ${lay !== 'image' ? `<div class="book-text">${esc(p.text)}</div>` : ''}
      <span class="album-pno">${n}</span></div>`;
  };
  const wide = () => matchMedia('(min-width: 800px)').matches;
  // 寬螢幕：封面單獨一跨頁，之後兩頁一跨 (1,2)(3,4)…
  const spreadOf = (n, w = wide()) => !w || n === 0 ? n : Math.ceil(n / 2);
  const pagesOf = (s, w = wide()) => !w ? [s] : s === 0 ? [0] : [2 * s - 1, 2 * s].filter(n => n < total);
  const last = () => spreadOf(total - 1);
  const prog = await getProgress(id).catch(() => null);
  const startAt = +new URLSearchParams(location.hash.split('?')[1] || '').get('p') || prog?.page || 0;
  let spread = spreadOf(Math.min(startAt, total - 1)), dir = 0;

  const el = document.getElementById('bk-spread');
  function draw() {
    spread = Math.max(0, Math.min(spread, last()));
    const ps = pagesOf(spread);
    el.className = 'album-spread';
    void el.offsetWidth; // 重新觸發翻頁動畫
    el.className = `album-spread ${ps.length > 1 ? 'two' : 'one'} ${dir > 0 ? 'turn-next' : dir < 0 ? 'turn-prev' : ''}`;
    el.innerHTML = ps.map(pageHTML).join('');
    document.querySelector('.ab-prev').disabled = spread === 0;
    document.querySelector('.ab-next').disabled = spread >= last();
    const inner = ps.filter(n => n > 0 && n <= pages.length);
    document.getElementById('bk-count').textContent = !pages.length ? (authed ? '這本繪本還沒有內頁，按「編輯」加入頁面。' : '這本繪本還沒有內頁。')
      : inner.length ? `第 ${inner.join('–')} 頁 / 共 ${pages.length} 頁　（← → 鍵或滑動翻頁）` : ps.includes(0) ? `封面 / 共 ${pages.length} 頁` : '故事結束';
    hydrateMedia(el);
    saveProgress(id, { page: ps[0] }).catch(() => {});
  }
  const go = d => { const n = spread + d; if (n < 0 || n > last()) return false; dir = d; spread = n; draw(); return true; };

  // 朗讀：挑最自然的中文語音逐句讀，背景音樂自動調小；自動播放時讀完一跨頁就翻下一頁
  let auto = false, tok = 0, timer = null, stopFn = null;
  const autoBtn = document.getElementById('bk-auto');
  const pageText = () => pagesOf(spread).map(n => n === 0 ? `${b.title}。${b.author ? '作者，' + b.author + '。' : ''}` : n === total - 1 ? '故事說完了。' : pages[n - 1]?.text || '').join('\n').trim();
  function stopSpeak() {
    tok++; clearTimeout(timer); stopFn?.(); stopFn = null;
    if (canSpeak) speechSynthesis.cancel();
    duckMusic(false);
  }
  function speak(after) {
    stopSpeak();
    const my = tok, sentences = splitSentences(pageText());
    const done = () => { if (my === tok && after) after(); };
    if (!sentences.length) { timer = setTimeout(done, 2500); return; }
    duckMusic(true);
    speakSentences(sentences, { onEnd: () => { if (my !== tok) return; stopFn = null; if (!after) duckMusic(false); timer = setTimeout(done, 900); } })
      .then(stop => { if (my === tok) stopFn = stop; else stop(); });
  }
  const step = () => { if (!auto || !document.contains(el)) return setAuto(false); if (go(1)) speak(step); else setAuto(false); };
  function setAuto(on) {
    auto = on;
    if (autoBtn) autoBtn.textContent = on ? '⏸ 暫停' : '▶ 自動播放';
    on ? speak(step) : stopSpeak();
  }
  autoBtn?.addEventListener('click', () => setAuto(!auto));
  document.getElementById('bk-voice')?.addEventListener('click', () => { setAuto(false); voiceDialog(); });
  document.getElementById('bk-read')?.addEventListener('click', () => { setAuto(false); speak(null); });
  // 手動翻頁：自動播放中就從新的那頁接著讀，否則停止朗讀
  const nav = d => { if (go(d)) auto ? speak(step) : stopSpeak(); };
  document.querySelector('.ab-prev').onclick = () => nav(-1);
  document.querySelector('.ab-next').onclick = () => nav(1);
  const onKey = e => {
    if (!document.contains(el)) return removeEventListener('keydown', onKey);
    if (document.querySelector('.lightbox, .modal-bg') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft') nav(-1);
    if (e.key === 'ArrowRight') nav(1);
  };
  addEventListener('keydown', onKey);
  // 離開頁面就停止朗讀
  const onLeave = () => { stopSpeak(); removeEventListener('hashchange', onLeave); };
  addEventListener('hashchange', onLeave);
  let x0 = null;
  el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) nav(dx < 0 ? 1 : -1); x0 = null; });
  // 轉向/縮放切換單頁/跨頁時，停在同一頁
  let wasWide = wide();
  const onResize = () => {
    if (!document.contains(el)) return removeEventListener('resize', onResize);
    if (wide() === wasWide) return;
    const first = pagesOf(spread, wasWide)[0];
    wasWide = wide(); dir = 0; spread = spreadOf(first); draw();
  };
  addEventListener('resize', onResize);
  draw();
  countView('book', id);

  if (!authed) return;
  document.getElementById('bk-edit').onclick = () => { setAuto(false); editor(b); };
  document.getElementById('bk-share').onclick = () => shareDialog(b);
  document.getElementById('bk-del').onclick = async () => {
    if (await confirmDialog(`確定刪除「${b.title}」？（會先移到回收筒）`)) { stopSpeak(); await trash('book', id); location.hash = '#/books'; }
  };
}

// 選檔 → 原檔/縮小確認 → 存進 files，回傳 fileId 陣列
function uploadImages(multiple = true) {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = multiple;
    inp.onchange = async () => resolve(await storeFiles([...inp.files]));
    inp.click();
  });
}
async function storeFiles(files) {
  if (!files.length) return [];
  const chosen = await imageUploadDialog(files);
  const out = [];
  for (const it of chosen || []) {
    const err = validateImage(it.file);
    if (err) { toast(err, 'error'); continue; }
    const fid = uid();
    await db.put('files', { id: fid, blob: it.file });
    out.push(fid);
  }
  return out;
}

// ---- 編輯器 ----
async function editor(d) {
  const cats = await listCategories('book');
  const orig = d?.id ? d : null;
  let pages = (d?.pages || []).map(p => ({ ...p }));
  const uploaded = new Set(); // 這次編輯新上傳的檔案；取消時清掉
  let saved = false;
  modal(`
    <h3>${orig ? '編輯' : '新增'}繪本</h3>
    <div class="row">
      <div style="flex:2"><label>書名</label><input id="b-t" value="${esc(d?.title || '')}"></div>
      <div style="flex:1"><label>作者／繪者</label><input id="b-au" value="${esc(d?.author || '')}"></div>
    </div>
    <label>故事簡介</label><textarea id="b-d" rows="2">${esc(d?.desc || '')}</textarea>
    <label>封面（留空就用第一頁的圖）</label><div class="field-inline"><input id="b-cover" value="${esc(d?.cover || '')}" placeholder="網址、上傳或從相簿選"><button id="b-cover-up" type="button">上傳</button><button id="b-cover-gal" type="button">🖼 從相簿選</button></div>
    <h4 style="margin:1rem 0 .4rem">內頁 <span class="muted" id="b-pcount"></span></h4>
    <div class="row" style="flex-wrap:wrap;gap:.3rem">
      <button type="button" id="b-add-gal">🖼 從相簿加入多頁</button>
      <button type="button" id="b-add-up">⬆ 上傳多張成為頁面</button>
      <button type="button" id="b-add-blank">＋ 空白頁</button>
    </div>
    <p class="muted" style="margin:.3rem 0">也可以直接 Ctrl+V 貼上圖片（例如 ChatGPT 複製的圖），每張自動成為一頁。</p>
    <div id="b-pages" class="book-edit-pages"></div>
    <div class="row">
      <div style="flex:1"><label>狀態</label><select id="b-st">${STATUSES.map(s => `<option ${d?.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div style="flex:2"><label>分類</label><select id="b-cat" multiple size="3">${cats.map(c => `<option value="${c.id}" ${(d?.categoryIds || []).includes(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>${cats.length ? '' : '<p class="muted" style="margin:.2rem 0">尚未建立繪本分類（可到「管理 → 分類」套用範本）</p>'}</div>
    </div>
    <label>標籤（逗號分隔）</label><input id="b-tags" list="tag-suggest" value="${esc((d?.tags || []).join(', '))}"><datalist id="tag-suggest"></datalist>
    <label><input type="checkbox" id="b-feat" ${d?.featured ? 'checked' : ''} style="width:auto"> 設為精選</label>
    <div class="row" style="justify-content:flex-end;margin-top:1rem"><button data-close>取消</button><button id="b-save" class="primary">儲存</button></div>`,
    {
      async onOpen(bg, close) {
        attachUploadBtn(bg.querySelector('#b-cover-up'), bg.querySelector('#b-cover'));
        attachGalleryBtn(bg.querySelector('#b-cover-gal'), bg.querySelector('#b-cover'));
        const { tagStats } = await import('../store.js');
        bg.querySelector('#tag-suggest').innerHTML = (await tagStats()).map(([t]) => `<option value="${esc(t)}">`).join('');
        const box = bg.querySelector('#b-pages');
        const addPages = (fids, own) => {
          for (const f of fids) { pages.push({ id: uid(), image: f, text: '', layout: 'below', ownFile: own }); if (own) uploaded.add(f); }
          draw();
          if (fids.length) { toast(`已加入 ${fids.length} 頁`, 'success'); box.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        };
        function draw() {
          bg.querySelector('#b-pcount').textContent = `（${pages.length} 頁）`;
          box.innerHTML = pages.map((p, i) => `
            <div class="book-edit-page" data-i="${i}">
              <div class="bep-img">${p.image ? `<img ${imgAttr(p.image)} alt="">` : '<span class="muted">無圖</span>'}
                <div class="row" style="gap:.2rem;justify-content:center"><button type="button" data-a="pick" title="從相簿換圖">🖼</button><button type="button" data-a="up" title="上傳換圖">⬆</button>${p.image ? '<button type="button" data-a="noimg" title="移除圖片">🚫</button>' : ''}</div>
              </div>
              <div class="bep-body">
                <div class="row" style="gap:.3rem"><b>第 ${i + 1} 頁</b>
                  <select data-f="layout" style="width:auto;margin-left:auto">${LAYOUTS.map(([v, n]) => `<option value="${v}" ${(p.layout || 'below') === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
                  <button type="button" data-a="up1" ${i ? '' : 'disabled'} title="上移">↑</button><button type="button" data-a="down1" ${i < pages.length - 1 ? '' : 'disabled'} title="下移">↓</button><button type="button" data-a="del" title="刪除此頁">✕</button>
                </div>
                <textarea data-f="text" rows="3" placeholder="這一頁的故事文字…">${esc(p.text || '')}</textarea>
              </div>
            </div>`).join('') || '<div class="empty" style="padding:1rem">還沒有頁面</div>';
          hydrateMedia(box);
        }
        draw();
        box.addEventListener('input', e => {
          const i = +e.target.closest('[data-i]')?.dataset.i, f = e.target.dataset.f;
          if (f && pages[i]) pages[i][f] = e.target.value;
        });
        box.addEventListener('click', async e => {
          const btn = e.target.closest('[data-a]'); if (!btn) return;
          const i = +btn.closest('[data-i]').dataset.i, a = btn.dataset.a, p = pages[i];
          if (a === 'up1') [pages[i - 1], pages[i]] = [pages[i], pages[i - 1]];
          if (a === 'down1') [pages[i + 1], pages[i]] = [pages[i], pages[i + 1]];
          if (a === 'del') { if ((p.image || p.text) && !await confirmDialog(`刪除第 ${i + 1} 頁？`)) return; pages.splice(i, 1); }
          if (a === 'noimg') Object.assign(p, { image: '', ownFile: false });
          if (a === 'pick') { const f = await pickGalleryImage({ title: `第 ${i + 1} 頁的圖` }); if (!f) return; Object.assign(p, { image: f, ownFile: false }); }
          if (a === 'up') { const [f] = await uploadImages(false); if (!f) return; uploaded.add(f); Object.assign(p, { image: f, ownFile: true }); }
          draw();
        });
        bg.querySelector('#b-add-gal').onclick = async () => addPages(await pickGalleryImage({ multi: true, title: '選擇要加入的頁面圖片' }) || [], false);
        bg.querySelector('#b-add-up').onclick = async () => addPages(await uploadImages(true), true);
        bg.querySelector('#b-add-blank').onclick = () => { pages.push({ id: uid(), image: '', text: '', layout: 'text' }); draw(); box.lastElementChild?.scrollIntoView({ block: 'nearest' }); };
        // 貼上圖片 → 新增頁面（在文字框裡貼純文字照常）
        const onPaste = async e => {
          if (!bg.isConnected || document.querySelector('.modal-bg:last-child') !== bg) return;
          const fs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
          if (!fs.length) return;
          e.preventDefault();
          addPages(await storeFiles(fs.map((f, k) => new File([f], `頁面${pages.length + k + 1}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type }))), true);
        };
        document.addEventListener('paste', onPaste);
        // 關閉時：移除監聽；沒儲存就清掉這次上傳的檔案
        const mo = new MutationObserver(async () => {
          if (bg.isConnected) return;
          mo.disconnect(); document.removeEventListener('paste', onPaste);
          if (!saved) for (const f of uploaded) await db.del('files', f);
        });
        mo.observe(bg.parentNode, { childList: true });

        bg.querySelector('#b-save').onclick = async () => {
          const title = bg.querySelector('#b-t').value.trim();
          if (!title) return toast('請輸入書名', 'error');
          saved = true;
          // 儲存後不再使用的「自己上傳」檔案一併刪除
          const keep = new Set(pages.map(p => p.image));
          for (const p of orig?.pages || []) if (p.ownFile && p.image && !keep.has(p.image)) await db.del('files', p.image);
          for (const f of uploaded) if (!keep.has(f)) await db.del('files', f);
          const o = await save('book', {
            ...(d || {}), title, author: bg.querySelector('#b-au').value.trim(), desc: bg.querySelector('#b-d').value,
            cover: bg.querySelector('#b-cover').value.trim(), pages, status: bg.querySelector('#b-st').value,
            categoryIds: [...bg.querySelector('#b-cat').selectedOptions].map(o => o.value),
            tags: [...new Set(bg.querySelector('#b-tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean))],
            featured: bg.querySelector('#b-feat').checked,
          });
          close(); toast('已儲存', 'success');
          if (location.hash === `#/book/${o.id}`) renderBook(o.id); else location.hash = `#/book/${o.id}`;
        };
      }
    });
}
