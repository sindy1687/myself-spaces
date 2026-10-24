// 「套用模板」視窗：分類 → 縮圖卡片 → 選擇放置方式（不直接覆蓋既有內容）
import { esc, modal, toast, hydrateMedia } from '../util.js';
import { CATEGORIES, TEMPLATES, buildDoc } from './index.js';

const hasContent = ce => !!(ce.textContent.trim() || ce.querySelector('img,video,figure,.pz-item,table,hr'));

// range：開啟視窗前記下的游標位置（可為 null）
export function openTemplatePicker(ce, hist, range) {
  const cats = CATEGORIES.filter(c => TEMPLATES.some(t => t.category === c));
  const filled = hasContent(ce);
  let cat = cats[0], cur = TEMPLATES.find(t => t.category === cat);

  modal(`<h3>📋 套用模板</h3>
    <div class="tp-picker">
      <div class="tp-cats" role="tablist">${cats.map(c => `<button type="button" role="tab" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="tp-grid" id="tp-grid"></div>
    </div>
    <div class="tp-opts">
      <div id="tp-legacy" hidden>
        <div class="row" style="flex-wrap:wrap">區塊：${[['cover', '封面'], ['body', '內文'], ['album', '相簿'], ['end', '結尾']].map(([v, n]) => `<label><input type="checkbox" class="tp-bk" value="${v}" checked style="width:auto"> ${n}</label>`).join('')}</div>
        <div class="row" style="flex-wrap:wrap">照片：<label><input type="radio" name="tp-mode" value="fixed" checked style="width:auto"> 整齊排版</label><label><input type="radio" name="tp-mode" value="free" style="width:auto"> 自由拼貼</label></div>
      </div>
      ${filled ? `<p style="margin:.2rem 0"><b>文章已有內容</b>，要把模板放在哪裡？</p>
      <div class="row" style="flex-wrap:wrap;gap:.2rem 1rem">
        <label><input type="radio" name="tp-pos" value="end" checked style="width:auto"> 加在文章最後</label>
        <label><input type="radio" name="tp-pos" value="cursor" ${range ? '' : 'disabled'} style="width:auto"> 插入到游標所在段落後</label>
        <label><input type="radio" name="tp-pos" value="start" style="width:auto"> 放在文章最前面</label>
        <label><input type="radio" name="tp-pos" value="replace" style="width:auto"> 取代目前內容（可按 ↶ 復原）</label>
      </div>` : ''}
    </div>
    <div class="row" style="justify-content:flex-end;margin-top:.8rem"><button data-close>取消</button><button id="tp-ok" class="primary">套用</button></div>`, {
    onOpen(bg, close) {
      const grid = bg.querySelector('#tp-grid');
      const draw = () => {
        bg.querySelectorAll('[data-cat]').forEach(b => { b.classList.toggle('on', b.dataset.cat === cat); b.setAttribute('aria-selected', b.dataset.cat === cat); });
        grid.innerHTML = TEMPLATES.filter(t => t.category === cat).map(t => `
          <button type="button" class="tp-card ${t === cur ? 'on' : ''}" data-id="${esc(t.id)}" aria-pressed="${t === cur}">
            <div class="tp-thumb"><div class="tp-thumb-inner">${buildDoc(t)}</div></div>
            <b>${esc(t.name)}</b><small>${esc(t.desc || '')}</small>
          </button>`).join('');
        bg.querySelector('#tp-legacy').hidden = !cur?.legacy;
        bg.querySelector('#tp-ok').textContent = cur ? `套用「${cur.name}」` : '套用';
      };
      bg.querySelector('.tp-cats').onclick = e => {
        const b = e.target.closest('[data-cat]'); if (!b) return;
        cat = b.dataset.cat; cur = TEMPLATES.find(t => t.category === cat); draw();
      };
      grid.onclick = e => {
        const c = e.target.closest('.tp-card'); if (!c) return;
        cur = TEMPLATES.find(t => t.id === c.dataset.id); draw();
      };
      grid.ondblclick = e => { if (e.target.closest('.tp-card')) bg.querySelector('#tp-ok').click(); };
      draw();

      bg.querySelector('#tp-ok').onclick = () => {
        if (!cur) return;
        const html = buildDoc(cur, {
          blocks: [...bg.querySelectorAll('.tp-bk:checked')].map(b => b.value),
          mode: bg.querySelector('input[name=tp-mode]:checked')?.value,
        });
        const pos = filled ? bg.querySelector('input[name=tp-pos]:checked').value : 'replace';
        const frag = document.createRange().createContextualFragment(html);
        const first = frag.firstElementChild;
        hist.change(() => {
          if (pos === 'replace') ce.replaceChildren(frag);
          else if (pos === 'start') ce.prepend(frag);
          else if (pos === 'cursor' && range && ce.contains(range.startContainer)) {
            // 插在游標所在的「最上層段落」後面，避免模板被塞進段落裡
            let n = range.startContainer;
            if (n === ce) n = ce.childNodes[Math.max(0, range.startOffset - 1)] || null;
            while (n && n.parentNode !== ce) n = n.parentNode;
            if (n) n.after(frag); else ce.append(frag);
          } else ce.append(frag);
        });
        hydrateMedia(ce);
        close();
        first?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        toast(`已套用「${cur.name}」模板：點文字直接修改，點照片框加入照片`, 'success');
      };
    }
  });
}
