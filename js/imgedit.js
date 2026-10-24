// 圖片編輯：裁切、旋轉、翻轉、亮度/對比/飽和度、濾鏡（Canvas）
export function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

export async function applyEdits(srcBlob, edits) {
  const url = URL.createObjectURL(srcBlob);
  try {
    const img = await loadImg(url);
    const rot = ((edits.rotate || 0) % 360 + 360) % 360;
    const swap = rot === 90 || rot === 270;
    const cw = swap ? img.height : img.width;
    const ch = swap ? img.width : img.height;
    const c = document.createElement('canvas');
    const crop = edits.crop || null; // {x,y,w,h} 0~1 比例（旋轉後座標）
    c.width = crop ? Math.round(cw * crop.w) : cw;
    c.height = crop ? Math.round(ch * crop.h) : ch;
    const ctx = c.getContext('2d');
    const f = [];
    if (edits.brightness !== undefined && edits.brightness !== 100) f.push(`brightness(${edits.brightness}%)`);
    if (edits.contrast !== undefined && edits.contrast !== 100) f.push(`contrast(${edits.contrast}%)`);
    if (edits.saturate !== undefined && edits.saturate !== 100) f.push(`saturate(${edits.saturate}%)`);
    const FILTERS = { none: '', grayscale: 'grayscale(100%)', sepia: 'sepia(90%)', warm: 'sepia(35%) saturate(120%)', cool: 'hue-rotate(15deg) saturate(90%)', bw: 'grayscale(100%) contrast(120%)' };
    if (edits.filter && FILTERS[edits.filter]) f.push(FILTERS[edits.filter]);
    if (f.length) ctx.filter = f.join(' ');
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate(rot * Math.PI / 180);
    ctx.scale(edits.flipH ? -1 : 1, edits.flipV ? -1 : 1);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
    if (crop) {
      const out = document.createElement('canvas');
      out.width = c.width; out.height = c.height;
      out.getContext('2d').drawImage(c, Math.round(cw * crop.x), Math.round(ch * crop.y), Math.round(cw * crop.w), Math.round(ch * crop.h), 0, 0, out.width, out.height);
      return new Promise(res => out.toBlob(res, 'image/png'));
    }
    return new Promise(res => c.toBlob(res, 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

export const IMAGE_LIMIT = { maxSize: 15 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/bmp'] };
export function validateImage(file) {
  if (!IMAGE_LIMIT.types.includes(file.type)) return `不支援的格式 ${file.type || file.name}（支援 JPG/PNG/GIF/WebP/AVIF/BMP）`;
  if (file.size > IMAGE_LIMIT.maxSize) return `「${file.name}」超過 15MB 上限`;
  return null;
}

// 上傳前縮小：EXIF 方向、等比例、品質、透明背景
// 回傳 {blob, width, height, size, format} ；GIF 動畫不縮（回傳 original）
export async function resizeImageFile(file, { maxSide = 1920, quality = 85, format = 'keep', bg = '#ffffff' } = {}) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width: w, height: h } = bmp;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const ow = Math.round(w * scale), oh = Math.round(h * scale);
  const keepAlpha = format === 'keep' && /png|webp|gif/i.test(file.type);
  const outType = format === 'keep' ? (file.type === 'image/gif' ? 'image/gif' : file.type) : format;
  const c = document.createElement('canvas');
  c.width = ow; c.height = oh;
  const ctx = c.getContext('2d');
  if (!keepAlpha && outType === 'image/jpeg') { ctx.fillStyle = bg; ctx.fillRect(0, 0, ow, oh); }
  ctx.drawImage(bmp, 0, 0, ow, oh);
  bmp.close();
  const q = (outType === 'image/jpeg' || outType === 'image/webp') ? quality / 100 : undefined;
  const blob = await new Promise(res => c.toBlob(res, outType, q));
  return { blob, width: ow, height: oh, size: blob.size, format: outType };
}
