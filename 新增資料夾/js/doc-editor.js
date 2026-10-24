// 文章編輯器的「模板區塊＋照片區」互動層
// - 照片：點選顯示外框與浮動工具列；四角等比例縮放、旋轉把手、移動、裁切、複製、刪除、圖層、鎖定
// - 照片區：整齊排版（跟著文章流動）/ 自由拼貼（在區內任意擺放，位置以 % 儲存，手機電腦等比例）
// - 模板區塊：新增、刪除、複製、上下排序
// - 選檔、拖入、Ctrl+V 貼上圖片
// 外框與工具列畫在 body 上的浮層（不寫進文章內容），所以儲存的 HTML 是乾淨的。
import { esc, uid, toast, modal } from './util.js';
import { photoItem } from './doc-templates/parts.js';
import { getTemplate } from './doc-templates/index.js';
import { resizeImageFile, validateImage } from './imgedit.js';
import { db } from './db.js';

const pct = n => +(+n).toFixed(2);
const num = (s, d = 0) => { const v = parseFloat(s); return Number.isFinite(v) ? v : d; };
const clamp = (v, a, b) => Math.min(Math.max(v, a), Math.max(a, b));
const getRot = el => num((/rotate\((-?[\d.]+)deg\)/.exec(el.style.transform) || [])[1]);
const setRot = (el, a) => { a = ((a % 360) + 540) % 360 - 180; el.style.transform = Math.abs(a) > 0.05 ? `rotate(${+a.toFixed(1)}deg)` : ''; };
const isLocked = el => el?.dataset.lock === '1';
const isFree = z => z?.dataset.layout === 'free';
const itemsOf = z => [...z.children].filter(c => c.classList.contains('pz-item'));
const autoW = n => n <= 1 ? 100 : n === 2 ? 49 : 32; // 整齊排版：1～3 欄的預設寬度（間距 2%）

// 存一張圖片到本機媒體庫，回傳 { fid, url }
export async function storeImage(file) {
  const err = validateImage(file);
  if (err) { toast(err, 'error'); return null; }
  let blob = file;
  if (!/gif/i.test(file.type)) {
    try { blob = (await resizeImageFile(file, { maxSide: 1920, quality: 85 })).blob || file; } catch { /* 無法縮圖就存原檔 */ }
  }
  const fid = uid();
  await db.put('files', { id: fid, blob });
  return { fid, url: URL.createObjectURL(blob) };
}

const pickFiles = (multiple = true) => new Promise(res => {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = multiple;
  inp.onchange = () => res([...inp.files]);
  inp.click();
});

