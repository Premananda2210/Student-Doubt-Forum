// ============================================================
// Student Doubt Forum shared frontend behaviors
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  try { await Promise.race([pullFromServer(), new Promise((r) => setTimeout(r, 4000))]); } catch (_) {}
  initMobileNav();
  initModals();
  initAskDoubtForm();
  initStudentDashboard();
  initDoubtDetails();
  initTeacherProfiles();
  initImageUpload();
  initLoginForm();
  initSignupForm();
});

/* ---------- Theme (ponytail: localStorage only, no server sync) ---------- */
function initTheme() {
  const root = document.documentElement;
  try {
    const saved = localStorage.getItem('sdf-theme');
    if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches) root.dataset.theme = 'dark';
  } catch (_) {}
  const actions = document.querySelector('.nav-actions');
  if (!actions || actions.querySelector('[data-theme-toggle]')) return;
  mountThemeToggle(actions, 'btn btn-secondary btn-sm');
}
function mountThemeToggle(container, cls) {
  const root = document.documentElement;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = cls || 'btn btn-secondary btn-sm';
  btn.setAttribute('data-theme-toggle', '');
  const sun = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const moon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>';
  const paint = () => {
    const dark = root.dataset.theme === 'dark';
    btn.innerHTML = dark ? sun : moon;
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  };
  btn.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('sdf-theme', root.dataset.theme); } catch (_) {}
    paint();
  });
  paint();
  container.prepend(btn);
}

/* ---------- Mobile nav ---------- */
function initMobileNav() {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (!toggle || !links) return;
  toggle.addEventListener('click', () => {
    const open = links.style.display === 'flex';
    links.style.display = open ? 'none' : 'flex';
    links.style.flexDirection = 'column';
    links.style.position = 'absolute';
    links.style.top = '72px';
    links.style.left = '0';
    links.style.right = '0';
    links.style.background = 'var(--bg)';
    links.style.padding = '20px 32px';
    links.style.boxShadow = '0 8px 16px rgba(20,20,20,0.08)';
    toggle.setAttribute('aria-expanded', String(!open));
  });
}

