// 登入：站長（你）的帳密存在本機設定；其他人的帳號存在 Apps Script，每人一個自己的網站（?u=名字）
// 用不同的帳密登入 → 進到那個人自己的網站；帳號不存在 → 可直接註冊，建立新的資料檔
import { getSettings, saveSettings } from './store.js';
import { modal, toast, esc } from './util.js';
import { WS, wsUrl, validName, authed, setAuthed, deriveKey, wsKey } from './workspace.js';

// 站長密碼沿用舊格式（不加鹽的 SHA-256），已設定的密碼才能繼續使用
async function sha(text) {
  const { sha256 } = await import('./store.js');
  const data = new TextEncoder().encode(text);
  const bytes = crypto.subtle ? new Uint8Array(await crypto.subtle.digest('SHA-256', data)) : sha256(data);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

export const isAuthed = authed;
export function logout() { setAuthed(false); }
export async function hasPassword() { return WS ? true : !!(await getSettings()).adminPwHash; }

// 呼叫 Apps Script 的帳號功能
export async function accountCall(action, payload) {
  const { gasUrl } = await getSettings();
  if (!gasUrl) throw new Error('尚未設定 Apps Script 網址，無法使用帳號功能');
  let res;
  try {
    res = await fetch(gasUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action, ...payload }) }).then(r => r.json());
  } catch { throw new Error('連不上雲端帳號服務，請檢查網路'); }
  if (!res.ok && !res.code && /unknown action|TypeError|undefined|Cannot read/i.test(res.error || '')) throw new Error('雲端的 Apps Script 還是舊版，請站長更新 gas/Code.gs 並重新部署');
  return res;
}

// 進到某人的網站（同一個分頁，登入狀態會跟著帶過去）
function goTo(user, key, hash = '#/admin') {
  setAuthed(true, key, user);
  location.href = wsUrl(user, hash);
}

// 回傳 Promise<boolean>：已登入或登入成功
export function requireAuth() {
  if (isAuthed()) return Promise.resolve(true);
  return new Promise(async resolve => {
    const s = await getSettings();
    const isSetup = !WS && !s.adminPwHash;
    const owner = s.adminUser || 'admin';
    modal(`
      <h3>${isSetup ? '設定管理密碼' : WS ? `登入「${esc(WS)}」的網站` : '登入'}</h3>
      ${isSetup ? '<p class="muted">首次使用，請設定管理帳號與密碼（僅存於本機瀏覽器）。</p>' : ''}
      <label>帳號</label><input id="a-user" value="${isSetup ? 'admin' : esc(WS)}" autocomplete="username">
      <label>密碼</label><input type="password" id="a-pw" autocomplete="current-password">
      ${isSetup ? '<label>確認密碼</label><input type="password" id="a-pw2">' : ''}
      <p id="a-err" class="muted" style="color:#b3443c"></p>
      ${isSetup ? '' : '<p class="muted" style="font-size:.88rem">還沒有帳號？<a href="#" id="a-reg">註冊，建立自己的作品網站</a></p>'}
      <div class="row" style="justify-content:flex-end;margin-top:1rem">
        <button id="a-cancel">取消</button>
        <button id="a-ok" class="primary">${isSetup ? '設定並進入' : '登入'}</button>
      </div>`,
      {
        onOpen(bg, close) {
          const $ = q => bg.querySelector(q);
          const err = m => $('#a-err').textContent = m;
          const done = ok => { close(); resolve(ok); };
          $('#a-cancel').onclick = () => { done(false); location.hash = '#/'; };
          $('#a-reg')?.addEventListener('click', e => { e.preventDefault(); done(false); registerDialog($('#a-user').value.trim()); });
          $('#a-ok').onclick = async () => {
            const user = $('#a-user').value.trim(), pw = $('#a-pw').value;
            if (isSetup) {
              if (pw.length < 4) return err('密碼至少 4 碼');
              if (pw !== $('#a-pw2').value) return err('兩次密碼不一致');
              await saveSettings({ adminPwHash: await sha(pw), adminUser: user || 'admin' });
              setAuthed(true); toast('密碼已設定', 'success'); return done(true);
            }
            if (!user || !pw) return err('請輸入帳號和密碼');
            // 站長帳密（只在你的網站）：雲端驗證並取得金鑰，之後同步、市集都靠這把金鑰；
            // 雲端連不上或還是舊版時，退回本機比對（可以管理，但不能同步）
            if (!WS && user === owner) {
              $('#a-ok').disabled = true; err('驗證中…');
              try {
                const key = await deriveKey(user, pw);
                const r = await accountCall('ownerSetup', { pw, key }).catch(() => null);
                if (r?.ok) { setAuthed(true, key); return done(true); }
                if (r && r.code) return err(r.error || '帳號或密碼錯誤');
                if (await sha(pw) === s.adminPwHash) { setAuthed(true); toast('雲端驗證失敗（Apps Script 可能還是舊版），這次登入不會同步', 'error'); return done(true); }
                return err('帳號或密碼錯誤');
              } finally { $('#a-ok').disabled = false; }
            }
            // 其他人：到雲端驗證，成功就進到他自己的網站
            if (!validName(user)) return err('帳號或密碼錯誤');
            $('#a-ok').disabled = true; err('驗證中…');
            try {
              const key = await deriveKey(user, pw);
              const r = await accountCall('login', { user, key });
              if (r.ok) {
                if (user === WS) { setAuthed(true, key); toast(`歡迎回來，${user}`, 'success'); return done(true); }
                done(false); return goTo(user, key);
              }
              if (r.code === 'no-account') {
                err('');
                bg.querySelector('#a-err').innerHTML = `沒有「${esc(user)}」這個帳號。<a href="#" id="a-reg2">用這組帳密建立新的網站？</a>`;
                $('#a-reg2').onclick = e => { e.preventDefault(); done(false); registerDialog(user, pw); };
              } else err(r.error || '帳號或密碼錯誤');
            } catch (e) { err(e.message); }
            finally { $('#a-ok').disabled = false; }
          };
          $('#a-pw').addEventListener('keydown', e => { if (e.key === 'Enter') $('#a-ok').click(); });
        }
      });
  });
}

