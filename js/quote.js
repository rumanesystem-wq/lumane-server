/* ================================================================
   견적서 오버레이 — 열기/닫기/인쇄, 상담 저장
================================================================ */
import { SERVER } from './config.js';

/* ── 견적서 오버레이 열기 ── */
export function openQuote(s) {
  if (!s || typeof s !== 'object') {
    console.error('openQuote: 유효하지 않은 summary 객체', s);
    return;
  }
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });

  document.getElementById('q-이름').textContent     = s.이름 || '';
  document.getElementById('q-날짜').textContent     = today;
  document.getElementById('q-연락처').textContent   = s.연락처 || '';
  document.getElementById('q-주소').textContent     = s.주소 || '';
  document.getElementById('q-결제방식').textContent = s.결제방식 || '';
  document.getElementById('q-견적').textContent     = s.견적 || '';
  document.getElementById('q-배송비').textContent   = s.배송비 || '';
  document.getElementById('q-참고사항').textContent = s.참고사항 || '';
  document.getElementById('q-내용').textContent     = s.내용 || '';

  const 색상parts = [s.프레임색상, s.선반색상].filter(Boolean);
  document.getElementById('q-색상').textContent = 색상parts.join(' / ') || '';

  document.getElementById('q-천장커튼박스').checked = !!s.천장커튼박스;
  document.getElementById('q-2단서랍').checked       = !!s['2단서랍'];
  document.getElementById('q-3단서랍').checked       = !!s['3단서랍'];
  document.getElementById('q-기둥추가').checked      = !!s.기둥추가;
  document.getElementById('q-5단선반').checked       = !!s['5단선반'];

  document.getElementById('quoteOverlay').classList.add('open');
}

/* ── 견적서 오버레이 닫기 ── */
export function closeQuote(e) {
  if (e && e.target !== document.getElementById('quoteOverlay')) return;
  document.getElementById('quoteOverlay').classList.remove('open');
}

/* ── 견적서 인쇄 ── */
export function printQuote() {
  const win = window.open('', '_blank', 'width=600,height=800,noopener,noreferrer');
  if (!win) {
    alert('팝업이 차단되었습니다. 브라우저에서 팝업을 허용한 후 다시 시도해 주세요.');
    return;
  }

  function ct(id) {
    const el = document.getElementById(id);
    return el ? el.textContent : '';
  }
  function chk(id) {
    const el = document.getElementById(id);
    return el && el.checked ? '✔' : '';
  }
  function e(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const html = `<!DOCTYPE html><html lang="ko"><head>
    <meta charset="UTF-8">
    <title>케이트블랑 드레스룸 견적서</title>
    <style>
      body { font-family: 'Malgun Gothic', sans-serif; margin: 20px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      td { border: 1px solid #999; padding: 5px 7px; vertical-align: middle; white-space: pre-wrap; }
      td.lbl { background: #d9d9d9; font-weight: bold; text-align: center; }
      td.section-head { background: #c0392b; color: #fff; font-weight: bold; text-align: center; padding: 6px; }
      td.sub-lbl { background: #efefef; font-size: 11px; text-align: center; }
      td.footer-lbl { background: #555; color: #fff; font-weight: bold; text-align: center; font-size: 11px; }
      td.footer-val { font-size: 10px; }
      .qt-title { background: #c0392b; color: #fff; text-align: center; font-size: 17px; font-weight: 900; padding: 10px; }
      .qt-floor-plan { background: #e0e0e0; min-height: 80px; text-align: center; color: #888; font-size: 11px; padding: 16px; }
    </style>
  </head><body>
  <div class="qt-title">케이트블랑 드레스룸 견적서</div>
  <table><tbody>
    <tr>
      <td class="lbl">고객명</td><td>${e(ct('q-이름'))}</td>
      <td class="lbl">날짜</td><td>${e(ct('q-날짜'))}</td>
      <td class="lbl">전화</td><td>${e(ct('q-연락처'))}</td>
    </tr>
    <tr><td class="lbl">주소</td><td colspan="5">${e(ct('q-주소'))}</td></tr>
    <tr>
      <td class="lbl">견적</td><td colspan="3">${e(ct('q-견적'))}</td>
      <td class="lbl">결제방식</td><td>${e(ct('q-결제방식'))}</td>
    </tr>
    <tr><td class="section-head" colspan="6">주문내역</td></tr>
    <tr>
      <td class="lbl" rowspan="2">색상</td><td colspan="3">${e(ct('q-색상'))}</td>
      <td class="sub-lbl">천장<br>커튼박스</td><td>${chk('q-천장커튼박스')}</td>
    </tr>
    <tr><td colspan="4" style="font-size:11px;color:#888">프레임색상 / 선반색상</td></tr>
    <tr><td class="lbl">내용</td><td colspan="5">${e(ct('q-내용'))}</td></tr>
    <tr>
      <td class="lbl" rowspan="3">추가<br>옵션</td>
      <td class="sub-lbl">2단 서랍</td><td>${chk('q-2단서랍')}</td>
      <td class="sub-lbl">5단선반</td><td colspan="2">${chk('q-5단선반')}</td>
    </tr>
    <tr>
      <td class="sub-lbl">3단 서랍</td><td>${chk('q-3단서랍')}</td>
      <td class="sub-lbl">배송비</td><td colspan="2">${e(ct('q-배송비'))}</td>
    </tr>
    <tr><td class="sub-lbl">기둥추가</td><td colspan="4">${chk('q-기둥추가')}</td></tr>
    <tr><td class="lbl">참고<br>사항</td><td colspan="5">${e(ct('q-참고사항'))}</td></tr>
    <tr><td class="section-head" colspan="6">평면도</td></tr>
    <tr><td colspan="6" class="qt-floor-plan">평면도 이미지 또는 메모 영역</td></tr>
    <tr>
      <td class="footer-lbl" colspan="2">(주)루마네시스템</td>
      <td class="footer-val" colspan="2">기업은행<br>660-041655-04-011</td>
      <td class="footer-val">사업자번호 : 793-81-02453</td>
      <td class="footer-val">TEL 010-3784-5215</td>
    </tr>
  </tbody></table>
  </body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  win.location.href = blobUrl;
  win.addEventListener('load', () => {
    win.focus();
    win.print();
    URL.revokeObjectURL(blobUrl);
  });
}

/* ── 상담 자동 저장 (접수 확정 시 자동 호출, 버튼 없음) ── */
export async function autoSaveConversation(history) {
  if (!history || history.length === 0) return;
  try {
    const res = await fetch(`${SERVER}/api/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });
    if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '저장 실패');
    console.log('✅ 상담 자동 저장 완료:', data.summary?.이름 || '(이름 미확인)');

    /* 연락처 localStorage에 저장 → 다음 방문 시 이전 상담 자동 로드 */
    const phone = data.summary?.연락처;
    if (phone) {
      localStorage.setItem('루마네_연락처', phone.replace(/[-\s]/g, ''));
    }
    return data.summary;
  } catch (err) {
    console.error('⚠️ 상담 자동 저장 실패 (재시도 없음):', err.message);
  }
}
