// 圖片：上傳、相簿、編輯、燈箱
import { list, get, save, trash, listCategories } from '../store.js';
import { db } from '../db.js';
import { applyEdits, validateImage, IMAGE_LIMIT } from '../imgedit.js';
import { esc, uid, modal, toast, confirmDialog, fmtDate, hydrateMedia } from '../util.js';
import { shareDialog, countView, catChips, bindCatChips } from './novel.js';
import { setNav } from './home.js';
import { isAuthed } from '../auth.js';

async function fileURL(fileId) {
  const f = await db.get('files', fileId);
  return f ? URL.createObjectURL(f.blob) : '';
}

export async function renderGallery() {
  const [images, albums, iCats] = await Promise.all([list('image'), db.all('albums'), listCategories('image')]);
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const albumId = qs.get('album');
  const catId = qs.get('cat');
  sessionStorage.setItem('lastType', 'image');
  if (catId) sessionStorage.setItem('cat:image', catId);

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="row"><h1 style="margin-right:auto">圖片畫廊</h1>${isAuthed() ? '<button id="new-album">＋ 相簿</button>' : ''}</div>
    ${isAuthed() ? `<div class="drop-zone" id="dz"><p>拖曳圖片到此上傳，或 <button id="pick" class="primary">選擇圖片</button>（支援 JPG/PNG/GIF/WebP/AVIF/BMP，單張上限 15MB）</p>
      <input type="file" id="file" accept="image/*" multiple class="hidden">
      <div id="up-prog"></div>
    </div>` : ''}
    ${catChips(iCats, 'image', '#/gallery', catId)}
    ${albumId ? `<p class="muted">正在上傳到相簿「${esc(albums.find(a => a.id === albumId)?.name || '')}」 ・ <a href="#/album/${albumId}">← 回到相簿</a></p>`
      : albums.length ? `<h2 class="section-title">相簿</h2><div class="album-shelf">${albums.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(a => {
        const its = images.filter(i => i.albumId === a.id);
        const cv = its.find(i => i.id === a.coverId) || its[0];
        return `<a class="album-book" href="#/album/${a.id}">
          <div class="album-book-cover">${cv ? `<img data-fid="${esc(cv.fileId)}" alt="">` : '<span>📖</span>'}</div>
          <b>${esc(a.name)}</b><small class="muted">${its.length} 張</small></a>`;
      }).join('')}</div><h2 class="section-title">其他圖片</h2>` : ''}
    <div id="grid" class="gal-grid" style="margin-top:1rem"></div>`;

  // 已放進相簿的圖片只在相簿裡看，不再出現在畫廊列表（相簿已刪除的除外）
  const albumIds = new Set(albums.map(a => a.id));
  const shown = (albumId ? images.filter(i => i.albumId === albumId) : images.filter(i => !albumIds.has(i.albumId)))
    .filter(i => !catId || (catId === 'uncategorized' ? !(i.categoryIds || []).length && !i.categoryId : (i.categoryIds || []).includes(catId) || i.categoryId === catId));
  const grid = document.getElementById('grid');
  if (!shown.length) { grid.innerHTML = `<div class="empty">${!albumId && images.length ? '所有圖片都已放進相簿' : '尚無圖片'}</div>`; }
  for (const im of shown) {
    const card = document.createElement('a');
    card.className = 'gal-card'; card.href = `#/image/${im.id}`;
    card.innerHTML = `<img alt="${esc(im.alt || im.title)}"><div class="gal-cap">${esc(im.title)}${im.demo ? ' <span class="tag">示範</span>' : ''}</div>`;
    card.querySelector('img').src = await fileURL(im.fileId);
    grid.appendChild(card);
  }

  const fi = document.getElementById('file'), dz = document.getElementById('dz');
  if (fi) {
    document.getElementById('pick').onclick = () => fi.click();
    fi.onchange = () => upload([...fi.files]);
    dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); };
    dz.ondragleave = () => dz.classList.remove('over');
    dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); upload([...e.dataTransfer.files]); };
  }
  const na = document.getElementById('new-album');
  if (na) na.onclick = () => {
    modal(`<h3>新增相簿</h3><label>名稱</label><input id="al-name"><div class="row" style="justify-content:flex-end;margin-top:1rem"><button data-close>取消</button><button id="al-ok" class="primary">建立</button></div>`, {
      onOpen(bg, close) {
        bg.querySelector('#al-ok').onclick = async () => {
          const name = bg.querySelector('#al-name').value.trim();
          if (!name) return;
          const id = uid();
          await db.put('albums', { id, name, order: Date.now(), createdAt: new Date().toISOString() });
          close(); location.hash = `#/album/${id}`;
        };
      }
    });
  };
  bindCatChips('image', renderGallery);
  setNav();
  hydrateMedia(app);

  async function upload(files) {
    const prog = document.getElementById('up-prog');
    const { imageUploadDialog } = await import('../util.js');
    const chosen = await imageUploadDialog(files);
    if (!chosen) return;
    let done = 0;
    for (const it of chosen) {
      const f = it.file;
      const err = validateImage(f);
      if (err) { toast(err, 'error'); continue; }
      prog.innerHTML = `<progress value="${done}" max="${files.length}"></progress><span class="muted">上傳 ${it.name}（${done + 1}/${files.length}）</span>`;
      const fileId = uid();
      await db.put('files', { id: fileId, blob: f });
      let origFileId = null;
      if (it.orig) { origFileId = uid(); await db.put('files', { id: origFileId, blob: it.orig }); }
      await save('image', { title: it.name.replace(/\.[^.]+$/, ''), fileId, origFileId, alt: '', caption: '', tags: [], categoryIds: catId && catId !== 'uncategorized' ? [catId] : [], versions: [], albumId: albumId || null });
      done++;
    }
    prog.innerHTML = done ? `<span class="muted">完成 ${done} 張</span>` : '';
    if (done) { toast(`已上傳 ${done} 張圖片`, 'success'); renderGallery(); }
  }
}