export function attachDocEditor(ce, hist) {
  ce.classList.add('doc-editing');
  const root = document.createElement('div');
  root.className = 'de-root';
  root.innerHTML = `
    <div class="de-frame" hidden></div>
    <div class="de-zonebox" hidden></div>
    <div class="de-box" hidden><i class="de-h nw" data-h="nw"></i><i class="de-h ne" data-h="ne"></i><i class="de-h sw" data-h="sw"></i><i class="de-h se" data-h="se"></i><i class="de-rot" data-h="rot" title="拖曳旋轉"></i></div>
    <div class="de-tools" hidden role="toolbar" aria-label="圖片工具"></div>
    <div class="de-blockbar" hidden role="toolbar" aria-label="區塊工具"></div>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const box = $('.de-box'), zbox = $('.de-zonebox'), tools = $('.de-tools'), bbar = $('.de-blockbar'), frame = $('.de-frame');
  let item = null, zone = null, block = null, dragging = false;

  // ---------- 選取 ----------
  function select(it) { item = it; zone = it.closest('.pz'); block = it.closest('.tb'); renderTools(); renderBlockBar(); }
  function selectZone(z) { item = null; zone = z; block = z.closest('.tb'); renderTools(); renderBlockBar(); }
  function deselect() { if (!item && !zone) return; item = null; zone = null; renderTools(); }

  // ---------- 工具列 ----------
  function renderTools() {
    if (!zone) { tools.hidden = true; return; }
    const free = isFree(zone), locked = isLocked(item);
    const n = itemsOf(zone).length;
    const ratio = (zone.style.aspectRatio || '4 / 3').replace(/\s/g, '');
    const itemRow = !item ? '' : locked
      ? `<div class="de-row"><span class="de-tag">🔒 已鎖定</span><button data-a="lock">🔓 解除鎖定</button></div>`
      : `<div class="de-row">
          <button data-a="rotL" title="向左轉 90°">⟲</button><button data-a="rotR" title="向右轉 90°">⟳</button>
          <label title="旋轉角度">角度<input data-in="rot" type="number" step="1" min="-180" max="180" value="${Math.round(getRot(item))}"></label>
          <label title="寬度（像素），等比例縮放">寬<input data-in="w" type="number" step="10" min="30" value="${Math.round(item.offsetWidth)}">px</label>
        </div>
        <div class="de-row">
          <button data-a="crop">✂ 裁切</button><button data-a="dup">⧉ 複製</button>
          ${free ? '<button data-a="front" title="上移一層">⬆ 上層</button><button data-a="back" title="下移一層">⬇ 下層</button>'
                 : '<button data-a="back" title="往前移">◀ 往前</button><button data-a="front" title="往後移">往後 ▶</button>'}
          <button data-a="lock" title="鎖定後不會被移動或縮放">🔒 鎖定</button><button data-a="del" class="de-danger">🗑 刪除</button>
        </div>`;
    tools.innerHTML = `${itemRow}
      <div class="de-row de-zone-row">
        <span class="de-tag">照片區</span>
        <button data-a="add">＋ 加入照片</button>
        <button data-a="flow" class="${free ? '' : 'on'}" title="照片跟著文章排列">整齊排版</button>
        <button data-a="free" class="${free ? 'on' : ''}" title="照片可在區內自由擺放">自由拼貼</button>
        ${free ? `<label>比例<select data-in="ratio">${[['1/1', '1:1 方形'], ['4/3', '4:3'], ['3/2', '3:2'], ['16/9', '16:9 寬'], ['3/4', '3:4 直'], ['2/3', '2:3 直']].map(([v, l]) => `<option value="${v}" ${v === ratio ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`
               : n > 1 ? `<span class="de-tag">欄數</span>${[1, 2, 3].map(c => `<button data-a="cols" data-v="${c}">${c}</button>`).join('')}` : ''}
      </div>`;
    tools.hidden = false;
    place();
  }

  tools.addEventListener('pointerdown', e => { if (!e.target.closest('input,select')) e.preventDefault(); });
  tools.addEventListener('click', e => {
    const b = e.target.closest('button[data-a]'); if (!b || !zone) return;
    const a = b.dataset.a;
    if (a === 'add') return addFromPicker(zone);
    if (a === 'crop') return cropItem(item);
    hist.change(() => {
      if (a === 'rotL' || a === 'rotR') { setRot(item, getRot(item) + (a === 'rotL' ? -90 : 90)); fitInside(item); }
      if (a === 'dup') {
        const cp = item.cloneNode(true);
        cp.removeAttribute('data-lock');
        if (isFree(zone)) { cp.style.left = pct(num(item.style.left) + 4) + '%'; cp.style.top = pct(num(item.style.top) + 4) + '%'; cp.style.zIndex = maxZ(zone) + 1; }
        item.after(cp); item = cp; fitInside(cp);
      }
      if (a === 'front' || a === 'back') layer(item, a === 'front' ? 1 : -1);
      if (a === 'lock') { if (isLocked(item)) item.removeAttribute('data-lock'); else item.dataset.lock = '1'; }
      if (a === 'del') { const z = zone; item.remove(); item = null; zone = z; }
      if (a === 'flow' || a === 'free') setLayout(zone, a);
      if (a === 'cols') { const w = autoW(+b.dataset.v); itemsOf(zone).forEach(i => { i.style.width = w + '%'; }); }
    });
    renderTools();
  });
  tools.addEventListener('change', e => {
    const k = e.target.dataset.in; if (!k || !zone) return;
    hist.change(() => {
      if (k === 'rot' && item) { setRot(item, clamp(num(e.target.value), -180, 180)); fitInside(item); }
      if (k === 'w' && item) { item.style.width = pct(clamp(num(e.target.value) / zone.clientWidth * 100, 5, 100)) + '%'; fitInside(item); }
      if (k === 'ratio') { zone.style.aspectRatio = e.target.value; itemsOf(zone).forEach(fitInside); }
    });
    renderTools();
  });

  // 圖層：自由拼貼＝z-index（重新編號 1..n）；整齊排版＝前後順序
  const maxZ = z => Math.max(0, ...itemsOf(z).map(i => num(i.style.zIndex)));
  function layer(it, d) {
    const z = it.closest('.pz');
    if (!isFree(z)) {
      if (d < 0 && it.previousElementSibling) it.previousElementSibling.before(it);
      if (d > 0 && it.nextElementSibling) it.nextElementSibling.after(it);
      return;
    }
    const order = itemsOf(z).sort((a, b) => num(a.style.zIndex) - num(b.style.zIndex));
    const i = order.indexOf(it), j = clamp(i + d, 0, order.length - 1);
    order.splice(i, 1); order.splice(j, 0, it);
    order.forEach((el, k) => { el.style.zIndex = k + 1; });
  }

  // 切換排版模式：保持畫面上的相對位置
  function setLayout(z, mode) {
    if ((mode === 'free') === isFree(z)) return;
    const its = itemsOf(z);
    if (mode === 'free') {
      const W = z.clientWidth, H = Math.max(z.clientHeight, W * 0.5);
      const pos = its.map(i => ({ i, l: i.offsetLeft / W * 100, t: i.offsetTop / H * 100 }));
      z.dataset.layout = 'free';
      z.style.aspectRatio = `${Math.round(W)}/${Math.round(H)}`;
      pos.forEach(({ i, l, t }, k) => { i.style.left = pct(l) + '%'; i.style.top = pct(t) + '%'; i.style.zIndex = k + 1; });
      its.forEach(fitInside);
    } else {
      its.sort((a, b) => num(a.style.top) - num(b.style.top) || num(a.style.left) - num(b.style.left))
        .forEach(i => { i.style.removeProperty('left'); i.style.removeProperty('top'); i.style.removeProperty('z-index'); z.appendChild(i); });
      z.dataset.layout = 'flow';
      z.style.removeProperty('aspect-ratio');
      if (!z.getAttribute('style')) z.removeAttribute('style');
    }
  }

  // 自由拼貼：確保照片（含旋轉後的外角）完整留在照片區內，不超出、不蓋到區外文字
  // left/top 存的是未旋轉的方框位置；以旋轉後外接框的大小限制中心點
  function placeInZone(it, left, top) {
    const z = it.closest('.pz'), W = z.clientWidth, H = z.clientHeight;
    const a = getRot(it) * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    const w = it.offsetWidth, h = it.offsetHeight;
    const bw = w * c + h * s, bh = w * s + h * c;
    const cx = clamp(left / 100 * W + w / 2, bw / 2, W - bw / 2), cy = clamp(top / 100 * H + h / 2, bh / 2, H - bh / 2);
    it.style.left = pct((cx - w / 2) / W * 100) + '%';
    it.style.top = pct((cy - h / 2) / H * 100) + '%';
  }
  function fitInside(it) {
    const z = it.closest('.pz');
    if (!isFree(z) || !z.clientWidth || !z.clientHeight) return;
    // 太大放不下 → 等比例縮小到剛好放得下
    const a = getRot(it) * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    const w = it.offsetWidth, h = it.offsetHeight;
    const k = Math.min(1, z.clientWidth / (w * c + h * s), z.clientHeight / (w * s + h * c));
    if (k < 1) it.style.width = pct(num(it.style.width) * k * 0.98) + '%';
    placeInZone(it, num(it.style.left), num(it.style.top));
  }

  // ---------- 加入照片 ----------
  async function addFiles(z, files, at = null) {
    files = files.filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    const stored = [];
    for (const f of files) { const s = await storeImage(f); if (s) stored.push(s); }
    if (!stored.length) return;
    let last = null;
    hist.change(() => {
      for (const s of stored) {
        const n = itemsOf(z).length;
        let html;
        if (isFree(z)) {
          const w = n ? 38 : 48;
          const zr = z.getBoundingClientRect();
          const l = at ? (at.x - zr.left) / zr.width * 100 - w / 2 : 6 + (n * 9) % 50;
          const t = at ? (at.y - zr.top) / zr.height * 100 - 15 : 6 + (n * 11) % 45;
          html = photoItem(s.fid, { width: w, left: l, top: t, z: maxZ(z) + 1, rotate: Math.round(Math.random() * 8 - 4) });
        } else {
          // 還沒手動調過寬度時，自動分成 1～3 欄
          const its = itemsOf(z), auto = its.every(i => num(i.style.width) === autoW(n));
          if (auto) its.forEach(i => { i.style.width = autoW(Math.min(n + 1, 3)) + '%'; });
          html = photoItem(s.fid, { width: auto ? autoW(Math.min(n + 1, 3)) : num(its.at(-1)?.style.width, 100) });
        }
        z.insertAdjacentHTML('beforeend', html);
        last = z.lastElementChild;
        const img = last.querySelector('img');
        img.src = s.url;
        img.addEventListener('load', () => { fitInside(img.closest('.pz-item')); place(); }, { once: true });
      }
    });
    if (last) select(last);
    toast(`已加入 ${stored.length} 張照片`, 'success');
  }
  const addFromPicker = async z => addFiles(z, await pickFiles(true));

  // 文章一般位置：插入行內圖片
  async function insertInline(files, range) {
    const stored = [];
    for (const f of files.filter(f => f.type.startsWith('image/'))) { const s = await storeImage(f); if (s) stored.push(s); }
    if (!stored.length) return;
    hist.change(() => {
      ce.focus();
      if (range) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); }
      document.execCommand('insertHTML', false, stored.map(s => `<img data-fid="${s.fid}" src="${s.url}" alt="" style="max-width:100%">`).join(''));
    });
  }

  // ---------- 裁切 ----------
  async function cropItem(it) {
    const img = it?.querySelector('img'), fid = img?.dataset.fid;
    const f = fid && await db.get('files', fid);
    if (!f?.blob) return toast('這張圖片無法裁切（找不到本機檔案）', 'error');
    const url = URL.createObjectURL(f.blob);
    modal(`<h3>✂ 裁切照片</h3>
      <div class="row" style="flex-wrap:wrap;gap:.3rem">比例：${[['', '自由'], ['1', '1:1'], ['1.3333', '4:3'], ['0.75', '3:4'], ['1.7778', '16:9']].map(([v, l], i) => `<button type="button" class="cr-r ${i ? '' : 'primary'}" data-r="${v}">${l}</button>`).join('')}</div>
      <p class="muted" style="margin:.3rem 0">拖曳框內移動、拖曳右下角調整大小，或在圖上重新框選。</p>
      <div class="cr-wrap"><img src="${url}" alt="" draggable="false"><div class="cr-rect"><i class="cr-h"></i></div></div>
      <div class="row" style="justify-content:flex-end;margin-top:.6rem"><button data-close>取消</button><button id="cr-ok" class="primary">套用裁切</button></div>`, {
      onOpen(bg, close) {
        const wrap = bg.querySelector('.cr-wrap'), pic = wrap.querySelector('img'), rect = wrap.querySelector('.cr-rect');
        let r = { x: .05, y: .05, w: .9, h: .9 }, ratio = 0;
        const draw = () => Object.assign(rect.style, { left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' });
        const applyRatio = () => {
          if (!ratio) return;
          const ar = pic.naturalWidth / pic.naturalHeight; // 寬高比換成比例座標
          let w = r.w, h = w * ar / ratio;
          if (h > 1) { h = .9; w = h * ratio / ar; }
          r = { x: clamp(r.x, 0, 1 - w), y: clamp(r.y, 0, 1 - h), w, h };
        };
        pic.onload = draw; draw();
        bg.querySelectorAll('.cr-r').forEach(b => b.onclick = () => {
          bg.querySelectorAll('.cr-r').forEach(x => x.classList.toggle('primary', x === b));
          ratio = +b.dataset.r || 0; applyRatio(); draw();
        });
        wrap.addEventListener('pointerdown', e => {
          e.preventDefault();
          const b = pic.getBoundingClientRect();
          const px = (e.clientX - b.left) / b.width, py = (e.clientY - b.top) / b.height;
          const r0 = { ...r };
          const mode = e.target.classList.contains('cr-h') ? 'size' : e.target === rect ? 'move' : 'new';
          const mv = ev => {
            const x = clamp((ev.clientX - b.left) / b.width, 0, 1), y = clamp((ev.clientY - b.top) / b.height, 0, 1);
            if (mode === 'move') r = { ...r0, x: clamp(r0.x + x - px, 0, 1 - r0.w), y: clamp(r0.y + y - py, 0, 1 - r0.h) };
            else {
              const ox = mode === 'size' ? r0.x : Math.min(px, x), oy = mode === 'size' ? r0.y : Math.min(py, y);
              let w = mode === 'size' ? x - r0.x : Math.abs(x - px), h = mode === 'size' ? y - r0.y : Math.abs(y - py);
              if (ratio) h = w * (pic.naturalWidth / pic.naturalHeight) / ratio;
              r = { x: ox, y: oy, w: clamp(w, .03, 1 - ox), h: clamp(h, .03, 1 - oy) };
            }
            draw();
          };
          const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
          addEventListener('pointermove', mv); addEventListener('pointerup', up);
        });
        bg.querySelector('#cr-ok').onclick = async () => {
          const W = pic.naturalWidth, H = pic.naturalHeight;
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(W * r.w)); c.height = Math.max(1, Math.round(H * r.h));
          c.getContext('2d').drawImage(pic, Math.round(W * r.x), Math.round(H * r.y), c.width, c.height, 0, 0, c.width, c.height);
          const type = /png|gif|webp/.test(f.blob.type) ? 'image/png' : 'image/jpeg';
          const nb = await new Promise(res => c.toBlob(res, type, .9));
          const nf = uid();
          await db.put('files', { id: nf, blob: nb }); // 原檔保留，不覆蓋
          hist.change(() => { img.dataset.fid = nf; img.src = URL.createObjectURL(nb); });
          img.addEventListener('load', () => { fitInside(it); place(); renderTools(); }, { once: true });
          URL.revokeObjectURL(url); close(); toast('已裁切', 'success');
        };
      }
    });
  }

  // ---------- 拖曳：移動／縮放／旋轉 ----------
  function drag(e, onMove, onEnd) {
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    hist.record();
    dragging = true;
    const mv = ev => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true; ev.preventDefault();
      onMove(ev.clientX - sx, ev.clientY - sy, ev);
      place();
    };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      dragging = false;
      if (moved) { onEnd?.(); hist.change(() => {}); renderTools(); }
    };
    addEventListener('pointermove', mv, { passive: false }); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }

  function startMove(e, it) {
    const z = it.closest('.pz');
    if (isFree(z)) {
      const W = z.clientWidth, H = z.clientHeight, l0 = num(it.style.left), t0 = num(it.style.top);
      drag(e, (dx, dy) => placeInZone(it, l0 + dx / W * 100, t0 + dy / H * 100));
    } else {
      // 整齊排版：拖到其他照片上換位置
      box.classList.add('dragging');
      drag(e, (dx, dy, ev) => {
        const tgt = itemsOf(z).find(o => { if (o === it) return false; const b = o.getBoundingClientRect(); return ev.clientX >= b.left && ev.clientX <= b.right && ev.clientY >= b.top && ev.clientY <= b.bottom; });
        if (!tgt) return;
        const b = tgt.getBoundingClientRect();
        if (ev.clientX < b.left + b.width / 2) tgt.before(it); else tgt.after(it);
      }, () => box.classList.remove('dragging'));
      addEventListener('pointerup', () => box.classList.remove('dragging'), { once: true });
    }
  }

  function startResize(e, it, h) {
    const z = it.closest('.pz');
    const W = z.clientWidth, H = z.clientHeight || 1, w0 = it.offsetWidth, h0 = it.offsetHeight;
    const l0 = num(it.style.left), t0 = num(it.style.top), a = getRot(it) * Math.PI / 180;
    const sx = h.includes('e') ? 1 : -1, sy = h.includes('s') ? 1 : -1;
    drag(e, (dx, dy) => {
      const lx = dx * Math.cos(a) + dy * Math.sin(a), ly = -dx * Math.sin(a) + dy * Math.cos(a);
      const byX = sx * lx, byY = sy * ly * (w0 / h0);
      const nw = clamp(w0 + (Math.abs(byX) > Math.abs(byY) ? byX : byY), 30, W);
      it.style.width = pct(nw / W * 100) + '%';
      if (isFree(z)) {
        const nh = h0 * nw / w0;
        if (sx < 0) it.style.left = pct(l0 + (w0 - nw) / W * 100) + '%';
        if (sy < 0) it.style.top = pct(t0 + (h0 - nh) / H * 100) + '%';
        fitInside(it);
      }
    });
  }

  function startRotate(e, it) {
    const b = it.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    drag(e, (dx, dy, ev) => {
      let deg = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90;
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
      else if (Math.abs(((deg + 540) % 360) - 180) < 3) deg = 0; // 接近水平時吸附
      setRot(it, deg); fitInside(it);
    });
  }

  box.addEventListener('pointerdown', e => {
    if (!item) return;
    e.preventDefault(); e.stopPropagation();
    if (isLocked(item)) return;
    const h = e.target.dataset.h;
    if (h === 'rot') startRotate(e, item);
    else if (h) startResize(e, item, h);
    else startMove(e, item);
  });

  // 文章內點擊：選照片／照片區
  ce.addEventListener('pointerdown', e => {
    const it = e.target.closest('.pz-item'), z = e.target.closest('.pz');
    if (it && ce.contains(it)) {
      e.preventDefault();
      select(it);
      if (!isLocked(it) && (isFree(it.closest('.pz')) || e.pointerType === 'mouse')) startMove(e, it);
      return;
    }
    if (z && ce.contains(z)) { e.preventDefault(); selectZone(z); return; }
    deselect();
  }, true);
  ce.addEventListener('dragstart', e => { if (e.target.closest?.('.pz')) e.preventDefault(); });
  ce.addEventListener('dblclick', e => { const z = e.target.closest('.pz'); if (z && !e.target.closest('.pz-item')) addFromPicker(z); });

  // 點文章與工具以外的地方 → 取消選取
  const onDocDown = e => { if (!root.contains(e.target) && !ce.contains(e.target) && !e.target.closest('.modal-bg ~ .modal-bg')) deselect(); };
  document.addEventListener('pointerdown', onDocDown, true);

  // ---------- 鍵盤 ----------
  const onKey = e => {
    if (!ce.isConnected) return;
    const inField = /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
    const inEditor = ce.contains(e.target) || ((item || zone) && !inField && !e.target.closest('.modal-bg ~ .modal-bg'));
    if (topModal() !== ce.closest('.modal-bg')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && inEditor && !inField && (k === 'z' || k === 'y')) {
      e.preventDefault();
      if (k === 'y' || e.shiftKey) hist.redo(); else hist.undo();
      return;
    }
    if (!item || inField || ce.contains(e.target) && getSelection().toString()) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && !isLocked(item)) {
      e.preventDefault(); const z = zone; hist.change(() => item.remove()); item = null; zone = z; renderTools();
    } else if (e.key === 'Escape') { deselect(); }
    else if (e.key.startsWith('Arrow') && isFree(zone) && !isLocked(item)) {
      e.preventDefault();
      const s = e.shiftKey ? 2 : .5, dx = { ArrowLeft: -s, ArrowRight: s }[e.key] || 0, dy = { ArrowUp: -s, ArrowDown: s }[e.key] || 0;
      hist.change(() => { item.style.left = pct(num(item.style.left) + dx) + '%'; item.style.top = pct(num(item.style.top) + dy) + '%'; fitInside(item); });
    }
  };
  document.addEventListener('keydown', onKey, true);

  // ---------- 貼上／拖入圖片 ----------
  const onPaste = e => {
    if (!ce.isConnected || topModal() !== ce.closest('.modal-bg')) return;
    const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    const target = zone || null;
    if (!target && !ce.contains(e.target)) return;
    e.preventDefault();
    if (target) addFiles(target, files);
    else insertInline(files, getSelection().rangeCount ? getSelection().getRangeAt(0).cloneRange() : null);
  };
  document.addEventListener('paste', onPaste, true);
  ce.addEventListener('dragover', e => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault();
    const z = e.target.closest?.('.pz');
    zbox.classList.toggle('drop', !!z);
    if (z) showRect(zbox, z.getBoundingClientRect()); else zbox.hidden = true;
  });
  ce.addEventListener('dragleave', () => { zbox.classList.remove('drop'); });
  ce.addEventListener('drop', e => {
    const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
    zbox.classList.remove('drop');
    if (!files.length) return;
    e.preventDefault();
    const z = e.target.closest?.('.pz');
    if (z) { selectZone(z); addFiles(z, files, { x: e.clientX, y: e.clientY }); return; }
    const range = document.caretRangeFromPoint?.(e.clientX, e.clientY) || null;
    insertInline(files, range);
  });

  // ---------- 模板區塊：新增／刪除／複製／排序 ----------
  const tplOf = el => getTemplate(el?.closest('section.dt')?.dataset.tpl);
  function currentBlock() {
    const sel = getSelection();
    const n = sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
    const el = n && (n.nodeType === 1 ? n : n.parentElement);
    return el && ce.contains(el) ? el.closest('.tb') : null;
  }
  const onSel = () => { if (dragging || !ce.isConnected) return; const b = currentBlock(); if (b && b !== block) { block = b; renderBlockBar(); } };
  document.addEventListener('selectionchange', onSel);

  function renderBlockBar() {
    const t = tplOf(block);
    if (!block || !t || !ce.contains(block)) { bbar.hidden = true; frame.hidden = true; return; }
    const type = block.dataset.tb, def = t.blocks[type] || {};
    // 可新增：景點（在行程紀錄裡）＋所有頂層區塊
    const addable = Object.entries(t.blocks).filter(([k, v]) => v.parent ? (type === v.parent || def.parent === v.parent) : true);
    bbar.innerHTML = `<span class="de-tag">${esc(def.label || '區塊')}</span>
      <button data-b="up" title="上移">↑</button><button data-b="down" title="下移">↓</button>
      <button data-b="dup" title="複製這個區塊">⧉</button><button data-b="del" class="de-danger" title="刪除這個區塊">🗑</button>
      <select data-b="add" title="在後面新增區塊"><option value="">＋ 新增…</option>${addable.map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select>`;
    bbar.hidden = false;
    place();
  }
  bbar.addEventListener('pointerdown', e => { if (!e.target.closest('select')) e.preventDefault(); });
  bbar.addEventListener('click', e => {
    const b = e.target.closest('button[data-b]'); if (!b || !block) return;
    const a = b.dataset.b, same = el => el && el.classList.contains('tb');
    hist.change(() => {
      if (a === 'up' && same(block.previousElementSibling)) block.previousElementSibling.before(block);
      if (a === 'down' && same(block.nextElementSibling)) block.nextElementSibling.after(block);
      if (a === 'dup') { const cp = block.cloneNode(true); block.after(cp); block = cp; }
      if (a === 'del') {
        const nb = block.nextElementSibling?.classList.contains('tb') ? block.nextElementSibling : block.previousElementSibling?.classList.contains('tb') ? block.previousElementSibling : null;
        if (item && block.contains(item)) { item = null; zone = null; renderTools(); }
        block.remove(); block = nb;
        toast('已刪除區塊（可按 ↶ 復原）');
      }
    });
    renderBlockBar();
    block?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  bbar.addEventListener('change', e => {
    const k = e.target.value; if (!k || !block) return;
    const t = tplOf(block), def = t.blocks[k];
    const tmp = document.createElement('div');
    tmp.innerHTML = def.html().trim();
    const nb = tmp.firstElementChild;
    hist.change(() => {
      if (def.parent) {
        // 景點：放在目前景點後面，或行程紀錄的最後
        if (block.dataset.tb === def.parent) block.appendChild(nb); else block.after(nb);
      } else {
        // 頂層區塊：從景點跳到所屬的頂層區塊再插入
        const top = block.parentElement.closest('.tb') && block.parentElement.matches('.tb') ? block.parentElement : block;
        top.after(nb);
      }
    });
    block = nb; renderBlockBar();
    nb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    toast(`已新增「${def.label}」`, 'success');
  });

  // ---------- 浮層定位 ----------
  const topModal = () => [...document.querySelectorAll('.modal-bg')].at(-1) || null;
  function showRect(el, r) { Object.assign(el.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); el.hidden = false; }
  function place() {
    const myModal = ce.closest('.modal-bg');
    const covered = myModal && topModal() !== myModal;
    root.style.visibility = covered ? 'hidden' : '';
    // 只在編輯區（可捲動的視窗）內顯示，避免浮在其他地方
    const clip = (ce.closest('.modal') || ce).getBoundingClientRect();
    root.style.clipPath = `inset(${Math.max(0, clip.top)}px ${Math.max(0, innerWidth - clip.right)}px ${Math.max(0, innerHeight - clip.bottom)}px ${Math.max(0, clip.left)}px)`;

    if (item && !item.isConnected) { item = null; renderTools(); }
    if (zone && !zone.isConnected) { zone = null; renderTools(); }
    if (block && !block.isConnected) { block = null; renderBlockBar(); }

    if (item) {
      const zr = zone.getBoundingClientRect();
      Object.assign(box.style, {
        left: zr.left + zone.clientLeft + item.offsetLeft + 'px', top: zr.top + zone.clientTop + item.offsetTop + 'px',
        width: item.offsetWidth + 'px', height: item.offsetHeight + 'px', transform: item.style.transform || '',
      });
      box.classList.toggle('locked', isLocked(item));
      box.hidden = false;
    } else box.hidden = true;
    if (zone && !zbox.classList.contains('drop')) showRect(zbox, zone.getBoundingClientRect());
    else if (!zone && !zbox.classList.contains('drop')) zbox.hidden = true;

    if (!tools.hidden && zone && innerWidth < 640) {
      // 手機：工具列固定在編輯視窗底部，不蓋住正在調整的照片
      const vb = Math.min(clip.bottom, innerHeight);
      Object.assign(tools.style, { left: Math.max(clip.left, 0) + 4 + 'px', width: Math.min(clip.right, innerWidth) - Math.max(clip.left, 0) - 8 + 'px', maxWidth: 'none' });
      tools.style.top = vb - tools.offsetHeight - 4 + 'px';
      tools.classList.add('docked');
    } else if (!tools.hidden && zone) {
      tools.classList.remove('docked');
      tools.style.width = ''; tools.style.maxWidth = Math.max(200, clip.width - 8) + 'px';
      const ref = (item || zone).getBoundingClientRect();
      const th = tools.offsetHeight, tw = tools.offsetWidth;
      let top = ref.top - th - 14;
      if (top < clip.top + 4) top = Math.min(ref.bottom + 14, clip.bottom - th - 4);
      const left = clamp(ref.left + ref.width / 2 - tw / 2, Math.max(clip.left, 0) + 4, Math.min(clip.right, innerWidth) - tw - 4);
      Object.assign(tools.style, { top: top + 'px', left: left + 'px' });
    }
    if (block && !bbar.hidden) {
      const r = block.getBoundingClientRect();
      showRect(frame, r);
      const bw = bbar.offsetWidth;
      Object.assign(bbar.style, { top: clamp(r.top - bbar.offsetHeight - 2, clip.top + 2, r.bottom - bbar.offsetHeight) + 'px', left: clamp(r.right - bw, clip.left + 4, innerWidth - bw - 4) + 'px' });
    } else frame.hidden = true;
  }

  // 持續追蹤（捲動、改視窗大小、圖片載入），編輯器關閉時自動清除
  let raf = 0;
  const loop = () => {
    if (!ce.isConnected) return destroy();
    if (item || zone || block) place();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  function destroy() {
    cancelAnimationFrame(raf);
    root.remove();
    document.removeEventListener('pointerdown', onDocDown, true);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('paste', onPaste, true);
    document.removeEventListener('selectionchange', onSel);
  }

  return {
    get selected() { return item; },
    onRestore() { item = null; zone = null; block = null; renderTools(); renderBlockBar(); },
    destroy,
  };
}
