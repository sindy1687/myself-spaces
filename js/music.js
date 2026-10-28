// 背景音樂：YouTube 播放清單的浮動小播放器（換頁不中斷）
// 歌單存在設定 music: [{ id, url, title }]；按下播放才載入 YouTube，平常不連外
import { getSettings } from './store.js';
import { esc, toast } from './util.js';

// 解析 YouTube 網址 → { video, list }；支援 watch?v=、youtu.be/、shorts/、embed/、music.youtube.com、播放清單 list=
export function parseYouTube(url) {
  let u;
  try { u = new URL(String(url).trim()); } catch { return null; }
  if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)youtube-nocookie\.com$/i.test(u.hostname)) return null;
  const id = s => (s && /^[\w-]{11}$/.test(s) ? s : '');
  let video = '';
  if (/youtu\.be$/i.test(u.hostname)) video = id(u.pathname.slice(1).split('/')[0]);
  else if (u.searchParams.get('v')) video = id(u.searchParams.get('v'));
  else { const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/); if (m) video = m[1]; }
  const list = /^[\w-]{10,}$/.test(u.searchParams.get('list') || '') ? u.searchParams.get('list') : '';
  return video || list ? { video, list } : null;
}

const KEY = 'music-state';
const loadState = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const saveState = st => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* 無痕模式 */ } };

let tracks = [], opts = {}, idx = 0, player = null, apiReady = null, playing = false, root = null;

function loadApi() {
  if (apiReady) return apiReady;
  apiReady = new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { apiReady = null; reject(new Error('無法連線到 YouTube')); };
    document.head.appendChild(s);
  });
  return apiReady;
}

function cue(i, autoplay) {
  idx = (i + tracks.length) % tracks.length;
  const t = tracks[idx], p = parseYouTube(t.url);
  saveState({ ...loadState(), idx });
  draw();
  if (!player || !p) return;
  if (p.list) {
    const args = { listType: 'playlist', list: p.list, index: 0 };
    autoplay ? player.loadPlaylist(args) : player.cuePlaylist(args);
    player.setShuffle?.(!!opts.shuffle);
  } else autoplay ? player.loadVideoById(p.video) : player.cueVideoById(p.video);
}
function nextIndex(step = 1) {
  if (opts.shuffle && tracks.length > 1 && step > 0) { let n; do n = Math.floor(Math.random() * tracks.length); while (n === idx); return n; }
  return idx + step;
}
function next(step = 1) {
  const p = parseYouTube(tracks[idx]?.url);
  // 播放清單歌曲在清單內前後切換，到底才換下一個項目
  if (p?.list && player?.getPlaylist?.()) {
    const k = player.getPlaylistIndex(), len = player.getPlaylist().length;
    if ((step > 0 && k < len - 1) || (step < 0 && k > 0)) return step > 0 ? player.nextVideo() : player.previousVideo();
  }
  if (step > 0 && idx === tracks.length - 1 && !opts.loop && !opts.shuffle) { playing = false; draw(); return; }
  cue(nextIndex(step), true);
}

async function play() {
  if (!tracks.length) return;
  if (!player) {
    root.querySelector('.mp-msg').textContent = '載入 YouTube…';
    try { await loadApi(); } catch (e) { root.querySelector('.mp-msg').textContent = ''; return toast(e.message, 'error'); }
    const p = parseYouTube(tracks[idx].url) || {};
    player = await new Promise(resolve => {
      const pl = new YT.Player(root.querySelector('.mp-video'), {
        width: 192, height: 108, host: 'https://www.youtube-nocookie.com',
        videoId: p.video || undefined,
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, ...(p.list ? { listType: 'playlist', list: p.list } : {}) },
        events: {
          onReady: e => { e.target.setVolume(loadState().vol ?? 60); if (p.list) e.target.setShuffle(!!opts.shuffle); e.target.playVideo(); resolve(pl); },
          onStateChange: e => {
            if (e.data === YT.PlayerState.PLAYING) { playing = true; draw(); }
            if (e.data === YT.PlayerState.PAUSED) { playing = false; draw(); }
            if (e.data === YT.PlayerState.ENDED) next(1);
          },
          onError: () => { toast(`「${tracks[idx]?.title || '這首'}」無法播放（可能被禁止嵌入），跳到下一首`, 'error'); setTimeout(() => next(1), 800); },
        },
      });
    });
    root.querySelector('.mp-msg').textContent = '';
    root.classList.add('has-player');
    return;
  }
  player.playVideo();
}

function draw() {
  if (!root) return;
  const t = tracks[idx];
  root.querySelector('.mp-title').textContent = t ? (t.title || '未命名') : '';
  root.querySelector('.mp-play').textContent = playing ? '⏸' : '▶';
  root.querySelector('.mp-play').setAttribute('aria-label', playing ? '暫停' : '播放');
  root.querySelector('.mp-fab').classList.toggle('on', playing);
  root.querySelector('.mp-fab').title = playing && t ? `播放中：${t.title || '未命名'}（點一下展開）` : '背景音樂';
  root.querySelector('.mp-list').innerHTML = tracks.map((x, i) => `<li><button type="button" data-i="${i}" class="${i === idx ? 'on' : ''}">${i === idx && playing ? '♪ ' : ''}${esc(x.title || x.url)}</button></li>`).join('');
}

