/* ================================================================
   이전 상담 이력 드로어 — 목록 렌더링, 채팅 원문 오버레이
================================================================ */
import { esc } from './utils.js';
import { addMsg } from './ui.js';

const ARCHIVE_KEY = '루마네_히스토리_아카이브';

/* 대화 전체에서 주요 정보 추출 */
function extractKeyItems(messages) {
  const allText = messages.map(m => m.content || '').join('\n');
  const botText = messages.filter(m => m.role === 'assistant').map(m => m.content || '').join('\n');
  const result = {};

  const regionMatch = allText.match(
    /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\s*[\w가-힣]*[시군구]/
  );
  if (regionMatch) result['지역'] = regionMatch[0].trim();

  const shapeMatch = allText.match(/[ㄱㄴㄷㄹㅡ일1]{1,2}[\s]?자[\s]?형?/);
  if (shapeMatch) result['형태'] = shapeMatch[0].trim();

  const sizeMatch = allText.match(/(\d{3,4})\s*[×xX]\s*(\d{3,4})/);
  if (sizeMatch) result['치수'] = sizeMatch[0];

  if (/서랍/.test(allText)) result['옵션'] = (result['옵션'] || '') + '서랍 ';
  if (/거울/.test(allText)) result['옵션'] = (result['옵션'] || '') + '거울 ';
  if (/선반/.test(allText))  result['옵션'] = (result['옵션'] || '') + '선반 ';
  if (result['옵션']) result['옵션'] = result['옵션'].trim();

  if (/견적|합계|총액|원/.test(botText)) result['견적'] = '견적 산출됨';

  return result;
}

/* 상담 요약 텍스트 생성 */
function generateSummary(messages) {
  const items = extractKeyItems(messages);
  const parts = [];
  if (items['지역']) parts.push(items['지역']);
  if (items['형태']) parts.push(items['형태'] + ' 구조');
  if (items['치수']) parts.push(items['치수']);
  if (items['옵션']) parts.push(items['옵션']);
  if (items['견적']) parts.push(items['견적']);
  if (parts.length === 0) {
    const firstUser = messages.find(m => m.role === 'user')?.content || '';
    return firstUser.slice(0, 60) || '상담 내용 없음';
  }
  return parts.join(' · ');
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
    요약:           generateSummary(messages),
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
        <div class="hs-tags">
          ${Object.entries(s.주요항목 || {}).map(([k, v]) =>
            `<span class="hs-tag">${esc(k)}: ${esc(v)}</span>`
          ).join('')}
        </div>
        <div class="hs-summary">${esc(s.요약)}</div>
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

  /* 이전 대화 요약을 Claude history에 주입 */
  if (typeof window.injectPreviousContext !== 'function') {
    console.warn('[history.js] window.injectPreviousContext 미등록 — context 주입 스킵됨');
  } else {
    const msgs = s.메시지목록 || [];
    const lines = [];

    const items = Object.entries(s.주요항목 || {});
    if (items.length) {
      lines.push('【이전 상담 핵심 정보】');
      items.forEach(([k, v]) => lines.push(`- ${k}: ${v}`));
    }

    const textMsgs = msgs.slice(-10).filter(m => {
      const t = String(m.content || '');
      return !t.startsWith('[이미지]') && !t.startsWith('[파일:');
    });
    if (textMsgs.length) {
      lines.push('【이전 상담 대화 내용 (최근 순)】');
      textMsgs.forEach(m => {
        const who = m.role === 'bot' ? '루마네' : '고객';
        lines.push(`${who}: ${String(m.content || '').slice(0, 200)}`);
      });
    }

    lines.push(`상담 일시: ${s.마지막상담일시}`);
    window.injectPreviousContext(lines.join('\n'));
  }

  /* 히스토리 드로어 닫기 */
  document.getElementById('historyDrawer').classList.remove('open');

  /* 채팅창에 이어하기 안내 메시지 표시 */
  const label = s.세션ID ? `${s.세션ID} 상담` : '이전 상담';
  addMsg('assistant', `${label} 내용을 불러왔어요 😊 이어서 질문해 주세요!`);
}

window.showTranscript      = showTranscript;
window.continueFromHistory = continueFromHistory;
window.closeTranscript     = closeTranscript;
