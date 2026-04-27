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

// ── 모바일 채팅 풀스크린 잠금 ─────────────────
let _chatLocked = false;
let _savedScrollY = 0;

function lockChat() {
  if (_chatLocked) return;
  _chatLocked = true;
  _savedScrollY = window.scrollY;
  document.body.classList.add('chat-overlay-active');
  const section = document.querySelector('.chat-embed-section');
  if (section) section.classList.add('chat-locked');
}

window.unlockChat = function () {
  if (!_chatLocked) return;
  _chatLocked = false;
  document.body.classList.remove('chat-overlay-active');
  const section = document.querySelector('.chat-embed-section');
  if (section) section.classList.remove('chat-locked');
  window.scrollTo({ top: _savedScrollY, behavior: 'instant' });
};

// postMessage from iframe (chat input focused)
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'lumane_focus') lockChat();
});

// 스와이프 다운으로 채팅 닫기
document.addEventListener('DOMContentLoaded', () => {
  const handle = document.getElementById('chatDragHandle');
  if (!handle) return;
  let _touchStartY = 0;
  handle.addEventListener('touchstart', (e) => {
    _touchStartY = e.touches[0].clientY;
  }, { passive: true });
  handle.addEventListener('touchend', (e) => {
    const diff = e.changedTouches[0].clientY - _touchStartY;
    if (diff > 60) unlockChat();
  }, { passive: true });
});
