/* ================================================================
   라이브 상담 기능 — 실시간 세션 난입
================================================================ */

/**
 * 저장된 상담 미확인 건수 확인 (60초마다 백그라운드 실행)
 */
async function checkHistoryCount() {
  if (!serverOnline) return;
  /* 대시보드 탭에 있으면 lastSeenHistoryAt 갱신 (저장된 상담이 대시보드에 통합됨) */
  if (document.querySelector('.tab-btn.active')?.id === 'tab-dashboard') {
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
    if (document.querySelector('.tab-btn.active')?.id === 'tab-dashboard') return;
    const data = await res.json();
    const conversations = data.conversations || [];
    let lastSeenAt = getAdminSetting('lastSeenHistoryAt');
    if (!lastSeenAt) {
      lastSeenAt = new Date().toISOString();
      saveAdminSetting('lastSeenHistoryAt', lastSeenAt);
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
  switchTab('dashboard');
  _unreadOnlyMode = true; // 항상 ON 고정. 끄기는 배너 [전체 보기] 버튼으로만.
  renderDashboardSessions(_cachedLiveSessions);
  setTimeout(() => {
    document.getElementById('dashboardSessionList')?.scrollIntoView({ behavior: 'smooth' });
  }, 100);
}
function clearUnreadFilter() {
  _unreadOnlyMode = false;
  renderDashboardSessions(_cachedLiveSessions);
}
window.clearUnreadFilter = clearUnreadFilter;

/* ── 유입 소스 통계 로드/렌더링 ── */
async function loadSourceStats(period = 'today') {
  // 기간 버튼 활성화 토글
  document.querySelectorAll('#srcPeriodBtns button').forEach(b => {
    const active = b.dataset.period === period;
    b.style.background = active ? '#7c3aed' : '#fff';
    b.style.color      = active ? '#fff' : '#374151';
    b.style.borderColor = active ? '#7c3aed' : '#d1d5db';
  });
  const listEl = document.getElementById('sourceStatsList');
  if (!listEl) return;
  listEl.textContent = '로딩 중…';
  try {
    const res = await fetch(`${SERVER}/api/admin/source-stats?period=${encodeURIComponent(period)}`, { headers: adminHeaders() });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    if (!data.counts || data.counts.length === 0) {
      listEl.innerHTML = '<div style="color:#9ca3af;font-size:13px;">데이터 없음</div>';
      return;
    }
    const total = data.total || 0;
    listEl.innerHTML = `
      <div style="font-size:12px;color:#9ca3af;margin-bottom:8px;">총 방문 ${total}건</div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${data.counts.map(({ src, count }) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return `
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="min-width:80px;font-size:13px;font-weight:600;color:#111827;">${escAdmin(src)}</div>
              <div style="flex:1;height:8px;background:#f3f4f6;border-radius:4px;overflow:hidden;">
                <div style="height:100%;background:#7c3aed;width:${pct}%;"></div>
              </div>
              <div style="min-width:60px;text-align:right;font-size:12px;color:#374151;">${count}명 (${pct}%)</div>
            </div>`;
        }).join('')}
      </div>`;
  } catch (err) {
    listEl.innerHTML = `<div style="color:#dc2626;font-size:12px;">로드 실패: ${escAdmin(err.message)}</div>`;
  }
}
window.loadSourceStats = loadSourceStats;

/* ── 대시보드에서 저장 상담 삭제 ── */
async function deleteSavedConvFromDash(id, ev) {
  if (ev) { ev.stopPropagation(); ev.preventDefault(); }
  if (!id) return;
  if (!confirm('이 상담 기록을 삭제하시겠습니까? 복구할 수 없습니다.')) return;
  try {
    const res = await fetch(`${SERVER}/api/admin/conversations/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: adminHeaders(),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || res.status); }
    setCachedConversations(_cachedConversations.filter(c => String(c.id) !== String(id)));
    renderDashboardSessions(_cachedLiveSessions);
    if (typeof showToast === 'function') showToast('상담 기록이 삭제됐습니다.', 'success');
  } catch (err) {
    if (typeof showToast === 'function') showToast(`삭제 실패: ${err.message}`, 'error');
    else alert(`삭제 실패: ${err.message}`);
  }
}
window.deleteSavedConvFromDash = deleteSavedConvFromDash;

/**
 * 백그라운드 세션 카운트 폴링 (항상 실행, 5초마다)
 * — 라이브 탭 밖에서도 새 손님 알림 뱃지 유지
 */

function startBgPolling() {
  if (bgPollTimer) return;
  // 이미 로드된 경우 재로드 생략 (서버 저장 지연 시 메모리 최신값이 덮어쓰여지는 것 방지)
  if (!_seenCountsLoaded) _loadSeenCounts();
  loadAdminSettings();
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

    // 백그라운드 탭에선 폴링 스킵 — 모바일 배터리·서버 부하 감소
    if (typeof document !== 'undefined' && document.hidden) return;

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
      const activeCount = sessions.filter(s => (s.messageCount ?? 0) > 0).length;
      const unreadCount = sessions.filter(s => s.id && !_getSeenSessions().has(String(s.id))).length;
      const badge   = document.getElementById('liveBadge');
      const countEl = document.getElementById('liveCount');
      if (badge) { badge.style.display = activeCount > 0 ? 'inline' : 'none'; badge.textContent = activeCount; }
      if (countEl) countEl.textContent  = count + '개 세션';
      // 대시보드도 업데이트
      _checkLiveNotifications(sessions);
      if (typeof window._checkNotifications === 'function') window._checkNotifications(sessions);
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
  // 대화 탭 진입 시 저장된 대화 즉시 로드 (캐시 없을 때 대비)
  if (_cachedConversations.length === 0) fetchDashboardConversations();
}

/**
 * 라이브 세션 목록 폴링 중단 (탭 이탈 시) — 백그라운드 폴링으로 전환
 */
function stopLivePolling() {
  clearInterval(livePollTimer);
  clearInterval(liveMsgPollTimer);
  livePollTimer        = null;
  liveMsgPollTimer     = null;
  liveSelectedId       = null;
  setSelectedSavedConvId(null);
  liveAdminMode        = false;
  setLiveSelectedByClick(false);
  startBgPolling(); // 탭 이탈 후에도 알림 뱃지 유지
}

/**
 * 서버에서 활성 세션 목록을 가져와 렌더링
 */
async function fetchLiveSessions() {
  if (!serverOnline) return;
  // 백그라운드 탭에선 폴링 스킵
  if (typeof document !== 'undefined' && document.hidden) return;
  try {
    const res = await fetch(`${SERVER}/api/admin/sessions`, { headers: adminHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const sessions = data.sessions || [];
    renderLiveSessionList(sessions);

    /* ── 세션 자동 선택 ── */
    if (sessions.length > 0 && !liveSelectedId && !_selectedSavedConvId) {
      /* 아직 선택된 세션 없고 저장 상담도 안 보고 있으면 가장 최근 세션 자동 선택 */
      selectLiveSession(sessions[0].id);
    } else if (liveSelectedId && !sessions.find(s => String(s.id) === String(liveSelectedId))) {
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
  const container  = document.getElementById('liveSessionList');
  const dot        = document.getElementById('liveDot');
  const countEl    = document.getElementById('liveCount');
  // 활성 라이브 세션과 같은 session_id의 저장 상담은 중복 표시 방지
  const activeLiveSessionIds = new Set(sessions.filter(s => s.id).map(s => String(s.id)));
  const savedConvs = (_cachedConversations || [])
    .filter(c => !activeLiveSessionIds.has(String(c.session_id)))
    .slice(0, 50);
  const totalCount = sessions.length + savedConvs.length;

  if (dot) dot.style.background = sessions.length > 0 ? '#22c55e' : '#d1d5db';
  if (countEl) countEl.textContent = sessions.length > 0
    ? `${sessions.length}개 진행 중`
    : `대화 ${savedConvs.length}개`;

  if (totalCount === 0) {
    if (container) container.innerHTML = `
      <div style="text-align:center;padding:40px 16px;color:#9ca3af;font-size:13px;">
        <div style="font-size:32px;margin-bottom:12px;">💤</div>
        아직 대화가 없습니다
      </div>`;
    renderDashboardSessions(sessions);
    return;
  }

  // 라이브 탭 배지 (다른 탭에서 볼 때) — 실제로 채팅 시작한 세션만 카운트
  const currentTab = document.querySelector('.tab-btn.active')?.id;
  const activeSessions = sessions.filter(s => (s.messageCount ?? 0) > 0).length;
  if (currentTab !== 'tab-live' && activeSessions > 0) {
    const badge = document.getElementById('liveBadge');
    if (badge) { badge.style.display = 'inline'; badge.textContent = activeSessions; }
  }

  if (!container) { renderDashboardSessions(sessions); return; }
  const seenNow = _getSeenSessions();

  // ── 진행 중인 세션 ──
  const liveHtml = sessions.map(s => {
    const isSelected = String(s.id) === String(liveSelectedId);
    const isAdmin    = s.mode === 'admin';
    const sid        = String(s.id);
    const lastSeen   = _seenMsgCounts[sid];
    const msgCount0  = s.messageCount ?? 0;
    const isNewRaw   = s.id && !seenNow.has(sid);
    const hasNewMsg  = !isNewRaw && lastSeen !== undefined && msgCount0 > lastSeen;
    const isNew      = isNewRaw || hasNewMsg;
    const ago        = timeSince(new Date(s.lastMessageAt));
    const msgCount   = s.messageCount ?? 0;
    return `
      <div data-session-id="${escAttr(s.id)}"
        onclick="selectLiveSession('${escAttr(s.id)}',true)"
        style="padding:12px 14px;border-radius:10px;cursor:pointer;margin-bottom:6px;
          border:2px solid ${isSelected ? '#7c3aed' : '#e5e7eb'};
          background:${isSelected ? '#faf5ff' : '#fff'};transition:all .15s;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="font-size:18px;position:relative;display:inline-block;">👤<span style="position:absolute;bottom:0;right:-1px;width:8px;height:8px;background:#22c55e;border-radius:50%;border:1.5px solid #fff;"></span></span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:5px;">
              ${escAdmin(s.customerName)}
              ${isNew ? '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:#ef4444;color:#fff;font-weight:700;">NEW</span>' : ''}
              ${s.isTest ? '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:#fef3c7;color:#92400e;font-weight:700;">테스트</span>' : ''}
            </div>
            <div style="font-size:11px;color:#9ca3af;">${[s.region, s.layout, `💬 ${msgCount}개`].filter(Boolean).join(' · ') || `💬 ${msgCount}개 메시지`}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            ${isNew && msgCount > 0 ? `<span class="new-badge" style="background:#ef4444;color:#fff;font-size:11px;font-weight:700;padding:1px 7px;border-radius:10px;min-width:20px;text-align:center;">${msgCount}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#9ca3af;">
          <span>💬 ${msgCount}개 메시지</span><span>${ago}</span>
        </div>
        ${s.tokens ? `<div style="margin-top:5px;font-size:11px;color:#7c3aed;font-weight:600;">🪙 ₩${s.tokens.costKRW.toLocaleString()} · ${s.tokens.totalTokens.toLocaleString()}토큰</div>` : ''}
      </div>`;
  }).join('');

  // ── 이전 대화 (실시간 자동 기록됨) ──
  const savedSorted = [...savedConvs].sort((a, b) => new Date(b.saved_at) - new Date(a.saved_at));
  const savedHtml = savedSorted.map(c => {
    const isSelected = String(_selectedSavedConvId) === String(c.id);
    const label      = getConvLabel(c);
    const timeStr    = c.saved_at ? timeSince(new Date(c.saved_at)) : '';
    const sub        = [c.region, c.layout, `💬 ${c.message_count || 0}개`].filter(Boolean).join(' · ');
    const isNew      = !seenNow.has(String(c.id));
    return `
      <div data-conv-id="${escAttr(c.id)}"
        onclick="selectSavedConvInPanel('${escAttr(c.id)}')"
        style="padding:12px 14px;border-radius:10px;cursor:pointer;margin-bottom:6px;
          border:2px solid ${isSelected ? '#7c3aed' : '#e5e7eb'};
          background:${isSelected ? '#faf5ff' : '#fff'};transition:all .15s;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="font-size:18px;">👤</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:${isNew ? '700' : '600'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:5px;">
              ${escAdmin(label)}
              ${isNew ? '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:#ef4444;color:#fff;font-weight:700;">NEW</span>' : ''}
            </div>
          </div>
          <span style="font-size:11px;color:#9ca3af;flex-shrink:0;white-space:nowrap;">${timeStr}</span>
        </div>
        <div style="font-size:11px;color:#9ca3af;padding-left:26px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escAdmin(sub)}</div>
      </div>`;
  }).join('');

  container.innerHTML = liveHtml + savedHtml;

  // 토큰 맵 갱신
  for (const s of sessions) {
    if (s.tokens) { window._liveTokenMap = window._liveTokenMap || {}; window._liveTokenMap[s.id] = s.tokens; }
  }

  renderDashboardSessions(sessions);
}

/**
 * 대시보드 탭 — 현재 진행 중인 채팅방 목록
 */
/* ── 어드민 공유 설정 (서버 저장) ── */
const _adminSettings = {};
async function loadAdminSettings() {
  try {
    const res = await fetch('/api/admin/settings', { headers: adminHeaders() });
    if (!res.ok) return;
    const { settings } = await res.json();
    Object.assign(_adminSettings, settings);
    // 기존 localStorage 마이그레이션 (1회)
    const migrate = { lastSeenHistoryAt: true, lastSeenQuotesAt: true, lumane_admin_templates: true };
    for (const key of Object.keys(migrate)) {
      const val = localStorage.getItem(key);
      if (val && _adminSettings[key] === undefined) {
        const parsed = key === 'lumane_admin_templates' ? JSON.parse(val) : val;
        saveAdminSetting(key, parsed);
      }
      localStorage.removeItem(key);
    }
  } catch {}
}
function saveAdminSetting(key, value) {
  _adminSettings[key] = value;
  fetch('/api/admin/settings', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ key, value })
  }).catch(() => {});
}
function getAdminSetting(key) { return _adminSettings[key]; }
window.saveAdminSetting = saveAdminSetting;
window.getAdminSetting  = getAdminSetting;

