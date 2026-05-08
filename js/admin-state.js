/* ================================================================
   admin-state.js — admin-live.js 모듈 분할용 공유 상태 (1단계)

   - 직접 read는 그대로 가능 (전역 let)
   - 쓰기는 반드시 setter 통해서만 (캡슐화 + 추적성)
   - 1단계 추출 변수: 핵심 5개
     · _seenCountsLoaded
     · _cachedConversations
     · _cachedLiveSessions
     · _selectedSavedConvId
     · _liveSelectedByClick

   admin-config.js 다음 / admin-live.js 앞에서 로드한다.
================================================================ */

let _seenCountsLoaded     = false;
let _cachedConversations  = [];
let _cachedLiveSessions   = [];
let _selectedSavedConvId  = null;
let _liveSelectedByClick  = false;
let _liveNotifReady       = false;
let _convNotifReady       = false;
let _unreadOnlyMode       = false;
let _notifSeq             = 0;
let _typingTimer          = null;
let _adminReplyContent    = null;
let _adminCtxMenu         = null;

/**
 * 읽음 카운트 적재 완료 플래그 갱신
 */
function setSeenCountsLoaded(v) {
  _seenCountsLoaded = !!v;
}

/**
 * 저장된 상담 목록 캐시 갱신
 * 배열이 아니면 빈 배열로 강제 → 호출처 안정성 보장
 */
function setCachedConversations(v) {
  _cachedConversations = Array.isArray(v) ? v : [];
}

/**
 * 라이브 세션 목록 캐시 갱신
 */
function setCachedLiveSessions(v) {
  _cachedLiveSessions = Array.isArray(v) ? v : [];
}

/**
 * 현재 선택된 저장 대화 ID 갱신 (null = 선택 해제)
 */
function setSelectedSavedConvId(v) {
  _selectedSavedConvId = v;
}

/**
 * 라이브 세션이 사용자 클릭으로 선택됐는지 플래그
 * (자동 선택 시에는 false 유지 → 자동 읽음 처리 방지용)
 */
function setLiveSelectedByClick(v) {
  _liveSelectedByClick = !!v;
}

/**
 * 라이브 세션 알림 시스템 준비 완료 플래그
 * (초기 로딩 완료 후 새 세션 등장 시에만 알림 발생)
 */
function setLiveNotifReady(v) {
  _liveNotifReady = !!v;
}

/**
 * 저장된 상담 알림 시스템 준비 완료 플래그
 * (초기 로딩 완료 후 새 저장 상담 등장 시에만 알림 발생)
 */
function setConvNotifReady(v) {
  _convNotifReady = !!v;
}

/**
 * 미확인만 보기 필터 토글
 * 켜면 미확인 상담만 보이고, 배너 [전체 보기] 버튼으로 끔
 */
function setUnreadOnlyMode(v) {
  _unreadOnlyMode = !!v;
}

/**
 * 알림 시퀀스 번호 증가 (postfix `_notifSeq++` 대체)
 * 현재 값 반환 후 1 증가 — 호출처에서 새 알림 ID로 사용
 */
function incNotifSeq() {
  return _notifSeq++;
}

/**
 * 타이핑 상태 전송 디바운스 타이머
 */
function setTypingTimer(t) {
  _typingTimer = t;
}

/**
 * 어드민 답장 바 컨텍스트 (답장 대상 메시지 본문)
 */
function setAdminReplyContent(content) {
  _adminReplyContent = content;
}

/**
 * 어드민 메시지 우클릭 컨텍스트 메뉴 DOM 참조
 */
function setAdminCtxMenu(menu) {
  _adminCtxMenu = menu;
}
