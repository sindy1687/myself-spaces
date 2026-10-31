// 管理後台：作品、分類、外觀範本、Drive 同步、備份、回收筒
import { list, listCategories, saveCategory, deleteCategory, mergeCategories, batchCategory, allWorks, tagStats, renameTag, deleteTag, getSettings, saveSettings, exportAll, importAll, listTrash, restore, purge, removeDemoData, get, save, trash, makeLock } from '../store.js';
import { esc, toast, confirmDialog, modal, fmtDate, attachUploadBtn } from '../util.js';
import * as gd from '../gdrive.js';
import { shareDialog } from './novel.js';
import { WS, wsUrl } from '../workspace.js';

const TABS = [['works', '作品管理'], ['categories', '分類管理'], ['appearance', '外觀範本'], ['site', '⚙ 網站設定'], ['music', '🎵 背景音樂'], ['drive', 'Google Drive'], ['backup', '備份'], ['trash', '回收筒']];
const THEMES = [
  ['literary', '文藝書房', '暖白米色・襯線字體・適合小說', '#faf5ec', '#3a3128'],
  ['floral', '花間手札', '植物綠・米白・壓花感・推薦主風格', '#f4f1e3', '#4a5140'],
  ['bear', '小熊奶油手帳', '奶油白・奶茶棕・柔和粉・可愛圖示', '#fff8ee', '#4a3a2c'],
  ['gallery', '極簡畫廊', '留白大圖・俐落排版・適合圖片', '#ffffff', '#111111'],
  ['journal', '日常手帳', '柔和配色・卡片設計・適合日記', '#fdf3f0', '#4a3b40'],
  ['night', '深夜創作', '深色背景・舒適對比・綜合作品', '#14161c', '#e6e4df'],
  ['ink', '墨韻書齋', '宣紙白・墨黑・極簡禪意', '#f7f5f0', '#1f1f23'],
  ['ocean', '海風信箋', '海沫白・深藍・清爽沉穩', '#eef4f6', '#1d2f3a'],
  ['sakura', '櫻色季節', '櫻花粉・米白・柔和卡片', '#fdf1f4', '#4a2e35'],
  ['matcha', '抹茶茶屋', '抹茶綠・米白・溫潤沉靜', '#f2f4ea', '#39402e'],
  ['sunset', '落日晚霞', '暖橘・杏白・熱情溫暖', '#fdf2e7', '#42291d'],
  ['mono', '黑白照相館', '純黑白・直角邊・俐落克制', '#ffffff', '#111111'],
  ['lavender', '薰衣草田', '淡紫・米白・夢幻溫柔', '#f4f1f8', '#3d3350'],
  ['newspaper', '舊報紙', '泛黃新聞紙・欄線分隔・號外大標', '#f1ece1', '#1d1b17'],
  ['pixel', '像素遊戲', '天空藍・粗黑像素框・8-bit 按鈕', '#9bd4ff', '#1a1a2e'],
  ['watercolor', '水彩繪本', '暈染水彩・手繪圓角・適合繪本', '#fbf8f3', '#3f3a4a'],
  ['cyber', '霓虹夜城', '深夜霓虹・螢光粉藍・切角卡片', '#0b0b1a', '#e8e6ff'],
  ['forest', '森林木屋', '木紋頁首・木框卡片・森林綠', '#e9e4d6', '#2f2a1f'],
  ['candy', '糖果汽水', '粉彩繽紛・彩色卡片・彈跳按鈕', '#fff7fb', '#4a3355'],
  ['kraft', '牛皮紙手作', '牛皮紙・縫線邊框・印章標題', '#d9bf98', '#3b2a1a'],
  ['vintage', '復古唱片', '70 年代條紋・黑膠唱片・暖橘咖啡', '#f4e4c1', '#3d2314'],
  ['chalk', '黑板粉筆', '綠色黑板・粉筆虛線・手寫字', '#2f4a3a', '#f1f1e8'],
  ['blueprint', '工程藍圖', '藍底白格線・等寬字・設計圖標注', '#1d4e89', '#eef5ff'],
  ['parchment', '奇幻古卷', '羊皮紙・金色框線・緞帶標題', '#e8d5ad', '#3a2a17'],
  ['aurora', '北極光', '深夜天空・流動極光・玻璃卡片', '#071a2b', '#e6f6ff'],
  ['memphis', '八零孟菲斯', '幾何圖形・鮮豔撞色・粗黑框', '#fffdf5', '#1b1b1b'],
  ['desert', '沙漠拱門', '赤陶沙丘・拱門卡片・夕陽色', '#f3e3cf', '#4a2c1d'],
  ['chiyogami', '和風千代紙', '青海波紋・藍紅配色・花紋外框', '#f7f1e8', '#2b2340'],
  ['comic', '漫畫格', '網點背景・對話框標題・爆炸特效', '#fffbe6', '#111111'],
  ['deco', '黑金奢華', '裝飾藝術・黑底金線・扇形紋', '#0e0e0e', '#efe6d0'],
  ['cloud', '雲朵夢境', '天空漸層・雲朵卡片・柔軟圓角', '#cfe8ff', '#34506b'],
  ['retro', '復古電腦', '90 年代視窗・藍色標題列・立體按鈕', '#008080', '#000000'],
  ['space', '星際旅行', '深紫宇宙・星點・環狀行星', '#0d0b24', '#ece9ff'],
  ['deepsea', '深海水族', '藍綠漸層・泡泡・圓潤卡片', '#06303f', '#dff7ff'],
  ['polaroid', '拍立得牆', '軟木板・白邊相片・紅色圖釘', '#c99a63', '#3a2a1c'],
  ['notebook', '方格筆記', '方格紙・紅色邊線・螢光筆標題', '#fbfbf7', '#24324a'],
  ['terminal', '駭客終端', '黑底綠字・等寬字・掃描線', '#050805', '#7dff8a'],
  ['neumorph', '柔霧擬態', '灰白柔光・凸起凹陷的立體感', '#e6e9ef', '#3c4560'],
  ['holo', '幻彩鐳射', '珍珠白・彩虹漸層邊框・夢幻光澤', '#f7f5fb', '#3a3550'],
  ['brutal', '新粗獷', '亮黃・粗黑框・硬陰影位移', '#fff3b0', '#000000'],
  ['swiss', '瑞士網格', '紅黑白・超大標題・細線網格', '#f4f4f0', '#111111'],
  ['xmas', '聖誕小屋', '紅綠配色・飄雪・金色星星', '#fbf6ef', '#3b2420'],
  ['halloween', '萬聖夜', '紫黑夜空・南瓜橘・月亮蝙蝠', '#1b1226', '#f4e9ff'],
  ['autumn', '楓紅秋日', '暖橙酒紅・楓葉・溫暖紙感', '#f8ecdc', '#4a2618'],
  ['winter', '冬日雪國', '冰藍・雪花・霜白卡片', '#eef5fb', '#23384d'],
  ['tropical', '熱帶度假', '湖水綠・珊瑚粉・夕陽海灘', '#fff8ef', '#1f3d3a'],
  ['redwall', '中式紅牆', '朱紅・金色框線・窗花圓框', '#f8efe1', '#3a1a12'],
  ['porcelain', '青花瓷', '白瓷底・鈷藍雙線・花紋圓盤', '#f7f9fc', '#16294d'],
  ['steampunk', '蒸汽齒輪', '黃銅・深棕皮革・鉚釘齒輪', '#2a1d14', '#f1dfc0'],
  ['gingham', '野餐格紋', '紅白格子・草地綠・虛線縫邊', '#fffdf8', '#3b2a24'],
  ['latte', '午後拿鐵', '奶泡米・焦糖棕・咖啡杯印', '#f3eadf', '#3e2b20'],
  ['y2k', '千禧亮片', 'Y2K 粉藍・鉻銀頁首・星星', '#fde7ff', '#3a1d5a'],
  ['vapor', '蒸氣波', '粉紫夕陽・透視網格・雙色殘影', '#2b1452', '#ffe9fb'],
  ['origami', '摺紙', '多彩紙片・摺角卡片・斜切橫幅', '#f2efe9', '#2d2a26'],
  ['stained', '彩繪玻璃', '黑色鉛條・寶石色塊・拱窗', '#1a1a22', '#f4efe6'],
  ['sketch', '鉛筆素描', '素描紙・手繪歪斜框線・螢光筆', '#fafaf7', '#2b2b2b'],
];

