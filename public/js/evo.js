/* EvoConnect — Client-side JS */

(function() {
  'use strict';

  // ── Hamburger nav ──────────────────────────────────────────────
  const hamburger = document.querySelector('.hamburger');
  const mainNav   = document.getElementById('main-nav');
  if (hamburger && mainNav) {
    hamburger.addEventListener('click', () => {
      const open = mainNav.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', String(open));
    });
    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!hamburger.contains(e.target) && !mainNav.contains(e.target)) {
        mainNav.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      }
    });
    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mainNav.classList.contains('open')) {
        mainNav.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.focus();
      }
    });
  }

  // ── Flash dismiss ──────────────────────────────────────────────
  document.querySelectorAll('.flash-close').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.flash')?.remove();
    });
  });
  // Auto-dismiss success flashes after 5s
  document.querySelectorAll('.flash-success').forEach(el => {
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; setTimeout(() => el.remove(), 400); }, 5000);
  });

  // ── Multi-step form ────────────────────────────────────────────
  const stepForm = document.querySelector('[data-multi-step]');
  if (stepForm) {
    const steps   = Array.from(stepForm.querySelectorAll('.form-step'));
    const circles = Array.from(document.querySelectorAll('.step-circle'));
    let current = 0;

    function showStep(n) {
      steps.forEach((s, i) => {
        s.classList.toggle('active', i === n);
        s.setAttribute('aria-hidden', String(i !== n));
      });
      circles.forEach((c, i) => {
        c.closest('.step')?.classList.toggle('active', i === n);
        c.closest('.step')?.classList.toggle('complete', i < n);
      });
      current = n;
    }
    showStep(0);

    stepForm.querySelectorAll('[data-next]').forEach(btn => {
      btn.addEventListener('click', () => {
        const step = steps[current];
        const inputs = Array.from(step.querySelectorAll('[required]'));
        let valid = true;
        inputs.forEach(inp => {
          if (!inp.value.trim()) {
            inp.classList.add('error');
            inp.setAttribute('aria-invalid', 'true');
            const errEl = document.getElementById(inp.id + '-error');
            if (errEl) errEl.textContent = 'This field is required.';
            valid = false;
          } else {
            inp.classList.remove('error');
            inp.setAttribute('aria-invalid', 'false');
            const errEl = document.getElementById(inp.id + '-error');
            if (errEl) errEl.textContent = '';
          }
        });
        if (valid && current < steps.length - 1) showStep(current + 1);
      });
    });
    stepForm.querySelectorAll('[data-prev]').forEach(btn => {
      btn.addEventListener('click', () => { if (current > 0) showStep(current - 1); });
    });
  }

  // ── Tags / Skills input ────────────────────────────────────────
  document.querySelectorAll('[data-tag-input]').forEach(wrapper => {
    const input  = wrapper.querySelector('.tag-input');
    const hidden = wrapper.querySelector('[data-tags-value]');
    let tags = [];

    try { tags = JSON.parse(hidden.value || '[]'); } catch {}
    renderTags();

    function renderTags() {
      wrapper.querySelectorAll('.tag').forEach(t => t.remove());
      tags.forEach((tag, i) => {
        const el = document.createElement('span');
        el.className = 'tag';
        el.innerHTML = `${tag} <button type="button" class="tag-remove" aria-label="Remove ${tag}">×</button>`;
        el.querySelector('.tag-remove').addEventListener('click', () => {
          tags.splice(i, 1);
          hidden.value = JSON.stringify(tags);
          renderTags();
        });
        wrapper.insertBefore(el, input);
      });
      hidden.value = JSON.stringify(tags);
    }

    function addTag(val) {
      const v = val.trim();
      if (v && !tags.includes(v) && tags.length < 20) {
        tags.push(v);
        renderTags();
      }
    }

    input.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
        e.preventDefault();
        addTag(input.value);
        input.value = '';
      } else if (e.key === 'Backspace' && !input.value && tags.length) {
        tags.pop();
        renderTags();
      }
    });
    input.addEventListener('blur', () => {
      if (input.value.trim()) { addTag(input.value); input.value = ''; }
    });
    wrapper.addEventListener('click', () => input.focus());
  });

  // ── NAICS multi-select ─────────────────────────────────────────
  document.querySelectorAll('[data-naics-select]').forEach(wrapper => {
    const searchInput = wrapper.querySelector('[data-naics-search]');
    const dropdown    = wrapper.querySelector('.naics-dropdown');
    const hidden      = wrapper.querySelector('[data-naics-value]');
    const tagsDiv     = wrapper.querySelector('[data-naics-tags]');
    let selected = [];
    const maxSelect = parseInt(wrapper.dataset.naicsMax || '10', 10);

    // All options loaded from data attribute
    let allOptions = [];
    try { allOptions = JSON.parse(wrapper.dataset.naicsOptions || '[]'); } catch {}

    function renderSelected() {
      tagsDiv.innerHTML = '';
      selected.forEach((code, i) => {
        const opt = allOptions.find(o => o.code === code) || { code, description: code };
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.innerHTML = `<span class="naics-code">${opt.code}</span> ${opt.description.slice(0, 40)} <button type="button" class="tag-remove" aria-label="Remove ${opt.code}">×</button>`;
        tag.querySelector('.tag-remove').addEventListener('click', () => {
          selected.splice(i, 1);
          renderSelected();
          renderDropdown(searchInput.value);
        });
        tagsDiv.appendChild(tag);
      });
      hidden.value = JSON.stringify(selected);
    }

    function renderDropdown(query) {
      const filtered = allOptions.filter(o =>
        (o.code.includes(query) || o.description.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, 40);
      dropdown.innerHTML = '';
      filtered.forEach(o => {
        const el = document.createElement('div');
        el.className = 'naics-option' + (selected.includes(o.code) ? ' selected' : '');
        el.innerHTML = `<span class="naics-code">${o.code}</span><span>${o.description}</span>`;
        el.addEventListener('mousedown', (e) => {
          e.preventDefault();
          if (selected.includes(o.code)) {
            selected = selected.filter(c => c !== o.code);
          } else if (selected.length < maxSelect) {
            selected.push(o.code);
          }
          renderSelected();
          renderDropdown(searchInput.value);
        });
        dropdown.appendChild(el);
      });
      dropdown.classList.toggle('open', filtered.length > 0 && searchInput === document.activeElement);
    }

    searchInput.addEventListener('input', () => renderDropdown(searchInput.value));
    searchInput.addEventListener('focus', () => renderDropdown(searchInput.value));
    searchInput.addEventListener('blur',  () => setTimeout(() => dropdown.classList.remove('open'), 150));
  });

  // ── Checklist tabs ─────────────────────────────────────────────
  document.querySelectorAll('.checklist-tabs').forEach(tabs => {
    tabs.querySelectorAll('.checklist-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const track = tab.dataset.track;
        tabs.querySelectorAll('.checklist-tab').forEach(t => t.classList.toggle('active', t === tab));
        const container = tabs.closest('[data-checklist]') || document;
        container.querySelectorAll('.checklist-panel').forEach(p => p.classList.toggle('active', p.dataset.track === track));
      });
    });
  });

  // ── Checklist item checkbox AJAX save ──────────────────────────
  document.querySelectorAll('[data-checklist-item]').forEach(item => {
    const cb = item.querySelector('input[type="checkbox"]');
    if (!cb) return;
    cb.addEventListener('change', async () => {
      const track    = item.dataset.track;
      const itemKey  = item.dataset.key;
      const basePath = item.dataset.base || '/labor'; // /labor or /business
      item.classList.toggle('checked', cb.checked);
      try {
        const res = await fetch(`${basePath}/checklist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ track, item_key: itemKey, completed: cb.checked ? 1 : 0 })
        });
        const data = await res.json();
        if (data.pct !== undefined) {
          const bar = document.querySelector(`[data-progress-bar="${track}"]`);
          const label = document.querySelector(`[data-progress-label="${track}"]`);
          if (bar) bar.style.width = data.pct + '%';
          if (label) label.textContent = data.pct + '%';
        }
      } catch (err) {
        console.error('Checklist save error:', err);
        cb.checked = !cb.checked;
        item.classList.toggle('checked', cb.checked);
      }
    });
  });

  // ── Connection request buttons ─────────────────────────────────
  document.querySelectorAll('[data-connection-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id     = btn.dataset.id;
      const action = btn.dataset.connectionAction;
      const basePath = btn.dataset.base || '/labor';
      btn.disabled = true;
      try {
        const res = await fetch(`${basePath}/connections/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ action })
        });
        const data = await res.json();
        if (data.success) {
          const card = btn.closest('.connection-card');
          card.innerHTML = `<p class="text-muted text-sm">${action === 'accept' ? '✅ Connection accepted.' : '❌ Connection declined.'}</p>`;
        }
      } catch {
        btn.disabled = false;
      }
    });
  });

  // ── Prime: Request contact ─────────────────────────────────────
  const contactModal = document.getElementById('contact-modal');
  if (contactModal) {
    document.querySelectorAll('[data-request-contact]').forEach(btn => {
      btn.addEventListener('click', () => {
        contactModal.dataset.targetType = btn.dataset.targetType;
        contactModal.dataset.targetId   = btn.dataset.targetId;
        contactModal.classList.remove('hidden');
        contactModal.querySelector('textarea')?.focus();
      });
    });
    contactModal.querySelector('[data-modal-close]')?.addEventListener('click', () => contactModal.classList.add('hidden'));
    contactModal.querySelector('[data-modal-submit]')?.addEventListener('click', async () => {
      const message    = contactModal.querySelector('textarea')?.value || '';
      const targetType = contactModal.dataset.targetType;
      const targetId   = contactModal.dataset.targetId;
      try {
        const res = await fetch('/prime/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ target_type: targetType, target_id: targetId, message })
        });
        const data = await res.json();
        if (data.success) {
          contactModal.classList.add('hidden');
          const btn2 = document.querySelector(`[data-request-contact][data-target-id="${targetId}"]`);
          if (btn2) { btn2.textContent = 'Request Sent'; btn2.disabled = true; }
          showFlash('success', 'Connection request sent!');
        } else {
          showFlash('error', data.error || 'Could not send request.');
        }
      } catch {
        showFlash('error', 'Network error. Please try again.');
      }
    });
  }

  // ── Inline flash helper ────────────────────────────────────────
  function showFlash(type, message) {
    const existing = document.querySelector('.flash-dynamic');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = `flash flash-${type} flash-dynamic`;
    el.setAttribute('role', 'alert');
    el.innerHTML = `${message} <button class="flash-close" aria-label="Dismiss">×</button>`;
    el.querySelector('.flash-close').addEventListener('click', () => el.remove());
    const main = document.getElementById('main') || document.body;
    main.prepend(el);
    if (type === 'success') setTimeout(() => el.remove(), 4000);
  }

  // ── Password match validation ──────────────────────────────────
  const confirmPwd = document.getElementById('confirm_password');
  const pwd        = document.getElementById('password');
  if (confirmPwd && pwd) {
    function checkMatch() {
      const err = document.getElementById('confirm_password-error');
      if (confirmPwd.value && confirmPwd.value !== pwd.value) {
        confirmPwd.classList.add('error');
        if (err) err.textContent = 'Passwords do not match.';
      } else {
        confirmPwd.classList.remove('error');
        if (err) err.textContent = '';
      }
    }
    confirmPwd.addEventListener('input', checkMatch);
    pwd.addEventListener('input', checkMatch);
  }

  // ── Capability statement print ─────────────────────────────────
  const printBtn = document.getElementById('print-cap-statement');
  if (printBtn) printBtn.addEventListener('click', () => window.print());

  // ── Subscription tier cards ────────────────────────────────────
  document.querySelectorAll('.tier-card').forEach(card => {
    const radio = card.querySelector('input[type="radio"]');
    if (!radio) return;
    card.addEventListener('click', () => radio.checked = true);
    if (radio.checked) card.classList.add('selected');
    radio.addEventListener('change', () => {
      document.querySelectorAll('.tier-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });

  // ── Admin: confirm destructive actions ────────────────────────
  document.querySelectorAll('[data-confirm]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (!confirm(btn.dataset.confirm)) e.preventDefault();
    });
  });

  // ── Password visibility toggle ─────────────────────────────────
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.parentNode.querySelector('input');
      if (input) {
        const isPwd = input.type === 'password';
        input.type = isPwd ? 'text' : 'password';
        btn.innerHTML = isPwd ? '&#128064;' : '&#128065;'; // 👀 or 👁
      }
    });
  });

})();
