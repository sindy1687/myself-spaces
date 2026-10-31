// 首頁與全站搜尋
import { list, getSettings, listCategories } from '../store.js';
import { db } from '../db.js';
import { hydrateMedia, initialOf, lockBadge, fileObjectURL } from '../util.js';
import { allWorks } from '../store.js';
let _defCover = '';

// 把 <img data-fid> 的 src 從 IndexedDB blob 補上
async function hydrateImages(root) {
  await Promise.all([...root.querySelectorAll('img[data-fid]')].map(async img => {
    const url = await fileObjectURL(img.dataset.fid);
    img.decoding = 'async';
    if (!img.hasAttribute('loading')) img.loading = 'lazy';
    if (url) img.src = url;
  }));
}
import { esc, fmtDate, isFid, toast } from '../util.js';
import { pageShell } from '../app.js';
import { volBadge, sortDialog } from './novel.js';
import { isAuthed } from '../auth.js';
import { volumeRank, volumeLabel } from '../chapters.js';

function firstImg(html) { const m = /<img[^>]+(?:data-fid|src)="([^"]+)"/.exec(html || ''); return m ? m[1] : ''; }
function workCard(type, it, defCover = '') {
  const url = type === 'book' ? `#/book/${it.id}` : type === 'novel' ? `#/novel/${it.id}` : type === 'image' ? `#/image/${it.id}` : type === 'craft' ? `#/crafts?open=${it.id}` : `#/diary?open=${it.id}`;
  const cv = it.cover || (type === 'novel' ? (defCover || _defCover) : type === 'diary' || type === 'craft' ? firstImg(it.content) : type === 'book' ? ((it.pages || []).find(p => p.image)?.image || '') : '');
  let cover;
  if (type === 'image' && it.fileId) cover = `<img class="cover" data-fid="${it.fileId}" alt="${esc(it.alt || it.title)}">`;
  else cover = isFid(cv) ? `<img class="cover" data-fid="${esc(cv)}" alt="">` : cv ? `<img class="cover" src="${esc(cv)}" alt="">` : `<div class="cover" style="display:flex;align-items:center;justify-content:center;color:var(--muted)">${esc(initialOf(it.title))}</div>`;
  return `<a class="card" href="${url}" style="color:var(--text);display:block;position:relative">${type === 'novel' ? volBadge(it) : ''}${cover}
    <h3 style="margin:.5em 0 .2em">${esc(it.title)}${lockBadge(it)}</h3>
    <div class="muted">${esc(it.author || it.mood || '')} ${it.demo ? '<span class="tag">示範</span>' : ''}</div>
    <div class="muted">${(it.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
  </a>`;
}

// 同一套小說（同叢書或同書名）的各卷：留在最新那本的位置，彼此依第一卷、第二卷…由左而右排
function volumesInOrder(arr) {
  const key = x => x.t === 'novel' && (x.i.series || (x.i.volume !== '' && x.i.volume != null ? 't:' + x.i.title : ''));
  const groups = new Map();
  for (const x of arr) { const k = key(x); if (k) (groups.get(k) || groups.set(k, []).get(k)).push(x); }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const slots = g.map(x => arr.indexOf(x)).sort((a, b) => a - b);
    const ordered = [...g].sort((a, b) => volumeRank(a.i.volume) - volumeRank(b.i.volume));
    slots.forEach((pos, k) => { arr[pos] = ordered[k]; });
  }
  // 同組散在不同位置時，把後面的移到第一個位置後面，讓它們相鄰
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const members = arr.filter(x => g.includes(x)), first = arr.indexOf(members[0]);
    const rest = arr.filter(x => !g.includes(x));
    rest.splice(first, 0, ...members);
    arr.splice(0, arr.length, ...rest);
  }
  return arr;
}

