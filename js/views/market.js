// 市集：大家公開分享的小說、文章、圖片；付費作品用點數購買，點數由 Apps Script 記帳（網站端改不了）
// 發文（上架）會得到點數；買別人的作品，點數會轉給作者
import { getSettings, list, get } from '../store.js';
import { db } from '../db.js';
import { esc, toast, modal, confirmDialog, sanitizeHTML, isFid, fmtDate, hydrateMedia } from '../util.js';
import { authed, wsKey, authFields } from '../workspace.js';
import { setActiveNav } from '../app.js';
import { volumeLabel } from '../chapters.js';

const app = document.getElementById('app');
const TYPE_NAME = { novel: '📖 小說', diary: '📝 文章', image: '🖼 圖片' };
const loggedIn = () => authed() && !!wsKey();

async function call(action, payload = {}) {
  const { gasUrl } = await getSettings();
  if (!gasUrl) throw new Error('尚未設定 Apps Script 網址');
  let r;
  // 雲端一直沒回應時不要讓畫面卡住：上架給 2 分鐘，其他 30 秒
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), action === 'm.publish' ? 120000 : 30000);
  try {
    r = await fetch(gasUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action, ...payload, ...(loggedIn() ? authFields() : {}) }), signal: ctl.signal }).then(x => x.json());
  } catch (e) { throw new Error(e.name === 'AbortError' ? '雲端太久沒有回應，請稍後再試' : '連不上雲端，請檢查網路'); }
  finally { clearTimeout(timer); }
  if (!r.ok && /unknown action|TypeError|Cannot read/i.test(r.error || '')) throw new Error('雲端的 Apps Script 還是舊版，請站長更新 gas/Code.gs 並重新部署');
  if (!r.ok) throw Object.assign(new Error(r.code === 'bad-login' ? '登入已失效，請登出後重新登入' : r.error || '發生錯誤'), { code: r.code });
  // 回應裡有最新餘額（購買、上架、我的點數、市集首頁）就同步更新頁首的點數
  const balance = typeof r.balance === 'number' ? r.balance : r.me?.balance;
  if (typeof balance === 'number') dispatchEvent(new CustomEvent('points-changed', { detail: { balance } }));
  return r;
}

// 要登入才能做的事：沒登入就跳登入視窗（帶金鑰的登入）
async function needLogin() {
  if (loggedIn()) return true;
  if (authed()) { toast('請登出後重新登入一次，才能使用點數', 'error'); return false; }
  const { requireAuth } = await import('../auth.js');
  return requireAuth();
}

