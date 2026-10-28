// 路由與啟動
import { getSettings, saveSettings, loadDemoData } from './store.js';
import { renderHome, renderSearch, renderCategory } from './views/home.js';
import { renderNovels, renderNovelDetail, renderReader, renderNovelImport } from './views/novel.js';
import { renderGallery, renderImageDetail, renderAlbum } from './views/gallery.js';
import { renderDiary } from './views/diary.js';
import { renderCrafts } from './views/craft.js';
import { renderBooks, renderBook } from './views/book.js';
import { renderCanvas } from './views/canvas.js';
import { renderAdmin } from './views/admin.js';
import { renderShare } from './views/share.js';
import { esc, toast } from './util.js';
import { WS } from './workspace.js';

const app = document.getElementById('app');
const IS_PREVIEW = new URLSearchParams(location.search).has('preview');

const routes = [
  [/^#?\/?(?:\?.*)?$/, renderHome],
  [/^#\/novels(?:\?.*)?$/, renderNovels],
  [/^#\/novels\/import(?:\?.*)?$/, renderNovelImport],
  [/^#\/novel\/([\w-]+)(?:\?.*)?$/, m => renderNovelDetail(m[1])],
  [/^#\/read\/([\w-]+)(?:\/([\w-]+))?(?:\?.*)?$/, m => renderReader(m[1], m[2])],
  [/^#\/gallery(?:\?.*)?$/, renderGallery],
  [/^#\/image\/([\w-]+)(?:\?.*)?$/, m => renderImageDetail(m[1])],
  [/^#\/album\/([\w-]+)(?:\?.*)?$/, m => renderAlbum(m[1])],
  [/^#\/diary(?:\?.*)?$/, renderDiary],
  [/^#\/crafts(?:\?.*)?$/, renderCrafts],
  [/^#\/books(?:\?.*)?$/, renderBooks],
  [/^#\/book\/([\w-]+)(?:\?.*)?$/, m => renderBook(m[1])],
  [/^#\/canvas(?:\?.*)?$/, renderCanvas],
  [/^#\/category\/([\w-]+)/, m => renderCategory(m[1])],
  [/^#\/search/, renderSearch],
  [/^#\/admin(?:\/(\w+))?(?:\?.*)?$/, async m => { const { requireAuth } = await import('./auth.js'); if (await requireAuth()) renderAdmin(m[1] || 'works'); }],
  [/^#\/share\/([\w-]+)(?:\/c\/([\w-]+))?$/, m => renderShare(m[1], m[2])],
];

export function navigate() {
  const hash = location.hash || '#/';
  for (const [re, fn] of routes) {
    const m = hash.match(re);
    // 焦點移到主內容給螢幕閱讀器；不捲動畫面。後台縮圖（?preview）不搶焦點，否則外層頁面會被拉過去
    if (m) { fn(m); if (!IS_PREVIEW) app.focus({ preventScroll: true }); return; }
  }
  app.innerHTML = '<div class="empty"><h2>找不到頁面</h2><a href="#/">回首頁</a></div>';
}

// 行動版選單
document.getElementById('nav-toggle').onclick = () => {
  const nav = document.getElementById('main-nav');
  nav.classList.toggle('open');
  document.getElementById('nav-toggle').setAttribute('aria-expanded', nav.classList.contains('open'));
};
document.getElementById('main-nav').addEventListener('click', () => document.getElementById('main-nav').classList.remove('open'));

export function setActiveNav(hash) {
  document.querySelectorAll('#main-nav a').forEach(a => {
    a.classList.toggle('active', hash.startsWith(a.getAttribute('href')));
  });
}

export function pageShell(title, inner) {
  app.innerHTML = `<h1>${esc(title)}</h1>${inner}`;
  setActiveNav(location.hash);
}

async function boot() {
  const s = await getSettings();
  // 其他人的新網站：不放示範資料，網站名稱先用「名字 的作品空間」
  if (WS && !s.demoLoaded) { Object.assign(s, { demoLoaded: true, siteName: `${WS} 的作品空間` }); await saveSettings({ demoLoaded: true, siteName: s.siteName }); }
  // ?preview=範本：後台縮圖用，以指定範本、範本預設主色顯示，不做 Drive 同步
  const preview = new URLSearchParams(location.search).get('preview');
  if (preview) Object.assign(s, { theme: preview, primaryColor: '' });
  const applyTheme = t => {
    document.body.dataset.theme = t.theme || 'literary';
    document.body.dataset.deco = t.deco || 'standard';
    document.body.classList.toggle('no-anim', t.anim === false);
    if (t.primaryColor) document.documentElement.style.setProperty('--primary', t.primaryColor);
    else document.documentElement.style.removeProperty('--primary');
  };
  applyTheme(s);
  const prefs = () => import('./site-prefs.js').then(m => m.applySitePrefs(s2 || s)).catch(e => console.warn('網站設定', e));
  let s2 = null;
  prefs();
  document.getElementById('site-title').textContent = s.siteName;
  document.title = s.siteName;
  if (!s.demoLoaded) {
    // 首次使用：載入示範資料
    try { await loadDemoData(); } catch (e) { console.warn('demo data', e); }
  }
  window.addEventListener('hashchange', navigate);
  navigate();
  if (preview) return;
  import('./music.js').then(m => m.initMusic()).catch(e => console.warn('背景音樂', e));
  // 多裝置自動同步：不擋首屏；雲端有新資料就套用並刷新畫面，登入後本機一改就自動上傳
  const applied = async () => {
    s2 = await getSettings();
    applyTheme(s2); prefs();
    document.getElementById('site-title').textContent = s2.siteName;
    document.title = s2.siteName;
    // 正在編輯、聽書時不重繪，以免蓋掉正在輸入的內容或打斷朗讀
    if (document.getElementById('modal-root').children.length || document.querySelector('.listen-bar, [contenteditable="true"]:focus')) return toast('有新的內容，重新整理即可看到');
    const y = scrollY;
    navigate();
    requestAnimationFrame(() => scrollTo(0, y));
  };
  try {
    const sync = await import('./sync.js');
    sync.startSync(applied);
    import('./sync-badge.js').then(m => m.mountSyncBadge(sync)).catch(e => console.warn(e));
  } catch (e) { console.warn('同步', e); }
}
boot();
