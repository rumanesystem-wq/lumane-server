/* ================================================================
   이전 상담 이력 드로어 — 목록 렌더링, 채팅 원문 오버레이
================================================================ */
import { MOCK_PREV_HISTORY, SERVER } from './config.js';
import { esc } from './utils.js';
import { addMsg } from './ui.js';

/* ── 실제 Supabase 이력 데이터 ── */
let realHistoryData = null;

export function setHistoryData(rows) {
  realHistoryData = rows && rows.length > 0 ? rows.map(transformRow) : [];
}

/* Supabase 행 → 히스토리 항목 변환 */
function transformRow(row, idx, arr) {
  const summary  = row.summary  || {};
  const messages = row.messages || [];

  const date    = new Date(row.created_at);
  const dateStr = date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeStr = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  const dtStr   = `${dateStr} ${timeStr}`;

  const userMsgs = messages.filter(m => m.role === 'user');
  const botMsgs  = messages.filter(m => m.role === 'assistant');
  const lastUser = userMsgs[userMsgs.length - 1]?.content || '-';
  const lastBot  = botMsgs[botMsgs.length - 1]?.content  || '-';

  const 주요항목 = {};
  if (summary.설치지역) 주요항목.지역  = summary.설치지역;
  if (summary.형태)     주요항목.형태  = summary.형태;
  if (summary.공간사이즈) {
    const sz = summary.공간사이즈;
    주요항목.사이즈 = typeof sz === 'object' ? (sz.raw || `${sz.가로mm||'?'}×${sz.세로mm||'?'}`) : sz;
  }
  if (summary.현재상태) 주요항목.상태 = summary.현재상태;

  const 요약 = summary.이름
    ? `${summary.이름}님의 상담 · ${summary.설치지역 || '-'} · ${summary.형태 || '-'}`
    : `상담 기록 #${arr.length - idx}`;

  return {
    세션ID:         row.id ? row.id.slice(0, 8) : '-',
    시작일시:       dtStr,
    종료일시:       dtStr,
    마지막상담일시: dtStr,
    재상담여부:     idx > 0,
    요약,
    주요항목,
    마지막질문:     lastUser,
    마지막답변:     lastBot,
    메시지목록:     messages.map(m => ({
      role:    m.role === 'assistant' ? 'bot' : 'user',
      content: m.content,
      time:    '',
    })),
  };
}

/* 현재 사용할 목록 반환 */
function currentList() {
  if (realHistoryData !== null) return realHistoryData;
  return MOCK_PREV_HISTORY;
}

/* 전화번호로 직접 Supabase 조회 */
async function fetchByPhone(phone) {
  const clean = phone.replace(/[-\s]/g, '');
  if (!clean) return;

  const badge = document.getElementById('historyCountBadge');
  if (badge) badge.textContent = '조회 중…';

  try {
    const r = await fetch(`${SERVER}/api/consultation-history?phone=${encodeURIComponent(clean)}`);
    if (!r.ok) throw new Error('조회 실패');
    const data = await r.json();
    setHistoryData(data.consultations || []);

    /* localStorage에도 저장 (다음 방문 시 자동 로드) */
    localStorage.setItem('루마네_연락처', clean);
    renderHistoryList();
  } catch {
    if (badge) badge.textContent = '오류';
  }
}

export function toggleHistory() {
  const drawer = document.getElementById('historyDrawer');
  const isOpen = drawer.classList.contains('open');

  if (!isOpen) {
    document.getElementById('collectDrawer').classList.remove('open');
  }
  drawer.classList.toggle('open');

  if (!isOpen) renderHistoryList();
}

