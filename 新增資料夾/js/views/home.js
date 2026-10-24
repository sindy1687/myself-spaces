// 首頁與全站搜尋
import { list, getSettings, listCategories } from '../store.js';
import { db } from '../db.js';
import { hydrateMedia } from '../util.js';
import { allWorks } from '../store.js';
let _defCover = '';

// 把 <img data-fid> 的 src 從 IndexedDB blob 補上
async function hydrateImages(root) {
  for (const img of root.querySelectorAll('img[data-fid]')) {
    const f = await db.get('files', img.dataset.fid);
    if (f) img.src = URL.createObjectURL(f.blob);
  }
}
import { esc, fmtDate, isFid } from '../util.js';
import { pageShell } from '../app.js';

function firstImg(html) { const m = /<img[^>]+(?:data-fid|src)="([^"]+)"/.exec(html || ''); return m ? m[1] : ''; }
function workCard(type, it, defCover = '') {
  const url = type === 'novel' ? `#/novel/${it.id}` : type === 'image' ? `#/image/${it.id}` : type === 'craft' ? `#/crafts?open=${it.id}` : `#/diary?open=${it.id}`;
  const cv = it.cover || (type === 'novel' ? (defCover || _defCover) : type === 'diary' || type === 'craft' ? firstImg(it.content) : '');
  let cover;
  if (type === 'image' && it.fileId) cover = `<img class="cover" data-fid="${it.fileId}" alt="${esc(it.alt || it.title)}">`;
  else cover = isFid(cv) ? `<img class="cover" data-fid="${esc(cv)}" alt="">` : cv ? `<img class="cover" src="${esc(cv)}" alt="">` : `<div class="cover" style="display:flex;align-items:center;justify-content:center;color:var(--muted)">${esc(it.title?.[0] || '作')}</div>`;
  return `<a class="card" href="${url}" style="color:var(--text);display:block">${cover}
    <h3 style="margin:.5em 0 .2em">${esc(it.title)}</h3>
    <div class="muted">${esc(it.author || it.mood || '')} ${it.demo ? '<span class="tag">示範</span>' : ''}</div>
    <div class="muted">${(it.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
  </a>`;
}