// 註冊：建立新帳號＝建立一個新的網站與資料檔
export function registerDialog(user = '', pw = '') {
  modal(`
    <h3>✨ 建立自己的作品網站</h3>
    <p class="muted" style="margin-top:0">每個帳號都有自己的網站和自己的資料檔，和其他人的作品完全分開。</p>
    <label>帳號（2–20 字，可用中文、英文、數字、_ 和 -）</label><input id="r-user" value="${esc(user)}" maxlength="20" autocomplete="username">
    <p class="muted" style="font-size:.85rem;margin:.2rem 0">你的網址會是：<code id="r-url"></code></p>
    <label>密碼（至少 6 碼）</label><input type="password" id="r-pw" value="${esc(pw)}" autocomplete="new-password">
    <label>確認密碼</label><input type="password" id="r-pw2" autocomplete="new-password">
    <p class="muted" style="font-size:.85rem">⚠ 密碼忘記無法找回，請記好。</p>
    <p id="r-err" style="color:#b3443c"></p>
    <div class="row" style="justify-content:flex-end"><button data-close>取消</button><button id="r-ok" class="primary">建立網站</button></div>`, {
    onOpen(bg) {
      const $ = q => bg.querySelector(q), err = m => $('#r-err').textContent = m;
      const showUrl = () => { $('#r-url').textContent = location.origin + wsUrl($('#r-user').value.trim() || '名字', ''); };
      $('#r-user').oninput = showUrl; showUrl();
      $('#r-ok').onclick = async () => {
        const u = $('#r-user').value.trim(), p = $('#r-pw').value;
        if (!validName(u)) return err('帳號要 2–20 字，只能用中文、英文、數字、_ 和 -');
        if (p.length < 6) return err('密碼至少 6 碼');
        if (p !== $('#r-pw2').value) return err('兩次密碼不一致');
        if (u === ((await getSettings()).adminUser || 'admin')) return err('這個帳號名稱已被使用');
        $('#r-ok').disabled = true; err('建立中…');
        try {
          const key = await deriveKey(u, p);
          const r = await accountCall('register', { user: u, key });
          if (!r.ok) return err(r.code === 'taken' ? '這個帳號名稱已被使用，請換一個' : r.error || '建立失敗');
          toast('網站建立好了！', 'success');
          goTo(u, key);
        } catch (e) { err(e.message); }
        finally { $('#r-ok').disabled = false; }
      };
    },
  });
}

export async function changePassword(oldPw, newPw) {
  if (WS) {
    const oldKey = await deriveKey(WS, oldPw), newKey = await deriveKey(WS, newPw);
    const r = await accountCall('changePw', { user: WS, key: oldKey, newKey });
    if (!r.ok) throw new Error(r.code === 'bad-login' ? '原密碼錯誤' : r.error || '更改失敗');
    setAuthed(true, newKey);
    return;
  }
  // 站長：先讓雲端用舊密碼確認並換成新金鑰，再改本機
  const s = await getSettings(), owner = s.adminUser || 'admin';
  const newKey = await deriveKey(owner, newPw);
  const r = await accountCall('ownerSetup', { pw: oldPw, key: newKey }).catch(() => null);
  if (r && !r.ok) throw new Error(r.code === 'bad-login' ? '原密碼錯誤' : r.error || '更改失敗');
  if (!r && s.adminPwHash && await sha(oldPw) !== s.adminPwHash) throw new Error('原密碼錯誤');
  await saveSettings({ adminPwHash: await sha(newPw) });
  setAuthed(true, r?.ok ? newKey : undefined);
}

export { wsKey };
