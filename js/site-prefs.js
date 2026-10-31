// 網站設定的「套用」：公告橫幅、頁尾與社群連結、導覽列顯示、字級、網站圖示、搜尋引擎、圖片保護、閒置登出
import { esc, isFid } from './util.js';
import { isAuthed } from './auth.js';

export const SOCIALS = [
  ['instagram', 'Instagram', 'https://instagram.com/…'],
  ['facebook', 'Facebook', 'https://facebook.com/…'],
  ['threads', 'Threads', 'https://threads.net/@…'],
  ['youtube', 'YouTube', 'https://youtube.com/@…'],
  ['x', 'X（Twitter）', 'https://x.com/…'],
  ['website', '其他網站', 'https://…'],
  ['email', 'Email', 'name@example.com'],
];
export const NAV_ITEMS = [['novels', '小說'], ['books', '繪本'], ['gallery', '圖片'], ['diary', '日記'], ['crafts', '手作手札'], ['search', '搜尋']];
export const FONT_SCALES = [['small', '小', '93.75%'], ['normal', '標準', ''], ['large', '大', '112.5%'], ['xlarge', '特大', '125%']];

// 簡單雜湊：公告內容改了就重新顯示（訪客按過 ✕ 的舊公告不再出現）
const textKey = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
const safeUrl = u => (/^(https?:|mailto:|#)/i.test(u) ? u : /^[^@\s]+@[^@\s]+$/.test(u) ? 'mailto:' + u : /^[\w.-]+\.[a-z]{2,}/i.test(u) ? 'https://' + u : '');

async function mediaURL(v) {
  if (!v || !isFid(v)) return v || '';
  const { fileObjectURL } = await import('./util.js');
  return fileObjectURL(v);
}

function announce(s) {
  document.getElementById('site-announce')?.remove();
  const a = s.announce || {};
  if (!a.on || !a.text?.trim()) return;
  const key = textKey(a.text + (a.link || ''));
  try { if (localStorage.getItem('announce-closed') === key) return; } catch { /* 無痕模式 */ }
  const bar = document.createElement('div');
  bar.id = 'site-announce'; bar.className = `site-announce tone-${a.tone || 'info'}`; bar.setAttribute('role', 'status');
  const link = safeUrl(a.link || '');
  bar.innerHTML = `<span>${esc(a.text)}${link ? ` <a href="${esc(link)}" ${/^#/.test(link) ? '' : 'target="_blank" rel="noopener"'}>${esc(a.linkText || '查看')} →</a>` : ''}</span><button type="button" aria-label="關閉公告">✕</button>`;
  bar.querySelector('button').onclick = () => { bar.remove(); try { localStorage.setItem('announce-closed', key); } catch { /* 無痕模式 */ } };
  document.getElementById('site-header').before(bar);
}

function footer(s) {
  let f = document.getElementById('site-footer');
  const links = SOCIALS.map(([k, n]) => [n, safeUrl(s.social?.[k]?.trim() || '')]).filter(([, u]) => u);
  const text = (s.footerText || '').replace(/\{year\}/g, new Date().getFullYear()).replace(/\{name\}/g, s.siteName || '');
  if (!text && !links.length) return f?.remove();
  if (!f) { f = document.createElement('footer'); f.id = 'site-footer'; document.getElementById('app').after(f); }
  f.innerHTML = `${links.length ? `<nav class="foot-links" aria-label="社群連結">${links.map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener me">${esc(n)}</a>`).join('')}</nav>` : ''}
    ${text ? `<p>${esc(text)}</p>` : ''}`;
}

let idleTimer = null, idleBound = false;
function idleLogout(minutes) {
  clearTimeout(idleTimer);
  if (!minutes) return;
  const reset = () => {
    clearTimeout(idleTimer);
    if (!isAuthed()) return;
    idleTimer = setTimeout(async () => {
      if (!isAuthed()) return;
      (await import('./auth.js')).logout();
      (await import('./util.js')).toast(`已閒置 ${minutes} 分鐘，自動登出`);
      if (location.hash.startsWith('#/admin')) location.hash = '#/'; else dispatchEvent(new HashChangeEvent('hashchange'));
    }, minutes * 60000);
  };
  if (!idleBound) { idleBound = true; for (const ev of ['pointerdown', 'keydown', 'scroll', 'hashchange']) addEventListener(ev, () => reset(), { passive: true }); }
  reset();
}

// 訪客不能用右鍵或拖曳另存圖片（擋一般人，擋不住截圖）
const guard = e => { if (!isAuthed() && e.target instanceof HTMLImageElement && !e.target.closest('.modal')) e.preventDefault(); };
function protectImages(on) {
  for (const ev of ['contextmenu', 'dragstart']) { removeEventListener(ev, guard, true); if (on) addEventListener(ev, guard, true); }
  document.body.classList.toggle('protect-img', !!on);
}

export async function applySitePrefs(s) {
  announce(s);
  footer(s);
  const hide = new Set(s.navHide || []);
  document.querySelectorAll('#main-nav a').forEach(a => { const k = a.getAttribute('href').slice(2); a.hidden = hide.has(k); });
  const fs = FONT_SCALES.find(x => x[0] === s.fontScale)?.[2] || '';
  document.documentElement.style.fontSize = fs;
  let robots = document.querySelector('meta[name=robots]');
  if (s.noindex) { if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.appendChild(robots); } robots.content = 'noindex, nofollow'; }
  else robots?.remove();
  const desc = s.siteDesc || '';
  let md = document.querySelector('meta[name=description]');
  if (desc) { if (!md) { md = document.createElement('meta'); md.name = 'description'; document.head.appendChild(md); } md.content = desc; } else md?.remove();
  const icon = await mediaURL(s.favicon || s.avatar);
  let link = document.querySelector('link[rel=icon]');
  if (icon) { if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); } link.href = icon; } else link?.remove();
  protectImages(s.protectImages);
  idleLogout(+s.idleLogout || 0);
}
