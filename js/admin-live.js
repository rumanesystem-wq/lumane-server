/* ================================================================
   라이브 상담 기능 — 실시간 세션 난입
================================================================ */

/**
 * 저장된 상담 미확인 건수 확인 (60초마다 백그라운드 실행)
 */
async function checkHistoryCount() {
  if (!serverOnline) return;
  if (document.querySelector('.tab-btn.active')?.id === 'tab-history') {
    localStorage.setItem('lastSeenHistoryAt', new Date().toISOString());
    updateHistoryBadge(0);
    const el = document.getElementById('statUnread');
    const card = el?.closest('.stats-card--unread');
    if (el) el.textContent = 0;
    if (card) card.classList.add('no-unread');
    return;
  }
  try {
    const res = await fetch(`${SERVER}/api/admin/conversations`, { headers: adminHeaders() });
    if (!res.ok) return;
    // await 이후 탭 상태 재확인 (race condition 방지)
    if (document.querySelector('.tab-btn.active')?.id === 'tab-history') return;
    const data = await res.json();
    const conversations = data.conversations || [];
    let lastSeenAt = localStorage.getItem('lastSeenHistoryAt');
    if (!lastSeenAt) {
      lastSeenAt = new Date().toISOString();
      localStorage.setItem('lastSeenHistoryAt', lastSeenAt);
    }
    const seenDate = new Date(lastSeenAt);
    const unread = conversations.filter(c => c.saved_at && new Date(c.saved_at) > seenDate).length;
    if (typeof updateHistoryBadge === 'function') updateHistoryBadge(unread);
    const el = document.getElementById('statUnread');
    const card = el?.closest('.stats-card--unread');
    if (el) el.textContent = unread;
    if (card) card.classList.toggle('no-unread', unread === 0);
  } catch { /* 무시 */ }
}

function goToUnreadHistory() {
  const btn = document.getElementById('tab-history');
  if (btn) btn.click();
}

/**
 * 백그라운드 세션 카운트 폴링 (항상 실행, 5초마다)
 * — 라이브 탭 밖에서도 새 손님 알림 뱃지 유지
 */

function startBgPolling() {
  if (bgPollTimer) return;
  // 저장된 상담 미확인 카운트 — 60초마다 독립 실행
  if (!historyBgPollTimer) {
    checkHistoryCount();
    historyBgPollTimer = setInterval(checkHistoryCount, 60000);
  }
  // 대시보드 저장된 상담 목록 — 30초마다 갱신
  fetchDashboardConversations();
  if (!convPollTimer) {
    convPollTimer = setInterval(fetchDashboardConversations, 30000);
  }
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

    // ── 세션 카운트 확인 → 라이브 탭 뱃지 + 대시보드 업데이트 ──
    try {
      const res = await fetch(`${SERVER}/api/admin/sessions`, { headers: adminHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const sessions = data.sessions || [];
      const count       = sessions.length;
      const unreadCount = sessions.filter(s => s.id && !_getSeenSessions().has(s.id)).length;
      const badge   = document.getElementById('liveBadge');
      const countEl = document.getElementById('liveCount');
      if (badge) { badge.style.display = count > 0 ? 'inline' : 'none'; badge.textContent = count; }
      if (countEl) countEl.textContent  = count + '개 세션';
      // 대시보드도 업데이트
      _checkLiveNotifications(sessions);
      renderDashboardSessions(sessions);
      const dashDot   = document.getElementById('dashDot');
      const dashCount = document.getElementById('dashCount');
      if (dashDot)   dashDot.style.background = count > 0 ? '#22c55e' : '#d1d5db';
      if (dashCount) dashCount.textContent = count + '개 진행 중';
    } catch { /* 무시 */ }

  }, 5000);
}

function stopBgPolling() {
  clearInterval(bgPollTimer);
  bgPollTimer = null;
  clearInterval(convPollTimer);
  convPollTimer = null;
  // historyBgPollTimer는 의도적으로 유지 — 탭과 무관하게 항상 실행
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
  _checkLiveNotifications(sessions);
  const container = document.getElementById('liveSessionList');
  const dot       = document.getElementById('liveDot');
  const countEl   = document.getElementById('liveCount');

  if (countEl) countEl.textContent = sessions.length + '개 세션';

  if (sessions.length === 0) {
    if (dot) dot.style.background = '#d1d5db';
    if (container) container.innerHTML = `
      <div style="text-align:center;padding:40px 16px;color:#9ca3af;font-size:13px;">
        <div style="font-size:32px;margin-bottom:12px;">💤</div>
        현재 진행 중인 상담이 없습니다
      </div>`;
    return;
  }

  if (dot) dot.style.background = '#22c55e';

  // 새 세션 알림 배지 표시
  const currentTab = document.querySelector('.tab-btn.active')?.id;
  if (currentTab !== 'tab-live') {
    const badge = document.getElementById('liveBadge');
    if (badge) { badge.style.display = 'inline'; badge.textContent = sessions.length; }
  }

  if (!container) return;
  const seenNow = _getSeenSessions();
  container.innerHTML = sessions.map(s => {
    const isSelected = s.id === liveSelectedId;
    const isAdmin    = s.mode === 'admin';
    const isNew      = s.id && !seenNow.has(s.id);
    const ago        = timeSince(new Date(s.lastMessageAt));
    const msgCount   = s.messageCount ?? 0;

    return `
      <div data-session-id="${escAttr(s.id)}"
        onclick="markSessionSeen('${escAttr(s.id)}');selectLiveSession('${escAttr(s.id)}')"
        style="padding:12px 14px;border-radius:10px;cursor:pointer;margin-bottom:6px;
          border:2px solid ${isSelected ? '#7c3aed' : '#e5e7eb'};
          background:${isSelected ? '#faf5ff' : '#fff'};
          transition:all .15s;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="font-size:18px;">${isAdmin ? '👩‍💼' : '🤖'}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:5px;">
              ${escAdmin(s.customerName)}
              ${isNew ? '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:#ef4444;color:#fff;font-weight:700;">NEW</span>' : ''}
              ${s.isTest ? '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:#fef3c7;color:#92400e;font-weight:700;">테스트</span>' : ''}
            </div>
            <div style="font-size:11px;color:#9ca3af;font-family:monospace">${escAdmin(s.id.slice(0,18))}…</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            ${msgCount > 0 ? `<span class="new-badge" style="background:#ef4444;color:#fff;font-size:11px;font-weight:700;padding:1px 7px;border-radius:10px;min-width:20px;text-align:center;">${msgCount}</span>` : ''}
            <span style="font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700;white-space:nowrap;
              background:${isAdmin ? '#ede9fe' : '#f3f4f6'};
              color:${isAdmin ? '#7c3aed' : '#6b7280'};">
              ${isAdmin ? '담당자 중' : 'AI 중'}
            </span>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#9ca3af;">
          <span>💬 ${msgCount}개 메시지</span>
          <span>${ago}</span>
        </div>
        ${s.tokens ? `<div style="margin-top:5px;font-size:11px;color:#7c3aed;font-weight:600;">🪙 ₩${s.tokens.costKRW.toLocaleString()} · ${s.tokens.totalTokens.toLocaleString()}토큰</div>` : ''}
      </div>
    `;
  }).join('');

  // 토큰 맵 갱신 (채팅 패널 헤더에서 참조)
  for (const s of sessions) {
    if (s.tokens) window._liveTokenMap = window._liveTokenMap || {};
    if (s.tokens) window._liveTokenMap[s.id] = s.tokens;
  }

  // 대시보드 세션 목록도 같이 업데이트
  renderDashboardSessions(sessions);
}

/**
 * 대시보드 탭 — 현재 진행 중인 채팅방 목록
 */
/* ── 확인된 세션 ID 추적 (localStorage) ── */
const _SEEN_KEY = 'lumane_seen_sessions';
/* ── 세션별 마지막으로 읽은 메시지 수 추적 (메모리) ── */
const _seenMsgCounts = {};
function _getSeenSessions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(_SEEN_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch { return new Set(); }
}
function markSessionSeen(sessionId) {
  if (!sessionId) return;
  const seen = _getSeenSessions();
  seen.add(sessionId);
  const arr = [...seen];
  localStorage.setItem(_SEEN_KEY, JSON.stringify(arr.length > 200 ? arr.slice(arr.length - 200) : arr));
  _refreshDashBadge();
  // 실시간 세션 카드 즉시 업데이트
  const sessionCard = document.querySelector(`[data-session-id="${CSS.escape(sessionId)}"]`);
  if (sessionCard) {
    sessionCard.style.borderColor = '#3b82f6';
    sessionCard.querySelector('.new-badge')?.remove();
    const enterBtn = sessionCard.querySelector('.enter-btn');
    if (enterBtn) enterBtn.style.color = '#3b82f6';
  }
  // 저장된 상담 카드 즉시 업데이트
  const convCard = document.querySelector(`[data-conv-id="${CSS.escape(sessionId)}"]`);
  if (convCard) {
    convCard.style.borderColor = '#3b82f6';
    convCard.querySelector('.new-badge')?.remove();
    const detailBtn = convCard.querySelector('.detail-btn');
    if (detailBtn) detailBtn.style.color = '#3b82f6';
  }
}
window.markSessionSeen = markSessionSeen;

