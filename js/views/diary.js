// 日記：清單/月曆、編輯器（標題/段落/清單/引用/連結/插入圖片）、草稿
import { list, get, save, trash, listCategories, canView, isLocked } from '../store.js';
import { db } from '../db.js';
import { esc, uid, modal, toast, confirmDialog, sanitizeHTML, attachUploadBtn, richToolbar, hydrateMedia, isFid, privateNotice, lockNotice, lockBadge, titleFromContent } from '../util.js';
import { shareDialog, countView, catChips, bindCatChips } from './novel.js';
import { setNav } from './home.js';
import { isAuthed } from '../auth.js';
import { selectMode } from '../select-mode.js';

const MOODS = ['開心', '平靜', '期待', '疲憊', '難過', '生氣', '感恩'];
const WEATHERS = ['晴', '陰', '雨', '雪', '多雲', '風'];

export async function renderDiary() {
  const app = document.getElementById('app');
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const view = q.get('view') || 'list';
  const openId = q.get('open');
  const diaries = await list('diary');
  if (openId) return renderEntry(openId);

  const kw = q.get('q') || '', cat = q.get('cat') || '', tag = q.get('tag') || '';
  const cats = await listCategories('diary');
  sessionStorage.setItem('lastType', 'diary');
  if (cat) sessionStorage.setItem('cat:diary', cat);
  const filtered = diaries.filter(d =>
    d.status !== 'draft' &&
    (!kw || (d.title + (isLocked(d) ? '' : d.content || '')).includes(kw)) &&
    (!cat || (d.categoryIds || []).includes(cat)) &&
    (!tag || (d.tags || []).includes(tag)));

  app.innerHTML = `
    <div class="row list-head"><h1 style="margin-right:auto">日記</h1>
      <a href="#/diary?view=list"><button class="${view === 'list' ? 'primary' : ''}">清單</button></a>
      <a href="#/diary?view=calendar"><button class="${view === 'calendar' ? 'primary' : ''}">月曆</button></a>
      ${isAuthed() ? `<button id="sel-btn" ${view === 'calendar' ? 'class="hidden"' : ''}>☑ 選取</button><button id="new-d" class="primary lh-main">＋ 寫日記</button>` : ''}</div>
    <form id="df" class="row filter-bar" style="margin:.8rem 0">
      <input name="q" placeholder="關鍵字" value="${esc(kw)}" style="max-width:200px">
      <select name="cat" style="max-width:150px"><option value="">全部分類</option>${cats.map(c => `<option value="${c.id}" ${c.id === cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <input name="tag" placeholder="標籤" value="${esc(tag)}" style="max-width:130px">
      <button type="submit">篩選</button>
    </form>
    ${catChips(cats, 'diary', '#/diary', cat)}
    <div id="dview"></div>
    ${isAuthed() && diaries.some(d => d.status === 'draft') ? `<details><summary class="muted">草稿（${diaries.filter(d => d.status === 'draft').length}）</summary><div id="drafts"></div></details>` : ''}`;

  document.getElementById('df').onsubmit = e => { e.preventDefault(); const d = new FormData(e.target); location.hash = `#/diary?view=${view}&${new URLSearchParams(d)}`; };
  const nd = document.getElementById('new-d');
  if (nd) nd.onclick = () => editor(cat && cat !== 'uncategorized' ? { categoryIds: [cat] } : undefined);
  bindCatChips('diary', renderDiary);
  setNav();

  const dv = document.getElementById('dview');
  if (view === 'calendar') {
    const month = q.get('m') || new Date().toISOString().slice(0, 7);
    const [y, mo] = month.split('-').map(Number);
    const first = new Date(y, mo - 1, 1);
    const days = new Date(y, mo, 0).getDate();
    const byDay = {};
    for (const d of filtered) (byDay[d.date] ||= []).push(d);
    let cells = ['日', '一', '二', '三', '四', '五', '六'].map(w => `<div class="dow">${w}</div>`).join('');
    for (let i = 0; i < first.getDay(); i++) cells += '<div></div>';
    for (let d = 1; d <= days; d++) {
      const key = `${month}-${String(d).padStart(2, '0')}`;
      cells += `<div class="day ${byDay[key] ? 'has' : ''}" data-date="${key}"><b>${d}</b>${(byDay[key] || []).map(x => `<div class="dot">・${esc(x.title)}</div>`).join('')}</div>`;
    }
    const prev = new Date(y, mo - 2, 1).toISOString().slice(0, 7), next = new Date(y, mo, 1).toISOString().slice(0, 7);
    dv.innerHTML = `<div class="row" style="justify-content:center"><a href="#/diary?view=calendar&m=${prev}"><button>←</button></a><h2 style="margin:0 1rem">${y} 年 ${mo} 月</h2><a href="#/diary?view=calendar&m=${next}"><button>→</button></a></div><div class="cal">${cells}</div>`;
    dv.querySelectorAll('.day.has').forEach(el => el.onclick = () => { const d = byDay[el.dataset.date][0]; location.hash = `#/diary?open=${d.id}`; });
  } else {
    dv.innerHTML = filtered.length ? filtered.map(d => `
      <a class="card row" href="#/diary?open=${d.id}" data-sel="${d.id}" style="color:var(--text);margin-bottom:.6rem;display:flex;position:relative">
        ${(() => { const cv = d.cover || (/<img[^>]+(?:data-fid|src)="([^"]+)"/.exec(d.content || '') || [])[1]; if (!cv) return ''; if (isLocked(d)) return '<span class="lock-thumb">🔒</span>'; const fid = isFid(cv) ? cv : null; return fid ? `<img data-fid="${esc(fid)}" style="width:72px;height:72px;object-fit:cover;border-radius:8px" alt="">` : `<img src="${esc(cv)}" style="width:72px;height:72px;object-fit:cover;border-radius:8px" alt="">`; })()}
        <div style="flex:1"><b>${esc(d.title)}</b>${lockBadge(d)} ${d.demo ? '<span class="tag">示範</span>' : ''}
          <div class="muted">${esc(d.date || '')} ・ ${esc(d.mood || '')} ${esc(d.weather || '')} ・ ${(d.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
        </div></a>`).join('') : '<div class="empty">沒有日記</div>';
  }
  hydrateMedia(app);
  if (view !== 'calendar') selectMode({
    button: document.getElementById('sel-btn'), root: dv, actions: [
      { label: '🗑 刪除', danger: true, confirm: n => `把選取的 ${n} 篇日記移到回收筒？（可在「管理 → 回收筒」還原）`,
        run: async ids => { for (const id of ids) await trash('diary', id); toast(`已刪除 ${ids.length} 篇`, 'success'); renderDiary(); } },
    ],
  });
  const dr = document.getElementById('drafts');
  if (dr) dr.innerHTML = diaries.filter(d => d.status === 'draft').map(d => `<div class="row card" style="margin:.4rem 0"><span style="flex:1">${esc(d.title)}（草稿）</span><button data-edit="${d.id}">繼續編輯</button></div>`).join('');
  dr?.querySelectorAll('[data-edit]').forEach(b => b.onclick = async () => editor(await get('diary', b.dataset.edit)));
}

async function renderEntry(id) {
  const d = await get('diary', id);
  if (!d) return document.getElementById('app').innerHTML = '<div class="empty">找不到日記</div>';
  if (!canView(d)) return privateNotice();
  if (isLocked(d)) return lockNotice(d);
  document.getElementById('app').innerHTML = `
    <a href="#/diary">← 日記列表</a>
    <article class="card" style="margin-top:1rem">
      <h1 style="margin-top:0">${esc(d.title)}</h1>
      <p class="muted">${esc(d.date || '')} ・ ${esc(d.mood || '')} ${esc(d.weather || '')} ・ 👁 ${d.views || 0} 次觀看 ・ ${(d.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</p>
      <div class="diary-content" id="de-content">${sanitizeHTML(d.content || '')}</div>
      <div class="row" style="margin-top:1.5rem">
        ${isAuthed() ? '<button id="de-edit">編輯</button><button id="de-share">分享</button><button id="de-del" class="danger">刪除</button>' : ''}
      </div>
    </article>`;
  countView('diary', id);
  hydrateMedia(app);
  const eb = document.getElementById('de-edit');
  if (eb) {
    eb.onclick = () => editor(d);
    document.getElementById('de-share').onclick = () => shareDialog(d);
    document.getElementById('de-del').onclick = async () => { if (await confirmDialog(`確定刪除「${d.title}」？`)) { await trash('diary', id); location.hash = '#/diary'; } };
  }
}

async function editor(d) {
  const cats = await listCategories('diary');
  const imgs = await list('image');
  modal(`
    <h3>${d ? '編輯' : '新增'}日記</h3>
    <label>標題</label><input id="e-title" value="${esc(d?.title === '無標題' ? '' : d?.title || '')}" placeholder="沒填的話，會自動用內文的大標題">
    <div class="row">
      <div style="flex:1"><label>日期</label><input type="date" id="e-date" value="${esc(d?.date || new Date().toISOString().slice(0, 10))}"></div>
      <div style="flex:1"><label>心情</label><select id="e-mood">${MOODS.map(m => `<option ${d?.mood === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div style="flex:1"><label>天氣</label><select id="e-wea">${WEATHERS.map(w => `<option ${d?.weather === w ? 'selected' : ''}>${w}</option>`).join('')}</select></div>
    </div>
    <label>封面圖片</label><div class="field-inline"><input id="e-cover" value="${esc(d?.cover || '')}" placeholder="網址、上傳，或從內文選"><button id="e-cover-up" type="button">上傳</button><button id="e-cover-pick" type="button">選內文圖片</button></div>
    <div id="e-cover-opts" class="row" style="margin:.3rem 0"></div>
    <div id="e-bar" style="margin:.4rem 0"></div>
    <div id="e-content" contenteditable="true" style="min-height:200px;border:1px solid var(--border);border-radius:var(--radius);padding:.8rem">${d ? sanitizeHTML(d.content) : '<p><br></p>'}</div>
    <p class="muted" id="e-lastsave"></p>
    <label>分類</label><select id="e-cat" multiple size="3">${cats.map(c => `<option value="${c.id}" ${(d?.categoryIds || []).includes(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    <label>標籤（逗號分隔）</label><input id="e-tags" list="tag-suggest" value="${esc((d?.tags || []).join(', '))}"><datalist id="tag-suggest"></datalist>
    <div class="row" style="justify-content:flex-end;margin-top:1rem">
      <button data-close>取消</button>
      <button id="e-draft">存為草稿</button>
      <button id="e-prev">預覽</button>
      <button id="e-save" class="primary">發布</button>
    </div>`,
    {
      async onOpen(bg, close) {
        attachUploadBtn(bg.querySelector('#e-cover-up'), bg.querySelector('#e-cover'));
        bg.querySelector('#e-cover-pick').onclick = e => {
          e.preventDefault();
          const opts = bg.querySelector('#e-cover-opts');
          const srcs = [...ce.querySelectorAll('img')].map(i => i.dataset.fid || i.src).filter(Boolean);
          opts.innerHTML = srcs.length
            ? srcs.map(s => isFid(s) ? `<img data-fid="${esc(s)}" style="height:72px;border-radius:6px;cursor:pointer;border:2px solid transparent" data-src="${esc(s)}">` : `<img src="${esc(s)}" style="height:72px;border-radius:6px;cursor:pointer;border:2px solid transparent" data-src="${esc(s)}">`).join('')
            : '<span class="muted">內文還沒有圖片（先用「插入圖片」加圖）</span>';
          opts.querySelectorAll('img').forEach(i => i.onclick = () => {
            bg.querySelector('#e-cover').value = i.dataset.src;
            opts.querySelectorAll('img').forEach(x => x.style.borderColor = 'transparent');
            i.style.borderColor = 'var(--primary)';
          });
          hydrateMedia(opts);
        };
        const ce = bg.querySelector('#e-content');
        richToolbar(bg.querySelector('#e-bar'), ce, { draftKey: 'diary:' + (d?.id || 'new') });
        hydrateMedia(ce);
        const { tagStats } = await import('../store.js');
        bg.querySelector('#tag-suggest').innerHTML = (await tagStats()).map(([t]) => `<option value="${esc(t)}">`).join('');
        const dirty = { val: false };
        ce.addEventListener('input', () => { dirty.val = true; bg.querySelector('#e-lastsave').textContent = '有未儲存的變更'; });
        bg.addEventListener('click', e => { if (e.target.closest('[data-close]') && dirty.val && !confirm('尚未儲存，確定離開？')) e.stopImmediatePropagation(); }, true);
        const collect = status => ({
          ...(d || {}), title: titleFromContent(ce, bg.querySelector('#e-title').value),
          date: bg.querySelector('#e-date').value, mood: bg.querySelector('#e-mood').value, weather: bg.querySelector('#e-wea').value,
          cover: bg.querySelector('#e-cover').value, content: sanitizeHTML(ce.innerHTML), status,
          categoryIds: [...bg.querySelector('#e-cat').selectedOptions].map(o => o.value),
          tags: bg.querySelector('#e-tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean),
        });
        bg.querySelector('#e-draft').onclick = async () => { await save('diary', collect('draft')); ce._clearDraft?.(); close(); toast('草稿已儲存', 'success'); renderDiary(); };
        bg.querySelector('#e-prev').onclick = () => modal(`<h3>預覽：${esc(bg.querySelector('#e-title').value)}</h3><div>${sanitizeHTML(ce.innerHTML)}</div><div class="row" style="justify-content:flex-end"><button data-close>關閉</button></div>`, { onOpen: b => hydrateMedia(b) });
        bg.querySelector('#e-save').onclick = async () => { const o = await save('diary', collect('published')); ce._clearDraft?.(); close(); toast('已發布', 'success'); location.hash = `#/diary?open=${o.id}`; };
      }
    });
}

function pickImage(imgs) {
  return new Promise(res => {
    modal(`<h3>選擇圖片</h3><div class="grid" id="pi-grid" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr))"></div><div class="row" style="justify-content:flex-end"><button data-close>取消</button></div>`, {
      onOpen(bg, close) {
        const g = bg.querySelector('#pi-grid');
        imgs.slice(0, 30).forEach(async im => {
          const f = await db.get('files', im.fileId);
          const b = document.createElement('button');
          b.style.padding = '0'; b.style.border = 'none';
          b.innerHTML = `<img class="thumb" src="${URL.createObjectURL(f.blob)}" alt="${esc(im.title)}" title="${esc(im.title)}">`;
          b.onclick = () => { close(); res(b.querySelector('img').src); };
          g.appendChild(b);
        });
        bg.addEventListener('click', e => { if (e.target === bg) res(null); });
      }
    });
  });
}
