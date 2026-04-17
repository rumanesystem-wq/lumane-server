/* ================================================================
   Admin 메인 — 서버 확인, 데이터 로드, UI 업데이트, 탭 전환
================================================================ */

/* ================================================================
   서버 상태 확인 & 데이터 로드
================================================================ */

async function checkServer() {
  try {
    const res  = await fetch(`${SERVER}/api/health`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();

    if (data.status === 'ok') {
      serverOnline = true;
      document.getElementById('serverBadge').className    = 'server-badge online';
      document.getElementById('serverStatus').textContent = '서버 연결됨';
      await loadQuotes();
    }
  } catch {
    serverOnline = false;
    document.getElementById('serverBadge').className    = 'server-badge offline';
    document.getElementById('serverStatus').textContent = '서버 오프라인';
    loadDemoData();
  }
}

async function loadQuotes() {
  try {
    const res  = await fetch(`${SERVER}/api/quotes`, { headers: adminHeaders() });
    const data = await res.json();
    allQuotes = data.quotes || [];

    if (allQuotes.length > lastQuoteCount && lastQuoteCount > 0) {
      const diff = allQuotes.length - lastQuoteCount;
      showToast(`📬 새 견적 ${diff}건이 접수되었습니다!`, 'success');
      document.getElementById('newBadge').style.display = 'inline';
    }
    lastQuoteCount = allQuotes.length;
    updateUI();
  } catch (e) {
    console.error('견적 로드 실패:', e);
  }
}

function loadDemoData() {
  allQuotes = [
    {
      id: 1,
      접수번호: 'KB-0001',
      접수시간: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      상태: '설계중',
      담당자: '김디자인',
      담당자배정일시: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
      메모: '고객 재방문 의향 있음',
      특이사항: '아이방 인접 — 친환경 자재 필수 확인',
      후속연락필요: true,
      시공완료일: null,
      접수경로: 'AI 루마네 채팅상담',
      상담완료여부: true,
      누락항목여부: false,
      대화요약: '강남구 아파트 드레스룸 ㄱ자형 3200mm 공간, 아이방 연결로 친환경 마감 희망. 거울장·2단서랍장 옵션, 화이트오크 선반.',
      상담이력개수: 2,
      마지막상담일시: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
      상담이력: [
        {
          세션ID: 'KB-S-2025-1215-01',
          시작일시: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString(),
          종료일시: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000 + 8 * 60000).toISOString(),
          재상담여부: false,
          요약: '강남구 ㄱ자형 드레스룸 초기 상담. 3200mm 공간, 거울장·2단서랍장, 화이트오크 선반 선호로 견적 접수.',
          마지막질문: '선반 색상은 어떻게 하시겠어요?',
          마지막답변: '화이트오크로 할게요',
          메시지목록: [
            { role:'bot',  content:'안녕하세요! 성함을 알려주시겠어요?', time:'14:23' },
            { role:'user', content:'이서연이에요', time:'14:23' },
            { role:'bot',  content:'반갑습니다, 이서연님! 연락처를 알려주세요.', time:'14:24' },
            { role:'user', content:'010-1234-5678', time:'14:24' },
            { role:'bot',  content:'설치 지역을 알려주세요.', time:'14:25' },
            { role:'user', content:'서울 강남구요', time:'14:25' },
            { role:'bot',  content:'공간 사이즈를 mm 단위로 알려주세요. 가로/세로/높이 순서로요.', time:'14:25' },
            { role:'user', content:'가로 3200, 세로 2800, 높이 2400이에요', time:'14:26' },
            { role:'bot',  content:'드레스룸 형태는 어떻게 되세요?', time:'14:27' },
            { role:'user', content:'ㄱ자형이요', time:'14:27' },
            { role:'bot',  content:'추가 옵션이 필요하신가요?', time:'14:28' },
            { role:'user', content:'거울장이랑 2단서랍장 넣고 싶어요', time:'14:28' },
            { role:'bot',  content:'프레임 색상은 어떻게 하시겠어요?', time:'14:29' },
            { role:'user', content:'화이트로 해주세요', time:'14:29' },
            { role:'bot',  content:'선반 색상은 어떻게 하시겠어요?', time:'14:30' },
            { role:'user', content:'화이트오크로 할게요', time:'14:30' },
            { role:'bot',  content:'감사합니다! 견적 접수가 완료되었습니다 😊', time:'14:31' },
          ],
        },
        {
          세션ID: 'KB-S-2026-0110-02',
          시작일시: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          종료일시: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 7 * 60000).toISOString(),
          재상담여부: true,
          요약: '재상담 — 가로 3200mm→3600mm 사이즈 변경 + 아일랜드장 추가 의사 확인.',
          마지막질문: '아일랜드장 추가로 설계 수정해 드릴까요?',
          마지막답변: '네, 그렇게 해주세요',
          메시지목록: [
            { role:'bot',  content:'안녕하세요, 이서연님! 이전 상담 내역이 있습니다. 변경 사항이 있으신가요?', time:'11:05' },
            { role:'user', content:'네, 가로를 3600으로 바꾸고 싶어요', time:'11:06' },
            { role:'bot',  content:'가로를 3200mm → 3600mm로 변경하는 것이 맞을까요?', time:'11:06' },
            { role:'user', content:'맞아요. 그리고 아일랜드장도 추가하고 싶어요', time:'11:07' },
            { role:'bot',  content:'아일랜드장 추가로 설계 수정해 드릴까요?', time:'11:07' },
            { role:'user', content:'네, 그렇게 해주세요', time:'11:08' },
            { role:'bot',  content:'변경 내용을 담당자에게 전달하겠습니다. 😊', time:'11:12' },
          ],
        },
      ],
      고객정보: {
        이름: '이서연', 연락처: '010-1234-5678', 설치지역: '서울 강남구',
        공간형태: 'ㄱ자형', 공간사이즈: '가로 3200 × 세로 2800 × 높이 2400 mm',
        추가옵션: ['거울장', '2단서랍장'], 프레임색상: '화이트', 선반색상: '화이트오크',
        요청사항: '아이방과 연결되는 공간이라 안전한 마감재 원합니다', 개인정보동의: '동의',
      },
    },
    {
      id: 2,
      접수번호: 'KB-0002',
      접수시간: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      상태: '상담중', 담당자: '박상담',
      담당자배정일시: new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString(),
      메모: '오후 통화 예정', 특이사항: '', 후속연락필요: true, 시공완료일: null,
      접수경로: 'AI 루마네 채팅상담', 상담완료여부: true, 누락항목여부: false,
      대화요약: '분당 아파트 1자형 드레스룸. 아일랜드장 추가, 블랙 프레임 + 다크월넛 선반 선호.',
      상담이력개수: 1,
      마지막상담일시: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      상담이력: [
        {
          세션ID: 'KB-S-2026-0101-05',
          시작일시: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          종료일시: new Date(Date.now() - 24 * 60 * 60 * 1000 + 9 * 60000).toISOString(),
          재상담여부: false,
          요약: '분당 1자형 드레스룸 상담. 아일랜드장 추가, 블랙 프레임·다크월넛 선반으로 견적 접수.',
          마지막질문: '개인정보 수집에 동의하시겠어요?', 마지막답변: '동의합니다',
          메시지목록: [
            { role:'bot',  content:'안녕하세요! 성함을 알려주시겠어요?', time:'10:15' },
            { role:'user', content:'최준혁이에요', time:'10:15' },
            { role:'bot',  content:'연락처를 알려주세요.', time:'10:16' },
            { role:'user', content:'010-9876-5432', time:'10:16' },
            { role:'bot',  content:'설치 지역을 알려주세요.', time:'10:17' },
            { role:'user', content:'경기 분당이요', time:'10:17' },
            { role:'bot',  content:'공간 사이즈를 알려주세요.', time:'10:18' },
            { role:'user', content:'가로 2400, 세로 600, 높이 2200', time:'10:18' },
            { role:'bot',  content:'드레스룸 형태는요?', time:'10:19' },
            { role:'user', content:'1자형이요', time:'10:19' },
            { role:'bot',  content:'개인정보 수집에 동의하시겠어요?', time:'10:24' },
            { role:'user', content:'동의합니다', time:'10:24' },
            { role:'bot',  content:'감사합니다! 견적 접수 완료되었습니다.', time:'10:24' },
          ],
        },
      ],
      고객정보: {
        이름: '최준혁', 연락처: '010-9876-5432', 설치지역: '경기 분당',
        공간형태: '1자형', 공간사이즈: '가로 2400 × 세로 600 × 높이 2200 mm',
        추가옵션: ['아일랜드장'], 프레임색상: '블랙', 선반색상: '다크월넛',
        요청사항: '', 개인정보동의: '동의',
      },
    },
    {
      id: 3,
      접수번호: 'KB-0003',
      접수시간: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      상태: '접수완료', 담당자: null, 담당자배정일시: null,
      메모: '', 특이사항: '', 후속연락필요: false, 시공완료일: null,
      접수경로: 'AI 루마네 채팅상담', 상담완료여부: true, 누락항목여부: false,
      대화요약: '마포구 ㄷ자형 대형 드레스룸. 거울장·3단서랍장·악세사리장 풀옵션, 솔리드화이트 선반.',
      상담이력개수: 1,
      마지막상담일시: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      상담이력: [
        {
          세션ID: 'KB-S-2025-1229-03',
          시작일시: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          종료일시: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 11 * 60000).toISOString(),
          재상담여부: false,
          요약: '마포구 ㄷ자형 대형 드레스룸 상담. 풀옵션(거울장·3단서랍장·악세사리장), 실버 프레임·솔리드화이트 선반 선택.',
          마지막질문: '요청사항이 있으신가요?', 마지막답변: '옷 수납 위주로 설계 부탁드립니다',
          메시지목록: [
            { role:'bot',  content:'안녕하세요! 성함을 알려주시겠어요?', time:'09:40' },
            { role:'user', content:'박민지요', time:'09:40' },
            { role:'bot',  content:'연락처를 알려주세요.', time:'09:41' },
            { role:'user', content:'010-5555-7777', time:'09:41' },
            { role:'bot',  content:'설치 지역을 알려주세요.', time:'09:42' },
            { role:'user', content:'서울 마포구요', time:'09:42' },
            { role:'bot',  content:'공간 사이즈를 알려주세요.', time:'09:43' },
            { role:'user', content:'가로 4000, 세로 3000, 높이 2500', time:'09:43' },
            { role:'bot',  content:'드레스룸 형태는요?', time:'09:44' },
            { role:'user', content:'ㄷ자형이에요', time:'09:44' },
            { role:'bot',  content:'요청사항이 있으신가요?', time:'09:50' },
            { role:'user', content:'옷 수납 위주로 설계 부탁드립니다', time:'09:51' },
            { role:'bot',  content:'감사합니다! 견적 접수가 완료되었습니다. 😊', time:'09:51' },
          ],
        },
      ],
      고객정보: {
        이름: '박민지', 연락처: '010-5555-7777', 설치지역: '서울 마포구',
        공간형태: 'ㄷ자형', 공간사이즈: '가로 4000 × 세로 3000 × 높이 2500 mm',
        추가옵션: ['거울장', '3단서랍장', '악세사리장'], 프레임색상: '실버', 선반색상: '솔리드화이트',
        요청사항: '옷 수납 위주로 설계 부탁드립니다', 개인정보동의: '동의',
      },
    },
    {
      id: 4,
      접수번호: 'KB-0004',
      접수시간: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      상태: '시공완료', 담당자: '김디자인',
      담당자배정일시: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      메모: '고객 만족도 높음. 지인 소개 예정', 특이사항: '2회 방문 현장 확인 후 설계 확정',
      후속연락필요: false,
      시공완료일: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      접수경로: 'AI 루마네 채팅상담', 상담완료여부: true, 누락항목여부: false,
      대화요약: '연수구 11자형 대형 드레스룸. 골드 프레임, 스톤그레이 선반. 시공 완료 후 만족도 우수.',
      상담이력개수: 1,
      마지막상담일시: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      상담이력: [
        {
          세션ID: 'KB-S-2025-1224-04',
          시작일시: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          종료일시: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 10 * 60000).toISOString(),
          재상담여부: false,
          요약: '연수구 11자형 대형 드레스룸 상담. 5000mm 공간, 골드 프레임·스톤그레이 선반, 2단서랍장 옵션으로 견적 접수.',
          마지막질문: '개인정보 수집에 동의하시겠어요?', 마지막답변: '동의합니다',
          메시지목록: [
            { role:'bot',  content:'안녕하세요! 성함을 알려주시겠어요?', time:'16:20' },
            { role:'user', content:'정수진이에요', time:'16:20' },
            { role:'bot',  content:'연락처를 알려주세요.', time:'16:21' },
            { role:'user', content:'010-3333-8888', time:'16:21' },
            { role:'bot',  content:'설치 지역을 알려주세요.', time:'16:22' },
            { role:'user', content:'인천 연수구요', time:'16:22' },
            { role:'bot',  content:'공간 사이즈를 알려주세요.', time:'16:23' },
            { role:'user', content:'가로 5000, 세로 600, 높이 2400', time:'16:23' },
            { role:'bot',  content:'드레스룸 형태는요?', time:'16:24' },
            { role:'user', content:'11자형이요', time:'16:24' },
            { role:'bot',  content:'개인정보 수집에 동의하시겠어요?', time:'16:30' },
            { role:'user', content:'동의합니다', time:'16:30' },
            { role:'bot',  content:'감사합니다! 견적 접수가 완료되었습니다. 😊', time:'16:30' },
          ],
        },
      ],
      고객정보: {
        이름: '정수진', 연락처: '010-3333-8888', 설치지역: '인천 연수구',
        공간형태: '11자형', 공간사이즈: '가로 5000 × 세로 600 × 높이 2400 mm',
        추가옵션: ['2단서랍장'], 프레임색상: '골드', 선반색상: '스톤그레이',
        요청사항: '', 개인정보동의: '동의',
      },
    },
  ];

  lastQuoteCount = allQuotes.length;
  updateUI();
  showToast('⚠️ 서버 오프라인 · 데모 데이터 표시 중', 'default');
}

