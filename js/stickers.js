// 可愛圖示／貼紙：內建 SVG（無外部圖片）＋自訂上傳＋選擇面板
import { esc, uid, modal, toast, fileObjectURL } from './util.js';
import { db } from './db.js';
import { getSettings, saveSettings } from './store.js';

// 小熊頭 SVG（可加配件 emoji/形狀）
const bear = (prop = '', face = 'normal') => {
  const eyes = face === 'sleep'
    ? '<path d="M38 46q4 4 8 0M54 46q4 4 8 0" stroke="#5a4633" stroke-width="2.5" fill="none" stroke-linecap="round"/>'
    : face === 'shy'
      ? '<circle cx="42" cy="45" r="2.6" fill="#5a4633"/><circle cx="58" cy="45" r="2.6" fill="#5a4633"/><ellipse cx="34" cy="50" rx="4" ry="2.4" fill="#f4a7a7" opacity=".7"/><ellipse cx="66" cy="50" rx="4" ry="2.4" fill="#f4a7a7" opacity=".7"/>'
      : '<circle cx="42" cy="45" r="2.6" fill="#5a4633"/><circle cx="58" cy="45" r="2.6" fill="#5a4633"/>';
  const mouth = face === 'cry'
    ? '<path d="M46 56q4-3 8 0" stroke="#5a4633" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M40 52q-2 6-3 10" stroke="#7aa2c8" stroke-width="2" fill="none" stroke-linecap="round"/>'
    : '<path d="M47 55q3 3 6 0" stroke="#5a4633" stroke-width="2" fill="none" stroke-linecap="round"/>';
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="30" cy="30" r="11" fill="#c99e6f"/><circle cx="70" cy="30" r="11" fill="#c99e6f"/><circle cx="30" cy="30" r="6" fill="#f3d9b8"/><circle cx="70" cy="30" r="6" fill="#f3d9b8"/><ellipse cx="50" cy="52" rx="27" ry="25" fill="#c99e6f"/><ellipse cx="50" cy="60" rx="13" ry="9" fill="#f3d9b8"/><ellipse cx="50" cy="55" rx="4" ry="3" fill="#5a4633"/>${eyes}${mouth}${prop}</svg>`;
};
const prop = (x, y, t, s = 22) => `<text x="${x}" y="${y}" font-size="${s}">${t}</text>`;
const simple = inner => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
const S = (id, name, svg, kws = []) => ({ id, name, svg, kws });

// 內建貼紙庫（分組）
export const STICKERS = {
  '小熊': [
    S('bear-happy', '開心', bear(prop(60, 88, '😊'))),
    S('bear-shy', '害羞', bear('', 'shy')),
    S('bear-hug', '抱抱', bear(prop(8, 88, '🫂'))),
    S('bear-sleep', '睡覺', bear(prop(64, 26, '💤'), 'sleep')),
    S('bear-read', '看書', bear(prop(30, 92, '📖'))),
    S('bear-craft', '手作', bear(prop(60, 92, '🧶'))),
    S('bear-go', '加油', bear(prop(66, 30, '🚩'))),
  ],
  '心情': [
    S('heart', '愛心', simple('<path d="M50 82C28 66 18 52 18 40c0-12 9-20 19-20 7 0 12 4 13 8 1-4 6-8 13-8 10 0 19 8 19 20 0 12-10 26-32 42z" fill="#e87d8f"/>')),
    S('star', '星星', simple('<path d="M50 15l10 22 24 3-18 16 5 24-21-12-21 12 5-24-18-16 24-3z" fill="#f2c14e"/>')),
    S('sparkle', '閃亮', simple('<path d="M50 20l6 20 20 6-20 6-6 20-6-20-20-6 20-6z" fill="#f7d774"/><circle cx="78" cy="24" r="5" fill="#f7d774"/>')),
    S('smile', '笑臉', simple('<circle cx="50" cy="50" r="32" fill="#f7d774"/><circle cx="40" cy="44" r="4" fill="#5a4633"/><circle cx="60" cy="44" r="4" fill="#5a4633"/><path d="M38 58q12 10 24 0" stroke="#5a4633" stroke-width="3" fill="none" stroke-linecap="round"/>')),
    S('cry', '哭哭', simple('<circle cx="50" cy="50" r="32" fill="#bcd3ea"/><circle cx="40" cy="44" r="4" fill="#41556a"/><circle cx="60" cy="44" r="4" fill="#41556a"/><path d="M40 62q10-8 20 0" stroke="#41556a" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M32 55q-3 8-4 14" stroke="#7aa2c8" stroke-width="3" fill="none" stroke-linecap="round"/>')),
  ],
  '生活': [
    S('coffee', '咖啡', simple('<rect x="28" y="38" width="38" height="34" rx="5" fill="#a9835f"/><path d="M66 44h8a8 8 0 010 16h-8" stroke="#a9835f" stroke-width="5" fill="none"/><path d="M38 30q3-6 0-12M50 30q3-6 0-12" stroke="#c9b6a0" stroke-width="3" fill="none" stroke-linecap="round"/>')),
    S('cake', '蛋糕', simple('<rect x="24" y="50" width="52" height="26" rx="4" fill="#f3c4cf"/><rect x="30" y="40" width="40" height="12" rx="4" fill="#fff"/><path d="M50 36v-8" stroke="#e87d8f" stroke-width="3"/><circle cx="50" cy="26" r="4" fill="#f2c14e"/>')),
    S('flower', '花朵', simple('<g fill="#f4a7a7"><circle cx="50" cy="30" r="10"/><circle cx="68" cy="44" r="10"/><circle cx="60" cy="66" r="10"/><circle cx="40" cy="66" r="10"/><circle cx="32" cy="44" r="10"/></g><circle cx="50" cy="50" r="9" fill="#f7d774"/>')),
    S('book', '書本', simple('<path d="M26 26q12-8 24-2v48q-12-6-24 2z" fill="#d77f8e"/><path d="M74 26q-12-8-24-2v48q12-6 24 2z" fill="#b95f70"/>')),
    S('camera', '相機', simple('<rect x="20" y="36" width="60" height="40" rx="8" fill="#8f9aab"/><rect x="40" y="28" width="20" height="10" rx="3" fill="#8f9aab"/><circle cx="50" cy="56" r="13" fill="#fff"/><circle cx="50" cy="56" r="8" fill="#41556a"/>')),
  ],
  '天氣': [
    S('sun', '太陽', simple('<circle cx="50" cy="50" r="18" fill="#f2c14e"/><g stroke="#f2c14e" stroke-width="4" stroke-linecap="round"><path d="M50 18v-8M50 82v8M18 50h-8M82 50h8M28 28l-6-6M72 72l6 6M28 72l-6 6M72 28l6-6"/></g>')),
    S('cloud', '雲朵', simple('<ellipse cx="50" cy="58" rx="30" ry="16" fill="#dfe8f2"/><circle cx="38" cy="46" r="14" fill="#dfe8f2"/><circle cx="58" cy="42" r="17" fill="#dfe8f2"/>')),
    S('rain', '雨滴', simple('<ellipse cx="50" cy="46" rx="28" ry="15" fill="#dfe8f2"/><circle cx="40" cy="36" r="12" fill="#dfe8f2"/><circle cx="58" cy="34" r="14" fill="#dfe8f2"/><g stroke="#7aa2c8" stroke-width="4" stroke-linecap="round"><path d="M36 66v12M52 70v12M68 66v12"/></g>')),
    S('rainbow', '彩虹', simple('<g fill="none" stroke-width="7" stroke-linecap="round"><path d="M20 70a30 30 0 0160 0" stroke="#e87d8f"/><path d="M28 70a22 22 0 0144 0" stroke="#f2c14e"/><path d="M36 70a14 14 0 0128 0" stroke="#8fb8a8"/></g>')),
    S('moon', '月亮', simple('<path d="M62 20a32 32 0 100 60 26 26 0 110-60z" fill="#f2c14e"/>')),
  ],
  '手帳': [
    S('tape', '膠帶', simple('<rect x="18" y="40" width="64" height="18" rx="3" fill="#f7d774" opacity=".85" transform="rotate(-6 50 49)"/>')),
    S('note', '便條紙', simple('<rect x="26" y="24" width="48" height="52" rx="4" fill="#fff3b0"/><path d="M26 24h48v10H26z" fill="#f2c14e" opacity=".5"/><g stroke="#d9c878" stroke-width="3"><path d="M34 44h32M34 54h32M34 64h22"/></g>')),
    S('arrow', '箭頭', simple('<path d="M20 50h48M56 36l14 14-14 14" stroke="#d77f8e" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')),
    S('check', '勾選', simple('<circle cx="50" cy="50" r="30" fill="none" stroke="#8fb8a8" stroke-width="5"/><path d="M36 52l10 10 20-22" stroke="#8fb8a8" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')),
    S('divider', '分隔裝飾', simple('<path d="M14 50q9-10 18 0t18 0 18 0 18 0" stroke="#c9b6a0" stroke-width="4" fill="none" stroke-linecap="round"/>')),
  ],
};

const all = () => Object.values(STICKERS).flat();
const favs = () => new Set(JSON.parse(localStorage.getItem('stkFavs') || '[]'));
const recent = () => JSON.parse(localStorage.getItem('stkRecent') || '[]');
const pushRecent = id => localStorage.setItem('stkRecent', JSON.stringify([id, ...recent().filter(x => x !== id)].slice(0, 12)));

// 渲染已存內容中的 <span class="stk" data-stk="id"> 與自訂貼紙
export async function hydrateStickers(root) {
  const s = await getSettings();
  const custom = s.customStickers || [];
  for (const el of root.querySelectorAll('.stk[data-stk]')) {
    const id = el.dataset.stk;
    const it = all().find(x => x.id === id);
    if (it) { el.innerHTML = it.svg; el.title = el.title || it.name; el.setAttribute('role', 'img'); el.setAttribute('aria-label', el.title || it.name); continue; }
    const c = custom.find(x => x.id === id);
    if (c && !el.querySelector('img')) {
      const url = await fileObjectURL(c.fileId);
      if (url) el.innerHTML = `<img src="${url}" alt="${esc(c.name)}" loading="lazy">`;
      else el.textContent = '⚠ 貼紙檔案未同步';
    }
  }
}

// 貼紙選擇面板：回傳插入的 HTML 片段
export function stickerPicker(onPick, { allowCustom = true } = {}) {
  modal(`<h3>🐻 可愛圖示／貼紙</h3>
    <div class="row"><input id="sp-q" placeholder="搜尋名稱或關鍵字" style="flex:1"><select id="sp-mode"><option value="inline">行內小圖示</option><option value="block">獨立貼紙</option><option value="left">靠左</option><option value="right">靠右</option></select>
      ${allowCustom ? '<button id="sp-up" type="button">上傳貼紙</button>' : ''}</div>
    <div class="row" style="flex-wrap:wrap;gap:.3rem;margin:.5rem 0" id="sp-tabs"></div>
    <div id="sp-grid" class="grid" style="grid-template-columns:repeat(auto-fill,minmax(64px,1fr));max-height:46vh;overflow:auto"></div>`,
    {
      async onOpen(bg, close) {
        const s = await getSettings();
        const customs = (s.customStickers || []).filter(c => !c.archived);
        const tabs = ['⭐ 常用', ...Object.keys(STICKERS), ...(customs.length ? ['自訂'] : [])];
        let curTab = tabs[0];
        const renderGrid = async () => {
          const kw = bg.querySelector('#sp-q').value.trim();
          let items = curTab === '⭐ 常用' ? recent().map(id => all().find(x => x.id === id)).filter(Boolean)
            : curTab === '自訂' ? customs
            : STICKERS[curTab] || [];
          if (kw) items = (curTab === '⭐ 常用' ? all() : items).filter(i => (i.name + (i.kws || []).join('')).includes(kw));
          const favSet = favs();
          const g = bg.querySelector('#sp-grid');
          g.innerHTML = items.map(i => `<button type="button" class="stk-cell" data-id="${i.id}" title="${esc(i.name)}" aria-label="${esc(i.name)}" style="border:1px solid var(--border);border-radius:10px;background:var(--surface);padding:.3rem;position:relative">${i.svg || `<img data-fid="${i.fileId}" alt="${esc(i.name)}" style="width:100%">`}<small>${esc(i.name)}</small>${favSet.has(i.id) ? '<span style="position:absolute;top:0;right:2px">⭐</span>' : ''}</button>`).join('') || '<p class="muted">沒有符合的貼紙</p>';
          await (await import('./util.js')).hydrateMedia(g);
          g.querySelectorAll('.stk-cell').forEach(b => {
            b.onclick = () => { pushRecent(b.dataset.id); onPick(b.dataset.id, bg.querySelector('#sp-mode').value); close(); };
            b.oncontextmenu = e => {
              e.preventDefault();
              const fs = favs();
              fs.has(b.dataset.id) ? fs.delete(b.dataset.id) : fs.add(b.dataset.id);
              localStorage.setItem('stkFavs', JSON.stringify([...fs]));
              renderGrid();
            };
          });
        };
        bg.querySelector('#sp-tabs').innerHTML = tabs.map(t => `<button type="button" class="sp-tab ${t === curTab ? 'primary' : ''}">${t}</button>`).join('');
        bg.querySelectorAll('.sp-tab').forEach(b => b.onclick = () => { curTab = b.textContent; bg.querySelectorAll('.sp-tab').forEach(x => x.classList.toggle('primary', x === b)); renderGrid(); });
        bg.querySelector('#sp-q').oninput = renderGrid;
        bg.querySelector('#sp-up')?.addEventListener('click', () => {
          const inp = document.createElement('input');
          inp.type = 'file'; inp.accept = 'image/png,image/webp,image/jpeg,image/gif';
          inp.onchange = async () => {
            const f = inp.files[0];
            if (!f) return;
            if (!/^image\/(png|webp|jpeg|gif)$/.test(f.type)) return toast('僅支援 PNG/WebP/JPEG/GIF', 'error');
            if (f.size > 5 * 1024 * 1024) return toast('貼紙需小於 5MB', 'error');
            const { imageUploadDialog } = await import('./util.js');
            const chosen = await imageUploadDialog([f]);
            if (!chosen?.length) return;
            const name = prompt('貼紙名稱', f.name.replace(/\.[^.]+$/, ''))?.trim();
            if (!name) return;
            const fileId = uid();
            await db.put('files', { id: fileId, blob: chosen[0].file });
            const st = await getSettings();
            st.customStickers = [...(st.customStickers || []), { id: uid(), name, fileId, cat: '自訂', kws: [] }];
            await saveSettings(st);
            toast(`已加入貼紙「${name}」`, 'success');
            curTab = '自訂'; renderGrid();
          };
          inp.click();
        });
        renderGrid();
      }
    });
}

// 依插入方式產生 HTML
export function stickerHTML(id, mode, name) {
  if (mode === 'inline') return `<span class="stk" data-stk="${id}" title="${esc(name || '')}" style="display:inline-block;width:1.5em;height:1.5em;vertical-align:-.3em"></span>`;
  const style = { block: 'margin:1rem auto;display:block;width:120px', left: 'float:left;width:110px;margin:0 1rem .5rem 0', right: 'float:right;width:110px;margin:0 0 .5rem 1rem' }[mode] || 'margin:1rem auto;display:block;width:120px';
  return `<figure class="stk-fig" style="${style}"><span class="stk" data-stk="${id}" title="${esc(name || '')}"></span></figure>`;
}
