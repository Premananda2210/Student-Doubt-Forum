// ============================================================
// Shared backend: Postgres pool + JSON API routes.
// Used by server.js (local/static) and api/index.js (Vercel).
// ============================================================
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool } = require('pg');

// Tiny .env loader (local only; Vercel uses dashboard env vars).
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch (_) {}

// Parse DATABASE_URL manually so sslmode=require can't re-enable verification.
const DB = new URL(process.env.DATABASE_URL);
const pool = new Pool({
  host: DB.hostname, port: +DB.port || 5432,
  user: decodeURIComponent(DB.username), password: decodeURIComponent(DB.password),
  database: DB.pathname.replace(/^\//, '') || 'defaultdb',
  ssl: { rejectUnauthorized: false }, // Aiven requires SSL; CA pinning is the upgrade path.
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY, pass TEXT NOT NULL, role TEXT NOT NULL, created TIMESTAMPTZ DEFAULT now());
ALTER TABLE users ADD COLUMN IF NOT EXISTS id SERIAL UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subjects TEXT[] DEFAULT '{}';
CREATE TABLE IF NOT EXISTS doubts (
  id SERIAL PRIMARY KEY, dkey TEXT UNIQUE NOT NULL, email TEXT NOT NULL,
  title TEXT NOT NULL, subject TEXT, teacher TEXT, descr TEXT, tags TEXT[] DEFAULT '{}',
  priority TEXT DEFAULT 'normal', image TEXT DEFAULT '', status TEXT DEFAULT 'pending',
  created TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS replies (
  id SERIAL PRIMARY KEY, doubt_key TEXT NOT NULL, by TEXT, name TEXT,
  text TEXT, images JSONB DEFAULT '[]', created TIMESTAMPTZ DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_replies_key ON replies (doubt_key);
CREATE TABLE IF NOT EXISTS notifs (
  id SERIAL PRIMARY KEY, role TEXT NOT NULL, text TEXT NOT NULL,
  created TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS tmeta (
  email TEXT NOT NULL, doubt_key TEXT NOT NULL, starred BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ, note TEXT DEFAULT '', draft TEXT DEFAULT '',
  PRIMARY KEY (email, doubt_key));`;

let ready = null;
function initDb() {
  if (!ready) ready = pool.query(SCHEMA).catch((e) => { ready = null; throw e; });
  return ready;
}

function hash(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function check(pw, stored) {
  const [salt, h] = String(stored).split(':');
  return !!salt && crypto.scryptSync(pw, salt, 64).toString('hex') === h;
}

function body(req) {
  // Vercel pre-parses JSON bodies; plain node reads the stream.
  if (req.body !== undefined) {
    return Promise.resolve(typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}));
  }
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > 12 * 1024 * 1024) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// Returns true when the request was an API call (handled or errored).
async function route(req, res) {
  const u = new URL(req.url, 'http://x');
  if (!u.pathname.startsWith('/api/')) return false;
  const q = Object.fromEntries(u.searchParams);
  // Auth
  if (req.method === 'POST' && u.pathname === '/api/auth/signup') {
    const { name, email, password, role, bio, subjects } = await body(req);
    if (!email || !password) return json(res, 400, { error: 'missing' }), true;
    const r = await pool.query('SELECT 1 FROM users WHERE email=$1', [email]);
    if (r.rows.length) return json(res, 409, { error: 'exists' }), true;
    const subj = Array.isArray(subjects) ? subjects : String(subjects || '').split(',').map((s) => s.trim()).filter(Boolean);
    await pool.query('INSERT INTO users (email, pass, role, name, bio, subjects) VALUES ($1,$2,$3,$4,$5,$6)',
      [email, hash(password), role || 'student', name || '', bio || '', subj]);
    const rid = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    return json(res, 200, { ok: true, id: rid.rows[0].id }), true;
  }
  if (req.method === 'POST' && u.pathname === '/api/auth/login') {
    const { email, password, role } = await body(req);
    if (!email || !password) return json(res, 400, { error: 'missing' }), true;
    const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    if (!r.rows.length) {
      const ins = await pool.query('INSERT INTO users (email, pass, role) VALUES ($1,$2,$3) RETURNING id', [email, hash(password), role || 'student']);
      return json(res, 200, { ok: true, created: true, id: ins.rows[0].id }), true;
    }
    if (!check(password, r.rows[0].pass)) return json(res, 401, { error: 'bad password' }), true;
    if (role) await pool.query('UPDATE users SET role=$2 WHERE email=$1', [email, role]);
    return json(res, 200, { ok: true, id: r.rows[0].id }), true;
  }
  if (req.method === 'POST' && u.pathname === '/api/auth/reset') {
    const { email, newPassword } = await body(req);
    const r = await pool.query('UPDATE users SET pass=$2 WHERE email=$1', [email, hash(newPassword || '')]);
    if (!r.rowCount) return json(res, 404, { error: 'no account' }), true;
    return json(res, 200, { ok: true }), true;
  }
  if (req.method === 'GET' && u.pathname === '/api/teachers') {
    const r = await pool.query("SELECT name, email, bio, subjects FROM users WHERE role='teacher' ORDER BY name");
    return json(res, 200, r.rows.map((x) => ({ name: x.name || x.email.split('@')[0], email: x.email, bio: x.bio || '', subjects: x.subjects || [] }))), true;
  }
  if (req.method === 'GET' && u.pathname === '/api/me') {    const r = await pool.query('SELECT id, email, name, role FROM users WHERE email=$1', [q.email || '']);
    if (!r.rows.length) return json(res, 404, { error: 'no account' }), true;
    return json(res, 200, r.rows[0]), true;
  }
  // Doubts
  if (req.method === 'GET' && u.pathname === '/api/doubts') {
    if (q.teacher) {
      const r = await pool.query('SELECT * FROM doubts WHERE teacher = $1 ORDER BY created DESC LIMIT 200', [q.teacher]);
      return json(res, 200, r.rows.map(row)), true;
    }
    const r = q.email
      ? await pool.query('SELECT * FROM doubts WHERE email=$1 ORDER BY created DESC', [q.email])
      : await pool.query('SELECT * FROM doubts ORDER BY created DESC LIMIT 200');
    return json(res, 200, r.rows.map(row)), true;
  }
  if (req.method === 'POST' && u.pathname === '/api/doubts') {
    const d = await body(req);
    if (!d.email) return json(res, 401, { error: 'login required' }), true;
    await pool.query(
      `INSERT INTO doubts (dkey, email, title, subject, teacher, descr, tags, priority, image, status, created)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10)
       ON CONFLICT (dkey) DO UPDATE SET title=$3, subject=$4, teacher=$5, descr=$6, tags=$7, priority=$8`,
      [d.key, d.email, d.title, d.subject, d.teacher, d.desc, d.tags || [], d.priority || 'normal', d.image || '', d.created || new Date().toISOString()]);
    return json(res, 200, { ok: true }), true;
  }
  if (req.method === 'POST' && u.pathname === '/api/doubts/status') {
    const m = await body(req);
    await pool.query('UPDATE doubts SET status=$2 WHERE dkey=$1', [m.key, m.status]);
    return json(res, 200, { ok: true }), true;
  }
  if (req.method === 'DELETE' && u.pathname === '/api/doubts') {
    if (!q.email) return json(res, 401, { error: 'login required' }), true;
    await pool.query('DELETE FROM replies WHERE doubt_key=$1', [q.key]);
    const r = await pool.query('DELETE FROM doubts WHERE dkey=$1 AND email=$2', [q.key, q.email]);
    return json(res, 200, { ok: !!r.rowCount }), true;
  }
  // Replies
  if (req.method === 'GET' && u.pathname === '/api/replies') {
    const keys = String(q.keys || '').split(',').filter(Boolean);
    if (!keys.length) return json(res, 200, {}), true;
    const r = await pool.query('SELECT * FROM replies WHERE doubt_key = ANY($1) ORDER BY created ASC', [keys]);
    const out = {};
    for (const x of r.rows) (out[x.doubt_key] = out[x.doubt_key] || []).push({ by: x.by, name: x.name, text: x.text, images: x.images, at: x.created });
    return json(res, 200, out), true;
  }
  if (req.method === 'POST' && u.pathname === '/api/replies') {
    const m = await body(req);
    await pool.query('INSERT INTO replies (doubt_key, by, name, text, images) VALUES ($1,$2,$3,$4,$5)',
      [m.doubt_key, m.by, m.name, m.text, JSON.stringify(m.images || [])]);
    return json(res, 200, { ok: true }), true;
  }
  // Teacher meta
  if (req.method === 'GET' && u.pathname === '/api/tmeta') {
    const r = await pool.query('SELECT * FROM tmeta WHERE email=$1', [q.email || '']);
    const out = { starred: [], resolved: {}, notes: {}, drafts: {} };
    for (const m of r.rows) {
      if (m.starred) out.starred.push(m.doubt_key);
      if (m.resolved_at) out.resolved[m.doubt_key] = m.resolved_at;
      if (m.note) out.notes[m.doubt_key] = m.note;
      if (m.draft) out.drafts[m.doubt_key] = m.draft;
    }
    return json(res, 200, out), true;
  }
  if (req.method === 'POST' && u.pathname === '/api/tmeta') {
    const m = await body(req);
    const col = { starred: 'starred', resolved: 'resolved_at', note: 'note', draft: 'draft' }[m.field];
    if (!col) return json(res, 400, { error: 'bad field' }), true;
    await pool.query(
      `INSERT INTO tmeta (email, doubt_key, ${col}) VALUES ($1,$2,$3)
       ON CONFLICT (email, doubt_key) DO UPDATE SET ${col}=$3`, [m.email, m.doubt_key, m.value]);
    return json(res, 200, { ok: true }), true;
  }
  // Notifications
  if (req.method === 'GET' && u.pathname === '/api/notifs') {
    const r = await pool.query('SELECT * FROM notifs WHERE role=$1 ORDER BY created DESC LIMIT 20', [q.role || 'student']);
    return json(res, 200, r.rows.map((x) => ({ id: x.id, role: x.role, text: x.text, at: x.created }))), true;
  }
  if (req.method === 'POST' && u.pathname === '/api/notifs') {
    const m = await body(req);
    await pool.query('INSERT INTO notifs (role, text) VALUES ($1,$2)', [m.role, m.text]);
    return json(res, 200, { ok: true }), true;
  }
  return false;
}
function row(r) {
  return { id: +r.dkey || r.id, key: r.dkey, title: r.title, subject: r.subject, teacher: r.teacher, desc: r.descr, tags: r.tags || [], priority: r.priority, image: r.image || '', status: r.status || 'pending', created: r.created };
}

module.exports = { route, initDb, json };
