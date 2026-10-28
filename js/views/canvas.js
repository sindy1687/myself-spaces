// 自由畫布拼貼：貼圖、拖曳、縮放、旋轉、圖層、鎖定、復原、自動儲存
import { getSettings, saveSettings } from '../store.js';
import { db } from '../db.js';
import { esc, uid, toast, modal, hydrateMedia, imageUploadDialog, debounce } from '../util.js';
import { applyEdits } from '../imgedit.js';
import { isAuthed } from '../auth.js';
import { setNav } from './home.js';

export async function renderCanvas() {
  const s = await getSettings();
  const app = document.getElementById('app');
  let items = s.canvasItems || [];
  // 未登入（只能看）時拿掉私人圖片；登入編輯時保留全部，避免存檔時弄丟
  if (!isAuthed()) {
    const { db } = await import('../db.js'), { canView } = await import('../store.js');
    await (await import('../store.js')).refreshAlbums();
    const hidden = new Set((await db.all('images')).filter(i => !canView(i)).map(i => i.fileId));
    items = items.filter(it => !hidden.has(it.fileId));
  }
  let mode = isAuthed() ? 'edit' : 'view';
  let sel = null;
  const undoStack = [];
  const save = debounce(async () => { await saveSettings({ canvasItems: items }); }, 600);
  const push = () => { undoStack.push(JSON.stringify(items)); if (undoStack.length > 60) undoStack.shift(); };

  const draw = () => {
    const editable = mode === 'edit';
    app.innerHTML = `
      <div class="row"><h1 style="margin-right:auto">畫布拼貼</h1>
        ${isAuthed() ? `<button id="cv-mode" class="${editable ? 'primary' : ''}">${editable ? '✎ 編輯中' : '👁 預覽'}</button>
        ${editable ? '<button id="cv-add">＋加入圖片</button><button id="cv-arr">一鍵整理</button><button id="cv-clear" class="danger">清空</button>' : ''}` : ''}</div>
      ${editable ? '<p class="muted">Ctrl+V 貼上 / 拖曳圖片進畫布 ・ 點圖片顯示工具 ・ 拖角縮放、上方圓點旋轉、雙擊裁切 ・ Ctrl+Z 復原</p>' : ''}
      <div id="cv" style="position:relative;min-height:70vh;border:${editable ? '2px dashed var(--border)' : 'none'};border-radius:12px;overflow:hidden;background:var(--surface)">
        ${!items.length ? '<div class="empty">還沒有圖片，貼上或拖曳圖片開始拼貼</div>' : ''}
      </div>`;
    const cv = document.getElementById('cv');
    for (const it of items) {
      const el = document.createElement('div');
      el.className = 'cv-item' + (sel === it.id ? ' sel' : '');
      el.dataset.id = it.id;
      el.style.cssText = `position:absolute;left:${it.x}px;top:${it.y}px;width:${it.w}px;height:${it.h}px;transform:rotate(${it.rot || 0}deg);z-index:${it.z || 1};cursor:${editable && !it.locked ? 'move' : 'default'}`;
      el.innerHTML = `<img data-fid="${it.fileId}" alt="" draggable="false" style="width:100%;height:100%;object-fit:contain;pointer-events:${editable ? 'auto' : 'none'}">
        ${editable && sel === it.id ? `
          <div class="cv-tools" style="position:absolute;top:-40px;left:0;white-space:nowrap;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:.15rem .3rem;z-index:10">
            <button data-t="crop" title="裁切" aria-label="裁切">✂</button>
            <button data-t="dup" title="複製" aria-label="複製">⧉</button>
            <button data-t="up" title="移到最上層" aria-label="移到最上層">⬆</button>
            <button data-t="down" title="移到最下層" aria-label="移到最下層">⬇</button>
            <button data-t="lock" title="${it.locked ? '解鎖' : '鎖定'}" aria-label="鎖定">${it.locked ? '🔓' : '🔒'}</button>
            <button data-t="del" title="刪除" aria-label="刪除">🗑</button>
          </div>
          <div class="cv-rot" title="拖曳旋轉" style="position:absolute;top:-30px;right:-8px;width:14px;height:14px;border-radius:50%;background:var(--primary);cursor:grab"></div>
          ${['nw', 'ne', 'sw', 'se'].map(k => `<div class="cv-h" data-h="${k}" style="position:absolute;width:12px;height:12px;background:#fff;border:2px solid var(--primary);border-radius:3px;cursor:${k === 'nw' || k === 'se' ? 'nwse-resize' : 'nesw-resize'};${k.includes('n') ? 'top:-6px' : 'bottom:-6px'};${k.includes('w') ? 'left:-6px' : 'right:-6px'}"></div>`).join('')}
        ` : ''}`;
      cv.appendChild(el);
      if (editable) bind(el, it);
    }
    hydrateMedia(cv);
    document.getElementById('cv-mode')?.addEventListener('click', () => { mode = mode === 'edit' ? 'view' : 'edit'; sel = null; draw(); });
    document.getElementById('cv-add')?.addEventListener('click', pickFile);
    document.getElementById('cv-arr')?.addEventListener('click', arrangeDialog);
    document.getElementById('cv-clear')?.addEventListener('click', async () => { if (confirm('確定清空畫布？（Ctrl+Z 可復原）')) { push(); items = []; sel = null; save(); draw(); } });
  };

  const pickFile = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = async () => {
      const chosen = await imageUploadDialog([...inp.files]);
      if (chosen) for (const c of chosen) await addImg(c.file);
    };
    inp.click();
  };
  const addImg = async f => {
    push();
    const fid = uid();
    await db.put('files', { id: fid, blob: f });
    const img = new Image();
    const url = URL.createObjectURL(f);
    await new Promise(r => { img.onload = r; img.src = url; });
    const maxW = 400, scale = Math.min(1, maxW / img.naturalWidth);
    items.push({ id: uid(), fileId: fid, x: 40 + items.length * 30, y: 40 + items.length * 30, w: Math.round(img.naturalWidth * scale), h: Math.round(img.naturalHeight * scale), rot: 0, z: Math.max(0, ...items.map(i => i.z || 0)) + 1 });
    URL.revokeObjectURL(url);
    save(); draw();
  };

  const find = id => items.find(i => i.id === id);
  function bind(el, it) {
    const cv = document.getElementById('cv');
    // Pointer events：滑鼠與觸控（平板/手機）通用；touch-action:none 由 CSS 提供
    el.onpointerdown = e => {
      if (e.target.closest('.cv-tools') || e.target.classList.contains('cv-h') || e.target.classList.contains('cv-rot')) return;
      if (it.locked) { sel = it.id; draw(); return; }
      sel = it.id;
      const sx = e.clientX - it.x, sy = e.clientY - it.y;
      push();
      const mv = ev => { it.x = ev.clientX - sx; it.y = ev.clientY - sy; el.style.left = it.x + 'px'; el.style.top = it.y + 'px'; };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); save(); draw(); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    };
    el.querySelectorAll('.cv-h').forEach(h => h.onpointerdown = e => {
      e.preventDefault(); e.stopPropagation(); push();
      const sx = e.clientX, sy = e.clientY, sw = it.w, sh = it.h, sxp = it.x, syp = it.y, ratio = sw / sh;
      const dir = h.dataset.h;
      const mv = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        let w = sw, xp = sxp, yp = syp;
        if (dir.includes('e')) w = sw + dx;
        if (dir.includes('w')) { w = sw - dx; xp = sxp + dx; }
        const hh = Math.max(30, Math.round(w / ratio));
        if (dir.includes('s')) it.h = hh; else { it.h = hh; yp = syp + (sh - hh); }
        it.w = Math.max(30, w); it.x = xp; it.y = yp;
        el.style.cssText = `position:absolute;left:${it.x}px;top:${it.y}px;width:${it.w}px;height:${it.h}px;transform:rotate(${it.rot}deg);z-index:${it.z}`;
      };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); save(); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    });
    el.querySelector('.cv-rot')?.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); push();
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const mv = ev => { it.rot = Math.round(Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90); el.style.transform = `rotate(${it.rot}deg)`; };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); save(); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    });
    el.ondblclick = () => cropDialog(it);
    el.querySelectorAll('.cv-tools [data-t]').forEach(b => b.onclick = e => {
      e.stopPropagation(); push();
      const t = b.dataset.t;
      if (t === 'del') { items = items.filter(i => i !== it); sel = null; }
      if (t === 'dup') { const cp = { ...it, id: uid(), x: it.x + 20, y: it.y + 20, z: Math.max(...items.map(i => i.z || 0)) + 1 }; items.push(cp); }
      if (t === 'up') it.z = Math.max(...items.map(i => i.z || 0)) + 1;
      if (t === 'down') it.z = Math.min(...items.map(i => i.z || 0)) - 1;
      if (t === 'lock') it.locked = !it.locked;
      if (t === 'crop') { cropDialog(it); return; }
      save(); draw();
    });
  }

  // 一鍵整理：等寬瀑布排列，或全部裁成正方形統一大小
  function arrangeDialog() {
    if (!items.length) return toast('畫布是空的', 'error');
    modal(`<h3>一鍵整理畫布</h3>
      <label><input type="radio" name="am" value="fit" checked style="width:auto"> 等寬排列（自動縮放、保留原圖比例）</label>
      <label><input type="radio" name="am" value="square" style="width:auto"> 裁切成正方形（統一大小，會另存裁切圖）</label>
      <label>欄寬</label><select id="am-w"><option value="160">小 160px</option><option value="220" selected>中 220px</option><option value="320">大 320px</option></select>
      <div class="row" style="justify-content:flex-end;margin-top:1rem"><button data-close>取消</button><button id="am-ok" class="primary">開始整理</button></div>`, {
      onOpen(bg, close) {
        bg.querySelector('#am-ok').onclick = async () => {
          const mode2 = bg.querySelector('[name=am]:checked').value;
          const cw = +bg.querySelector('#am-w').value, gap = 12;
          push();
          const sorted = [...items].sort((a, b) => (a.y - b.y) || (a.x - b.x));
          for (const it of sorted) {
            it.rot = 0;
            if (mode2 === 'square') {
              const side = Math.min(it.w, it.h);
              const f = await db.get('files', it.fileId);
              const nb = await applyEdits(f.blob, { crop: { x: .5 - side / it.w / 2, y: .5 - side / it.h / 2, w: side / it.w, h: side / it.h } });
              const nf = uid();
              await db.put('files', { id: nf, blob: nb });
              it.fileId = nf; it.w = it.h = cw;
            } else {
              it.h = Math.max(30, Math.round(cw * it.h / it.w)); it.w = cw;
            }
          }
          // 依欄高把圖片塞進最短的那一欄（瀑布流排列）
          const cvw = (document.getElementById('cv')?.clientWidth || 800) - gap;
          const cols = Math.max(1, Math.floor((cvw + gap) / (cw + gap)));
          const colY = new Array(cols).fill(0);
          for (const it of sorted) {
            const c = colY.indexOf(Math.min(...colY));
            it.x = c * (cw + gap); it.y = colY[c]; it.z = c + 1;
            colY[c] += it.h + gap;
          }
          items = sorted; sel = null;
          close(); save(); draw(); toast('已整理排列', 'success');
        };
      }
    });
  }

  function cropDialog(it) {
    push();
    modal(`<h3>裁切</h3><p class="muted">拖曳框選要保留的範圍</p>
      <div id="cr-wrap" style="position:relative;max-height:55vh;overflow:auto;touch-action:none"><img id="cr-img" data-fid="${it.fileId}" style="max-width:100%;display:block"></div>
      <div class="row" style="justify-content:flex-end;margin-top:.6rem"><button data-close>取消</button><button id="cr-ok" class="primary">套用裁切</button></div>`, {
      onOpen(bg, close) {
        hydrateMedia(bg);
        const wrap = bg.querySelector('#cr-wrap'), img = bg.querySelector('#cr-img');
        let r = null, box = null;
        img.onload = () => {
          wrap.onpointerdown = e => {
            e.preventDefault();
            const b = img.getBoundingClientRect();
            const sx = e.clientX - b.left, sy = e.clientY - b.top;
            if (box) box.remove();
            box = document.createElement('div');
            box.style.cssText = 'position:absolute;border:2px dashed var(--primary);background:rgba(200,140,90,.15);pointer-events:none';
            wrap.appendChild(box);
            const mv = ev => {
              const x = Math.min(sx, ev.clientX - b.left), y = Math.min(sy, ev.clientY - b.top);
              const w = Math.abs(ev.clientX - b.left - sx), h = Math.abs(ev.clientY - b.top - sy);
              box.style.cssText += `;left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
              r = { x: x / b.width, y: y / b.height, w: w / b.width, h: h / b.height };
            };
            const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
            addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
          };
        };
        bg.querySelector('#cr-ok').onclick = async () => {
          if (!r || r.w < 0.02 || r.h < 0.02) { close(); return; }
          const f = await db.get('files', it.fileId);
          const nb = await applyEdits(f.blob, { crop: r });
          const nf = uid();
          await db.put('files', { id: nf, blob: nb });
          it.fileId = nf; it.h = Math.round(it.w * r.h / r.w);
          close(); save(); draw();
        };
      }
    });
  }

  // 鍵盤：Ctrl+Z、Delete、Ctrl+V 貼圖
  document.onkeydown = e => {
    if (mode !== 'edit') return;
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); const prev = undoStack.pop(); if (prev) { items = JSON.parse(prev); save(); draw(); } }
    if (e.key === 'Delete' && sel) { push(); items = items.filter(i => i.id !== sel); sel = null; save(); draw(); }
  };
  document.onpaste = e => {
    if (mode !== 'edit') return;
    const fs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    fs.forEach(addImg);
  };
  const cvZone = () => document.getElementById('cv');
  app.ondragover = e => { if (mode === 'edit') e.preventDefault(); };
  app.ondrop = e => { if (mode !== 'edit') return; e.preventDefault(); [...e.dataTransfer.files].filter(f => f.type.startsWith('image/')).forEach(addImg); };

  draw();
  setNav();
}