// ---- 精選作品：大圖輪播焦點＋下方縮圖列（可排序）----
const TYPE_INFO = {
  novel: ['📖', '小說', '開始閱讀'], book: ['📚', '繪本', '翻開繪本'], image: ['🖼', '圖片', '查看圖片'],
  diary: ['📝', '日記', '閱讀全文'], craft: ['✂', '手作手札', '閱讀全文'],
};
const STORE_OF = { novel: 'novels', book: 'books', image: 'images', diary: 'diaries', craft: 'crafts' };
const plain = html => (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
function featInfo(type, it, defCover) {
  const url = type === 'book' ? `#/book/${it.id}` : type === 'novel' ? `#/novel/${it.id}` : type === 'image' ? `#/image/${it.id}` : type === 'craft' ? `#/crafts?open=${it.id}` : `#/diary?open=${it.id}`;
  const cv = type === 'image' ? it.fileId : it.cover || (type === 'novel' ? defCover : type === 'book' ? ((it.pages || []).find(p => p.image)?.image || '') : firstImg(it.content));
  const img = cv ? (isFid(cv) ? `data-fid="${esc(cv)}"` : `src="${esc(cv)}"`) : '';
  const meta = type === 'novel' ? [it.author, `${(it.chapters || []).length} 章`, it.status]
    : type === 'book' ? [it.author, `${(it.pages || []).length} 頁`]
    : type === 'image' ? [fmtDate(it.createdAt)]
    : type === 'diary' ? [it.date, it.mood, it.weather] : [it.date, it.status];
  let text = type === 'novel' || type === 'book' ? it.desc || (it.pages || []).find(p => p.text)?.text : type === 'image' ? it.caption : it.desc || plain(it.content);
  text = (text || '').replace(/\s+/g, ' ').trim();
  return { url, img, cv, meta: meta.filter(Boolean).join(' ・ '), text: text.length > 140 ? text.slice(0, 140) + '…' : text };
}
function featuredHTML(featured, defCover) {
  if (!featured.length) return '';
  const slide = ({ t, i }, k) => {
    const f = featInfo(t, i, defCover), [ic, tn, cta] = TYPE_INFO[t];
    return `<article class="feat-slide ${k ? '' : 'on'}" data-k="${k}" aria-hidden="${k ? 'true' : 'false'}">
      <a class="feat-cover ${t === 'image' ? 'wide' : ''}" href="${f.url}" tabindex="-1">${t === 'novel' ? volBadge(i) : ''}${f.img ? `<img ${f.img} alt="${esc(i.title)}">` : `<span>${esc(initialOf(i.title))}</span>`}</a>
      <div class="feat-body">
        <span class="feat-type">${ic} ${tn}</span>
        <h3><a href="${f.url}">${esc(i.title)}</a>${lockBadge(i)}${t === 'novel' && i.volume !== '' && i.volume != null ? ` <span class="vol-pill">${esc(volumeLabel(i.volume))}</span>` : ''}</h3>
        ${f.meta ? `<p class="muted feat-meta">${esc(f.meta)}</p>` : ''}
        ${f.text ? `<p class="feat-text">${esc(f.text)}</p>` : ''}
        ${(i.tags || []).length ? `<div>${i.tags.slice(0, 5).map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div>` : ''}
        <a href="${f.url}" class="feat-cta"><button class="primary">${cta} →</button></a>
      </div></article>`;
  };
  const thumb = ({ t, i }, k) => {
    const f = featInfo(t, i, defCover);
    return `<button type="button" class="feat-thumb ${k ? '' : 'on'}" data-k="${k}" aria-label="${esc(i.title)}">${f.img ? `<img ${f.img} alt="">` : `<span>${esc(initialOf(i.title))}</span>`}<small>${TYPE_INFO[t][0]} ${esc(i.title)}</small></button>`;
  };
  return `<div class="feat" id="feat">
      <div class="feat-stage">${featured.map(slide).join('')}
        ${featured.length > 1 ? '<button type="button" class="feat-nav feat-prev" aria-label="上一個">‹</button><button type="button" class="feat-nav feat-next" aria-label="下一個">›</button>' : ''}</div>
      ${featured.length > 1 ? `<div class="feat-thumbs">${featured.map(thumb).join('')}</div>` : ''}
    </div>`;
}
// 類型分頁：只列出有作品的類型（兩種以上才顯示）；精選與最近更新共用
function typeTabs(id, label, items, counts = true) {
  const types = Object.keys(TYPE_INFO).filter(t => items.some(x => x.t === t));
  if (types.length < 2) return '';
  const tab = (t, name, n) => `<button type="button" role="tab" class="album-chip feat-tab" data-t="${t}" aria-selected="false">${name}${counts ? ` <small>${n}</small>` : ''}</button>`;
  return `<div class="feat-tabs" id="${id}" role="tablist" aria-label="${label}">${tab('', '全部', items.length)}${types.map(t => tab(t, `${TYPE_INFO[t][0]} ${TYPE_INFO[t][1]}`, items.filter(x => x.t === t).length)).join('')}</div>`;
}
// 綁定分頁：點選時呼叫 render(type)，並記住上次選的分頁
function bindTabs(id, storeKey, items, render) {
  const bar = document.getElementById(id);
  const pick = type => {
    if (type && !items.some(x => x.t === type)) type = '';
    try { sessionStorage.setItem(storeKey, type); } catch { /* 無痕模式 */ }
    bar?.querySelectorAll('.feat-tab').forEach(b => { const on = b.dataset.t === type; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    render(type);
  };
  bar?.addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) pick(b.dataset.t); });
  let last = '';
  try { last = sessionStorage.getItem(storeKey) || ''; } catch { /* 無痕模式 */ }
  pick(last);
}
function bindFeatured(n) {
  const root = document.getElementById('feat');
  if (!root || n < 2) return;
  let cur = 0, timer = null, paused = false;
  const show = k => {
    cur = (k + n) % n;
    root.querySelectorAll('.feat-slide').forEach(el => { const on = +el.dataset.k === cur; el.classList.toggle('on', on); el.setAttribute('aria-hidden', on ? 'false' : 'true'); });
    root.querySelectorAll('.feat-thumb').forEach(el => el.classList.toggle('on', +el.dataset.k === cur));
    // 只橫向捲動縮圖列本身；scrollIntoView 會連整頁一起捲，造成畫面亂跳
    const strip = root.querySelector('.feat-thumbs'), on = root.querySelector('.feat-thumb.on');
    if (strip && on) {
      const x = on.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
      if (x < strip.scrollLeft || x + on.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollTo({ left: x - 8, behavior: 'smooth' });
    }
  };
  // 自動輪播：滑鼠移入、鍵盤聚焦或系統要求減少動態時暫停；後台縮圖裡不輪播
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('preview');
  const tick = () => { clearTimeout(timer); if (reduce) return; timer = setTimeout(() => { if (!root.isConnected) return; if (!paused && !document.hidden) show(cur + 1); tick(); }, 7000); };
  root.querySelector('.feat-prev').onclick = () => { show(cur - 1); tick(); };
  root.querySelector('.feat-next').onclick = () => { show(cur + 1); tick(); };
  root.querySelector('.feat-thumbs').onclick = e => { const b = e.target.closest('[data-k]'); if (b) { show(+b.dataset.k); tick(); } };
  root.addEventListener('mouseenter', () => paused = true);
  root.addEventListener('mouseleave', () => paused = false);
  root.addEventListener('focusin', () => paused = true);
  root.addEventListener('focusout', () => paused = false);
  let x0 = null;
  const stage = root.querySelector('.feat-stage');
  stage.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) { show(cur + (dx < 0 ? 1 : -1)); tick(); } x0 = null; });
  tick();
}

