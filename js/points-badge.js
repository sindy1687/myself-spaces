// 頁首的點數：登入後每一頁都看得到自己有幾點，點一下到「我的點數」
// 買東西、上架後由市集發出 points-changed 事件立即更新；登入／登出時重新讀取
import { getSettings } from './store.js';
import { authed, wsKey, authFields } from './workspace.js';

const REFRESH_MS = 60000;
// 手機頁首放不下長字，只顯示「登入」
const RELOGIN = '💰 <span class="pts-long">重新登入看點數</span><span class="pts-short">登入</span>';
let el = null, lastAt = 0;

const show = (html, title) => { el.innerHTML = html; el.title = title; el.hidden = false; };

async function fetchBalance() {
  const { gasUrl } = await getSettings();
  if (!gasUrl) throw new Error('尚未設定 Apps Script 網址');
  const post = action => fetch(gasUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action, ...authFields() }) }).then(r => r.json());
  let r = await post('m.bal');
  // 雲端還沒更新到有 m.bal 的版本：改用 m.me（比較慢，但一樣拿得到餘額）
  if (!r.ok && /unknown action/i.test(r.error || '')) r = await post('m.me');
  if (!r.ok) throw Object.assign(new Error(r.error || '讀取失敗'), { code: r.code });
  return r.balance;
}

export async function refreshPoints(force = false) {
  if (!el) return;
  if (!authed()) { el.hidden = true; return; }
  // 舊的登入狀態沒有金鑰，雲端認不得：提示重新登入
  if (!wsKey()) { show(RELOGIN, '這次登入沒有雲端金鑰，點一下重新登入'); el.dataset.relogin = '1'; return; }
  delete el.dataset.relogin;
  if (!force && Date.now() - lastAt < REFRESH_MS) return;
  lastAt = Date.now();
  if (el.hidden) show('💰 …', '讀取點數中');
  try { const b = await fetchBalance(); show(`💰 ${b} 點`, '我的點數'); }
  catch (e) {
    lastAt = 0;
    if (e.code === 'bad-login') { show(RELOGIN, '登入已失效，點一下重新登入'); el.dataset.relogin = '1'; }
    else show('💰 ? 點', `讀不到點數：${e.message}`);
  }
}

export function mountPoints() {
  el = document.createElement('a');
  el.id = 'pts-badge'; el.className = 'pts-badge'; el.href = '#/market/me'; el.hidden = true;
  document.getElementById('nav-toggle').before(el);
  el.addEventListener('click', async e => {
    if (!el.dataset.relogin) return;
    e.preventDefault();
    const { logout, requireAuth } = await import('./auth.js');
    logout();
    if (await requireAuth()) refreshPoints(true);
  });
  addEventListener('points-changed', e => { if (typeof e.detail?.balance === 'number') { lastAt = Date.now(); show(`💰 ${e.detail.balance} 點`, '我的點數'); } else refreshPoints(true); });
  addEventListener('auth-changed', () => refreshPoints(true));
  addEventListener('hashchange', () => refreshPoints());
  refreshPoints(true);
}