/* ---------- Role-based login ---------- */
function initLoginForm() {
  const form = document.querySelector('#login-form');
  if (!form) return;

  const roleInput = document.querySelector('#login-role');
  const roleOptions = document.querySelectorAll('[data-login-role]');
  const submitButton = form.querySelector('button[type="submit"]');
  const error = document.querySelector('#login-error');
  const pwInput = document.querySelector('#login-password');
  const pwToggle = form.querySelector('[data-password-toggle]');
  const remember = document.querySelector('#login-remember');
  // Prefill remembered email.
  try {
    const sess = JSON.parse(localStorage.getItem('sdf-session') || 'null');
    if (sess && sess.remember && sess.email) {
      form.elements.email.value = sess.email;
      if (remember) remember.checked = true;
      if (sess.role) {
        roleInput.value = sess.role;
        roleOptions.forEach((item) => {
          const selected = item.dataset.loginRole === sess.role;
          item.classList.toggle('is-selected', selected);
          item.setAttribute('aria-checked', String(selected));
        });
        submitButton.innerHTML = `Log in as ${sess.role === 'student' ? 'Student' : 'Teacher'} <span aria-hidden="true">→</span>`;
      }
    }
  } catch (_) {}
  const forgot = document.querySelector('#forgot-btn');
  const forgotModal = document.querySelector('#forgot-modal');
  if (forgot && forgotModal) forgot.addEventListener('click', () => {
    forgotModal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    const em = document.querySelector('#forgot-email');
    if (em) em.value = form.elements.email.value.trim();
  });
  const forgotForm = document.querySelector('#forgot-form');
  if (forgotForm) forgotForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const em = document.querySelector('#forgot-email').value.trim().toLowerCase();
    const np = document.querySelector('#forgot-new').value;
    const cp = document.querySelector('#forgot-confirm').value;
    const ferr = document.querySelector('#forgot-error');
    if (np.length < 6) { ferr.textContent = 'New password must be at least 6 characters.'; return; }
    if (np !== cp) { ferr.textContent = 'New passwords do not match.'; return; }
    const users = getUsers();
    const srv = await api('/api/auth/reset', { method: 'POST', body: JSON.stringify({ email: em, newPassword: np }) });
    if (srv && srv.ok) {
      if (users[em]) { users[em].password = np; saveUsers(users); }
    } else {
      // Offline/static, or unknown on server: local account required.
      if (!em || !users[em]) { ferr.textContent = 'No account found for that email. Log in once to create it.'; return; }
      users[em].password = np;
      saveUsers(users);
    }
    ferr.textContent = '';
    forgotModal.classList.remove('is-open');
    document.body.style.overflow = '';
    toast('Password updated — log in with your new password.');
  });
  if (pwInput && pwToggle) {
    const eye = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>';
    const eyeOff = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12A3 3 0 1 1 9.88 9.88"/><line x1="1" y1="23" x2="23" y2="1"/></svg>';
    pwToggle.innerHTML = eye;
    pwToggle.addEventListener('click', () => {
      const show = pwInput.type === 'password';
      pwInput.type = show ? 'text' : 'password';
      pwToggle.innerHTML = show ? eyeOff : eye;
      pwToggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  }

  roleOptions.forEach((option) => {
    option.addEventListener('click', () => {
      const role = option.dataset.loginRole;
      roleInput.value = role;
      roleOptions.forEach((item) => {
        const selected = item === option;
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-checked', String(selected));
      });
      submitButton.innerHTML = `Log in as ${role === 'student' ? 'Student' : 'Teacher'} <span aria-hidden="true">→</span>`;
      error.textContent = '';
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = form.elements.email.value.trim().toLowerCase();
    const password = form.elements.password.value;
    if (!email || !password) {
      error.textContent = 'Enter your college email and password to continue.';
      return;
    }
    if (!form.elements.email.validity.valid) {
      error.textContent = 'Enter a valid college email address.';
      return;
    }
    if (password.length < 6) {
      error.textContent = 'Password must be at least 6 characters.';
      return;
    }
    const users = getUsers();
    const srv = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password, role: roleInput.value }) });
    if (srv && srv.__error === 401) {
      error.textContent = 'Incorrect password. Use “Forgot password?” to reset it.';
      return;
    }
    if (srv && srv.ok) {
      // Server is source of truth; mirror locally for offline use.
      users[email] = { password, role: roleInput.value, created: (users[email] || {}).created || new Date().toISOString() };
    } else if (!srv || !srv.ok) {
      if (users[email] && users[email].password !== password) {
        error.textContent = 'Incorrect password. Use “Forgot password?” to reset it.';
        return;
      }
      if (!users[email]) {
        users[email] = { password, role: roleInput.value, created: new Date().toISOString() };
      } else {
        users[email].role = roleInput.value;
      }
    }
    saveUsers(users);
    error.textContent = '';
    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="loader"></span> Signing in…';
    saveSession({ email, role: roleInput.value, remember: !!(remember && remember.checked) });
    let next = null;
    try {
      next = new URLSearchParams(location.search).get('next');
      if (next && !/^[\w\-./?=&%]+$/.test(next)) next = null;
      if (next && (next.includes('//') || next.includes(':'))) next = null;
    } catch (_) { next = null; }
    setTimeout(() => {
      window.location.href = next || (roleInput.value === 'teacher' ? 'teacher-dashboard.html' : 'student-dashboard.html');
    }, 350);
  });
}

/* ---------- Signup ---------- */
function initSignupForm() {
  const form = document.querySelector('#signup-form');
  if (!form) return;
  const roleInput = document.querySelector('#signup-role');
  const roleOptions = document.querySelectorAll('[data-signup-role]');
  const error = document.querySelector('#signup-error');
  const submitButton = form.querySelector('button[type="submit"]');
  const pwInput = document.querySelector('#signup-password');
  const pwToggle = form.querySelector('[data-password-toggle]');
  if (pwInput && pwToggle) {
    pwToggle.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>';
    pwToggle.addEventListener('click', () => {
      const show = pwInput.type === 'password';
      pwInput.type = show ? 'text' : 'password';
      pwToggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  }
  roleOptions.forEach((option) => {
    option.addEventListener('click', () => {
      roleInput.value = option.dataset.signupRole;
      roleOptions.forEach((item) => {
        const selected = item === option;
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-checked', String(selected));
      });
      paintTeachFields();
      error.textContent = '';
    });
  });
  const paintTeachFields = () => {
    const show = roleInput.value === 'teacher';
    ['#signup-subjects', '#signup-bio'].forEach((sel) => {
      const input = document.querySelector(sel);
      const field = input && input.closest('.field');
      if (field) field.style.display = show ? '' : 'none';
    });
  };
  paintTeachFields();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim().toLowerCase();
    const password = form.elements.password.value;
    if (!name || !email || !password) {
      error.textContent = 'Enter your name, college email, and password.';
      return;
    }
    if (!form.elements.email.validity.valid) {
      error.textContent = 'Enter a valid college email address.';
      return;
    }
    if (password.length < 6) {
      error.textContent = 'Password must be at least 6 characters.';
      return;
    }
    const subjects = form.elements.subjects ? form.elements.subjects.value.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const bio = form.elements.bio ? form.elements.bio.value.trim() : '';
    const users = getUsers();
    if (users[email]) {
      error.textContent = 'An account with this email already exists. Log in instead.';
      return;
    }
    const srv = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, password, role: roleInput.value, bio, subjects }) });
    if (srv && srv.__error === 409) {
      error.textContent = 'An account with this email already exists. Log in instead.';
      return;
    }
    users[email] = { password, role: roleInput.value, name, bio, subjects, created: new Date().toISOString() };
    saveUsers(users);
    error.textContent = '';
    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="loader"></span> Creating…';
    saveSession({ email, role: roleInput.value, remember: false });
    setTimeout(() => {
      window.location.href = roleInput.value === 'teacher' ? 'teacher-dashboard.html' : 'student-dashboard.html';
    }, 350);
  });
}

