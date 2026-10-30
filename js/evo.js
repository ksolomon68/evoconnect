/* EVOConnected — Client-side JS & GSAP Executive Motion Engine */

(function() {
  'use strict';

  // ── Sticky Header Scroll State ─────────────────────────────────
  const siteHeader = document.querySelector('.site-header');
  if (siteHeader) {
    const onScroll = () => {
      siteHeader.classList.toggle('is-scrolled', window.scrollY > 18);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ── Mouse-Tracking Spotlight Glow on Cards ─────────────────────
  document.querySelectorAll('.spotlight-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });
  });

  // ── GSAP & ScrollTrigger Executive Animations ──────────────────
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefersReducedMotion && typeof window.gsap !== 'undefined') {
    const gsap = window.gsap;
    if (typeof window.ScrollTrigger !== 'undefined') {
      gsap.registerPlugin(window.ScrollTrigger);
    }

    // Helper: animate elements from -> to without CSS transition interference
    const revealElements = (targets, fromVars, toVars, timeline, position) => {
      const els = gsap.utils.toArray(targets);
      if (!els.length) return;
      els.forEach(el => el.setAttribute('data-gsap-busy', '1'));
      const finalTo = Object.assign({}, toVars, {
        y: 0,
        x: 0,
        scale: 1,
        opacity: 1,
        clearProps: 'transform,opacity',
        onComplete: () => {
          els.forEach(el => el.removeAttribute('data-gsap-busy'));
          if (typeof toVars.onComplete === 'function') toVars.onComplete();
        }
      });
      if (timeline) {
        timeline.fromTo(els, fromVars, finalTo, position);
      } else {
        gsap.fromTo(els, fromVars, finalTo);
      }
    };

    // 1. Hero Entrance Timeline
    const heroSection = document.querySelector('.wfc-hero');
    if (heroSection) {
      const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      const eyebrow = heroSection.querySelector('[data-gsap="hero-eyebrow"]');
      const title   = heroSection.querySelector('[data-gsap="hero-title"]');
      const lead    = heroSection.querySelector('[data-gsap="hero-lead"]');
      const cta     = heroSection.querySelector('[data-gsap="hero-cta"]');
      const stats   = heroSection.querySelector('[data-gsap="hero-stats"]');
      const consoleCard = heroSection.querySelector('[data-gsap="hero-console"]');
      const telemetryRows = heroSection.querySelectorAll('[data-gsap="telemetry-row"]');

      if (eyebrow) revealElements(eyebrow, { y: 18, opacity: 0 }, { duration: 0.55 }, heroTl);
      if (title)   revealElements(title,   { y: 26, opacity: 0 }, { duration: 0.7 }, heroTl, '-=0.35');
      if (lead)    revealElements(lead,    { y: 20, opacity: 0 }, { duration: 0.65 }, heroTl, '-=0.45');
      if (cta)     revealElements(cta,     { y: 18, opacity: 0 }, { duration: 0.55 }, heroTl, '-=0.4');
      if (stats && stats.children.length) {
        revealElements(Array.from(stats.children), { y: 14, opacity: 0 }, { duration: 0.5, stagger: 0.08 }, heroTl, '-=0.35');
      }
      if (consoleCard) {
        revealElements(consoleCard, { x: 32, y: 16, opacity: 0, scale: 0.97 }, { duration: 0.85 }, heroTl, '-=0.85');
      }
      if (telemetryRows.length) {
        revealElements(telemetryRows, { x: 18, opacity: 0 }, { duration: 0.5, stagger: 0.12 }, heroTl, '-=0.5');
      }
    }

    // 2. Live NAICS Telemetry — Category Rotation
    const telemetryCard = document.querySelector('.evo-telemetry-card');
    if (telemetryCard) {
      const sectorEl = telemetryCard.querySelector('[data-telemetry-sector]');
      const rowEls = Array.from(telemetryCard.querySelectorAll('[data-telemetry-row]'));

      const categories = [
        {
          sector: 'Energy & Infrastructure',
          rows: [
            { code: 'NAICS 237130', tag: 'BEAD PRIORITY', tagClass: 'tag-cyan', title: 'Power & Communication Line Construction', sub: 'Fiber Optic Splicing • Aerial & Underground Conduit', match: '99.4%' },
            { code: 'NAICS 238210', tag: 'SAM VERIFIED', tagClass: 'tag-emerald', title: 'Electrical & Low-Voltage Systems', sub: 'Commercial Grid • Cell Tower & Substation Techs', match: '98.1%' },
            { code: 'NAICS 238110', tag: 'HUB / DBE', tagClass: 'tag-amber', title: 'Structural Concrete & Civil Foundations', sub: 'DOT Highway Infrastructure • Municipal Public Works', match: '96.8%' }
          ]
        },
        {
          sector: 'IT & Cybersecurity',
          rows: [
            { code: 'NAICS 541512', tag: 'SDVOSB', tagClass: 'tag-cyan', title: 'Computer Systems Design Services', sub: 'Cloud Migration • Network Architecture & DevSecOps', match: '97.9%' },
            { code: 'NAICS 561621', tag: 'SAM VERIFIED', tagClass: 'tag-emerald', title: 'Security Systems Services', sub: 'Access Control • CCTV & Perimeter Monitoring', match: '96.3%' },
            { code: 'NAICS 541519', tag: '8(a)', tagClass: 'tag-amber', title: 'Other Computer Related Services', sub: 'Help Desk • Systems Integration & IT Support', match: '95.5%' }
          ]
        },
        {
          sector: 'Logistics & Transportation',
          rows: [
            { code: 'NAICS 484121', tag: 'SMALL BUSINESS', tagClass: 'tag-cyan', title: 'General Freight Trucking, Long-Distance', sub: 'Dry Van • Flatbed & Reefer Line-Haul', match: '98.6%' },
            { code: 'NAICS 493110', tag: 'SAM VERIFIED', tagClass: 'tag-emerald', title: 'General Warehousing & Storage', sub: 'Cross-Dock • Inventory & Fulfillment Ops', match: '97.2%' },
            { code: 'NAICS 488510', tag: 'WOSB', tagClass: 'tag-amber', title: 'Freight Transportation Arrangement', sub: 'Load Brokering • Carrier Compliance Management', match: '95.9%' }
          ]
        },
        {
          sector: 'Facilities & Grounds',
          rows: [
            { code: 'NAICS 561720', tag: 'HUB / DBE', tagClass: 'tag-cyan', title: 'Janitorial Services', sub: 'Federal Bldg Custodial • Sanitation Compliance', match: '98.9%' },
            { code: 'NAICS 561730', tag: 'SAM VERIFIED', tagClass: 'tag-emerald', title: 'Landscaping Services', sub: 'Grounds Maintenance • Snow & Debris Removal', match: '97.4%' },
            { code: 'NAICS 238220', tag: 'SDVOSB', tagClass: 'tag-amber', title: 'Plumbing, Heating & HVAC Contractors', sub: 'Mechanical Systems • Preventive Maintenance', match: '96.1%' }
          ]
        },
        {
          sector: 'Professional & Admin Services',
          rows: [
            { code: 'NAICS 541611', tag: '8(a)', tagClass: 'tag-cyan', title: 'Admin & General Management Consulting', sub: 'Process Improvement • Program Management Support', match: '97.7%' },
            { code: 'NAICS 541330', tag: 'SAM VERIFIED', tagClass: 'tag-emerald', title: 'Engineering Services', sub: 'Civil • Structural & Environmental Design', match: '96.9%' },
            { code: 'NAICS 561110', tag: 'WOSB', tagClass: 'tag-amber', title: 'Office Administrative Services', sub: 'Records Mgmt • Admin & Clerical Staffing', match: '95.3%' }
          ]
        }
      ];

      if (rowEls.length === 3 && categories.length) {
        let activeIndex = 0;
        let paused = false;
        const tagClasses = ['tag-cyan', 'tag-emerald', 'tag-amber'];

        const applyCategory = (category) => {
          if (sectorEl) sectorEl.textContent = category.sector;
          rowEls.forEach((row, i) => {
            const data = category.rows[i];
            if (!data) return;
            row.querySelector('[data-field="code"]').textContent = data.code;
            const tagEl = row.querySelector('[data-field="tag"]');
            tagEl.textContent = data.tag;
            tagEl.classList.remove(...tagClasses);
            tagEl.classList.add(data.tagClass);
            row.querySelector('[data-field="title"]').textContent = data.title;
            row.querySelector('[data-field="sub"]').textContent = data.sub;
            row.querySelector('[data-field="match"]').textContent = data.match;
          });
        };

        const rotate = () => {
          if (paused || document.hidden) return;
          activeIndex = (activeIndex + 1) % categories.length;
          const nextCategory = categories[activeIndex];
          rowEls.forEach(el => el.setAttribute('data-telemetry-busy', '1'));
          gsap.to(rowEls, {
            opacity: 0,
            y: -6,
            duration: 0.25,
            stagger: 0.05,
            ease: 'power1.in',
            onComplete: () => {
              applyCategory(nextCategory);
              gsap.fromTo(rowEls,
                { opacity: 0, y: 6 },
                {
                  opacity: 1,
                  y: 0,
                  duration: 0.35,
                  stagger: 0.07,
                  ease: 'power2.out',
                  onComplete: () => rowEls.forEach(el => el.removeAttribute('data-telemetry-busy'))
                }
              );
            }
          });
        };

        telemetryCard.addEventListener('mouseenter', () => { paused = true; });
        telemetryCard.addEventListener('mouseleave', () => { paused = false; });

        setInterval(rotate, 4500);
      }
    }

    // 3. Animated Stat Counters
    document.querySelectorAll('[data-count-to]').forEach(el => {
      const target = parseInt(el.getAttribute('data-count-to'), 10);
      const suffix = el.getAttribute('data-count-suffix') || '';
      if (isNaN(target)) return;
      const counter = { val: 0 };
      gsap.to(counter, {
        val: target,
        duration: 1.6,
        ease: 'power2.out',
        scrollTrigger: window.ScrollTrigger ? {
          trigger: el,
          start: 'top 90%',
          once: true
        } : undefined,
        onUpdate: () => {
          el.textContent = Math.round(counter.val) + suffix;
        }
      });
    });

    // 4. ScrollTrigger Section Headers & Staggered Card Grids
    if (typeof window.ScrollTrigger !== 'undefined') {
      gsap.utils.toArray('[data-gsap="section-header"]').forEach(header => {
        const children = Array.from(header.children);
        if (!children.length) return;
        window.ScrollTrigger.create({
          trigger: header,
          start: 'top 86%',
          once: true,
          onEnter: () => {
            revealElements(children, { y: 22, opacity: 0 }, { duration: 0.65, stagger: 0.09, ease: 'power3.out' });
          }
        });
      });

      const cardGroups = [
        { selector: '[data-gsap="pathway-card"]', stagger: 0.1,  y: 26 },
        { selector: '[data-gsap="hiw-step"]',     stagger: 0.09, y: 24 },
        { selector: '[data-gsap="trade-card"]',   stagger: 0.035, y: 18 },
        { selector: '[data-gsap="benefit-card"]', stagger: 0.09, y: 24 },
        { selector: '[data-gsap="cert-card"]',    stagger: 0.07, y: 22 },
        { selector: '[data-gsap="pricing-card"]', stagger: 0.1,  y: 26 },
        { selector: '[data-gsap="faq-item"]',     stagger: 0.05, y: 16 }
      ];

      cardGroups.forEach(group => {
        const allItems = gsap.utils.toArray(group.selector);
        if (!allItems.length) return;

        // Group items by their parent container so an entire section's cards animate uniformly from the same trigger
        const parentMap = new Map();
        allItems.forEach(item => {
          const parent = item.parentElement || document.body;
          if (!parentMap.has(parent)) parentMap.set(parent, []);
          parentMap.get(parent).push(item);
        });

        parentMap.forEach((cards, parentEl) => {
          window.ScrollTrigger.create({
            trigger: parentEl,
            start: 'top 88%',
            once: true,
            onEnter: () => {
              revealElements(
                cards,
                { y: group.y, opacity: 0 },
                { duration: 0.62, stagger: group.stagger, ease: 'power3.out', overwrite: true }
              );
            }
          });
        });
      });

      // Checklist & Banner Reveals
      ['[data-gsap="mandate-banner"]', '[data-gsap="checklist-left"]', '[data-gsap="checklist-right"]', '[data-gsap="cta-banner"]', '[data-gsap="auth-card"]'].forEach(sel => {
        gsap.utils.toArray(sel).forEach(el => {
          window.ScrollTrigger.create({
            trigger: el,
            start: 'top 88%',
            once: true,
            onEnter: () => {
              revealElements(el, { y: 24, opacity: 0 }, { duration: 0.7, ease: 'power3.out' });
            }
          });
        });
      });

      // Subtle Ambient Orb Parallax
      gsap.utils.toArray('.shape-1, .shape-2').forEach((orb, idx) => {
        gsap.to(orb, {
          yPercent: idx % 2 === 0 ? 18 : -18,
          ease: 'none',
          scrollTrigger: {
            trigger: orb.parentElement || document.body,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true
          }
        });
      });
    }
  }

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
          body: JSON.stringify({ action, _csrf: document.querySelector('meta[name=csrf-token]')?.content })
        });
        const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : {success:res.ok};
        if (data.success) {
          const card = btn.closest('.connection-card, .connection-item, .recommendation-item');
          if(card) card.innerHTML = `<p class="text-muted text-sm">${action === 'accept' ? '✓ Connection accepted.' : '× Connection declined.'}</p>`;
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
          body: JSON.stringify({ target_type: targetType, target_id: targetId, message, _csrf: document.querySelector('meta[name=csrf-token]')?.content })
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

  // ── Password show/hide toggle ────────────────────────────────────
  document.querySelectorAll('.toggle-password').forEach(btn => {
    const input = btn.closest('.input-with-toggle')?.querySelector('input') || btn.parentNode.querySelector('input');
    if (!input) return;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      const shown = input.type === 'text';
      input.type = shown ? 'password' : 'text';
      btn.setAttribute('aria-pressed', String(!shown));
      btn.setAttribute('aria-label', shown ? 'Show password' : 'Hide password');
      btn.innerHTML = shown ? '&#128065;' : '&#128064;';
    });
  });

  // ── Password match validation ──────────────────────────────────
  const confirmPwd = document.getElementById('confirm_password');
  const pwd        = document.getElementById('password');
  if (confirmPwd && pwd) {
    function checkMatch() {
      const err = document.getElementById('confirm_password-error') || document.getElementById('confirm-password-error');
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

})();
