// 文章風格模板：18＋48 種風格 × 4 區塊，風格與排版分開選
import { esc, uid } from './util.js';
import { MORE_STYLES } from './templates-more.js';

const PH = n => `<figure class="ph" data-ph="${esc(n)}" contenteditable="false" style="border:2px dashed var(--border);border-radius:10px;padding:1.6em;text-align:center;color:var(--muted);cursor:pointer;margin:.8em 0">［${esc(n)}］<br><small>點我放圖片</small></figure>`;

const U = '＿＿＿＿';

// 每種風格：cover/body/album/end 四種區塊
export const TPL_STYLES = [
  {
    id: 'journal', name: '🌸 花間手札', desc: '壓花、撕紙、植物綠・溫柔手帳感',
    css: 'background:linear-gradient(160deg,#f4f1e3 0%,#eef0e0 60%,#e8ead6 100%);border:1px solid #d6d9bf;padding:1.6em 1.4em;border-radius:12px;position:relative;font-family:"Noto Serif TC",serif',
    cover: `<p style="letter-spacing:.5em;color:#7d8f6a;font-size:.8em;text-align:center">花間手札</p><h2 style="text-align:center;font-weight:500">收藏今天的小事</h2><p style="text-align:center"><small>日期：${U}　天氣：${U}<br>今天的心情：${U}</small></p><p style="text-align:center;font-size:1.3em">🌿 🌼 🍃</p>`,
    body: `<div style="background:rgba(255,255,255,.6);border-radius:8px;padding:1em;margin:.6em 0"><p>今天想記住的，是${U}。</p></div>`,
    album: `<h3 style="color:#7d8f6a">✎ 日常碎片</h3><ul><li>看見了${U}</li><li>喜歡上${U}</li><li>想留給自己的話：${U}</li></ul>`,
    end: `<p style="text-align:center;font-size:1.2em">🌸</p><p style="text-align:center"><em><small>晚安，明天見。</small></em></p>`,
    photos: { cover: '今日主照片', album: ['小照片', '小照片'] },
  },
  {
    id: 'minimal', name: '留白日常', desc: '大照片＋細緻字體・簡約耐看',
    css: 'background:#fdfcf9;padding:2.6em 2.2em;font-family:"Noto Serif TC",serif',
    cover: `<p style="text-align:center;letter-spacing:.6em;color:#999;font-size:.75em">留白日常</p><h2 style="text-align:center;font-weight:300;letter-spacing:.15em">${U}</h2><p style="text-align:center"><small>一句話記錄這篇文章：${U}</small></p><hr style="border:none;border-top:1px solid #ddd;width:60px;margin:1.4em auto">`,
    body: `<h3 style="font-weight:400;letter-spacing:.2em">關於這一天</h3><p style="line-height:2">${U}${U}${U}</p>`,
    album: `<h3 style="font-weight:400;letter-spacing:.2em">值得記住</h3><p style="line-height:2">${U}${U}${U}</p>`,
    end: `<hr style="border:none;border-top:1px solid #ddd;width:60px;margin:1.4em auto"><p style="text-align:center"><small>${U}</small></p>`,
    photos: { cover: '橫幅主照片', album: ['細節照片'] },
  },
  {
    id: 'cute', name: '🍰 奶油小日子', desc: '蜜桃粉、奶油黃・可愛柔和',
    css: 'background:linear-gradient(150deg,#fff4f0,#fef6dd);border-radius:18px;padding:1.5em;box-shadow:0 2px 12px rgba(240,180,160,.25)',
    cover: `<p style="text-align:center;font-size:.85em;letter-spacing:.4em;color:#d98a94">奶油小日子</p><h2 style="text-align:center">今天的快樂是${U} ♡</h2>`,
    body: `<div style="background:#fff;border-radius:14px;padding:1em;box-shadow:0 1px 6px rgba(240,180,160,.2)"><p>今天發生了一件可愛的事：<br>${U}${U}</p></div>`,
    album: `<div style="background:rgba(255,255,255,.7);border-radius:14px;padding:.8em 1em"><p>☁ 心情：${U}<br>🎀 最喜歡的瞬間：${U}<br>🍰 給自己的小獎勵：${U}</p></div>`,
    end: `<p style="text-align:center">下次還想${U}！</p>`,
    photos: { cover: '主照片', album: ['小照片', '小照片'] },
  },
  {
    id: 'colorful', name: '🎨 色彩漫遊', desc: '藝術拼貼＋撞色・活潑個性',
    css: 'background:linear-gradient(120deg,#fdfaf3 55%,#f0f0e8);padding:1.5em;border-left:10px solid;border-image:linear-gradient(#e8833a,#f2c14e,#5a8ec9,#e26d6d) 1',
    cover: `<h2 style="letter-spacing:.1em">把${U}染成喜歡的顏色</h2><p><span style="display:inline-block;width:2.5em;height:.6em;background:#5a8ec9"></span> <span style="display:inline-block;width:1.6em;height:.6em;background:#e26d6d"></span> <span style="display:inline-block;width:1em;height:.6em;background:#f2c14e"></span></p>`,
    body: `<p>今天的代表色：${U}<br>因為${U}${U}。</p>`,
    album: `<ol><li>一個新發現：${U}</li><li>一件開心事：${U}</li><li>一個小靈感：${U}</li></ol>`,
    end: `<p>用一句話收藏今天：<br>「${U}${U}」</p>`,
    photos: { cover: '大照片', album: ['照片 A', '照片 B', '照片 C'] },
  },
  {
    id: 'travel', name: '✉️ 遠方來信', desc: '霧藍×鼠尾草綠×淡咖啡・文創旅行手帳',
    css: 'background:linear-gradient(180deg,#f7f4ec,#f0ece0);border-radius:10px;padding:1.8em 1.5em;font-family:"Noto Serif TC",serif;position:relative;box-shadow:0 2px 12px rgba(140,120,90,.15)',
    cover: `<p style="text-align:right;transform:rotate(4deg);display:inline-block;float:right;border:2px solid #8ea4b8;color:#8ea4b8;padding:.2em .8em;border-radius:50%;font-size:.75em">📮 ${U}</p><p style="letter-spacing:.6em;color:#8ea4b8;font-size:.75em">遠方來信 · 棲息地</p><h2 style="color:#5a6a52;font-weight:500">${U}旅行日記</h2><p style="font-size:.9em">📍 目的地：${U}<br>📅 日期：${U}　� 同行者：${U}<br>${U}</p>`,
    body: `<div style="background:rgba(255,255,255,.65);border:1px dashed #b8c4a8;padding:.9em 1em;border-radius:6px;margin:.8em 0"><b style="color:#5a6a52">行程紀錄</b></div><h4>第一站｜${U}</h4><p>這裡讓我印象最深的是${U}。</p><h4>第二站｜${U}</h4><p>推薦停留的理由：${U}。</p>`,
    album: `<div style="border-top:2px dashed #b8c4a8;margin:.8em 0;padding-top:.6em"><b style="color:#5a6a52">口袋筆記</b><p>🚃 交通：${U}<br>🏠 住宿：${U}<br>💰 花費：${U}<br>🍙 美食：${U}<br>⚠️ 提醒：${U}</p></div>`,
    end: `<div style="background:rgba(142,164,184,.12);border-left:4px solid #8ea4b8;padding:1em;border-radius:0 8px 8px 0"><b style="color:#8ea4b8">旅行感想</b><p>${U}${U}</p></div>`,
    photos: { cover: '旅途封面照片', body: ['風景照片', '街景照片'], album: [] },
  },
  {
    id: 'food', name: '🍽 餐桌風景', desc: '咖啡棕＋菜單排版・美食質感',
    css: 'background:#fbf6ee;border-left:12px solid #6d4f38;padding:1.4em;font-family:"Noto Serif TC",serif',
    cover: `<p style="font-size:.8em;letter-spacing:.3em;color:#6d4f38">餐桌風景</p><h2 style="font-weight:500">今天吃${U}</h2><hr style="border:none;border-top:1px solid #d9c6ad;margin:.6em 0">`,
    body: `<p>店名｜${U}<br>地點｜${U}<br>到訪日期｜${U}</p><h3>這次點了什麼</h3><ul><li>${U}　$＿＿</li><li>${U}　$＿＿</li></ul><h3>第一口的感覺</h3><p>${U}${U}</p>`,
    album: `<h3>我的口袋筆記</h3><p>口味｜${U}<br>環境｜${U}<br>最推薦｜${U}<br>再訪意願｜${U}</p>`,
    end: `<div style="border-top:3px double #d9b68c;padding-top:.6em"><h3>留給下次的自己</h3><p>${U}${U}</p></div>`,
    photos: { cover: '餐點主照片', album: ['餐點特寫', '店內環境'] },
  },
  {
    id: 'forest', name: '🌿 森系植物', desc: '鼠尾草綠、米白、葉片',
    css: 'background:#f0f4ec;border-top:5px solid #a9bf9e;padding:1.2em;border-radius:8px',
    cover: `<h2>今天與植物一起呼吸</h2><p>${U}　・　${U}</p>`,
    body: `<p>${U}${U}${U}</p>`,
    album: `<ul><li>葉子：${U}</li><li>花：${U}</li><li>陽光：${U}</li></ul>`,
    end: `<p><em>慢慢長，就好。</em></p>`,
    photos: { cover: '植物照片', album: ['葉片特寫', '光影'] },
  },
  {
    id: 'retro', name: '📰 復古報刊', desc: '泛黃紙張、襯線字、分欄',
    css: 'background:#f5ecd7;font-family:Georgia,serif;border:3px double #8a6a48;padding:1.3em',
    cover: `<h2 style="text-align:center;border-bottom:3px double #8a6a48">今 日 觀 察</h2><p style="text-align:center"><small>第${U}期　${U}年${U}月${U}日</small></p>`,
    body: `<p style="column-count:2;column-gap:1.5em">${U}${U}${U}${U}${U}</p>`,
    album: `<p><b>本日要聞：</b>${U}${U}</p>`,
    end: `<p style="text-align:center"><small>── 完 ──</small></p>`,
    photos: { cover: '報刊照片', album: [] },
  },
  {
    id: 'film', name: '📷 底片日記', desc: '黑白灰＋底片邊框＋日期',
    css: 'background:#f4f4f4;border:8px solid #222;border-image:repeating-linear-gradient(90deg,#222 0 8px,#444 8px 16px) 8;padding:1em',
    cover: `<h2 style="font-family:monospace">◈ FILM No.${U}</h2><p><small>${U}・${U}</small></p>`,
    body: `<p>${U}${U}${U}</p>`,
    album: `<p>⬛⬛⬛ ${U} ⬛⬛⬛</p>`,
    end: `<p><small>exp. ${U}</small></p>`,
    photos: { cover: '底片照片', album: ['幀一', '幀二', '幀三'] },
  },
  {
    id: 'postcard', name: '✉️ 明信片', desc: '郵票、郵戳、手寫短句',
    css: 'background:#fffdf5;border:2px solid #c9b18a;border-radius:4px;padding:1.4em;position:relative',
    cover: `<h2>給${U}的明信片</h2><p style="text-align:right"><small>📮 ${U}寄出</small></p>`,
    body: `<p>${U}${U}<br>${U}</p>`,
    album: `<p><b>PS.</b> ${U}</p>`,
    end: `<p style="text-align:right">${U}<br>敬上</p>`,
    photos: { cover: '明信片照片' },
  },
  {
    id: 'book', name: '📚 文藝書頁', desc: '書頁米色＋章節標題＋引言',
    css: 'background:#faf5ec;font-family:Georgia,serif;padding:1.6em;border-left:4px solid #b08d57',
    cover: `<h2>第${U}章　${U}</h2><blockquote>${U}${U}</blockquote>`,
    body: `<p>${U}${U}${U}</p>`,
    album: `<blockquote>${U}</blockquote>`,
    end: `<p style="text-align:center">﹡</p>`,
    photos: { cover: '書頁照片' },
  },
  {
    id: 'cafe', name: '☕ 咖啡館', desc: '奶茶咖啡棕＋菜單排版',
    css: 'background:#f7f1e8;border:1px solid #d9c6ad;padding:1.3em',
    cover: `<h2>☕ ${U}</h2><p><small>本日菜單</small></p>`,
    body: `<p>${U}${U}</p><ul><li>☕ ${U}　$＿＿</li><li>🍰 ${U}　$＿＿</li></ul>`,
    album: `<p>座位推薦：${U}｜再訪：${U}</p>`,
    end: `<p><em>慢慢喝，不趕時間。</em></p>`,
    photos: { cover: '咖啡照片', album: ['甜點', '店內'] },
  },
  {
    id: 'washi', name: '🌸 日系和紙', desc: '和紙紋理、淡色花草、直式小標',
    css: 'background:#fdfaf4;border:6px solid #f4e3d0;padding:1.3em',
    cover: `<h2 style="letter-spacing:.4em">${U}</h2>`,
    body: `<p>${U}${U}</p>`,
    album: `<p>季節：${U}｜花：${U}</p>`,
    end: `<p style="text-align:right"><small>${U}</small></p>`,
    photos: { cover: '和風照片' },
  },
  {
    id: 'craft', name: '🧵 手作拼貼', desc: '撕紙、布紋、紙膠帶、便條',
    css: 'background:#f6efe4;border:2px dashed #b59a76;padding:1.2em;border-radius:10px',
    cover: `<h2>✂ 今天的作品</h2><p>材料：${U}</p>`,
    body: `<h3>步驟</h3><ol><li>${U}</li><li>${U}</li><li>${U}</li></ol>`,
    album: `<p>耗時：${U}｜難度：${U}</p>`,
    end: `<p>下次想做${U}。</p>`,
    photos: { cover: '成品照片', album: ['過程一', '過程二'] },
  },
  {
    id: 'night', name: '🌙 夜色微光', desc: '深藍底、星點、月光',
    css: 'background:#1f2740;color:#e8e6f0;padding:1.4em;border-radius:12px',
    cover: `<h2>今夜${U}</h2>`,
    body: `<p>${U}${U}${U}</p>`,
    album: `<p>✦ ${U} ✦</p>`,
    end: `<p><small>晚安。</small></p>`,
    photos: { cover: '夜景照片' },
  },
  {
    id: 'sea', name: '🌊 海邊假期', desc: '海藍、沙色、波浪貝殼',
    css: 'background:linear-gradient(#e8f4f8,#fdf3e0);padding:1.3em;border-radius:10px',
    cover: `<h2>🏖 ${U}之旅</h2>`,
    body: `<p>${U}${U}</p>`,
    album: `<ul><li>海浪：${U}</li><li>貝殼：${U}</li></ul>`,
    end: `<p><em>帶了一點海回家。</em></p>`,
    photos: { cover: '海景照片', album: ['沙灘', '浪'] },
  },
  {
    id: 'orange', name: '🧡 復古撞色', desc: '橘紅、芥末黃、幾何色塊',
    css: 'background:#fff2df;border:4px solid #e8833a;padding:1.2em',
    cover: `<h2 style="color:#e8833a">◉ ${U} ◉</h2>`,
    body: `<p>${U}${U}</p>`,
    album: `<p>主色：${U}｜輔色：${U}</p>`,
    end: `<p><b>◤ ${U} ◢</b></p>`,
    photos: { cover: '主照片', album: ['照片 A', '照片 B'] },
  },
  {
    id: 'gallery', name: '🖼 藝廊留白', desc: '大幅照片＋小字圖說',
    css: 'background:#fff;padding:2em',
    cover: `<h2 style="font-weight:300;letter-spacing:.2em">${U}</h2>`,
    body: `<p><small>${U}${U}</small></p>`,
    album: `<p><small>No.${U}</small></p>`,
    end: `<p style="text-align:right"><small>${U}</small></p>`,
    photos: { cover: '作品照片', album: ['作品一', '作品二'] },
  },
  ...MORE_STYLES,
];

