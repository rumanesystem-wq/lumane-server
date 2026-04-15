/* ================================================================
   UI 조작 — 메시지 렌더링, 타이핑 인디케이터, 퀵버튼, 배너, 로딩
================================================================ */
import { esc, nowStr } from './utils.js';

/* ── 이모티콘 목록 ── */
const EMOJIS = ['😊','😄','🥰','😅','🤔','😂','🙏','👍','💜','✨','❤️','🎉','👋','😍','😢','🙌','💪','🤩'];

/* ── DOM 참조 (DOMContentLoaded 이후에 초기화) ── */
let $msgs, $inp, $sendBtn, $quickArea, $banner, $statusTxt;
let isLoading = false;

export function initUI() {
  $msgs      = document.getElementById('messages');
  $inp       = document.getElementById('inp');
  $sendBtn   = document.getElementById('sendBtn');
  $quickArea = document.getElementById('quickArea');
  $banner    = document.getElementById('banner');
  $statusTxt = document.getElementById('statusText');
  initEmojiPicker();
  initAttachBtn();
}

/* ── 로딩 상태 ── */
export function getIsLoading() { return isLoading; }

export function setLoading(val) {
  isLoading = val;
  $inp.disabled = val;
  $sendBtn.disabled = val || !$inp.value.trim();
  if (val) showTyping(); else hideTyping();
}

/* ── 입력창 자동 높이 조정 ── */
export function autoResize() {
  $inp.style.height = 'auto';
  $inp.style.height = Math.min($inp.scrollHeight, 120) + 'px';
}

export function getInputValue() { return $inp.value.trim(); }
export function clearInput() { $inp.value = ''; autoResize(); }

/* ── 이벤트 리스너 등록 ── */
export function initInputListeners(onSend) {
  $inp.addEventListener('input', () => {
    autoResize();
    $sendBtn.disabled = isLoading || !$inp.value.trim();
  });
  $inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
  });
  $sendBtn.addEventListener('click', onSend);
}

/* ── 스크롤 ── */
export function scrollBottom() { $msgs.scrollTop = $msgs.scrollHeight; }

/* ================================================================
   복사 기능 — 길게 누르기(모바일) / 우클릭(PC)
================================================================ */
function showCopyToast(msg = '복사되었습니다') {
  const existing = document.querySelector('.copy-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'copy-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 1600);
}

function copyText(text) {
  const plain = text.replace(/<br\s*\/?>/gi, '\n').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(plain).then(() => showCopyToast()).catch(() => fallbackCopy(plain));
  } else {
    fallbackCopy(plain);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showCopyToast();
}

function addContextMenu(el, rawText) {
  let pressTimer;

  /* 모바일: 600ms 길게 누르기 → 복사 */
  el.addEventListener('touchstart', () => {
    pressTimer = setTimeout(() => copyText(rawText), 600);
  }, { passive: true });
  el.addEventListener('touchend',  () => clearTimeout(pressTimer), { passive: true });
  el.addEventListener('touchmove', () => clearTimeout(pressTimer), { passive: true });

  /* 데스크탑: 우클릭 → 복사 */
  el.addEventListener('contextmenu', e => {
    e.preventDefault();
    copyText(rawText);
  });
}

