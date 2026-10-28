// 說故事語音：挑最自然的中文聲音、逐句朗讀（句間停頓、不會被瀏覽器截斷）、語速音調可調
import { modal, esc } from './util.js';

const KEY = 'tts-voice';
export const loadVoicePref = () => { try { return { rate: 0.9, pitch: 1.05, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { rate: 0.9, pitch: 1.05 }; } };
export const saveVoicePref = p => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* 無痕模式 */ } };

// 聲音好聽程度：神經網路語音（Natural/Online/Neural、Google）遠勝系統內建的機器音
export function voiceScore(v) {
  const lang = (v.lang || '').replace('_', '-'), name = v.name || '';
  if (!/^(zh|cmn)/i.test(lang)) return -1;
  let s = 0;
  if (/TW|Hant/i.test(lang)) s += 40; else if (/CN|Hans/i.test(lang)) s += 20; else s += 10;
  if (/Natural|Neural|Online/i.test(name)) s += 50;
  else if (/Google/i.test(name)) s += 35;
  else if (/Siri|Premium|Enhanced|優化|高品質/i.test(name)) s += 30;
  if (/HsiaoChen|HsiaoYu|曉臻|曉雨|Xiaoxiao|曉曉|Mei-?Jia|美佳|Tingting/i.test(name)) s += 8; // 溫柔女聲，適合說故事
  if (/Hanhan|Yating|Zhiwei|Kangkang|Huihui/i.test(name)) s -= 5; // 較舊的系統語音
  return s;
}
export const zhVoices = voices => voices.filter(v => voiceScore(v) >= 0).sort((a, b) => voiceScore(b) - voiceScore(a));

export function getVoices() {
  if (!('speechSynthesis' in window)) return Promise.resolve([]);
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  // Chrome 的聲音清單是非同步載入的
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(speechSynthesis.getVoices()), 1500);
    speechSynthesis.addEventListener('voiceschanged', () => { clearTimeout(t); resolve(speechSynthesis.getVoices()); }, { once: true });
  });
}

// 依句號、問號、驚嘆號、換行斷句；太長的句子再依逗號切，避免 Chrome 讀超過約 15 秒就中斷
export function splitSentences(text, max = 60) {
  const out = [];
  for (const raw of String(text || '').split(/(?<=[。！？!?；;…\n][」』]?)(?![」』。！？!?…])/)) {
    let s = raw.trim();
    while (s.length > max) {
      const cut = Math.max(s.lastIndexOf('，', max), s.lastIndexOf(',', max), s.lastIndexOf('、', max));
      const at = cut > 10 ? cut + 1 : max;
      out.push(s.slice(0, at).trim()); s = s.slice(at).trim();
    }
    if (s && /[\p{L}\p{N}]/u.test(s)) out.push(s);
  }
  return out;
}

// 依序朗讀 sentences；回傳 stop()。onSentence(i) 可用來標示正在讀的句子
export async function speakSentences(sentences, { onEnd, onSentence, gap = 280 } = {}) {
  let stopped = false, timer = null;
  const stop = () => { stopped = true; clearTimeout(timer); speechSynthesis.cancel(); };
  const pref = loadVoicePref();
  const voices = await getVoices();
  const voice = voices.find(v => v.voiceURI === pref.voice) || zhVoices(voices)[0];
  const say = i => {
    if (stopped) return;
    if (i >= sentences.length) return onEnd?.();
    const u = new SpeechSynthesisUtterance(sentences[i]);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'zh-TW';
    u.rate = pref.rate; u.pitch = pref.pitch;
    u.onstart = () => onSentence?.(i);
    // 問句、驚嘆句後多停一下，聽起來像在說故事
    const pause = /[？?！!」』…]$/.test(sentences[i]) ? gap * 1.6 : gap;
    u.onend = u.onerror = () => { if (!stopped) timer = setTimeout(() => say(i + 1), pause); };
    speechSynthesis.speak(u);
  };
  speechSynthesis.cancel();
  say(0);
  return stop;
}

// 朗讀時把背景音樂調小（播放器沒開就略過）
export const duckMusic = on => import('./music.js').then(m => m.duckMusic?.(on)).catch(() => {});

// 朗讀聲音設定：聲音清單（好聽的排前面）、語速、音調、試聽
export async function voiceDialog() {
  const voices = zhVoices(await getVoices()), pref = loadVoicePref();
  const best = voices[0];
  const tag = v => voiceScore(v) >= 80 ? '★ 自然' : voiceScore(v) >= 55 ? '☆ 較自然' : '';
  modal(`
    <h3>🎙 朗讀聲音</h3>
    ${voices.length ? `<label>聲音</label>
      <select id="tv-v">${voices.map(v => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === (pref.voice || best?.voiceURI) ? 'selected' : ''}>${esc(v.name)}（${esc(v.lang)}）${tag(v) ? ' ' + tag(v) : ''}</option>`).join('')}</select>
      ${voiceScore(best) < 80 ? '<p class="muted" style="font-size:.85rem">這台裝置沒有找到「自然」語音。用 Microsoft Edge 開啟可以使用曉臻、曉雨等真人般的聲音，Chrome 則有 Google 國語語音。</p>' : ''}`
      : '<p class="muted">這個瀏覽器沒有中文語音。</p>'}
    <label>語速 <output id="tv-ro">${pref.rate}</output></label>
    <input id="tv-r" type="range" min="0.6" max="1.3" step="0.05" value="${pref.rate}">
    <label>音調 <output id="tv-po">${pref.pitch}</output></label>
    <input id="tv-p" type="range" min="0.7" max="1.4" step="0.05" value="${pref.pitch}">
    <div class="row" style="justify-content:flex-end;margin-top:1rem">
      <button id="tv-reset">恢復預設</button>
      <button id="tv-try">▶ 試聽</button>
      <button id="tv-ok" class="primary" data-close>完成</button>
    </div>`, {
    onOpen(bg, close) {
      const $ = s => bg.querySelector(s);
      let stop = null;
      const read = () => ({ voice: $('#tv-v')?.value || '', rate: +$('#tv-r').value, pitch: +$('#tv-p').value });
      const sync = () => { $('#tv-ro').textContent = $('#tv-r').value; $('#tv-po').textContent = $('#tv-p').value; saveVoicePref(read()); };
      bg.addEventListener('input', sync);
      $('#tv-try').onclick = async () => { stop?.(); sync(); stop = await speakSentences(['從前從前，在森林的深處，住著一隻愛聽故事的小熊。', '有一天，牠聽見遠方傳來好聽的歌聲！']); };
      $('#tv-reset').onclick = () => { $('#tv-r').value = 0.9; $('#tv-p').value = 1.05; if ($('#tv-v') && best) $('#tv-v').value = best.voiceURI; sync(); };
      bg.addEventListener('click', e => { if (e.target === bg || e.target.matches('[data-close]')) stop?.(); });
    },
  });
}
