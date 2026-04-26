// Golf Analytics - Animations & UX
(function () {
  'use strict';

  /* ── Reduced motion ── */
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Intersection Observer: fade-in-up for cards ── */
  const observeEls = () => {
    if (reduced) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('anim-visible');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );
    document.querySelectorAll(
      '.stat-card, .chart-card, .quick-link-card, .drill-card, .session-item, .insights-section, .drills-section, .score-history-section, .global-filter-bar'
    ).forEach((el, i) => {
      if (el.classList.contains('anim-visible')) return; // already animated
      el.style.setProperty('--anim-delay', `${i * 60}ms`);
      io.observe(el);
    });
  };

  /* ── Counter animation ── */
  const animateCounter = (el, target, suffix = '', duration = 800) => {
    if (reduced) { el.textContent = target + suffix; return; }
    const start = performance.now();
    const startVal = 0;
    const update = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (target - startVal) * eased);
      el.textContent = current + suffix;
      if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  };

  /* patch app.js stat setters to animate */
  const patchStats = () => {
    const totalEl = document.getElementById('totalShots');
    const avgEl   = document.getElementById('avgCarry');
    const bestEl  = document.getElementById('bestShot');
    const conEl   = document.getElementById('consistency');
    if (!totalEl) return;

    // Watch for textContent changes via MutationObserver
    const watchEl = (el, parser, suffix) => {
      if (!el) return;
      const mo = new MutationObserver(() => {
        const raw = el.textContent.replace(/[^\d.]/g, '');
        const val = parseFloat(raw);
        if (!isNaN(val)) {
          mo.disconnect();
          animateCounter(el, val, suffix);
          // reconnect after anim
          setTimeout(() => mo.observe(el, { childList: true, characterData: true, subtree: true }), 900);
        }
      });
      mo.observe(el, { childList: true, characterData: true, subtree: true });
    };

    watchEl(totalEl, parseFloat, '');
    watchEl(avgEl,   parseFloat, ' yds');
    watchEl(bestEl,  parseFloat, ' yds');
    watchEl(conEl,   parseFloat, '%');
  };

  /* ── Ripple effect on buttons ── */
  const addRipple = (el) => {
    el.addEventListener('pointerdown', (e) => {
      if (reduced) return;
      const rect = el.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2;
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top  - size / 2;
      const ripple = document.createElement('span');
      ripple.className = 'ripple-wave';
      ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px`;
      el.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  };

  const attachRipples = () => {
    document.querySelectorAll('.upload-button, .primary-button, .new-session-btn, .nav-link, .club-pill').forEach(addRipple);
  };

  /* ── Session panel: swipe-to-close on mobile ── */
  const swipePanel = () => {
    const panel = document.getElementById('sessionsPanel');
    const toggle = document.getElementById('sessionsToggle');
    if (!panel) return;
    let startX = 0, dragging = false;
    panel.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      dragging = true;
    }, { passive: true });
    panel.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      const dx = e.touches[0].clientX - startX;
      if (dx > 0) panel.style.transform = `translateX(${dx}px)`;
    }, { passive: true });
    panel.addEventListener('touchend', (e) => {
      dragging = false;
      const dx = e.changedTouches[0].clientX - startX;
      panel.style.transform = '';
      if (dx > 80) {
        panel.classList.remove('open');
        if (toggle) toggle.style.display = '';
      }
    }, { passive: true });
  };

  /* ── Sessions overlay wiring ── */
  const wireOverlay = () => {
    const overlay = document.getElementById('sessionsOverlay');
    const panel = document.getElementById('sessionsPanel');
    if (!overlay || !panel) return;

    // Watch panel open/close and sync overlay
    const mo = new MutationObserver(() => {
      if (panel.classList.contains('open')) {
        overlay.classList.add('visible');
      } else {
        overlay.classList.remove('visible');
      }
    });
    mo.observe(panel, { attributes: true, attributeFilter: ['class'] });

    // Click overlay to close
    overlay.addEventListener('click', () => {
      panel.classList.remove('open');
    });
  };

  /* ── Nav active link: sliding pill indicator ── */
  const navPillIndicator = () => {
    // already handled by .active class - just ensure smooth transition
  };

  /* ── Stagger upload card pulse ── */
  const pulseUpload = () => {
    const card = document.querySelector('.upload-card');
    if (!card) return;
    card.classList.add('upload-idle');
  };

  /* ── Page entrance: container fade in ── */
  const pageEntrance = () => {
    if (reduced) return;
    const container = document.querySelector('.container');
    if (container) {
      container.classList.add('page-enter');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => container.classList.add('page-enter-active'));
      });
    }
  };

  /* ── Header parallax-lite on scroll (desktop only) ── */
  const headerParallax = () => {
    if (reduced || window.matchMedia('(max-width: 768px)').matches) return;
    const header = document.querySelector('header');
    if (!header) return;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      header.style.transform = y > 0 ? `translateY(${Math.min(y * 0.15, 12)}px)` : '';
    }, { passive: true });
  };

  /* ── Smooth scroll for anchor links ── */
  const smoothAnchor = () => {
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', (e) => {
        const target = document.querySelector(a.getAttribute('href'));
        if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
      });
    });
  };

  /* ── Touch feedback: scale on tap for interactive elements ── */
  const touchFeedback = () => {
    const isMobile = window.matchMedia('(hover: none)').matches;
    if (!isMobile) return;
    document.querySelectorAll('.session-item, .quick-link-card, .drill-card').forEach(el => {
      el.addEventListener('touchstart', () => el.classList.add('touch-active'), { passive: true });
      el.addEventListener('touchend', () => setTimeout(() => el.classList.remove('touch-active'), 150), { passive: true });
    });
  };

  /* ── Re-observe after dynamic content changes ── */
  window.reObserveAnimations = () => {
    observeEls();
    attachRipples();
    touchFeedback();
  };

  /* ── Init ── */
  const init = () => {
    pageEntrance();
    observeEls();
    patchStats();
    attachRipples();
    swipePanel();
    wireOverlay();
    headerParallax();
    smoothAnchor();
    touchFeedback();
    pulseUpload();

    // Re-observe session items when list updates
    const sessionsList = document.getElementById('sessionsList');
    if (sessionsList) {
      const listMo = new MutationObserver(() => {
        sessionsList.querySelectorAll('.session-item:not(.anim-visible)').forEach((el, i) => {
          el.style.setProperty('--anim-delay', `${i * 50}ms`);
          setTimeout(() => el.classList.add('anim-visible'), 20 + i * 50);
        });
      });
      listMo.observe(sessionsList, { childList: true });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