/* ---------- Modal windows ---------- */
function initModals() {
  document.querySelectorAll('[data-modal-target]').forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      const modal = document.querySelector(trigger.dataset.modalTarget);
      if (modal) {
        modal.classList.add('is-open');
        document.body.style.overflow = 'hidden';
      }
    });
  });
  document.querySelectorAll('[data-modal-close]').forEach((closer) => {
    closer.addEventListener('click', () => closeAllModals());
  });
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeAllModals();
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
  });
}
function closeAllModals() {
  document.querySelectorAll('.modal-overlay.is-open').forEach((m) => m.classList.remove('is-open'));
  document.body.style.overflow = '';
}

/* ---------- Doubt storage (local-first; mirrors to Postgres when served by node) ---------- */
function getDoubts() {
  try { return JSON.parse(localStorage.getItem('sdf-doubts')) || []; }
  catch (_) { return []; }
}
function saveDoubt(d) {
  const all = getDoubts();
  if (!d.owner) d.owner = (getSession() || {}).email || '';
  all.unshift(d);
  const persist = () => { try { localStorage.setItem('sdf-doubts', JSON.stringify(all)); } catch (_) {
    d.image = '';
    try { localStorage.setItem('sdf-doubts', JSON.stringify(all)); } catch (_) {}
  } };
  persist();
  // Mirror to Postgres (upsert); flag for retry when the server is unreachable.
  if (!USE_API) return;
  push('/api/doubts', { ...d, key: String(d.id), email: (getSession() || {}).email || '' }).then((ok) => {
    if (ok) {
      const a = getDoubts();
      const j = a.findIndex((x) => String(x.id) === String(d.id));
      if (j >= 0 && !a[j].synced) { a[j].synced = true; try { localStorage.setItem('sdf-doubts', JSON.stringify(a)); } catch (_) {} }
      return;
    }
    if (d.dirty) return;
    d.dirty = true;
    persist();
  });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function initialsOf(name) {
  return String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}
function fmtDate(iso) {
  try { return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); }
  catch (_) { return ''; }
}

/* ---------- Teacher directory: doubts are assigned by account email ---------- */
const TEACHERS = [
  { name: 'Manisha Matekar', email: 'manishamatekar@gmail.com' },
  { name: 'Mansi Jain', email: 'mansijain@gmail.com' },
  { name: 'Sunandita Swain', email: 'sunanditaswain@gmail.com' },
  { name: 'Shradhha Madhavi', email: 'shradhhamadhavi@gmail.com' },
  { name: 'Sherly Roy', email: 'sherlyroy@gmail.com' },
  { name: 'Ashwini', email: 'ashwini@gmail.com' },
  { name: 'Sonal Mehrotra', email: 'sonalmehrotra@gmail.com' },
];
function teacherName(id) {
  if (!id) return '';
  const dir = TEACHER_LIST && TEACHER_LIST.length ? TEACHER_LIST : TEACHERS;
  const hit = dir.find((t) => t.email.toLowerCase() === String(id).toLowerCase() || t.name.toLowerCase() === String(id).toLowerCase());
  return hit ? hit.name : id;
}
let TEACHER_LIST = null;
async function loadTeachers() {
  const r = await api('/api/teachers');
  if (Array.isArray(r) && r.length) TEACHER_LIST = r;
  return TEACHER_LIST && TEACHER_LIST.length ? TEACHER_LIST : TEACHERS;
}