const priceTag = l => l.price ? `<span class="mk-price">💰 ${l.price} 點</span>` : '<span class="mk-price free">免費</span>';
// 27.2 萬字；一萬以下照實寫
const wordsText = n => n >= 10000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, '')} 萬字` : `${n.toLocaleString()} 字`;
const metaLine = l => [l.type === 'novel' ? `${l.chapters} 章` : '', l.words ? wordsText(l.words) : '', l.sales ? `${l.sales} 人購買` : '', l.comments ? `💬 ${l.comments}` : ''].filter(Boolean).join('・');
const authorOf = l => l.author || l.seller;
// 連載中／已完結／暫停，顏色和小說書架一樣
const statusBadge = s => !s ? '' : `<span class="badge ${s === '已完結' ? 'badge-done' : s === '暫停' ? 'badge-pause' : 'badge-serial'} mk-status">${esc(s)}</span>`;
// 小說標單本／叢書；文章、圖片只標類型
const seriesLine = l => l.type !== 'novel' ? TYPE_NAME[l.type] : l.series ? `📚 叢書《${esc(l.series)}》${esc(l.volume || '')}` : '📕 單本';

// 書本封面：書脊陰影＋價格書籤；沒有封面就用主色做一個，書名直排
function bookCover(l, { blur = false, owned = false, tag = true } = {}) {
  const face = l.cover
    ? `<img src="${esc(l.cover)}" alt="${esc(l.title)}封面"${blur ? ' class="mk-blur"' : ''}>`
    : `<div class="bk-plain"><span class="bk-title">${esc(l.title)}</span><span class="bk-author">${esc(authorOf(l))}</span></div>`;
  const price = !tag ? '' : owned ? '<span class="bk-tag owned">✔ 已購買</span>' : `<span class="bk-tag${l.price ? '' : ' free'}">${l.price ? `${l.price} 點` : '免費'}</span>`;
  const vol = l.series && l.volume ? `<span class="bk-vol">${esc(l.volume)}</span>` : '';
  return `<div class="bk">${face}${vol}${price}</div>`;
}

function shell(inner) {
  app.innerHTML = inner;
  setActiveNav('#/market');
}
const loading = msg => shell(`<div class="empty">${esc(msg)}</div>`);
const fail = e => shell(`<div class="empty"><h2>讀取失敗</h2><p>${esc(e.message)}</p><a href="#/market">回市集</a></div>`);

// ---- 市集首頁 ----
export async function renderMarket() {
  loading('市集載入中…');
  let r;
  try { r = await call('m.list'); } catch (e) { return fail(e); }
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const type = q.get('type') || '';
  const owned = new Set(r.me?.bought || []);
  const items = r.listings.filter(l => !type || l.type === type);
  const chip = (t, n) => `<a class="album-chip ${type === t ? 'on' : ''}" href="#/market${t ? '?type=' + t : ''}">${n}</a>`;
  shell(`
    <div class="row"><h1 style="margin-right:auto">🛒 市集</h1>
      ${r.me ? `<a href="#/market/me" class="mk-wallet">💰 ${r.me.balance} 點・${esc(r.me.user)}</a>` : '<button id="mk-login">登入看我的點數</button>'}
      <button id="mk-pub" class="primary">＋ 上架作品</button></div>
    <p class="muted">大家願意分享的作品。買別人的作品，點數會轉給作者。</p>
    <div class="cat-row" style="margin:.6rem 0 1rem">${chip('', '全部')}${chip('novel', TYPE_NAME.novel)}${chip('diary', TYPE_NAME.diary)}${chip('image', TYPE_NAME.image)}</div>
    ${items.length ? `<div class="mk-shelf">${items.map(l => `
      <a class="mk-book${l.type === 'image' ? ' is-image' : ''}" href="#/market/${l.id}">
        ${bookCover(l, { blur: l.type === 'image' && l.price && !owned.has(l.id), owned: owned.has(l.id) })}
        <h3>${esc(l.title)}</h3>
        <div class="mk-series">${seriesLine(l)}</div>
        <div class="muted">作者 ${esc(authorOf(l))}</div>
        ${l.desc ? `<p class="mk-desc">${esc(l.desc)}</p>` : ''}
        <div class="muted mk-meta">${statusBadge(l.status)}${metaLine(l)}</div>
      </a>`).join('')}</div>` : '<div class="empty">還沒有作品，來當第一個上架的人吧！</div>'}`);
  document.getElementById('mk-pub').onclick = async () => { if (await needLogin()) publishDialog(); };
  document.getElementById('mk-login')?.addEventListener('click', async () => { if (await needLogin()) renderMarket(); });
}

// ---- 作品頁：買過／免費看全文，沒買看試看 ----
export async function renderMarketItem(id) {
  loading('讀取作品中…');
  let r;
  try { r = await call('m.get', { id }); } catch (e) { return fail(e); }
  const l = r.listing, mine = r.me && r.me === l.seller;
  shell(`
    <p><a href="#/market">← 回市集</a></p>
    <div class="card mk-head">
      <div class="mk-book${l.type === 'image' ? ' is-image' : ''}">${bookCover(l, { blur: l.type === 'image' && !r.full, tag: false })}</div>
      <div style="flex:1;min-width:14em">
        <h1 style="margin:.2em 0">${esc(l.title)}</h1>
        <p class="mk-series" style="font-size:1rem">${statusBadge(l.status)}${seriesLine(l)}</p>
        <p class="muted">作者 ${esc(authorOf(l))}${l.author && l.author !== l.seller ? `・上架 ${esc(l.seller)}` : ''}・${fmtDate(l.createdAt)}${metaLine(l) ? '・' + metaLine(l) : ''}</p>
        ${l.desc ? `<p style="white-space:pre-wrap">${esc(l.desc)}</p>` : ''}
        <div class="row">${priceTag(l)}
          ${r.full ? (mine ? '<span class="tag">我的作品</span>' : r.bought ? '<span class="tag">✔ 已購買</span>' : '') : `<button id="mk-buy" class="primary">用 ${l.price} 點購買</button>`}
          ${mine || r.admin ? '<button id="mk-edit">編輯資料</button><button id="mk-remove" class="danger">下架</button>' : ''}</div>
      </div>
    </div>
    <div id="mk-body" style="margin-top:1rem"></div>
    <div id="mk-cmts"></div>`);
  const body = document.getElementById('mk-body');
  if (r.full) showContent(body, l, r.content);
  else showPreview(body, l, r.preview);
  drawComments(document.getElementById('mk-cmts'), l, r, r.comments || []);
  document.getElementById('mk-buy')?.addEventListener('click', () => buy(l));
  document.getElementById('mk-edit')?.addEventListener('click', () => editDialog(l));
  document.getElementById('mk-remove')?.addEventListener('click', async () => {
    if (!await confirmDialog(`下架「${l.title}」？已經買的人還是看得到。`, { danger: true, okText: '下架' })) return;
    try { await call('m.remove', { id: l.id }); toast('已下架', 'success'); location.hash = '#/market'; } catch (e) { toast(e.message, 'error'); }
  });
}

// ---- 讀者留言 ----
function drawComments(box, l, r, list) {
  const canDel = c => r.me && (c.user === r.me || r.me === l.seller || r.admin);
  const who = c => c.user === l.seller ? `${esc(authorOf(l))} <span class="tag mk-author-tag">作者</span>` : esc(c.user);
  const form = r.canComment
    ? `<div class="mk-cmt-form"><textarea id="mk-cmt-text" rows="3" maxlength="500" placeholder="寫下你的心得…"></textarea>
        <div class="row" style="justify-content:flex-end"><span class="muted" id="mk-cmt-err" style="margin-right:auto;color:#b3443c"></span><button id="mk-cmt-send" class="primary">送出留言</button></div></div>`
    : `<p class="muted">${r.me ? '購買後就可以留言。' : '<a href="#" id="mk-cmt-login">登入</a>並購買後就可以留言。'}</p>`;
  box.innerHTML = `
    <h2 class="section-title">讀者留言（${list.length}）</h2>
    <div class="card">
      ${list.length ? list.map(c => `
        <div class="mk-cmt">
          <div class="row"><b>${who(c)}</b><span class="muted" style="font-size:.8rem">${new Date(c.t).toLocaleString('zh-TW')}</span>
            ${canDel(c) ? `<button class="mk-cmt-del" data-cid="${esc(c.id)}" title="刪除留言">刪除</button>` : ''}</div>
          <p>${esc(c.text)}</p>
        </div>`).join('') : '<p class="muted">還沒有留言。</p>'}
      ${form}
    </div>`;
  const redraw = res => drawComments(box, l, r, res.comments);
  box.querySelector('#mk-cmt-login')?.addEventListener('click', async e => { e.preventDefault(); if (await needLogin()) renderMarketItem(l.id); });
  box.querySelector('#mk-cmt-send')?.addEventListener('click', async e => {
    const text = box.querySelector('#mk-cmt-text').value.trim();
    if (!text) return;
    e.target.disabled = true;
    try { redraw(await call('m.comment', { id: l.id, text })); }
    catch (err) { box.querySelector('#mk-cmt-err').textContent = err.message; e.target.disabled = false; }
  });
  box.querySelectorAll('.mk-cmt-del').forEach(b => b.onclick = async () => {
    if (!await confirmDialog('刪除這則留言？', { danger: true, okText: '刪除' })) return;
    try { redraw(await call('m.uncomment', { id: l.id, cid: b.dataset.cid })); } catch (err) { toast(err.message, 'error'); }
  });
}

async function buy(l) {
  if (!await needLogin()) return;
  if (!await confirmDialog(`用 ${l.price} 點購買「${l.title}」？點數會轉給作者 ${l.seller}。`, { okText: '購買' })) return;
  try {
    const r = await call('m.buy', { id: l.id });
    toast(`購買成功，剩下 ${r.balance} 點`, 'success');
    renderMarketItem(l.id);
  } catch (e) { toast(e.message, 'error'); }
}

function novelReader(body, chapters, { lockedAfter = 0 } = {}) {
  let cur = 0;
  const draw = () => {
    const c = chapters[cur];
    body.innerHTML = `
      <div class="row" style="margin-bottom:.6rem"><select id="mk-ch" style="width:auto;max-width:100%">${chapters.map((x, i) => `<option value="${i}" ${i === cur ? 'selected' : ''}>${i + 1}. ${esc(x.title)}</option>`).join('')}</select>
        ${lockedAfter ? `<span class="muted">試看前 ${chapters.length} 章，之後的 ${lockedAfter} 章要購買</span>` : ''}</div>
      <div class="reader-wrap card"><h1 style="font-size:1.4em">${esc(c.title)}</h1>${c.content.split(/\n+/).filter(p => p.trim()).map(p => `<p>${esc(p.trim())}</p>`).join('')}
        <div class="row" style="justify-content:space-between;margin:2rem 0">
          ${cur > 0 ? '<button id="mk-prev">← 上一章</button>' : '<span></span>'}
          ${cur < chapters.length - 1 ? '<button id="mk-next" class="primary">下一章 →</button>' : lockedAfter ? '<span class="muted">🔒 後面的章節要購買才能看</span>' : '<span class="muted">已是末章</span>'}
        </div></div>`;
    body.querySelector('#mk-ch').onchange = e => { cur = +e.target.value; draw(); };
    body.querySelector('#mk-prev')?.addEventListener('click', () => { cur--; draw(); body.scrollIntoView(); });
    body.querySelector('#mk-next')?.addEventListener('click', () => { cur++; draw(); body.scrollIntoView(); });
  };
  draw();
}

function showContent(body, l, c) {
  if (l.type === 'novel') return novelReader(body, c.chapters);
  if (l.type === 'diary') { body.innerHTML = `<div class="card diary-content">${sanitizeHTML(c.html)}</div>`; hydrateMedia(body); return; }
  body.innerHTML = `<div class="card" style="text-align:center"><img src="${esc(c.data)}" alt="${esc(l.title)}" style="max-width:100%;border-radius:var(--radius)"><p><a href="${esc(c.data)}" download="${esc(l.title)}.jpg"><button>下載</button></a></p></div>`;
}

function showPreview(body, l, p) {
  const lock = `<div class="card mk-lock">🔒 購買後可以看完整內容（${l.price} 點）</div>`;
  if (l.type === 'novel') {
    if (!p.chapters?.length) { body.innerHTML = lock; return; }
    novelReader(body, p.chapters, { lockedAfter: l.chapters - p.chapters.length });
    body.insertAdjacentHTML('beforeend', lock);
    return;
  }
  if (l.type === 'diary') { body.innerHTML = `<div class="card mk-fade"><p>${esc(p.text)}…</p></div>${lock}`; return; }
  body.innerHTML = lock;
}

// ---- 我的點數：餘額、明細、我上架的、我買的 ----
export async function renderMarketMe() {
  if (!await needLogin()) return;
  loading('讀取中…');
  let r, all;
  try { [r, all] = await Promise.all([call('m.me'), call('m.list')]); } catch (e) { return fail(e); }
  const byId = new Map(all.listings.map(l => [l.id, l]));
  const TX = { signup: '🎁', post: '✍', buy: '🛒', sale: '💰' };
  shell(`
    <p><a href="#/market">← 回市集</a></p>
    <h1>💰 我的點數</h1>
    <div class="card"><div style="font-size:2.2rem;font-weight:700">${r.balance} 點</div>
      <p class="muted">${esc(r.user)}・今天已得發文點數 ${r.postedToday}/${r.rules.DAILY_MAX} 篇</p></div>
    <h2 class="section-title">點數明細</h2>
    <div class="card">${r.tx.length ? r.tx.map(t => `<div class="chapter-item"><span>${TX[t.type] || '•'}</span><span style="flex:1">${t.id ? `<a href="#/market/${t.id}">${esc(t.note)}</a>` : esc(t.note)}</span><span class="muted">${new Date(t.t).toLocaleString('zh-TW')}</span><b style="color:${t.amt < 0 ? '#b3443c' : '#3a7d44'}">${t.amt > 0 ? '+' : ''}${t.amt}</b></div>`).join('') : '<p class="muted">還沒有紀錄</p>'}</div>
    <h2 class="section-title">我上架的作品（${r.mine.length}）</h2>
    <div class="card">${r.mine.length ? r.mine.map(l => `<div class="chapter-item"><a href="#/market/${l.id}" style="flex:1">${esc(l.title)}</a><span class="muted">${TYPE_NAME[l.type]}・${l.price ? l.price + ' 點' : '免費'}・賣出 ${l.sales || 0}</span></div>`).join('') : '<p class="muted">還沒有上架作品</p>'}</div>
    <h2 class="section-title">我買的作品（${r.bought.length}）</h2>
    <div class="card">${r.bought.length ? r.bought.map(id => { const l = byId.get(id); return `<div class="chapter-item"><a href="#/market/${id}" style="flex:1">${esc(l?.title || '（已下架的作品）')}</a><span class="muted">${l ? esc(l.seller) : ''}</span></div>`; }).join('') : '<p class="muted">還沒有買過作品</p>'}</div>`);
}

// ---- 上架：從自己的作品挑一件，設定價格 ----
// 圖片縮小後轉成 data URL（市集作品要放到雲端，不能引用本機檔案）
async function shrink(src, max, { quality = 0.85, blur = 0 } = {}) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  // 外部網址的封面可能很慢或擋跨網域，最多等 8 秒就放棄（封面留空）
  await Promise.race([img.decode(), new Promise((_, no) => setTimeout(() => no(new Error('圖片載入逾時')), 8000))]);
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const ctx = c.getContext('2d');
  if (blur) ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}
async function srcOf(ref) {
  if (!ref) return '';
  if (!isFid(ref)) return ref;
  const f = await db.get('files', ref);
  return f?.blob ? URL.createObjectURL(f.blob) : '';
}
const tryShrink = async (ref, max, opts) => { try { const s = await srcOf(ref); return s ? await shrink(s, max, opts) : ''; } catch { return ''; } };

// 日記內文的圖片換成縮小後的 data URL
async function inlineImages(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  for (const im of doc.querySelectorAll('img')) {
    const ref = im.getAttribute('data-fid') || im.getAttribute('src');
    const d = await tryShrink(ref, 1200);
    im.removeAttribute('data-fid');
    if (d) im.setAttribute('src', d); else im.remove();
  }
  return doc.body.firstElementChild.innerHTML;
}

// 書的資料欄位（上架、編輯共用）：作者筆名、叢書名、卷數
// 作者一律用小說「編輯資料」裡的作者，這裡不能改
const infoFields = (l = {}) => `
    <div id="p-author-wrap"${l.type && l.type !== 'novel' ? ' hidden' : ''}><label>作者</label><input id="p-author" readonly class="mk-ro" value="${esc(l.author || '')}">
      <p class="muted mk-hint" id="p-author-hint">取自小說「編輯資料」裡的作者；要改請到小說那邊修改</p></div>
    <div id="p-series-wrap" class="row"${l.type && l.type !== 'novel' ? ' hidden' : ''}>
      <div style="flex:2;min-width:10em"><label>叢書名（單本就留空）</label><input id="p-series" maxlength="100" value="${esc(l.series || '')}"></div>
      <div style="flex:1;min-width:7em"><label>卷數</label><input id="p-vol" maxlength="20" placeholder="第三卷" value="${esc(l.volume || '')}"></div>
    </div>`;
const readInfo = bg => ({ author: bg.querySelector('#p-author').value.trim(), series: bg.querySelector('#p-series').value.trim(), volume: bg.querySelector('#p-vol').value.trim() });

// 找回這本書在自己網站上的原作：先用上架時記下的 id，舊的上架用書名比對
async function sourceNovel(l) {
  if (l.type !== 'novel') return null;
  if (l.sourceId) { const n = await get('novel', l.sourceId); if (n && !n.deleted) return n; }
  return (await list('novel')).find(n => !n.deleted && n.title === l.title) || null;
}

async function editDialog(l) {
  const src = await sourceNovel(l);
  modal(`
    <h3>編輯作品資料</h3>
    <p class="muted" style="margin-top:0">價格和內容不能改；要改內容請下架後重新上架。</p>
    <label>標題</label><input id="p-title" maxlength="100" value="${esc(l.title)}">
    ${infoFields(l)}
    <label>簡介</label><textarea id="p-desc" rows="4" maxlength="500">${esc(l.desc || '')}</textarea>
    <div class="mk-foot">
      <p id="p-err" style="color:#b3443c"></p>
      <div class="row" style="justify-content:flex-end"><button data-close>取消</button><button id="p-ok" class="primary">儲存</button></div>
    </div>`, {
    onOpen(bg, close) {
      if (src) { bg.querySelector('#p-author').value = src.author || ''; bg.querySelector('#p-author-hint').textContent = `取自小說《${src.title}》的作者${src.status ? `和狀態（${src.status}）` : ''}；按「儲存」就會同步`; }
      else if (l.type === 'novel') bg.querySelector('#p-author-hint').textContent = '這台電腦找不到原本的小說，作者維持不變';
      bg.querySelector('#p-ok').onclick = async () => {
        const btn = bg.querySelector('#p-ok');
        btn.disabled = true;
        try {
          await call('m.edit', { id: l.id, title: bg.querySelector('#p-title').value.trim(), desc: bg.querySelector('#p-desc').value.trim(), ...readInfo(bg), ...(src ? { sourceId: src.id, status: src.status || '' } : {}) });
          close(); toast('已儲存', 'success'); renderMarketItem(l.id);
        } catch (e) { bg.querySelector('#p-err').textContent = e.message; }
        finally { btn.disabled = false; }
      };
    },
  });
}

async function publishDialog() {
  const works = {
    novel: (await list('novel')).filter(n => !n.deleted && n.chapters?.length),
    diary: (await list('diary')).filter(d => !d.deleted && d.status !== 'draft'),
    image: (await list('image')).filter(i => !i.deleted && i.fileId),
  };
  const opts = t => works[t].map(w => `<option value="${w.id}">${esc(w.title || w.name || '未命名')}</option>`).join('');
  modal(`
    <h3>上架作品到市集</h3>
    <p class="muted" style="margin-top:0">作品會複製一份到市集，之後改你網站上的原作不會影響市集的版本。</p>
    <label>類型</label><select id="p-type"><option value="novel">${TYPE_NAME.novel}</option><option value="diary">${TYPE_NAME.diary}</option><option value="image">${TYPE_NAME.image}</option></select>
    <label>作品</label><select id="p-work"></select>
    <label>標題</label><input id="p-title" maxlength="100">
    ${infoFields()}
    <label>簡介</label><textarea id="p-desc" rows="2" maxlength="500"></textarea>
    <div class="row"><div style="flex:1;min-width:9em"><label>價格（0＝免費，最多 100 點）</label><input id="p-price" type="number" min="0" max="100" value="0"></div>
      <div id="p-free-wrap" style="flex:1;min-width:9em"><label>免費試看前幾章</label><input id="p-free" type="number" min="0" value="3"></div></div>
    <!-- 按鈕和進度固定在視窗底部，對話框捲動時也看得到 -->
    <div class="mk-foot">
      <p id="p-info" class="muted"></p>
      <p id="p-err" style="color:#b3443c"></p>
      <div class="row" style="justify-content:flex-end"><button data-close>取消</button><button id="p-ok" class="primary">上架</button></div>
    </div>`, {
    onOpen(bg, close) {
      const $ = s => bg.querySelector(s), err = m => $('#p-err').textContent = m;
      const cur = () => works[$('#p-type').value].find(w => w.id === $('#p-work').value);
      const fillWork = () => {
        const w = cur(), t = $('#p-type').value;
        $('#p-title').value = w ? w.title || w.name || '' : '';
        $('#p-desc').value = w ? (w.desc || w.caption || '').slice(0, 500) : '';
        $('#p-author').value = t === 'novel' ? w?.author || '' : '';
        $('#p-author-wrap').hidden = t !== 'novel';
        $('#p-author-hint').textContent = t === 'novel' && !w?.author ? '這本小說還沒填作者，會顯示帳號名稱；可以先到小說「編輯資料」填好' : '取自小說「編輯資料」裡的作者；要改請到小說那邊修改';
        $('#p-series').value = t === 'novel' ? w?.series || '' : '';
        $('#p-vol').value = t === 'novel' && w?.series ? volumeLabel(w.volume) : '';
        $('#p-series-wrap').hidden = t !== 'novel';
        $('#p-free-wrap').hidden = t !== 'novel';
        const words = !w ? 0 : t === 'novel' ? w.chapters.reduce((k, c) => k + (c.content || '').length, 0) : t === 'diary' ? (w.content || '').replace(/<[^>]*>/g, '').replace(/\s+/g, '').length : 0;
        $('#p-info').textContent = !w ? '這個類型還沒有作品' : t === 'image' ? '上架不會得到點數；有人購買時點數會轉給你' : `約 ${words.toLocaleString()} 字${t === 'novel' ? `・共 ${w.chapters.length} 章` : ''}（上架不會得到點數；有人購買時點數會轉給你）`;
      };
      const fillType = () => { $('#p-work').innerHTML = opts($('#p-type').value); fillWork(); };
      $('#p-type').onchange = fillType; $('#p-work').onchange = fillWork; fillType();
      $('#p-ok').onclick = async () => {
        const w = cur(), type = $('#p-type').value, price = +$('#p-price').value || 0;
        if (!w) return err('請選一件作品');
        if (price < 0 || price > 100) return err('價格要在 0–100 點之間');
        // 上傳中鎖住表單，避免重複送出
        const fields = bg.querySelectorAll('input,select,textarea,#p-ok'); // 「取消」永遠可以按
        fields.forEach(x => { x.disabled = true; });
        err(''); $('#p-info').textContent = '準備中…';
        try {
          let content, cover;
          if (type === 'novel') {
            content = { chapters: w.chapters.map(c => ({ title: c.title, content: c.content || '' })) };
            cover = await tryShrink(w.cover, 360, { quality: 0.72 });
          } else if (type === 'diary') {
            content = { html: await inlineImages(w.content || '') };
            cover = await tryShrink(w.cover, 360, { quality: 0.72 });
          } else {
            const f = await db.get('files', w.fileId);
            if (!f?.blob) throw new Error('這張圖片的檔案不在這台電腦上（可能還沒同步下來）');
            const url = URL.createObjectURL(f.blob);
            content = { data: await shrink(url, 2000, { quality: 0.88 }) };
            cover = await shrink(url, 320, { quality: 0.7, blur: price ? 6 : 0 });
          }
          $('#p-info').textContent = type === 'diary' ? '上傳中…' : '上傳中…（整本小說或大圖可能要 10–30 秒，請不要關閉）';
          const r = await call('m.publish', { type, title: $('#p-title').value.trim(), desc: $('#p-desc').value.trim(), ...readInfo(bg), sourceId: w.id, ...(type === 'novel' ? { status: w.status || '' } : {}), price, freeChapters: +$('#p-free').value || 0, cover, content });
          close();
          toast('上架成功', 'success');
          location.hash = `#/market/${r.id}`;
        } catch (e) { err(e.message); $('#p-info').textContent = ''; }
        finally { fields.forEach(x => { x.disabled = false; }); }
      };
    },
  });
}