/* ── 저장된 상담 캐시 ── */
let _cachedConversations = [];
let _cachedLiveSessions  = [];

function _refreshDashBadge() {
  const seen    = _getSeenSessions();
  const liveNew = _cachedLiveSessions.filter(s => s.id && !seen.has(s.id)).length;
  const convNew = _cachedConversations.filter(c => c.id && !seen.has(c.id)).length;
  const total   = liveNew + convNew;
  [document.getElementById('dashNewBadge'), document.getElementById('sidebarDashBadge')].forEach(badge => {
    if (!badge) return;
    badge.textContent = total;
    badge.style.display = total > 0 ? 'inline' : 'none';
  });
  const liveBadge = document.getElementById('liveBadge');
  if (liveBadge) {
    liveBadge.textContent = _cachedLiveSessions.length;
    liveBadge.style.display = _cachedLiveSessions.length > 0 ? 'inline' : 'none';
  }
}

async function fetchDashboardConversations() {
  if (!serverOnline) return;
  try {
    const res = await fetch(`${SERVER}/api/admin/conversations`, { headers: adminHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    _cachedConversations = (data.conversations || []).slice(0, 30);
    _refreshDashBadge();
    _checkConvNotifications();
    renderDashboardSessions(_cachedLiveSessions);
  } catch { /* 무시 */ }
}

/* ================================================================
   알림 시스템
================================================================ */
let _notifSeq       = 0;
const _notifications = [];
let _liveNotifReady  = false;
let _convNotifReady  = false;

const _NOTIF_CONV_KEY = 'lumane_seen_notif_convs';
const _NOTIF_LIVE_KEY = 'lumane_seen_notif_live';
function _getSeenNotifConvs() {
  try { const p = JSON.parse(localStorage.getItem(_NOTIF_CONV_KEY) || '[]'); return new Set(Array.isArray(p) ? p : []); } catch { return new Set(); }
}
function _addSeenNotifConv(id) {
  const set = _getSeenNotifConvs(); set.add(id);
  const arr = [...set]; localStorage.setItem(_NOTIF_CONV_KEY, JSON.stringify(arr.length > 200 ? arr.slice(-200) : arr));
}
function _getSeenNotifLive() {
  try { const p = JSON.parse(localStorage.getItem(_NOTIF_LIVE_KEY) || '[]'); return new Set(Array.isArray(p) ? p : []); } catch { return new Set(); }
}
function _addSeenNotifLive(id) {
  const set = _getSeenNotifLive(); set.add(id);
  const arr = [...set]; localStorage.setItem(_NOTIF_LIVE_KEY, JSON.stringify(arr.length > 200 ? arr.slice(-200) : arr));
}

function _addNotif(type, title, body, targetId) {
  _notifications.unshift({ id: String(_notifSeq++), type, title, body, targetId, time: new Date(), read: false });
  if (_notifications.length > 50) _notifications.length = 50;
  _renderNotifList();
  _updateBellBadge();
}

function _updateBellBadge() {
  const unread = _notifications.filter(n => !n.read).length;
  const badge  = document.getElementById('bellBadge');
  if (badge) {
    badge.textContent = unread > 99 ? '99+' : unread;
    badge.style.display = unread > 0 ? 'inline' : 'none';
  }
}

function _renderNotifList() {
  const list = document.getElementById('notifList');
  if (!list) return;
  if (_notifications.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:32px;color:#9ca3af;font-size:13px;">알림이 없습니다</div>';
    return;
  }
  list.innerHTML = _notifications.map(n => `
    <div onclick="handleNotifClick('${escAttr(n.id)}')"
      data-read-bg="${n.read ? '#fff' : '#eff6ff'}"
      style="padding:12px 16px;border-bottom:1px solid #f9fafb;cursor:pointer;display:flex;gap:10px;align-items:flex-start;background:${n.read ? '#fff' : '#eff6ff'};"
      onmouseenter="this.style.background='#f3f4f6'" onmouseleave="this.style.background=this.dataset.readBg">
      <div style="font-size:20px;line-height:1;flex-shrink:0;margin-top:2px;">${n.type === 'saved' ? '📁' : '💬'}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:${n.read ? '500' : '700'};color:#111827;margin-bottom:2px;">${escAdmin(n.title)}</div>
        <div style="font-size:12px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escAdmin(n.body)}</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:3px;">${timeSince(n.time)}</div>
      </div>
      ${!n.read ? '<div style="width:7px;height:7px;border-radius:50%;background:#3b82f6;flex-shrink:0;margin-top:5px;"></div>' : ''}
    </div>
  `).join('');
}

function _checkConvNotifications() {
  const seen = _getSeenNotifConvs();
  if (!_convNotifReady) {
    _cachedConversations.forEach(c => { if (c.id) _addSeenNotifConv(c.id); });
    _convNotifReady = true;
    return;
  }
  _cachedConversations.forEach(c => {
    if (!c.id || seen.has(c.id)) return;
    _addSeenNotifConv(c.id);
    const region = c.region ? ' · ' + c.region : '';
    _addNotif('saved', '상담이 저장됐습니다', getConvLabel(c) + region, c.id);
  });
}

function _checkLiveNotifications(sessions) {
  const seen = _getSeenNotifLive();
  sessions.forEach(s => {
    if (!s.id || seen.has(s.id)) return;
    _addSeenNotifLive(s.id);
    _addNotif('live_start', '새로운 고객님이 오셨습니다 🙋', s.customerName || '고객', s.id);
  });
  _liveNotifReady = true;
}

window.toggleNotifPanel = function() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  const open = panel.style.display !== 'none';
  if (open) {
    panel.style.display = 'none';
  } else {
    panel.style.display = 'flex';
    _renderNotifList();
  }
};

window.handleNotifClick = function(id) {
  const notif = _notifications.find(n => n.id === id);
  if (!notif) return;
  notif.read = true;
  _updateBellBadge();
  _renderNotifList();
  const panel = document.getElementById('notifPanel');
  if (panel) panel.style.display = 'none';
  if (notif.type === 'saved') {
    if (typeof openHistoryDetail === 'function') openHistoryDetail(notif.targetId);
  } else {
    switchTab('live');
    setTimeout(() => selectLiveSession(notif.targetId), 100);
  }
};

window.markAllNotifsRead = function() {
  _notifications.forEach(n => n.read = true);
  _updateBellBadge();
  _renderNotifList();
};

/* 패널 외부 클릭 시 닫기 */
document.addEventListener('click', e => {
  const panel   = document.getElementById('notifPanel');
  const wrapper = document.getElementById('notifWrapper');
  if (panel && panel.style.display !== 'none' && wrapper && !wrapper.contains(e.target)) {
    panel.style.display = 'none';
  }
});

function renderDashboardSessions(sessions) {
  const container = document.getElementById('dashboardSessionList');
  if (!container) return;

  // 이벤트 위임 — 최초 1회만 등록
  if (!container._clickInited) {
    container._clickInited = true;
    container.addEventListener('click', e => {
      const sessionCard = e.target.closest('[data-session-id]');
      const convCard    = e.target.closest('[data-conv-id]');
      if (sessionCard) {
        const sessionId = sessionCard.dataset.sessionId;
        const sess = _cachedLiveSessions.find(s => s.id === sessionId);
        if (sess) _seenMsgCounts[sessionId] = sess.messageCount ?? 0;
        markSessionSeen(sessionId);
        switchTab('live');
        setTimeout(() => selectLiveSession(sessionId), 100);
      } else if (convCard) {
        const convId = convCard.dataset.convId;
        markSessionSeen(convId);
        if (typeof openHistoryDetail === 'function') openHistoryDetail(convId);
      }
    });
    container.addEventListener('mouseenter', e => {
      const card = e.target.closest('[data-session-id],[data-conv-id]');
      if (card) card.style.boxShadow = '0 4px 16px rgba(0,0,0,.1)';
    }, true);
    container.addEventListener('mouseleave', e => {
      const card = e.target.closest('[data-session-id],[data-conv-id]');
      if (card) card.style.boxShadow = 'none';
    }, true);
  }

  _cachedLiveSessions = sessions;
  _refreshDashBadge();

  const seenSessions = _getSeenSessions();

  if (sessions.length === 0 && _cachedConversations.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 16px;color:#9ca3af;">
        <div style="font-size:48px;margin-bottom:16px;">💤</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:6px;">들어온 상담이 없습니다</div>
        <div style="font-size:13px;">고객이 채팅을 시작하면 여기에 표시됩니다</div>
      </div>`;
    return;
  }

  // ── 실시간 상담 섹션 (미확인 우선 정렬) ──
  const sortedSessions = [...sessions].sort((a, b) => {
    const aNew = a.id && !seenSessions.has(a.id) ? 1 : 0;
    const bNew = b.id && !seenSessions.has(b.id) ? 1 : 0;
    return bNew - aNew;
  });
  const liveSection = `
    <div style="font-size:12px;font-weight:700;color:#6b7280;letter-spacing:.05em;margin-bottom:8px;padding-left:4px;">
      🟢 실시간 상담 ${sessions.length > 0 ? `(${sessions.length}개)` : '(없음)'}
    </div>
    ${sessions.length === 0
      ? '<div style="text-align:center;padding:16px;color:#9ca3af;font-size:13px;border:1px dashed #e5e7eb;border-radius:12px;margin-bottom:4px;">현재 진행 중인 상담 없음</div>'
      : sortedSessions.map(s => {
          if (!s.id) return '';
          const isAdmin     = s.mode === 'admin';
          const ago         = timeSince(new Date(s.lastMessageAt));
          const isNew       = !seenSessions.has(s.id);
          const hasNewMsg   = !isNew && (s.messageCount ?? 0) > (_seenMsgCounts[s.id] ?? -1);
          const borderColor = (isNew || hasNewMsg) ? '#ef4444' : '#3b82f6';
          return `
            <div data-session-id="${escAttr(s.id)}"
              style="background:#fff;border:1px solid #f3f4f6;border-left:3px solid ${borderColor};border-radius:14px;padding:16px 18px;
                     cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:14px;margin-bottom:8px;">
              <div style="width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,${isAdmin?'#7c3aed,#a855f7':'#6b7280,#9ca3af'});display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">
                ${isAdmin ? '👩‍💼' : '🤖'}
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:15px;font-weight:700;margin-bottom:3px;display:flex;align-items:center;gap:5px;">
                  ${escAdmin(s.customerName)}
                  ${isNew ? '<span class="new-badge" style="font-size:10px;padding:2px 7px;border-radius:8px;background:#ef4444;color:#fff;font-weight:700;letter-spacing:.03em;">NEW</span>' : ''}
                  ${s.isTest ? '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:#fef3c7;color:#92400e;font-weight:700;">테스트</span>' : ''}
                </div>
                <div style="font-size:12px;color:#6b7280;">💬 ${s.messageCount}개 메시지 · ${ago}</div>
                ${s.tokens ? `<div style="font-size:11px;color:#7c3aed;font-weight:600;margin-top:2px;">🪙 ₩${s.tokens.costKRW.toLocaleString()} · ${s.tokens.totalTokens.toLocaleString()}토큰</div>` : ''}
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
                <span style="font-size:11px;padding:3px 10px;border-radius:10px;font-weight:700;
                  background:${isAdmin ? '#ede9fe' : '#f3f4f6'};
                  color:${isAdmin ? '#7c3aed' : '#6b7280'};">
                  ${isAdmin ? '담당자 상담 중' : 'AI 상담 중'}
                </span>
                <span class="enter-btn" style="font-size:13px;color:${(isNew || hasNewMsg) ? '#ef4444' : '#3b82f6'};font-weight:600;">→ 입장</span>
              </div>
            </div>`;
        }).join('')
    }`;

  // ── 저장된 상담 섹션 (미확인 우선 정렬) ──
  const sortedConvs = [..._cachedConversations].sort((a, b) => {
    const aNew = a.id && !seenSessions.has(a.id) ? 1 : 0;
    const bNew = b.id && !seenSessions.has(b.id) ? 1 : 0;
    return bNew - aNew;
  });
  const convSection = _cachedConversations.length === 0 ? '' : `
    <div style="font-size:12px;font-weight:700;color:#6b7280;letter-spacing:.05em;margin:16px 0 8px;padding-left:4px;">
      📁 저장된 상담 (최근 ${_cachedConversations.length}건)
    </div>
    ${sortedConvs.map(c => {
      if (!c.id) return '';
      const isNew       = !seenSessions.has(c.id);
      const borderColor = isNew ? '#ef4444' : '#3b82f6';
      const savedAt     = c.saved_at
        ? new Date(c.saved_at).toLocaleString('ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
        : '-';
      return `
        <div data-conv-id="${escAttr(c.id)}"
          style="background:#fff;border:1px solid #f3f4f6;border-left:3px solid ${borderColor};border-radius:14px;padding:14px 18px;
                 cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:14px;margin-bottom:8px;">
          <div style="width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#fbbf24);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">
            📁
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:15px;font-weight:700;margin-bottom:3px;display:flex;align-items:center;gap:5px;">
              ${escAdmin(getConvLabel(c))}
              ${isNew ? '<span class="new-badge" style="font-size:10px;padding:2px 7px;border-radius:8px;background:#ef4444;color:#fff;font-weight:700;letter-spacing:.03em;">NEW</span>' : ''}
            </div>
            <div style="font-size:12px;color:#6b7280;">📍 ${escAdmin(c.region || '-')} · 🪞 ${escAdmin(c.layout || '-')} · 💬 ${c.message_count || 0}개</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
            <span style="font-size:11px;color:#9ca3af;">${savedAt}</span>
            <span class="detail-btn" style="font-size:13px;color:${isNew ? '#ef4444' : '#3b82f6'};font-weight:600;">→ 상세</span>
          </div>
        </div>`;
    }).join('')}`;

  container.innerHTML = liveSection + convSection;
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

  // 스크롤 이벤트 리스너 초기화 (1회)
  initLiveMsgsScrollListener();

  // 첫 진입 시 항상 맨 아래로 (레이아웃 계산 후)
  requestAnimationFrame(() => {
    const msgs = document.getElementById('liveMsgs');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
    updateScrollBtn(false);
  });

  liveMsgPollTimer = setInterval(fetchLiveSessionMsgs, 1000);
  fetchLiveSessions();

  // 모바일: 채팅 패널 전체화면으로 전환 후 스크롤
  if (window.innerWidth < 768) {
    document.querySelector('.live-split')?.classList.add('session-selected');
    setTimeout(() => {
      const msgs = document.getElementById('liveMsgs');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }, 50);
  }
}

// 모바일: 목록으로 뒤로가기
window.liveGoBack = function() {
  document.querySelector('.live-split')?.classList.remove('session-selected');
  clearInterval(liveMsgPollTimer);
  liveMsgPollTimer = null;
  liveSelectedId = null;
};

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

/* ── hex 색상 → rgba 변환 (브라우저 호환성 보장) ── */
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ── 단가 계산 (참고용 개략 견적) ── */
const _OPT_PRICES = [
  { re: /이불긴장/,                                price: 350_000, label: '이불긴장' },
  { re: /이불장/,                                  price: 200_000, label: '이불장' },
  { re: /화장대/,                                  price: 250_000, label: '화장대' },
  { re: /아일랜드장.{0,5}손잡이|손잡이.{0,5}아일랜드장/, price: 219_000, label: '아일랜드장(손잡이)' },
  { re: /아일랜드장/,                              price: 169_000, label: '아일랜드장' },
  { re: /거울장/,                                  price: 169_000, label: '거울장' },
  { re: /4단\s*서랍/,                              price: 160_000, label: '4단서랍' },
  { re: /3단\s*서랍/,                              price: 119_000, label: '3단서랍' },
  { re: /2단\s*서랍/,                              price:  99_000, label: '2단서랍' },
  { re: /서랍(?!장)/,                              price:  99_000, label: '서랍(2단추정)' },
  { re: /바지걸이/,                                price: 138_000, label: '바지걸이' },
  { re: /디바이더/,                                price:  69_000, label: '디바이더' },
  { re: /7단\s*코너/,                              price: 120_000, label: '7단코너선반' },
  { re: /6단\s*코너/,                              price:  90_000, label: '6단코너선반' },
  { re: /5단\s*코너/,                              price:  60_000, label: '5단코너선반' },
  { re: /7단\s*선반/,                              price:  80_000, label: '7단선반' },
  { re: /6단\s*선반/,                              price:  60_000, label: '6단선반' },
  { re: /5단\s*선반/,                              price:  40_000, label: '5단선반' },
];

function calcEstimate(fields) {
  const sizeRaw = fields.공간사이즈 || '';
  const layout  = fields.형태 || '';
  const optRaw  = fields.추가옵션 || '';

  // 공간사이즈에서 3자리 이상 숫자 추출 (mm 단위 가정)
  const nums = sizeRaw.replace(/[×xX×]/g, ' ').match(/\d{3,4}/g) || [];
  const w = parseInt(nums[0] || '0', 10); // 가로
  const d = parseInt(nums[1] || '0', 10); // 세로(깊이)

  let totalMm = 0;
  if (w > 0) {
    if (/ㄷ|U자|U형/.test(layout))       totalMm = w + d * 2;
    else if (/ㄱ|L자|L형/.test(layout))  totalMm = w + d;
    else if (/ㅁ|사방/.test(layout))     totalMm = (w + d) * 2;
    else                                 totalMm = w; // 일자 or unknown
  }

  const totalCm = totalMm / 10;
  const hangerUnits = Math.ceil(totalCm / 10);
  const hangerPrice = hangerUnits * 10_000;

  // 옵션 파싱 (없음/없어요 → skip)
  const optItems = [];
  if (optRaw && !/없어요|없음|없습|아니오|아니요/i.test(optRaw)) {
    for (const o of _OPT_PRICES) {
      if (o.re.test(optRaw)) optItems.push(o);
    }
  }
  const optTotal = optItems.reduce((s, o) => s + o.price, 0);
  const total = hangerPrice + optTotal;

  return { totalCm, hangerPrice, optItems, optTotal, total, hasDim: totalMm > 0 };
}

/**
 * 주문서 없을 때 대화 전체에서 필드 추출 (베스트에포트)
 */
function extractFieldsFromConversation(messages) {
  const msgs = messages || [];
  // 극단적으로 긴 대화 방어 — 앞 20000자만 사용
  const allText  = msgs.map(m => String(m.content || '')).join('\n').slice(0, 20000);
  const userText = msgs.filter(m => m.role === 'user').map(m => String(m.content || '')).join('\n').slice(0, 20000);
  const botText  = msgs.filter(m => m.role === 'assistant').map(m => String(m.content || '')).join('\n').slice(0, 20000);

  // 설치지역: 시·도 + 시·군·구 → 단독 시·군·구 순서로 추출
  let 설치지역 = null;
  const regionM = allText.match(
    /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\n,]{0,10}?([가-힣]+[시군구])/
  );
  if (regionM) {
    // regionM[0] 대신 캡처그룹 조합으로 불필요한 조사 제거
    설치지역 = (regionM[1] + ' ' + regionM[2]).trim().slice(0, 50);
  } else {
    // 단어 경계 확인 — "보여주시면" 같은 오탐 방지, 최소 3자 이상
    const cityM = allText.match(/(?<![가-힣])([가-힣]{3,6}[시군구])(?![가-힣])/);
    if (cityM) 설치지역 = cityM[1];
  }

  // 형태
  let 형태 = null;
  const shapeM = allText.match(/(ㄷ자형|ㄱ자형|11자형|일자형|ㄴ자형|ㄷ\s*자|ㄱ\s*자|일\s*자)/);
  if (shapeM) 형태 = shapeM[1].replace(/\s/g, '');

  // 공간사이즈: 가로/세로/높이 mm 패턴 우선, 없으면 3~4자리 숫자 3개
  let 공간사이즈 = null;
  const sizeM1 = allText.match(/가로[:\s]*(\d{3,4})[^\d]{0,20}세로[:\s]*(\d{3,4})[^\d]{0,20}높이[:\s]*(\d{3,4})/);
  if (sizeM1) {
    공간사이즈 = `${sizeM1[1]} × ${sizeM1[2]} × ${sizeM1[3]} (mm)`;
  } else {
    const sizeM2 = allText.match(/(\d{3,4})[^\d\n]{0,15}(\d{3,4})[^\d\n]{0,15}(\d{3,4})/);
    if (sizeM2) 공간사이즈 = `${sizeM2[1]} × ${sizeM2[2]} × ${sizeM2[3]}`;
  }

  // 추가옵션
  const optPairs = [
    [/거울장/, '거울장'], [/아일랜드장/, '아일랜드장'], [/화장대/, '화장대'],
    [/[2-4]단\s*서랍|서랍장?/, '서랍'], [/이불장/, '이불장'],
    [/바지걸이/, '바지걸이'], [/디바이더/, '디바이더'],
  ];
  const foundOpts = optPairs.filter(([re]) => re.test(allText)).map(([, label]) => label);
  const 추가옵션 = foundOpts.length ? foundOpts.join(', ') : null;

  // 선반색상 (복합어 우선)
  const shelfColors = ['다크월넛', '화이트오크', '스톤그레이', '진그레이', '솔리드화이트'];
  const 선반색상 = shelfColors.find(c => allText.includes(c)) || null;

  // 프레임색상 (화이트오크와 혼동 방지)
  let 프레임색상 = null;
  if (/블랙/.test(allText))              프레임색상 = '블랙';
  else if (/실버/.test(allText))         프레임색상 = '실버';
  else if (/골드/.test(allText))         프레임색상 = '골드';
  else if (/화이트(?!오크)/.test(allText)) 프레임색상 = '화이트';

  // 이름: 고객이 직접 말했거나 bot이 문장 맨 앞에서 "OO님" 으로 부른 경우만 인정
  // "안녕하세요 고객님"의 "하세요" 같은 오탐 방지
  let 이름 = null;
  const nameFromUser = userText.match(/(?:이름|성함)[은는이가]?\s*([가-힣]{2,4})/);
  if (nameFromUser && !/고객|모르|없|미정|비밀/.test(nameFromUser[1])) {
    이름 = nameFromUser[1];
  } else {
    // bot 메시지 줄 첫 단어 + 님 패턴 (예: "홍길동님, 안녕하세요")
    const nameFromBot = botText.match(/^([가-힣]{2,4})\s*님[,\s!]/m);
    if (nameFromBot) 이름 = nameFromBot[1];
  }

  // 연락처: 휴대폰 번호
  let 연락처 = null;
  const phoneM = allText.match(/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/);
  if (phoneM) 연락처 = phoneM[0].replace(/\s/g, '');

  return { 이름, 연락처, 설치지역, 공간사이즈, 형태, 추가옵션, 프레임색상, 선반색상, 요청사항: null };
}

/**
 * AI가 출력한 주문서/견적서에서 필드 추출.
 * 주문서 없으면 대화 전체에서 베스트에포트 추출.
 */
function extractSessionFields(messages) {
  const msgs = messages || [];
  const get = (text, re) => {
    const m = text.match(re);
    return (m && m[1] != null) ? m[1].trim().slice(0, 200) : null;
  };

  // '총 합계' 또는 '주문서'가 포함된 AI 메시지만 주문서로 인정 (최신 우선)
  const orderMsg = [...msgs].reverse().find(m =>
    m.role === 'assistant' && m.content &&
    (m.content.includes('총 합계') || m.content.includes('주문서'))
  );

  if (orderMsg) {
    const text = orderMsg.content;
    const sizeM = text.match(/좌측[:\s]+([^\n/]{1,100})\/\s*정면[:\s]+([^\n/]{1,100})\/\s*우측[:\s]+([^\n/]{1,100})/);
    const 공간사이즈 = sizeM
      ? `좌측 ${sizeM[1].trim()} / 정면 ${sizeM[2].trim()} / 우측 ${sizeM[3].trim()}`
      : get(text, /(?:공간\s*사이즈|사이즈|치수)[:\s*]+([^\n]+)/);
    // ReDoS 방어: 매칭 범위를 최대 5000자로 제한
    const safeText = text.slice(0, 5000);
    const optM = safeText.match(/구성 옵션[^\n]*\n([\s\S]{0,1000}?)(?:\*\*총 합계|총 합계)/);
    const 추가옵션 = optM
      ? optM[1].trim().replace(/\n/g, ' / ').slice(0, 200)
      : get(text, /(?:추가\s*옵션|옵션)[:\s]+([^\n]+)/);
    return {
      이름:       get(text, /성함[:\s]+([^\n]+)/),
      연락처:     get(text, /연락처[:\s]+([^\n]+)/),
      설치지역:   get(text, /(?:주소|설치\s*지역|지역)[:\s]+([^\n]+)/),
      공간사이즈,
      형태:       get(text, /(?:설치\s*형태|드레스룸\s*형태|형태)[:\s]+([^\n]+)/),
      추가옵션,
      프레임색상: get(text, /프레임\s*색상[:\s]+([^\n]+)/),
      선반색상:   get(text, /선반\s*색상[:\s]+([^\n]+)/),
      요청사항:   get(text, /요청\s*사항[:\s]+([^\n]+)/),
    };
  }

  // 주문서 없음 → 대화 전체에서 베스트에포트 추출
  return extractFieldsFromConversation(msgs);
}

// 고객 관심 키워드 — 매 호출마다 재생성하지 않도록 모듈 레벨에 정의
const _SUMMARY_KW = [
  [/거울장/, '거울장'], [/서랍/, '서랍'], [/화장대/, '화장대'],
  [/이불장/, '이불장'], [/바지걸이/, '바지걸이'], [/디바이더/, '디바이더'],
  [/ㄱ자|L자|L형/, 'ㄱ자형'], [/ㄷ자|U자|U형/, 'ㄷ자형'],
  [/ㅁ자|사방/, 'ㅁ자형'], [/일자/, '일자형'],
  [/3[dD]|도면|예시\s*이미지/, '3D 도면 요청'], [/할인/, '할인 문의'],
  [/신규\s*아파트|신축/, '신규아파트'], [/설치\s*기사|설치비/, '설치 문의'],
];

/**
 * 대화 내용을 분석해 상담 단계·관심 키워드·마지막 AI 응답 미리보기 반환
 */
function buildConversationSummary(messages) {
  const msgs = messages || [];
  if (!msgs.length) return null;
  const userMsgs = msgs.filter(m => m.role === 'user');
  const asMsgs   = msgs.filter(m => m.role === 'assistant');

  const lastAi  = [...asMsgs].pop()?.content || '';
  const allUser = userMsgs.map(m => m.content || '').join(' ');

  // 상담 단계 (치수 > 옵션 순서로 판별해야 오분류 방지)
  let stage = '초기 상담';
  let stageColor = '#6b7280';
  if (lastAi.includes('총 합계') || lastAi.includes('주문서')) {
    stage = '견적 완료';    stageColor = '#16a34a';
  } else if (lastAi.includes('프레임') && lastAi.includes('색상')) {
    stage = '색상 확인 중'; stageColor = '#7c3aed';
  } else if (/mm|치수|사이즈|좌측|정면|우측/.test(lastAi)) {
    stage = '치수 수집 중'; stageColor = '#d97706';
  } else if (lastAi.includes('옵션')) {
    stage = '옵션 확인 중'; stageColor = '#7c3aed';
  } else if (userMsgs.length >= 3) {
    stage = '정보 수집 중'; stageColor = '#d97706';
  }

  const keywords = _SUMMARY_KW.filter(([re]) => re.test(allUser)).map(([, label]) => label);

  // 마지막 AI 응답 미리보기 — escAdmin으로 XSS 방어 후 렌더링할 것
  const rawPreview = lastAi.replace(/\*\*/g, '').replace(/\n+/g, ' ').trim();
  const previewTruncated = rawPreview.length > 120;
  const preview = previewTruncated ? rawPreview.slice(0, 120) : rawPreview;

  return { stage, stageColor, keywords, preview, previewTruncated, userCount: userMsgs.length, aiCount: asMsgs.length };
}

function toggleLiveSummary() {
  const body    = document.getElementById('liveSummaryBody');
  const chevron = document.getElementById('liveSummaryChevron');
  if (!body) return;
  const collapsed = body.style.display === 'none';
  body.style.display    = collapsed ? '' : 'none';
  chevron.style.transform = collapsed ? '' : 'rotate(180deg)';
}

function renderLiveSummary(sess) {
  const wrap = document.getElementById('liveSummary');
  if (!wrap) return;
  const f = extractSessionFields(sess.messages || []);
  const startedAt = sess.startedAt
    ? new Date(sess.startedAt).toLocaleString('ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
    : '-';
  const modeLabel = sess.mode === 'admin' ? '<span style="color:#7c3aed;font-weight:700;">👩‍💼 담당자 상담 중</span>' : '<span style="color:#22c55e;font-weight:700;">🤖 AI 응답 중</span>';

  const row = (label, val, required = false) => {
    const empty = !val || val === '-' || val.trim() === '';
    const display = empty ? `<span style="color:#d1d5db;">미수집</span>` : escAdmin(val.length > 60 ? val.slice(0, 60) + '…' : val);
    const dot = required && empty ? `<span style="width:6px;height:6px;border-radius:50%;background:#ef4444;display:inline-block;margin-right:4px;flex-shrink:0;"></span>` : '';
    return `<div style="display:flex;gap:6px;align-items:baseline;min-width:0;padding:2px 0;">
      <span style="font-size:11px;color:#9ca3af;white-space:nowrap;min-width:64px;flex-shrink:0;">${dot}${label}</span>
      <span style="font-size:12.5px;color:#1f2937;word-break:break-all;">${display}</span>
    </div>`;
  };

  const body = document.getElementById('liveSummaryBody');
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px;">
      ${row('성함', f.이름, true)}
      ${row('연락처', f.연락처, true)}
      ${row('설치지역', f.설치지역, true)}
      ${row('공간사이즈', f.공간사이즈, true)}
      ${row('드레스룸형태', f.형태, true)}
      <div style="display:flex;gap:6px;align-items:baseline;padding:2px 0;">
        <span style="font-size:11px;color:#9ca3af;white-space:nowrap;min-width:64px;flex-shrink:0;">접수일시</span>
        <span style="font-size:12.5px;color:#1f2937;">${startedAt}</span>
      </div>
    </div>
    <div style="margin-top:6px;padding-top:6px;border-top:1px dashed #e5e7eb;display:flex;gap:6px;align-items:baseline;">
      <span style="font-size:11px;color:#9ca3af;white-space:nowrap;min-width:64px;flex-shrink:0;">현재상태</span>
      <span style="font-size:12.5px;">${modeLabel}</span>
    </div>
    ${(f.추가옵션 || f.프레임색상 || f.선반색상 || f.요청사항) ? `
    <div style="margin-top:6px;padding-top:6px;border-top:1px dashed #e5e7eb;display:grid;grid-template-columns:1fr 1fr;gap:0 12px;">
      ${f.추가옵션  ? row('추가옵션',   f.추가옵션)  : ''}
      ${f.프레임색상 ? row('프레임색상', f.프레임색상) : ''}
      ${f.선반색상  ? row('선반색상',   f.선반색상)  : ''}
      ${f.요청사항  ? row('요청사항',   f.요청사항)  : ''}
    </div>` : ''}
    ${(() => {
      const est = calcEstimate(f);
      if (!est.hasDim && est.optItems.length === 0) return '';
      const fmt = n => n.toLocaleString('ko-KR') + '원';
      const hangerRow = est.hasDim
        ? `<div style="display:flex;justify-content:space-between;"><span style="color:#6b7280;">기본행거 ${Math.round(est.totalCm)}cm</span><span>${fmt(est.hangerPrice)}</span></div>`
        : '';
      const optRows = est.optItems.map(o =>
        `<div style="display:flex;justify-content:space-between;"><span style="color:#6b7280;">${o.label}</span><span>${fmt(o.price)}</span></div>`
      ).join('');
      const totalRow = `<div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px solid #d1d5db;margin-top:4px;padding-top:4px;"><span>합계 (참고)</span><span style="color:#c9a96e;">${fmt(est.total)}</span></div>`;
      return `
      <div style="margin-top:8px;padding:8px 10px;background:#fffbf0;border:1px solid #e8d5a3;border-radius:8px;font-size:12px;line-height:1.8;">
        <div style="font-size:11px;font-weight:600;color:#a07830;margin-bottom:4px;">💰 예상 단가 (참고용)</div>
        ${hangerRow}${optRows}${totalRow}
        <div style="font-size:10px;color:#b0915a;margin-top:3px;">배송비 별도 · 도면 확정 전 기준</div>
      </div>`;
    })()}
    ${(() => {
      const cs = buildConversationSummary(sess.messages || []);
      if (!cs) return '';
      const kwHtml = cs.keywords.length
        ? cs.keywords.map(k => `<span style="font-size:10px;padding:1px 7px;background:#f3f4f6;border-radius:8px;color:#374151;">${escAdmin(k)}</span>`).join('')
        : '';
      const previewHtml = cs.preview
        ? `<div style="font-size:11.5px;color:#6b7280;line-height:1.5;border-left:2px solid #e5e7eb;padding-left:6px;margin-top:4px;">${escAdmin(cs.preview)}${cs.previewTruncated ? '…' : ''}</div>`
        : '';
      return `
      <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #e5e7eb;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:${hexToRgba(cs.stageColor, 0.12)};color:${escAttr(cs.stageColor)};letter-spacing:-.2px;">${escAdmin(cs.stage)}</span>
          <span style="font-size:10.5px;color:#9ca3af;">고객 ${cs.userCount}회 · AI ${cs.aiCount}회</span>
        </div>
        ${kwHtml ? `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px;">${kwHtml}</div>` : ''}
        ${previewHtml}
      </div>`;
    })()}
  `;
  wrap.style.display = '';
}

/**
 * 오른쪽 채팅 패널 렌더링
 */
function renderLiveChatPanel(sess) {
  const isAdmin = sess.mode === 'admin';
  liveAdminMode = isAdmin;

  // wasAtBottom을 DOM 변경(renderLiveSummary) 전에 먼저 측정
  const msgs = document.getElementById('liveMsgs');
  const wasAtBottom = msgs.scrollTop + msgs.clientHeight >= msgs.scrollHeight - 30;

  renderLiveSummary(sess);

  document.getElementById('livePanelTitle').textContent =
    `💬 ${sess.customerName || '(이름 미수집)'}`;
  const tk = (window._liveTokenMap || {})[sess.id];
  const tkStr = tk ? ` · 🪙 ₩${tk.costKRW.toLocaleString()} (${tk.totalTokens.toLocaleString()}토큰)` : '';
  document.getElementById('livePanelMeta').textContent =
    `세션 ${sess.id.slice(0, 20)}… · 메시지 ${sess.messages.length}개${tkStr}`;

  document.getElementById('livePanelActions').innerHTML = (isAdmin
    ? `<button class="btn btn-outline" onclick="releaseSession()" style="font-size:13px;">🤖 AI에게 넘기기</button>`
    : `<button class="btn btn-primary" onclick="takeoverSession()" style="font-size:13px;">👩‍💼 난입하기</button>`)
    + `<button class="btn btn-outline" onclick="saveConversationManual()" style="font-size:13px;">💾 저장</button>`;

  msgs.innerHTML = (sess.messages || []).map(m => {
    const isUser     = m.role === 'user';
    const isAdminMsg = m.fromAdmin;

    /* 답장 인용 패턴 감지 */
    const replyMatch = m.content?.match(/^\[답장: (.+?)\]\n([\s\S]*)$/);
    let replyQuoteHtml = '';
    let rawContent = m.content || '';
    if (replyMatch) {
      replyQuoteHtml = `<div style="background:rgba(0,0,0,.08);border-left:3px solid rgba(0,0,0,.25);border-radius:6px;padding:4px 8px;margin-bottom:5px;font-size:11.5px;opacity:.82;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escAdmin(replyMatch[1])}</div>`;
      rawContent = replyMatch[2];
    }

    /* 이미지/파일 첨부 패턴 감지 */
    const imgMatch  = rawContent.match(/^\[이미지\]\n(https?:\/\/\S+)$/);
    const fileMatch = rawContent.match(/^\[파일: ([^\]]+)\]\n(https?:\/\/\S+)$/);
    let bubbleInner;
    if (imgMatch) {
      const rawUrl  = imgMatch[1];
      const safeUrl = escAttr(rawUrl);
      if (window._failedImgUrls.has(rawUrl)) {
        bubbleInner = replyQuoteHtml + `<span style="font-size:12px;color:#9ca3af;">[이미지 없음]</span>`;
      } else {
        const jsEscRawUrl = rawUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        bubbleInner = replyQuoteHtml + `<img src="${safeUrl}" style="max-width:200px;border-radius:8px;display:block;cursor:pointer;" onclick="window.open('${safeUrl}','_blank','noopener,noreferrer')" onerror="this.style.display='none';window._failedImgUrls.add('${jsEscRawUrl}')">` +
          `<button onclick="window._downloadImg('${safeUrl}')" class="img-download-btn">⬇ 다운로드</button>`;
      }
    } else if (fileMatch) {
      const fname = fileMatch[1];
      const furl  = fileMatch[2];
      const ext   = fname.split('.').pop().toLowerCase();
      if (/^(mp4|webm|ogg|mov)$/.test(ext)) {
        bubbleInner = replyQuoteHtml + `<video src="${escAttr(furl)}" controls preload="metadata" style="max-width:220px;border-radius:8px;display:block;"></video>`;
      } else if (/^(mp3|wav|ogg|m4a|aac)$/.test(ext)) {
        bubbleInner = replyQuoteHtml + `<audio src="${escAttr(furl)}" controls preload="metadata" style="max-width:220px;display:block;"></audio>`;
      } else {
        bubbleInner = replyQuoteHtml + `📎 <a href="${escAttr(furl)}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline">${escAdmin(fname)}</a>`;
      }
    } else {
      bubbleInner = replyQuoteHtml + (isAdminMsg ? '<span style="font-size:10px;color:#7c3aed;font-weight:700;display:block;margin-bottom:3px;">담당자</span>' : '') + escAdmin(rawContent);
    }

    const encodedContent = encodeURIComponent(m.content || '');
    const timeStr = (m.ts || m.time) ? fmtLiveTime(m.ts || m.time) : '';
    const timeBadge = timeStr ? `<span style="font-size:10.5px;color:#9ca3af;white-space:nowrap;padding-bottom:3px;flex-shrink:0;">${timeStr}</span>` : '';

    if (isUser) {
      return `
        <div class="live-msg-row" data-role="user" data-content="${encodedContent}"
             style="display:flex;justify-content:flex-end;gap:8px;align-items:flex-start;margin-bottom:8px;">
          <div style="display:flex;align-items:flex-end;gap:5px;max-width:calc(100% - 48px);min-width:0;">
            ${timeBadge}
            <div style="padding:${imgMatch ? '6px' : '10px 13px'};font-size:14.5px;line-height:1.6;word-break:break-word;white-space:pre-wrap;border-radius:16px 16px 2px 16px;background:#7c3aed;color:#fff;box-shadow:0 1px 2px rgba(0,0,0,.08);min-width:0;overflow-wrap:break-word;">${bubbleInner}</div>
          </div>
          <div style="width:40px;height:40px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">👤</div>
        </div>
      `;
    } else {
      const senderName = isAdminMsg ? '담당자' : '루마네';
      const avBg = isAdminMsg ? 'linear-gradient(135deg,#7c3aed,#a855f7)' : 'linear-gradient(135deg,#6b7280,#9ca3af)';
      const avIcon = isAdminMsg ? '👩‍💼' : '🤖';
      return `
        <div class="live-msg-row" data-role="${isAdminMsg ? 'admin' : 'bot'}" data-content="${encodedContent}"
             style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;">
          <div style="width:40px;height:40px;border-radius:50%;background:${avBg};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;margin-top:20px;">${avIcon}</div>
          <div style="flex:1;min-width:0;overflow:hidden;">
            <div style="font-size:12.5px;font-weight:700;color:#111827;margin-bottom:4px;padding-left:2px;">${senderName}</div>
            <div style="display:flex;align-items:flex-end;gap:5px;">
              <div style="padding:${imgMatch ? '6px' : '10px 13px'};font-size:14.5px;line-height:1.6;word-break:break-word;white-space:pre-wrap;border-radius:2px 16px 16px 16px;background:${isAdminMsg ? '#ede9fe' : '#fff'};color:#1a1a2e;box-shadow:0 1px 2px rgba(0,0,0,.08);min-width:0;overflow-wrap:break-word;max-width:100%;">${bubbleInner}</div>
              ${timeBadge}
            </div>
          </div>
        </div>
      `;
    }
  }).join('');

  /* 고객 타이핑 표시 */
  const existingTyping = msgs.querySelector('.customer-typing-indicator');
  if (existingTyping) existingTyping.remove();
  if (sess.customerTyping) {
    const typingEl = document.createElement('div');
    typingEl.className = 'customer-typing-indicator';
    typingEl.style.cssText = 'display:flex;align-items:flex-end;gap:8px;justify-content:flex-start;margin-bottom:8px;';
    typingEl.innerHTML = `
      <div style="width:40px;height:40px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">👤</div>
      <div style="padding:10px 14px;background:#fff;border-radius:2px 16px 16px 16px;box-shadow:0 1px 2px rgba(0,0,0,.08);display:flex;gap:4px;align-items:center;">
        <span style="width:6px;height:6px;background:#9ca3af;border-radius:50%;animation:typingDot .9s infinite;display:inline-block;"></span>
        <span style="width:6px;height:6px;background:#9ca3af;border-radius:50%;animation:typingDot .9s .2s infinite;display:inline-block;"></span>
        <span style="width:6px;height:6px;background:#9ca3af;border-radius:50%;animation:typingDot .9s .4s infinite;display:inline-block;"></span>
      </div>
    `;
    msgs.appendChild(typingEl);
  }

  if (wasAtBottom) {
    msgs.scrollTop = msgs.scrollHeight;
    updateScrollBtn(false);
  } else {
    /* 스크롤 위에 있을 때: 새 메시지 미리보기 버튼 표시 */
    const lastMsg = (sess.messages || []).filter(m => m.role === 'user').slice(-1)[0];
    const preview = lastMsg ? (lastMsg.content || '').slice(0, 30) : '새 메시지';
    updateScrollBtn(true, preview);
  }

  /* 검색 중이면 하이라이트 재적용 */
  if (_adminSearchOpen) {
    const inp = document.getElementById('adminSearchInput');
    if (inp?.value.trim()) runAdminSearch(inp.value.trim());
  }

  const input       = document.getElementById('liveInput');
  const sendBtn     = document.getElementById('liveSendBtn');
  const uploadBtn   = document.getElementById('adminUploadBtn');
  input.disabled = !isAdmin;
  if (uploadBtn)   uploadBtn.disabled   = !isAdmin;
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
 * 대화 수동 저장
 */
async function saveConversationManual() {
  if (!liveSelectedId) {
    showToast('선택된 세션이 없습니다.', 'error');
    return;
  }
  try {
    const res = await fetch(`${SERVER}/api/admin/save-conversation`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ sessionId: liveSelectedId }),
    });
    if (!res.ok) {
      let detail = '';
      try { const d = await res.json(); detail = d.error || ''; } catch(_) {}
      // 세션 만료 시: 대화는 실시간 자동저장되어 있으므로 목록 갱신으로 확인
      if (detail === '세션 없음' || res.status === 404) {
        showToast('💾 자동 저장된 상담을 확인합니다.', 'success');
        await fetchDashboardConversations();
        renderDashboardSessions(_cachedLiveSessions);
        return;
      }
      throw new Error(detail || res.status);
    }
    showToast('💾 대화가 저장되었습니다.', 'success');
    await fetchDashboardConversations();
    renderDashboardSessions(_cachedLiveSessions);
  } catch (err) {
    showToast(`❌ 저장 실패: ${err.message}`, 'error');
  }
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

/* ── 이미지 자동 압축 (admin용, ui.js와 동일 로직) ── */
async function compressImageIfNeeded(file) {
  if (!file.type.startsWith('image/')) return file;
  if (file.size < 300 * 1024) return file;
  return new Promise(resolve => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      const MAX = 1920;
      let { width: w, height: h } = img;
      if (w > MAX || h > MAX) { const r = Math.min(MAX/w, MAX/h); w=Math.round(w*r); h=Math.round(h*r); }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      canvas.toBlob(blob => {
        if (!blob || blob.size >= file.size) { resolve(file); return; }
        const ext = mime === 'image/png' ? 'png' : 'jpg';
        const name = (file.name || 'image').replace(/\.[^.]+$/, '') + '.' + ext;
        resolve(new File([blob], name, { type: mime }));
      }, mime, 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(file); };
    img.src = blobUrl;
  });
}

