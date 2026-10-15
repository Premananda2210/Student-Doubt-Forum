// ============================================================
// Teachers Dashboard — core only: review doubts, reply, resolve.
// Local-first; mirrors to Postgres when served by `node server.js`.
// ============================================================

/* ---------- State ---------- */
function loadTState() {
  try { return JSON.parse(localStorage.getItem('sdf-teacher-v1')) || {}; }
  catch (_) { return {}; }
}
let TSTATE = Object.assign({ replies: {}, resolved: {}, starred: [] }, loadTState());
function persistT() {
  try { localStorage.setItem('sdf-teacher-v1', JSON.stringify(TSTATE)); } catch (_) {}
}

/* ---------- Server sync (local-first; no-ops when served statically) ---------- */
const TMAIL = () => { try { return (typeof getSession === 'function' && getSession() || {}).email || ''; } catch (_) { return ''; } };
const tpush = (p, d, m) => (typeof push === 'function' ? push(p, d, m) : Promise.resolve(false));
const tpull = (p) => (typeof api === 'function' ? api(p) : Promise.resolve(null));
function numericKey(id) {
  const s = String(id);
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/^s(\d+)$/);
  return m ? m[1] : null;
}
function unionLocal(a, b) {
  if (typeof unionReplies === 'function') return unionReplies(a, b);
  const key = (x) => x.by + '|' + x.name + '|' + x.text;
  const seen = new Set();
  return (a || []).concat(b || []).filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
async function pullTeacher() {
  await resolveTeacher();
  const rows = MY_TEACHER ? await tpull('/api/doubts?teacher=' + encodeURIComponent(MY_TEACHER)) : null;
  if (Array.isArray(rows)) {
    let local = [];
    try { local = JSON.parse(localStorage.getItem('sdf-doubts')) || []; } catch (_) {}
    let ch = false;
    for (const srv of rows) {
      if (!local.some((x) => String(x.id) === String(srv.key))) {
        local.unshift({ id: +srv.key || srv.key, title: srv.title, subject: srv.subject, teacher: srv.teacher, desc: srv.desc, tags: srv.tags || [], priority: srv.priority, image: srv.image || '', status: 'pending', created: srv.created, synced: true });
        ch = true;
      } else {
        const ix = local.findIndex((x) => String(x.id) === String(srv.key));
        if (!local[ix].synced) { local[ix].synced = true; ch = true; }
      }
    }
    if (ch) { try { localStorage.setItem('sdf-doubts', JSON.stringify(local)); } catch (_) {} }
    // Only rows assigned to me may be dropped here; other teachers' rows are untouched.
    const alive = new Set(rows.map((r) => String(r.key)));
    const mine = (x) => !!x.teacher && String(x.teacher).toLowerCase() === MY_TEACHER;
    const kept = local.filter((x) => x.dirty || !mine(x) || alive.has(String(x.id)));
    if (kept.length !== local.length) { try { localStorage.setItem('sdf-doubts', JSON.stringify(kept)); } catch (_) {} }
  }
  const keys = [...new Set(allDoubts().map((d) => String(d.id)))];
  const rep = keys.length ? await tpull('/api/replies?keys=' + encodeURIComponent(keys.join(','))) : null;
  if (rep && !rep.__error) {
    let ch = false;
    for (const k of Object.keys(rep)) {
      const u = unionLocal(TSTATE.replies[k], rep[k]);
      if (u.length !== (TSTATE.replies[k] || []).length) { TSTATE.replies[k] = u; ch = true; }
    }
    if (ch) persistT();
  }
  const me = TMAIL();
  if (me) {
    const meta = await tpull('/api/tmeta?email=' + encodeURIComponent(me));
    if (meta && !meta.__error) {
      for (const k of (meta.starred || [])) if (!TSTATE.starred.includes(k)) TSTATE.starred.push(k);
      for (const k of TSTATE.starred) tpush('/api/tmeta', { email: me, doubt_key: k, field: 'starred', value: true });
      Object.assign(TSTATE.resolved, meta.resolved || {});
      for (const k of Object.keys(TSTATE.resolved)) {
        if (!(meta.resolved || {})[k]) tpush('/api/tmeta', { email: me, doubt_key: k, field: 'resolved', value: TSTATE.resolved[k] });
      }
      persistT();
    }
  }
}

/* ---------- Doubts: only those assigned to the signed-in teacher's email ---------- */
let MY_TEACHER = '';
async function resolveTeacher() {
  let email = '';
  try {
    const sess = JSON.parse(localStorage.getItem('sdf-session'));
    if (sess && sess.email) email = String(sess.email).trim().toLowerCase();
  } catch (_) {}
  MY_TEACHER = email;
}
// A doubt belongs to a teacher only when the stored teacher email
// exactly matches the signed-in account email.
function assignedToMe(d) {
  if (!MY_TEACHER || !d.teacher) return false;
  return String(d.teacher).toLowerCase() === MY_TEACHER;
}
function allDoubts() {
  const filed = (typeof getDoubts === 'function' ? getDoubts() : []).map((d) => ({
    id: 's' + d.id, student: 'Student', subject: d.subject || 'General', topic: d.subject || 'General',
    title: d.title, body: d.desc, teacher: d.teacher || '', created: d.created, image: d.image || '', status: 'pending', replies: [],
  }));
  return filed
    .filter(assignedToMe)
    .map((d) => ({
    ...d,
    replies: d.replies.concat(TSTATE.replies[d.id] || []),
    starred: TSTATE.starred.includes(d.id),
    status: TSTATE.resolved[d.id] ? 'answered' : d.status,
    resolvedAt: TSTATE.resolved[d.id] || null,
  }));
}

let ui = { filter: 'all', search: '', sort: 'newest', openId: null, attach: [] };

function escT(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escBR(s) {
  return escT(s).replace(/\n/g, '<br>');
}
function initials(name) {
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}
function fmtDate(iso) {
  try { return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); }
  catch (_) { return ''; }
}

/* ---------- Toast ---------- */
function toast(msg, err) {
  const box = document.querySelector('#toasts');
  if (!box) return;
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' toast-error' : '');
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/* ---------- Filtering / sorting ---------- */
function visibleDoubts() {
  const q = ui.search.trim().toLowerCase();
  let list = allDoubts().filter((d) => {
    if (ui.filter === 'pending' && d.status !== 'pending' && d.status !== 'in-progress') return false;
    if (ui.filter === 'answered' && d.status !== 'answered') return false;
    if (ui.filter === 'starred' && !d.starred) return false;
    if (q && !(d.student + ' ' + d.topic + ' ' + d.title + ' ' + d.body).toLowerCase().includes(q)) return false;
    return true;
  });
  list.sort((a, b) => ui.sort === 'oldest'
    ? new Date(a.created) - new Date(b.created)
    : new Date(b.created) - new Date(a.created));
  return list;
}

/* ---------- Render ---------- */
const T_STATUS = { pending: 'Pending', 'in-progress': 'In Progress', answered: 'Answered' };
const STATUS_CLASS = { pending: 'stamp-pending', 'in-progress': 'stamp-progress', answered: 'stamp-answered' };

function render() {
  const all = allDoubts();
  const pending = all.filter((d) => d.status === 'pending' || d.status === 'in-progress');
  const answered = all.filter((d) => d.status === 'answered');
  const today = new Date().toDateString();
  const todayN = all.filter((d) => d.resolvedAt && new Date(d.resolvedAt).toDateString() === today).length;
  const set = (id, v) => { const el = document.querySelector(id); if (el) el.textContent = v; };
  set('#stat-total', all.length);
  set('#stat-pending', pending.filter((d) => d.status === 'pending').length);
  set('#stat-answered', answered.length);
  set('#stat-today', todayN);
  set('#nav-count-all', all.length);
  set('#nav-count-pending', pending.length);
  set('#nav-count-answered', answered.length);
  set('#nav-count-starred', all.filter((d) => d.starred).length);

  const list = visibleDoubts();
  const grid = document.querySelector('#doubt-list');
  const empty = document.querySelector('#list-empty');
  if (grid) {
    grid.innerHTML = list.map((d) => `
      <article class="card doubt-card">
        <span class="stamp ${STATUS_CLASS[d.status]}">${T_STATUS[d.status]}</span>
        <div class="card-body">
          <div class="doubt-top">
            <span class="teacher-avatar" aria-hidden="true">${escT(initials(d.student))}</span>
            <div><b>${escT(d.student)}</b><small>${escT(fmtDate(d.created))}</small></div>
            <button class="star-btn ${d.starred ? 'is-starred' : ''}" data-star="${escT(d.id)}" aria-label="${d.starred ? 'Unstar' : 'Star'} doubt" aria-pressed="${d.starred}">★</button>
          </div>
          <span class="card-tag">${escT(d.subject)} · ${escT(d.topic)}</span>
          <div class="card-title">${escT(d.title)}</div>
          <p class="text-soft" style="font-size:14px;">${escT(d.body.slice(0, 110))}${d.body.length > 110 ? '…' : ''}</p>
          ${d.image ? `<img class="doubt-thumb" src="${d.image}" alt="Attached image for ${escT(d.title)}" data-zoom="${escT(d.id)}" tabindex="0" />` : ''}
          <div class="card-meta" style="justify-content:space-between;">
            <span>${d.replies.length ? d.replies.length + ' repl' + (d.replies.length > 1 ? 'ies' : 'y') : 'No replies yet'}</span>
            <button class="btn btn-secondary btn-sm" data-open="${escT(d.id)}">View Doubt</button>
          </div>
        </div>
      </article>`).join('');
  }
  if (empty) empty.style.display = list.length ? 'none' : '';
}

/* ---------- Detail modal ---------- */
function openDoubt(id) {
  const d = allDoubts().find((x) => String(x.id) === String(id));
  if (!d) return;
  ui.openId = d.id;
  ui.attach = [];
  const set = (sel, v) => { const el = document.querySelector(sel); if (el) el.innerHTML = v; };
  set('#detail-title', escT(d.title));
  set('#detail-meta', `${escT(d.student)} · ${escT(d.subject)} · ${escT(d.topic)} · ${escT(fmtDate(d.created))}`);
  set('#detail-status', `<span class="stamp ${STATUS_CLASS[d.status]}" style="position:static;transform:none;">${T_STATUS[d.status]}</span>`);
  set('#detail-question', `<p class="q-full">${escBR(d.body)}</p>`
    + (d.image ? `<div class="q-images"><img src="${d.image}" alt="Student attachment" data-zoom-static="${escT(d.image)}" tabindex="0" /></div>` : ''));
  renderThread(d);
  const input = document.querySelector('#reply-input');
  if (input) input.value = '';
  renderAttach();
  const star = document.querySelector('#detail-star');
  if (star) { star.textContent = d.starred ? '★ Starred' : '☆ Mark Important'; star.classList.toggle('is-starred', d.starred); }
  const modal = document.querySelector('#doubt-modal');
  if (modal) {
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    const h = document.querySelector('#detail-title');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
}
function closeDoubt() {
  const modal = document.querySelector('#doubt-modal');
  if (modal) modal.classList.remove('is-open');
  document.body.style.overflow = '';
  ui.openId = null;
}
function renderThread(d) {
  const t = document.querySelector('#thread');
  if (!t) return;
  if (!d.replies.length) {
    t.innerHTML = `<p class="text-faint mono" style="font-size:12.5px;">No replies yet — write the first explanation below.</p>`;
    return;
  }
  t.innerHTML = d.replies.map((r) => `
    <div class="msg ${r.by === 'teacher' ? 'msg-teacher' : ''}">
      <div class="msg-meta">${escT(r.name)} · ${escT(fmtDate(r.at))}</div>
      <div class="msg-body"><p>${escBR(r.text)}</p></div>
      ${(r.images || []).map((im) => `<img src="${im.src || im}" alt="Answer image" data-zoom-static="${escT(im.src || im)}" tabindex="0" style="max-width:100%;border:1px solid var(--line);border-radius:var(--radius);margin-top:10px;" />`).join('')}
    </div>`).join('');
}

/* ---------- Attachments ---------- */
function renderAttach() {
  const box = document.querySelector('#attach-list');
  if (!box) return;
  box.innerHTML = ui.attach.map((a, i) => `
    <div class="attach">
      <img src="${a.src}" alt="Attachment ${i + 1}" />
      <button class="attach-remove" data-unattach="${i}" aria-label="Remove image ${i + 1}">×</button>
    </div>`).join('');
}
function addFiles(files) {
  const err = document.querySelector('#reply-error');
  [...files].forEach((f) => {
    if (!f.type.startsWith('image/')) { if (err) err.textContent = `"${f.name}" is not an image.`; return; }
    if (f.size > 5 * 1024 * 1024) { if (err) err.textContent = `"${f.name}" is over 5MB.`; return; }
    const r = new FileReader();
    r.onload = (e) => { ui.attach.push({ src: e.target.result }); if (err) err.textContent = ''; renderAttach(); };
    r.readAsDataURL(f);
  });
}

/* ---------- Actions ---------- */
function currentDoubt() {
  return allDoubts().find((x) => String(x.id) === String(ui.openId));
}
function sendAnswer() {
  const d = currentDoubt();
  const err = document.querySelector('#reply-error');
  const ta = document.querySelector('#reply-input');
  if (!d || !ta) return;
  const text = ta.value.trim();
  if (!text && !ui.attach.length) { if (err) err.textContent = 'Write an explanation or attach an image first.'; return; }
  if (err) err.textContent = '';
  const reply = { by: 'teacher', name: teacherDisplayName(), text: text || '(see attached images)', images: ui.attach, at: new Date().toISOString() };
  (TSTATE.replies[d.id] = TSTATE.replies[d.id] || []).push(reply);
  TSTATE.resolved[d.id] = new Date().toISOString();
  persistT();
  tpush('/api/replies', { doubt_key: String(d.id), by: reply.by, name: reply.name, text: reply.text, images: reply.images });
  const nk = numericKey(d.id);
  if (nk) tpush('/api/doubts/status', { key: nk, status: 'answered' });
  if (TMAIL()) tpush('/api/tmeta', { email: TMAIL(), doubt_key: String(d.id), field: 'resolved', value: TSTATE.resolved[d.id] });
  ta.value = '';
  ui.attach = [];
  renderAttach();
  const fresh = currentDoubt();
  renderThread(fresh);
  const st = document.querySelector('#detail-status');
  if (st) st.innerHTML = `<span class="stamp ${STATUS_CLASS[fresh.status]}" style="position:static;transform:none;">${T_STATUS[fresh.status]}</span>`;
  render();
  toast('Answer sent and doubt marked as Answered.');
}
function toggleStar(id) {
  id = id || ui.openId;
  const i = TSTATE.starred.indexOf(String(id));
  if (i >= 0) TSTATE.starred.splice(i, 1);
  else TSTATE.starred.push(String(id));
  persistT();
  if (TMAIL()) tpush('/api/tmeta', { email: TMAIL(), doubt_key: String(id), field: 'starred', value: TSTATE.starred.includes(String(id)) });
  render();
  if (ui.openId) {
    const d = currentDoubt();
    const star = document.querySelector('#detail-star');
    if (star && d) { star.textContent = d.starred ? '★ Starred' : '☆ Mark Important'; star.classList.toggle('is-starred', d.starred); }
  }
}
function markResolved() {
  const d = currentDoubt();
  if (!d) return;
  if (d.status === 'answered') { toast('Already marked as Answered.'); return; }
  TSTATE.resolved[d.id] = new Date().toISOString();
  persistT();
  const nk = numericKey(d.id);
  if (nk) tpush('/api/doubts/status', { key: nk, status: 'answered' });
  if (TMAIL()) tpush('/api/tmeta', { email: TMAIL(), doubt_key: String(d.id), field: 'resolved', value: TSTATE.resolved[d.id] });
  const fresh = currentDoubt();
  const st = document.querySelector('#detail-status');
  if (st) st.innerHTML = `<span class="stamp ${STATUS_CLASS[fresh.status]}" style="position:static;transform:none;">${T_STATUS[fresh.status]}</span>`;
  render();
  toast('Doubt marked as Resolved.');
}

/* ---------- Signed-in identity ---------- */
function teacherDisplayName() {
  try {
    const users = JSON.parse(localStorage.getItem('sdf-users')) || {};
    const sess = JSON.parse(localStorage.getItem('sdf-session'));
    if (sess && users[sess.email] && users[sess.email].name) return users[sess.email].name;
    if (sess && sess.email) return sess.email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  } catch (_) {}
  return 'Teacher';
}
function paintIdentity() {
  let sess = null;
  try { sess = JSON.parse(localStorage.getItem('sdf-session')); } catch (_) {}
  if (!sess || !sess.email) return;
  const name = sess.email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const ini = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const av = document.querySelector('#avatar-btn');
  if (av) av.textContent = ini;
  const panel = document.querySelector('#avatar-panel div');
  if (panel) panel.innerHTML = `<strong>${name}</strong><small>${sess.email} · ${sess.role || 'teacher'}</small>`;
}

/* ---------- Filter sync ---------- */
function setFilter(f) {
  ui.filter = f;
  document.querySelectorAll('[data-tab]').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === f));
  document.querySelectorAll('[data-nav]').forEach((n) => n.classList.toggle('is-active', n.dataset.nav === f || (f === 'all' && n.dataset.nav === 'all')));
  render();
}
function pendingList() {
  return allDoubts()
    .filter((d) => d.status === 'pending' || d.status === 'in-progress')
    .sort((a, b) => new Date(b.created) - new Date(a.created));
}
function showLightbox(src) {
  const lb = document.querySelector('#lightbox');
  const img = lb && lb.querySelector('img');
  if (!lb || !img) return;
  img.src = src;
  lb.classList.add('is-open');
  document.body.style.overflow = 'hidden';
}
function hideLightbox() {
  const lb = document.querySelector('#lightbox');
  if (lb) lb.classList.remove('is-open');
  if (!ui.openId) document.body.style.overflow = '';
}

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  if (!document.querySelector('#doubt-list')) return; // not the dashboard page
  try { await Promise.race([pullTeacher(), new Promise((r) => setTimeout(r, 4000))]); } catch (_) {}
  render();
  paintIdentity();
  if (typeof mountThemeToggle === 'function' && !document.querySelector('[data-theme-toggle]')) {
    const top = document.querySelector('.top');
    if (top) mountThemeToggle(top, 'icon-btn');
  }

  document.querySelectorAll('[data-tab]').forEach((t) => t.addEventListener('click', () => setFilter(t.dataset.tab)));
  document.querySelectorAll('[data-nav]').forEach((n) => n.addEventListener('click', () => {
    const f = n.dataset.nav;
    if (f === 'dashboard') { setFilter('all'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else { setFilter(f); const l = document.querySelector('#doubts-section'); if (l) l.scrollIntoView({ behavior: 'smooth' }); }
    document.querySelector('#side').classList.remove('is-open');
  }));
  const search = document.querySelector('#dash-search');
  if (search) search.addEventListener('input', () => { ui.search = search.value; render(); });
  const sort = document.querySelector('#sort-select');
  if (sort) sort.addEventListener('change', () => { ui.sort = sort.value; render(); });

  document.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) {
      document.querySelectorAll('.menu-panel.is-open').forEach((m) => m.classList.remove('is-open'));
      openDoubt(open.dataset.open);
      return;
    }
    const star = e.target.closest('[data-star]');
    if (star) { toggleStar(star.dataset.star); return; }
    const zoom = e.target.closest('[data-zoom]');
    if (zoom) {
      const d = allDoubts().find((x) => String(x.id) === String(zoom.dataset.zoom));
      if (d && d.image) showLightbox(d.image);
      return;
    }
    const zs = e.target.closest('[data-zoom-static]');
    if (zs) { showLightbox(zs.dataset.zoomStatic); return; }
    const un = e.target.closest('[data-unattach]');
    if (un) { ui.attach.splice(+un.dataset.unattach, 1); renderAttach(); return; }
    if (!e.target.closest('.menu')) document.querySelectorAll('.menu-panel.is-open').forEach((m) => m.classList.remove('is-open'));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.querySelector('#lightbox.is-open')) hideLightbox();
      else if (ui.openId) closeDoubt();
      document.querySelectorAll('.menu-panel.is-open').forEach((m) => m.classList.remove('is-open'));
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-zoom]')) {
      e.preventDefault();
      const d = allDoubts().find((x) => String(x.id) === String(e.target.dataset.zoom));
      if (d && d.image) showLightbox(d.image);
    }
  });

  const modal = document.querySelector('#doubt-modal');
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeDoubt(); });
  const lb = document.querySelector('#lightbox');
  if (lb) lb.addEventListener('click', (e) => { if (e.target === lb || e.target === lb.querySelector('img')) hideLightbox(); });

  const bind = (sel, fn) => { const el = document.querySelector(sel); if (el) el.addEventListener('click', fn); };
  bind('[data-close-detail]', closeDoubt);
  bind('#detail-star', () => toggleStar());
  bind('#btn-resolve', markResolved);
  bind('#btn-send', sendAnswer);

  const fileInput = document.querySelector('#answer-images');
  const drop = document.querySelector('#dropzone');
  if (fileInput) {
    if (drop) {
      drop.addEventListener('click', (e) => { if (e.target === drop || e.target.closest('span')) fileInput.click(); });
      ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.style.borderColor = 'var(--ink)'; }));
      ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.style.borderColor = ''; }));
      drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
    }
    fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
  }

  bind('#avatar-btn', () => {
    document.querySelector('#avatar-panel').classList.toggle('is-open');
  });
  bind('#hamburger', () => document.querySelector('#side').classList.toggle('is-open'));
});