/* ── 세션별 마지막으로 읽은 메시지 수 추적 (서버 저장) ── */
const _seenMsgCounts = {};
// _seenCountsLoaded 는 admin-state.js로 이동됨 (setter: setSeenCountsLoaded)
function _getSeenSessions() {
  return new Set(Object.keys(_seenMsgCounts));
}
async function _loadSeenCounts() {
  try {
    const res = await fetch('/api/admin/seen-counts', { headers: adminHeaders() });
    if (!res.ok) return;
    const { counts } = await res.json();
    Object.assign(_seenMsgCounts, counts);
    // 기존 localStorage 마이그레이션 (1회)
    const oldKey = 'lumane_seen_sessions';
    const oldRaw = localStorage.getItem(oldKey);
    if (oldRaw) {
      const oldIds = JSON.parse(oldRaw);
      if (Array.isArray(oldIds) && oldIds.length > 0) {
        for (const id of oldIds) {
          if (_seenMsgCounts[id] === undefined) _saveSeenCount(id, 0);
        }
      }
      localStorage.removeItem(oldKey);
      localStorage.removeItem('lumane_seen_counts');
    }
    setSeenCountsLoaded(true);
    // 카운트 로드 완료 후 캐시된 데이터로 대시보드 재렌더링
    if (_cachedLiveSessions.length > 0 || _cachedConversations.length > 0) {
      renderDashboardSessions(_cachedLiveSessions, _cachedConversations);
    }
    _refreshDashBadge();
  } catch {}
}
function _saveSeenCount(sessionId, count) {
  const id = String(sessionId);
  _seenMsgCounts[id] = count;
  fetch('/api/admin/seen-counts', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ session_id: id, count })
  })
    .then(r => { if (!r.ok) console.warn('[seen-counts] 저장 실패:', r.status, id, count); })
    .catch(err => console.warn('[seen-counts] 저장 네트워크 오류:', err.message, id, count));
}
/* ── 서버 재시작 등으로 세션이 리셋된 경우 추적 ── */
const _resetSessions = new Set();
function markSessionSeen(sessionId) {
  if (!sessionId) return;
  const id = String(sessionId);
  // _seenMsgCounts[id]가 undefined일 때 0으로 저장하던 코드 제거 —
  // 0 저장 시 이후 모든 메시지가 hasNewMsg=true로 잡혀 잘못된 미확인 표시 유발.
  // 호출자가 _saveSeenCount(id, currentCount)로 정확한 값 저장 책임.
  _refreshDashBadge();
  // 미확인만 보기 필터 활성 시, 읽음 처리된 카드 즉시 사라지도록 재렌더링
  if (_unreadOnlyMode) {
    setTimeout(() => renderDashboardSessions(_cachedLiveSessions), 0);
  }
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
window.markSessionSeen   = markSessionSeen;
window._getSeenSessions  = _getSeenSessions;

/* ── options_text 파싱 ("기본행거 66cm: 70,000원 / 이불장: 200,000원" → 배열) ── */
function _parseOptionsItems(optText) {
  if (!optText) return [];
  return optText.split(' / ').map(item => {
    const m = item.match(/^(.+?):\s*([\d,]+)원/);
    if (m) return { name: m[1].trim(), price: parseInt(m[2].replace(/,/g, ''), 10) };
    return { name: item.trim(), price: null };
  }).filter(i => i.name);
}

/* ── size_raw 포맷 ("좌측 660 정면 041 우측 655" → "660 × 041 × 655") ── */
function _formatSizeRaw(raw) {
  if (!raw) return null;
  const m = raw.match(/좌측\s*([\d.]+)\s*정면\s*([\d.]+)\s*우측\s*([\d.]+)/);
  if (m) return `${m[1]} × ${m[2]} × ${m[3]}`;
  return raw;
}

/* ── 저장된 상담 캐시 ── */
// _cachedConversations / _cachedLiveSessions / _selectedSavedConvId 는 admin-state.js로 이동됨
// (setters: setCachedConversations / setCachedLiveSessions / setSelectedSavedConvId)
let _unreadOnlyMode       = false; // 미확인만 보기 필터

function _refreshDashBadge() {
  // 책갈피(seen-counts) 로드 전에는 카운트 계산 보류 — 잘못된 미확인 표시 방지
  if (!_seenCountsLoaded) return;
  const seen    = _getSeenSessions();
  const liveNew = _cachedLiveSessions.filter(s => {
    if (!s.id) return false;
    if (!seen.has(String(s.id)) || _resetSessions.has(String(s.id))) return true;
    const lastSeen = _seenMsgCounts[String(s.id)];
    return lastSeen !== undefined && (s.messageCount ?? 0) > lastSeen;
  }).length;
  // 활성 라이브 세션과 같은 session_id의 저장 상담은 중복 카운트 방지
  const activeLive = new Set(_cachedLiveSessions.filter(s => s.id).map(s => String(s.id)));
  const convNew = _cachedConversations.filter(c => c.id && !seen.has(String(c.id)) && !activeLive.has(String(c.session_id))).length;
  const total   = liveNew + convNew;
  [document.getElementById('dashNewBadge'), document.getElementById('sidebarDashBadge')].forEach(badge => {
    if (!badge) return;
    badge.textContent = total;
    badge.style.display = total > 0 ? 'inline' : 'none';
  });
  // 미확인 상담 stat 카드 동기화 (탭 뱃지와 동일 기준)
  const statUnread = document.getElementById('statUnread');
  const statCard   = statUnread?.closest('.stats-card--unread');
  if (statUnread) statUnread.textContent = total;
  if (statCard)   statCard.classList.toggle('no-unread', total === 0);
  const liveBadge = document.getElementById('liveBadge');
  if (liveBadge) {
    const activeCount = _cachedLiveSessions.filter(s => (s.messageCount ?? 0) > 0).length;
    liveBadge.textContent = activeCount;
    liveBadge.style.display = activeCount > 0 ? 'inline' : 'none';
  }
}

async function fetchDashboardConversations() {
  if (!serverOnline) return;
  if (typeof document !== 'undefined' && document.hidden) return;
  try {
    const res = await fetch(`${SERVER}/api/admin/conversations`, { headers: adminHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    setCachedConversations((data.conversations || []).slice(0, 30));
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

/* 알림 중복 방지 — 페이지 세션 내 인메모리 (localStorage 오염 방지) */
const _notifiedLiveIds = new Set();
const _notifiedConvIds = new Set();

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
  let newCount = 0;
  _cachedConversations.forEach(c => {
    if (!c.id || _notifiedConvIds.has(c.id)) return;
    _notifiedConvIds.add(c.id);
    /* 첫 로드 시 최근 3건만, 이후 폴링은 제한 없음 */
    if (!_convNotifReady && newCount >= 10) return;
    newCount++;
    const region = c.region ? ' · ' + c.region : '';
    _addNotif('saved', '새 상담이 저장됐습니다 📁', getConvLabel(c) + region, c.id);
  });
  _convNotifReady = true;
}

function _checkLiveNotifications(sessions) {
  const adminSeen = _getSeenSessions();
  sessions.forEach(s => {
    if (!s.id) return;
    const sid = String(s.id);
    if (_notifiedLiveIds.has(sid)) return;
    _notifiedLiveIds.add(sid);
    if (adminSeen.has(sid)) return;
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
    setTimeout(() => selectLiveSession(notif.targetId, true), 100);
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
        if (sess) _saveSeenCount(sessionId, sess.messageCount ?? 0);
        _resetSessions.delete(sessionId);
        markSessionSeen(sessionId);
        switchTab('live');
        setTimeout(() => selectLiveSession(sessionId, true), 100);
      } else if (convCard) {
        const convId = convCard.dataset.convId;
        // 저장 상담도 message_count 포함해서 저장 (0 저장 방지)
        const conv = _cachedConversations.find(c => String(c.id) === String(convId));
        if (conv) _saveSeenCount(convId, conv.message_count ?? 0);
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

  setCachedLiveSessions(sessions);
  _refreshDashBadge();

  // 서버 읽음 데이터 첫 로드 후 테이블이 비어있으면 현재 모든 세션을 읽음 처리 (초기화)
  if (_seenCountsLoaded && Object.keys(_seenMsgCounts).length === 0) {
    sessions.forEach(s => { if (s.id) _saveSeenCount(s.id, s.messageCount ?? 0); });
    (_cachedConversations || []).forEach(c => { if (c.id) _saveSeenCount(c.id, c.message_count ?? 0); });
  }

  const seenSessions = _getSeenSessions();

  // 베이스라인 초기화만 수행 (세션 리셋 자동 감지는 비활성 — 잘못된 미확인 표시 방지)
  sessions.forEach(s => {
    if (!s.id) return;
    const msgCount = s.messageCount ?? 0;
    const sid = String(s.id);
    if (seenSessions.has(sid) && _seenMsgCounts[sid] === undefined && !_resetSessions.has(sid)) {
      _seenMsgCounts[sid] = msgCount;
    }
  });

  if (sessions.length === 0 && _cachedConversations.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 16px;color:#9ca3af;">
        <div style="font-size:48px;margin-bottom:16px;">💤</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:6px;">들어온 상담이 없습니다</div>
        <div style="font-size:13px;">고객이 채팅을 시작하면 여기에 표시됩니다</div>
      </div>`;
    return;
  }

  // ── 라이브 + 저장 합쳐서 최신순 단일 리스트 ──
  const liveItems = sessions.filter(s => s.id).map(s => ({
    type: 'live', id: s.id,
    sortTime: (() => { const t = new Date(s.lastMessageAt).getTime(); return isNaN(t) ? 0 : t; })(),
    data: s
  }));
  // 활성 라이브 세션과 같은 session_id의 저장 상담은 중복 표시 방지
  const activeLiveSessionIds = new Set(sessions.filter(s => s.id).map(s => String(s.id)));
  const convItems = _cachedConversations
    .filter(c => c.id && !activeLiveSessionIds.has(String(c.session_id)))
    .map(c => ({
      type: 'saved', id: c.id,
      sortTime: (() => { const t = new Date(c.saved_at).getTime(); return isNaN(t) ? 0 : t; })(),
      data: c
    }));
  let allItems = [...liveItems, ...convItems].sort((a, b) => b.sortTime - a.sortTime);

  // 미확인만 보기 필터 적용
  if (_unreadOnlyMode) {
    allItems = allItems.filter(item => {
      if (item.type === 'live') {
        const s = item.data;
        const sid = String(s.id);
        const msgCount = s.messageCount ?? 0;
        const isNew = !seenSessions.has(sid) || _resetSessions.has(sid);
        const lastSeen = _seenMsgCounts[sid];
        const hasNewMsg = !isNew && lastSeen !== undefined && msgCount > lastSeen;
        return isNew || hasNewMsg;
      }
      return !seenSessions.has(String(item.id));
    });
  }

  const filterBanner = _unreadOnlyMode
    ? `<div style="display:flex;align-items:center;justify-content:space-between;background:#fff7ed;border:1px solid #fdba74;border-radius:10px;padding:10px 14px;margin-bottom:10px;">
        <span style="font-size:13px;font-weight:600;color:#c2410c;">🔴 미확인만 보기 (${allItems.length}건)</span>
        <button onclick="clearUnreadFilter()" style="font-size:12px;padding:4px 10px;border:1px solid #fdba74;border-radius:6px;background:#fff;color:#c2410c;cursor:pointer;font-weight:600;">전체 보기</button>
      </div>`
    : '';

  if (_unreadOnlyMode && allItems.length === 0) {
    container.innerHTML = filterBanner + `
      <div style="text-align:center;padding:60px 16px;color:#9ca3af;">
        <div style="font-size:48px;margin-bottom:16px;">✅</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:6px;">미확인 상담이 없습니다</div>
        <div style="font-size:13px;">모두 확인했습니다.</div>
      </div>`;
    return;
  }

  container.innerHTML = filterBanner + allItems.map(item => {
    if (item.type === 'live') {
      const s        = item.data;
      const isAdmin  = s.mode === 'admin';
      const ago      = timeSince(new Date(s.lastMessageAt));
      const msgCount = s.messageCount ?? 0;
      const sid      = String(s.id);
      const isNew    = !seenSessions.has(sid) || _resetSessions.has(sid);
      const lastSeen = _seenMsgCounts[sid];
      const hasNewMsg = !isNew && lastSeen !== undefined && msgCount > lastSeen;
      const unread   = isNew || hasNewMsg;
      const unreadCount = isNew ? msgCount : (hasNewMsg ? msgCount - lastSeen : 0);
      const subText  = s.tokens
        ? `🪙 ₩${s.tokens.costKRW.toLocaleString()} · ${s.tokens.totalTokens.toLocaleString()}토큰`
        : `💬 ${msgCount}개 메시지`;
      return `
        <div data-session-id="${escAttr(s.id)}"
          style="background:#fff;border:2px solid ${(isNew||hasNewMsg)?'#fecaca':'#dbeafe'};border-left:5px solid ${(isNew||hasNewMsg)?'#ef4444':'#3b82f6'};border-radius:14px;padding:14px 16px;cursor:pointer;display:flex;align-items:center;gap:12px;margin-bottom:8px;transition:background .12s;"
          onmouseenter="this.style.background='#f9fafb'" onmouseleave="this.style.background='#fff'">
          <div style="position:relative;flex-shrink:0;">
            <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#6b7280,#9ca3af);display:flex;align-items:center;justify-content:center;font-size:22px;">
              👤
            </div>
            <div style="position:absolute;bottom:1px;right:1px;width:12px;height:12px;border-radius:50%;background:#22c55e;border:2px solid #fff;"></div>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;">
              <div style="display:flex;align-items:center;gap:5px;">
                <span style="font-size:15px;font-weight:${unread?'700':'600'};color:#111827;">${escAdmin(s.customerName)}</span>
                ${s.startedAt ? `<span style="font-size:11px;color:#9ca3af;font-weight:500;" title="첫 상담 시각">${new Date(s.startedAt).toLocaleTimeString('ko-KR', { hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit' })}</span>` : ''}
                <span style="font-size:11px;padding:1px 6px;border-radius:6px;background:#f3f4f6;color:#4b5563;font-weight:600;">${escAdmin(s.src || '직접방문')}</span>
                ${s.isTest ? '<span style="font-size:10px;padding:1px 5px;border-radius:6px;background:#fef3c7;color:#92400e;font-weight:700;">테스트</span>' : ''}
                ${!s.isTest && s.isReturning ? '<span style="font-size:10px;padding:1px 5px;border-radius:6px;background:#d1fae5;color:#065f46;font-weight:700;">재방문</span>' : ''}
                ${!s.isTest && !s.isReturning ? '<span style="font-size:10px;padding:1px 5px;border-radius:6px;background:#e0f2fe;color:#0369a1;font-weight:700;">첫방문</span>' : ''}
              </div>
              <span style="font-size:11px;color:#9ca3af;flex-shrink:0;margin-left:8px;">${ago}</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;min-width:0;">
              <span style="font-size:12px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1;">${subText}</span>
              ${unreadCount > 0 ? `<span style="flex-shrink:0;margin-left:6px;background:#ef4444;color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:10px;min-width:20px;text-align:center;">${unreadCount}</span>` : ''}
            </div>
          </div>
        </div>`;
    } else {
      const c      = item.data;
      const isNew  = !seenSessions.has(String(c.id));
      const timeStr = c.saved_at
        ? new Date(c.saved_at).toLocaleString('ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
        : '-';

      // options_text에서 항목+가격 파싱 ("기본행거 66cm: 70,000원 / 이불장: 200,000원" 형식)
      const optItems = _parseOptionsItems(c.options_text);
      const sizeStr  = _formatSizeRaw(c.size_raw);

      const infoField = (label, val) =>
        val ? `<div style="display:flex;gap:4px;font-size:12px;"><span style="color:#6b7280;flex-shrink:0;white-space:nowrap;">${label}</span><span style="color:#111827;font-weight:600;">${escAdmin(val)}</span></div>` : '';

      const infoRows = [
        infoField('연락처', c.phone),
        infoField('설치지역', c.region),
        infoField('공간', sizeStr),
        infoField('프레임', c.frame_color),
        infoField('선반색', c.shelf_color),
      ].filter(Boolean);

      // options_text에 가격이 없는 경우 단순 텍스트로 fallback
      const optionsSimple = c.options_text && optItems.every(i => i.price === null)
        ? c.options_text : null;

      return `
        <div data-conv-id="${escAttr(c.id)}"
          style="background:#fff;border:2px solid ${isNew?'#fecaca':'#dbeafe'};border-left:5px solid ${isNew?'#ef4444':'#3b82f6'};border-radius:14px;padding:14px 16px;cursor:pointer;margin-bottom:8px;transition:background .12s;"
          onmouseenter="this.style.background='#f9fafb'" onmouseleave="this.style.background='#fff'">

          <!-- 헤더 -->
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:${infoRows.length>0||optItems.length>0?'10px':'0'};">
            <div style="flex-shrink:0;width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#6b7280,#9ca3af);display:flex;align-items:center;justify-content:center;font-size:22px;">👤</div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
                <span style="font-size:15px;font-weight:${isNew?'700':'600'};color:#111827;">${escAdmin(getConvLabel(c))}</span>
                <span style="font-size:11px;padding:1px 6px;border-radius:6px;background:#f3f4f6;color:#4b5563;font-weight:600;">${escAdmin(c.src || '직접방문')}</span>
                ${c.layout ? `<span style="font-size:11px;padding:1px 6px;border-radius:6px;background:#ede9fe;color:#7c3aed;font-weight:600;">${escAdmin(c.layout)}</span>` : ''}
                ${c.is_test ? '<span style="font-size:10px;padding:1px 5px;border-radius:6px;background:#fef3c7;color:#92400e;font-weight:700;">테스트</span>' : ''}
                ${isNew ? '<span style="font-size:10px;padding:1px 5px;border-radius:6px;background:#ef4444;color:#fff;font-weight:700;">NEW</span>' : ''}
              </div>
              <div style="font-size:11px;color:#9ca3af;margin-top:1px;">${timeStr} · 💬 ${c.message_count||0}개</div>
            </div>
            ${c.estimated_price ? `<div style="font-size:13px;font-weight:700;color:#d97706;flex-shrink:0;">${Number(c.estimated_price).toLocaleString()}원</div>` : ''}
            <button type="button" title="삭제"
              onclick="deleteSavedConvFromDash('${escAttr(c.id)}', event)"
              style="flex-shrink:0;background:transparent;border:none;color:#9ca3af;font-size:16px;cursor:pointer;padding:4px 6px;border-radius:6px;line-height:1;"
              onmouseover="this.style.background='#fee2e2';this.style.color='#dc2626'"
              onmouseout="this.style.background='transparent';this.style.color='#9ca3af'">🗑</button>
          </div>

          <!-- 정보 그리드 -->
          ${infoRows.length > 0 ? `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;font-size:12px;margin-bottom:${optItems.length>0||optionsSimple?'8px':'0'};">
            ${infoRows.join('')}
          </div>` : ''}

          <!-- 옵션 단순 텍스트 -->
          ${optionsSimple ? `<div style="font-size:12px;color:#111827;margin-bottom:6px;"><span style="color:#6b7280;">옵션</span> ${escAdmin(optionsSimple)}</div>` : ''}

          <!-- 예상 단가 테이블 -->
          ${optItems.length > 0 && optItems.some(i => i.price !== null) ? `
          <div style="background:#fffbeb;border-radius:8px;padding:8px 10px;margin-top:4px;">
            <div style="font-size:11px;font-weight:700;color:#92400e;margin-bottom:5px;">💰 예상 단가 (참고용)</div>
            ${optItems.filter(i=>i.price!==null).map(i=>`
              <div style="display:flex;justify-content:space-between;font-size:12px;color:#111827;margin-bottom:2px;">
                <span>${escAdmin(i.name)}</span>
                <span style="font-weight:600;">${Number(i.price).toLocaleString()}원</span>
              </div>`).join('')}
            ${c.estimated_price ? `
            <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;color:#92400e;margin-top:5px;border-top:1px solid #fde68a;padding-top:5px;">
              <span>합계 (참고)</span>
              <span>${Number(c.estimated_price).toLocaleString()}원</span>
            </div>
            <div style="font-size:10px;color:#b45309;margin-top:2px;">배송비 별도 · 도면 확정 전 기준</div>` : ''}
          </div>` : ''}
        </div>`;
    }
  }).join('');
}

/**
 * 세션 선택 — 오른쪽 채팅 패널에 표시
 * byClick=true: 사용자가 명시적으로 카드 클릭 (읽음 처리)
 * byClick=false: 자동 선택 (읽음 처리 안 함, 빨간 NEW 유지)
 */
// _liveSelectedByClick 는 admin-state.js로 이동됨 (setter: setLiveSelectedByClick)
async function selectLiveSession(sessionId, byClick = false) {
  clearInterval(liveMsgPollTimer);
  liveMsgPollTimer = null;
  liveSelectedId = sessionId;
  setLiveSelectedByClick(byClick);
  if (byClick) markSessionSeen(sessionId);

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
  liveMsgPollTimer     = null;
  liveSelectedId       = null;
  setSelectedSavedConvId(null);
};

/**
 * 완료된 대화 선택 — 오른쪽 패널에 저장된 메시지 표시
 */
window.selectSavedConvInPanel = function(convId) {
  clearInterval(liveMsgPollTimer);
  liveMsgPollTimer     = null;
  liveSelectedId       = null;
  setSelectedSavedConvId(convId);

  // _saveSeenCount 먼저 호출 — markSessionSeen에서 0 저장 제거 후 호출자 책임
  // String 변환 — c.id가 lumane schema에서 bigint(숫자)일 때 string convId와 매칭되도록
  const conv = _cachedConversations.find(c => String(c.id) === String(convId));
  if (!conv) return;  // early return 먼저 — conv 없으면 이후 패널 렌더링 불가
  _saveSeenCount(String(convId), conv.message_count ?? 0);
  markSessionSeen(convId);

  const label   = getConvLabel(conv);
  const timeStr = conv.saved_at
    ? new Date(conv.saved_at).toLocaleString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
    : '-';

  // 패널 헤더 세팅
  document.getElementById('livePanelTitle').textContent = `📁 ${label}`;
  document.getElementById('livePanelMeta').textContent  =
    `${timeStr} · 메시지 ${conv.message_count || 0}개${conv.region ? ' · ' + conv.region : ''}`;
  document.getElementById('livePanelActions').innerHTML = `
    <button onclick="openHistoryDetail('${escAttr(convId)}')"
      style="padding:5px 12px;background:#f3f4f6;color:#374151;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;cursor:pointer;white-space:nowrap;">
      📋 상세보기
    </button>`;

  // 라이브 전용 UI 숨기기
  const replyBar = document.getElementById('adminReplyBar');
  if (replyBar) replyBar.style.display = 'none';
  const adminInputArea = document.getElementById('adminInputArea');
  if (adminInputArea) adminInputArea.style.display = 'none';

  // 메시지 렌더링 — renderLiveChatPanel 재사용
  const messages    = Array.isArray(conv.messages) ? conv.messages : [];
  const fakeSession = { id: conv.id, customerName: label, messages, mode: 'ai', tokens: null };
  renderLiveChatPanel(fakeSession);

  // renderLiveChatPanel이 덮어쓴 헤더/액션 다시 적용
  document.getElementById('livePanelTitle').textContent = `📁 ${label}`;
  document.getElementById('livePanelMeta').textContent  =
    `${timeStr} · 메시지 ${conv.message_count || 0}개${conv.region ? ' · ' + conv.region : ''}`;
  document.getElementById('livePanelActions').innerHTML = `
    <button onclick="openHistoryDetail('${escAttr(convId)}')"
      style="padding:5px 12px;background:#f3f4f6;color:#374151;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;cursor:pointer;white-space:nowrap;">
      📋 상세보기
    </button>`;
  if (replyBar) replyBar.style.display = 'none';
  if (adminInputArea) adminInputArea.style.display = 'none';

  const msgs = document.getElementById('liveMsgs');
  if (msgs) requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; });

  // 목록 선택 하이라이트 갱신
  renderLiveSessionList(_cachedLiveSessions);

  // 모바일: 채팅 패널 전환
  if (window.innerWidth < 768) {
    document.querySelector('.live-split')?.classList.add('session-selected');
    setTimeout(() => { if (msgs) msgs.scrollTop = msgs.scrollHeight; }, 50);
  }
};

/**
 * 선택된 세션의 메시지를 가져와 패널에 표시
 */
async function fetchLiveSessionMsgs() {
  if (!liveSelectedId || !serverOnline) return;
  if (typeof document !== 'undefined' && document.hidden) return;
  try {
    const res = await fetch(
      `${SERVER}/api/admin/session/${encodeURIComponent(liveSelectedId)}`,
      { headers: adminHeaders() }
    );
    if (!res.ok) return;
    const data = await res.json();
    // 실시간으로 열람 중인 세션은 항상 읽음 처리 (카톡처럼 보는 중에는 배지 안 뜸)
    // 사용자가 직접 클릭한 세션만 자동 읽음 (자동 선택은 빨간 NEW 유지)
    if (_liveSelectedByClick) {
      const sessData = _cachedLiveSessions.find(s => String(s.id) === String(liveSelectedId));
      if (sessData) _saveSeenCount(String(liveSelectedId), sessData.messageCount ?? 0);
    }
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
    `세션 ${String(sess.id).slice(0, 20)}… · 메시지 ${sess.messages.length}개${tkStr}`;

  document.getElementById('livePanelActions').innerHTML = isAdmin
    ? `<button class="btn btn-outline" onclick="releaseSession()" style="font-size:13px;">🤖 AI에게 넘기기</button>`
    : `<button class="btn btn-primary" onclick="takeoverSession()" style="font-size:13px;">👩‍💼 난입하기</button>`;

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
    // TreeWalker로 텍스트 노드만 wrap — 링크 href·이미지 src 같은 속성값 깨짐 방지
    const re = new RegExp(escAdminReg(query), 'gi');
    const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let n; while ((n = walker.nextNode())) textNodes.push(n);
    textNodes.forEach(node => {
      if (!re.test(node.nodeValue)) { re.lastIndex = 0; return; }
      re.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0, match;
      while ((match = re.exec(node.nodeValue))) {
        if (match.index > last) frag.appendChild(document.createTextNode(node.nodeValue.slice(last, match.index)));
        const mark = document.createElement('mark');
        mark.className = 'admin-search-hl';
        mark.textContent = match[0];
        frag.appendChild(mark);
        last = match.index + match[0].length;
      }
      if (last < node.nodeValue.length) frag.appendChild(document.createTextNode(node.nodeValue.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
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
   빠른 답변 템플릿 (서버 저장)
================================================================ */
function loadTemplates() {
  const t = getAdminSetting('lumane_admin_templates');
  return Array.isArray(t) ? t : [];
}

function saveTemplatesToStorage(list) {
  saveAdminSetting('lumane_admin_templates', list);
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