/* ================================================================
   메시지 렌더링
================================================================ */
export function addMsg(role, text) {
  const clean = text.replace(/```json[\s\S]*?```/g, '').trim();

  if (role === 'bot') {
    /* 루마네가 읽었으므로 이전 읽음 "1" 모두 제거 */
    $msgs.querySelectorAll('.read-receipt').forEach(el => el.remove());

    /* 문단 기준으로 말풍선 분리 */
    const parts = clean.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

    const group = document.createElement('div');
    group.className = 'msg-group bot';

    /* 아바타 */
    const av = document.createElement('div');
    av.className = 'av';
    av.textContent = '👩‍💼';
    group.appendChild(av);

    /* 본문 */
    const body = document.createElement('div');
    body.className = 'msg-body';

    /* 발신자 이름 */
    const sender = document.createElement('div');
    sender.className = 'msg-sender';
    sender.textContent = '루마네';
    body.appendChild(sender);

    /* 말풍선 행 */
    const bubblesRow = document.createElement('div');
    bubblesRow.className = 'msg-bubbles-row';

    const bubblesCol = document.createElement('div');
    bubblesCol.className = 'msg-bubbles';

    for (const part of parts) {
      const b = document.createElement('div');
      b.className = 'bubble bot';
      b.innerHTML = esc(part);
      bubblesCol.appendChild(b);
    }

    /* 메타 (시간) */
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    const timeEl = document.createElement('span');
    timeEl.className = 'msg-time';
    timeEl.textContent = nowStr();
    meta.appendChild(timeEl);

    bubblesRow.appendChild(bubblesCol);
    bubblesRow.appendChild(meta);
    body.appendChild(bubblesRow);
    group.appendChild(body);

    $msgs.appendChild(group);
    addContextMenu(group, clean);

  } else {
    /* 내 메시지 */
    const group = document.createElement('div');
    group.className = 'msg-group user';

    const bubblesRow = document.createElement('div');
    bubblesRow.className = 'msg-bubbles-row';

    /* 메타: 읽음 "1" + 시간 (말풍선 왼쪽) */
    const meta = document.createElement('div');
    meta.className = 'msg-meta';

    const receipt = document.createElement('span');
    receipt.className = 'read-receipt';
    receipt.textContent = '1';
    meta.appendChild(receipt);

    const timeEl = document.createElement('span');
    timeEl.className = 'msg-time';
    timeEl.textContent = nowStr();
    meta.appendChild(timeEl);

    const bubblesCol = document.createElement('div');
    bubblesCol.className = 'msg-bubbles';

    const b = document.createElement('div');
    b.className = 'bubble user';
    b.innerHTML = esc(clean);
    bubblesCol.appendChild(b);

    bubblesRow.appendChild(meta);
    bubblesRow.appendChild(bubblesCol);
    group.appendChild(bubblesRow);

    $msgs.appendChild(group);
    addContextMenu(group, clean);
  }

  scrollBottom();
}

/* ── 예시 이미지 메시지 ── */
export function addImageMsg(imgUrl, label) {
  const group = document.createElement('div');
  group.className = 'msg-group bot';

  const av = document.createElement('div');
  av.className = 'av';
  av.textContent = '👩‍💼';
  group.appendChild(av);

  const body = document.createElement('div');
  body.className = 'msg-body';

  const sender = document.createElement('div');
  sender.className = 'msg-sender';
  sender.textContent = '루마네';
  body.appendChild(sender);

  const bubblesRow = document.createElement('div');
  bubblesRow.className = 'msg-bubbles-row';

  const bubblesCol = document.createElement('div');
  bubblesCol.className = 'msg-bubbles';

  const img = document.createElement('img');
  img.src = imgUrl;
  img.className = 'img-example';
  img.alt = label || '드레스룸 예시 이미지';
  img.onclick = () => window.open(imgUrl, '_blank', 'noopener,noreferrer');
  img.onerror = () => { group.remove(); };
  bubblesCol.appendChild(img);

  if (label) {
    const lbl = document.createElement('div');
    lbl.className = 'img-example-label';
    lbl.textContent = label;
    bubblesCol.appendChild(lbl);
  }

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  const timeEl = document.createElement('span');
  timeEl.className = 'msg-time';
  timeEl.textContent = nowStr();
  meta.appendChild(timeEl);

  bubblesRow.appendChild(bubblesCol);
  bubblesRow.appendChild(meta);
  body.appendChild(bubblesRow);
  group.appendChild(body);

  $msgs.appendChild(group);
  scrollBottom();
}

/* ── 타이핑 인디케이터 ── */
export function showTyping() {
  if (document.getElementById('typing')) return;
  const el = document.createElement('div');
  el.className = 'typing';
  el.id = 'typing';
  el.innerHTML =
    `<div class="av">👩‍💼</div>` +
    `<div class="typing-body">` +
      `<div class="typing-name">루마네</div>` +
      `<div class="typing-bubble">` +
        `<div class="td"></div><div class="td"></div><div class="td"></div>` +
      `</div>` +
    `</div>`;
  $msgs.appendChild(el);
  scrollBottom();
}