function renderHistoryList() {
  const container = document.getElementById('historyList');
  const list      = currentList();

  /* 목업 안내 텍스트 제거 (실제 데이터 사용 시) */
  const badge = document.getElementById('historyCountBadge');
  const metaSpan = badge?.nextElementSibling;
  if (realHistoryData !== null && metaSpan) metaSpan.style.display = 'none';

  badge.textContent = list.length + '건';

  /* 실제 데이터가 없으면(null = 아직 미조회) 상단에 전화번호 입력창 표시 */
  const phoneFormHtml = realHistoryData === null ? `
    <div class="history-phone-form">
      <div class="hpf-label">연락처로 이전 상담 찾기</div>
      <div class="hpf-row">
        <input class="hpf-input" id="hpfInput" type="tel" placeholder="010-0000-0000" inputmode="tel" />
        <button class="hpf-btn" id="hpfBtn">조회</button>
      </div>
    </div>
  ` : '';

  if (list.length === 0) {
    container.innerHTML = phoneFormHtml + `<div style="text-align:center;padding:24px;color:var(--gray-400);font-size:13px">이전 상담 내역이 없습니다</div>`;
    bindPhoneForm();
    return;
  }

  container.innerHTML = phoneFormHtml + list.map((s, i) => `
    <div class="history-session">
      <div class="history-session-head">
        <span class="hs-num">${i + 1}회차</span>
        <span class="hs-date">${esc(s.마지막상담일시)}</span>
        <span class="hs-sid">${esc(s.세션ID)}</span>
        ${s.재상담여부 ? '<span class="hs-rebadge">재상담</span>' : ''}
      </div>
      <div class="history-session-body">
        <div class="hs-summary">${esc(s.요약)}</div>
        <div class="hs-tags">
          ${Object.entries(s.주요항목 || {}).map(([k, v]) =>
            `<span class="hs-tag">${esc(k)}: ${esc(v)}</span>`
          ).join('')}
        </div>
        <div class="hs-last">
          <b>마지막 질문:</b> ${esc(s.마지막질문)}<br>
          <b>마지막 답변:</b> ${esc(s.마지막답변)}
        </div>
      </div>
      <div class="hs-btns">
        <button class="hs-btn outline" onclick="showTranscript(${i})">💬 원문 보기</button>
        <button class="hs-btn primary" onclick="continueFromHistory(${i})">이어서 상담하기 →</button>
      </div>
    </div>
  `).join('');
  bindPhoneForm();
}

function bindPhoneForm() {
  const btn   = document.getElementById('hpfBtn');
  const input = document.getElementById('hpfInput');
  if (!btn || !input) return;
  btn.addEventListener('click', () => fetchByPhone(input.value));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') fetchByPhone(input.value); });
}

export function showTranscript(idx) {
  const s = currentList()[idx];
  if (!s) return;

  document.getElementById('tTitle').textContent = `채팅 원문 — ${s.세션ID}`;
  document.getElementById('tMeta').textContent  =
    `${s.시작일시} ~ ${s.종료일시}  |  ${s.메시지목록.length}개 메시지`;

  const msgs = document.getElementById('tMsgs');
  msgs.innerHTML = s.메시지목록.map(m => `
    <div class="t-row ${m.role}">
      ${m.role === 'bot' ? '<div class="t-av">👩‍💼</div>' : ''}
      <div class="t-bubble ${m.role}">${esc(m.content)}</div>
    </div>
    <div class="t-time ${m.role}">${m.time || ''}</div>
  `).join('');

  document.getElementById('transcriptOverlay').classList.add('open');
  msgs.scrollTop = 0;
}

export function closeTranscript(e) {
  if (e && e.target !== document.getElementById('transcriptOverlay')) return;
  document.getElementById('transcriptOverlay').classList.remove('open');
}

export function continueFromHistory(idx) {
  const s = currentList()[idx];
  document.getElementById('historyDrawer').classList.remove('open');
  setTimeout(() => {
    addMsg('bot',
      `이전 상담 내역이 있습니다 😊\n\n` +
      `📅 마지막 상담: ${s.마지막상담일시}\n` +
      `📍 ${s.주요항목.지역 || '-'} · ${s.주요항목.형태 || '-'}\n\n` +
      `이전에 상담하셨던 내용을 바탕으로 이어서 진행할까요?\n변경하실 내용이 있으시면 말씀해 주세요!`
    );
  }, 400);
}
