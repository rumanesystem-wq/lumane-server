/* ============================================
   케이트블랑 드레스룸 — 공통 사이트 JS (site.js)
   ============================================ */

// ── 헤더 스크롤 효과 ───────────────────────────
window.addEventListener('scroll', () => {
  const header = document.getElementById('site-header');
  if (header) header.classList.toggle('scrolled', window.scrollY > 10);
});

// ── 모바일 메뉴 ────────────────────────────────
function toggleMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  const btn  = document.getElementById('hamburger');
  const isOpen = menu.classList.contains('open');
  menu.classList.toggle('open', !isOpen);
  btn.classList.toggle('open', !isOpen);
}
function closeMobileMenu() {
  document.getElementById('mobile-menu').classList.remove('open');
  document.getElementById('hamburger').classList.remove('open');
}

// 메뉴 외부 클릭 시 닫기
document.addEventListener('click', (e) => {
  const menu = document.getElementById('mobile-menu');
  const btn  = document.getElementById('hamburger');
  if (menu && menu.classList.contains('open')) {
    if (!menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      closeMobileMenu();
    }
  }
});

// ── FAQ 아코디언 ───────────────────────────────
function toggleFaq(btn) {
  const answer = btn.nextElementSibling;
  const isOpen = btn.classList.contains('open');

  document.querySelectorAll('.faq-q').forEach(q => {
    q.classList.remove('open');
    if (q.nextElementSibling) q.nextElementSibling.classList.remove('open');
  });

  if (!isOpen) {
    btn.classList.add('open');
    answer.classList.add('open');
  }
}

// ── 현재 페이지 nav 활성화 ────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const path = location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav-link[data-page]').forEach(link => {
    link.classList.toggle('active', link.dataset.page === path);
  });
});

// ── 채팅 임베드 → 견적 폼 자동 채우기 ──────────
function setVal(id, val) {
  const el = document.getElementById(id);
  if (el && val) el.value = val;
}

window.addEventListener('message', (e) => {
  if (e.origin !== location.origin) return;
  const chatFrame = document.getElementById('chat-embed-frame');
  if (chatFrame && e.source !== chatFrame.contentWindow) return;
  if (!e.data || e.data.type !== 'lumane_fields') return;
  const f = e.data.fields || {};

  setVal('q-name',        f.name);
  setVal('q-phone',       f.phone);
  setVal('q-region',      f.region);
  setVal('q-width',       f.width);
  setVal('q-depth',       f.depth);
  setVal('q-height',      f.height);
  setVal('q-frame-color', f.frameColor);
  setVal('q-memo',        f.memo);

  if (f.shelfColor) {
    const sel = document.getElementById('q-shelf-color');
    if (sel) {
      const opt = [...sel.options].find(o => o.value === f.shelfColor);
      sel.value = opt ? f.shelfColor : '기타';
      if (!opt) setVal('q-shelf-color-custom', f.shelfColor);
      const wrap = document.getElementById('shelf-color-custom-wrap');
      if (wrap) wrap.style.display = sel.value === '기타' ? 'block' : 'none';
    }
  }

  if (Array.isArray(f.layout)) {
    document.querySelectorAll('input[name="layout_type"]').forEach(cb => {
      if (f.layout.includes(cb.value)) cb.checked = true;
    });
  }

  if (Array.isArray(f.options)) {
    document.querySelectorAll('input[name="options"]').forEach(cb => {
      if (f.options.includes(cb.value)) cb.checked = true;
    });
  }

  const section = document.getElementById('inline-quote');
  if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