function refreshData() {
  checkServer();
  showToast('🔄 데이터를 새로 불러옵니다...');
}


/* ================================================================
   UI 업데이트 함수들
================================================================ */

function updateUI() {
  updateDashboard();
  updateQuoteList();
  updateManagerFilter();
}

function updateDashboard() {
  const total = allQuotes.length;
  const cnt = { '접수완료': 0, '상담중': 0, '설계중': 0, '시공완료': 0 };

  allQuotes.forEach(q => { if (cnt[q.상태] !== undefined) cnt[q.상태]++; });

  document.getElementById('statTotal').textContent  = total;
  document.getElementById('statActive').textContent = cnt['접수완료'] + cnt['상담중'];
  document.getElementById('statDesign').textContent = cnt['설계중'];
  document.getElementById('statDone').textContent   = cnt['시공완료'];
  document.getElementById('statDoneRate').textContent =
    total > 0 ? `전환율 ${Math.round(cnt['시공완료'] / total * 100)}%` : '전환율 0%';

  const bar = document.getElementById('pipelineBar');
  if (total === 0) {
    bar.innerHTML = '<div class="pipeline-seg 접수완료" style="flex:1">견적 없음</div>';
  } else {
    bar.innerHTML = ['접수완료', '상담중', '설계중', '시공완료'].map(s => {
      const flex = cnt[s] || 0;
      if (flex === 0) return '';
      return `<div class="pipeline-seg ${s}" style="flex:${flex}">${cnt[s]}건</div>`;
    }).join('');
  }

  document.getElementById('leg0').textContent = cnt['접수완료'];
  document.getElementById('leg1').textContent = cnt['상담중'];
  document.getElementById('leg2').textContent = cnt['설계중'];
  document.getElementById('leg3').textContent = cnt['시공완료'];

  const recentList = document.getElementById('recentList');
  const recent     = [...allQuotes].reverse().slice(0, 5);

  if (recent.length === 0) {
    recentList.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>아직 접수된 견적이 없습니다</p></div>`;
    return;
  }

  recentList.innerHTML = recent.map(q => `
    <div style="display:flex;align-items:center;padding:10px 0;border-bottom:1px solid #f3f4f6;cursor:pointer;gap:14px;" onclick="openModal('${escAttr(String(q.id))}')">
      <span style="font-size:13px;font-weight:700;color:#7c3aed;min-width:80px">${q.접수번호}</span>
      <span style="font-size:14px;font-weight:600;min-width:80px">${q.고객정보?.이름 || '-'}</span>
      <span style="font-size:13px;color:#6b7280;flex:1">${q.고객정보?.설치지역 || '-'} <span style="color:#c4b5fd;font-weight:600">${q.고객정보?.공간형태 ? '· ' + q.고객정보.공간형태 : ''}</span></span>
      <span class="status-badge ${q.상태}">${q.상태}</span>
      <span style="font-size:12px;color:#9ca3af">${formatDate(q.접수시간)}</span>
    </div>
  `).join('');
}

function updateQuoteList(quotes) {
  const list      = quotes || allQuotes;
  const container = document.getElementById('quoteList');
  document.getElementById('quotesCount').textContent = `총 ${list.length}건`;

  if (list.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="emoji">🔍</div><p>조건에 맞는 견적이 없습니다</p></div>`;
    return;
  }

  container.innerHTML = [...list].reverse().map(q => `
    <div class="quote-card" onclick="openModal('${escAttr(String(q.id))}')">
      <div class="quote-card-header">
        <div class="quote-no">${q.접수번호}</div>
        <div class="quote-name">${q.고객정보?.이름 || '-'}</div>
        <div class="quote-phone">${q.고객정보?.연락처 || '-'}</div>
        <div class="quote-region">${q.고객정보?.설치지역 || '-'}</div>
        <div class="quote-date">${formatDate(q.접수시간)}</div>
        <div class="quote-manager">${q.담당자 || '<span style="color:#d1d5db">미배정</span>'}</div>
        <span class="status-badge ${q.상태}">${q.상태}</span>
      </div>
    </div>
  `).join('');
}