export function hideTyping() {
  document.getElementById('typing')?.remove();
}

/* ── 퀵 버튼 ── */
export function setQuick(labels, isChoice = false) {
  $quickArea.innerHTML = '';
  if (!labels || labels.length === 0) return;

  const hint = document.createElement('div');
  hint.className = 'quick-hint-label';
  hint.textContent = isChoice
    ? '아래 버튼을 눌러 선택해 주세요'
    : '💡 예시 — 직접 입력해도 됩니다';
  $quickArea.appendChild(hint);

  const wrap = document.createElement('div');
  wrap.className = 'quick-btns';

  labels.forEach(label => {
    const b = document.createElement('button');
    b.className = isChoice ? 'qbtn choice' : 'qbtn';
    b.textContent = label;
    b.onclick = () => {
      $inp.value = label;
      $sendBtn.click();
    };
    wrap.appendChild(b);
  });

  $quickArea.appendChild(wrap);
}

/* ── AI 응답에서 퀵 버튼 자동 감지 ── */
export function updateQuickFromText(text) {
  if (/(드레스룸\s*형태|형태.*어떻게|1자형|ㄱ자형|ㄷ자형|11자형)/.test(text)) {
    setQuick(['1자형', 'ㄱ자형', 'ㄷ자형', '11자형'], true); return;
  }
  if (/(개인정보\s*수집|동의해\s*주시겠어요)/.test(text)) {
    setQuick(['동의합니다', '동의하지 않습니다'], true); return;
  }
  if (/(맞으신가요|확인해\s*주시면\s*접수)/.test(text)) {
    setQuick(['네, 맞아요! 접수해주세요', '수정할 내용이 있어요'], true); return;
  }
  setQuick([]);
}

/* ── 서버 상태 배너 ── */
export function setBanner(type, msg = '') {
  $banner.className = 'banner' + (type ? ' ' + type : '');
  $banner.textContent = msg;
}

/* ── 헤더 상태 텍스트 ── */
export function setStatusText(text) {
  $statusTxt.textContent = text;
  const $pcStatus = document.getElementById('pcStatusText');
  if ($pcStatus) $pcStatus.textContent = text;
}

/* ── 날짜 구분선 초기화 ── */
export function initDateSep(text) {
  const el = document.getElementById('dateSep');
  if (el) el.textContent = text;
}

/* ── 새 날짜 구분선 삽입 ── */
export function appendDateSep(text) {
  const sep = document.createElement('div');
  sep.className = 'date-sep';
  sep.textContent = text;
  $msgs.appendChild(sep);
}

/* ── 메시지 목록 초기화 ── */
export function clearMessages() {
  $msgs.innerHTML = '';
}

/* ================================================================
   이모티콘 피커
================================================================ */
function initEmojiPicker() {
  const picker = document.getElementById('emojiPicker');
  const btn    = document.getElementById('emojiBtn');
  if (!picker || !btn) return;

  /* 이모티콘 버튼 생성 */
  EMOJIS.forEach(emoji => {
    const item = document.createElement('button');
    item.className = 'emoji-item';
    item.textContent = emoji;
    item.addEventListener('click', () => {
      const pos = $inp.selectionStart ?? $inp.value.length;
      const val = $inp.value;
      $inp.value = val.slice(0, pos) + emoji + val.slice(pos);
      $inp.selectionStart = $inp.selectionEnd = pos + emoji.length;
      $inp.dispatchEvent(new Event('input'));
      $inp.focus();
      picker.classList.remove('open');
    });
    picker.appendChild(item);
  });

  btn.addEventListener('click', e => {
    e.stopPropagation();
    picker.classList.toggle('open');
  });

  document.addEventListener('click', () => picker.classList.remove('open'));
}

/* ── 파일 첨부 버튼 (준비 중 안내) ── */
function initAttachBtn() {
  const btn = document.getElementById('attachBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    showCopyToast('파일 첨부는 준비 중입니다 😊');
  });
}
