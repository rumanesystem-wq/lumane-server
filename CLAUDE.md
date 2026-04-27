# 🤖 루마네 프로젝트 설정 (케이트블랑 드레스룸 AI 상담)

> 공통 작업 규칙은 전역 CLAUDE.md (`~/.claude/CLAUDE.md`) 에 있음.
> 백업 위치: `C:\Users\kateb\시스템행거_AI_상담원_루마네\시스템행거 AI 루마네\백업본`

## 에이전트 팀 구성

이 프로젝트는 5개의 전문 에이전트로 구성된 팀을 사용합니다.

| 에이전트 | 역할 |
|---------|------|
| `team-orchestrator` | 헤드 에이전트 - 팀 전체 조율 |
| `html-css-js-reviewer` | HTML/CSS/JS 코드 품질 검토 |
| `web-security-auditor` | 보안 취약점 검사 |
| `code-bug-fixer` | 버그 탐지 및 수정 |
| `frontend-test-validator` | 테스트 검증 |

---

## 에이전트 자동 실행 규칙

### 팀 전체 검토가 필요한 경우 → @team-orchestrator 사용
- 새로운 기능(HTML/CSS/JS) 완성했을 때
- Pull Request / 커밋 전 최종 검토
- 코드 전반적인 품질 점검이 필요할 때

### 개별 에이전트 사용
- 코드 스타일만 보고 싶을 때 → `@html-css-js-reviewer`
- 보안만 빠르게 확인할 때 → `@web-security-auditor`
- 버그만 잡을 때 → `@code-bug-fixer`
- 테스트만 확인할 때 → `@frontend-test-validator`

---

## 사용 방법

### 기본 사용 (VS Code 확장 채팅창)
```
@team-orchestrator 로그인 폼 새로 만들었어, 검토해줘
@code-bug-fixer 이 파일에서 오류 찾아줘
@web-security-auditor 보안 점검해줘
```

### 터미널에서 사용
```bash
# Claude Code 대화 모드 시작
claude

# 그 다음 채팅에서
> @team-orchestrator 코드 검토해줘
```

---

## 주의사항

- 기획서 분석, Supabase 연결 등 **코드 외 작업**은 `@team-orchestrator`가 직접 처리합니다 (서브 에이전트 위임 안 함 - 정상)
- 서브 에이전트 병렬 실행은 **HTML/CSS/JS 코드 관련 작업**에서 동작합니다
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 환경변수가 설정되어 있어야 합니다

---

## 환경 변수 확인

Windows PowerShell에서 확인:
```powershell
$env:CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
# 결과: 1 이 나와야 정상
```

설정 안 되어 있으면:
```powershell
$env:CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1"
```

---

## 에이전트 파일 위치

```
C:\Users\kateb\.claude\agents\
├── team-orchestrator.md
├── html-css-js-reviewer.md
├── web-security-auditor.md
├── code-bug-fixer.md
└── frontend-test-validator.md
```

---

## 프로젝트 구조 & 지침 폴더

### 주요 파일
- `chat.html` + `css/chat.css` + `js/` → AI 상담 채팅 앱 (루마네)
- `index.html`, `blog.html`, `quote.html` → 케이트블랑 홈페이지
- `admin.html` → 어드민 패널
- `server.js` → Express 서버 (Anthropic API + Supabase + Notion 연동) **← 허락 없이 수정 금지**
- `preview_site/` → 작업 샌드박스 (배포 전 테스트용)
- `백업본/` → 백업 저장소

### 루마네 AI 지침 폴더 (`지침/`)
서버가 시작될 때 이 폴더의 모든 `.md` 파일을 읽어 루마네 시스템 프롬프트에 자동 포함한다.
**루마네 상담 관련 작업 시 반드시 이 폴더를 먼저 확인할 것.**

| 파일 | 내용 |
|------|------|
| `01_브랜드역할과상담톤.md` | 루마네 역할, 말투, 톤 |
| `02_배송비정책_최신.md` | 지역별 배송비 기준 |
| `03_설치치수계산규칙.md` | mm→cm 변환, 기본 행거 계산 |
| `04_할인규칙.md` | 신규아파트 10% 할인 조건 |
| `05_견적표원칙.md` | 견적서 출력 원칙 |
| `06_상담흐름.md` | 상담 진행 순서 |
| `07_필수확인항목.md` | 반드시 수집해야 할 고객 정보 |
| `08~16` | 응답 예시, 이미지 해석, 상담 스킬 등 |
| `18_옵션가격표.md` | 거울장·서랍장·선반 등 옵션 단가 전체 |

지침 파일 추가/수정 시 → `git add 지침/파일명.md` 후 커밋·푸시하면 서버에 반영됨.

---

## ⚠️ 절대 규칙 — team-orchestrator 실행 순서 (예외 없음)

### HTML · CSS · JS 파일을 Edit/Write한 직후:
1. **다음 행동은 반드시 `Agent(team-orchestrator)` 호출**
2. team-orchestrator 완료 전까지 커밋·푸시·추가 수정 전부 금지
3. "작은 수정이라 괜찮겠지" — 이런 판단 자체를 하지 말 것
4. 혼자 코드 검토 절대 금지

### 이 규칙을 어겼을 때:
- 지금 하던 작업 즉시 중단
- team-orchestrator 먼저 실행
- 그 다음 다시 진행

> 반복 위반 이력 있음. 메모리에 저장해도 까먹는 패턴이 반복되므로
> 판단하지 말고 기계적으로 실행할 것.
