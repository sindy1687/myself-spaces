// 旅遊模板：遠方來信（sindy 棲息地）
// 結構：section.dt[data-tpl] > div.tb[data-tb=區塊類型]；照片放在 div.pz（照片區）裡的 figure.pz-item
// 所有狀態（位置、尺寸、旋轉、圖層、鎖定）都存在 style／data-* 上，經 sanitizeHTML 後仍保留
import { photoZone } from './parts.js';

const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, '.');

const blocks = {
  cover: {
    label: '封面',
    html: () => `<div class="tb tl-cover" data-tb="cover">
<div class="tl-map" contenteditable="false"></div>
<p class="tl-kicker"><span>遠方來信</span> · sindy 棲息地</p>
<h1>寫下這趟旅行的標題</h1>
<p class="tl-lead">一句話介紹這趟旅程：為什麼出發、想遇見什麼。</p>
${photoZone({ layout: 'flow', cls: 'tl-hero', label: '主照片' })}
<div class="tl-ticket">
<div><small>DESTINATION 目的地</small><p>京都・嵐山</p></div>
<div><small>DATE 日期</small><p>${today()} — ${today()}</p></div>
<div><small>WITH 同行者</small><p>自己、好朋友</p></div>
</div>
</div>`,
  },
  postcard: {
    label: '旅行明信片',
    html: () => `<div class="tb tl-postcard" data-tb="postcard">
<div class="tl-pc-msg">
<p class="tl-dear">Dear 未來的自己：</p>
<p>寫一段給自己的短文。今天的風、路上的氣味，還有那個讓你停下腳步的瞬間。</p>
<p class="tl-sign">— 在旅途中的我</p>
</div>
<div class="tl-pc-side">
<div class="tl-stamp" contenteditable="false"><span>sindy<br>POST</span></div>
<div class="tl-postmark"><span>京都</span><small>${today()}</small></div>
<p class="tl-addr">To：未來的自己<br>From：遠方</p>
</div>
</div>`,
  },
  itinerary: {
    label: '行程紀錄',
    html: () => `<div class="tb tl-itinerary" data-tb="itinerary">
<h2>行程紀錄</h2>
${blocks.spot.html()}
${blocks.spot.html()}
</div>`,
  },
  spot: {
    label: '景點',
    parent: 'itinerary',
    html: () => `<div class="tb tl-spot" data-tb="spot">
<h3>景點名稱</h3>
<p class="tl-when">🕘 09:30　📍 地點／地址</p>
${photoZone({ layout: 'flow', label: '景點照片' })}
<p>在這裡記下看見的風景、發生的小事，和當下的心情。</p>
</div>`,
  },
  notes: {
    label: '口袋筆記',
    html: () => `<div class="tb tl-notes" data-tb="notes">
<h2>口袋筆記</h2>
<div class="tl-note-grid">
<div class="tl-note"><h4>🚃 交通</h4><p>怎麼去、搭什麼車、票價。</p></div>
<div class="tl-note"><h4>🏠 住宿</h4><p>住在哪裡、推不推薦。</p></div>
<div class="tl-note"><h4>💰 花費</h4><p>交通＿＿　住宿＿＿　餐飲＿＿</p></div>
<div class="tl-note"><h4>🍙 美食</h4><p>吃到最難忘的一道。</p></div>
<div class="tl-note"><h4>📌 提醒</h4><p>下次要記得的事。</p></div>
</div>
</div>`,
  },
  end: {
    label: '旅行感想',
    html: () => `<div class="tb tl-end" data-tb="end">
<h2>旅行感想</h2>
<p>旅程結束後，最想留下的是什麼？寫給這趟旅行的結語。</p>
${photoZone({ layout: 'free', ratio: '4/3', label: '回憶拼貼' })}
<p class="tl-sign">寄自 sindy 棲息地 ✉</p>
</div>`,
  },
};

export default {
  id: 'travel-letter',
  category: '旅遊',
  name: '遠方來信',
  desc: '米白紙張、霧藍、鼠尾草綠・文創旅行手帳',
  blocks,
  // 套用時的預設區塊順序
  order: ['cover', 'postcard', 'itinerary', 'notes', 'end'],
};