/* ── admin 첨부 칩 상태 ── */
window._failedImgUrls = new Set(); // 404 이미지 URL 캐시 — 폴링 재요청 방지
window._downloadImg = async function(url) {
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    const a    = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const ext  = blob.type === 'image/png' ? 'png' : 'jpg';
    a.download = `드레스룸_예시.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

function fmtLiveTime(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const h = d.getHours(), m = d.getMinutes();
    return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(m).padStart(2, '0')}`;
  } catch { return ''; }
}
let adminPendingFile      = null;
let adminPendingObjectUrl = null;

async function showAdminAttachBar(rawFile) {
  const file = await compressImageIfNeeded(rawFile);
  adminPendingFile = file;
  if (adminPendingObjectUrl) URL.revokeObjectURL(adminPendingObjectUrl);
  adminPendingObjectUrl = URL.createObjectURL(file);

  const bar = document.getElementById('adminAttachBar');
  if (!bar) return;

  const isImg = file.type.startsWith('image/');
  bar.innerHTML = (isImg
    ? `<img src="${escAttr(adminPendingObjectUrl)}" id="adminAttachThumb" style="width:44px;height:44px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;flex-shrink:0;cursor:zoom-in;" alt="" title="클릭하면 크게 보기">`
    : `<span style="font-size:22px;flex-shrink:0;">📎</span>`) +
    `<span style="font-size:12px;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;">${escAdmin(file.name || 'screenshot.png')}</span>
     <button id="adminAttachRemove" style="flex-shrink:0;background:none;border:none;font-size:14px;color:#9ca3af;cursor:pointer;padding:4px 6px;border-radius:6px;">✕</button>`;

  bar.style.display = 'flex';

  if (isImg) {
    document.getElementById('adminAttachThumb').addEventListener('click', () => {
      showAdminLightbox(adminPendingObjectUrl);
    });
  }

  document.getElementById('adminAttachRemove').addEventListener('click', () => {
    clearAdminPendingFile();
    document.getElementById('liveInput')?.focus();
  });
  refreshAdminSendBtn();
}