function updateManagerFilter() {
  const managers = [...new Set(allQuotes.map(q => q.담당자).filter(Boolean))];
  const sel = document.getElementById('managerFilter');
  const cur = sel.value;
  sel.innerHTML = '<option value="">전체 담당자</option>' +
    managers.map(m => `<option value="${escAttr(m)}">${escAdmin(m)}</option>`).join('');
  sel.value = cur;
}


/* ================================================================
   필터링 & 검색
================================================================ */

function filterQuotes() {
  const keyword       = document.getElementById('searchInput').value.toLowerCase();
  const statusFilter  = document.getElementById('statusFilter').value;
  const managerFilter = document.getElementById('managerFilter').value;

  const result = allQuotes.filter(q => {
    if (statusFilter  && q.상태    !== statusFilter)  return false;
    if (managerFilter && q.담당자  !== managerFilter) return false;
    if (keyword) {
      const target = [
        q.고객정보?.이름 || '',
        q.고객정보?.연락처 || '',
        q.고객정보?.설치지역 || '',
      ].join(' ').toLowerCase();
      if (!target.includes(keyword)) return false;
    }
    return true;
  });

  filteredQuotes = result;
  updateQuoteList(result);
}


/* ================================================================
   탭 전환
================================================================ */

function switchTab(tab) {
  if (tab !== 'live') stopLivePolling();

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById(`tab-${tab}`).classList.add('active');
  document.getElementById(`section-${tab}`).classList.add('active');

  const navItems = document.querySelectorAll('.nav-item');
  if (tab === 'dashboard') {
    navItems[0].classList.add('active');
    document.getElementById('topbarTitle').textContent = '📊 대시보드';
  } else if (tab === 'quotes') {
    navItems[1].classList.add('active');
    document.getElementById('topbarTitle').textContent = '📋 견적 목록';
    document.getElementById('newBadge').style.display = 'none';
  } else if (tab === 'live') {
    navItems[2].classList.add('active');
    document.getElementById('topbarTitle').textContent = '📡 라이브 상담';
    document.getElementById('liveBadge').style.display = 'none';
    startLivePolling();
  }
}


