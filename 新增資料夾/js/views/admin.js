// 管理後台：作品、分類、外觀範本、Drive 同步、備份、回收筒
import { list, listCategories, saveCategory, deleteCategory, mergeCategories, batchCategory, allWorks, tagStats, renameTag, deleteTag, getSettings, saveSettings, exportAll, importAll, listTrash, restore, purge, removeDemoData, get, save, trash } from '../store.js';
import { esc, toast, confirmDialog, modal, fmtDate, attachUploadBtn } from '../util.js';
import * as gd from '../gdrive.js';
import { shareDialog } from './novel.js';

const TABS = [['works', '作品管理'], ['categories', '分類管理'], ['appearance', '外觀範本'], ['drive', 'Google Drive'], ['backup', '備份'], ['trash', '回收筒']];
const THEMES = [
  ['literary', '文藝書房', '暖白米色・襯線字體・適合小說'],
  ['floral', '花間手札', '植物綠・米白・壓花感・推薦主風格'],
  ['bear', '小熊奶油手帳', '奶油白・奶茶棕・柔和粉・可愛圖示'],
  ['gallery', '極簡畫廊', '留白大圖・俐落排版・適合圖片'],
  ['journal', '日常手帳', '柔和配色・卡片設計・適合日記'],
  ['night', '深夜創作', '深色背景・舒適對比・綜合作品'],
];

export async function renderAdmin(tab) {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="row"><h1 style="margin-right:auto">管理後台</h1><button id="ad-pw">更改密碼</button><button id="ad-logout">登出</button></div><div class="tabs">${TABS.map(([k, n]) => `<button data-tab="${k}" class="${k === tab ? 'active' : ''}">${n}</button>`).join('')}</div><div id="tab-body"></div>`;
  document.getElementById('ad-logout').onclick = async () => { (await import('../auth.js')).logout(); location.hash = '#/'; };
  document.getElementById('ad-pw').onclick = () => {
    modal(`<h3>更改管理密碼</h3><label>原密碼</label><input type="password" id="p-old"><label>新密碼</label><input type="password" id="p-new"><label>確認新密碼</label><input type="password" id="p-new2"><p id="p-err" style="color:#b3443c"></p><div class="row" style="justify-content:flex-end;margin-top:1rem"><button data-close>取消</button><button id="p-ok" class="primary">更改</button></div>`, {
      onOpen(bg, close) {
        bg.querySelector('#p-ok').onclick = async () => {
          const [o, n1, n2] = ['#p-old', '#p-new', '#p-new2'].map(x => bg.querySelector(x).value);
          const err = m => bg.querySelector('#p-err').textContent = m;
          if (n1.length < 4) return err('新密碼至少 4 碼');
          if (n1 !== n2) return err('兩次新密碼不一致');
          try { await (await import('../auth.js')).changePassword(o, n1); close(); toast('密碼已更改', 'success'); }
          catch (e) { err(e.message); }
        };
      }
    });
  };
  app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => location.hash = `#/admin/${b.dataset.tab}`);
  const body = document.getElementById('tab-body');
  ({ works, categories, appearance, drive, backup, trash: trashTab }[tab] || works)(body);
}

