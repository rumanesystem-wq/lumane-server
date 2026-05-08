# 루마네 — 케이트블랑 드레스룸 AI 상담 시스템

시스템행거(케이트블랑 드레스룸) 고객을 위한 **AI 상담원 "루마네"** 와 **운영자 어드민 패널**을 함께 제공하는 풀스택 웹 시스템입니다. Anthropic Claude API 기반 상담, Supabase 기반 데이터 저장, Notion 자동 기록 연동을 갖추고 있습니다.

---

## 🧩 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 런타임 | Node.js (LTS) |
| 서버 | Express 4 |
| AI | Anthropic Claude API (Opus / Sonnet / Haiku) |
| DB | Supabase (PostgreSQL) |
| 외부 연동 | Notion API, Make.com 웹훅 |
| 보안 | express-rate-limit, ADMIN_TOKEN Bearer 인증 |
| 파일 업로드 | multer |
| 프론트엔드 | Vanilla HTML / CSS / ES Modules JS (별도 빌드 X) |

---

## 🚀 설치 · 실행

### 1. 클론 & 의존성 설치
```bash
git clone <repo-url>
cd "시스템행거 AI 루마네"
npm install
```

### 2. 환경변수 설정
```bash
cp .env.example .env
# .env 파일 열어서 실제 키 채우기
```

필요한 키 목록은 [`.env.example`](./.env.example) 참고.

### 3. 실행
```bash
npm start
# → http://localhost:3001
```

주요 진입점:
- 랜딩 / 견적상담: `http://localhost:3001/`
- 채팅 (루마네): `http://localhost:3001/chat.html`
- 어드민: `http://localhost:3001/admin.html`

---

## 📁 폴더 구조

```
시스템행거 AI 루마네/
├── server.js              ← Express 서버 (Claude API · Supabase · Notion 연동)
├── package.json
├── .env.example           ← 환경변수 예시
├── .gitignore
│
├── index.html             ← 케이트블랑 랜딩페이지
├── chat.html              ← AI 상담 채팅 (루마네)
├── admin.html             ← 운영자 어드민 패널
├── quote.html             ← 견적 신청 폼
├── blog.html              ← 블로그
├── privacy.html           ← 개인정보처리방침
│
├── css/                   ← 스타일시트
├── js/                    ← 프론트엔드 모듈 (chat.js, admin-live.js 등)
├── images/                ← 이미지 자원
│
├── 지침/                  ← 루마네 AI 시스템 프롬프트 (서버 시작 시 자동 로드)
│   ├── 01_브랜드역할과상담톤.md
│   ├── 02_배송비정책_최신.md
│   ├── 03_설치치수계산규칙.md
│   ├── 04_할인규칙.md
│   ├── 05_견적표원칙.md
│   ├── 06_상담흐름.md
│   ├── 07_필수확인항목.md
│   ├── 09_견적출력템플릿.md
│   ├── 18_옵션가격표.md
│   └── ... (응답 예시·이미지 해석·상담 스킬 등)
│
└── preview_site/          ← 배포 전 테스트용 샌드박스
```

---

## ✨ 주요 기능

### 🤖 AI 상담 (루마네)
- Claude API 기반 자연어 상담
- `지침/` 폴더 `.md` 파일을 시스템 프롬프트에 자동 로드 (실시간 반영)
- 견적서 자동 출력 — 공간·치수·옵션·색상 확정 시 즉시 생성
- 견적서 PNG 이미지 렌더링 (html2canvas)
- Haiku 사전 필터로 무관한 메시지 차단
- 긴 대화 자동 요약 (토큰 최적화)

### 👩‍💼 어드민 패널
- 실시간 상담 세션 모니터링 (대시보드 / 견적 목록 / 대화 / 토큰 사용량)
- 운영자 직접 응대 모드 전환 (AI ↔ 사람)
- 견적 접수 관리, 상태/담당자 변경
- 데스크톱 알림 (새 고객 / 새 메시지)
- ADMIN_TOKEN Bearer 인증

### 📋 견적 시스템
- 채팅 중 견적서 자동 생성 → `quotes` 테이블 저장
- 외부 견적 신청 폼(`/quote`) — 무인증 + rate limit + 입력 검증
- 견적서 인쇄·다운로드

### 💾 데이터
- `conversations` — 채팅 메시지 전체 기록 (실시간 저장)
- `quotes` — 견적 접수 (자동 + 수동)
- `token_stats` — Anthropic API 토큰 사용량 추적
- Notion DB 자동 등록 (선택)

---

## 🚢 배포

**dev (Render):**
- `git push origin main` → Render 자동 배포
- URL: `https://lumane-server.onrender.com`

**운영 (cloudtype):**
- 별도 리포지토리(`lumane-cloudtype`)에서 관리
- dev에서 검증 완료된 변경 분만 cloudtype으로 동기화 후 배포
- 배포 시 cloudtype 전용 라인(스키마 / 포트 등) 보존 필수

> ⚠️ 운영 배포는 정해진 시간대(KST 08:30~09:30)에 메인 작업자가 직접 수행합니다.

---

## 🔐 보안 주의사항

- `.env` 파일은 절대 커밋하지 마세요 (`.gitignore`에 등록되어 있음)
- `ADMIN_TOKEN`은 64자 이상 랜덤 hex 권장 (`openssl rand -hex 32`)
- Supabase Service Role Key는 서버에서만 사용 — 클라이언트 노출 금지
- 어드민 API(`/api/admin/*`)는 모두 `requireAdmin` 미들웨어로 보호됨

---

## 📜 라이선스 / 기여

내부 프로젝트 — 외부 배포 X. 문의는 운영자에게.