export async function renderAdmin(tab) {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="row"><h1 style="margin-right:auto">管理後台${WS ? ` <small class="muted" style="font-size:.55em">・${esc(WS)} 的網站</small>` : ''}</h1><button id="ad-pw">更改密碼</button><button id="ad-logout">登出</button></div><div class="tabs">${TABS.map(([k, n]) => `<button data-tab="${k}" class="${k === tab ? 'active' : ''}">${n}</button>`).join('')}</div><div id="tab-body"></div>`;
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
  ({ works, categories, appearance, site: siteTab, music, drive, backup, trash: trashTab }[tab] || works)(body);
}

// ---- 背景音樂：YouTube 歌單 ----
async function music(body) {
  const { parseYouTube, initMusic } = await import('../music.js');
  const s = await getSettings();
  let list = [...(s.music || [])];
  const persist = async patch => { await saveSettings({ music: list, ...patch }); initMusic(); };
  body.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0">加入音樂</h3>
      <p class="muted" style="margin-top:0">貼上 YouTube 網址：單一影片，或整個播放清單（網址裡有 <code>list=</code>）都可以。可以一次貼多行，每行一個。</p>
      <textarea id="mu-url" rows="3" placeholder="https://www.youtube.com/watch?v=…&#10;https://youtu.be/…&#10;https://www.youtube.com/playlist?list=…"></textarea>
      <div class="row" style="margin-top:.5rem"><button id="mu-add" class="primary">＋ 加入歌單</button><span class="muted" id="mu-msg"></span></div>
    </div>
    <div class="card" style="margin-top:1rem">
      <h3 style="margin-top:0">歌單 <span class="muted" id="mu-n"></span></h3>
      <ol id="mu-list" class="mu-list"></ol>
      <div class="row" style="margin-top:.6rem;gap:1.2rem">
        <label style="margin:0"><input type="checkbox" id="mu-show" ${s.musicShow === false ? '' : 'checked'} style="width:auto"> 在網站左下角顯示播放器</label>
        <label style="margin:0"><input type="checkbox" id="mu-loop" ${s.musicLoop === false ? '' : 'checked'} style="width:auto"> 播完從頭循環</label>
        <label style="margin:0"><input type="checkbox" id="mu-shuffle" ${s.musicShuffle ? 'checked' : ''} style="width:auto"> 隨機播放</label>
      </div>
      <p class="muted">瀏覽器規定有聲音的影片要按一下才能開始，所以打開網站後要先按播放器的 ▶。少數影片的上傳者禁止嵌入播放，遇到會自動跳下一首。</p>
    </div>`;
  const box = body.querySelector('#mu-list');
  const draw = () => {
    body.querySelector('#mu-n').textContent = `（${list.length}）`;
    box.innerHTML = list.map((t, i) => {
      const p = parseYouTube(t.url) || {};
      return `<li data-i="${i}">${p.video ? `<img src="https://i.ytimg.com/vi/${p.video}/default.jpg" alt="" loading="lazy">` : '<span class="mu-pl">≡</span>'}
        <input value="${esc(t.title || '')}" data-f="title" placeholder="歌名" aria-label="歌名">
        <span class="muted mu-kind">${p.list && !p.video ? '播放清單' : p.list ? '影片＋清單' : '影片'}</span>
        <button data-a="up" ${i ? '' : 'disabled'} aria-label="上移">↑</button><button data-a="down" ${i < list.length - 1 ? '' : 'disabled'} aria-label="下移">↓</button>
        <a href="${esc(t.url)}" target="_blank" rel="noopener"><button type="button" aria-label="在 YouTube 開啟">↗</button></a>
        <button data-a="del" class="danger" aria-label="刪除">✕</button></li>`;
    }).join('') || '<p class="muted">歌單是空的，從上方貼上 YouTube 網址加入。</p>';
  };
  draw();
  // 歌名：用 YouTube 公開的 oEmbed 取標題，取不到就用網址
  const fetchTitle = async url => {
    try { const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`); if (r.ok) return (await r.json()).title || ''; } catch { /* 網路或跨站限制 */ }
    return '';
  };
  body.querySelector('#mu-add').onclick = async () => {
    const lines = body.querySelector('#mu-url').value.split(/\s+/).map(x => x.trim()).filter(Boolean);
    const msg = body.querySelector('#mu-msg');
    const ok = [], bad = [];
    for (const url of lines) (parseYouTube(url) ? ok : bad).push(url);
    if (!ok.length) return toast(bad.length ? '這不是 YouTube 網址' : '請先貼上網址', 'error');
    msg.textContent = '讀取歌名中…';
    for (const url of ok) {
      const p = parseYouTube(url);
      const title = await fetchTitle(p.video ? `https://www.youtube.com/watch?v=${p.video}` : `https://www.youtube.com/playlist?list=${p.list}`) || (p.list && !p.video ? '播放清單' : url);
      list.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), url, title });
    }
    msg.textContent = '';
    body.querySelector('#mu-url').value = '';
    await persist(); draw();
    toast(`已加入 ${ok.length} 首${bad.length ? `，${bad.length} 行不是 YouTube 網址已略過` : ''}`, 'success');
  };
  box.addEventListener('change', async e => {
    const i = +e.target.closest('[data-i]')?.dataset.i;
    if (e.target.dataset.f === 'title' && list[i]) { list[i] = { ...list[i], title: e.target.value.trim() }; await persist(); }
  });
  box.addEventListener('click', async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const i = +b.closest('[data-i]').dataset.i, a = b.dataset.a;
    if (a === 'up') [list[i - 1], list[i]] = [list[i], list[i - 1]];
    if (a === 'down') [list[i + 1], list[i]] = [list[i], list[i + 1]];
    if (a === 'del') { if (!await confirmDialog(`從歌單移除「${list[i].title || list[i].url}」？`)) return; list.splice(i, 1); }
    await persist(); draw();
  });
  for (const [id, key] of [['#mu-show', 'musicShow'], ['#mu-loop', 'musicLoop'], ['#mu-shuffle', 'musicShuffle']])
    body.querySelector(id).onchange = e => persist({ [key]: e.target.checked });
}