function showAdminLightbox(src) {
  if (!src) return;
  document.getElementById('adminLightbox')?.remove();
  const lb = document.createElement('div');
  lb.id = 'adminLightbox';
  lb.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:20px;';
  lb.innerHTML = `<img src="${escAttr(src)}" style="max-width:100%;max-height:100%;border-radius:10px;object-fit:contain;box-shadow:0 8px 40px rgba(0,0,0,.6);">`;
  lb.addEventListener('click', () => lb.remove());
  document.body.appendChild(lb);
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
  const active = liveAdminMode && liveSelectedId && (input?.value.trim() || adminPendingFile);
  btn.disabled = !active;
  btn.style.opacity = active ? '1' : '0.45';
}

/**
 * admin → 고객 메시지 전송
 */
async function sendAdminMsg() {
  const input  = document.getElementById('liveInput');
  let text     = input?.value.trim() || '';
  const hasPending = !!adminPendingFile;
  if ((!text && !hasPending) || !liveSelectedId || !liveAdminMode) return;

  /* 답장 인용 텍스트 앞에 붙이기 */
  if (_adminReplyContent && text) {
    const roleLabel = ''; // 서버에 그냥 텍스트로 전송 (UI에서만 구분)
    const preview   = _adminReplyContent.length > 40 ? _adminReplyContent.slice(0, 40) + '…' : _adminReplyContent;
    text = `[답장: ${preview}]\n${text}`;
  }
  clearAdminReplyBar();
  clearTimeout(_typingTimer);
  sendAdminTyping(false);

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
/* ── 타이핑 상태 전송 ── */
let _typingTimer = null;
function sendAdminTyping(isTyping) {
  if (!liveSelectedId) return;
  fetch(`${SERVER}/api/admin/typing`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ sessionId: liveSelectedId, typing: isTyping }),
  }).catch(() => {});
}

