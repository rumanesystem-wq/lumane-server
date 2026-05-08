/* ================================================================
   admin-notifications.js — 어드민 알림 시스템
   (Stage 4-1: admin-live.js에서 분리)

   - 새 라이브 세션 / 새 저장 상담 도착 시 알림
   - 알림 패널 토글·렌더·읽음 처리
   - 데스크톱 알림 트리거 (window.notifyDesktop은 외부)

   의존: admin-state.js (incNotifSeq, _cachedConversations,
         _convNotifReady, setConvNotifReady, _liveNotifReady,
         setLiveNotifReady)
         admin-config.js (escAdmin, escAttr, timeSince)
         admin-live.js (_getSeenSessions — 같은 파일에 남음)
         admin.js (openHistoryDetail, switchTab, getConvLabel)

   admin.html 로드 순서: config → state → notifications → live → ...
================================================================ */

const _notifications = [];

/* 알림 중복 방지 — 페이지 세션 내 인메모리 (localStorage 오염 방지) */
const _notifiedLiveIds = new Set();
const _notifiedConvIds = new Set();

function _addNotif(type, title, body, targetId) {
  _notifications.unshift({ id: String(incNotifSeq()), type, title, body, targetId, time: new Date(), read: false });
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
  setConvNotifReady(true);
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
  setLiveNotifReady(true);
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
