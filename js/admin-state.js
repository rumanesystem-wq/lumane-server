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