function initAdminPaste() {
  const input = document.getElementById('liveInput');
  if (!input) return;

  input.addEventListener('input', () => {
    refreshAdminSendBtn();
    // 타이핑 중 → true 전송, 2초 뒤 멈추면 false
    sendAdminTyping(true);
    clearTimeout(_typingTimer);
    _typingTimer = setTimeout(() => sendAdminTyping(false), 2000);
  });

  input.addEventListener('paste', (e) => {
    const items     = Array.from(e.clipboardData?.items || []);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (file) showAdminAttachBar(file);
  });
}

/* ── admin 답장 바 ── */
let _adminReplyContent = null;

function showAdminReplyBar(role, content) {
  _adminReplyContent = content;
  const bar     = document.getElementById('adminReplyBar');
  const label   = document.getElementById('adminReplyLabel');
  const preview = document.getElementById('adminReplyPreview');
  if (!bar) return;
  const roleLabel = role === 'user' ? '고객' : role === 'admin' ? '담당자' : 'AI';
  label.textContent   = roleLabel + '에게 답장';
  preview.textContent = content.length > 60 ? content.slice(0, 60) + '…' : content;
  bar.style.display = 'flex';
  document.getElementById('liveInput')?.focus();
}

function clearAdminReplyBar() {
  _adminReplyContent = null;
  const bar = document.getElementById('adminReplyBar');
  if (bar) bar.style.display = 'none';
}

