/* ================================================================
   메인 채팅 로직 — 진입점 (ES Module)
================================================================ */
import { SERVER, DEMO } from './config.js';

/* ── 세션 ID: localStorage에 저장하여 새로고침해도 유지 ── */
const SESSION_ID = (() => {
  const KEY = '루마네_세션ID';
  let id = localStorage.getItem(KEY);
  if (!id || !/^S-\d{13}-[a-z0-9]{5}$/.test(id)) {
    id = 'S-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    localStorage.setItem(KEY, id);
  }
  return id;
})();

/* ── 닉네임: localStorage에 저장 ── */
const NICKNAME_KEY = '루마네_닉네임';
let userNickname = localStorage.getItem(NICKNAME_KEY) || '';
import { todayStr } from './utils.js';
import {
  initUI, setLoading, getIsLoading,
  addMsg, addImageMsg, addFileMsg, initFileInput,
  uploadFilePending, getPendingFile,
  setMsgActionHandlers, allocMid,
  setQuick, updateQuickFromText,
  setBanner, setStatusText,
  initInputListeners, initDateSep, appendDateSep,
  clearMessages, clearInput,
  showAdminTyping, hideAdminTyping,
} from './ui.js';
import { getPendingReply, setPendingReply, clearPendingReply } from './reply.js';
import { getEditingMid, startEdit, cancelEdit, applyEditToDom, deleteFromDom } from './message-actions.js';
import { initSearch, toggleSearch, closeSearch } from './search.js';
import { toggleHistory, showTranscript, continueFromHistory, closeTranscript, setHistoryData } from './history.js';
import { toggleCollect, updateCollectDrawer, resetCollect } from './collect.js';
import { showConfirm, confirmBack, confirmSubmit } from './confirm.js';
import { autoSaveConversation, openQuote, closeQuote, printQuote } from './quote.js';

/* ── 대화 상태 ── */
let history        = [];
let demoIdx        = 0;
let pendingConfirm = false;
let serverOnline   = null;

/* ── 대화 내용 localStorage 저장/복원 ── */
const HISTORY_KEY = '루마네_히스토리';

function saveHistory() {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* 무시 */ }
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem('루마네_세션ID');
}

/* ── Admin 난입 상태 ── */
let adminMode      = false;   // true = admin이 현재 대화 중
let pollTimer      = null;    // 폴링 타이머

/* ================================================================
   서버 상태 확인
================================================================ */
async function checkServer() {
  try {
    const r = await fetch(`${SERVER}/api/health`, {
      signal: AbortSignal.timeout(8000),
    });
    serverOnline = r.ok;
  } catch {
    serverOnline = false;
  }

  if (serverOnline) {
    setStatusText('온라인');
    setBanner('ok', '✅ AI 루마네와 실제 연결되었습니다');
    setTimeout(() => setBanner(null), 2500);
  } else {
    setStatusText('데모 모드');
    setBanner('warn',
      '⚠️ 서버 미연결 — 데모 모드로 동작 중입니다. ' +
      'server 폴더에서 npm start 실행 후 새로고침하세요.');
  }
}

/* ================================================================
   백그라운드 서버 재확인 (오프라인 상태에서 주기적으로 재시도)
================================================================ */
async function checkServerSilent() {
  if (serverOnline) return; // 이미 온라인이면 스킵
  try {
    const r = await fetch(`${SERVER}/api/health`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return;

    // 서버가 다시 살아남!
    serverOnline = true;
    setStatusText('온라인');
    setBanner('ok', '✅ 서버에 다시 연결되었습니다. 이제부터 실시간 상담이 가능합니다.');
    setTimeout(() => setBanner(null), 3000);

    // 현재 대화 이력을 서버에 등록 (admin이 이전 대화도 볼 수 있도록)
    await registerSessionWithHistory();
    if (!pollTimer) startPolling();

  } catch { /* 무시 */ }
}

/* 세션 등록 + 현재 히스토리 동기화 */
async function registerSessionWithHistory() {
  try {
    // 세션 등록
    await fetch(`${SERVER}/api/session/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, nickname: userNickname }),
    });
    // 히스토리가 있으면 /api/chat으로 동기화 (빈 응답 OK)
    if (history.length > 0) {
      await fetch(`${SERVER}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, sessionId: SESSION_ID, syncOnly: true }),
      });
    }
  } catch { /* 무시 */ }
}

