// 小說聽書：逐段朗讀、標示並跟著捲動正在讀的段落、自動接下一章、語速、睡眠定時、背景音樂自動調小
import { splitSentences, speakSentences, voiceDialog, duckMusic, loadVoicePref, saveVoicePref } from './tts.js';
import { toast } from './util.js';

const CONT_KEY = 'listen-continue';
const SPEEDS = [0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];

// 換章後要不要自動接著聽（上一章聽完時設定）
export function takeContinue(novelId) {
  try { if (sessionStorage.getItem(CONT_KEY) !== novelId) return false; sessionStorage.removeItem(CONT_KEY); return true; } catch { return false; }
}

// wrap：段落容器（p[data-p]）；title：章名；nextUrl：下一章網址（沒有就是全書最後一章）
export function openListenBar({ wrap, novelId, title, paras, nextUrl, startAt = 0, autoplay = true }) {
  document.querySelector('.listen-bar')?._close?.();
  let i = startAt, playing = false, tok = 0, stopFn = null, sleepTimer = null, sleepAt = 0, sleepMode = sessionStorageGet('listen-sleep') || '', lock = null;
  const bar = document.createElement('div');
  bar.className = 'listen-bar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', '聽書');
  const pref = loadVoicePref();
  bar.innerHTML = `
    <span class="lb-pos" aria-live="off"></span>
    <button type="button" class="lb-prev" aria-label="上一段" title="上一段">⏮</button>
    <button type="button" class="lb-play primary" aria-label="播放">▶</button>
    <button type="button" class="lb-next" aria-label="下一段" title="下一段">⏭</button>
    <select class="lb-speed" aria-label="語速" title="語速">${SPEEDS.map(s => `<option value="${s}" ${Math.abs(s - pref.rate) < 0.03 ? 'selected' : ''}>${s}×</option>`).join('')}</select>
    <select class="lb-sleep" aria-label="睡眠定時" title="睡眠定時：時間到自動停止">
      <option value="">⏲ 不定時</option><option value="chapter">本章結束</option><option value="15">15 分鐘</option><option value="30">30 分鐘</option><option value="60">60 分鐘</option>
    </select>
    <button type="button" class="lb-voice" aria-label="朗讀聲音" title="選擇聲音">🎙</button>
    <button type="button" class="lb-close" aria-label="關閉聽書" title="關閉">✕</button>`;
  document.body.appendChild(bar);
  document.body.classList.add('listening');
  const $ = q => bar.querySelector(q);
  if (![...$('.lb-speed').options].some(o => o.selected)) $('.lb-speed').value = '1';
  $('.lb-sleep').value = /^\d+$/.test(sleepMode) ? '' : sleepMode; // 分鐘定時不跨章沿用，「本章結束」才沿用

  const paraEl = k => wrap.querySelector(`p[data-p="${k}"]`);
  const ui = () => {
    $('.lb-play').textContent = playing ? '⏸' : '▶';
    $('.lb-play').setAttribute('aria-label', playing ? '暫停' : '播放');
    const left = sleepAt ? Math.max(0, Math.ceil((sleepAt - Date.now()) / 60000)) : 0;
    $('.lb-pos').innerHTML = `🎧 ${i < 0 ? '章名' : `第 ${i + 1}/${paras.length} 段`}${left ? ` <small>⏲${left}分</small>` : ''}`;
    wrap.querySelectorAll('.tts-reading').forEach(el => el.classList.remove('tts-reading'));
    const el = i < 0 ? wrap.querySelector('h1') : paraEl(i);
    el?.classList.add('tts-reading');
  };
  const follow = () => {
    const el = i < 0 ? wrap.querySelector('h1') : paraEl(i);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 70 || r.bottom > innerHeight - 90) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  // 手機螢幕關掉時瀏覽器常會停掉朗讀，聽書時盡量讓螢幕保持亮著
  const wake = async on => {
    try { if (on && !lock && navigator.wakeLock) lock = await navigator.wakeLock.request('screen'); else if (!on && lock) { await lock.release(); lock = null; } } catch { lock = null; }
  };

  function speakCurrent() {
    stopFn?.(); stopFn = null;
    const my = ++tok;
    const text = i < 0 ? title : paras[i] || '';
    const sentences = splitSentences(text);
    ui(); follow();
    if (!sentences.length) return advance(my);
    speakSentences(sentences, { onEnd: () => advance(my) }).then(stop => { if (my === tok && playing) stopFn = stop; else stop(); });
  }
  function advance(my) {
    if (my !== tok || !playing) return;
    if (i < paras.length - 1) { i++; return speakCurrent(); }
    // 本章讀完
    if (sleepMode === 'chapter') { pause(); toast('本章聽完了（睡眠定時）'); return; }
    if (nextUrl) {
      try { sessionStorage.setItem(CONT_KEY, novelId); } catch { /* 無痕模式 */ }
      close(true);
      location.hash = nextUrl;
    } else { pause(); toast('全書聽完了 🎉'); }
  }
  function play() {
    if (!('speechSynthesis' in window)) return toast('這個瀏覽器不支援語音朗讀', 'error');
    playing = true; duckMusic(true); wake(true); speakCurrent();
  }
  function pause() {
    playing = false; tok++; stopFn?.(); stopFn = null; speechSynthesis.cancel(); duckMusic(false); wake(false); ui();
  }
  function jump(k) { i = Math.max(-1, Math.min(paras.length - 1, k)); playing ? speakCurrent() : (ui(), follow()); }
  function close(keepMusicDucked) {
    pause(); clearInterval(sleepTimer);
    if (keepMusicDucked) duckMusic(true);
    bar.remove(); document.body.classList.remove('listening');
    wrap.querySelectorAll('.tts-reading').forEach(el => el.classList.remove('tts-reading'));
    removeEventListener('hashchange', onLeave); wrap.removeEventListener('click', onPara);
  }
  bar._close = () => close();

  $('.lb-play').onclick = () => (playing ? pause() : play());
  $('.lb-prev').onclick = () => jump(i - 1);
  $('.lb-next').onclick = () => jump(i + 1);
  $('.lb-close').onclick = () => close();
  $('.lb-voice').onclick = () => { pause(); voiceDialog(); };
  $('.lb-speed').onchange = e => { saveVoicePref({ ...loadVoicePref(), rate: +e.target.value }); if (playing) speakCurrent(); };
  $('.lb-sleep').onchange = e => {
    sleepMode = e.target.value; sessionStorageSet('listen-sleep', sleepMode);
    clearInterval(sleepTimer); sleepAt = 0;
    if (/^\d+$/.test(sleepMode)) {
      sleepAt = Date.now() + +sleepMode * 60000;
      sleepTimer = setInterval(() => { if (Date.now() >= sleepAt) { clearInterval(sleepTimer); sleepAt = 0; pause(); toast('睡眠定時到了，已停止朗讀'); } else ui(); }, 15000);
      toast(`${sleepMode} 分鐘後自動停止`);
    }
    ui();
  };
  // 聽書時點段落：從那一段開始讀
  const onPara = e => { const p = e.target.closest('p[data-p]'); if (p) jump(+p.dataset.p); };
  wrap.addEventListener('click', onPara);
  // 使用者自己換頁就停止（自動接下一章時已先關閉）
  const onLeave = () => close();
  addEventListener('hashchange', onLeave);

  ui();
  if (autoplay) play(); else follow();
  return { close };
}

function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, v); } catch { /* 無痕模式 */ } }

// 從畫面上第一個看得到的段落開始
export function firstVisiblePara(wrap) {
  for (const p of wrap.querySelectorAll('p[data-p]')) if (p.getBoundingClientRect().bottom > 80) return +p.dataset.p;
  return 0;
}
