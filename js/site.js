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

// ── 유입 경로 추적 → /chat 링크에 ?src= 자동 부착 ──────────
// (인스타 → 랜딩 → /chat 흐름에서 referrer 손실 방지)
(function trackEntrySource() {
  const SRC_KEY = '루마네_유입소스';

  // 1. referrer URL → src 라벨 매핑
  function detectSrcFromReferrer() {
    const ref = (document.referrer || '').toLowerCase();
    if (!ref) return 'direct';
    if (ref.includes('instagram.com'))               return 'instagram';
    if (ref.includes('facebook.com') || ref.includes('fb.com')) return 'facebook';
    if (ref.includes('google.'))                     return 'google';
    if (ref.includes('naver.com'))                   return 'naver';
    if (ref.includes('daum.net') || ref.includes('kakao')) return 'kakao';
    if (ref.includes('youtube.com'))                 return 'youtube';
    if (ref.includes('tiktok.com'))                  return 'tiktok';
    try {
      const host = new URL(document.referrer).hostname;
      // 같은 도메인 내부 이동은 'direct' 아닌 'internal' 처리
      if (host === location.hostname) return 'internal';
      return host.replace(/^www\./, '').slice(0, 50);
    } catch { return 'direct'; }
  }

  // 2. 우선순위: URL ?src= → localStorage 저장값 → referrer 추정
  // 영문·숫자·_·- 만 허용 (어드민 표시 시 XSS·이상 문자 방지)
  const sanitize = (v) => (v || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 50);
  const qs    = new URLSearchParams(location.search);
  const qSrc  = sanitize(qs.get('src'));
  const qSrc2 = sanitize(qs.get('src2'));

  let src = '', src2 = '';
  if (qSrc) {
    src = qSrc; src2 = qSrc2;
  } else {
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(SRC_KEY) || '{}'); } catch {}
    if (stored.src) {
      // internal 재방문은 덮어쓰지 않음 — 최초 외부 유입 유지
      src = stored.src; src2 = stored.src2 || '';
    } else {
      src = detectSrcFromReferrer();
      src2 = '';
    }
  }

  // 3. localStorage에 저장 (재방문·하위 페이지 이동 시 유지)
  if (src && src !== 'internal') {
    try { localStorage.setItem(SRC_KEY, JSON.stringify({ src, src2 })); } catch {}
  }

  // 4. 페이지의 모든 /chat 링크에 ?src=... 자동 부착
  function attachSrcToChatLinks() {
    if (!src || src === 'internal') return;  // internal 라벨은 어드민에 노출시키지 않음
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href') || '';
      // /chat 또는 /chat.html 또는 https://lumane-server.onrender.com/chat 형태
      if (!/(^|\/)chat(\.html)?(\?|$|#)|onrender\.com\/chat/.test(href)) return;
      try {
        const u = new URL(href, location.origin);
        if (!u.searchParams.has('src')) u.searchParams.set('src', src);
        if (src2 && !u.searchParams.has('src2')) u.searchParams.set('src2', src2);
        // 절대/상대 형태 보존
        a.setAttribute('href', href.startsWith('http') ? u.toString() : u.pathname + u.search + u.hash);
      } catch {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachSrcToChatLinks);
  } else {
    attachSrcToChatLinks();
  }
})();

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

