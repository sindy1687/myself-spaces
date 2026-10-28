// 公開分享頁：向分享伺服器取得資料，唯讀顯示，HTML 已消毒
import { esc, sanitizeHTML } from '../util.js';
import { volumeLabel } from '../chapters.js';

export async function renderShare(token, chapterId) {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="empty">載入中…</div>';
  try {
    const r = await fetch(`/api/share/${token}`);
    if (!r.ok) throw new Error(r.status === 404 ? '分享不存在或已取消' : '載入失敗');
    const { type, payload } = await r.json();
    // 分享連結也要輸入作品密碼
    const { isLocked } = await import('../store.js');
    if (isLocked(payload)) return (await import('../util.js')).lockNotice(payload);
    if (type === 'novel' && chapterId) {
      const ch = (payload.chapters || []).find(c => c.id === chapterId);
      if (!ch) throw new Error('章節不存在');
      const chs = payload.chapters, i = chs.indexOf(ch);
      app.innerHTML = `<a href="#/share/${token}">← ${esc(payload.title)}</a>
        <article class="card reader-wrap" style="margin-top:1rem"><h1>${esc(ch.title)}</h1>
        ${ch.content.split(/\n{2,}/).map(p => `<p>${esc(p)}</p>`).join('')}
        <div class="row" style="justify-content:space-between;margin-top:2rem">
          ${i > 0 ? `<a href="#/share/${token}/c/${chs[i - 1].id}"><button>← 上一章</button></a>` : '<span></span>'}
          ${i < chs.length - 1 ? `<a href="#/share/${token}/c/${chs[i + 1].id}"><button class="primary">下一章 →</button></a>` : '<span class="muted">已是末章</span>'}
        </div></article>`;
      return;
    }
    if (type === 'novel') {
      app.innerHTML = `<article class="card"><h1>${esc(payload.title)} ${payload.volume !== '' && payload.volume != null ? `<span class="vol-pill">${esc(volumeLabel(payload.volume))}</span>` : ''}</h1>
        <p class="muted">${esc(payload.author || '')} ・ ${(payload.chapters || []).length} 章</p>
        <p>${esc(payload.desc || '')}</p></article>
        <h2 class="section-title">目錄</h2>
        <div class="card">${(payload.chapters || []).map(c => `<div class="chapter-item"><a href="#/share/${token}/c/${c.id}" style="color:var(--text)">${esc(c.title)}</a></div>`).join('')}</div>`;
    } else if (type === 'book') {
      app.innerHTML = `<article class="card"><h1>${esc(payload.title)}</h1>
        <p class="muted">${esc(payload.author || '')} ・ ${(payload.pages || []).length} 頁</p><p>${esc(payload.desc || '')}</p></article>
        ${(payload.pages || []).map((p, i) => p.text ? `<div class="card" style="margin-top:.6rem"><small class="muted">第 ${i + 1} 頁</small><p style="white-space:pre-wrap;font-size:1.15em">${esc(p.text)}</p></div>` : '').join('')}`;
    } else if (type === 'diary') {
      app.innerHTML = `<article class="card"><h1>${esc(payload.title)}</h1>
        <p class="muted">${esc(payload.date || '')}</p><div>${sanitizeHTML(payload.content || '')}</div></article>`;
      (await import('../util.js')).hydrateMedia(app);
    } else {
      app.innerHTML = `<div class="card"><h1>${esc(payload.title)}</h1><p>${esc(payload.caption || '')}</p><p class="muted">（圖片請在分享預覽中檢視）</p></div>`;
    }
  } catch (e) {
    app.innerHTML = `<div class="empty"><h2>${esc(e.message)}</h2><p class="muted">分享伺服器可能未啟動，或連結已失效。</p></div>`;
  }
}