/* ================================================================
   Admin 난입 — 세션 등록 & 폴링
================================================================ */
async function registerSession() {
  try {
    await fetch(`${SERVER}/api/session/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, nickname: userNickname }),
    });
  } catch { /* 무시 */ }
}

function startPolling() {
  if (pollTimer) return; // 이미 시작됨
  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`${SERVER}/api/session/status?id=${SESSION_ID}`);
      if (!res.ok) return;
      const data = await res.json();

      /* admin 모드 전환 감지 */
      if (data.mode === 'admin' && !adminMode) {
        adminMode = true;
        showAdminBanner(true);
      } else if (data.mode === 'ai' && adminMode) {
        adminMode = false;
        showAdminBanner(false);
      }

      /* 상담원 타이핑 표시 */
      if (data.adminTyping) showAdminTyping();
      else hideAdminTyping();

      /* admin이 보낸 메시지 표시 */
      for (const msg of (data.pendingMsgs || [])) {
        hideAdminTyping();
        addMsg('bot', msg.content);
        history.push({ role: 'assistant', content: msg.content });
        // 탭이 백그라운드일 때 브라우저 알림
        if (document.visibilityState !== 'visible' && Notification.permission === 'granted') {
          new Notification('👩‍💼 담당자 메시지', {
            body: msg.content.slice(0, 80),
            icon: '/favicon.ico',
          });
        }
      }
    } catch { /* 네트워크 오류 무시 */ }
  }, 2000);
}

function showAdminBanner(isAdmin) {
  setBanner(
    isAdmin ? 'admin' : 'ok',
    isAdmin
      ? '👩‍💼 담당자가 연결되었습니다. 직접 상담을 도와드리겠습니다.'
      : '🤖 AI 루마네가 다시 상담을 이어드립니다.'
  );
  if (!isAdmin) setTimeout(() => setBanner(null), 3000);
}

/* ================================================================
   히스토리에서 고객 정보 추출 (데모 모드 전용)
================================================================ */
function extractFromHistory() {
  const userMsgs = history.filter(m => m.role === 'user').map(m => m.content);
  return {
    이름:         userMsgs[0] || '-',
    연락처:       userMsgs[1] || '-',
    설치지역:     userMsgs[2] || '-',
    공간사이즈:   { 가로mm: '-', 세로mm: '-', 높이mm: '-', raw: userMsgs[3] || '-' },
    형태:         userMsgs[4] || '-',
    추가옵션:     userMsgs[5] || '-',
    프레임색상:   userMsgs[6] || '-',
    선반색상:     userMsgs[7] || '-',
    요청사항:     userMsgs[8] || '-',
    개인정보동의: userMsgs[9] || '-',
  };
}

/* ================================================================
   confirmStep용 — 수집 내용 텍스트 요약
================================================================ */
function buildConfirmSummary() {
  const info = extractFromHistory();
  const lines = [
    `👤 성함: ${info.이름}`,
    `📞 연락처: ${info.연락처}`,
    `📍 설치지역: ${info.설치지역}`,
    `📐 공간사이즈: ${info.공간사이즈.raw}`,
    `🪞 드레스룸 형태: ${info.형태}`,
  ];
  if (info.추가옵션 && info.추가옵션 !== '-' && !/없어요|없음/i.test(info.추가옵션)) {
    lines.push(`✨ 추가옵션: ${info.추가옵션}`);
  }
  if (info.프레임색상 && info.프레임색상 !== '-') {
    lines.push(`🎨 프레임색상: ${info.프레임색상}`);
  }
  if (info.선반색상 && info.선반색상 !== '-') {
    lines.push(`🎨 선반색상: ${info.선반색상}`);
  }
  if (info.요청사항 && info.요청사항 !== '-' && !/없어요|없음/i.test(info.요청사항)) {
    lines.push(`📝 요청사항: ${info.요청사항}`);
  }
  return lines.join('\n');
}

/* ================================================================
   메시지 전송
================================================================ */
async function send() {
  const text       = document.getElementById('inp').value.trim();
  const hasPending = !!getPendingFile();
  const editingMid = getEditingMid();
  if ((!text && !hasPending) || getIsLoading()) return;

  /* 전송 시 타이핑 종료 */
  if (serverOnline) {
    fetch(`${SERVER}/api/session/typing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, typing: false }),
    }).catch(() => {});
  }

  /* ── 수정 모드 ── */
  if (editingMid && text) {
    applyEditToDom(editingMid, text);
    const entry = history.find(m => m.mid === editingMid);
    if (entry) entry.content = text;
    saveHistory();
    cancelEdit();
    clearInput();
    return;
  }

  /* ── 답장 상태 가져오기 ── */
  const replyTo = getPendingReply();
  clearPendingReply();

  /* ── 첨부 파일 먼저 업로드 ── */
  if (hasPending) {
    await uploadFilePending(async (url, name, isImage) => {
      const mid = allocMid();
      addFileMsg(url, name, isImage, mid);
      const fullUrl = url.startsWith('http') ? url : `${SERVER}${url}`;
      const content = isImage ? `[이미지]\n${fullUrl}` : `[파일: ${name}]\n${fullUrl}`;
      history.push({ role: 'user', content, mid });
      if (serverOnline) {
        try {
          await fetch(`${SERVER}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: history, sessionId: SESSION_ID, syncOnly: true }),
          });
        } catch { /* 무시 */ }
      }
    });
  }

  /* ── 텍스트가 없으면 여기서 종료 ── */
  if (!text) return;

  const mid = allocMid();
  addMsg('user', text, { mid, replyTo });
  history.push({ role: 'user', content: text, mid, replyTo: replyTo ?? undefined, ts: new Date().toISOString() });
  clearInput();
  setQuick([]);

  /* ── 접수 확인 단계 ── */
  if (pendingConfirm) {
    const isYes = /^(네|예|ㅇ|응|맞아|접수|좋아|확인|ok|yes)/i.test(text);
    const isNo  = /수정|아니|틀|다시|고칠|변경/i.test(text);

    if (isYes) {
      pendingConfirm = false;
      setLoading(true);
      await new Promise(r => setTimeout(r, 600));
      addMsg('bot', '감사합니다! 😊\n지금까지 말씀해 주신 내용을 정리해 드릴게요.\n아래 내용을 한 번 더 확인해 주세요.');
      history.push({ role: 'assistant', content: '견적 요청 확인 안내' });
      setLoading(false);
      setTimeout(() => showConfirm({ 고객정보: extractFromHistory() }), 1000);
      return;
    }

    if (isNo) {
      pendingConfirm = false;
      setLoading(true);
      await new Promise(r => setTimeout(r, 600));
      addMsg('bot', '네, 수정하고 싶으신 내용을 말씀해 주세요.\n성함·연락처·사이즈·형태 등 어느 것이든 다시 알려주시면 수정해 드릴게요 😊');
      history.push({ role: 'assistant', content: '수정 안내' });
      setLoading(false);
      return;
    }

    setLoading(true);
    await new Promise(r => setTimeout(r, 500));
    addMsg('bot', '죄송해요, 잘 이해하지 못했어요 😅\n지금 내용으로 접수하시겠어요? 아니면 수정할 부분이 있으신가요?');
    history.push({ role: 'assistant', content: '재확인 요청' });
    setQuick(['네, 접수할게요!', '아니요, 수정할게요'], true);
    setLoading(false);
    pendingConfirm = true;
    return;
  }

  setLoading(true);

  try {
    let reply, completedQuote;

    if (serverOnline) {
      /* ── 실제 서버 AI 응답 ── */
      const res = await fetch(`${SERVER}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, sessionId: SESSION_ID }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `서버 오류 (${res.status})`);
      }
      const data = await res.json();

      /* ── admin이 난입 중이면 AI 응답 없음 ── */
      if (data.adminMode) {
        setLoading(false);
        return;
      }

      reply          = data.message;
      completedQuote = data.completedQuote;

    } else {
      /* ── 데모 응답 ── */
      await new Promise(r => setTimeout(r, 700 + Math.random() * 500));
      const s = DEMO[Math.min(demoIdx, DEMO.length - 1)];
      demoIdx++;

      reply = s.confirmStep
        ? `지금까지 말씀해 주신 내용을 정리했어요 😊\n\n${buildConfirmSummary()}\n\n위 내용으로 견적 접수를 도와드릴까요?`
        : s.say;

      setQuick(s.quick || [], s.choiceStep === true);
      history.push({ role: 'assistant', content: reply });
      addMsg('bot', reply);
      updateCollectDrawer(demoIdx - 1);

      if (s.confirmStep) pendingConfirm = true;

      setLoading(false);
      return;
    }

    /* ── [SHOW_EXAMPLE:...] 태그 처리 ── */
    const exTag = reply.match(/\[SHOW_EXAMPLE:([^\]]*)\]/);
    if (exTag) {
      reply = reply.replace(/\[SHOW_EXAMPLE:[^\]]*\]/, '').trim();
      const parts   = exTag[1].split(':');
      const exShape = parts[0] || '';
      const exUnits = parts[1] || '';
      const exOpts  = parts[2] || '';
      fetch(`${SERVER}/api/find-example?shape=${encodeURIComponent(exShape)}&units=${encodeURIComponent(exUnits)}&options=${encodeURIComponent(exOpts)}`)
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(d => {
          if (d.success && typeof d.url === 'string' && d.url.startsWith('/')) {
            setTimeout(() => addImageMsg(`${SERVER}${d.url}`, `📐 ${exShape} 예시`), 600);
          }
        })
        .catch(e => console.warn('예시 이미지 로딩 실패:', e));
    }

    // 빈 응답 (API 오류 후 중복 방지용 빈 메시지) 무시
    if (!reply) { setLoading(false); return; }

    history.push({ role: 'assistant', content: reply });
    addMsg('bot', reply);
    updateQuickFromText(reply);
    saveHistory();

    if (completedQuote) {
      setTimeout(() => showConfirm(completedQuote), 1200);
    }

  } catch (err) {
    addMsg('bot', `⚠️ 오류가 발생했습니다.\n${err.message}`);
  } finally {
    setLoading(false);
  }
}