/* ---------- Toasts ---------- */
function toast(msg, isErr) {
  let box = document.querySelector('#toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = 'toast' + (isErr ? ' toast-error' : '');
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/* ---------- Session / profile / notifications (localStorage demo layer) ---------- */
function getUsers() {
  try { return JSON.parse(localStorage.getItem('sdf-users')) || {}; } catch (_) { return {}; }
}
function saveUsers(u) {
  try { localStorage.setItem('sdf-users', JSON.stringify(u)); } catch (_) {}
}
function getSession() {
  try { return JSON.parse(localStorage.getItem('sdf-session')) || null; } catch (_) { return null; }
}
function saveSession(s) {
  try { localStorage.setItem('sdf-session', JSON.stringify(s)); } catch (_) {}
}

/* ---------- Server sync (local-first; live only when served by `node server.js`) ---------- */
// ponytail: no retry queue beyond dirty-flag re-push on next pull; a message queue is the upgrade path.
// Always try the same-origin API; api() returns null when unreachable,
// so static hosting transparently falls back to browser-only data.
const USE_API = true;
async function api(path, opts) {
  if (!USE_API) return null;
  try {
    const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...(opts || {}) });
    if (!r.ok) return { __error: r.status };
    return await r.json();
  } catch (_) { return null; }
}
function push(path, data, method) {
  if (!USE_API) return Promise.resolve(false);
  return api(path, { method: method || 'POST', body: JSON.stringify(data) }).then((r) => !!(r && !r.__error));
}
function unionReplies(a, b) {
  // Same words from the same person on one doubt = the same reply
  // (timestamps serialize differently across local/DB, so `at` is ignored).
  const key = (x) => x.by + '|' + x.name + '|' + x.text;
  const seen = new Set();
  return (a || []).concat(b || []).filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
async function pullFromServer() {
  if (!USE_API) return;
  const sess = getSession();
  if (!sess || !sess.email) return;
  const rows = await api('/api/doubts?email=' + encodeURIComponent(sess.email));
  if (Array.isArray(rows)) {
    const local = getDoubts();
    let changed = false;
    for (const srv of rows) {
      const i = local.findIndex((x) => String(x.id) === String(srv.key));
      if (i < 0) {
        local.unshift({ id: +srv.key || srv.key, owner: sess.email, title: srv.title, subject: srv.subject, teacher: srv.teacher, desc: srv.desc, tags: srv.tags || [], priority: srv.priority, image: srv.image || '', status: 'pending', created: srv.created, synced: true });
        changed = true;
      } else {
        // Present on server = synced, whatever the local flags say (heals old records).
        if (!local[i].synced || !local[i].owner) { local[i].synced = true; local[i].owner = local[i].owner || sess.email; changed = true; }
        if (local[i].dirty) {
          const rec = local[i];
          push('/api/doubts', { ...rec, key: String(rec.id), email: sess.email }).then((ok) => {
            if (!ok) return;
            const a = getDoubts();
            const j = a.findIndex((x) => String(x.id) === String(rec.id));
            if (j >= 0) { delete a[j].dirty; try { localStorage.setItem('sdf-doubts', JSON.stringify(a)); } catch (_) {} }
          });
        } else if (srv.status && srv.status !== local[i].serverStatus) {
          local[i].serverStatus = srv.status;
          changed = true;
        }
      }
    }
    // Server truth wins: drop anything missing there unless it's an unsynced
    // offline record or belongs to a different signed-in account.
    const alive = new Set(rows.map((r) => String(r.key)));
    const kept = local.filter((x) => x.dirty || (x.owner && x.owner !== sess.email) || alive.has(String(x.id)));
    if (kept.length !== local.length) {
      try { localStorage.setItem('sdf-doubts', JSON.stringify(kept)); } catch (_) {}
    } else if (changed) { try { localStorage.setItem('sdf-doubts', JSON.stringify(local)); } catch (_) {} }
  }
  const mine = getDoubts();
  const keys = [...new Set(mine.flatMap((d) => [String(d.id), 's' + d.id]))];
  if (keys.length) {
    const rep = await api('/api/replies?keys=' + encodeURIComponent(keys.join(',')));
    if (rep && !rep.__error) {
      const ts = getTState();
      ts.replies = ts.replies || {};
      let ch = false;
      for (const k of Object.keys(rep)) {
        const u = unionReplies(ts.replies[k], rep[k]);
        if (u.length !== (ts.replies[k] || []).length) { ts.replies[k] = u; ch = true; }
      }
      if (ch) { try { localStorage.setItem('sdf-teacher-v1', JSON.stringify(ts)); } catch (_) {} }
    }
  }
}
/* Read-only mirror of teacher state so student views reflect answers. */
function getTState() {
  try { return JSON.parse(localStorage.getItem('sdf-teacher-v1')) || {}; } catch (_) { return {}; }
}
function doubtStatus(d) {
  if (d.serverStatus === 'answered') return 'answered';
  const ts = getTState();
  const key = 's' + d.id;
  if ((ts.resolved || {})[d.id] || (ts.resolved || {})[key]) return 'answered';
  const replies = ((ts.replies || {})[d.id] || []).concat((ts.replies || {})[key] || []);
  if (replies.some((r) => r.by === 'teacher')) return 'in-progress';
  return 'pending';
}

/* ---------- Ask Doubt form (create + edit; login required) ---------- */
function initAskDoubtForm() {
  const form = document.querySelector('#ask-doubt-form');
  if (!form) return;
  const sess = getSession();
  if (!sess || !sess.email) {
    window.location.href = 'login.html?next=' + encodeURIComponent('ask-doubt.html' + location.search);
    return;
  }
  const params = new URLSearchParams(location.search);
  const editId = params.get('id');
  const titleEl = form.querySelector('#doubt-title');
  const subjEl = form.querySelector('#subject');
  const teacherEl = form.querySelector('#teacher');
  const descEl = form.querySelector('#description');
  const headEl = document.querySelector('#ask-heading');
  // Populate teachers: hardcoded directory instantly, live roster when the server answers.
  const fillTeachers = (list) => {
    const cur = teacherEl.value;
    teacherEl.innerHTML = '<option value="">Select a teacher</option>';
    list.forEach((t) => {
      const o = document.createElement('option');
      o.value = t.email;
      o.textContent = t.name;
      teacherEl.appendChild(o);
    });
    teacherEl.value = cur || (editId && (getDoubts().find((x) => String(x.id) === String(editId)) || {}).teacher) || '';
  };
  fillTeachers(TEACHERS);
  loadTeachers().then((list) => {
    fillTeachers(list);
    // New teachers bring new subjects: merge them into the subject dropdown.
    const extra = [...new Set(list.flatMap((t) => t.subjects || []))].filter(Boolean).sort();
    if (extra.length) {
      const cur = subjEl.value;
      const have = new Set([...subjEl.options].map((o) => o.value));
      extra.forEach((s) => {
        if (!have.has(s)) {
          const o = document.createElement('option');
          o.value = s;
          o.textContent = s;
          subjEl.appendChild(o);
        }
      });
      subjEl.value = cur;
    }
  });
  if (editId) {
    const d = getDoubts().find((x) => String(x.id) === String(editId));
    if (d) {
      titleEl.value = d.title || '';
      subjEl.value = d.subject || '';
      teacherEl.value = d.teacher || '';
      descEl.value = d.desc || '';
      if (headEl) headEl.textContent = 'Edit your doubt';
    }
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!titleEl.value.trim() || !subjEl.value || !teacherEl.value || !descEl.value.trim()) {
      toast('Please fill in the title, subject, teacher, and description.', true);
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    const original = btn.innerHTML;
    const img = form.querySelector('#upload-preview img');
    if (editId) {
      const all = getDoubts().map((x) => String(x.id) === String(editId)
        ? { ...x, title: titleEl.value.trim(), subject: subjEl.value, teacher: teacherEl.value, desc: descEl.value.trim() } : x);
      try { localStorage.setItem('sdf-doubts', JSON.stringify(all)); } catch (_) {}
      if (USE_API) push('/api/doubts', { key: String(editId), email: (getSession() || {}).email || '', title: titleEl.value.trim(), subject: subjEl.value, teacher: teacherEl.value, desc: descEl.value.trim() });
      toast('Doubt updated.');
      setTimeout(() => { window.location.href = 'student-dashboard.html'; }, 600);
      return;
    }
    saveDoubt({
      id: Date.now(),
      title: titleEl.value.trim(),
      subject: subjEl.value,
      teacher: teacherEl.value,
      desc: descEl.value.trim(),
      image: img ? img.src : '',
      status: 'pending',
      created: new Date().toISOString(),
    });
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span> Posting…';
    setTimeout(() => {
      const confirmModal = document.querySelector('#doubt-posted-modal');
      btn.disabled = false;
      btn.innerHTML = original;
      if (confirmModal) {
        confirmModal.classList.add('is-open');
        document.body.style.overflow = 'hidden';
      } else {
        toast('Doubt posted.');
      }
      form.reset();
      const preview = document.querySelector('#upload-preview');
      if (preview) preview.innerHTML = '';
    }, 900);
  });
}

