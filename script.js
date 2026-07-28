// ============================================================
// Student Doubt Forum — shared frontend behaviors (UI-only demo)
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
  initModals();
  initDoubtSearch();
  initAskDoubtForm();
  initImageUpload();
  initFakeLoaders();
});

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

/* ---------- Doubt search / filter (frontend-only demo) ---------- */
function initDoubtSearch() {
  const input = document.querySelector('#doubt-search');
  const cards = document.querySelectorAll('[data-doubt-card]');
  if (!input || !cards.length) return;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    cards.forEach((card) => {
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(q) ? '' : 'none';
    });
  });

  const chips = document.querySelectorAll('[data-category-chip]');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      const cat = chip.dataset.categoryChip;
      cards.forEach((card) => {
        const show = cat === 'all' || card.dataset.subject === cat;
        card.style.display = show ? '' : 'none';
      });
    });
  });
}

/* ---------- Ask Doubt form (UI only — no submission) ---------- */
function initAskDoubtForm() {
  const form = document.querySelector('#ask-doubt-form');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const original = btn.innerHTML;
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
        alert('Doubt posted (UI demonstration only — no backend).');
      }
      form.reset();
      const preview = document.querySelector('#upload-preview');
      if (preview) preview.innerHTML = '';
    }, 900);
  });
}

/* ---------- Image upload preview (UI only) ---------- */
function initImageUpload() {
  const input = document.querySelector('#doubt-image-input');
  const box = document.querySelector('#upload-box');
  const preview = document.querySelector('#upload-preview');
  if (!input || !box) return;
  box.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    if (!input.files || !input.files[0] || !preview) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.innerHTML = `<img src="${e.target.result}" alt="Uploaded preview" style="max-height:160px;border-radius:3px;border:1px solid var(--line);margin-top:14px;" />
      <p class="mono text-faint mt-8" style="font-size:12px;">${file.name}</p>`;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------- Fake loading animation on page entry for card grids ---------- */
function initFakeLoaders() {
  document.querySelectorAll('[data-skeleton-target]').forEach((skeleton) => {
    const targetSel = skeleton.dataset.skeletonTarget;
    const target = document.querySelector(targetSel);
    if (!target) return;
    target.style.display = 'none';
    setTimeout(() => {
      skeleton.style.display = 'none';
      target.style.display = '';
    }, 500);
  });
}
