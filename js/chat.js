/* ================================================================
   메인 채팅 로직 — 진입점 (ES Module)
================================================================ */
import { SERVER, DEMO, SESSION_ID } from './config.js';
import { todayStr } from './utils.js';
import {
  initUI, setLoading, getIsLoading,
  addMsg, addImageMsg,
  setQuick, updateQuickFromText,
  setBanner, setStatusText,
  initInputListeners, initDateSep, appendDateSep,
  clearMessages, clearInput,
} from './ui.js';
import { toggleHistory, showTranscript, continueFromHistory, closeTranscript } from './history.js';
import { toggleCollect, updateCollectDrawer, resetCollect } from './collect.js';
import { showConfirm, confirmBack, confirmSubmit } from './confirm.js';
import { saveConversation, openQuote, closeQuote, printQuote } from './quote.js';

/* ── 대화 상태 ── */
let history        = [];
let demoIdx        = 0;
let pendingConfirm = false;
let serverOnline   = null;

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
      body: JSON.stringify({ sessionId: SESSION_ID }),
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
      body: JSON.stringify({ sessionId: SESSION_ID }),
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

      /* admin이 보낸 메시지 표시 */
      for (const msg of (data.pendingMsgs || [])) {
        addMsg('bot', msg.content);
        history.push({ role: 'assistant', content: msg.content });
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
  const text = document.getElementById('inp').value.trim();
  if (!text || getIsLoading()) return;

  addMsg('user', text);
  history.push({ role: 'user', content: text });
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

    history.push({ role: 'assistant', content: reply });
    addMsg('bot', reply);
    updateQuickFromText(reply);

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
      body: JSON.stringify({ messages: [] }),
    })
    .then(r => r.json())
    .then(data => {
      const reply = data.message;
      history.push({ role: 'assistant', content: reply });
      addMsg('bot', reply);
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

  /* HTML onclick에서 호출 가능하도록 window에 등록 */
  window.toggleHistory      = toggleHistory;
  window.toggleCollect      = toggleCollect;
  window.saveConversation   = () => saveConversation(history);
  window.confirmBack        = confirmBack;
  window.confirmSubmit      = confirmSubmit;
  window.newChat            = newChat;
  window.closeQuote         = closeQuote;
  window.printQuote         = printQuote;
  window.showTranscript     = showTranscript;
  window.continueFromHistory = continueFromHistory;
  window.closeTranscript    = closeTranscript;

  /* 서버 확인 후 인사 + 세션 등록 + 폴링 시작 */
  checkServer().then(() => {
    greet();
    if (serverOnline) {
      registerSession();
      startPolling();
    }
  });

  /* 오프라인이면 30초마다 서버 재확인 (Render.com 절전 후 복귀 대응) */
  setInterval(checkServerSilent, 30000);
});