/* ================================================================
   첫 인사
================================================================ */
function greet() {
  if (serverOnline) {
    setLoading(true);
    fetch(`${SERVER}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [], sessionId: SESSION_ID }),
    })
    .then(r => { if (!r.ok) throw new Error('greet failed'); return r.json(); })
    .then(data => {
      const reply = data.message;
      if (!reply) throw new Error('no message');
      history.push({ role: 'assistant', content: reply });
      addMsg('bot', reply);
      saveHistory();
      setLoading(false);
    })
    .catch(() => {
      serverOnline = false;
      demoGreet();
    });
  } else {
    demoGreet();
  }
}

function demoGreet() {
  // showTyping은 setLoading(true)가 처리
  setLoading(true);
  setTimeout(() => {
    const s = DEMO[demoIdx++];
    history.push({ role: 'assistant', content: s.say });
    addMsg('bot', s.say);
    setQuick(s.quick || [], s.choiceStep === true);
    setLoading(false);
  }, 800);
}

/* ================================================================
   새 상담 시작
================================================================ */
export function newChat() {
  history        = [];
  demoIdx        = 0;
  pendingConfirm = false;
  clearHistory();
  if (adminMode) {
    adminMode = false;
    showAdminBanner(false);
  }

  clearMessages();
  setQuick([]);

  document.getElementById('confirmView').classList.remove('show');
  document.getElementById('doneView').classList.remove('show');
  document.getElementById('chatView').style.display = 'flex';

  resetCollect();
  appendDateSep(todayStr());
  greet();
}

/* ================================================================
   초기화
================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  initUI();
  initDateSep(todayStr());
  initInputListeners(send);

  /* contenteditable 붙여넣기 — 순수 텍스트만 허용 */
  document.querySelectorAll('#quoteBox [contenteditable]').forEach(el => {
    el.addEventListener('paste', e => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    });
  });

  /* ESC로 견적서 오버레이 닫기 */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('quoteOverlay').classList.contains('open')) {
      closeQuote(null);
    }
  });

  /* ── 메시지 액션 핸들러 등록 ── */
  setMsgActionHandlers({
    onReply: (mid, role, text) => setPendingReply(mid, role, text),
    onEdit:  (mid, text) => startEdit(mid, text, (t) => {
      document.getElementById('inp').value = t;
      document.getElementById('inp').dispatchEvent(new Event('input'));
      document.getElementById('inp').focus();
    }),
    onDelete: (mid) => {
      deleteFromDom(mid);
      history = history.filter(m => m.mid !== mid);
      saveHistory();
    },
  });

  /* ── 검색 초기화 ── */
  initSearch();

  /* HTML onclick에서 호출 가능하도록 window에 등록 */
  window.toggleHistory      = toggleHistory;
  window.toggleCollect      = toggleCollect;
  window.confirmBack        = confirmBack;
  window.confirmSubmit      = () => { confirmSubmit(); autoSaveConversation(history); };
  window.newChat            = newChat;
  window.closeQuote         = closeQuote;
  window.printQuote         = printQuote;
  window.showTranscript     = showTranscript;
  window.continueFromHistory = continueFromHistory;
  window.closeTranscript    = closeTranscript;
  window.toggleSearch       = toggleSearch;
  window.closeSearch        = closeSearch;

  /* 파일 업로드 초기화 (칩 방식 — 전송 시 send()에서 처리) */
  initFileInput();

  /* ── 고객 타이핑 신호 (어드민에게 전달) ── */
  let _customerTypingTimer = null;
  document.getElementById('inp').addEventListener('input', () => {
    if (!serverOnline) return;
    clearTimeout(_customerTypingTimer);
    fetch(`${SERVER}/api/session/typing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, typing: true }),
    }).catch(() => {});
    // 2초 후 타이핑 종료 신호
    _customerTypingTimer = setTimeout(() => {
      fetch(`${SERVER}/api/session/typing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: SESSION_ID, typing: false }),
      }).catch(() => {});
    }, 2000);
  });

  /* ── 닉네임 오버레이 처리 ── */
  const nicknameOverlay = document.getElementById('nicknameOverlay');
  const nicknameInput   = document.getElementById('nicknameInput');
  const nicknameBtn     = document.getElementById('nicknameBtn');
  const nicknameError   = document.getElementById('nicknameError');

  function startChatWithNickname() {
    const val = nicknameInput.value.trim();
    if (!val) {
      nicknameError.textContent = '닉네임을 입력해 주세요.';
      nicknameInput.focus();
      return;
    }
    userNickname = val;
    localStorage.setItem(NICKNAME_KEY, userNickname);
    nicknameOverlay.classList.add('hidden');
    startChat();
  }

  nicknameBtn.addEventListener('click', startChatWithNickname);
  nicknameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') startChatWithNickname();
  });
  nicknameInput.addEventListener('input', () => { nicknameError.textContent = ''; });

  if (userNickname) {
    // 이미 닉네임 있으면 바로 시작
    nicknameOverlay.classList.add('hidden');
    startChat();
  } else {
    nicknameInput.focus();
  }
});

/* ── 실제 채팅 초기화 (닉네임 확인 후 실행) ── */
async function startChat() {

  /* 서버 확인 후 인사 or 복원 + 세션 등록 + 폴링 시작 */
  checkServer().then(async () => {
    const savedHistory = loadHistory();

    if (savedHistory.length > 0) {
      /* ── 새로고침 복원: 저장된 대화 화면에 다시 표시 ── */
      history = savedHistory;
      for (const m of savedHistory) {
        addMsg(m.role === 'assistant' ? 'bot' : 'user', m.content, {
          mid: m.mid,
          replyTo: m.replyTo ?? null,
        });
      }
      /* 서버 세션에도 재동기화 */
      if (serverOnline) {
        registerSession();
        try {
          await fetch(`${SERVER}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: history, sessionId: SESSION_ID, syncOnly: true }),
          });
        } catch { /* 무시 */ }
        startPolling();
      }
    } else {
      /* ── 최초 진입: 인사 ── */
      greet();
      if (serverOnline) {
        registerSession();
        startPolling();
      }
    }

    if (serverOnline) {
      const savedPhone = localStorage.getItem('루마네_연락처');
      if (savedPhone) fetchConsultationHistory(savedPhone);
    }
  });

  /* 브라우저 알림 권한 요청 */
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  /* 오프라인이면 30초마다 서버 재확인 (Render.com 절전 후 복귀 대응) */
  setInterval(checkServerSilent, 30000);

  /* 배포 자동감지 — 새 버전 배포 시 자동 새로고침 */
  startUpdateChecker();
}