/* ---------- Student dashboard (filters, search, sort, edit, delete) ---------- */
const STATUS_STAMP = { pending: 'stamp-pending', 'in-progress': 'stamp-progress', answered: 'stamp-answered' };
const STATUS_LABEL = { pending: 'Pending', 'in-progress': 'In Progress', answered: 'Answered' };
function initStudentDashboard() {
  const grid = document.querySelector('#student-doubts');
  if (!grid) return;
  const f = { q: '', subject: '', teacher: '', status: '', sort: 'newest' };
  try {
    const p = new URLSearchParams(location.search);
    if (p.get('subject')) f.subject = p.get('subject');
  } catch (_) {}
  // Skeleton while "loading".
  grid.innerHTML = [1, 2, 3].map(() => '<div class="card"><div class="card-body"><div class="skel" style="height:18px;width:40%;margin-bottom:12px;"></div><div class="skel" style="height:26px;width:90%;margin-bottom:8px;"></div><div class="skel" style="height:14px;width:60%;"></div></div></div>').join('');
  setTimeout(() => renderStudentGrid(grid, f), 350);
  renderStudentProfile();
  buildStudentFilters(f, grid);
  const sort = document.querySelector('#student-sort');
  if (sort) sort.addEventListener('change', () => { f.sort = sort.value; renderStudentGrid(grid, f); });
  const search = document.querySelector('#student-search');
  if (search) search.addEventListener('input', () => { f.q = search.value; renderStudentGrid(grid, f); });
  grid.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del && confirm('Delete this doubt permanently?')) {
      const all = getDoubts().filter((x) => String(x.id) !== String(del.dataset.del));
      try { localStorage.setItem('sdf-doubts', JSON.stringify(all)); } catch (_) {}
      if (USE_API) push(`/api/doubts?key=${encodeURIComponent(del.dataset.del)}&email=${encodeURIComponent((getSession() || {}).email || '')}`, null, 'DELETE');
      toast('Doubt deleted.');
      buildStudentFilters(f, grid, true);
      renderStudentGrid(grid, f);
    }
  });
}
function studentFiltered(f) {
  const q = f.q.trim().toLowerCase();
  let list = getDoubts().map((d) => ({ ...d, live: doubtStatus(d) }));
  if (f.subject) list = list.filter((d) => d.subject === f.subject);
  if (f.teacher) list = list.filter((d) => d.teacher === f.teacher);
  if (f.status) list = list.filter((d) => d.live === f.status);
  if (q) list = list.filter((d) => (d.title + ' ' + d.desc).toLowerCase().includes(q));
  list.sort((a, b) => f.sort === 'oldest' ? new Date(a.created) - new Date(b.created) : new Date(b.created) - new Date(a.created));
  return list;
}
function renderStudentGrid(grid, f) {
  const list = studentFiltered(f);
  const empty = document.querySelector('#student-empty');
  if (empty) empty.style.display = list.length ? 'none' : '';
  grid.innerHTML = list.map((d) => `
    <article class="card">
      <span class="stamp ${STATUS_STAMP[d.live] || 'stamp-pending'}">${STATUS_LABEL[d.live] || 'Pending'}</span>
      <div class="card-body">
        <span class="card-tag">${esc(d.subject)}</span>
        <div class="card-title">${esc(d.title)}</div>
        <p class="text-soft" style="font-size:14px;">${esc(d.desc.slice(0, 110))}${d.desc.length > 110 ? '…' : ''}</p>
        ${d.image ? `<img src="${d.image}" alt="" style="max-height:140px;width:100%;object-fit:cover;border-radius:3px;border:1px solid var(--line);margin-top:10px;" />` : ''}
        <div class="card-meta" style="justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span>${esc(teacherName(d.teacher))} · ${esc(fmtDate(d.created))}</span>
          <span style="display:flex;gap:8px;">
            <a class="btn btn-secondary btn-sm" href="doubt-details.html?id=${esc(d.id)}">View</a>
            <a class="btn btn-secondary btn-sm" href="ask-doubt.html?id=${esc(d.id)}">Edit</a>
            <button class="btn btn-secondary btn-sm" data-del="${esc(d.id)}" aria-label="Delete ${esc(d.title)}">Delete</button>
          </span>
        </div>
      </div>
    </article>`).join('');
}
function buildStudentFilters(f, grid, rebuild) {
  const doubts = getDoubts();
  const subjects = [...new Set(doubts.map((d) => d.subject).filter(Boolean))];
  const teachers = [...new Set(doubts.map((d) => d.teacher).filter(Boolean))];
  const sEl = document.querySelector('#filter-subject');
  if (sEl && (!sEl.options.length || rebuild)) {
    sEl.innerHTML = '<option value="">All subjects</option>' + subjects.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if (f.subject) sEl.value = f.subject;
    sEl.addEventListener('change', () => { f.subject = sEl.value; renderStudentGrid(grid, f); }, { once: true });
  }
  const tEl = document.querySelector('#filter-teacher');
  if (tEl && (!tEl.options.length || rebuild)) {
    tEl.innerHTML = '<option value="">All teachers</option>' + teachers.map((v) => `<option value="${esc(v)}">${esc(teacherName(v))}</option>`).join('');
    tEl.addEventListener('change', () => { f.teacher = tEl.value; renderStudentGrid(grid, f); }, { once: true });
  }
  const stEl = document.querySelector('#filter-status');
  if (stEl && !stEl.dataset.bound) {
    stEl.dataset.bound = '1';
    stEl.addEventListener('change', () => { f.status = stEl.value; renderStudentGrid(grid, f); });
  }
}
function renderStudentProfile() {
  const box = document.querySelector('#student-profile');
  if (!box) return;
  const s = getSession();
  const name = (s && s.email ? s.email.split('@')[0] : 'Student');
  const doubts = getDoubts();
  const ans = doubts.filter((d) => doubtStatus(d) === 'answered').length;
  box.innerHTML = `
    <div class="profile-head">
      <span class="teacher-avatar" aria-hidden="true">${esc(initialsOf(name))}</span>
      <div style="flex:1;min-width:200px;">
        <h2 style="font-size:24px;">${esc(name)}</h2>
        <p class="mono text-faint" style="font-size:12px;margin-top:4px;">${doubts.length} doubts · ${ans} answered</p>
      </div>
      <a class="btn btn-primary btn-sm" href="ask-doubt.html">Ask a Doubt</a>
    </div>`;
}