/* ================================================================
   앱 초기화
================================================================ */

checkServer().then(() => startBgPolling());
setInterval(checkServer, 30000);
initAdminFileUpload();
initAdminPaste();
initAdminCtxMenuListener();
initAdminSearch();
window.toggleAdminSearch    = toggleAdminSearch;
window.clearAdminReplyBar   = clearAdminReplyBar;
window.toggleTemplatePanel  = toggleTemplatePanel;
window.openTemplateEditor   = openTemplateEditor;
window.closeTemplateEditor  = closeTemplateEditor;
window.addTemplateItem      = addTemplateItem;
window.removeTemplateItem   = removeTemplateItem;
window.saveTemplates        = saveTemplates;
window.applyTemplate        = applyTemplate;

/* 배포 자동감지 — 새 버전 배포 시 자동 새로고침 */
(async function startUpdateChecker() {
  let currentVersion = null;
  try {
    const r = await fetch(`${SERVER}/api/version`);
    if (r.ok) currentVersion = (await r.json()).v;
  } catch { /* 무시 */ }

  setInterval(async () => {
    if (!serverOnline) return;
    try {
      const r = await fetch(`${SERVER}/api/version?t=${Date.now()}`);
      if (!r.ok) return;
      const { v } = await r.json();
      if (currentVersion && v !== currentVersion) {
        location.reload(true);
      }
    } catch { /* 무시 */ }
  }, 30000);
})();

