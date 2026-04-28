/* ================================================================
   이전 상담 이력 드로어 — 목록 렌더링, 채팅 원문 오버레이
================================================================ */
import { esc } from './utils.js';
import { addMsg } from './ui.js';

const ARCHIVE_KEY = '루마네_히스토리_아카이브';

/* bot 메시지 전체 텍스트에서 지역·형태 추출 */
function extractKeyItems(messages) {
  const botText = messages
    .filter(m => m.role === 'assistant')
    .map(m => m.content || '')
    .join('\n');

  const result = {};

  // 지역: 시·도 + 시·군·구 패턴 (예: 서울 강남구, 경기 수원시, 인천 남동구)
  const regionMatch = botText.match(
    /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\s*[\w가-힣]*[시군구]/
  );
  if (regionMatch) result['지역'] = regionMatch[0].trim();

  // 형태: ㄱ자/ㄷ자/ㅡ자/일자/ㄴ자 등
  const shapeMatch = botText.match(/[ㄱㄴㄷㄹㅡ일][\s]?자[\s]?형?/);
  if (shapeMatch) result['형태'] = shapeMatch[0].trim();

  return result;
}

/* localStorage 아카이브 → 히스토리 항목 변환 */
function transformArchiveItem(item, idx, arr) {
  const messages = item.messages || [];
  const userMsgs = messages.filter(m => m.role === 'user');
  const botMsgs  = messages.filter(m => m.role === 'assistant');
  const lastUser = userMsgs[userMsgs.length - 1]?.content || '-';
  const lastBot  = botMsgs[botMsgs.length - 1]?.content  || '-';

  return {
    세션ID:         item.savedAt || `${arr.length - idx}회차`,
    시작일시:       item.savedAt || '-',
    종료일시:       item.savedAt || '-',
    마지막상담일시: item.savedAt || '-',
    재상담여부:     idx > 0,
    요약:           `${item.savedAt || '-'} 상담`,
    주요항목:       extractKeyItems(messages),
    마지막질문:     lastUser,
    마지막답변:     lastBot,
    메시지목록:     messages.map(m => ({
      role:    m.role === 'assistant' ? 'bot' : 'user',
      content: m.content,
      time:    '',
    })),
  };
}

function loadLocalArchive() {
  try {
    const raw = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]');
    return raw.map((item, idx, arr) => transformArchiveItem(item, idx, arr));
  } catch { return []; }
}

let historyList = [];

/* 현재 사용할 목록 반환 */
function currentList() {
  return historyList;
}

export function setHistoryData(rows) {
  historyList = rows || [];
}

export function toggleHistory() {
  const drawer = document.getElementById('historyDrawer');
  const isOpen = drawer.classList.contains('open');

  if (!isOpen) {
    document.getElementById('collectDrawer').classList.remove('open');
    historyList = loadLocalArchive();
  }
  drawer.classList.toggle('open');

  if (!isOpen) renderHistoryList();
}

function renderHistoryList() {
  const container = document.getElementById('historyList');
  const list      = currentList();

  const badge = document.getElementById('historyCountBadge');
  if (badge) badge.textContent = list.length + '건';

  if (list.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:24px;color:var(--gray-400);font-size:13px">이전 상담 내역이 없습니다</div>`;
    return;
  }

  container.innerHTML = list.map((s, i) => `
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
  if (!s) return;
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

window.showTranscript      = showTranscript;
window.continueFromHistory = continueFromHistory;
window.closeTranscript     = closeTranscript;
