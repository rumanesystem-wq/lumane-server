/* ================================================================
   견적서 인쇄 & 엑셀 내보내기
================================================================ */

/**
 * 현재 모달의 견적서를 새 창에서 인쇄합니다
 */
function printQuote() {
  if (!currentQuoteId) return;

  const quote = allQuotes.find(q => q.id === currentQuoteId);
  if (!quote) return;

  const c    = quote.고객정보 || {};
  const opts = Array.isArray(c.추가옵션) ? c.추가옵션.join(', ') : (c.추가옵션 || '없음');

  // 인쇄용 데이터 이스케이프 (XSS 방지)
  const esc = s => escAdmin(s || '-');

  const printWin = window.open('', '_blank', 'width=700,height=900');
  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>견적서 ${quote.접수번호}</title>
      <style>
        body { font-family: 'Apple SD Gothic Neo', sans-serif; padding: 40px; color: #1a1a2e; }
        h1 { font-size: 24px; margin-bottom: 4px; }
        .sub { color: #6b7280; font-size: 14px; margin-bottom: 32px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f3f4f6; padding: 10px 14px; text-align: left; font-size: 12px; color: #6b7280; }
        td { padding: 10px 14px; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
        .logo { font-size: 20px; font-weight: 700; color: #7c3aed; margin-bottom: 8px; }
        .section-title { font-size: 13px; font-weight: 700; color: #7c3aed; margin: 24px 0 8px; text-transform: uppercase; }
        .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
      </style>
    </head>
    <body>
      <div class="logo">🏠 케이트블랑 드레스룸</div>
      <h1>견적 접수 확인서</h1>
      <div class="sub">${esc(quote.접수번호)} · 접수일: ${formatDate(quote.접수시간, true)}</div>

      <div class="section-title">고객 정보</div>
      <table>
        <tr><th>이름</th><td>${esc(c.이름)}</td><th>연락처</th><td>${esc(c.연락처)}</td></tr>
        <tr><th>설치 지역</th><td colspan="3">${esc(c.설치지역)}</td></tr>
      </table>

      <div class="section-title">공간 스펙</div>
      <table>
        <tr><th>공간 형태</th><td>${esc(c.공간형태)}</td></tr>
        <tr><th>공간 사이즈</th><td>${esc(c.공간사이즈)}</td></tr>
      </table>

      <div class="section-title">선택 옵션</div>
      <table>
        <tr><th>추가 옵션</th><td>${esc(opts)}</td></tr>
        <tr><th>프레임 색상</th><td>${esc(c.프레임색상)}</td><th>선반 색상</th><td>${esc(c.선반색상)}</td></tr>
        <tr><th>요청사항</th><td colspan="3">${esc(c.요청사항 || '없음')}</td></tr>
      </table>

      <div class="section-title">처리 상태</div>
      <table>
        <tr><th>현재 상태</th><td>${esc(quote.상태)}</td><th>담당자</th><td>${esc(quote.담당자 || '미배정')}</td></tr>
      </table>

      <div class="footer">
        케이트블랑 드레스룸 | 본 견적서는 내부 참고용이며 실제 견적과 다를 수 있습니다.
      </div>
      <script>window.onload = function(){ window.print(); }<\/script>
    </body>
    </html>
  `);
  printWin.document.close();
}

/**
 * 현재 표시된 견적 목록을 엑셀 파일로 내보냅니다 (SheetJS)
 */
function exportExcel() {
  // 필터가 적용된 상태면 필터 결과만, 아니면 전체
  const source = filteredQuotes || allQuotes;
  if (source.length === 0) {
    showToast('내보낼 데이터가 없습니다', 'error');
    return;
  }

  const rows = source.map(q => ({
    '접수번호':    q.접수번호,
    '접수일시':    formatDate(q.접수시간, true),
    '처리상태':    q.상태,
    '담당자':      q.담당자 || '',
    '이름':        q.고객정보?.이름 || '',
    '연락처':      q.고객정보?.연락처 || '',
    '설치지역':    q.고객정보?.설치지역 || '',
    '공간형태':    q.고객정보?.공간형태 || '',
    '공간사이즈':  q.고객정보?.공간사이즈 || '',
    '추가옵션':    Array.isArray(q.고객정보?.추가옵션)
      ? q.고객정보.추가옵션.join(', ')
      : (q.고객정보?.추가옵션 || ''),
    '프레임색상':  q.고객정보?.프레임색상 || '',
    '선반색상':    q.고객정보?.선반색상 || '',
    '요청사항':    q.고객정보?.요청사항 || '',
    '개인정보동의': q.고객정보?.개인정보동의 || '',
    '메모':        q.메모 || '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '견적목록');

  ws['!cols'] = [
    {wch:10}, {wch:18}, {wch:8}, {wch:10}, {wch:8}, {wch:14},
    {wch:14}, {wch:8}, {wch:24}, {wch:24}, {wch:8}, {wch:10}, {wch:30}, {wch:6}, {wch:20},
  ];

  const today = new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '');
  XLSX.writeFile(wb, `케이트블랑_견적목록_${today}.xlsx`);

  showToast('📥 엑셀 파일이 다운로드됩니다', 'success');
}