/* ================================================================
   이전 상담 이력 조회 (Supabase, 연락처 기반)
================================================================ */
async function fetchConsultationHistory(phone) {
  if (!phone || !serverOnline) return;
  try {
    const clean = phone.replace(/[-\s]/g, '');
    const r = await fetch(`${SERVER}/api/consultation-history?phone=${encodeURIComponent(clean)}`);
    if (!r.ok) return;
    const data = await r.json();
    if (Array.isArray(data.consultations)) {
      setHistoryData(data.consultations);
    }
  } catch { /* 무시 */ }
}

/* ================================================================
   배포 자동감지 (30초마다 /api/version 체크)
================================================================ */
let _deployedVersion = null;

async function startUpdateChecker() {
  // 현재 버전 초기화
  try {
    const r = await fetch(`${SERVER}/api/version`);
    if (r.ok) _deployedVersion = (await r.json()).v;
  } catch { /* 무시 */ }

  setInterval(async () => {
    if (!serverOnline) return;
    try {
      const r = await fetch(`${SERVER}/api/version?t=${Date.now()}`);
      if (!r.ok) return;
      const { v } = await r.json();
      if (_deployedVersion && v !== _deployedVersion) {
        // 새 배포 감지 → 캐시 무시하고 새로고침
        location.reload(true);
      }
    } catch { /* 무시 */ }
  }, 30000);
}
