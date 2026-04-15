/* ================================================================
   라이브 상담 기능 — 실시간 세션 난입
================================================================ */

/**
 * 백그라운드 세션 카운트 폴링 (항상 실행, 5초마다)
 * — 라이브 탭 밖에서도 새 손님 알림 뱃지 유지
 */
function startBgPolling() {
  if (bgPollTimer) return;
  bgPollTimer = setInterval(async () => {

    // ── 오프라인이면 재연결 시도 (Render.com 절전 복귀 대응) ──
    if (!serverOnline) {
      try {
        const r = await fetch(`${SERVER}/api/health`, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return;
        serverOnline = true;
        document.getElementById('serverBadge').className    = 'server-badge online';
        document.getElementById('serverStatus').textContent = '서버 연결됨';
        await loadQuotes();
      } catch { return; }
    }

    // ── 세션 카운트 확인 → 라이브 탭 뱃지 업데이트 ──
    try {
      const res = await fetch(`${SERVER}/api/admin/sessions`, { headers: adminHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const count = (data.sessions || []).length;
      const badge   = document.getElementById('liveBadge');
      const countEl = document.getElementById('liveCount');
      if (badge)   badge.style.display = count > 0 ? 'inline' : 'none';
      if (countEl) countEl.textContent  = count + '개 세션';
    } catch { /* 무시 */ }

  }, 5000);
}

function stopBgPolling() {
  clearInterval(bgPollTimer);
  bgPollTimer = null;
}

/**
 * 라이브 세션 목록 폴링 시작 (탭 진입 시) — 1초 간격
 */
function startLivePolling() {
  if (livePollTimer) return;
  stopBgPolling(); // live 탭에선 빠른 폴링이 대신함
  fetchLiveSessions();
  livePollTimer = setInterval(fetchLiveSessions, 1000);
}

/**
 * 라이브 세션 목록 폴링 중단 (탭 이탈 시) — 백그라운드 폴링으로 전환
 */
function stopLivePolling() {
  clearInterval(livePollTimer);
  clearInterval(liveMsgPollTimer);
  livePollTimer    = null;
  liveMsgPollTimer = null;
  liveSelectedId   = null;
  liveAdminMode    = false;
  startBgPolling(); // 탭 이탈 후에도 알림 뱃지 유지
}

/**
 * 서버에서 활성 세션 목록을 가져와 렌더링
 */
async function fetchLiveSessions() {
  if (!serverOnline) return;
  try {
    const res = await fetch(`${SERVER}/api/admin/sessions`, { headers: adminHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const sessions = data.sessions || [];
    renderLiveSessionList(sessions);

    /* ── 세션 자동 선택 ── */
    if (sessions.length > 0 && !liveSelectedId) {
      /* 아직 선택된 세션 없으면 가장 최근 세션 자동 선택 */
      selectLiveSession(sessions[0].id);
    } else if (liveSelectedId && !sessions.find(s => s.id === liveSelectedId)) {
      /* 선택했던 세션이 사라졌으면 다음 세션으로 전환 */
      liveSelectedId = null;
      if (sessions.length > 0) selectLiveSession(sessions[0].id);
    }
  } catch { /* 무시 */ }
}

/**
 * 세션 목록 렌더링
 */
function renderLiveSessionList(sessions) {
  const container = document.getElementById('liveSessionList');
  const dot       = document.getElementById('liveDot');
  const countEl   = document.getElementById('liveCount');

  countEl.textContent = sessions.length + '개 세션';

  if (sessions.length === 0) {
    dot.style.background = '#d1d5db';
    container.innerHTML = `
      <div style="text-align:center;padding:40px 16px;color:#9ca3af;font-size:13px;">
        <div style="font-size:32px;margin-bottom:12px;">💤</div>
        현재 진행 중인 상담이 없습니다
      </div>`;
    return;
  }

  dot.style.background = '#22c55e';

  // 새 세션 알림 배지 표시
  const currentTab = document.querySelector('.tab-btn.active')?.id;
  if (currentTab !== 'tab-live') {
    document.getElementById('liveBadge').style.display = 'inline';
  }

  container.innerHTML = sessions.map(s => {
    const isSelected = s.id === liveSelectedId;
    const isAdmin    = s.mode === 'admin';
    const ago        = timeSince(new Date(s.lastActivity));

    return `
      <div onclick="selectLiveSession('${escAttr(s.id)}')"
        style="padding:12px 14px;border-radius:10px;cursor:pointer;margin-bottom:6px;
          border:2px solid ${isSelected ? '#7c3aed' : '#e5e7eb'};
          background:${isSelected ? '#faf5ff' : '#fff'};
          transition:all .15s;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="font-size:18px;">${isAdmin ? '👩‍💼' : '🤖'}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${escAdmin(s.customerName)}
            </div>
            <div style="font-size:11px;color:#9ca3af;font-family:monospace">${escAdmin(s.id.slice(0,18))}…</div>
          </div>
          <span style="font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700;white-space:nowrap;
            background:${isAdmin ? '#ede9fe' : '#f3f4f6'};
            color:${isAdmin ? '#7c3aed' : '#6b7280'};">
            ${isAdmin ? '담당자 중' : 'AI 중'}
          </span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#9ca3af;">
          <span>💬 ${s.messageCount}개 메시지</span>
          <span>${ago}</span>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * 세션 선택 — 오른쪽 채팅 패널에 표시
 */
async function selectLiveSession(sessionId) {
  clearInterval(liveMsgPollTimer);
  liveMsgPollTimer = null;
  liveSelectedId = sessionId;

  await fetchLiveSessionMsgs();

  // await 동안 다른 세션이 선택됐으면 타이머 설정하지 않음 (stale 방지)
  if (liveSelectedId !== sessionId) return;

  liveMsgPollTimer = setInterval(fetchLiveSessionMsgs, 1000);
  fetchLiveSessions();
}

/**
 * 선택된 세션의 메시지를 가져와 패널에 표시
 */
async function fetchLiveSessionMsgs() {
  if (!liveSelectedId || !serverOnline) return;
  try {
    const res = await fetch(
      `${SERVER}/api/admin/session/${encodeURIComponent(liveSelectedId)}`,
      { headers: adminHeaders() }
    );
    if (!res.ok) return;
    const data = await res.json();
    renderLiveChatPanel(data.session);
  } catch { /* 무시 */ }
}

/**
 * 오른쪽 채팅 패널 렌더링
 */
function renderLiveChatPanel(sess) {
  const isAdmin = sess.mode === 'admin';
  liveAdminMode = isAdmin;

  document.getElementById('livePanelTitle').textContent =
    `💬 ${sess.customerName || '(이름 미수집)'}`;
  document.getElementById('livePanelMeta').textContent =
    `세션 ${sess.id.slice(0, 20)}… · 메시지 ${sess.messages.length}개`;

  document.getElementById('livePanelActions').innerHTML = isAdmin
    ? `<button class="btn btn-outline" onclick="releaseSession()" style="font-size:13px;">🤖 AI에게 넘기기</button>`
    : `<button class="btn btn-primary" onclick="takeoverSession()" style="font-size:13px;">👩‍💼 난입하기</button>`;

  const msgs = document.getElementById('liveMsgs');
  const wasAtBottom = msgs.scrollTop + msgs.clientHeight >= msgs.scrollHeight - 30;

  msgs.innerHTML = (sess.messages || []).map(m => {
    const isUser     = m.role === 'user';
    const isAdminMsg = m.fromAdmin;

    /* 이미지 첨부 패턴 감지 */
    const imgMatch  = m.content?.match(/^\[이미지\]\n(https?:\/\/\S+)$/);
    const fileMatch = m.content?.match(/^\[파일: ([^\]]+)\]\n(https?:\/\/\S+)$/);
    let bubbleInner;
    if (imgMatch) {
      bubbleInner = `<img src="${imgMatch[1]}" style="max-width:200px;border-radius:8px;display:block;cursor:pointer;" onclick="window.open('${imgMatch[1]}','_blank','noopener,noreferrer')" onerror="this.style.display='none'">`;
    } else if (fileMatch) {
      bubbleInner = `📎 <a href="${fileMatch[2]}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline">${escAdmin(fileMatch[1])}</a>`;
    } else {
      bubbleInner = (isAdminMsg ? '<span style="font-size:10px;color:#7c3aed;font-weight:700;display:block;margin-bottom:3px;">담당자</span>' : '') + escAdmin(m.content);
    }

    return `
      <div style="display:flex;${isUser ? 'justify-content:flex-end' : 'justify-content:flex-start'};gap:8px;align-items:flex-end;">
        ${!isUser ? `<div style="width:28px;height:28px;border-radius:50%;background:${isAdminMsg ? 'linear-gradient(135deg,#7c3aed,#a855f7)' : 'linear-gradient(135deg,#6b7280,#9ca3af)'};display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">${isAdminMsg ? '👩‍💼' : '🤖'}</div>` : ''}
        <div style="max-width:70%;padding:${imgMatch ? '6px' : '11px 15px'};font-size:14.5px;line-height:1.65;word-break:break-word;white-space:pre-wrap;border-radius:${isUser ? '18px 18px 4px 18px' : '4px 18px 18px 18px'};background:${isUser ? '#7c3aed' : (isAdminMsg ? '#ede9fe' : '#fff')};color:${isUser ? '#fff' : '#1a1a2e'};box-shadow:0 1px 3px rgba(0,0,0,.07);">${bubbleInner}</div>
        ${isUser ? `<div style="width:28px;height:28px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">👤</div>` : ''}
      </div>
    `;
  }).join('');

  if (wasAtBottom) msgs.scrollTop = msgs.scrollHeight;

  const input      = document.getElementById('liveInput');
  const sendBtn    = document.getElementById('liveSendBtn');
  const uploadBtn  = document.getElementById('adminUploadBtn');
  input.disabled = !isAdmin;
  if (uploadBtn) uploadBtn.disabled = !isAdmin;
  refreshAdminSendBtn();
  input.placeholder = isAdmin
    ? '고객에게 직접 메시지를 입력하세요...'
    : '난입하기를 눌러야 입력 가능합니다';

  if (isAdmin) input.focus();
}

/**
 * admin 파일 업로드 초기화 (페이지 로드 시 1회 실행)
 */
function initAdminFileUpload() {
  const input = document.getElementById('adminFileInput');
  if (!input) return;
  /* + 버튼으로 파일 선택 → 칩으로 표시 (전송은 전송 버튼에서) */
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    input.value = '';
    if (file.size > 10 * 1024 * 1024) {
      showToast('파일은 10MB 이하만 첨부 가능합니다', 'error');
      return;
    }
    showAdminAttachBar(file);
  });
}

/**
 * 선택된 세션에 admin 난입
 */
async function takeoverSession() {
  if (!liveSelectedId) return;
  try {
    const res = await fetch(`${SERVER}/api/admin/takeover`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ sessionId: liveSelectedId }),
    });
    if (!res.ok) throw new Error();
    showToast('👩‍💼 난입 완료! 고객에게 직접 메시지를 보내세요.', 'success');
    fetchLiveSessionMsgs();
  } catch {
    showToast('❌ 난입에 실패했습니다', 'error');
  }
}

/**
 * 선택된 세션을 AI에게 반환
 */
async function releaseSession() {
  if (!liveSelectedId) return;
  try {
    const res = await fetch(`${SERVER}/api/admin/release`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ sessionId: liveSelectedId }),
    });
    if (!res.ok) throw new Error();
    showToast('🤖 AI에게 다시 넘겼습니다.', 'success');
    fetchLiveSessionMsgs();
  } catch {
    showToast('❌ 처리에 실패했습니다', 'error');
  }
}

/* ── admin 첨부 칩 상태 ── */
let adminPendingFile      = null;
let adminPendingObjectUrl = null;

function showAdminAttachBar(file) {
  adminPendingFile = file;
  if (adminPendingObjectUrl) URL.revokeObjectURL(adminPendingObjectUrl);
  adminPendingObjectUrl = URL.createObjectURL(file);

  const bar = document.getElementById('adminAttachBar');
  if (!bar) return;

  const isImg = file.type.startsWith('image/');
  bar.innerHTML = (isImg
    ? `<img src="${adminPendingObjectUrl}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;flex-shrink:0;" alt="">`
    : `<span style="font-size:22px;flex-shrink:0;">📎</span>`) +
    `<span style="font-size:12px;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;">${file.name || 'screenshot.png'}</span>
     <button id="adminAttachRemove" style="flex-shrink:0;background:none;border:none;font-size:14px;color:#9ca3af;cursor:pointer;padding:4px 6px;border-radius:6px;">✕</button>`;

  bar.style.display = 'flex';
  document.getElementById('adminAttachRemove').addEventListener('click', () => {
    clearAdminPendingFile();
    document.getElementById('liveInput')?.focus();
  });
  refreshAdminSendBtn();
}

function clearAdminPendingFile() {
  if (adminPendingObjectUrl) { URL.revokeObjectURL(adminPendingObjectUrl); adminPendingObjectUrl = null; }
  adminPendingFile = null;
  const bar = document.getElementById('adminAttachBar');
  if (bar) bar.style.display = 'none';
  refreshAdminSendBtn();
}

function refreshAdminSendBtn() {
  const btn   = document.getElementById('liveSendBtn');
  const input = document.getElementById('liveInput');
  if (!btn) return;
  btn.disabled = !liveAdminMode || !liveSelectedId || (!input?.value.trim() && !adminPendingFile);
}

/**
 * admin → 고객 메시지 전송
 */
async function sendAdminMsg() {
  const input  = document.getElementById('liveInput');
  const text   = input?.value.trim() || '';
  const hasPending = !!adminPendingFile;
  if ((!text && !hasPending) || !liveSelectedId || !liveAdminMode) return;

  input.value    = '';
  input.disabled = true;
  refreshAdminSendBtn();

  try {
    /* 첨부 파일 먼저 전송 */
    if (hasPending) {
      const file = adminPendingFile;
      clearAdminPendingFile();
      showToast('업로드 중...', 'info');
      const name = file.name && file.name !== 'image.png' ? file.name : `screenshot-${Date.now()}.png`;
      const fd   = new FormData();
      fd.append('file', file, name);
      const up = await fetch(`${SERVER}/api/upload`, { method: 'POST', body: fd });
      if (!up.ok) throw new Error('upload');
      const upData = await up.json();
      if (!upData.success) throw new Error('upload');
      const fullUrl    = upData.url.startsWith('http') ? upData.url : `${location.origin}${upData.url}`;
      const msgContent = upData.isImage ? `[이미지]\n${fullUrl}` : `[파일: ${name}]\n${fullUrl}`;
      const res = await fetch(`${SERVER}/api/admin/message`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ sessionId: liveSelectedId, message: msgContent }),
      });
      if (!res.ok) throw new Error('send');
      showToast('✅ 이미지 전송 완료', 'success');
    }

    /* 텍스트 전송 */
    if (text) {
      const res = await fetch(`${SERVER}/api/admin/message`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ sessionId: liveSelectedId, message: text }),
      });
      if (!res.ok) throw new Error('send');
    }

    await fetchLiveSessionMsgs();
  } catch {
    showToast('❌ 메시지 전송 실패', 'error');
  } finally {
    input.disabled = false;
    input.focus();
    refreshAdminSendBtn();
  }
}

/**
 * admin 입력창 Ctrl+V 이미지 붙여넣기 → 칩 방식
 */
function initAdminPaste() {
  const input = document.getElementById('liveInput');
  if (!input) return;

  input.addEventListener('input', refreshAdminSendBtn);

  input.addEventListener('paste', (e) => {
    const items     = Array.from(e.clipboardData?.items || []);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (file) showAdminAttachBar(file);
  });
}

/**
 * 경과 시간 표시 (예: "2분 전")
 */
function timeSince(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60)   return diff + '초 전';
  if (diff < 3600) return Math.floor(diff / 60) + '분 전';
  return Math.floor(diff / 3600) + '시간 전';
}
