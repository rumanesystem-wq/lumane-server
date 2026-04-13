/* ================================================================
   라이브 상담 기능 — 실시간 세션 난입
================================================================ */

/**
 * 라이브 세션 목록 폴링 시작 (탭 진입 시)
 */
function startLivePolling() {
  if (livePollTimer) return;
  fetchLiveSessions();
  livePollTimer = setInterval(fetchLiveSessions, 3000);
}

/**
 * 라이브 세션 목록 폴링 중단 (탭 이탈 시)
 */
function stopLivePolling() {
  clearInterval(livePollTimer);
  clearInterval(liveMsgPollTimer);
  livePollTimer    = null;
  liveMsgPollTimer = null;
  liveSelectedId   = null;
  liveAdminMode    = false;
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
    renderLiveSessionList(data.sessions || []);
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

  liveMsgPollTimer = setInterval(fetchLiveSessionMsgs, 2000);
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
    return `
      <div style="display:flex;${isUser ? 'justify-content:flex-end' : 'justify-content:flex-start'};gap:8px;align-items:flex-end;">
        ${!isUser ? `<div style="width:28px;height:28px;border-radius:50%;background:${isAdminMsg ? 'linear-gradient(135deg,#7c3aed,#a855f7)' : 'linear-gradient(135deg,#6b7280,#9ca3af)'};display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">${isAdminMsg ? '👩‍💼' : '🤖'}</div>` : ''}
        <div style="max-width:70%;padding:9px 13px;font-size:13px;line-height:1.55;word-break:break-word;white-space:pre-wrap;border-radius:${isUser ? '12px 12px 3px 12px' : '3px 12px 12px 12px'};
          background:${isUser ? '#7c3aed' : (isAdminMsg ? '#ede9fe' : '#fff')};
          color:${isUser ? '#fff' : '#1a1a2e'};
          box-shadow:0 1px 3px rgba(0,0,0,.07);">
          ${isAdminMsg ? '<span style="font-size:10px;color:#7c3aed;font-weight:700;display:block;margin-bottom:3px;">담당자</span>' : ''}
          ${escAdmin(m.content)}
        </div>
        ${isUser ? `<div style="width:28px;height:28px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">👤</div>` : ''}
      </div>
    `;
  }).join('');

  if (wasAtBottom) msgs.scrollTop = msgs.scrollHeight;

  const input   = document.getElementById('liveInput');
  const sendBtn = document.getElementById('liveSendBtn');
  input.disabled   = !isAdmin;
  sendBtn.disabled = !isAdmin;
  input.placeholder = isAdmin
    ? '고객에게 직접 메시지를 입력하세요...'
    : '난입하기를 눌러야 입력 가능합니다';

  if (isAdmin) input.focus();
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

/**
 * admin → 고객 메시지 전송
 */
async function sendAdminMsg() {
  const input = document.getElementById('liveInput');
  const text  = input.value.trim();
  if (!text || !liveSelectedId || !liveAdminMode) return;

  input.value    = '';
  input.disabled = true;

  try {
    const res = await fetch(`${SERVER}/api/admin/message`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ sessionId: liveSelectedId, message: text }),
    });
    if (!res.ok) throw new Error();
    await fetchLiveSessionMsgs();
  } catch {
    showToast('❌ 메시지 전송 실패', 'error');
  } finally {
    input.disabled = false;
    input.focus();
  }
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
