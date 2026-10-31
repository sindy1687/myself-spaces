// 文章模板註冊表
// 新增模板：在本資料夾建立一個檔案，匯出 { id, category, name, desc, blocks, order }，再加進下方 RICH 陣列即可。
//   blocks[type] = { label, html(), parent? }；parent 表示只能放在某區塊內（例如「景點」在「行程紀錄」裡）
import { TPL_STYLES, buildTemplate } from '../templates.js';
import travelLetter from './travel-letter.js';

// 分類顯示順序（之後的手帳、簡約、可愛、多彩、美食模板加入對應分類即可）
export const CATEGORIES = ['旅遊', '手帳', '簡約', '可愛', '多彩', '美食', '節日', '心情', '學習工作', '生活', '其他風格'];

const RICH = [travelLetter];

// 舊的「風格 × 區塊」模板，依風格歸到對應分類（遠方來信已由新版取代）
const LEGACY_CAT = { journal: '手帳', minimal: '簡約', cute: '可愛', colorful: '多彩', food: '美食', cafe: '美食' };
const LEGACY = TPL_STYLES.filter(s => s.id !== 'travel').map(s => ({
  id: 'legacy-' + s.id, legacyId: s.id, category: s.cat || LEGACY_CAT[s.id] || '其他風格',
  name: s.name.replace(/^\S+\s/, ''), desc: s.desc, legacy: true,
}));

export const TEMPLATES = [...RICH, ...LEGACY];
export const getTemplate = id => RICH.find(t => t.id === id);

// 產生整份模板 HTML
export function buildDoc(t, opts = {}) {
  if (t.legacy) return buildTemplate(t.legacyId, opts.blocks || ['cover', 'body', 'album', 'end'], opts.mode || 'fixed');
  const body = (t.order || Object.keys(t.blocks)).map(k => t.blocks[k].html()).join('\n');
  return `<section class="dt dt-${t.id}" data-tpl="${t.id}">\n${body}\n</section><p><br></p>`;
}