// 依風格＋勾選區塊產生 HTML；mode: fixed（佔位圖整齊排列）/ free（自由拼貼層）
export function buildTemplate(styleId, blocks, mode = 'fixed') {
  const st = TPL_STYLES.find(s => s.id === styleId) || TPL_STYLES[0];
  const parts = [];
  const phs = (st.photos || {});
  for (const b of blocks) {
    if (!st[b]) continue;
    parts.push(st[b]);
    const list = Array.isArray(phs[b]) ? phs[b] : phs[b] ? [phs[b]] : [];
    if (list.length) {
      parts.push(mode === 'free'
        ? `<div class="free-box" contenteditable="false" style="position:relative;min-height:220px;border:1px dashed var(--border);border-radius:8px;margin:.6em 0">${list.map((n, i) => `<div class="ph ph-free" data-ph="${esc(n)}" style="position:absolute;left:${12 + i * 28}%;top:${10 + (i % 2) * 40}%;width:22%;border:2px dashed var(--border);border-radius:10px;padding:1em;text-align:center;color:var(--muted);cursor:pointer">［${esc(n)}］</div>`).join('')}</div>`
        : `<div class="row" style="flex-wrap:wrap;gap:.6rem">${list.map(n => `<div style="flex:1;min-width:140px">${PH(n)}</div>`).join('')}</div>`);
    }
  }
  return `<section class="tpl" data-tpl="${st.id}" style="${st.css}">${parts.join('')}</section><p><br></p>`;
}