export async function renderHome() {
  const s = await getSettings();
  const [novels, images, diaries, crafts, books, cats] = await Promise.all([list('novel'), list('image'), list('diary'), list('craft'), list('book'), listCategories()]);
  // 精選：有自訂順序（featuredOrder）的照順序，其餘依更新時間；同套小說各卷相鄰並依卷數排
  const featured = [...novels.map(n => ({ t: 'novel', i: n })), ...books.map(b => ({ t: 'book', i: b })), ...images.map(m => ({ t: 'image', i: m })), ...diaries.map(d => ({ t: 'diary', i: d })), ...crafts.map(c => ({ t: 'craft', i: c }))]
    .filter(x => x.i.featured && x.i.status !== 'draft')
    .sort((a, b) => ((a.i.featuredOrder ?? Infinity) - (b.i.featuredOrder ?? Infinity)) || (b.i.updatedAt || '').localeCompare(a.i.updatedAt || ''));
  if (!featured.some(x => x.i.featuredOrder != null)) volumesInOrder(featured);
  featured.splice(12);
  // 最近更新：全部作品依更新時間；分頁切到某類型時取該類型最新 8 件
  const recentAll = [...novels.map(n => ({ t: 'novel', i: n })), ...books.map(b => ({ t: 'book', i: b })), ...images.map(n => ({ t: 'image', i: n })), ...diaries.map(d => ({ t: 'diary', i: d })), ...crafts.map(c => ({ t: 'craft', i: c }))]
    .filter(x => x.i.status !== 'draft')
    .sort((a, b) => (b.i.updatedAt || '').localeCompare(a.i.updatedAt || ''));
  const app = document.getElementById('app');
  app.innerHTML = `
    <section class="card hero ${s.cover ? 'hero-img' : ''}" ${s.cover ? `style="background-image:linear-gradient(rgba(0,0,0,.35),rgba(0,0,0,.35)),url('${esc(s.cover)}')"` : ''}>
      ${s.avatar ? `<img src="${esc(s.avatar)}" alt="頭像" style="width:88px;height:88px;border-radius:50%;object-fit:cover">` : ''}
      <h1 style="margin:.3em">${esc(s.siteName)}</h1>
      <p class="${s.cover ? '' : 'muted'}">${esc(s.siteDesc || '分享我的小說、圖片與日記')}</p>
    </section>
    ${featured.length ? `<div class="row" style="align-items:baseline"><h2 class="section-title" style="margin-right:auto">精選作品</h2>${isAuthed() && featured.length > 1 ? '<button id="feat-sort" type="button">↕ 排序精選</button>' : ''}</div>${typeTabs('feat-tabs', '精選作品分類', featured)}<div id="feat-wrap"></div>` : ''}
    <h2 class="section-title">最近更新</h2>
    ${recentAll.length ? `${typeTabs('recent-tabs', '最近更新分類', recentAll, false)}<div id="recent-wrap"></div>` : '<div class="empty">還沒有作品，到「管理」新增吧</div>'}
    ${cats.length ? `<h2 class="section-title">分類</h2><div class="row">${cats.filter(c => !c.parentId && c.showHome !== false).map(c => `<a class="tag" href="#/category/${c.id}">${esc(c.icon || '')} ${esc(c.name)}</a>`).join('')}</div>` : ''}
  `;
  hydrateImages(app); hydrateMedia(app);
  setNav();
  // 依類型分頁：切換時只重畫該區；各自記住上次選的分頁
  const featWrap = document.getElementById('feat-wrap');
  if (featWrap) bindTabs('feat-tabs', 'featTab', featured, type => {
    const shown = type ? featured.filter(x => x.t === type) : featured;
    featWrap.innerHTML = featuredHTML(shown, s.defaultNovelCover);
    hydrateImages(featWrap); hydrateMedia(featWrap);
    bindFeatured(shown.length);
  });
  const recentWrap = document.getElementById('recent-wrap');
  if (recentWrap) bindTabs('recent-tabs', 'recentTab', recentAll, type => {
    const shown = volumesInOrder((type ? recentAll.filter(x => x.t === type) : recentAll).slice(0, 8));
    recentWrap.innerHTML = `<div class="grid">${shown.map(x => workCard(x.t, x.i, s.defaultNovelCover)).join('')}</div>`;
    hydrateImages(recentWrap); hydrateMedia(recentWrap);
  });
  document.getElementById('feat-sort')?.addEventListener('click', () => sortDialog('排序精選作品', '第一個會先顯示在大圖，之後依序輪播。', featured.map(({ t, i }) => ({ key: t + ':' + i.id, label: `${TYPE_INFO[t][0]} ${i.title}${t === 'novel' && i.volume !== '' && i.volume != null ? ' ' + volumeLabel(i.volume) : ''}`, img: featInfo(t, i, s.defaultNovelCover).cv })),
    async keys => {
      // 直接寫入、保留更新時間，避免「最近更新」被打亂
      for (const [k, key] of keys.entries()) { const [t, id] = key.split(':'); const it = featured.find(x => x.t === t && x.i.id === id).i; await db.put(STORE_OF[t], { ...it, featuredOrder: k }); }
      toast('已儲存精選順序', 'success'); renderHome();
    }));
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
    <form id="sf" class="row filter-bar fb-3">
      <input name="q" placeholder="關鍵字" value="${esc(kw)}" style="max-width:240px">
      <select name="type" style="max-width:140px"><option value="all">全部作品</option><option value="novel">小說</option><option value="image">圖片</option><option value="diary">日記</option><option value="craft">手作手札</option><option value="book">繪本</option></select>
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
  const [novels, images, diaries, crafts, books] = await Promise.all([list('novel'), list('image'), list('diary'), list('craft'), list('book')]);
  const parts = [];
  if (!typeFilter || typeFilter === 'novel') { const r = novels.filter(match); if (r.length) parts.push(`<h2 class="section-title">小說</h2><div class="grid">${r.map(i => workCard('novel', i)).join('')}</div>`); }
  if (!typeFilter || typeFilter === 'image') { const r = images.filter(match); if (r.length) parts.push(`<h2 class="section-title">圖片</h2><div class="grid">${r.map(i => workCard('image', i)).join('')}</div>`); }
  if (!typeFilter || typeFilter === 'diary') { const r = diaries.filter(match); if (r.length) parts.push(`<h2 class="section-title">日記</h2><div class="grid">${r.map(i => workCard('diary', i)).join('')}</div>`); }
  if (!typeFilter || typeFilter === 'craft') { const r = crafts.filter(match); if (r.length) parts.push(`<h2 class="section-title">手作手札</h2><div class="grid">${r.map(i => workCard('craft', i)).join('')}</div>`); }
  if (!typeFilter || typeFilter === 'book') { const r = books.filter(match); if (r.length) parts.push(`<h2 class="section-title">繪本</h2><div class="grid">${r.map(i => workCard('book', i)).join('')}</div>`); }
  document.getElementById('sr').innerHTML = parts.join('') || '<div class="empty">沒有符合的結果</div>';
  hydrateImages(document.getElementById('sr'));
}