// ---- 作品管理 ----
async function works(body) {
  const [novels, images, diaries, crafts] = await Promise.all([list('novel'), list('image'), list('diary'), list('craft')]);
  const row = (type, it, url) => `<tr><td>${esc(it.title)} ${it.demo ? '<span class="tag">示範</span>' : ''}</td>
    <td class="muted">${fmtDate(it.updatedAt)}</td><td>${it.visibility === 'public' ? '公開' : '私人'}</td>
    <td class="row"><a href="${url}"><button>檢視</button></a><button data-share="${type}:${it.id}">分享</button><button data-del="${type}:${it.id}" class="danger">刪除</button></td></tr>`;
  body.innerHTML = `
    <div class="row" style="margin-bottom:.8rem"><a href="#/novels/import"><button class="primary">匯入小說</button></a><a href="#/gallery"><button class="primary">上傳圖片</button></a><a href="#/diary"><button class="primary">寫日記</button></a>
    <span style="margin-left:auto"><button id="rm-demo">移除示範資料</button></span></div>
    <div class="card"><table><tr><th>作品</th><th>更新</th><th>隱私</th><th></th></tr>
    ${novels.map(n => row('novel', n, `#/novel/${n.id}`)).join('')}
    ${images.map(i => row('image', i, `#/image/${i.id}`)).join('')}
    ${diaries.map(d => row('diary', d, `#/diary?open=${d.id}`)).join('')}
    ${crafts.map(c => row('craft', c, `#/crafts?open=${c.id}`)).join('')}
    </table></div>`;
  document.getElementById('rm-demo').onclick = async () => {
    if (await confirmDialog('移除所有示範資料？')) { await removeDemoData(); toast('已移除示範資料', 'success'); renderAdmin('works'); }
  };
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const [t, id] = b.dataset.del.split(':');
    if (await confirmDialog('移至回收筒？')) { await trash(t, id); renderAdmin('works'); }
  });
  body.querySelectorAll('[data-share]').forEach(b => b.onclick = async () => {
    const [t, id] = b.dataset.share.split(':');
    shareDialog(await get(t, id));
  });
}

// ---- 分類管理（樹狀+清單、範本、合併、封存、批次、標籤）----
async function categories(body) {
  const cu = await import('../category-utils.js');
  let view = 'tree';
  let curType = sessionStorage.getItem('lastType') || sessionStorage.getItem('adminCatType') || 'novel';
  const redraw = async () => {
    sessionStorage.setItem('adminCatType', curType);
    const cats = (await listCategories(null, { includeArchived: true })).filter(c => curType === 'shared' ? c.type === 'shared' : (c.type === curType || c.type === 'shared'));
    const works = await allWorks();
    const tags = await tagStats();
    const countTxt = id => { const c = cu.counts(cats, works, id); return `${c.direct}（含子 ${c.total}）`; };
    const row = (c, depth) => `<div class="chapter-item" style="padding-left:${depth * 22}px;${c.archived ? 'opacity:.5' : ''}">
      ${c.color ? `<span style="width:.9em;height:.9em;border-radius:3px;background:${esc(c.color)}"></span>` : ''}${esc(c.icon || '')}
      <span style="flex:1"><a href="#/category/${c.id}">${esc(c.name)}</a> <span class="muted">${esc(c.type)}・${countTxt(c.id)} 件${c.archived ? '・已封存' : ''}</span></span>
      <button data-e="${c.id}">編輯</button><button data-s="${c.id}">＋子</button><button data-m="${c.id}">合併</button>
      <button data-a="${c.id}">${c.archived ? '還原' : '封存'}</button><button data-d="${c.id}" class="danger">刪除</button></div>`;
    const drawKids = (pid, depth) => cats.filter(c => c.parentId === pid).map(c => row(c, depth) + drawKids(c.id, depth + 1)).join('');

    body.innerHTML = `
      <div class="card">
        <div class="row" style="flex-wrap:wrap">
          ${[['novel', '小說分類'], ['image', '圖片分類'], ['diary', '日記分類'], ['craft', '手作手札'], ['shared', '共用']].map(([v, n]) => `<button class="cat-tab ${curType === v ? 'primary' : ''}" data-t="${v}">${n}</button>`).join('')}
        </div>
        <div class="row" style="margin-top:.4rem">
          <button id="v-tree" class="${view === 'tree' ? 'primary' : ''}">樹狀</button>
          <button id="v-list" class="${view === 'list' ? 'primary' : ''}">清單</button>
          <input id="c-search" placeholder="搜尋分類" style="max-width:180px">
          <span style="margin-left:auto"></span>
          <button id="tpl-btn">匯入範本</button>
          <button id="tag-btn">標籤管理</button>
          <button id="batch-btn">批次整理</button>
        </div>
        <div class="field-inline" style="margin-top:.6rem">
          <div style="flex:2"><label>新分類名稱</label><input id="c-name"></div>
          <div style="flex:1"><label>類型</label><select id="c-type"><option value="shared">共用</option><option value="novel">小說</option><option value="image">圖片</option><option value="diary">日記</option><option value="craft">手作手札</option></select></div>
          <div style="flex:1"><label>上層</label><select id="c-parent"><option value="">（無）</option>${cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
          <button id="c-add" class="primary">新增</button>
        </div>
        <div id="c-list" style="margin-top:1rem"></div>
      </div>`;

    body.querySelector('#c-type').value = curType;
    const listEl = body.querySelector('#c-list');
    function drawList() {
      const kw = body.querySelector('#c-search').value.trim();
      if (view === 'tree') listEl.innerHTML = drawKids(null, 0) || '<p class="muted">尚無分類</p>';
      else {
        const flat = cats.filter(c => !kw || c.name.includes(kw));
        listEl.innerHTML = flat.map(c => row(c, depthOf(c))).join('') || '<p class="muted">無符合</p>';
      }
      function depthOf(c) { let d = 0, p = c.parentId; while (p) { d++; p = cats.find(x => x.id === p)?.parentId; } return d; }
      bindRows();
    }
    function bindRows() {
      listEl.querySelectorAll('[data-e]').forEach(b => b.onclick = () => editCat(cats.find(x => x.id === b.dataset.e)));
      listEl.querySelectorAll('[data-s]').forEach(b => b.onclick = async () => {
        const name = prompt('子分類名稱');
        if (name?.trim()) { await saveCategory({ name: name.trim(), type: cats.find(x => x.id === b.dataset.s).type, parentId: b.dataset.s, order: cats.filter(c => c.parentId === b.dataset.s).length }); redraw(); }
      });
      listEl.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => { const c = cats.find(x => x.id === b.dataset.a); await saveCategory({ ...c, archived: !c.archived }); toast(c.archived ? '已還原' : '已封存（不再出現在作品分類選單）', 'success'); redraw(); });
      listEl.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
        const src = cats.find(x => x.id === b.dataset.m);
        const others = cats.filter(c => c.id !== src.id && !cu.descendants(cats, src.id).has(c.id));
        modal(`<h3>合併「${esc(src.name)}」到…</h3>
          <select id="mg-dst">${others.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select>
          <p id="mg-prev" class="muted"></p>
          <div class="row" style="justify-content:flex-end"><button data-close>取消</button><button id="mg-ok" class="primary">確認合併</button></div>`, {
          onOpen(bg, close) {
            const prev = () => { const p = cu.mergePreview(cats, works, src.id, bg.querySelector('#mg-dst').value); bg.querySelector('#mg-prev').textContent = `將移轉 ${p.affected} 件作品關聯、${p.kids} 個子分類，「${src.name}」會刪除。`; };
            prev(); bg.querySelector('#mg-dst').onchange = prev;
            bg.querySelector('#mg-ok').onclick = async () => { await mergeCategories(src.id, bg.querySelector('#mg-dst').value); close(); toast('已合併', 'success'); redraw(); };
          }
        });
      });
      listEl.querySelectorAll('[data-d]').forEach(b => b.onclick = () => {
        const c = cats.find(x => x.id === b.dataset.d);
        const others = cats.filter(x => x.id !== c.id);
        const kids = cu.childrenOf(cats, c.id);
        modal(`<h3>刪除分類「${esc(c.name)}」</h3>
          <label>此分類下的作品移至</label><select id="mv"><option value="">未分類</option>${others.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select>
          ${kids.length ? `<label>子分類（${kids.length} 個）移至</label><select id="mv-k"><option value="__up">上移一層</option>${others.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select>` : ''}
          <p class="muted">作品本身不會被刪除；無分類的作品歸入「未分類」。</p>
          <div class="row" style="justify-content:flex-end"><button data-close>取消</button><button id="mv-ok" class="danger">刪除分類</button></div>`, {
          onOpen(bg, close) {
            bg.querySelector('#mv-ok').onclick = async () => {
              const mk = bg.querySelector('#mv-k');
              await deleteCategory(c.id, { moveTo: bg.querySelector('#mv').value || null, moveChildrenTo: mk ? (mk.value === '__up' ? undefined : mk.value) : undefined });
              close(); toast('已刪除分類', 'success'); redraw();
            };
          }
        });
      });
    }
    body.querySelectorAll('.cat-tab').forEach(b => b.onclick = () => { curType = b.dataset.t; redraw(); });
    body.querySelector('#v-tree').onclick = () => { view = 'tree'; drawList(); body.querySelector('#v-tree').className = 'primary'; body.querySelector('#v-list').className = ''; };
    body.querySelector('#v-list').onclick = () => { view = 'list'; drawList(); body.querySelector('#v-list').className = 'primary'; body.querySelector('#v-tree').className = ''; };
    body.querySelector('#c-search').oninput = drawList;
    body.querySelector('#c-add').onclick = async () => {
      const name = body.querySelector('#c-name').value.trim();
      if (!name) return;
      const type = body.querySelector('#c-type').value, pid = body.querySelector('#c-parent').value || null;
      if (cats.some(c => c.name === name && c.type === type && c.parentId === pid)) return toast('同上層已有同名分類', 'error');
      await saveCategory({ name, type, parentId: pid, order: cats.length });
      redraw();
    };
    body.querySelector('#tpl-btn').onclick = () => templateDialog(cu, cats, redraw);
    body.querySelector('#tag-btn').onclick = () => tagDialog(tags, redraw);
    body.querySelector('#batch-btn').onclick = () => batchDialog(cats, redraw);

    // 分類編輯（完整欄位）
    function editCat(c) {
      modal(`<h3>編輯分類</h3>
        <div class="row"><div style="flex:2"><label>名稱</label><input id="ec-name" value="${esc(c.name)}"></div>
        <div style="flex:1"><label>網址代稱 slug</label><input id="ec-slug" value="${esc(c.slug || '')}"></div></div>
        <label>簡介</label><textarea id="ec-desc" rows="2">${esc(c.desc || '')}</textarea>
        <div class="row">
          <div style="flex:1"><label>類型</label><select id="ec-type">${['shared', 'novel', 'image', 'diary'].map(t => `<option value="${t}" ${c.type === t ? 'selected' : ''}>${{ shared: '共用', novel: '小說', image: '圖片', diary: '日記' }[t]}</option>`).join('')}</select></div>
          <div style="flex:1"><label>上層</label><select id="ec-parent"><option value="">（無）</option>${cats.filter(x => x.id !== c.id && !cu.descendants(cats, c.id).has(x.id)).map(x => `<option value="${x.id}" ${c.parentId === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
          <div style="flex:1"><label>顏色</label><input type="color" id="ec-color" value="${esc(c.color || '#888888')}"></div>
          <div style="flex:1"><label>圖示</label><div class="field-inline"><input id="ec-icon" value="${esc(c.icon || '')}" placeholder="如 📚 或選圖示"><button id="ec-icon-pick" type="button">選圖示</button></div></div>
        </div>
        <label>封面圖片網址</label><input id="ec-cover" value="${esc(c.cover || '')}">
        <label>分類頁顯示</label><select id="ec-display">${[['cards', '卡片'], ['list', '清單'], ['grid', '圖片網格']].map(([v, n]) => `<option value="${v}" ${c.display === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <label><input type="checkbox" id="ec-home" ${c.showHome ? 'checked' : ''} style="width:auto"> 顯示在首頁</label>
        <label><input type="checkbox" id="ec-nav" ${c.showNav ? 'checked' : ''} style="width:auto"> 顯示在主選單</label>
        <div class="row" style="justify-content:flex-end;margin-top:1rem"><button data-close>取消</button><button id="ec-ok" class="primary">儲存</button></div>`, {
        onOpen(bg, close) {
          bg.querySelector('#ec-icon-pick').onclick = async () => {
            const { stickerPicker } = await import('../stickers.js');
            stickerPicker(id => { bg.querySelector('#ec-icon').value = `stk:${id}`; }, { allowCustom: false });
          };
          bg.querySelector('#ec-ok').onclick = async () => {
            const np = bg.querySelector('#ec-parent').value || null;
            if (!cu.canMove(cats, c.id, np)) return toast('不能移到自身或子分類底下', 'error');
            await saveCategory({ ...c, name: bg.querySelector('#ec-name').value.trim(), slug: bg.querySelector('#ec-slug').value.trim(), desc: bg.querySelector('#ec-desc').value, type: bg.querySelector('#ec-type').value, parentId: np, color: bg.querySelector('#ec-color').value, icon: bg.querySelector('#ec-icon').value.trim(), cover: bg.querySelector('#ec-cover').value.trim(), display: bg.querySelector('#ec-display').value, showHome: bg.querySelector('#ec-home').checked, showNav: bg.querySelector('#ec-nav').checked });
            close(); redraw();
          };
        }
      });
    }
    drawList();
  };
  redraw();
}

function templateDialog(cu, cats, redraw) {
  const checks = Object.entries(cu.TEMPLATES).map(([k, t]) => `<label><input type="checkbox" class="tpl-cb" value="${k}" style="width:auto"> ${t.label}分類範本</label>`).join('')
    + `<label><input type="checkbox" id="tpl-tags" style="width:auto"> 共用標籤範本（建立為共用分類）</label>`;
  modal(`<h3>匯入分類範本</h3><p class="muted">勾選要匯入的範本，重複的會自動略過。</p>${checks}
    <p id="tpl-prev" class="muted"></p>
    <div class="row" style="justify-content:flex-end"><button data-close>取消</button><button id="tpl-ok" class="primary">預覽並匯入</button></div>`, {
    onOpen(bg, close) {
      bg.querySelector('#tpl-ok').onclick = async () => {
        const { saveCategory } = await import('../store.js');
        const { uid } = await import('../util.js');
        const lines = [];
        for (const cb of bg.querySelectorAll('.tpl-cb:checked')) {
          const t = cu.TEMPLATES[cb.value];
          for (const [group, names] of Object.entries(t.groups)) {
            let g = cats.find(c => c.name === group && c.type === cb.value && !c.parentId);
            if (!g) { g = await saveCategory({ name: group, type: cb.value, order: cats.length }); lines.push(`＋${group}`); }
            for (const n of names) {
              const dup = cats.find(c => c.name === n && c.type === cb.value && c.parentId === g.id);
              if (dup) lines.push(`＝略過 ${group}/${n}`);
              else { await saveCategory({ name: n, type: cb.value, parentId: g.id, order: 0 }); lines.push(`＋${group}/${n}`); }
            }
          }
        }
        if (bg.querySelector('#tpl-tags').checked) {
          for (const [group, names] of Object.entries(cu.TAG_TEMPLATES)) {
            let g = cats.find(c => c.name === `標籤：${group}` && !c.parentId);
            if (!g) g = await saveCategory({ name: `標籤：${group}`, type: 'shared', order: cats.length });
            for (const n of names) if (!cats.find(c => c.name === n && c.parentId === g.id)) await saveCategory({ name: n, type: 'shared', parentId: g.id });
          }
          lines.push('＋共用標籤範本');
        }
        bg.querySelector('#tpl-prev').innerHTML = lines.slice(0, 30).join('、') + (lines.length > 30 ? ' …' : '');
        setTimeout(() => { close(); redraw(); }, 800);
      };
    }
  });
}

function tagDialog(tags, redraw) {
  modal(`<h3>標籤管理（${tags.length} 個）</h3>
    <table>${tags.map(([t, n]) => `<tr><td>${esc(t)}</td><td class="muted">${n} 次</td><td class="row"><button data-rn="${esc(t)}">改名/合併</button><button data-dt="${esc(t)}" class="danger">刪除</button></td></tr>`).join('') || '<tr><td class="muted">尚無標籤</td></tr>'}</table>
    <div class="row" style="justify-content:flex-end"><button data-close>關閉</button></div>`, {
    onOpen(bg, close) {
      bg.querySelectorAll('[data-rn]').forEach(b => b.onclick = async () => {
        const nn = prompt(`「${b.dataset.rn}」改名或合併為：`, b.dataset.rn);
        if (nn && nn.trim() !== b.dataset.rn) { const n = await renameTag(b.dataset.rn, nn); toast(`已更新 ${n} 件作品`, 'success'); close(); redraw(); }
      });
      bg.querySelectorAll('[data-dt]').forEach(b => b.onclick = async () => {
        if (await confirmDialog(`從所有作品移除標籤「${b.dataset.dt}」？`)) { const n = await deleteTag(b.dataset.dt); toast(`已從 ${n} 件作品移除`, 'success'); close(); redraw(); }
      });
    }
  });
}

function batchDialog(cats, redraw) {
  modal(`<h3>批次整理作品分類</h3>
    <label>操作</label><select id="b-op"><option value="add">新增分類到作品</option><option value="remove">從作品移除分類</option><option value="replace">替換分類</option><option value="primary">設為主要分類</option></select>
    <label>分類</label><select id="b-cat">${cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
    <div id="b-repl" class="hidden"><label>替換為</label><select id="b-dst">${cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
    <p id="b-prev" class="muted"></p>
    <div class="row" style="justify-content:flex-end"><button data-close>取消</button><button id="b-ok" class="primary">執行</button></div>`, {
    onOpen(bg, close) {
      const op = bg.querySelector('#b-op'), repl = bg.querySelector('#b-repl');
      op.onchange = () => repl.classList.toggle('hidden', op.value !== 'replace');
      bg.querySelector('#b-ok').onclick = async () => {
        const n = await batchCategory(op.value, bg.querySelector('#b-cat').value, { targetId: bg.querySelector('#b-dst').value });
        close(); toast(`已更新 ${n} 件作品`, 'success'); redraw();
      };
    }
  });
}

// ---- 外觀範本 ----
async function appearance(body) {
  const s = await getSettings();
  body.innerHTML = `
    <div class="grid">${THEMES.map(([k, n, d]) => `
      <div class="card" style="text-align:center">
        <div data-theme-preview="${k}" style="height:90px;border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;background:${{ literary: '#faf5ec', bear: '#fff8ee', floral: '#f4f1e3', gallery: '#fff', journal: '#fdf3f0', night: '#14161c' }[k]};color:${{ literary: '#3a3128', bear: '#4a3a2c', floral: '#4a5140', gallery: '#111', journal: '#4a3b40', night: '#e6e4df' }[k]}">Aa 🐻 預覽</div>
        <h3>${n}</h3><p class="muted">${d}</p>
        <button data-theme="${k}" class="${s.theme === k ? 'primary' : ''}">${s.theme === k ? '使用中' : '套用'}</button>
        <button data-try="${k}">即時預覽</button>
      </div>`).join('')}</div>
    <div class="card" style="margin-top:1rem">
      <h3>網站設定</h3>
      <label>網站名稱</label><input id="s-name" value="${esc(s.siteName)}">
      <label>網站簡介</label><textarea id="s-desc" rows="2">${esc(s.siteDesc)}</textarea>
      <label>頭像圖片</label><div class="field-inline"><input id="s-avatar" value="${esc(s.avatar)}" placeholder="網址或上傳"><button id="s-avatar-up" type="button">上傳</button></div>
      <label>首頁封面圖片</label><div class="field-inline"><input id="s-cover" value="${esc(s.cover)}" placeholder="網址或上傳"><button id="s-cover-up" type="button">上傳</button></div>
      <label>主色（留空使用範本預設）</label><input type="color" id="s-color" value="${esc(s.primaryColor || '#8b5e3c')}">
      <label>裝飾程度</label><select id="s-deco"><option value="simple" ${s.deco === 'simple' ? 'selected' : ''}>簡約</option><option value="standard" ${!s.deco || s.deco === 'standard' ? 'selected' : ''}>標準</option><option value="rich" ${s.deco === 'rich' ? 'selected' : ''}>豐富</option></select>
      <label><input type="checkbox" id="s-anim" ${s.anim === false ? '' : 'checked'} style="width:auto"> 啟用動畫</label>
      <div class="row" style="margin-top:.8rem"><button id="s-save" class="primary">儲存設定</button></div>
    </div>`;
  attachUploadBtn(body.querySelector('#s-avatar-up'), body.querySelector('#s-avatar'));
  attachUploadBtn(body.querySelector('#s-cover-up'), body.querySelector('#s-cover'));
  body.querySelectorAll('[data-try]').forEach(b => b.onclick = () => { document.body.dataset.theme = b.dataset.try; toast('預覽中（尚未儲存）'); });
  body.querySelectorAll('[data-theme]').forEach(b => b.onclick = async () => { await saveSettings({ theme: b.dataset.theme }); document.body.dataset.theme = b.dataset.theme; toast('已套用範本', 'success'); appearance(body); });
  body.querySelector('#s-save').onclick = async () => {
    const color = body.querySelector('#s-color').value;
    const deco = body.querySelector('#s-deco').value;
    const anim = body.querySelector('#s-anim').checked;
    await saveSettings({ siteName: body.querySelector('#s-name').value, siteDesc: body.querySelector('#s-desc').value, avatar: body.querySelector('#s-avatar').value, cover: body.querySelector('#s-cover').value, primaryColor: color, deco, anim });
    document.body.dataset.deco = deco;
    document.body.classList.toggle('no-anim', !anim);
    document.documentElement.style.setProperty('--primary', color);
    document.getElementById('site-title').textContent = body.querySelector('#s-name').value;
    document.title = body.querySelector('#s-name').value;
    toast('已儲存', 'success');
  };
}

// ---- Google Drive ----
async function drive(body) {
  const s = await getSettings();
  const st = gd.syncState;
  const statusTxt = { offline: '未連線', connected: '已連線', syncing: '同步中', error: '錯誤' }[st.status];
  const dot = { offline: 'status-off', connected: 'status-ok', syncing: 'status-warn', error: 'status-bad' }[st.status];
  body.innerHTML = `
    <div class="card">
      <h3>連線狀態</h3>
      <p><span class="status-dot ${dot}"></span>${statusTxt}${st.error ? ` — ${esc(st.error)}` : ''}</p>
      ${st.progress ? `<p class="muted">${esc(st.progress)}</p>` : ''}
      ${st.lastSync ? `<p class="muted">最後同步：${new Date(st.lastSync).toLocaleString('zh-TW')}</p>` : ''}
    </div>
    <div class="card" style="margin-top:1rem">
      <h3>Apps Script 同步</h3>
      <p class="muted">把 <code>gas/Code.gs</code> 貼到 Google Apps Script 並部署為網路應用程式（執行身分「我」），貼上 /exec 網址即可一鍵上傳所有資料到指定資料夾，不需要 OAuth Client ID。</p>
      <label>Apps Script Web App URL</label><input id="d-gas" value="${esc(s.gasUrl || '')}" placeholder="https://script.google.com/macros/s/.../exec">
      <label>目標資料夾 ID</label><input id="d-fid" value="${esc(s.driveFolderId || '1OEQ7Cjq6AK6QAeU1CgaxYN0GjdAaIwdF')}">
      <div class="row" style="margin-top:.6rem"><button id="d-gas-save">儲存設定</button><button id="d-gas-up" class="primary">上傳所有資料到此資料夾</button><button id="d-gas-down">從雲端讀取最新資料</button></div>
    </div>`;
  gd.onSyncChange(() => drive(body));
  body.querySelector('#d-gas-save').onclick = async () => { await saveSettings({ gasUrl: body.querySelector('#d-gas').value.trim(), driveFolderId: body.querySelector('#d-fid').value.trim() }); toast('已儲存', 'success'); };
  body.querySelector('#d-gas-up').onclick = async () => {
    const url = body.querySelector('#d-gas').value.trim();
    if (!url) return toast('請先填入 Apps Script Web App URL', 'error');
    await saveSettings({ gasUrl: url, driveFolderId: body.querySelector('#d-fid').value.trim() });
    try { await gd.uploadViaAppsScript(url, body.querySelector('#d-fid').value.trim()); toast('上傳完成', 'success'); }
    catch (e) { toast(e.message, 'error'); }
    drive(body);
  };
  body.querySelector('#d-gas-down').onclick = async () => {
    try {
      const { loadViaAppsScript } = gd;
      const data = await loadViaAppsScript(body.querySelector('#d-gas').value.trim());
      await importAll(data);
      await saveSettings({ _appliedRemote: data.exportedAt });
      toast('已載入雲端最新資料', 'success');
      location.reload();
    } catch (e) { toast(e.message, 'error'); }
  };
}

// ---- 備份 ----
async function backup(body) {
  body.innerHTML = `
    <div class="card">
      <h3>完整備份（含圖片與格式版本）</h3>
      <div class="row"><button id="bk-exp" class="primary">匯出備份（JSON）</button>
      <button id="bk-imp">匯入備份</button><input type="file" id="bk-file" accept=".json" class="hidden"></div>
      <p class="muted">匯入時可選擇「合併」保留現有資料，或「覆蓋」全部取代。</p>
    </div>`;
  body.querySelector('#bk-exp').onclick = async () => {
    const data = await exportAll();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  const fi = body.querySelector('#bk-file');
  body.querySelector('#bk-imp').onclick = () => fi.click();
  fi.onchange = async () => {
    try {
      const data = JSON.parse(await fi.files[0].text());
      const overwrite = await confirmDialog('選「確定」= 覆蓋全部資料；選「取消」= 與現有資料合併。', { okText: '覆蓋匯入' });
      await importAll(data, { merge: !overwrite });
      toast('匯入完成', 'success');
    } catch (e) { toast('匯入失敗：' + e.message, 'error'); }
  };
}

// ---- 回收筒 ----
async function trashTab(body) {
  const items = await listTrash();
  body.innerHTML = items.length ? `<div class="card"><table><tr><th>項目</th><th>類型</th><th>刪除時間</th><th></th></tr>
    ${items.map(t => `<tr><td>${esc(t.title)}</td><td>${t.type}</td><td class="muted">${new Date(t.deletedAt).toLocaleString('zh-TW')}</td>
    <td class="row"><button data-res="${t.id}">還原</button><button data-pur="${t.id}" class="danger">永久刪除</button></td></tr>`).join('')}</table></div>`
    : '<div class="empty">回收筒是空的</div>';
  body.querySelectorAll('[data-res]').forEach(b => b.onclick = async () => { await restore(b.dataset.res); toast('已還原', 'success'); trashTab(body); });
  body.querySelectorAll('[data-pur]').forEach(b => b.onclick = async () => {
    if (await confirmDialog('永久刪除後無法復原，確定？', { danger: true })) { await purge(b.dataset.pur); trashTab(body); }
  });
}
