// 文章風格模板（擴充 48 種）：與 templates.js 的 TPL_STYLES 同格式，cat 指定在「套用模板」裡的分類
const U = '＿＿＿＿';

// 版型：同樣的四個區塊（封面／內文／相簿／結尾），換不同的排版方式，讓風格不只是換顏色
// c = { a: 主色, b: 淡底色, t: 標題字色 }
const L = {
  // 一般：置中封面＋白卡內文＋清單
  card: (c, x) => ({
    cover: `<p style="text-align:center;letter-spacing:.45em;font-size:.78em;color:${c.a}">${x.tag}</p><h2 style="text-align:center;color:${c.t || 'inherit'}">${x.title}</h2><p style="text-align:center"><small>${x.sub}</small></p>`,
    body: `<div style="background:${c.b};border-radius:10px;padding:1em;margin:.6em 0"><p>${x.body}</p></div>`,
    album: `<h3 style="color:${c.a}">${x.listTitle}</h3><ul>${x.list.map(i => `<li>${i}：${U}</li>`).join('')}</ul>`,
    end: `<p style="text-align:center"><em>${x.end}</em></p>`,
  }),
  // 左側色條：標題靠左＋粗邊條段落
  bar: (c, x) => ({
    cover: `<p style="font-size:.78em;letter-spacing:.3em;color:${c.a}">${x.tag}</p><h2 style="border-left:6px solid ${c.a};padding-left:.5em;color:${c.t || 'inherit'}">${x.title}</h2><p><small>${x.sub}</small></p>`,
    body: `<p style="border-left:3px solid ${c.b};padding-left:.8em">${x.body}</p>`,
    album: `<p><b style="color:${c.a}">${x.listTitle}</b><br>${x.list.map(i => `${i}｜${U}`).join('<br>')}</p>`,
    end: `<p style="border-top:1px solid ${c.a};padding-top:.5em"><small>${x.end}</small></p>`,
  }),
  // 引言：大引號＋置中短句
  quote: (c, x) => ({
    cover: `<h2 style="text-align:center;font-weight:400;letter-spacing:.12em;color:${c.t || 'inherit'}">${x.title}</h2><p style="text-align:center;color:${c.a}"><small>${x.tag}・${x.sub}</small></p>`,
    body: `<blockquote style="border-left:none;text-align:center;font-size:1.1em;margin:1em 0"><span style="font-size:2em;color:${c.a};line-height:0">“</span> ${x.body} <span style="font-size:2em;color:${c.a};line-height:0">”</span></blockquote>`,
    album: `<p style="text-align:center"><b>${x.listTitle}</b></p><p style="text-align:center">${x.list.map(i => `${i}・${U}`).join('<br>')}</p>`,
    end: `<p style="text-align:center;color:${c.a}">— ${x.end} —</p>`,
  }),
  // 表格：資訊用表格整理（適合美食、學習、紀錄）
  table: (c, x) => ({
    cover: `<p style="font-size:.78em;letter-spacing:.3em;color:${c.a}">${x.tag}</p><h2 style="color:${c.t || 'inherit'}">${x.title}</h2><p><small>${x.sub}</small></p>`,
    body: `<p>${x.body}</p>`,
    album: `<h3 style="color:${c.a}">${x.listTitle}</h3><table style="border-collapse:collapse;width:100%">${x.list.map(i => `<tr><td style="border-bottom:1px solid ${c.b};padding:.35em;width:35%;color:${c.a}">${i}</td><td style="border-bottom:1px solid ${c.b};padding:.35em">${U}</td></tr>`).join('')}</table>`,
    end: `<p style="text-align:right"><small>${x.end}</small></p>`,
  }),
  // 標籤：色塊小標＋框線內文
  badge: (c, x) => ({
    cover: `<p><span style="background:${c.a};color:#fff;padding:.15em .7em;border-radius:99px;font-size:.78em">${x.tag}</span></p><h2 style="color:${c.t || 'inherit'}">${x.title}</h2><p><small>${x.sub}</small></p>`,
    body: `<div style="border:2px solid ${c.a};border-radius:12px;padding:.9em 1em;margin:.6em 0"><p>${x.body}</p></div>`,
    album: `<p>${x.list.map(i => `<span style="display:inline-block;background:${c.b};border-radius:8px;padding:.2em .6em;margin:.15em">${i}：${U}</span>`).join(' ')}</p>`,
    end: `<p style="text-align:center"><span style="background:${c.b};padding:.2em .8em;border-radius:99px">${x.end}</span></p>`,
  }),
  // 編號：大數字步驟／清單
  steps: (c, x) => ({
    cover: `<h2 style="color:${c.t || 'inherit'}">${x.title}</h2><p style="color:${c.a}"><small>${x.tag}｜${x.sub}</small></p>`,
    body: `<p>${x.body}</p>`,
    album: `<h3>${x.listTitle}</h3>${x.list.map((i, n) => `<p><b style="display:inline-block;width:1.8em;height:1.8em;line-height:1.8em;text-align:center;border-radius:50%;background:${c.a};color:#fff;margin-right:.4em">${n + 1}</b>${i}：${U}</p>`).join('')}`,
    end: `<p style="background:${c.b};padding:.6em .9em;border-radius:8px">${x.end}</p>`,
  }),
};

