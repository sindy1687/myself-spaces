// 多人空間：網址 ?u=名字 就是那個人的網站；沒有 u 就是站長（你）的網站
// 每個人的資料各自一個本機資料庫，雲端各自一份 JSON（站長 data.json，其他人在 user-名字 資料夾）
export const validName = u => /^[\p{L}\p{N}_-]{2,20}$/u.test(u || '');
const raw = typeof location === 'undefined' ? '' : new URLSearchParams(location.search).get('u') || '';
export const WS = validName(raw) ? raw : '';

// 這個網站（某人的空間）的網址；hash 預設回首頁
export const wsUrl = (u, hash = '#/') => `${location.pathname}${u ? '?u=' + encodeURIComponent(u) : ''}${hash}`;

// 登入狀態依空間分開：在小明的空間登入，不代表在你的空間也登入
const AUTH_KEY = 'admin-auth' + (WS ? '@' + WS : '');
const KEY_KEY = 'ws-key@' + WS;
export const authed = () => { try { return sessionStorage.getItem(AUTH_KEY) === '1'; } catch { return false; } };
export function setAuthed(on, key, ws = WS) {
  const a = 'admin-auth' + (ws ? '@' + ws : ''), k = 'ws-key@' + ws;
  try {
    if (on) { sessionStorage.setItem(a, '1'); if (key) sessionStorage.setItem(k, key); }
    else { sessionStorage.removeItem(a); sessionStorage.removeItem(k); }
  } catch { /* 無痕模式 */ }
  if (typeof dispatchEvent === 'function') dispatchEvent(new CustomEvent('auth-changed'));
}
// 上傳到雲端時證明身分用（由帳密算出，不是密碼本身）
export const wsKey = () => { try { return sessionStorage.getItem(KEY_KEY) || ''; } catch { return ''; } };
// 呼叫 Apps Script 時證明身分：其他人帶帳號＋金鑰，站長只帶站長金鑰
export const authFields = () => (WS ? { u: WS, key: wsKey() } : { key: wsKey() });

export async function deriveKey(user, pw) {
  const { hashPassword } = await import('./store.js');
  return hashPassword(pw, `portfolio-account:${user}`);
}
