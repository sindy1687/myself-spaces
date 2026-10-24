// 管理後台密碼鎖（本機密碼雜湊，sessionStorage 記住登入）
import { getSettings, saveSettings } from './store.js';
import { modal, toast } from './util.js';

async function hash(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export const isAuthed = () => sessionStorage.getItem('admin-auth') === '1';
export function logout() { sessionStorage.removeItem('admin-auth'); }

export async function hasPassword() { return !!(await getSettings()).adminPwHash; }

// 回傳 Promise<boolean>：已登入或登入成功
export function requireAuth() {
  if (isAuthed()) return Promise.resolve(true);
  return new Promise(async resolve => {
    const s = await getSettings();
    const isSetup = !s.adminPwHash;
    modal(`
      <h3>${isSetup ? '設定管理密碼' : '管理後台登入'}</h3>
      ${isSetup ? '<p class="muted">首次使用，請設定管理帳號與密碼（僅存於本機瀏覽器）。</p>' : ''}
      <label>帳號</label><input id="a-user" value="${isSetup ? 'admin' : ''}" autocomplete="username">
      <label>密碼</label><input type="password" id="a-pw" autocomplete="current-password">
      ${isSetup ? '<label>確認密碼</label><input type="password" id="a-pw2">' : ''}
      <p id="a-err" class="muted" style="color:#b3443c"></p>
      <div class="row" style="justify-content:flex-end;margin-top:1rem">
        <button id="a-cancel">取消</button>
        <button id="a-ok" class="primary">${isSetup ? '設定並進入' : '登入'}</button>
      </div>`,
      {
        onOpen(bg, close) {
          const err = m => bg.querySelector('#a-err').textContent = m;
          bg.querySelector('#a-cancel').onclick = () => { close(); resolve(false); location.hash = '#/'; };
          bg.querySelector('#a-ok').onclick = async () => {
            const pw = bg.querySelector('#a-pw').value;
            if (isSetup) {
              if (pw.length < 4) return err('密碼至少 4 碼');
              if (pw !== bg.querySelector('#a-pw2').value) return err('兩次密碼不一致');
              await saveSettings({ adminPwHash: await hash(pw), adminUser: bg.querySelector('#a-user').value.trim() || 'admin' });
              sessionStorage.setItem('admin-auth', '1');
              toast('密碼已設定', 'success'); close(); resolve(true);
            } else {
              const user = bg.querySelector('#a-user').value.trim();
              if (user === (s.adminUser || 'admin') && await hash(pw) === s.adminPwHash) {
                sessionStorage.setItem('admin-auth', '1');
                close(); resolve(true);
              } else err('帳號或密碼錯誤');
            }
          };
          bg.querySelector('#a-pw').addEventListener('keydown', e => { if (e.key === 'Enter') bg.querySelector('#a-ok').click(); });
        }
      });
  });
}

export async function changePassword(oldPw, newPw) {
  const s = await getSettings();
  if (s.adminPwHash && await hash(oldPw) !== s.adminPwHash) throw new Error('原密碼錯誤');
  await saveSettings({ adminPwHash: await hash(newPw) });
}