/* ── admin 채팅 검색 ── */
let _adminSearchMatches = [];
let _adminSearchIdx     = -1;
let _adminSearchOpen    = false;

function toggleAdminSearch() {
  _adminSearchOpen ? closeAdminSearch() : openAdminSearch();
}

function openAdminSearch() {
  _adminSearchOpen = true;
  const bar = document.getElementById('adminSearchBar');
  if (bar) { bar.style.display = 'flex'; }
  document.getElementById('adminSearchInput')?.focus();
}

function closeAdminSearch() {
  _adminSearchOpen = false;
  clearAdminSearchHighlights();
  _adminSearchMatches = [];
  _adminSearchIdx = -1;
  const bar = document.getElementById('adminSearchBar');
  if (bar) bar.style.display = 'none';
  const inp = document.getElementById('adminSearchInput');
  if (inp) inp.value = '';
  updateAdminSearchCount(0, 0);
}

function initAdminSearch() {
  const inp  = document.getElementById('adminSearchInput');
  const prev = document.getElementById('adminSearchPrev');
  const next = document.getElementById('adminSearchNext');
  const cls  = document.getElementById('adminSearchClose');
  if (!inp) return;
  inp.addEventListener('input', () => runAdminSearch(inp.value.trim()));
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); stepAdminSearch(e.shiftKey ? -1 : 1); }
    if (e.key === 'Escape') closeAdminSearch();
  });
  prev?.addEventListener('click', () => stepAdminSearch(-1));
  next?.addEventListener('click', () => stepAdminSearch(1));
  cls?.addEventListener('click', closeAdminSearch);
}

