// 手作手札：清單、詳情、富文字編輯器（材料/工具/步驟/心得）
import { list, get, save, trash, listCategories } from '../store.js';
import { db } from '../db.js';
import { esc, uid, modal, toast, confirmDialog, fmtDate, sanitizeHTML, attachUploadBtn, richToolbar, hydrateMedia, isFid } from '../util.js';
import { shareDialog, countView, catChips, bindCatChips } from './novel.js';
import { isAuthed } from '../auth.js';
import { setNav } from './home.js';

const STATUSES = ['規劃中', '製作中', '已完成', '暫停'];
const TPLS = {
  '自由筆記': '<h3>靈感</h3><p></p><h3>材料與工具</h3><ul><li></li></ul><h3>筆記</h3><p></p>',
  '步驟教學': '<h3>成品</h3><p></p><h3>材料與工具</h3><ul><li></li></ul><h3>步驟</h3><ol><li>步驟一</li><li>步驟二</li></ol><h3>小提醒</h3><p></p>',
  '製作紀錄': '<h3>本次紀錄</h3><p></p><h3>材料</h3><ul><li></li></ul><h3>過程</h3><p></p><h3>心得</h3><p></p><h3>下次想改進</h3><p></p>',
};

export async function renderCrafts() {
  const app = document.getElementById('app');
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const cat = q.get('cat') || '', kw = q.get('q') || '', openId = q.get('open');
  sessionStorage.setItem('lastType', 'craft');
  if (cat) sessionStorage.setItem('cat:craft', cat);
  if (openId) return renderCraftEntry(openId);
  const [items, cats] = await Promise.all([list('craft'), listCategories('craft')]);
  const shown = items.filter(i =>
    (!cat || (cat === 'uncategorized' ? !(i.categoryIds || []).length : i.categoryIds.includes(cat))) &&
    (!kw || (i.title + (i.content || '')).includes(kw)));
  app.innerHTML = `
    <div class="row"><h1 style="margin-right:auto">手作手札</h1>
      <form id="cf"><input name="q" placeholder="關鍵字" value="${esc(kw)}" style="max-width:160px"><button>搜尋</button></form>
      ${isAuthed() ? '<button id="new-c" class="primary">＋ 新增手札</button>' : ''}</div>
    ${catChips(cats, 'craft', '#/crafts', cat)}
    <div class="grid" style="margin-top:1rem">${shown.map(c => `
      <a class="card" href="#/crafts?open=${c.id}" style="color:var(--text)">
        ${(() => { const cv = c.cover || (/<img[^>]+(?:data-fid|src)="([^"]+)"/.exec(c.content || '') || [])[1]; if (!cv) return `<div class="cover" style="display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:2rem">${esc(c.title[0])}</div>`; return isFid(cv) ? `<img class="cover" data-fid="${esc(cv)}" alt="">` : `<img class="cover" src="${esc(cv)}" alt="">`; })()}
        <h3>${esc(c.title)} ${c.demo ? '<span class="tag">示範</span>' : ''} ${c.status === 'draft' ? '<span class="tag">草稿</span>' : ''}</h3>
        <div><span class="badge ${c.status === '已完成' ? 'badge-done' : c.status === '暫停' ? 'badge-pause' : 'badge-serial'}">${esc(c.status || '製作中')}</span></div>
        <p class="muted">${esc(c.date || '')} ・ ${esc(c.desc || '')}</p>
      </a>`).join('') || '<div class="empty">尚無手札</div>'}</div>`;
  document.getElementById('cf').onsubmit = e => { e.preventDefault(); location.hash = `#/crafts?q=${encodeURIComponent(new FormData(e.target).get('q'))}`; };
  document.getElementById('new-c')?.addEventListener('click', () => editor(cat && cat !== 'uncategorized' ? { categoryIds: [cat] } : null));
  bindCatChips('craft', renderCrafts);
  setNav();
  hydrateMedia(document.getElementById('app'));
}

async function renderCraftEntry(id) {
  const c = await get('craft', id);
  const app = document.getElementById('app');
  if (!c) return app.innerHTML = '<div class="empty">找不到這篇手札</div>';
  app.innerHTML = `
    <article class="card">
      <h1>${esc(c.title)}</h1>
      <p><span class="badge ${c.status === '已完成' ? 'badge-done' : 'badge-serial'}">${esc(c.status || '')}</span>
        <span class="muted">${esc(c.date || '')} ・ 👁 ${c.views || 0} 次觀看 ・ ${(c.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</span></p>
      ${c.desc ? `<p>${esc(c.desc)}</p>` : ''}
      ${c.materials ? `<p><b>材料：</b>${esc(c.materials)}</p>` : ''}
      ${c.tools ? `<p><b>工具：</b>${esc(c.tools)}</p>` : ''}
      ${c.size ? `<p><b>尺寸：</b>${esc(c.size)}</p>` : ''}
      ${c.cost ? `<p><b>費用：</b>${esc(c.cost)}</p>` : ''}
      ${c.time ? `<p><b>製作時間：</b>${esc(c.time)}</p>` : ''}
      <div class="diary-content">${sanitizeHTML(c.content || '')}</div>
      <div class="row" style="margin-top:1.5rem">
        <a href="#/crafts"><button>← 返回手札</button></a>
        ${isAuthed() ? '<button id="ce-edit">編輯</button><button id="ce-share">分享</button><button id="ce-del" class="danger">刪除</button>' : ''}
      </div>
    </article>`;
  hydrateMedia(app);
  countView('craft', id);
  const eb = document.getElementById('ce-edit');
  if (eb) {
    eb.onclick = () => editor(c);
    document.getElementById('ce-share').onclick = () => shareDialog(c);
    document.getElementById('ce-del').onclick = async () => { if (await confirmDialog(`確定刪除「${c.title}」？`)) { await trash('craft', id); location.hash = '#/crafts'; } };
  }
}

async function editor(d) {
  const cats = await listCategories('craft');
  modal(`
    <h3>${d ? '編輯' : '新增'}手札</h3>
    <label>標題</label><input id="c-t" value="${esc(d?.title || '')}">
    <label>簡介</label><input id="c-d" value="${esc(d?.desc || '')}">
    <div class="row">
      <div style="flex:1"><label>製作日期</label><input type="date" id="c-date" value="${esc(d?.date || new Date().toISOString().slice(0, 10))}"></div>
      <div style="flex:1"><label>狀態</label><select id="c-st">${STATUSES.map(s => `<option ${d?.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    </div>
    <div class="row">
      <div style="flex:1"><label>材料</label><input id="c-mat" value="${esc(d?.materials || '')}"></div>
      <div style="flex:1"><label>工具</label><input id="c-tool" value="${esc(d?.tools || '')}"></div>
    </div>
    <div class="row">
      <div style="flex:1"><label>尺寸</label><input id="c-size" value="${esc(d?.size || '')}"></div>
      <div style="flex:1"><label>費用</label><input id="c-cost" value="${esc(d?.cost || '')}"></div>
      <div style="flex:1"><label>製作時間</label><input id="c-time" value="${esc(d?.time || '')}"></div>
    </div>
    <label>封面圖片</label><div class="field-inline"><input id="c-cover" value="${esc(d?.cover || '')}" placeholder="網址或上傳"><button id="c-cover-up" type="button">上傳</button></div>
    <div class="row" style="margin:.4rem 0">
      <label style="margin:0">內容範本：</label>${Object.keys(TPLS).map(k => `<button type="button" class="tpl-btn" data-tpl="${k}">${k}</button>`).join('')}
    </div>
    <div id="c-bar"></div>
    <div id="c-ce" contenteditable="true" style="min-height:220px;border:1px solid var(--border);border-radius:var(--radius);padding:.8rem">${d ? sanitizeHTML(d.content) : '<p><br></p>'}</div>
    <label>分類</label><select id="c-cat" multiple size="3">${cats.map(c => `<option value="${c.id}" ${(d?.categoryIds || []).includes(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    <label>標籤（逗號分隔）</label><input id="c-tags" list="tag-suggest" value="${esc((d?.tags || []).join(', '))}"><datalist id="tag-suggest"></datalist>
    <p class="muted" id="c-lastsave"></p>
    <div class="row" style="justify-content:flex-end;margin-top:1rem">
      <button data-close>取消</button><button id="c-draft">存為草稿</button>
      <button id="c-prev">預覽</button><button id="c-save" class="primary">儲存</button>
    </div>`,
    {
      async onOpen(bg, close) {
        attachUploadBtn(bg.querySelector('#c-cover-up'), bg.querySelector('#c-cover'));
        const ce = bg.querySelector('#c-ce');
        richToolbar(bg.querySelector('#c-bar'), ce, { draftKey: 'craft:' + (d?.id || 'new') });
        hydrateMedia(ce);
        const { tagStats } = await import('../store.js');
        bg.querySelector('#tag-suggest').innerHTML = (await tagStats()).map(([t]) => `<option value="${esc(t)}">`).join('');
        // 範本預覽 + 套用（不覆蓋已有內容）
        bg.querySelectorAll('.tpl-btn').forEach(b => b.onclick = () => {
          modal(`<h3>範本預覽：${b.dataset.tpl}</h3><div class="card" style="max-height:50vh;overflow:auto">${TPLS[b.dataset.tpl]}</div>
            <div class="row" style="justify-content:flex-end"><button data-close>取消</button><button id="tp-ok" class="primary">套用到文末</button></div>`, {
            onOpen(bg2, close2) {
              bg2.querySelector('#tp-ok').onclick = () => { ce.innerHTML += TPLS[b.dataset.tpl]; close2(); toast('已套用範本（附加在文末）', 'success'); };
            }
          });
        });
        const collect = status => ({
          ...(d || {}), title: bg.querySelector('#c-t').value.trim() || '無標題',
          desc: bg.querySelector('#c-d').value, date: bg.querySelector('#c-date').value,
          status, cover: bg.querySelector('#c-cover').value,
          materials: bg.querySelector('#c-mat').value, tools: bg.querySelector('#c-tool').value,
          size: bg.querySelector('#c-size').value, cost: bg.querySelector('#c-cost').value, time: bg.querySelector('#c-time').value,
          content: sanitizeHTML(ce.innerHTML),
          categoryIds: [...bg.querySelector('#c-cat').selectedOptions].map(o => o.value),
          tags: [...new Set(bg.querySelector('#c-tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean))],
        });
        bg.querySelector('#c-draft').onclick = async () => { await save('craft', { ...collect('draft'), status: 'draft' }); ce._clearDraft?.(); close(); toast('草稿已儲存', 'success'); renderCrafts(); };
        bg.querySelector('#c-prev').onclick = () => modal(`<h3>預覽：${esc(bg.querySelector('#c-t').value)}</h3><div>${sanitizeHTML(ce.innerHTML)}</div><div class="row" style="justify-content:flex-end"><button data-close>關閉</button></div>`, { onOpen: b => hydrateMedia(b) });
        bg.querySelector('#c-save').onclick = async () => {
          const st = bg.querySelector('#c-st').value;
          const o = await save('craft', { ...collect(st) });
          ce._clearDraft?.(); close(); toast('已儲存', 'success'); location.hash = `#/crafts?open=${o.id}`;
        };
      }
    });
}
