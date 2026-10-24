// 分享與靜態檔案伺服器（無依賴）：node server/share-server.js [port]
// - 提供網站靜態檔案
// - POST /api/share  建立分享，回傳 { token }
// - GET  /api/share/:token  讀取分享（訪客唯讀）
// - DELETE /api/share/:token 取消分享
// 資料存在 server/shares/*.json。公開部署時請置於 HTTPS 反向代理之後。
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SHARE_DIR = path.join(__dirname, 'shares');
const PORT = +(process.argv[2] || process.env.PORT || 8000);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

if (!fs.existsSync(SHARE_DIR)) fs.mkdirSync(SHARE_DIR, { recursive: true });

function readBody(req) {
  return new Promise((res, rej) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 50 * 1024 * 1024) { rej(new Error('payload too large')); req.destroy(); } });
    req.on('end', () => res(b));
    req.on('error', rej);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const send = (code, body, type = 'application/json') => {
    res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') return send(204, '');

  // Share API
  const m = url.pathname.match(/^\/api\/share(?:\/([\w-]+))?$/);
  if (m) {
    try {
      if (req.method === 'POST') {
        const data = JSON.parse(await readBody(req));
        if (!data.type || !data.payload) return send(400, { error: 'bad request' });
        const token = crypto.randomBytes(12).toString('base64url');
        fs.writeFileSync(path.join(SHARE_DIR, token + '.json'), JSON.stringify({ type: data.type, title: data.title, desc: data.desc, payload: data.payload, createdAt: new Date().toISOString() }));
        return send(200, { token });
      }
      const file = path.join(SHARE_DIR, (m[1] || '') + '.json');
      if (req.method === 'GET') {
        if (!m[1] || !fs.existsSync(file)) return send(404, { error: 'not found' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(fs.readFileSync(file));
      }
      if (req.method === 'DELETE') {
        if (fs.existsSync(file)) fs.unlinkSync(file);
        return send(200, { ok: true });
      }
    } catch (e) { return send(500, { error: e.message }); }
    return send(405, { error: 'method not allowed' });
  }

  // 靜態檔案
  let p = path.normalize(decodeURIComponent(url.pathname));
  if (p === '/' || p === '\\') p = '/index.html';
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    // SPA fallback：非 api 路徑回 index.html
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(ROOT, 'index.html')));
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});

server.listen(PORT, () => console.log(`網站與分享伺服器已啟動：http://localhost:${PORT}`));