function runAdminSearch(query) {
  clearAdminSearchHighlights();
  _adminSearchMatches = [];
  _adminSearchIdx = -1;
  if (!query) { updateAdminSearchCount(0, 0); return; }
  const bubbles = document.querySelectorAll('#liveMsgs [data-role]');
  const lq = query.toLowerCase();
  bubbles.forEach(row => {
    /* 텍스트 노드만 있는 bubble div 찾기 */
    const bubble = row.querySelector('div[style*="border-radius"]');
    if (!bubble) return;
    const text = bubble.textContent;
    if (!text.toLowerCase().includes(lq)) return;
    bubble.innerHTML = bubble.innerHTML.replace(
      new RegExp(escAdminReg(query), 'gi'),
      m => `<mark class="admin-search-hl">${m}</mark>`
    );
    bubble.querySelectorAll('.admin-search-hl').forEach(m => _adminSearchMatches.push(m));
  });
  updateAdminSearchCount(_adminSearchMatches.length > 0 ? 1 : 0, _adminSearchMatches.length);
  if (_adminSearchMatches.length > 0) { _adminSearchIdx = 0; scrollToAdminMatch(0); }
}

function stepAdminSearch(dir) {
  if (!_adminSearchMatches.length) return;
  _adminSearchMatches[_adminSearchIdx]?.classList.remove('admin-search-hl-active');
  _adminSearchIdx = (_adminSearchIdx + dir + _adminSearchMatches.length) % _adminSearchMatches.length;
  _adminSearchMatches[_adminSearchIdx]?.classList.add('admin-search-hl-active');
  scrollToAdminMatch(_adminSearchIdx);
  updateAdminSearchCount(_adminSearchIdx + 1, _adminSearchMatches.length);
}