// [id, 名稱, 說明, 分類, 版型, 外框 css, 色彩, 文字, 照片佔位]
const DEFS = [
  // ---------- 旅遊 ----------
  ['trip-map', '🗺 地圖探險', '牛皮紙＋虛線路線・冒險感', '旅遊', 'bar', 'background:#efe3c8;border:2px dashed #8a6a3e;padding:1.4em;border-radius:6px;font-family:"Noto Serif TC",serif', { a: '#8a5a2b', b: '#d9c49b' },
    { tag: 'ROUTE MAP', title: `${U}探險路線`, sub: `出發：${U}　抵達：${U}`, body: `沿著地圖上的虛線，我們走到了${U}。`, listTitle: '沿途標記', list: ['📍 起點', '⛰ 中途', '🏁 終點'], end: '下一張地圖，畫在哪裡？' }, { cover: '路線照片', album: ['沿途風景', '沿途風景'] }],
  ['trip-ticket', '🎫 車票旅記', '票根版型・月台與車廂', '旅遊', 'table', 'background:#fbf7ef;border:2px solid #2f5d7c;border-radius:12px;padding:1.3em;box-shadow:inset 0 0 0 6px #fbf7ef,inset 0 0 0 7px #2f5d7c55', { a: '#2f5d7c', b: '#c9d8e3' },
    { tag: 'TICKET', title: `${U} → ${U}`, sub: `車次 ${U}　座位 ${U}`, body: `窗外一路是${U}，車廂裡${U}。`, listTitle: '乘車資訊', list: ['日期', '出發時間', '抵達時間', '票價'], end: '請妥善保存本票根' }, { cover: '車站照片', album: ['車窗外', '月台'] }],
  ['trip-mountain', '⛰ 山林步道', '森林綠＋等高線・登山紀錄', '旅遊', 'steps', 'background:linear-gradient(180deg,#e9f1e4,#f6f3e8);border-top:6px solid #4d7a4a;padding:1.4em;border-radius:8px', { a: '#4d7a4a', b: '#dbe8d3' },
    { tag: '步道紀錄', title: `登上${U}`, sub: `海拔 ${U}m・總距離 ${U}km`, body: `踏上步道的那一刻，空氣是${U}的味道。`, listTitle: '路程', list: ['登山口', '休息點', '山頂'], end: '⛰ 山還在，下次再來。' }, { cover: '山頂照片', album: ['步道', '雲海'] }],
  ['trip-city', '🏙 城市散步', '灰藍水泥＋霓虹點綴・街拍感', '旅遊', 'badge', 'background:#eef0f3;padding:1.4em;border-radius:4px;border-bottom:6px solid #ff5d8f', { a: '#3b4a63', b: '#d9dee7' },
    { tag: 'CITY WALK', title: `在${U}漫步`, sub: `${U}區・${U}街`, body: `轉角遇見了${U}，城市的節奏變得${U}。`, list: ['☕ 咖啡', '🛍 小店', '📸 拍照點'], end: 'see you on the street' }, { cover: '街景照片', album: ['轉角', '招牌', '夜景'] }],

  // ---------- 手帳 ----------
  ['jr-grid', '📓 方格筆記', '方格紙＋紙膠帶・手寫感', '手帳', 'card', 'background-color:#fffef8;background-image:linear-gradient(#e6e9f2 1px,transparent 1px),linear-gradient(90deg,#e6e9f2 1px,transparent 1px);background-size:20px 20px;padding:1.6em 1.3em;border-radius:6px;border-top:14px solid #f3c6a5', { a: '#d9826a', b: 'rgba(255,255,255,.85)' },
    { tag: 'DAILY NOTE', title: `${U}月${U}日`, sub: `天氣 ${U}　心情 ${U}`, body: `今天最想寫下來的是：${U}${U}`, listTitle: '✔ 今日清單', list: ['完成了', '吃了', '想到'], end: '今天也辛苦了。' }, { cover: '今日照片', album: ['小照片', '小照片'] }],
  ['jr-weekly', '🗓 週計畫', '一週七格・計畫與回顧', '手帳', 'table', 'background:#fbfaf6;border:1px solid #d8d2c4;padding:1.4em;border-radius:10px', { a: '#7b6f9e', b: '#e4e0ee' },
    { tag: 'WEEKLY', title: `第 ${U} 週`, sub: `${U} ～ ${U}`, body: `這週的目標：${U}`, listTitle: '每日一句', list: ['週一', '週二', '週三', '週四', '週五', '週末'], end: '下週想更好的地方：＿＿＿＿' }, { cover: '本週代表照' }],
  ['jr-dot', '⚫ 子彈筆記', '點陣紙＋符號・極簡條列', '手帳', 'bar', 'background-color:#fdfcf8;background-image:radial-gradient(#c9c4b6 1px,transparent 1px);background-size:16px 16px;padding:1.5em;border-radius:6px', { a: '#333', b: '#bbb' },
    { tag: 'BULLET JOURNAL', title: `${U}`, sub: `• 任務　○ 事件　– 筆記`, body: `– ${U}<br>– ${U}<br>– ${U}`, listTitle: '今日紀錄', list: ['• 任務', '○ 事件', '– 筆記'], end: '× 完成　> 延後　< 排程' }, { cover: '桌面照片' }],
  ['jr-sticker', '🏷 貼紙手帳', '滿版貼紙＋彩色便條', '手帳', 'badge', 'background:#fff8f0;border:2px solid #f2d3b3;padding:1.4em;border-radius:16px', { a: '#ef8f6b', b: '#ffe7c9' },
    { tag: 'STICKER DIARY', title: `今天貼上${U}`, sub: `🍓 ⭐ 🌈 🐻 🎈`, body: `貼紙代表今天的心情：${U}`, list: ['🍓 甜甜的事', '⭐ 驕傲的事', '🌧 小煩惱'], end: '貼滿一頁，又是一天 ✿' }, { cover: '手帳頁照片', album: ['貼紙', '便條'] }],

  // ---------- 簡約 ----------
  ['mn-mono', '◻ 黑白極簡', '純黑白＋大量留白', '簡約', 'quote', 'background:#fff;color:#111;padding:2.6em 2em;border:1px solid #111', { a: '#111', b: '#eee' },
    { tag: 'MONO', title: `${U}`, sub: `${U}`, body: `${U}${U}`, listTitle: 'NOTES', list: ['01', '02', '03'], end: 'END' }, { cover: '黑白照片' }],
  ['mn-line', '─ 細線排版', '細線分隔＋雜誌感留白', '簡約', 'bar', 'background:#fcfbf9;padding:2.2em 1.8em;border-top:1px solid #999;border-bottom:1px solid #999;font-family:"Noto Serif TC",serif', { a: '#777', b: '#ddd' },
    { tag: 'ISSUE ' + U, title: `${U}`, sub: `文／${U}`, body: `${U}${U}${U}`, listTitle: 'INDEX', list: ['I', 'II', 'III'], end: '— fin —' }, { cover: '主視覺照片' }],
  ['mn-nordic', '❄ 北歐淺灰', '淺灰木質＋圓角・安靜舒適', '簡約', 'card', 'background:#f2f1ee;padding:2em 1.6em;border-radius:20px', { a: '#8c8a83', b: '#fff' },
    { tag: 'HYGGE', title: `${U}`, sub: `一杯熱飲・一盞燈・${U}`, body: `讓人感到舒服的小事：${U}`, listTitle: '今天的 hygge', list: ['🕯 光', '🧶 溫度', '📖 安靜'], end: '慢一點也沒關係。' }, { cover: '室內照片', album: ['細節'] }],
  ['mn-zen', '🍵 禪意留白', '米紙＋墨色・靜心', '簡約', 'quote', 'background:#f7f4ec;padding:2.6em 2em;font-family:"Noto Serif TC",serif;border-left:2px solid #444', { a: '#555', b: '#e5e0d4' },
    { tag: '靜', title: `${U}`, sub: `${U}`, body: `${U}`, listTitle: '觀', list: ['聽', '看', '想'], end: '心安即是歸處' }, { cover: '靜物照片' }],

  // ---------- 可愛 ----------
  ['ct-bear', '🧸 小熊日記', '奶茶色＋圓滾滾小熊', '可愛', 'card', 'background:#f8eee3;border-radius:24px;padding:1.5em;border:3px solid #e1c4a5', { a: '#b98457', b: '#fffaf4' },
    { tag: 'BEAR DIARY', title: `🧸 今天的小熊${U}`, sub: `抱抱指數：${U}/10`, body: `小熊想跟你說：${U}`, listTitle: '🍯 今天的蜂蜜', list: ['好吃的', '好玩的', '好暖的'], end: '晚安，熊熊抱 ♡' }, { cover: '可愛照片', album: ['小照片', '小照片'] }],
  ['ct-bunny', '🐰 粉兔兔', '粉紅＋白雲朵・軟萌', '可愛', 'badge', 'background:linear-gradient(160deg,#ffeef4,#fff);border-radius:22px;padding:1.5em;box-shadow:0 3px 14px rgba(255,150,190,.25)', { a: '#f27ea9', b: '#ffe0eb' },
    { tag: 'BUNNY', title: `🐰 蹦蹦跳跳的${U}`, sub: `🥕 x ${U}`, body: `今天蹦蹦跳跳去了${U}！`, list: ['🥕 收穫', '☁ 心情', '🎀 驚喜'], end: '蹦～明天見！' }, { cover: '主照片', album: ['照片', '照片'] }],
  ['ct-cat', '🐱 貓咪日常', '橘貓＋腳印・慵懶可愛', '可愛', 'steps', 'background:#fff7ec;border:2px dashed #f0a35e;border-radius:18px;padding:1.4em', { a: '#f0a35e', b: '#ffe9cf' },
    { tag: '喵日記', title: `🐾 ${U}喵的一天`, sub: `睡了 ${U} 小時`, body: `今天的主子心情：${U}`, listTitle: '喵喵行程', list: ['吃飯', '睡覺', '搗蛋'], end: '🐾 喵～（翻譯：謝謝你看完）' }, { cover: '貓咪照片', album: ['睡姿', '吃飯'] }],
  ['ct-candy', '🍬 糖果罐', '馬卡龍色＋圓點', '可愛', 'card', 'background-color:#fffafc;background-image:radial-gradient(#ffd6e7 3px,transparent 3px),radial-gradient(#d4f1ff 3px,transparent 3px);background-size:28px 28px;background-position:0 0,14px 14px;padding:1.6em;border-radius:20px', { a: '#e57fb0', b: 'rgba(255,255,255,.9)' },
    { tag: 'CANDY JAR', title: `今天的糖果是${U} 🍭`, sub: `甜度 ${U}%`, body: `甜甜的一件事：${U}`, listTitle: '🍬 糖果罐', list: ['草莓口味', '檸檬口味', '薄荷口味'], end: '把甜收好，明天再吃一顆。' }, { cover: '甜點照片', album: ['照片', '照片'] }],
  ['ct-cloud', '☁ 雲朵棉花', '天空藍＋白雲・夢幻', '可愛', 'quote', 'background:linear-gradient(180deg,#dff1ff,#fff);border-radius:30px;padding:1.8em 1.5em', { a: '#6fb2e8', b: '#eaf6ff' },
    { tag: 'CLOUDY', title: `☁ 飄到${U}`, sub: `今天的天空是${U}色`, body: `如果心情是一朵雲，它會是${U}。`, listTitle: '☁ 雲朵收集', list: ['形狀', '顏色', '像什麼'], end: '軟綿綿地結束今天' }, { cover: '天空照片' }],

  // ---------- 多彩 ----------
  ['cl-rainbow', '🌈 彩虹條紋', '七彩條紋邊框・明亮活潑', '多彩', 'badge', 'background:#fff;padding:1.5em;border:8px solid;border-image:linear-gradient(90deg,#ff6b6b,#ffa94d,#ffd43b,#69db7c,#4dabf7,#9775fa) 1', { a: '#9775fa', b: '#f3f0ff' },
    { tag: 'RAINBOW', title: `🌈 ${U}`, sub: `紅橙黃綠藍紫`, body: `今天出現了好多顏色：${U}`, list: ['❤ 紅', '💛 黃', '💙 藍', '💜 紫'], end: '雨後總會有彩虹' }, { cover: '彩色照片', album: ['照片 A', '照片 B', '照片 C'] }],
  ['cl-pop', '💥 普普藝術', '大色塊＋網點・漫畫感', '多彩', 'bar', 'background-color:#fff34d;background-image:radial-gradient(#f55 1.5px,transparent 1.5px);background-size:12px 12px;padding:1.5em;border:4px solid #111;box-shadow:6px 6px 0 #111', { a: '#e0245e', b: '#111', t: '#111' },
    { tag: 'POP!', title: `BOOM！${U}`, sub: `${U}`, body: `<span style="background:#fff;padding:.1em .3em">${U}${U}</span>`, listTitle: 'WOW', list: ['POW', 'ZAP', 'BAM'], end: 'TO BE CONTINUED…' }, { cover: '主照片', album: ['格子一', '格子二'] }],
  ['cl-memphis', '🔺 孟菲斯', '幾何圖形＋撞色・80 年代', '多彩', 'badge', 'background-color:#fdf6e9;background-image:linear-gradient(45deg,transparent 46%,#2ec4b6 46%,#2ec4b6 54%,transparent 54%);background-size:40px 40px;padding:1.6em;border:3px solid #222;border-radius:4px', { a: '#ff5d8f', b: '#ffe066' },
    { tag: 'MEMPHIS', title: `▲ ● ■ ${U}`, sub: `${U}`, body: `<span style="background:#fff">${U}${U}</span>`, list: ['▲ 形狀', '● 顏色', '■ 感覺'], end: 'stay weird ✶' }, { cover: '大照片', album: ['照片', '照片'] }],
  ['cl-watercolor', '🎨 水彩暈染', '柔和水彩漸層・藝術感', '多彩', 'quote', 'background:radial-gradient(circle at 15% 20%,#ffd6e0aa,transparent 40%),radial-gradient(circle at 85% 30%,#c7e9ffaa,transparent 40%),radial-gradient(circle at 50% 90%,#fff1b8aa,transparent 45%),#fffdf9;padding:2em 1.6em;border-radius:14px', { a: '#c06c84', b: '#fff' },
    { tag: 'WATERCOLOR', title: `${U}`, sub: `用顏色寫下今天`, body: `今天的心情像${U}色的水彩，慢慢暈開。`, listTitle: '調色盤', list: ['主色', '點綴色', '背景色'], end: '顏色會乾，心情會留下' }, { cover: '畫作照片', album: ['細節'] }],

  // ---------- 美食 ----------
  ['fd-bento', '🍱 便當日記', '格子便當盒・家常味', '美食', 'table', 'background:#fbf3e4;border:3px solid #c0392b;border-radius:14px;padding:1.4em', { a: '#c0392b', b: '#f0d9b5' },
    { tag: 'BENTO', title: `今天的便當：${U}`, sub: `做給 ${U} 的愛心便當`, body: `打開便當蓋的瞬間：${U}`, listTitle: '便當內容', list: ['主菜', '配菜', '飯', '水果'], end: '吃光光，盒子空空 ✓' }, { cover: '便當照片', album: ['特寫'] }],
  ['fd-bakery', '🥐 烘焙坊', '麵包奶油色＋小麥・暖香', '美食', 'steps', 'background:#fbf1e1;border-top:8px solid #c98b4b;padding:1.4em;border-radius:6px;font-family:"Noto Serif TC",serif', { a: '#c98b4b', b: '#f3e1c4' },
    { tag: 'BAKERY', title: `🥐 今天烤了${U}`, sub: `烤箱 ${U}°C・${U} 分鐘`, body: `出爐的香味讓人${U}。`, listTitle: '做法', list: ['準備材料', '揉麵發酵', '進烤箱'], end: '剛出爐的，最好吃。' }, { cover: '麵包照片', album: ['過程', '成品'] }],
  ['fd-recipe', '📋 食譜卡', '索引卡＋材料步驟', '美食', 'steps', 'background:#fff;border:1px solid #e3d5c3;border-left:30px solid #f0b37e;padding:1.4em;border-radius:4px', { a: '#e08a3c', b: '#fdf0e2' },
    { tag: 'RECIPE', title: `${U}食譜`, sub: `份量 ${U} 人份・時間 ${U} 分鐘`, body: `<b>材料：</b>${U}、${U}、${U}、${U}`, listTitle: '步驟', list: ['備料', '烹調', '調味', '盛盤'], end: '小撇步：＿＿＿＿' }, { cover: '成品照片', album: ['步驟一', '步驟二'] }],
  ['fd-dessert', '🍰 甜點評比', '粉嫩奶油＋星等・甜點控', '美食', 'table', 'background:linear-gradient(160deg,#fff0f3,#fffaf0);border-radius:18px;padding:1.5em', { a: '#e8798f', b: '#fbdbe2' },
    { tag: 'DESSERT', title: `🍰 ${U}`, sub: `店家：${U}`, body: `第一口：${U}`, listTitle: '評分', list: ['甜度 ★', '口感 ★', '顏值 ★', 'CP 值 ★'], end: '總評：★★★★☆' }, { cover: '甜點照片', album: ['切面', '店內'] }],
  ['fd-night', '🏮 夜市巡禮', '紅燈籠＋攤位招牌・熱鬧', '美食', 'badge', 'background:#2b1d1a;color:#fbe9d0;padding:1.5em;border-radius:10px;border:3px solid #d94b3a', { a: '#d94b3a', b: '#4a2f28', t: '#ffd27a' },
    { tag: '夜市', title: `🏮 ${U}夜市`, sub: `今晚吃了 ${U} 攤`, body: `一走進夜市就聞到${U}。`, list: ['🍢 鹹的', '🧋 喝的', '🍡 甜的'], end: '吃飽了，散步回家 🌙' }, { cover: '夜市照片', album: ['小吃', '招牌'] }],

  // ---------- 節日 ----------
  ['hd-newyear', '🧧 新年快樂', '紅金配色＋春聯・喜氣', '節日', 'quote', 'background:#b71c1c;color:#fff3d6;padding:1.8em 1.5em;border:4px double #f5c451;border-radius:8px', { a: '#f5c451', b: '#8e1414', t: '#ffd76a' },
    { tag: '恭賀新禧', title: `🧧 ${U}年 新春快樂`, sub: `${U}`, body: `新的一年，希望${U}。`, listTitle: '新年願望', list: ['健康', '家人', '自己'], end: '歲歲平安・年年有餘' }, { cover: '團圓照片', album: ['年菜', '紅包'] }],
  ['hd-valentine', '💌 情人節', '玫瑰紅＋愛心・浪漫', '節日', 'card', 'background:linear-gradient(160deg,#ffe3ea,#fff5f7);border:2px solid #f48fb1;border-radius:18px;padding:1.6em', { a: '#e0567f', b: '#fff' },
    { tag: "VALENTINE'S DAY", title: `💌 給${U}`, sub: `在一起第 ${U} 天`, body: `想對你說：${U}${U}`, listTitle: '我們的小事', list: ['第一次', '最喜歡', '下次一起'], end: '♡ 愛你 ♡' }, { cover: '兩人合照', album: ['禮物', '約會'] }],
  ['hd-halloween', '🎃 萬聖節', '南瓜橘＋夜黑・搞怪', '節日', 'badge', 'background:#1f1a24;color:#f4e9d8;padding:1.5em;border-radius:12px;border:3px solid #ff8c1a', { a: '#ff8c1a', b: '#3a2d44', t: '#ffb347' },
    { tag: 'HALLOWEEN', title: `🎃 Trick or ${U}!`, sub: `今年扮成 ${U}`, body: `今晚最可怕（好笑）的事：${U}`, list: ['👻 裝扮', '🍬 糖果', '🦇 派對'], end: 'Happy Halloween 🕸' }, { cover: '變裝照片', album: ['南瓜', '糖果'] }],
  ['hd-xmas', '🎄 聖誕節', '聖誕紅綠＋雪花・溫馨', '節日', 'card', 'background:#fbf7f0;border:6px solid;border-image:repeating-linear-gradient(45deg,#c62828 0 10px,#fff 10px 20px,#2e7d32 20px 30px,#fff 30px 40px) 6;padding:1.6em', { a: '#2e7d32', b: '#fdecea' },
    { tag: 'MERRY CHRISTMAS', title: `🎄 ${U}的聖誕節`, sub: `❄ ❄ ❄`, body: `今年最想收到的禮物：${U}`, listTitle: '🎁 禮物清單', list: ['送出', '收到', '許願'], end: '🎅 Merry Christmas & Happy New Year' }, { cover: '聖誕樹照片', album: ['禮物', '大餐'] }],
  ['hd-birthday', '🎂 生日快樂', '彩帶氣球＋蛋糕・派對', '節日', 'steps', 'background:linear-gradient(160deg,#fff4d6,#ffe4f0,#e0f0ff);padding:1.6em;border-radius:18px', { a: '#ff6f91', b: '#fff' },
    { tag: 'HAPPY BIRTHDAY', title: `🎂 ${U}歲生日快樂！`, sub: `🎈🎉🎁`, body: `許下的願望（偷偷寫）：${U}`, listTitle: '生日三願', list: ['第一個', '第二個', '第三個（不能說）'], end: '願你每天都像今天一樣被愛著 🎉' }, { cover: '生日照片', album: ['蛋糕', '派對'] }],
  ['hd-midautumn', '🥮 中秋團圓', '月色金黃＋夜空・團圓', '節日', 'quote', 'background:radial-gradient(circle at 80% 18%,#ffe9a8 0 40px,transparent 42px),linear-gradient(180deg,#1d2b4f,#3c4f7a);color:#fdf3d8;padding:1.8em 1.5em;border-radius:12px', { a: '#ffd36e', b: '#2b3a60', t: '#ffe7a3' },
    { tag: '中秋', title: `🥮 ${U}的中秋夜`, sub: `月圓人團圓`, body: `今晚的月亮${U}。`, listTitle: '中秋三樣', list: ['月餅', '烤肉', '柚子'], end: '但願人長久，千里共嬋娟' }, { cover: '月亮照片', album: ['烤肉', '家人'] }],

  // ---------- 心情 ----------
  ['md-rainy', '🌧 雨天心事', '灰藍雨滴・安靜憂鬱', '心情', 'quote', 'background:linear-gradient(180deg,#d9e2ea,#eef2f5);padding:2em 1.6em;border-radius:10px', { a: '#5b7186', b: '#fff' },
    { tag: 'RAINY DAY', title: `🌧 ${U}`, sub: `雨下了 ${U} 小時`, body: `下雨的時候，我會想起${U}。`, listTitle: '雨天清單', list: ['聽的歌', '喝的飲料', '想的人'], end: '雨會停的。' }, { cover: '雨景照片' }],
  ['md-sunny', '☀ 晴天好心情', '陽光黃＋向日葵・元氣', '心情', 'badge', 'background:linear-gradient(160deg,#fff6c9,#fffdf2);padding:1.5em;border-radius:18px;border:2px solid #ffd43b', { a: '#f2a600', b: '#fff3b0' },
    { tag: 'SUNNY', title: `☀ 今天是${U}的好日子`, sub: `元氣值 ${U}%`, body: `讓我笑出來的事：${U}`, list: ['🌻 開心', '😆 好笑', '💪 加油'], end: '把陽光分你一半 ☀' }, { cover: '晴天照片', album: ['照片', '照片'] }],
  ['md-letter', '✉ 給未來的信', '信紙橫線＋封蠟・時光膠囊', '心情', 'card', 'background-color:#fffdf6;background-image:repeating-linear-gradient(transparent 0 31px,#e7dcc7 31px 32px);padding:1.8em 1.6em;border:1px solid #e1d3b8;border-radius:4px;font-family:"Noto Serif TC",serif', { a: '#a33b3b', b: 'transparent' },
    { tag: 'TO FUTURE ME', title: `給${U}年後的自己`, sub: `寫於 ${U}`, body: `嗨，未來的我：${U}${U}`, listTitle: '現在的我', list: ['正在煩惱', '正在努力', '最喜歡'], end: '🔴 拆信日期：＿＿＿＿' }, { cover: '現在的照片' }],
  ['md-gratitude', '🙏 感恩日記', '暖米色＋三件好事', '心情', 'steps', 'background:#fbf5ea;padding:1.6em;border-radius:14px;border-left:8px solid #e3a857', { a: '#d48b2c', b: '#f5e6cc' },
    { tag: 'GRATITUDE', title: `今天想謝謝${U}`, sub: `${U}`, body: `今天被溫暖到的瞬間：${U}`, listTitle: '三件感恩的事', list: ['第一件', '第二件', '第三件'], end: '謝謝今天的自己。' }, { cover: '溫暖的照片' }],
  ['md-night-talk', '🌌 深夜獨白', '深紫星空・碎碎念', '心情', 'quote', 'background:radial-gradient(#fff 1px,transparent 1px) 0 0/40px 40px,linear-gradient(180deg,#221b3a,#3b2f5c);color:#ece6ff;padding:2em 1.6em;border-radius:14px', { a: '#b8a6ff', b: '#2c2448', t: '#e3dbff' },
    { tag: '02:00 AM', title: `${U}`, sub: `睡不著的夜`, body: `這個時間的我，在想${U}。`, listTitle: '深夜碎念', list: ['後悔的', '期待的', '想說沒說的'], end: '晚安，世界。' }, { cover: '夜空照片' }],

  // ---------- 學習工作 ----------
  ['wk-study', '📚 讀書筆記', '藍色筆記本＋重點標記', '學習工作', 'table', 'background:#f6f9fc;border-left:6px solid #3d7bd9;padding:1.4em;border-radius:6px', { a: '#3d7bd9', b: '#d7e4f7' },
    { tag: 'STUDY NOTE', title: `《${U}》`, sub: `作者 ${U}・讀到第 ${U} 頁`, body: `<span style="background:#fff3a8">${U}</span>（最有感的一句）`, listTitle: '筆記', list: ['重點', '疑問', '心得', '可以用在'], end: '評分：★★★★☆' }, { cover: '書封照片' }],
  ['wk-meeting', '💼 會議紀錄', '商務藍灰＋議程表', '學習工作', 'table', 'background:#fff;border:1px solid #cfd6df;border-top:6px solid #34495e;padding:1.4em;border-radius:4px', { a: '#34495e', b: '#e3e8ee' },
    { tag: 'MEETING', title: `${U}會議紀錄`, sub: `日期 ${U}・地點 ${U}`, body: `<b>出席：</b>${U}`, listTitle: '議程', list: ['討論事項', '決議', '待辦', '負責人', '期限'], end: '下次會議：＿＿＿＿' }, { cover: '白板照片' }],
  ['wk-project', '🚀 專案進度', '火箭主題＋進度條', '學習工作', 'steps', 'background:#f4f6fb;padding:1.5em;border-radius:14px;border:2px solid #6c63ff', { a: '#6c63ff', b: '#e4e2ff' },
    { tag: 'PROJECT', title: `🚀 ${U}`, sub: `進度 <span style="display:inline-block;width:120px;height:.6em;background:#e4e2ff;border-radius:99px;vertical-align:middle"><span style="display:block;width:60%;height:100%;background:#6c63ff;border-radius:99px"></span></span> ${U}%`, body: `本週完成：${U}`, listTitle: '里程碑', list: ['規劃', '製作', '測試', '上線'], end: '卡關的地方：＿＿＿＿' }, { cover: '專案截圖', album: ['畫面一', '畫面二'] }],
  ['wk-exam', '✏ 考前衝刺', '鉛筆黃＋倒數・讀書計畫', '學習工作', 'badge', 'background:#fffbea;border:2px solid #f2c94c;padding:1.5em;border-radius:10px', { a: '#e0a800', b: '#fff1b3' },
    { tag: 'D-' + U, title: `✏ ${U}考試衝刺`, sub: `目標分數 ${U}`, body: `今天讀了：${U}`, list: ['📖 國文', '🔢 數學', '🔤 英文', '🧪 自然'], end: '你可以的！💪' }, { cover: '書桌照片' }],
  ['wk-habit', '✅ 習慣打卡', '打勾格子＋連續天數', '學習工作', 'table', 'background:#f3faf5;border:2px solid #4caf7a;padding:1.4em;border-radius:12px', { a: '#2e8b57', b: '#d2ecdc' },
    { tag: 'HABIT TRACKER', title: `第 ${U} 天`, sub: `連續打卡 ${U} 天 🔥`, body: `今天的小進步：${U}`, listTitle: '打卡', list: ['💧 喝水', '🏃 運動', '📖 閱讀', '😴 早睡'], end: '☐ ☐ ☐ ☐ ☐ ☐ ☐' }, { cover: '今日紀錄' }],

  // ---------- 生活 ----------
  ['lf-pet', '🐶 毛孩成長', '狗狗腳印＋成長紀錄', '生活', 'table', 'background:#fdf6ee;border:2px solid #d9a066;border-radius:16px;padding:1.4em', { a: '#b5763a', b: '#f3dfc6' },
    { tag: 'PET LOG', title: `🐶 ${U}的成長日記`, sub: `${U} 歲 ${U} 個月`, body: `今天的${U}：${U}`, listTitle: '健康紀錄', list: ['體重', '飲食', '散步', '看醫生'], end: '🐾 謝謝你來到我身邊' }, { cover: '毛孩照片', album: ['睡姿', '玩耍'] }],
  ['lf-garden', '🪴 陽台園藝', '陶盆土色＋綠葉', '生活', 'steps', 'background:#f3f1e7;border-bottom:8px solid #a0673a;padding:1.4em;border-radius:8px', { a: '#5c8a3a', b: '#e0e8d0' },
    { tag: 'GARDEN', title: `🪴 ${U}長大了`, sub: `種下第 ${U} 天`, body: `今天發現：${U}`, listTitle: '照顧紀錄', list: ['澆水', '施肥', '日照'], end: '慢慢長，不著急 🌱' }, { cover: '植物照片', album: ['新芽', '花'] }],
  ['lf-home', '🏠 居家佈置', '木質暖色＋室內設計', '生活', 'bar', 'background:#f6efe6;padding:1.6em;border-radius:6px;border:1px solid #d6c3a8', { a: '#8b6a4a', b: '#e2d2bb' },
    { tag: 'HOME', title: `我的${U}改造`, sub: `預算 ${U}・花了 ${U} 天`, body: `改造前：${U}<br>改造後：${U}`, listTitle: '購物清單', list: ['家具', '燈', '小物'], end: '家，是最舒服的地方。' }, { cover: '房間照片', album: ['改造前', '改造後'] }],
  ['lf-fitness', '💪 運動紀錄', '螢光綠＋深灰・活力', '生活', 'table', 'background:#23272e;color:#eef2f5;padding:1.5em;border-radius:12px;border-left:8px solid #b6ff3b', { a: '#b6ff3b', b: '#3a404a', t: '#ffffff' },
    { tag: 'WORKOUT', title: `💪 ${U}訓練`, sub: `時間 ${U} 分鐘・消耗 ${U} 大卡`, body: `今天的狀態：${U}`, listTitle: '訓練內容', list: ['熱身', '主訓練', '組數', '收操'], end: 'NO PAIN, NO GAIN' }, { cover: '運動照片' }],
  ['lf-movie', '🎬 觀影心得', '電影票＋膠捲・影評', '生活', 'table', 'background:#1c1c1c;color:#f2f2f2;padding:1.5em;border:6px solid;border-image:repeating-linear-gradient(90deg,#1c1c1c 0 8px,#555 8px 14px) 6', { a: '#f5c518', b: '#333', t: '#f5c518' },
    { tag: 'NOW SHOWING', title: `🎬 《${U}》`, sub: `導演 ${U}・${U} 年`, body: `看完的第一個感覺：${U}`, listTitle: '評分', list: ['劇情', '演技', '畫面', '配樂'], end: '★★★★☆　推薦給：＿＿＿＿' }, { cover: '電影海報' }],
  ['lf-music', '🎧 歌單分享', '黑膠唱片＋音符', '生活', 'steps', 'background:radial-gradient(circle at 88% 18%,#222 0 34px,#444 35px 37px,#222 38px 50px,transparent 51px),#f5f0ff;padding:1.6em;border-radius:14px', { a: '#7c4dff', b: '#e7ddff' },
    { tag: 'PLAYLIST', title: `🎧 ${U}的歌單`, sub: `適合 ${U} 的時候聽`, body: `最近單曲循環：${U}`, listTitle: '歌單', list: ['第一首', '第二首', '第三首', '第四首'], end: '♪ 按下播放，一起聽 ♪' }, { cover: '專輯封面' }],
];

export const MORE_STYLES = DEFS.map(([id, name, desc, cat, layout, css, c, x, photos]) => ({
  id, name, desc, cat, css: css + (/[;]color:/.test(';' + css) ? '' : ';color:#3a3a3a'), ...L[layout](c, x), photos,
}));