/* ---------- Image upload preview ---------- */
function initImageUpload() {
  const input = document.querySelector('#doubt-image-input');
  const box = document.querySelector('#upload-box');
  const preview = document.querySelector('#upload-preview');
  const err = document.querySelector('#upload-error');
  if (!input || !box) return;
  const pick = () => input.click();
  box.addEventListener('click', pick);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
  });
  input.addEventListener('change', () => {
    if (err) err.textContent = '';
    if (!input.files || !input.files[0] || !preview) return;
    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      if (err) err.textContent = 'That file is not an image. Choose a PNG, JPG, or GIF.';
      input.value = '';
      return;
    }
    // ponytail: 5MB cap keeps previews snappy; raise or move to server checks with a real upload backend.
    if (file.size > 5 * 1024 * 1024) {
      if (err) err.textContent = 'Image is over 5MB. Try a smaller file.';
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.innerHTML = `<img src="${e.target.result}" alt="Uploaded preview" style="max-height:160px;border-radius:3px;border:1px solid var(--line);margin-top:14px;" />
      <p class="mono text-faint mt-8" style="font-size:12px;">${file.name}</p>`;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------- Teacher roster page (live accounts, hardcoded fallback) ---------- */
const FALLBACK_BIOS = {
  'manishamatekar@gmail.com': { subjects: ['IKS in Computational Systems'], bio: 'Guides students through Indian knowledge systems and computational thinking.' },
  'sunanditaswain@gmail.com': { subjects: ['Artificial Intelligence'], bio: 'Helps students understand Artificial Intelligence concepts and applications.' },
  'sonalmehrotra@gmail.com': { subjects: ['Cyber and Security Information'], bio: 'Supports students with cybersecurity and information security concepts.' },
  'sherlyroy@gmail.com': { subjects: ['Statistics'], bio: 'Helps students build a clear foundation in statistics and data interpretation.' },
  'shradhhamadhavi@gmail.com': { subjects: ['Time Series and Analysis', 'Web Analytics and Optimization', 'Mini Project', 'CEP Project'], bio: 'Provides guidance for analytics, project work, and continuous evaluation projects.' },
  'ashwini@gmail.com': { subjects: ['Ethical Hacking'], bio: 'Guides students in ethical hacking principles and responsible security practices.' },
  'mansijain@gmail.com': { subjects: ['Software Testing and Quality Assurance'], bio: 'Supports students with software testing practices and quality assurance concepts.' },
};
async function initTeacherProfiles() {
  const grid = document.querySelector('#teacher-grid');
  if (!grid) return;
  let list = TEACHERS.map((t) => ({ ...t, ...(FALLBACK_BIOS[t.email.toLowerCase()] || {}) }));
  grid.innerHTML = list.map(teacherCard).join('');
  const live = await loadTeachers();
  if (live !== TEACHERS && live.length) {
    const fb = (e) => FALLBACK_BIOS[String(e).toLowerCase()] || {};
    list = live.map((t) => ({ ...t, subjects: t.subjects && t.subjects.length ? t.subjects : (fb(t.email).subjects || []), bio: t.bio || fb(t.email).bio || '' }));
    grid.innerHTML = list.map(teacherCard).join('');
  }
}
function teacherCard(t) {
  const subs = (t.subjects || []).join(' · ') || 'General guidance';
  return `<div class="card"><div class="card-body"><div class="teacher-avatar">${esc(initialsOf(t.name))}</div>`
    + `<div class="card-title">${esc(t.name)}</div><p class="mono text-faint mt-8">${esc(subs)}</p>`
    + (t.bio ? `<p class="text-soft mt-16">${esc(t.bio)}</p>` : '') + `</div></div>`;
}

/* ---------- Doubt details page (student view + follow-ups) ---------- */
function initDoubtDetails() {
  const box = document.querySelector('#doubt-detail');
  if (!box) return;
  const id = new URLSearchParams(location.search).get('id');
  const d = getDoubts().find((x) => String(x.id) === String(id));
  if (!d) {
    box.innerHTML = `<div class="empty-state"><span class="eyebrow">Not found</span><h2>This doubt does not exist.</h2><p class="text-soft">It may have been deleted.</p><a href="student-dashboard.html" class="btn btn-secondary mt-24">Back to dashboard</a></div>`;
    return;
  }
  const ts = getTState();
  const replies = (ts.replies[d.id] || []).concat(ts.replies['s' + d.id] || []);
  const status = doubtStatus(d);
  const thread = replies.length
    ? replies.map((r) => `<div class="msg ${r.by === 'teacher' ? 'msg-teacher' : ''}" style="border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px;background:${r.by === 'teacher' ? 'var(--paper)' : 'var(--bg)'};"><div class="msg-meta mono text-faint" style="font-size:11px;margin-bottom:8px;">${esc(r.name)} · ${esc(fmtDate(r.at))}</div><div style="font-size:14.5px;line-height:1.65;">${esc(r.text)}</div>${(r.images || []).map((im) => `<img src="${im.src}" alt="" style="max-width:100%;border:1px solid var(--line);border-radius:var(--radius);margin-top:10px;" />`).join('')}</div>`).join('')
    : '<p class="text-faint">No replies yet — your teacher has been notified.</p>';
  box.innerHTML = `
    <p><a href="student-dashboard.html" class="mono text-faint" style="font-size:12.5px;">← Back to dashboard</a></p>
    <span class="eyebrow">${esc(d.subject)} · ${esc(teacherName(d.teacher))}</span>
    <h1 style="font-size:32px;margin-top:10px;">${esc(d.title)}</h1>
    <p class="mono text-faint mt-8" style="font-size:12px;">${esc(fmtDate(d.created))} · ${(STATUS_LABEL[status] || status)}</p>
    <p class="mt-16" style="font-size:15.5px;line-height:1.75;">${esc(d.desc)}</p>
    ${d.image ? `<img src="${d.image}" alt="Doubt attachment" style="max-width:100%;border:1px solid var(--line);border-radius:var(--radius);margin-top:14px;" />` : ''}
    <h2 style="font-size:22px;margin:32px 0 14px;">Discussion</h2>
    <div style="display:flex;flex-direction:column;gap:12px;">${thread}</div>
    <h2 style="font-size:22px;margin:32px 0 14px;">Add a follow-up</h2>
    <form id="followup-form"><div class="field"><label for="followup-text">Your message</label><textarea id="followup-text" placeholder="Share what you tried since asking…" required></textarea></div><button class="btn btn-primary" type="submit">Send follow-up</button></form>`;
  document.querySelector('#followup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const ta = document.querySelector('#followup-text');
    if (!ta.value.trim()) { toast('Write your follow-up first.', true); return; }
    const key = 'sdf-teacher-v1';
    const cur = getTState();
    cur.replies = cur.replies || {};
    const rid = 's' + d.id;
    cur.replies[rid] = cur.replies[rid] || [];
    cur.replies[rid].push({ by: 'student', name: 'Student', text: ta.value.trim(), images: [], at: new Date().toISOString() });
    try { localStorage.setItem(key, JSON.stringify(cur)); } catch (_) {}
    if (USE_API) push('/api/replies', { doubt_key: rid, by: 'student', name: 'Student', text: ta.value.trim(), images: [] });
    toast('Follow-up sent to your teacher.');
    setTimeout(() => location.reload(), 600);
  });
}