function scrollToAdminMatch(idx) {
  _adminSearchMatches[idx]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function clearAdminSearchHighlights() {
  document.querySelectorAll('#liveMsgs .admin-search-hl').forEach(el => {
    el.replaceWith(document.createTextNode(el.textContent));
  });
}

function updateAdminSearchCount(cur, total) {
  const el = document.getElementById('adminSearchCount');
  if (el) el.textContent = total > 0 ? `${cur} / ${total}` : (total === 0 && cur === 0 ? '결과없음' : '');
}

function escAdminReg(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ── admin 메시지 우클릭 컨텍스트 메뉴 ── */
let _adminCtxMenu = null;

function closeAdminCtxMenu() {
  if (_adminCtxMenu) { _adminCtxMenu.remove(); _adminCtxMenu = null; }
  document.removeEventListener('click', closeAdminCtxMenu, { once: true });
  document.removeEventListener('contextmenu', closeAdminCtxMenu, { once: true });
}

function showAdminCtxMenu(x, y, role, content) {
  closeAdminCtxMenu();

  const items = [
    { label: '📋 복사', action: 'copy' },
    { label: '↩ 답장', action: 'reply' },
  ];

  const menu = document.createElement('div');
  menu.style.cssText = `
    position:fixed;left:${x}px;top:${y}px;z-index:9990;
    background:#fff;border-radius:12px;
    box-shadow:0 4px 20px rgba(0,0,0,.18);
    border:1px solid rgba(0,0,0,.06);
    padding:5px 0;min-width:130px;
    animation:ctxFadeIn .1s ease;
  `;
  menu.innerHTML = items.map(it => `
    <button data-action="${it.action}" style="display:block;width:100%;padding:10px 15px;text-align:left;background:none;border:none;font-size:13.5px;color:#374151;cursor:pointer;white-space:nowrap;"
      onmouseenter="this.style.background='#f3f4f6'" onmouseleave="this.style.background='none'">
      ${it.label}
    </button>
  `).join('');

  /* 뷰포트 경계 보정 */
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  if (rect.right  > window.innerWidth  - 8) menu.style.left = (x - rect.width)  + 'px';
  if (rect.bottom > window.innerHeight - 8) menu.style.top  = (y - rect.height) + 'px';

  menu.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    closeAdminCtxMenu();
    if (action === 'copy') {
      navigator.clipboard.writeText(content).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = content; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
      });
      showToast('✅ 복사됨', 'success');
    } else if (action === 'reply') {
      if (!liveAdminMode) { showToast('난입 후 답장 가능합니다', 'info'); return; }
      showAdminReplyBar(role, content);
    }
  });

  _adminCtxMenu = menu;
  setTimeout(() => {
    document.addEventListener('click', closeAdminCtxMenu, { once: true });
    document.addEventListener('contextmenu', closeAdminCtxMenu, { once: true });
  }, 0);
}

/**
 * admin 라이브 채팅창 우클릭 이벤트 위임 초기화
 */
function initAdminCtxMenuListener() {
  const liveMsgs = document.getElementById('liveMsgs');
  if (!liveMsgs) return;
  liveMsgs.addEventListener('contextmenu', e => {
    const row = e.target.closest('.live-msg-row');
    if (!row) return;
    e.preventDefault();
    e.stopPropagation(); // document 버블링 차단 → 연속 우클릭 정상 동작
    const role    = row.dataset.role;
    const content = decodeURIComponent(row.dataset.content || '');
    showAdminCtxMenu(e.clientX, e.clientY, role, content);
  });

  /* 모바일 롱프레스 (600ms) */
  let pressTimer = null;
  liveMsgs.addEventListener('touchstart', e => {
    const row = e.target.closest('.live-msg-row');
    if (!row) return;
    pressTimer = setTimeout(() => {
      const touch = e.touches[0];
      const role    = row.dataset.role;
      const content = decodeURIComponent(row.dataset.content || '');
      showAdminCtxMenu(touch.clientX, touch.clientY, role, content);
    }, 600);
  }, { passive: true });
  liveMsgs.addEventListener('touchend',   () => clearTimeout(pressTimer));
  liveMsgs.addEventListener('touchmove',  () => clearTimeout(pressTimer));
}

/* ================================================================
   빠른 답변 템플릿 (localStorage 기반)
================================================================ */
const TEMPLATE_KEY = 'lumane_admin_templates';

function loadTemplates() {
  try { return JSON.parse(localStorage.getItem(TEMPLATE_KEY) || '[]'); } catch { return []; }
}

function saveTemplatesToStorage(list) {
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(list));
}

function renderTemplateList() {
  const panel = document.getElementById('templateList');
  if (!panel) return;
  const templates = loadTemplates();
  if (templates.length === 0) {
    panel.innerHTML = `<div style="font-size:12px;color:#9ca3af;padding:4px 4px;">템플릿이 없습니다. "+ 추가/편집"을 눌러 추가하세요.</div>`;
    return;
  }
  panel.innerHTML = templates.map((t, i) => `
    <button onclick="applyTemplate(${i})"
      style="text-align:left;padding:8px 12px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:13px;color:#374151;cursor:pointer;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
      onmouseenter="this.style.background='#f3f4f6'" onmouseleave="this.style.background='#fff'">
      ${escAdmin(t)}
    </button>
  `).join('');
}

function applyTemplate(idx) {
  const templates = loadTemplates();
  const text = templates[idx];
  if (!text) return;
  const input = document.getElementById('liveInput');
  if (!input || input.disabled) { showToast('난입 후 사용 가능합니다', 'info'); return; }
  input.value = text;
  input.focus();
  refreshAdminSendBtn();
  toggleTemplatePanel(false);
}

function toggleTemplatePanel(forceClose) {
  const panel = document.getElementById('templatePanel');
  if (!panel) return;
  const isOpen = panel.style.display === 'flex' || panel.style.display === 'block';
  if (forceClose === false || isOpen) {
    panel.style.display = 'none';
  } else {
    renderTemplateList();
    panel.style.display = 'block';
  }
}

function openTemplateEditor() {
  const overlay = document.getElementById('templateEditorOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  renderTemplateEditorList();
}

function closeTemplateEditor(e) {
  if (e && e.target !== document.getElementById('templateEditorOverlay')) return;
  document.getElementById('templateEditorOverlay').style.display = 'none';
}

function renderTemplateEditorList() {
  const container = document.getElementById('templateEditorList');
  if (!container) return;
  const templates = loadTemplates();
  container.innerHTML = templates.map((t, i) => `
    <div style="display:flex;gap:8px;align-items:center;">
      <input type="text" value="${escAttr(t)}" data-idx="${i}"
        style="flex:1;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-family:inherit;outline:none;"
        placeholder="자주 쓰는 문구를 입력하세요">
      <button onclick="removeTemplateItem(${i})"
        style="flex-shrink:0;background:none;border:none;color:#ef4444;font-size:16px;cursor:pointer;padding:4px 6px;">🗑</button>
    </div>
  `).join('');
}

function addTemplateItem() {
  const container = document.getElementById('templateEditorList');
  if (!container) return;
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:8px;align-items:center;';
  const idx = container.children.length;
  div.innerHTML = `
    <input type="text" data-idx="${idx}"
      style="flex:1;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-family:inherit;outline:none;"
      placeholder="자주 쓰는 문구를 입력하세요">
    <button onclick="this.parentElement.remove()"
      style="flex-shrink:0;background:none;border:none;color:#ef4444;font-size:16px;cursor:pointer;padding:4px 6px;">🗑</button>
  `;
  container.appendChild(div);
  div.querySelector('input').focus();
}

function removeTemplateItem(idx) {
  const templates = loadTemplates();
  templates.splice(idx, 1);
  saveTemplatesToStorage(templates);
  renderTemplateEditorList();
}

function saveTemplates() {
  const inputs = document.querySelectorAll('#templateEditorList input[type="text"]');
  const templates = [...inputs].map(i => i.value.trim()).filter(Boolean);
  saveTemplatesToStorage(templates);
  document.getElementById('templateEditorOverlay').style.display = 'none';
  renderTemplateList();
  showToast('✅ 템플릿 저장 완료', 'success');
}

/* ── 카톡 스타일 스크롤 버튼 ─────────────────────────────── */

function updateScrollBtn(show, previewText) {
  const btn = document.getElementById('scrollToBottomBtn');
  if (!btn) return;
  if (show) {
    const preview = document.getElementById('scrollToBottomPreview');
    if (preview && previewText) {
      const trimmed = previewText.replace(/\s+/g, ' ').trim();
      preview.textContent = '↓ ' + (trimmed.length > 25 ? trimmed.slice(0, 25) + '…' : trimmed);
    }
    btn.style.display = 'block';
  } else {
    btn.style.display = 'none';
  }
}

function scrollLiveMsgsToBottom() {
  const msgs = document.getElementById('liveMsgs');
  if (msgs) {
    msgs.scrollTo({ top: msgs.scrollHeight, behavior: 'smooth' });
  }
  updateScrollBtn(false);
}

function initLiveMsgsScrollListener() {
  const msgs = document.getElementById('liveMsgs');
  if (!msgs || msgs._scrollListenerAttached) return;
  msgs._scrollListenerAttached = true;
  msgs.addEventListener('scroll', () => {
    const atBottom = msgs.scrollTop + msgs.clientHeight >= msgs.scrollHeight - 30;
    if (atBottom) updateScrollBtn(false);
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