export async function renderImageDetail(id) {
  const im = await get('image', id);
  if (!im) return document.getElementById('app').innerHTML = '<div class="empty">找不到圖片</div>';
  const images = await list('image');
  const idx = images.findIndex(i => i.id === id);
  const src = await fileURL(im.fileId);
  const cats = await listCategories('image');
  const albums = await db.all('albums');
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="row"><a href="#/gallery">← 畫廊</a>${im.albumId && albums.some(a => a.id === im.albumId) ? ` <a href="#/album/${im.albumId}">📖 ${esc(albums.find(a => a.id === im.albumId).name)}</a>` : ''}
      ${idx > 0 ? `<a href="#/image/${images[idx - 1].id}">上一張</a>` : ''}
      ${idx < images.length - 1 ? `<a href="#/image/${images[idx + 1].id}">下一張</a>` : ''}
      <span style="margin-left:auto"></span>
      ${isAuthed() ? `<button id="im-edit">編輯圖片</button>
      <button id="im-meta">編輯資訊</button>` : ''}
      <a id="im-dl" download="${esc(im.title)}.png"><button>下載</button></a>
      ${isAuthed() ? `<button id="im-share">分享</button>
      <button id="im-del" class="danger">刪除</button>` : ''}
      <span class="muted">👁 ${im.views || 0} 次觀看</span>
    </div>
    <div class="card" style="text-align:center;margin-top:1rem"><img id="im-main" src="${src}" alt="${esc(im.alt || im.title)}" style="max-height:70vh"></div>
    <div class="card" style="margin-top:1rem">
      <h2 style="margin-top:0">${esc(im.title)}</h2>
      <p>${esc(im.caption || '')}</p>
      <div class="muted">${fmtDate(im.createdAt)} ・ ${(im.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    </div>
    ${(im.versions || []).length ? `<h3 class="section-title">編輯版本</h3><div class="row" id="vers"></div>` : ''}`;

  countView('image', id);
  document.getElementById('im-dl').href = src;
  for (const v of im.versions || []) {
    const a = document.createElement('a');
    a.innerHTML = `<img class="thumb" style="width:110px" title="${esc(v.note || '編輯版本')}">`;
    a.querySelector('img').src = await fileURL(v.fileId);
    a.onclick = e => { e.preventDefault(); lightbox(a.querySelector('img').src, im.title); };
    document.getElementById('vers').appendChild(a);
  }
  document.getElementById('im-main').onclick = () => lightbox(src, im.title, images, idx);
  const delBtn = document.getElementById('im-del');
  if (delBtn) delBtn.onclick = async () => {
    if (await confirmDialog(`確定刪除「${im.title}」？（會先移到回收筒）`)) { await trash('image', id); location.hash = '#/gallery'; }
  };
  const shBtn = document.getElementById('im-share');
  if (shBtn) shBtn.onclick = () => shareDialog(im);
  const metaBtn = document.getElementById('im-meta');
  if (metaBtn) metaBtn.onclick = () => {
    modal(`<h3>編輯圖片資訊</h3>
      <label>標題</label><input id="g-title" value="${esc(im.title)}">
      <label>說明</label><textarea id="g-cap" rows="3">${esc(im.caption || '')}</textarea>
      <label>替代文字（無障礙）</label><input id="g-alt" value="${esc(im.alt || '')}">
      <label>分類（圖片分類）</label>
      ${cats.length ? `<select id="g-cat" multiple size="4">${cats.map(c => `<option value="${c.id}" ${(im.categoryIds || []).includes(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`
        : '<p class="muted">尚未建立圖片分類</p>'}
      <div class="row"><input id="g-cat-new" placeholder="新圖片分類名稱" style="flex:1"><button id="g-cat-add" type="button">建立並選取</button><button id="g-cat-tpl" type="button">套用範本</button></div>
      <p id="g-cat-warn" class="muted" style="color:#b3443c"></p>
      <label>相簿</label><select id="g-album"><option value="">（不放入相簿）</option>${albums.map(a => `<option value="${a.id}" ${a.id === im.albumId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
      <label>標籤（逗號分隔）</label><input id="g-tags" value="${esc((im.tags || []).join(', '))}">
      <label><input type="checkbox" id="g-feat" ${im.featured ? 'checked' : ''} style="width:auto"> 設為精選</label>
      <div class="row" style="justify-content:flex-end;margin-top:1rem"><button data-close>取消</button><button id="g-save" class="primary">儲存</button></div>`,
      {
        async onOpen(bg, close) {
          const validIds = new Set(cats.map(c => c.id));
          // 舊資料誤用其他類型分類 → 提示，不自動刪
          const stray = (im.categoryIds || []).filter(x => !validIds.has(x));
          if (stray.length) bg.querySelector('#g-cat-warn').textContent = '此圖片含有非圖片類型的舊分類，儲存時會移除，請重新選擇。';
          const addCat = async name => {
            const { saveCategory } = await import('../store.js');
            const nc = await saveCategory({ name, type: 'image' });
            validIds.add(nc.id);
            const sel = bg.querySelector('#g-cat');
            if (sel) sel.insertAdjacentHTML('beforeend', `<option value="${nc.id}" selected>${esc(name)}</option>`);
          };
          bg.querySelector('#g-cat-add').onclick = async e => {
            e.preventDefault();
            const nm = bg.querySelector('#g-cat-new').value.trim();
            if (nm) { await addCat(nm); bg.querySelector('#g-cat-new').value = ''; }
          };
          bg.querySelector('#g-cat-tpl').onclick = async e => {
            e.preventDefault();
            const { TEMPLATES } = await import('../category-utils.js');
            for (const [g, names] of Object.entries(TEMPLATES.image.groups)) {
              await addCat(g);
              for (const nm of names) {
                const { saveCategory } = await import('../store.js');
                const kid = await saveCategory({ name: nm, type: 'image', parentId: cats.find(c => c.name === g)?.id });
                validIds.add(kid.id);
              }
            }
            toast('已套用圖片分類範本，請重新開啟編輯視窗', 'success'); close();
          };
          bg.querySelector('#g-save').onclick = async () => {
            // 儲存時驗證：只保留圖片分類
            const sel = [...bg.querySelectorAll('#g-cat option:checked')].map(o => o.value).filter(x => validIds.has(x));
            await save('image', { ...im, title: bg.querySelector('#g-title').value, caption: bg.querySelector('#g-cap').value, alt: bg.querySelector('#g-alt').value, categoryIds: sel, albumId: bg.querySelector('#g-album').value || null, tags: bg.querySelector('#g-tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean), featured: bg.querySelector('#g-feat').checked });
            close(); renderImageDetail(id);
          };
        }
      });
  };
  const edBtn = document.getElementById('im-edit');
  if (edBtn) edBtn.onclick = () => editor(im, src);
}

// 燈箱：上一張/下一張/鍵盤
function lightbox(src, caption, images, idx) {
  const lb = document.createElement('div');
  lb.className = 'lightbox'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-label', '圖片檢視');
  let cur = idx ?? -1;
  async function show(i) {
    let url = src, cap = caption;
    if (images && i >= 0 && i < images.length) { cur = i; url = await fileURL(images[i].fileId); cap = images[i].title; }
    lb.innerHTML = `<button class="lb-close" aria-label="關閉">✕</button>
      ${images && cur > 0 ? '<button class="lb-btn lb-prev" aria-label="上一張">‹</button>' : ''}
      <img src="${url}" alt="${esc(cap)}">
      ${images && cur < images.length - 1 ? '<button class="lb-btn lb-next" aria-label="下一張">›</button>' : ''}
      <div class="lb-cap">${esc(cap)}</div>`;
    lb.querySelector('.lb-close').onclick = () => lb.remove();
    lb.querySelector('.lb-prev')?.addEventListener('click', () => show(cur - 1));
    lb.querySelector('.lb-next')?.addEventListener('click', () => show(cur + 1));
  }
  lb.addEventListener('click', e => { if (e.target === lb) lb.remove(); });
  const onKey = e => {
    if (!document.contains(lb)) return removeEventListener('keydown', onKey);
    if (e.key === 'Escape') lb.remove();
    if (e.key === 'ArrowLeft' && images && cur > 0) show(cur - 1);
    if (e.key === 'ArrowRight' && images && cur < images.length - 1) show(cur + 1);
  };
  addEventListener('keydown', onKey);
  show(cur);
  document.body.appendChild(lb);
}

// 編輯器：旋轉/翻轉/亮度/對比/飽和/濾鏡/裁切；另存新版本不覆蓋原圖
function editor(im, src) {
  const edits = { rotate: 0, flipH: false, flipV: false, brightness: 100, contrast: 100, saturate: 100, filter: 'none', crop: null };
  modal(`
    <h3>編輯「${esc(im.title)}」（會另存新版本，不覆蓋原圖）</h3>
    <div style="text-align:center"><img id="ed-img" src="${src}" style="max-height:45vh"></div>
    <div class="row" style="margin:.6rem 0">
      <button data-e="rot">旋轉 90°</button><button data-e="fh">水平翻轉</button><button data-e="fv">垂直翻轉</button>
      <select id="ed-filter"><option value="none">無濾鏡</option><option value="grayscale">黑白</option><option value="sepia">復古</option><option value="warm">暖色</option><option value="cool">冷色</option><option value="bw">高對比黑白</option></select>
      <button data-e="crop">裁切（去四邊 10%）</button><button data-e="reset">還原</button>
    </div>
    <label>亮度 <span id="v-b">100</span></label><input type="range" id="ed-b" min="30" max="200" value="100">
    <label>對比 <span id="v-c">100</span></label><input type="range" id="ed-c" min="30" max="200" value="100">
    <label>飽和度 <span id="v-s">100</span></label><input type="range" id="ed-s" min="0" max="200" value="100">
    <div class="row" style="justify-content:flex-end;margin-top:1rem"><button data-close>取消</button><button id="ed-save" class="primary">另存新版本</button></div>`,
    {
      onOpen(bg, close) {
        const img = bg.querySelector('#ed-img');
        let busy = false;
        async function refresh() {
          if (busy) return; busy = true;
          const blob = await (await fetch(src)).blob();
          const out = await applyEdits(blob, edits);
          img.src = URL.createObjectURL(out);
          busy = false;
        }
        bg.addEventListener('click', e => {
          const b = e.target.closest('[data-e]'); if (!b) return;
          const a = b.dataset.e;
          if (a === 'rot') edits.rotate += 90;
          if (a === 'fh') edits.flipH = !edits.flipH;
          if (a === 'fv') edits.flipV = !edits.flipV;
          if (a === 'crop') edits.crop = edits.crop ? null : { x: .1, y: .1, w: .8, h: .8 };
          if (a === 'reset') Object.assign(edits, { rotate: 0, flipH: false, flipV: false, brightness: 100, contrast: 100, saturate: 100, filter: 'none', crop: null });
          refresh();
        });
        bg.querySelector('#ed-filter').onchange = e => { edits.filter = e.target.value; refresh(); };
        for (const [id, key, lbl] of [['ed-b', 'brightness', 'v-b'], ['ed-c', 'contrast', 'v-c'], ['ed-s', 'saturate', 'v-s']]) {
          bg.querySelector('#' + id).oninput = e => { edits[key] = +e.target.value; bg.querySelector('#' + lbl).textContent = e.target.value; refresh(); };
        }
        bg.querySelector('#ed-save').onclick = async () => {
          const blob = await (await fetch(img.src)).blob();
          const fileId = uid();
          await db.put('files', { id: fileId, blob });
          const versions = [...(im.versions || []), { fileId, note: `編輯於 ${new Date().toLocaleString('zh-TW')}`, edits: { ...edits }, createdAt: new Date().toISOString() }];
          await save('image', { ...im, versions });
          close(); toast('已儲存新版本', 'success'); renderImageDetail(im.id);
        };
      }
    });
}

// 相簿：以「書」的形式翻頁瀏覽（寬螢幕跨頁兩張、手機單頁）
export async function renderAlbum(id) {
  const app = document.getElementById('app');
  const album = await db.get('albums', id);
  if (!album) return app.innerHTML = '<div class="empty">找不到相簿 <a href="#/gallery">回畫廊</a></div>';
  const all = await list('image');
  const pics = all.filter(i => i.albumId === id);
  const cover = pics.find(i => i.id === album.coverId) || pics[0];
  const authed = isAuthed();
  sessionStorage.setItem('lastType', 'image');

  app.innerHTML = `
    <div class="row"><a href="#/gallery">← 畫廊</a><span style="margin-left:auto"></span>
      ${authed ? `<button id="ab-add">＋ 加入圖片</button><a href="#/gallery?album=${id}"><button>上傳到此相簿</button></a>
      <button id="ab-cover" ${pics.length ? '' : 'disabled'}>設此頁為封面</button><button id="ab-remove" ${pics.length ? '' : 'disabled'}>移出此頁</button>
      <button id="ab-rename">重新命名</button><button id="ab-del" class="danger">刪除相簿</button>` : ''}
    </div>
    <div class="album-viewer">
      <button class="ab-nav ab-prev" aria-label="上一頁">‹</button>
      <div class="album-spread" id="ab-spread"></div>
      <button class="ab-nav ab-next" aria-label="下一頁">›</button>
    </div>
    <p class="muted" id="ab-count" style="text-align:center"></p>
    <div class="album-strip" id="ab-strip">${pics.map((p, i) => `<img data-fid="${esc(p.fileId)}" data-i="${i}" alt="${esc(p.title)}" title="${esc(p.title)}">`).join('')}</div>`;

  // 頁序：0 = 封面，1..n = 圖片
  const pageHTML = n => {
    if (n === 0) return `<div class="album-page album-front">
      ${cover ? `<img data-fid="${esc(cover.fileId)}" alt="">` : ''}
      <div class="album-front-title"><h1>${esc(album.name)}</h1><p>${pics.length} 張${album.createdAt ? ' ・ ' + fmtDate(album.createdAt) : ''}</p></div></div>`;
    const p = pics[n - 1];
    if (!p) return '<div class="album-page album-blank"></div>';
    return `<figure class="album-page" data-i="${n - 1}"><img data-fid="${esc(p.fileId)}" alt="${esc(p.alt || p.title)}">
      <figcaption><b>${esc(p.title)}</b>${p.caption ? `<br><small>${esc(p.caption)}</small>` : ''}<span class="album-pno">${n}</span></figcaption></figure>`;
  };
  const wide = () => matchMedia('(min-width: 800px)').matches;
  // 寬螢幕：第 0 跨頁只有封面；之後每跨頁兩張 (1,2)(3,4)…
  const spreadOf = (n, w = wide()) => !w || n === 0 ? n : Math.ceil(n / 2);
  const pagesOf = (s, w = wide()) => !w ? [s] : s === 0 ? [0] : [2 * s - 1, 2 * s];
  const last = () => wide() ? Math.ceil(pics.length / 2) : pics.length;
  let spread = 0, dir = 0;
  const startAt = +new URLSearchParams(location.hash.split('?')[1] || '').get('p');
  if (startAt) spread = spreadOf(Math.min(startAt, pics.length));

  const el = document.getElementById('ab-spread');
  function draw() {
    spread = Math.max(0, Math.min(spread, last()));
    const pages = pagesOf(spread);
    el.className = 'album-spread';
    void el.offsetWidth; // 重新觸發翻頁動畫
    el.className = `album-spread ${pages.length > 1 ? 'two' : 'one'} ${dir > 0 ? 'turn-next' : dir < 0 ? 'turn-prev' : ''}`;
    el.innerHTML = pages.map(pageHTML).join('');
    document.querySelector('.ab-prev').disabled = spread === 0;
    document.querySelector('.ab-next').disabled = spread >= last();
    const shown = pages.filter(n => n > 0 && n <= pics.length);
    document.getElementById('ab-count').textContent = !pics.length ? (authed ? '這本相簿還是空的，按「加入圖片」或「上傳到此相簿」放入照片。' : '這本相簿還是空的。')
      : shown.length ? `第 ${shown.join('–')} 頁 / 共 ${pics.length} 頁　（← → 鍵或滑動翻頁）` : `封面 / 共 ${pics.length} 頁`;
    document.querySelectorAll('#ab-strip img').forEach(t => t.classList.toggle('on', shown.includes(+t.dataset.i + 1)));
    document.querySelector('#ab-strip img.on')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    el.querySelectorAll('figure[data-i]').forEach(f => f.onclick = () => lightbox(null, '', pics, +f.dataset.i));
    hydrateMedia(el);
  }
  const go = d => { const n = spread + d; if (n < 0 || n > last()) return; dir = d; spread = n; draw(); };
  document.querySelector('.ab-prev').onclick = () => go(-1);
  document.querySelector('.ab-next').onclick = () => go(1);
  document.getElementById('ab-strip').onclick = e => {
    const t = e.target.closest('img[data-i]'); if (!t) return;
    const s = spreadOf(+t.dataset.i + 1); dir = s > spread ? 1 : s < spread ? -1 : 0; spread = s; draw();
  };
  const onKey = e => {
    if (!document.contains(el)) return removeEventListener('keydown', onKey);
    if (document.querySelector('.lightbox, .modal-bg') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
  };
  addEventListener('keydown', onKey);
  let x0 = null;
  el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); x0 = null; });
  // 轉向/縮放切換單頁/跨頁時，停在同一張
  let wasWide = wide();
  const onResize = () => {
    if (!document.contains(el)) return removeEventListener('resize', onResize);
    if (wide() === wasWide) return;
    const first = pagesOf(spread, wasWide)[0];
    wasWide = wide(); dir = 0; spread = spreadOf(first); draw();
  };
  addEventListener('resize', onResize);
  draw();
  hydrateMedia(document.getElementById('ab-strip'));

  if (!authed) return;
  // 目前跨頁中的第一張圖片
  const curPic = () => { const n = pagesOf(spread).find(n => n > 0 && n <= pics.length); return n ? pics[n - 1] : null; };
  document.getElementById('ab-cover').onclick = async () => {
    const p = curPic(); if (!p) return toast('請先翻到要當封面的那一頁', 'error');
    await db.put('albums', { ...album, coverId: p.id }); toast(`已將「${p.title}」設為封面`, 'success'); renderAlbum(id);
  };
  document.getElementById('ab-remove').onclick = async () => {
    const p = curPic(); if (!p) return toast('請先翻到要移出的那一頁', 'error');
    if (!await confirmDialog(`把「${p.title}」移出這本相簿？（圖片本身不會刪除）`)) return;
    await save('image', { ...p, albumId: null }); toast('已移出相簿', 'success'); renderAlbum(id);
  };
  document.getElementById('ab-rename').onclick = async () => {
    const name = prompt('相簿名稱', album.name)?.trim();
    if (name) { await db.put('albums', { ...album, name }); renderAlbum(id); }
  };
  document.getElementById('ab-del').onclick = async () => {
    if (!await confirmDialog(`刪除相簿「${album.name}」？裡面的 ${pics.length} 張圖片會保留在畫廊，只是不再屬於這本相簿。`, { danger: true, okText: '刪除相簿' })) return;
    for (const p of pics) await save('image', { ...p, albumId: null });
    await db.del('albums', id); toast('已刪除相簿', 'success'); location.hash = '#/gallery';
  };
  document.getElementById('ab-add').onclick = () => {
    const cands = all.filter(i => i.albumId !== id);
    modal(`<h3>加入圖片到「${esc(album.name)}」</h3>
      ${cands.length ? `<p class="muted">勾選要加入的圖片（已在其他相簿的會移過來）</p><div class="album-pick">${cands.map(i => `<label title="${esc(i.title)}"><input type="checkbox" value="${i.id}"><img data-fid="${esc(i.fileId)}" alt="${esc(i.title)}">${i.albumId ? '<small>其他相簿</small>' : ''}</label>`).join('')}</div>`
        : '<p class="muted">畫廊裡沒有其他圖片可加入。</p>'}
      <div class="row" style="justify-content:flex-end;margin-top:1rem"><button data-close>取消</button>${cands.length ? '<button id="ap-ok" class="primary">加入</button>' : ''}</div>`, {
      onOpen(bg, close) {
        hydrateMedia(bg);
        bg.querySelector('#ap-ok')?.addEventListener('click', async () => {
          const ids = [...bg.querySelectorAll('.album-pick input:checked')].map(c => c.value);
          if (!ids.length) return toast('尚未選擇圖片', 'error');
          for (const i of cands.filter(c => ids.includes(c.id))) await save('image', { ...i, albumId: id });
          close(); toast(`已加入 ${ids.length} 張`, 'success'); renderAlbum(id);
        });
      }
    });
  };
}
