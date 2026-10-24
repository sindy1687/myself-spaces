// 路由與啟動
import { getSettings, saveSettings, loadDemoData } from './store.js';
import { renderHome, renderSearch, renderCategory } from './views/home.js';
import { renderNovels, renderNovelDetail, renderReader, renderNovelImport } from './views/novel.js';
import { renderGallery, renderImageDetail, renderAlbum } from './views/gallery.js';
import { renderDiary } from './views/diary.js';
import { renderCrafts } from './views/craft.js';
import { renderCanvas } from './views/canvas.js';
import { renderAdmin } from './views/admin.js';
import { renderShare } from './views/share.js';
import { esc, toast } from './util.js';

const app = document.getElementById('app');

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
    if (m) { fn(m); app.focus(); return; }
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
  const applyTheme = t => {
    document.body.dataset.theme = t.theme || 'literary';
    document.body.dataset.deco = t.deco || 'standard';
    document.body.classList.toggle('no-anim', t.anim === false);
    if (t.primaryColor) document.documentElement.style.setProperty('--primary', t.primaryColor);
  };
  applyTheme(s);
  document.getElementById('site-title').textContent = s.siteName;
  document.title = s.siteName;
  if (!s.demoLoaded) {
    // 首次使用：載入示範資料
    try { await loadDemoData(); } catch (e) { console.warn('demo data', e); }
  }
  window.addEventListener('hashchange', navigate);
  navigate();
  // 背景從 Google Drive（Apps Script）同步，不擋首屏；有更新才重繪
  try {
    const { autoLoadFromDrive } = await import('./gdrive.js');
    if (await autoLoadFromDrive()) {
      const s2 = await getSettings();
      applyTheme(s2);
      document.getElementById('site-title').textContent = s2.siteName;
      document.title = s2.siteName;
      // 開著編輯視窗時不重繪，以免蓋掉正在輸入的內容
      if (document.getElementById('modal-root').children.length) toast('Drive 有新資料，重新整理即可看到');
      else navigate();
      console.log('已從 Drive 載入最新資料');
    }
  } catch (e) { console.warn(e); }
}
boot();
