// 選取模式：在卡片列表（畫廊、小說庫、繪本、日記、手作）勾選多件，一次刪除或做其他批次動作
// 用法：selectMode({ button, root, actions: [{ label, danger, run: async keys => {} }] })
//   root 內帶 data-sel="key" 的元素就是可選項目；選取模式時點卡片＝勾選，不會打開作品
import { esc, confirmDialog } from './util.js';

export function selectMode({ button, root, actions }) {
  if (!button || !root) return;
  let on = false, bar = null;
  const picked = new Set();
  const items = () => [...root.querySelectorAll('[data-sel]')];

  const sync = () => {
    for (const el of items()) {
      const sel = picked.has(el.dataset.sel);
      el.classList.toggle('sel-on', sel);
      el.setAttribute('aria-pressed', sel);
    }
    if (!bar) return;
    bar.querySelector('.sel-count').textContent = `已選 ${picked.size} 件`;
    bar.querySelectorAll('[data-act]').forEach(b => { b.disabled = !picked.size; });
    bar.querySelector('.sel-all').textContent = picked.size && picked.size === items().length ? '全不選' : '全選';
  };
  const enter = () => {
    on = true;
    root.classList.add('sel-mode');
    for (const el of items()) if (!el.querySelector(':scope > .sel-check')) el.insertAdjacentHTML('afterbegin', '<span class="sel-check" aria-hidden="true"></span>');
    button.textContent = '✕ 結束選取';
    bar = document.createElement('div');
    bar.className = 'sel-bar';
    bar.setAttribute('role', 'toolbar');
    bar.innerHTML = `<b class="sel-count"></b><button type="button" class="sel-all">全選</button>
      ${actions.map((a, i) => `<button type="button" data-act="${i}" class="${a.danger ? 'danger' : ''}">${esc(a.label)}</button>`).join('')}
      <button type="button" class="sel-exit">取消</button>`;
    document.body.appendChild(bar);
    bar.querySelector('.sel-all').onclick = () => {
      const all = items().map(el => el.dataset.sel);
      if (picked.size === all.length) picked.clear(); else all.forEach(k => picked.add(k));
      sync();
    };
    bar.querySelector('.sel-exit').onclick = exit;
    bar.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
      const a = actions[+b.dataset.act], keys = [...picked];
      if (a.danger && !await confirmDialog(a.confirm ? a.confirm(keys.length) : `確定對選取的 ${keys.length} 件執行「${a.label}」？`, { danger: true, okText: a.label })) return;
      await a.run(keys);
      exit();
    });
    addEventListener('hashchange', exit, { once: true });
    sync();
  };
  function exit() {
    on = false;
    picked.clear();
    root.classList.remove('sel-mode');
    root.querySelectorAll('.sel-check').forEach(x => x.remove());
    items().forEach(el => { el.classList.remove('sel-on'); el.removeAttribute('aria-pressed'); });
    bar?.remove(); bar = null;
    if (button.isConnected) button.textContent = '☑ 選取';
  }
  button.textContent = '☑ 選取';
  button.onclick = () => (on ? exit() : enter());
  // 捕獲階段攔下點擊：選取模式時點卡片只勾選，不跳頁
  root.addEventListener('click', e => {
    if (!on) return;
    const el = e.target.closest('[data-sel]');
    if (!el || !root.contains(el)) return;
    e.preventDefault(); e.stopPropagation();
    const k = el.dataset.sel;
    picked.has(k) ? picked.delete(k) : picked.add(k);
    sync();
  }, true);
}