/* ================================================================
   브라우저 알림 (상담원용)
================================================================ */
(function initAdminNotifications() {
  if (!('Notification' in window)) return;

  // 권한 요청 (아직 결정 안 됐을 때만)
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
})();

let _notifiedSessions = new Set();
let _notifiedMsgCounts = {};

function notifyNewSession(sess) {
  if (Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return; // 탭이 활성화 중이면 알림 불필요
  new Notification('💬 새 상담 연결', {
    body: `${sess.customerName || '고객'}님이 상담을 시작했습니다`,
    icon: '/favicon.ico',
  });
}

function notifyNewMessage(sess) {
  if (Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  new Notification('📩 새 메시지', {
    body: `${sess.customerName || '고객'}: 새 메시지가 도착했습니다`,
    icon: '/favicon.ico',
  });
}

// fetchLiveSessions 결과를 후킹해서 새 세션/메시지 알림
const _origFetchLiveSessions = fetchLiveSessions;
window._checkNotifications = function(sessions) {
  sessions.forEach(sess => {
    // 새 세션 알림
    if (!_notifiedSessions.has(sess.id)) {
      _notifiedSessions.add(sess.id);
      if (_notifiedSessions.size > 1) notifyNewSession(sess); // 첫 로드 제외
    }
    // 새 메시지 알림
    const prev = _notifiedMsgCounts[sess.id] ?? sess.messageCount;
    if (sess.messageCount > prev) notifyNewMessage(sess);
    _notifiedMsgCounts[sess.id] = sess.messageCount;
  });
};