// ---- 作品管理 ----
async function works(body) {
  const [novels, images, diaries, crafts, books] = await Promise.all([list('novel'), list('image'), list('diary'), list('craft'), list('book')]);
  const TYPE_NAME = { novel: '📖 小說', book: '📚 繪本', image: '🖼 圖片', diary: '📝 日記', craft: '✂ 手作' };
  const urlOf = (t, it) => ({ novel: `#/novel/${it.id}`, book: `#/book/${it.id}`, image: `#/image/${it.id}`, diary: `#/diary?open=${it.id}`, craft: `#/crafts?open=${it.id}` }[t]);
  const all = [...novels.map(i => ['novel', i]), ...books.map(i => ['book', i]), ...images.map(i => ['image', i]), ...diaries.map(i => ['diary', i]), ...crafts.map(i => ['craft', i])];
  const row = (type, it) => `<tr data-k="${type}:${it.id}" data-type="${type}" data-name="${esc((it.title || '').toLowerCase())}">
    <td><input type="checkbox" class="w-sel" aria-label="選取「${esc(it.title)}」" style="width:auto"></td>
    <td>${esc(it.title)} ${it.demo ? '<span class="tag">示範</span>' : ''}</td><td class="muted">${TYPE_NAME[type]}</td>
    <td class="muted">${fmtDate(it.updatedAt)}</td><td>${it.visibility === 'public' ? '公開' : '私人'}${it.lock?.hash ? ' 🔒' : ''}</td>
    <td class="row"><a href="${urlOf(type, it)}"><button>檢視</button></a><button data-lock="${type}:${it.id}" title="設定或移除觀看密碼">${it.lock?.hash ? '🔒 密碼' : '🔓 密碼'}</button><button data-share="${type}:${it.id}">分享</button><button data-del="${type}:${it.id}" class="danger">刪除</button></td></tr>`;
  body.innerHTML = `
    <div class="row" style="margin-bottom:.8rem"><a href="#/novels/import"><button class="primary">匯入小說</button></a><a href="#/gallery"><button class="primary">上傳圖片</button></a><a href="#/diary"><button class="primary">寫日記</button></a><a href="#/books"><button class="primary">做繪本</button></a>
    <span style="margin-left:auto"><button id="rm-demo">移除示範資料</button></span></div>
    <div class="row" style="margin-bottom:.6rem">
      <select id="w-type" style="width:auto"><option value="">全部類型（${all.length}）</option>${Object.entries(TYPE_NAME).map(([t, n]) => `<option value="${t}">${n}（${all.filter(x => x[0] === t).length}）</option>`).join('')}</select>
      <input id="w-q" placeholder="搜尋作品名稱…" style="max-width:220px">
    </div>
    <div class="w-bar row hidden" id="w-bar"><b id="w-count"></b>
      <button id="w-del" class="danger">🗑 刪除所選</button><button id="w-pub">設為公開</button><button id="w-priv">設為私人</button><button id="w-lock">🔒 設定密碼</button><button id="w-unlock">移除密碼</button><button id="w-none">取消選取</button></div>
    <div class="card"><table class="mtable"><tr><th><input type="checkbox" id="w-all" aria-label="全選目前列出的作品" style="width:auto"></th><th>作品</th><th>類型</th><th>更新</th><th>隱私</th><th></th></tr>
    ${all.map(([t, it]) => row(t, it)).join('')}
    </table><p class="muted hidden" id="w-empty" style="text-align:center">沒有符合的作品</p></div>`;
  document.getElementById('rm-demo').onclick = async () => {
    if (await confirmDialog('移除所有示範資料？')) { await removeDemoData(); toast('已移除示範資料', 'success'); renderAdmin('works'); }
  };
  // 篩選與複選：全選只作用在目前列出（未被篩掉）的列
  const rows = [...body.querySelectorAll('tr[data-k]')];
  const visible = () => rows.filter(r => !r.classList.contains('hidden'));
  const picked = () => rows.filter(r => r.querySelector('.w-sel').checked);
  const sync = () => {
    const n = picked().length, v = visible();
    body.querySelector('#w-bar').classList.toggle('hidden', !n);
    body.querySelector('#w-count').textContent = `已選 ${n} 件`;
    const allBox = body.querySelector('#w-all'), on = v.filter(r => r.querySelector('.w-sel').checked).length;
    allBox.checked = v.length > 0 && on === v.length; allBox.indeterminate = on > 0 && on < v.length;
    rows.forEach(r => r.classList.toggle('w-picked', r.querySelector('.w-sel').checked));
  };
  const filter = () => {
    const t = body.querySelector('#w-type').value, q = body.querySelector('#w-q').value.trim().toLowerCase();
    rows.forEach(r => r.classList.toggle('hidden', (t && r.dataset.type !== t) || (q && !r.dataset.name.includes(q))));
    body.querySelector('#w-empty').classList.toggle('hidden', visible().length > 0);
    sync();
  };
  body.querySelector('#w-type').onchange = filter;
  body.querySelector('#w-q').oninput = filter;
  body.querySelector('#w-all').onchange = e => { visible().forEach(r => { r.querySelector('.w-sel').checked = e.target.checked; }); sync(); };
  body.querySelectorAll('.w-sel').forEach(c => c.onchange = sync);
  // 點列的空白處也能勾選（按鈕、連結除外），按住 Shift 可連續選取
  let lastIdx = null;
  body.querySelector('table').addEventListener('click', e => {
    const r = e.target.closest('tr[data-k]'); if (!r || e.target.closest('button,a')) return;
    const box = r.querySelector('.w-sel');
    if (e.target !== box) box.checked = !box.checked;
    const i = rows.indexOf(r);
    if (e.shiftKey && lastIdx != null) visible().filter(x => { const k = rows.indexOf(x); return k >= Math.min(i, lastIdx) && k <= Math.max(i, lastIdx); }).forEach(x => { x.querySelector('.w-sel').checked = box.checked; });
    lastIdx = i; sync();
  });
  body.querySelector('#w-none').onclick = () => { rows.forEach(r => { r.querySelector('.w-sel').checked = false; }); sync(); };
  const keysOf = () => picked().map(r => r.dataset.k.split(':'));
  body.querySelector('#w-del').onclick = async () => {
    const ks = keysOf();
    if (!await confirmDialog(`把選取的 ${ks.length} 件作品移到回收筒？（之後可在「回收筒」還原）`, { danger: true, okText: `刪除 ${ks.length} 件` })) return;
    for (const [t, id] of ks) await trash(t, id);
    toast(`已移到回收筒：${ks.length} 件`, 'success'); renderAdmin('works');
  };
  const setVis = vis => async () => {
    const ks = keysOf();
    for (const [t, id] of ks) { const it = await get(t, id); if (it) await save(t, { ...it, visibility: vis }); }
    toast(`已將 ${ks.length} 件設為${vis === 'public' ? '公開' : '私人'}`, 'success'); renderAdmin('works');
  };
  body.querySelector('#w-pub').onclick = setVis('public');
  body.querySelector('#w-priv').onclick = setVis('private');
  body.querySelector('#w-lock').onclick = () => passwordDialog(keysOf());
  body.querySelector('#w-unlock').onclick = async () => {
    const ks = keysOf();
    for (const [t, id] of ks) { const it = await get(t, id); if (it?.lock) { const { lock, ...rest } = it; await save(t, rest); } }
    toast(`已移除 ${ks.length} 件的密碼`, 'success'); renderAdmin('works');
  };
  body.querySelectorAll('[data-lock]').forEach(b => b.onclick = () => passwordDialog([b.dataset.lock.split(':')]));
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const [t, id] = b.dataset.del.split(':');
    if (await confirmDialog('移至回收筒？')) { await trash(t, id); renderAdmin('works'); }
  });
  body.querySelectorAll('[data-share]').forEach(b => b.onclick = async () => {
    const [t, id] = b.dataset.share.split(':');
    shareDialog(await get(t, id));
  });
}