export async function renderHome() {
  const s = await getSettings();
  const [novels, images, diaries, crafts, cats] = await Promise.all([list('novel'), list('image'), list('diary'), list('craft'), listCategories()]);
  const featured = [...novels.map(n => ({ t: 'novel', i: n })), ...diaries.map(d => ({ t: 'diary', i: d })), ...crafts.map(c => ({ t: 'craft', i: c }))].filter(x => x.i.featured).slice(0, 6);
  const recent = [...novels.map(n => ({ t: 'novel', i: n })), ...images.map(n => ({ t: 'image', i: n })), ...diaries.map(d => ({ t: 'diary', i: d })), ...crafts.map(c => ({ t: 'craft', i: c }))]
    .sort((a, b) => (b.i.updatedAt || '').localeCompare(a.i.updatedAt || '')).slice(0, 8);
  const app = document.getElementById('app');
  app.innerHTML = `
    <section class="card" style="text-align:center;padding:2.5rem 1rem;${s.cover ? `background-image:linear-gradient(rgba(0,0,0,.35),rgba(0,0,0,.35)),url('${esc(s.cover)}');background-size:cover;color:#fff` : ''}">
      ${s.avatar ? `<img src="${esc(s.avatar)}" alt="頭像" style="width:88px;height:88px;border-radius:50%;object-fit:cover">` : ''}
      <h1 style="margin:.3em">${esc(s.siteName)}</h1>
      <p class="${s.cover ? '' : 'muted'}">${esc(s.siteDesc || '分享我的小說、圖片與日記')}</p>
      <a href="#/canvas"><button>🧩 畫布拼貼</button></a>
    </section>
    ${featured.length ? `<h2 class="section-title">精選作品</h2><div class="grid">${featured.map(x => workCard(x.t, x.i, s.defaultNovelCover)).join('')}</div>` : ''}
    <h2 class="section-title">最近更新</h2>
    ${recent.length ? `<div class="grid">${recent.map(x => workCard(x.t, x.i, s.defaultNovelCover)).join('')}</div>` : '<div class="empty">還沒有作品，到「管理」新增吧</div>'}
    ${cats.length ? `<h2 class="section-title">分類</h2><div class="row">${cats.filter(c => !c.parentId && c.showHome !== false).map(c => `<a class="tag" href="#/category/${c.id}">${esc(c.icon || '')} ${esc(c.name)}</a>`).join('')}</div>` : ''}
  `;
  hydrateImages(app); hydrateMedia(app);
  setNav();
}

export function setNav() { document.querySelectorAll('#main-nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#/')); }

// ---- 分類頁：麵包屑、子分類、作品（可含子分類）----
export async function renderCategory(id) {
  const cats = await listCategories();
  const all = await listCategories(null, { includeArchived: true });
  const app = document.getElementById('app');
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const deep = q.get('deep') === '1';

  if (id === 'uncategorized') {
    const works = (await allWorks()).filter(w => !(w.categoryIds || []).length && !w.categoryId);
    app.innerHTML = `<p><a href="#/">首頁</a> → <b>未分類</b></p><h1>未分類</h1><div class="grid">${works.map(w => workCard(w.type, w, _defCover)).join('') || '<div class="empty">無未分類作品</div>'}</div>`;
    hydrateImages(app); hydrateMedia(app);
    return;
  }
  const c = all.find(x => x.id === id);
  if (!c) return app.innerHTML = '<div class="empty">找不到此分類</div>';
  const crumbs = [];
  let p = c.parentId;
  while (p) { const pc = all.find(x => x.id === p); if (!pc) break; crumbs.unshift(pc); p = pc.parentId; }
  const kids = cats.filter(x => x.parentId === id);
  const { descendants } = await import('../category-utils.js');
  const ids = deep ? new Set([id, ...descendants(all, id)]) : new Set([id]);
  const works = (await allWorks()).filter(w => (w.categoryIds || []).some(x => ids.has(x)) || ids.has(w.categoryId));
  const mode = c.display || 'cards';
  app.innerHTML = `
    <p class="muted"><a href="#/">首頁</a>${crumbs.map(x => ` → <a href="#/category/${x.id}">${esc(x.name)}</a>`).join('')} → <b>${esc(c.name)}</b></p>
    <div class="card" style="display:flex;gap:1rem;align-items:center;${c.color ? `border-left:4px solid ${esc(c.color)}` : ''}">
      ${c.cover ? `<img src="${esc(c.cover)}" style="width:72px;height:72px;object-fit:cover;border-radius:8px">` : ''}
      <div><h1 style="margin:0">${esc(c.icon || '')} ${esc(c.name)}</h1><p class="muted" style="margin:.2em 0 0">${esc(c.desc || '')} ・ ${works.length} 件作品</p></div>
      <span style="margin-left:auto"><a class="tag" href="#/category/${id}${deep ? '' : '?deep=1'}">${deep ? '✓ 含子分類' : '含子分類'}</a></span>
    </div>
    ${kids.length ? `<div class="row" style="margin-top:1rem">${kids.map(k => `<a class="tag" href="#/category/${k.id}">${esc(k.icon || '')} ${esc(k.name)}</a>`).join('')}</div>` : ''}
    <div class="${mode === 'grid' ? 'gal-grid' : 'grid'}" style="margin-top:1rem">
      ${works.map(w => workCard(w.type, w, _defCover)).join('') || '<div class="empty">尚無作品</div>'}
    </div>`;
  hydrateImages(app); hydrateMedia(app);
  setNav();
}

export async function renderSearch() {
  _defCover = (await getSettings()).defaultNovelCover || '';
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const kw = q.get('q') || '', cat = q.get('cat') || '', tag = q.get('tag') || '';
  const type = q.get('type') ?? sessionStorage.getItem('lastType') ?? '';
  if (q.get('type') === 'all') { sessionStorage.setItem('lastType', ''); }
  const typeFilter = type === 'all' ? '' : type;
  const cats = await listCategories();
  const app = document.getElementById('app');
  app.innerHTML = `
    <h1>搜尋</h1>
    <form id="sf" class="row">
      <input name="q" placeholder="關鍵字" value="${esc(kw)}" style="max-width:240px">
      <select name="type" style="max-width:140px"><option value="all">全部作品</option><option value="novel">小說</option><option value="image">圖片</option><option value="diary">日記</option><option value="craft">手作手札</option></select>
      <select name="cat" style="max-width:160px"><option value="">全部分類</option>${cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <input name="tag" placeholder="標籤" value="${esc(tag)}" style="max-width:140px">
      <button class="primary" type="submit">搜尋</button>
    </form>
    <div id="sr"></div>`;
  const f = document.getElementById('sf');
  f.type.value = type || 'all'; f.cat.value = cat;
  f.onsubmit = e => { e.preventDefault(); const d = new FormData(f); location.hash = `#/search?${new URLSearchParams(d)}`; };

  const match = it =>
    (!kw || JSON.stringify(it).includes(kw)) &&
    (!cat || it.categoryId === cat || (it.categoryIds || []).includes(cat)) &&
    (!tag || (it.tags || []).includes(tag));
  const [novels, images, diaries, crafts] = await Promise.all([list('novel'), list('image'), list('diary'), list('craft')]);
  const parts = [];
  if (!typeFilter || typeFilter === 'novel') { const r = novels.filter(match); if (r.length) parts.push(`<h2 class="section-title">小說</h2><div class="grid">${r.map(i => workCard('novel', i)).join('')}</div>`); }
  if (!typeFilter || typeFilter === 'image') { const r = images.filter(match); if (r.length) parts.push(`<h2 class="section-title">圖片</h2><div class="grid">${r.map(i => workCard('image', i)).join('')}</div>`); }
  if (!typeFilter || typeFilter === 'diary') { const r = diaries.filter(match); if (r.length) parts.push(`<h2 class="section-title">日記</h2><div class="grid">${r.map(i => workCard('diary', i)).join('')}</div>`); }
  if (!typeFilter || typeFilter === 'craft') { const r = crafts.filter(match); if (r.length) parts.push(`<h2 class="section-title">手作手札</h2><div class="grid">${r.map(i => workCard('craft', i)).join('')}</div>`); }
  document.getElementById('sr').innerHTML = parts.join('') || '<div class="empty">沒有符合的結果</div>';
  hydrateImages(document.getElementById('sr'));
}
