// ============================================================
// Local dev server: static files + API (shared logic in lib.js).
// Run: npm install && node server.js  (needs .env DATABASE_URL)
// ============================================================
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { route, initDb, json } = require('./lib.js');

const PORT = +(process.env.PORT || 3000);
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
function serveStatic(req, res) {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(__dirname, p));
  if (!file.startsWith(__dirname) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

initDb().then(() => {
  http.createServer((req, res) => route(req, res).then((handled) => {
    if (!handled) serveStatic(req, res);
  }).catch((e) => {
    if (!res.headersSent) json(res, e.message === 'too large' ? 413 : 500, { error: 'server error' });
  })).listen(PORT, () => console.log(`Forum live at http://localhost:${PORT}`));
}).catch((e) => { console.error('DB init failed:', e.message); process.exit(1); });