// 繪本朗讀時把背景音樂調到原本的兩成，讀完再慢慢調回來
let duckTimer = null;
export function duckMusic(on) {
  if (!player?.setVolume) return;
  clearInterval(duckTimer);
  const full = loadState().vol ?? 60, target = on ? Math.round(full * 0.2) : full;
  let v = player.getVolume?.() ?? full;
  duckTimer = setInterval(() => {
    v += Math.sign(target - v) * Math.min(Math.abs(target - v), 4);
    player.setVolume(v);
    if (v === target) clearInterval(duckTimer);
  }, 40);
}

// ---- 位置：可拖到畫面任一角落附近，記住位置 ----
// pos = { h: 'left'|'right', v: 'top'|'bottom', x, y }：離最近兩條邊的距離；面板往畫面內側展開
let dragged = false;
function applyPos(pos) {
  if (!root) return;
  const p = pos || { h: 'left', v: 'bottom', x: 16, y: 16 };
  const cap = (n, max) => Math.max(4, Math.min(n, Math.max(4, max)));
  Object.assign(root.style, { left: '', right: '', top: '', bottom: '' });
  root.style[p.h] = cap(p.x, innerWidth - 60) + 'px';
  root.style[p.v] = cap(p.y, innerHeight - 60) + 'px';
  root.classList.toggle('mp-right', p.h === 'right');
  root.classList.toggle('mp-top', p.v === 'top');
}
function enableDrag() {
  let start = null;
  const down = e => {
    if (e.button > 0) return;
    const r = root.getBoundingClientRect();
    start = { px: e.clientX, py: e.clientY, r, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = e => {
    if (!start) return;
    const dx = e.clientX - start.px, dy = e.clientY - start.py;
    if (!start.moved && Math.hypot(dx, dy) < 5) return;
    start.moved = true;
    const l = start.r.left + dx, t = start.r.top + dy, w = start.r.width, h = start.r.height;
    const pos = {
      h: l + w / 2 < innerWidth / 2 ? 'left' : 'right', v: t + h / 2 < innerHeight / 2 ? 'top' : 'bottom',
    };
    pos.x = pos.h === 'left' ? l : innerWidth - l - w;
    pos.y = pos.v === 'top' ? t : innerHeight - t - h;
    applyPos(pos);
    start.pos = pos;
  };
  const up = () => {
    if (start?.moved) { dragged = true; saveState({ ...loadState(), pos: start.pos }); setTimeout(() => { dragged = false; }, 0); }
    start = null;
  };
  for (const el of [root.querySelector('.mp-fab'), root.querySelector('.mp-grip')]) {
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
  addEventListener('resize', () => applyPos(loadState().pos));
}

// 依設定建立／更新播放器；歌單清空或關閉時移除
export async function initMusic() {
  const s = await getSettings();
  tracks = (s.music || []).filter(t => parseYouTube(t.url));
  opts = { shuffle: !!s.musicShuffle, loop: s.musicLoop !== false };
  if (!tracks.length || s.musicShow === false) {
    try { player?.destroy?.(); } catch { /* 已移除 */ }
    player = null; playing = false; root?.remove(); root = null;
    document.body.classList.remove('has-mp');
    return;
  }
  const st = loadState();
  if (idx >= tracks.length) idx = 0;
  if (!root) {
    idx = Math.min(st.idx || 0, tracks.length - 1);
    root = document.createElement('div');
    root.className = 'mp' + (st.open ? ' open' : '');
    root.innerHTML = `
      <button type="button" class="mp-fab" aria-label="背景音樂" title="背景音樂">🎵</button>
      <div class="mp-panel" role="region" aria-label="背景音樂播放器">
        <div class="mp-grip" title="按住拖曳，把播放器移到不擋畫面的位置">⠿ 拖曳移動</div>
        <div class="mp-video-wrap"><div class="mp-video"></div><span class="mp-msg muted"></span></div>
        <div class="mp-title"></div>
        <div class="mp-ctrl">
          <button type="button" class="mp-prev" aria-label="上一首">⏮</button>
          <button type="button" class="mp-play primary" aria-label="播放">▶</button>
          <button type="button" class="mp-next" aria-label="下一首">⏭</button>
          <input type="range" class="mp-vol" min="0" max="100" value="${st.vol ?? 60}" aria-label="音量">
        </div>
        <ol class="mp-list"></ol>
      </div>`;
    document.body.appendChild(root);
    document.body.classList.add('has-mp');
    applyPos(st.pos);
    enableDrag();
    root.querySelector('.mp-fab').onclick = () => {
      if (dragged) { dragged = false; return; } // 剛拖完不算點擊
      root.classList.toggle('open'); saveState({ ...loadState(), open: root.classList.contains('open') });
    };
    root.querySelector('.mp-play').onclick = () => { if (playing) player?.pauseVideo(); else play(); };
    root.querySelector('.mp-next').onclick = () => { if (player) next(1); else { idx = nextIndex(1) % tracks.length; draw(); play(); } };
    root.querySelector('.mp-prev').onclick = () => { if (player) next(-1); else { idx = (idx - 1 + tracks.length) % tracks.length; draw(); play(); } };
    root.querySelector('.mp-vol').oninput = e => { player?.setVolume(+e.target.value); saveState({ ...loadState(), vol: +e.target.value }); };
    root.querySelector('.mp-list').onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; if (player) cue(+b.dataset.i, true); else { idx = +b.dataset.i; draw(); play(); } };
  }
  draw();
}
