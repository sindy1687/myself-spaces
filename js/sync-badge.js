// 頁首的同步狀態小圖示（登入後才顯示）；點一下立刻同步
import { authed } from './workspace.js';

const LABEL = {
  idle: ['☁', '雲端同步'],
  ok: ['☁✓', '已同步到雲端'],
  pending: ['☁…', '有修改，幾秒後自動上傳'],
  syncing: ['☁⟳', '同步中…'],
  error: ['☁!', '同步失敗'],
};

export function mountSyncBadge(sync) {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'sync-badge'; btn.className = 'sync-badge';
  document.getElementById('nav-toggle').before(btn);
  const draw = () => {
    const { status, error } = sync.syncStatus();
    btn.hidden = !authed();
    const [icon, text] = LABEL[status] || LABEL.idle;
    btn.textContent = icon;
    btn.dataset.state = status;
    btn.title = `${text}${error ? '：' + error : ''}（點一下立即同步）`;
    btn.setAttribute('aria-label', btn.title);
  };
  btn.onclick = () => sync.syncNow();
  sync.onSyncStatus(draw);
  addEventListener('hashchange', draw); // 登入／登出後更新顯示
  draw();
}
