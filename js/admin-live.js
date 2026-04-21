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

    // ── 세션 카운트 확인 → 라이브 탭 뱃지 + 대시보드 업데이트 ──
    try {
      const res = await fetch(`${SERVER}/api/admin/sessions`, { headers: adminHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const sessions = data.sessions || [];
      const count  = sessions.length;
      const badge   = document.getElementById('liveBadge');
      const countEl = document.getElementById('liveCount');
      if (badge)   badge.style.display = count > 0 ? 'inline' : 'none';
      if (countEl) countEl.textContent  = count + '개 세션';
      // 대시보드도 업데이트
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
    if (window._checkNotifications) window._checkNotifications(sessions);

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
    const ago        = timeSince(new Date(s.lastMessageAt));

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

  // 대시보드 세션 목록도 같이 업데이트
  renderDashboardSessions(sessions);
}

/**
 * 대시보드 탭 — 현재 진행 중인 채팅방 목록
 */
function renderDashboardSessions(sessions) {
  const container = document.getElementById('dashboardSessionList');
  if (!container) return;

  if (sessions.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 16px;color:#9ca3af;">
        <div style="font-size:48px;margin-bottom:16px;">💤</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:6px;">현재 진행 중인 상담이 없습니다</div>
        <div style="font-size:13px;">고객이 채팅을 시작하면 여기에 표시됩니다</div>
      </div>`;
    return;
  }

  container.innerHTML = sessions.map(s => {
    const isAdmin = s.mode === 'admin';
    const ago     = timeSince(new Date(s.lastMessageAt));
    return `
      <div onclick="switchTab('live');setTimeout(()=>selectLiveSession('${escAttr(s.id)}'),100)"
        style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:16px 18px;
               cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:14px;"
        onmouseenter="this.style.borderColor='#7c3aed';this.style.boxShadow='0 2px 12px rgba(124,58,237,.1)'"
        onmouseleave="this.style.borderColor='#e5e7eb';this.style.boxShadow='none'">
        <div style="width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,${isAdmin?'#7c3aed,#a855f7':'#6b7280,#9ca3af'});display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">
          ${isAdmin ? '👩‍💼' : '🤖'}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:15px;font-weight:700;margin-bottom:3px;">${escAdmin(s.customerName)}</div>
          <div style="font-size:12px;color:#6b7280;">💬 ${s.messageCount}개 메시지 · ${ago}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <span style="font-size:11px;padding:3px 10px;border-radius:10px;font-weight:700;
            background:${isAdmin ? '#ede9fe' : '#f3f4f6'};
            color:${isAdmin ? '#7c3aed' : '#6b7280'};">
            ${isAdmin ? '담당자 상담 중' : 'AI 상담 중'}
          </span>
          <span style="font-size:13px;color:#9ca3af;">→ 입장</span>
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

  // 첫 진입 시 항상 맨 아래로 (레이아웃 계산 후)
  requestAnimationFrame(() => {
    const msgs = document.getElementById('liveMsgs');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
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
        bubbleInner = replyQuoteHtml + `<img src="${safeUrl}" style="max-width:200px;border-radius:8px;display:block;cursor:pointer;" onclick="window.open('${safeUrl}','_blank','noopener,noreferrer')" onerror="this.style.display='none';window._failedImgUrls.add(this.src)">`;
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

  if (wasAtBottom) msgs.scrollTop = msgs.scrollHeight;

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

function fmtLiveTime(iso) {
  try {
    const d = new Date(iso);
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
    ? `<img src="${adminPendingObjectUrl}" id="adminAttachThumb" style="width:44px;height:44px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;flex-shrink:0;cursor:zoom-in;" alt="" title="클릭하면 크게 보기">`
    : `<span style="font-size:22px;flex-shrink:0;">📎</span>`) +
    `<span style="font-size:12px;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;">${file.name || 'screenshot.png'}</span>
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
  document.getElementById('adminLightbox')?.remove();
  const lb = document.createElement('div');
  lb.id = 'adminLightbox';
  lb.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:20px;';
  lb.innerHTML = `<img src="${src}" style="max-width:100%;max-height:100%;border-radius:10px;object-fit:contain;box-shadow:0 8px 40px rgba(0,0,0,.6);">`;
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
    el.outerHTML = el.textContent;
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

/**
 * 경과 시간 표시 (예: "2분 전")
 */
function timeSince(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60)   return diff + '초 전';
  if (diff < 3600) return Math.floor(diff / 60) + '분 전';
  return Math.floor(diff / 3600) + '시간 전';
}
