# 🤖 Claude Code 프로젝트 설정

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

*이 파일을 각 프로젝트 폴더 루트에 복사해서 사용하세요.*