// 設定觀看密碼：keys = [[type, id], …]；設了密碼的作品會一併設為公開，訪客輸入密碼才看得到
async function passwordDialog(keys) {
  const items = (await Promise.all(keys.map(([t, id]) => get(t, id)))).filter(Boolean);
  if (!items.length) return;
  const one = items.length === 1 ? items[0] : null;
  modal(`
    <h3>🔒 設定觀看密碼</h3>
    <p class="muted" style="margin-top:0">${one ? `「${esc(one.title)}」` : `已選 ${items.length} 件作品（共用同一組密碼）`}</p>
    <label>密碼</label><input id="pw-1" type="password" autocomplete="new-password">
    <label>再輸入一次</label><input id="pw-2" type="password" autocomplete="new-password">
    <label>密碼提示（選填，訪客看得到）</label><input id="pw-hint" maxlength="60" value="${esc(one?.lock?.hint || '')}" placeholder="例如：我的生日四碼">
    <p class="muted" style="font-size:.85rem">設定後作品會改為「公開＋密碼」：出現在列表上但標示 🔒，訪客輸入正確密碼才能看內容；你登入後不用輸入。</p>
    <p id="pw-msg" role="alert" style="color:var(--danger,#c0392b)"></p>
    <div class="row" style="justify-content:flex-end">
      ${items.some(i => i.lock?.hash) ? '<button id="pw-rm" class="danger" style="margin-right:auto">移除密碼</button>' : ''}
      <button data-close>取消</button><button id="pw-ok" class="primary">儲存</button>
    </div>`, {
    onOpen(bg, close) {
      const $ = s => bg.querySelector(s);
      $('#pw-ok').onclick = async () => {
        const a = $('#pw-1').value, b = $('#pw-2').value;
        if (!a) return $('#pw-msg').textContent = '請輸入密碼';
        if (a !== b) return $('#pw-msg').textContent = '兩次輸入的密碼不一樣';
        const lock = await makeLock(a, $('#pw-hint').value.trim());
        for (const [t, id] of keys) { const it = await get(t, id); if (it) await save(t, { ...it, lock, visibility: 'public' }); }
        close(); toast(`已設定密碼：${items.length} 件`, 'success'); renderAdmin('works');
      };
      $('#pw-rm')?.addEventListener('click', async () => {
        for (const [t, id] of keys) { const it = await get(t, id); if (it?.lock) { const { lock, ...rest } = it; await save(t, rest); } }
        close(); toast('已移除密碼', 'success'); renderAdmin('works');
      });
    },
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
    const catSel = new Set();
    const row = (c, depth) => `<div class="chapter-item" style="padding-left:${depth * 22}px;${c.archived ? 'opacity:.5' : ''}">
      <input type="checkbox" class="c-sel" data-ck="${c.id}" ${catSel.has(c.id) ? 'checked' : ''} aria-label="選取「${esc(c.name)}」" style="width:auto">
      ${c.color ? `<span style="width:.9em;height:.9em;border-radius:3px;background:${esc(c.color)}"></span>` : ''}${esc(c.icon || '')}
      <span style="flex:1"><a href="#/category/${c.id}">${esc(c.name)}</a> <span class="muted">${esc(c.type)}・${countTxt(c.id)} 件${c.archived ? '・已封存' : ''}</span></span>
      <button data-e="${c.id}">編輯</button><button data-s="${c.id}">＋子</button><button data-m="${c.id}">合併</button>
      <button data-a="${c.id}">${c.archived ? '還原' : '封存'}</button><button data-d="${c.id}" class="danger">刪除</button></div>`;
    const drawKids = (pid, depth) => cats.filter(c => c.parentId === pid).map(c => row(c, depth) + drawKids(c.id, depth + 1)).join('');

    body.innerHTML = `
      <div class="card">
        <div class="row" style="flex-wrap:wrap">
          ${[['novel', '小說分類'], ['image', '圖片分類'], ['diary', '日記分類'], ['craft', '手作手札'], ['book', '繪本'], ['shared', '共用']].map(([v, n]) => `<button class="cat-tab ${curType === v ? 'primary' : ''}" data-t="${v}">${n}</button>`).join('')}
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
          <div style="flex:1"><label>類型</label><select id="c-type"><option value="shared">共用</option><option value="novel">小說</option><option value="image">圖片</option><option value="diary">日記</option><option value="craft">手作手札</option><option value="book">繪本</option></select></div>
          <div style="flex:1"><label>上層</label><select id="c-parent"><option value="">（無）</option>${cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
          <button id="c-add" class="primary">新增</button>
        </div>
        <div class="w-bar row hidden" id="c-bar" style="margin-top:.8rem"><b id="c-count"></b><button id="c-del-sel" class="danger">🗑 刪除所選分類</button><button id="c-sel-none">取消選取</button></div>
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
    const syncSel = () => {
      body.querySelector('#c-bar').classList.toggle('hidden', !catSel.size);
      body.querySelector('#c-count').textContent = `已選 ${catSel.size} 個分類`;
    };
    function bindRows() {
      listEl.querySelectorAll('.c-sel').forEach(b => b.onchange = () => { b.checked ? catSel.add(b.dataset.ck) : catSel.delete(b.dataset.ck); syncSel(); });
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
    body.querySelector('#c-sel-none').onclick = () => { catSel.clear(); drawList(); syncSel(); };
    // 一次刪除多個分類：作品移到同一個目的地（不能是要刪的分類），子分類自動上移一層
    body.querySelector('#c-del-sel').onclick = () => {
      const dels = cats.filter(c => catSel.has(c.id));
      const others = cats.filter(c => !catSel.has(c.id));
      modal(`<h3>刪除 ${dels.length} 個分類</h3>
        <p>${dels.map(c => `<span class="tag">${esc(c.name)}</span>`).join('')}</p>
        <label>這些分類下的作品移至</label><select id="mv-all"><option value="">未分類</option>${others.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select>
        <p class="muted">作品本身不會被刪除；沒被選到的子分類會自動上移一層。</p>
        <div class="row" style="justify-content:flex-end"><button data-close>取消</button><button id="mv-all-ok" class="danger">刪除 ${dels.length} 個分類</button></div>`, {
        onOpen(bg, close) {
          bg.querySelector('#mv-all-ok').onclick = async () => {
            const moveTo = bg.querySelector('#mv-all').value || null;
            for (const c of dels) await deleteCategory(c.id, { moveTo });
            close(); toast(`已刪除 ${dels.length} 個分類`, 'success'); redraw();
          };
        }
      });
    };
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
          <div style="flex:1"><label>類型</label><select id="ec-type">${['shared', 'novel', 'image', 'diary', 'craft', 'book'].map(t => `<option value="${t}" ${c.type === t ? 'selected' : ''}>${{ shared: '共用', novel: '小說', image: '圖片', diary: '日記', craft: '手作手札', book: '繪本' }[t]}</option>`).join('')}</select></div>
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
    ${tags.length ? '<div class="row" style="margin-bottom:.4rem"><label style="margin:0"><input type="checkbox" id="tg-all" style="width:auto"> 全選</label><span style="margin-left:auto"></span><button id="tg-del" class="danger" disabled>🗑 刪除所選標籤</button></div>' : ''}
    <div style="max-height:55vh;overflow:auto"><table>${tags.map(([t, n]) => `<tr><td><input type="checkbox" class="tg-sel" value="${esc(t)}" aria-label="選取「${esc(t)}」" style="width:auto"></td><td>${esc(t)}</td><td class="muted">${n} 次</td><td class="row"><button data-rn="${esc(t)}">改名/合併</button><button data-dt="${esc(t)}" class="danger">刪除</button></td></tr>`).join('') || '<tr><td class="muted">尚無標籤</td></tr>'}</table></div>
    <div class="row" style="justify-content:flex-end"><button data-close>關閉</button></div>`, {
    onOpen(bg, close) {
      const boxes = [...bg.querySelectorAll('.tg-sel')], delBtn = bg.querySelector('#tg-del');
      const sync = () => { const n = boxes.filter(b => b.checked).length; if (delBtn) { delBtn.disabled = !n; delBtn.textContent = n ? `🗑 刪除所選標籤（${n}）` : '🗑 刪除所選標籤'; } };
      boxes.forEach(b => b.onchange = sync);
      bg.querySelector('#tg-all')?.addEventListener('change', e => { boxes.forEach(b => { b.checked = e.target.checked; }); sync(); });
      delBtn?.addEventListener('click', async () => {
        const names = boxes.filter(b => b.checked).map(b => b.value);
        if (!await confirmDialog(`從所有作品移除這 ${names.length} 個標籤？（作品本身不會刪除）`, { danger: true, okText: '移除標籤' })) return;
        let n = 0;
        for (const t of names) n += await deleteTag(t);
        toast(`已移除 ${names.length} 個標籤（影響 ${n} 處）`, 'success'); close(); redraw();
      });
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
    <p class="muted">每套範本的頁首、背景、卡片、標題、按鈕、字體都不同；下方縮圖就是你的網站套上該範本的樣子。</p>
    <div class="grid theme-grid">${THEMES.map(([k, n, d, pbg]) => `
      <div class="card" style="text-align:center">
        <div class="theme-shot" style="background:${pbg}"><iframe src="index.html?preview=${k}#/" loading="lazy" tabindex="-1" aria-hidden="true" title="${n} 預覽"></iframe></div>
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
      <label><input type="checkbox" id="s-color-on" ${s.primaryColor ? 'checked' : ''} style="width:auto"> 自訂主色（不勾選就用範本自己的配色）</label>
      <input type="color" id="s-color" value="${esc(s.primaryColor || '#8b5e3c')}" ${s.primaryColor ? '' : 'disabled'}>
      <label>裝飾程度</label><select id="s-deco"><option value="simple" ${s.deco === 'simple' ? 'selected' : ''}>簡約</option><option value="standard" ${!s.deco || s.deco === 'standard' ? 'selected' : ''}>標準</option><option value="rich" ${s.deco === 'rich' ? 'selected' : ''}>豐富</option></select>
      <label><input type="checkbox" id="s-anim" ${s.anim === false ? '' : 'checked'} style="width:auto"> 啟用動畫</label>
      <div class="row" style="margin-top:.8rem"><button id="s-save" class="primary">儲存設定</button></div>
    </div>`;
  attachUploadBtn(body.querySelector('#s-avatar-up'), body.querySelector('#s-avatar'));
  attachUploadBtn(body.querySelector('#s-cover-up'), body.querySelector('#s-cover'));
  // 即時預覽／套用時先拿掉自訂主色，才看得到範本本來的配色
  const usePreset = () => document.documentElement.style.removeProperty('--primary');
  body.querySelectorAll('[data-try]').forEach(b => b.onclick = () => { usePreset(); document.body.dataset.theme = b.dataset.try; toast('預覽中（尚未儲存）'); });
  body.querySelectorAll('[data-theme]').forEach(b => b.onclick = async () => {
    await saveSettings({ theme: b.dataset.theme, primaryColor: '' });
    usePreset(); document.body.dataset.theme = b.dataset.theme;
    // 只更新按鈕狀態，不重畫整頁（重畫會讓 16 張縮圖重新載入、畫面跳回頂端）
    body.querySelectorAll('[data-theme]').forEach(x => { const on = x === b; x.className = on ? 'primary' : ''; x.textContent = on ? '使用中' : '套用'; });
    body.querySelector('#s-color-on').checked = false; body.querySelector('#s-color').disabled = true;
    toast('已套用範本（主色改用範本配色）', 'success');
  });
  body.querySelector('#s-color-on').onchange = e => { body.querySelector('#s-color').disabled = !e.target.checked; };
  body.querySelector('#s-save').onclick = async () => {
    const color = body.querySelector('#s-color-on').checked ? body.querySelector('#s-color').value : '';
    const deco = body.querySelector('#s-deco').value;
    const anim = body.querySelector('#s-anim').checked;
    await saveSettings({ siteName: body.querySelector('#s-name').value, siteDesc: body.querySelector('#s-desc').value, avatar: body.querySelector('#s-avatar').value, cover: body.querySelector('#s-cover').value, primaryColor: color, deco, anim });
    document.body.dataset.deco = deco;
    document.body.classList.toggle('no-anim', !anim);
    if (color) document.documentElement.style.setProperty('--primary', color); else usePreset();
    document.getElementById('site-title').textContent = body.querySelector('#s-name').value;
    document.title = body.querySelector('#s-name').value;
    toast('已儲存', 'success');
  };
}

// ---- 網站設定：公告、頁尾與社群、導覽列、閱讀、隱私與安全 ----
async function siteTab(body) {
  const s = await getSettings();
  const { SOCIALS, NAV_ITEMS, FONT_SCALES, applySitePrefs } = await import('../site-prefs.js');
  const a = s.announce || {}, hide = new Set(s.navHide || []);
  const chk = (id, on, text) => `<label class="opt-line"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}> ${text}</label>`;
  body.innerHTML = `
    <div class="card"><h3>📢 公告橫幅</h3>
      <p class="muted">顯示在網站最上方，例如「新章節每週五更新」「暑假停更」。訪客按 ✕ 關掉後不再出現，改了內容會再顯示。</p>
      ${chk('an-on', a.on, '顯示公告')}
      <label>公告內容</label><input id="an-text" maxlength="120" value="${esc(a.text || '')}" placeholder="例如：《歸墟》第二卷開始連載！">
      <div class="row"><div style="flex:2"><label>連結（選填）</label><input id="an-link" value="${esc(a.link || '')}" placeholder="#/novels 或 https://…"></div>
        <div style="flex:1"><label>連結文字</label><input id="an-lt" value="${esc(a.linkText || '')}" placeholder="查看"></div>
        <div style="flex:1"><label>顏色</label><select id="an-tone">${[['info', '主色'], ['warn', '提醒（黃）'], ['soft', '低調']].map(([v, n]) => `<option value="${v}" ${(a.tone || 'info') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
    </div>
    <div class="card" style="margin-top:1rem"><h3>🔗 頁尾與社群連結</h3>
      <label>頁尾文字</label><input id="ft-text" value="${esc(s.footerText ?? '')}" placeholder="© {year} {name}・作品版權所有，請勿轉載">
      <p class="muted" style="font-size:.85rem;margin:.2rem 0">{year} 會自動換成今年、{name} 換成網站名稱。空白就不顯示頁尾。</p>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:.2rem .8rem">
        ${SOCIALS.map(([k, n, ph]) => `<div><label>${n}</label><input data-social="${k}" value="${esc(s.social?.[k] || '')}" placeholder="${esc(ph)}"></div>`).join('')}</div>
    </div>
    <div class="card" style="margin-top:1rem"><h3>🧭 導覽列與顯示</h3>
      <p class="muted">沒在用的區塊可以從選單隱藏（網址仍可進入，作品不受影響）。</p>
      <div class="row" style="flex-wrap:wrap;gap:.3rem 1.2rem">${NAV_ITEMS.map(([k, n]) => `<label class="opt-line"><input type="checkbox" data-nav="${k}" ${hide.has(k) ? '' : 'checked'}> ${n}</label>`).join('')}</div>
      <label>全站字級</label><select id="st-font">${FONT_SCALES.map(([v, n]) => `<option value="${v}" ${(s.fontScale || 'normal') === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <label>網站圖示（瀏覽器分頁上的小圖，空白就用頭像）</label><div class="field-inline"><input id="st-fav" value="${esc(s.favicon || '')}" placeholder="網址或上傳（正方形最好）"><button id="st-fav-up" type="button">上傳</button></div>
    </div>
    <div class="card" style="margin-top:1rem"><h3>🔐 隱私與安全</h3>
      <label>新作品預設</label><select id="st-vis"><option value="private" ${s.defaultVisibility !== 'public' ? 'selected' : ''}>私人（要手動設為公開，比較安全）</option><option value="public" ${s.defaultVisibility === 'public' ? 'selected' : ''}>公開（上傳就給訪客看）</option></select>
      ${chk('st-protect', s.protectImages, '訪客不能用右鍵／拖曳另存圖片（擋一般人，擋不住截圖）')}
      ${chk('st-noindex', s.noindex, '不要讓 Google 等搜尋引擎收錄這個網站')}
      <label>閒置自動登出</label><select id="st-idle">${[[0, '不自動登出'], [15, '15 分鐘'], [30, '30 分鐘'], [60, '1 小時'], [180, '3 小時']].map(([v, n]) => `<option value="${v}" ${(+s.idleLogout || 0) === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <p class="muted" style="font-size:.85rem">在別人的電腦或手機登入後忘了登出時很有用。</p>
    </div>
    <div class="row" style="margin-top:1rem;position:sticky;bottom:.5rem"><button id="st-save" class="primary">儲存網站設定</button></div>`;
  attachUploadBtn(body.querySelector('#st-fav-up'), body.querySelector('#st-fav'));
  const $ = q => body.querySelector(q);
  $('#st-save').onclick = async () => {
    const social = {};
    body.querySelectorAll('[data-social]').forEach(i => { if (i.value.trim()) social[i.dataset.social] = i.value.trim(); });
    await saveSettings({
      announce: { on: $('#an-on').checked, text: $('#an-text').value.trim(), link: $('#an-link').value.trim(), linkText: $('#an-lt').value.trim(), tone: $('#an-tone').value },
      footerText: $('#ft-text').value.trim(), social,
      navHide: [...body.querySelectorAll('[data-nav]')].filter(c => !c.checked).map(c => c.dataset.nav),
      fontScale: $('#st-font').value, favicon: $('#st-fav').value.trim(),
      defaultVisibility: $('#st-vis').value, protectImages: $('#st-protect').checked, noindex: $('#st-noindex').checked, idleLogout: +$('#st-idle').value,
    });
    try { localStorage.removeItem('announce-closed'); } catch { /* 無痕模式 */ }
    await applySitePrefs(await getSettings());
    toast('已儲存網站設定', 'success');
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
    ${WS ? `<div class="card" style="margin-top:1rem">
      <h3>☁ 我的網站資料</h3>
      <p>你的網站網址：<a href="${esc(wsUrl(WS))}" target="_blank" rel="noopener"><code>${esc(location.origin + wsUrl(WS, ''))}</code></a> <button id="d-copy" type="button">複製</button></p>
      <p class="muted">你的作品存在雲端自己的資料檔裡（和其他人分開）。新增或修改作品後，按「上傳」訪客才看得到最新內容；換電腦登入時按「讀取」。</p>
      <div class="row"><button id="d-ws-up" class="primary">上傳到雲端（只傳新的）</button><button id="d-ws-down">從雲端讀取我的資料</button></div>
    </div>` : ''}
    <div class="card ${WS ? 'hidden' : ''}" style="margin-top:1rem">
      <h3>Apps Script 同步</h3>
      <p class="muted">把 <code>gas/Code.gs</code> 貼到 Google Apps Script 並部署為網路應用程式（執行身分「我」），貼上 /exec 網址即可一鍵上傳所有資料到指定資料夾，不需要 OAuth Client ID。</p>
      <label>Apps Script Web App URL</label><input id="d-gas" value="${esc(s.gasUrl || '')}" placeholder="https://script.google.com/macros/s/.../exec">
      <label>目標資料夾 ID</label><input id="d-fid" value="${esc(s.driveFolderId || '1OEQ7Cjq6AK6QAeU1CgaxYN0GjdAaIwdF')}">
      <div class="row" style="margin-top:.6rem"><button id="d-gas-save">儲存設定</button><button id="d-gas-up" class="primary">上傳到雲端（只傳新的）</button><button id="d-gas-down">從雲端讀取最新資料</button></div>
    </div>`;
  gd.onSyncChange(() => drive(body));
  if (WS) {
    body.querySelector('#d-copy').onclick = () => navigator.clipboard.writeText(location.origin + wsUrl(WS, '')).then(() => toast('已複製網址', 'success'), () => toast('無法複製，請手動選取', 'error'));
    body.querySelector('#d-ws-up').onclick = async () => {
      try { const r = await gd.uploadViaAppsScript(s.gasUrl); toast(r.message || '上傳完成', 'success'); } catch (e) { toast(e.message, 'error'); }
      drive(body);
    };
    body.querySelector('#d-ws-down').onclick = async () => {
      if (!await confirmDialog('用雲端的資料覆蓋這台裝置上的資料？')) return;
      try { await importAll(await gd.loadViaAppsScript(s.gasUrl), { merge: false }); toast('已讀取雲端資料', 'success'); location.reload(); }
      catch (e) { toast(e.message, 'error'); }
    };
  }
  body.querySelector('#d-gas-save').onclick = async () => { await saveSettings({ gasUrl: body.querySelector('#d-gas').value.trim(), driveFolderId: body.querySelector('#d-fid').value.trim() }); toast('已儲存', 'success'); };
  body.querySelector('#d-gas-up').onclick = async () => {
    const url = body.querySelector('#d-gas').value.trim();
    if (!url) return toast('請先填入 Apps Script Web App URL', 'error');
    await saveSettings({ gasUrl: url, driveFolderId: body.querySelector('#d-fid').value.trim() });
    try { const r = await gd.uploadViaAppsScript(url, body.querySelector('#d-fid').value.trim()); toast(r.message || '上傳完成', 'success'); }
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
  const items = (await listTrash()).sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
  const TYPE_NAME = { novel: '📖 小說', book: '📚 繪本', image: '🖼 圖片', diary: '📝 日記', craft: '✂ 手作' };
  body.innerHTML = items.length ? `
    <div class="row" style="margin-bottom:.6rem"><span class="muted">共 ${items.length} 件</span><span style="margin-left:auto"></span><button id="tr-empty" class="danger">清空回收筒</button></div>
    <div class="w-bar row hidden" id="tr-bar"><b id="tr-count"></b><button id="tr-res">↩ 還原所選</button><button id="tr-pur" class="danger">永久刪除所選</button></div>
    <div class="card"><table class="mtable"><tr><th><input type="checkbox" id="tr-all" aria-label="全選" style="width:auto"></th><th>項目</th><th>類型</th><th>刪除時間</th><th></th></tr>
    ${items.map(t => `<tr data-k="${t.id}"><td><input type="checkbox" class="tr-sel" aria-label="選取「${esc(t.title)}」" style="width:auto"></td><td>${esc(t.title)}</td><td>${TYPE_NAME[t.type] || esc(t.type)}</td><td class="muted">${new Date(t.deletedAt).toLocaleString('zh-TW')}</td>
    <td class="row"><button data-res="${t.id}">還原</button><button data-pur="${t.id}" class="danger">永久刪除</button></td></tr>`).join('')}</table></div>`
    : '<div class="empty">回收筒是空的</div>';
  if (items.length) {
    const boxes = [...body.querySelectorAll('.tr-sel')];
    const picked = () => boxes.filter(b => b.checked).map(b => b.closest('tr').dataset.k);
    const sync = () => {
      const n = picked().length;
      body.querySelector('#tr-bar').classList.toggle('hidden', !n);
      body.querySelector('#tr-count').textContent = `已選 ${n} 件`;
      const all = body.querySelector('#tr-all'); all.checked = n === boxes.length; all.indeterminate = n > 0 && n < boxes.length;
      boxes.forEach(b => b.closest('tr').classList.toggle('w-picked', b.checked));
    };
    boxes.forEach(b => b.onchange = sync);
    body.querySelector('#tr-all').onchange = e => { boxes.forEach(b => { b.checked = e.target.checked; }); sync(); };
    body.querySelector('table').addEventListener('click', e => {
      const r = e.target.closest('tr[data-k]'); if (!r || e.target.closest('button,input')) return;
      const b = r.querySelector('.tr-sel'); b.checked = !b.checked; sync();
    });
    body.querySelector('#tr-res').onclick = async () => { const ks = picked(); for (const k of ks) await restore(k); toast(`已還原 ${ks.length} 件`, 'success'); trashTab(body); };
    const purgeMany = async (ks, what) => {
      if (!await confirmDialog(`永久刪除${what}（${ks.length} 件）？刪除後無法復原。`, { danger: true, okText: '永久刪除' })) return;
      for (const k of ks) await purge(k);
      toast(`已永久刪除 ${ks.length} 件`, 'success'); trashTab(body);
    };
    body.querySelector('#tr-pur').onclick = () => purgeMany(picked(), '選取的項目');
    body.querySelector('#tr-empty').onclick = () => purgeMany(items.map(t => t.id), '回收筒裡的全部項目');
  }
  body.querySelectorAll('[data-res]').forEach(b => b.onclick = async () => { await restore(b.dataset.res); toast('已還原', 'success'); trashTab(body); });
  body.querySelectorAll('[data-pur]').forEach(b => b.onclick = async () => {
    if (await confirmDialog('永久刪除後無法復原，確定？', { danger: true })) { await purge(b.dataset.pur); trashTab(body); }
  });
}
