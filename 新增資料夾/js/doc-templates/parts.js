// 模板共用零件
import { esc } from '../util.js';

// 照片區：layout = flow（整齊排版，跟著文章流動）/ free（自由拼貼，可在區內任意移動）
// ratio 只在 free 模式使用（區塊高度＝寬度 × 比例，手機與電腦等比例縮放）
export function photoZone({ layout = 'flow', ratio = '4/3', cls = '', label = '照片' } = {}) {
  const style = layout === 'free' ? ` style="aspect-ratio:${ratio}"` : '';
  return `<div class="pz${cls ? ' ' + cls : ''}" data-layout="${layout}" contenteditable="false" title="${esc(label)}"${style}></div>`;
}

// 照片項目（figure.pz-item）
export function photoItem(fid, { width = 100, left = null, top = null, z = null, rotate = 0, alt = '' } = {}) {
  const st = [`width:${+width.toFixed(2)}%`];
  if (left != null) st.push(`left:${+left.toFixed(2)}%`, `top:${+top.toFixed(2)}%`);
  if (z != null) st.push(`z-index:${z}`);
  if (rotate) st.push(`transform:rotate(${rotate}deg)`);
  return `<figure class="pz-item" contenteditable="false" style="${st.join(';')}"><img data-fid="${esc(fid)}" alt="${esc(alt)}"></figure>`;
}
