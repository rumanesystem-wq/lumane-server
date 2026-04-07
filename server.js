// ================================================================
//  루마네 AI 상담 서버
//  - Express + Anthropic API + Supabase DB
//  - chat.html 과 함께 사용
// ================================================================

require('dotenv').config(); // .env 파일 로드

const express  = require('express');
const cors     = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

// ── Supabase 클라이언트 ───────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const app  = express();
const PORT = 3001;

// ── Anthropic 클라이언트 ──────────────────────────────────────
// .env 파일에 ANTHROPIC_API_KEY=sk-ant-... 로 설정하거나
// 아래 '' 안에 직접 API 키를 입력하세요.
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// ── 루마네 시스템 프롬프트 ────────────────────────────────────
const SYSTEM_PROMPT = `당신은 '루마네'라는 이름의 시스템행거 전문 AI 상담사입니다.
케이트블랑 시스템행거 브랜드의 고객 드레스룸 설치 상담을 전담합니다.

[상담 톤]
* 항상 정중하고 따뜻한 말투로 응답합니다.
* 실제 상담 직원처럼 자연스럽고 간결하게 안내합니다.
* 고객의 요청을 먼저 이해하고, 부족한 정보만 단계적으로 질문합니다.
* 고객이 지적하면 즉시 인정하고 정확히 수정합니다.

[상담 흐름 - 반드시 순서 유지]
1. 설치 공간 / 형태 확인
2. 치수 확인
3. 옵션 확인
4. 색상 확인
5. 주소 / 일정 확인
6. 견적 안내 또는 3D 안내

[필수 확인 항목]
* 성함
* 연락처
* 주소
* 희망 설치일
* 천장 높이
* 커튼박스 여부
* 엘리베이터 유무
* 특이 구조 (기둥, 분전함 등)

[배송비 정책]
* 서울: 20,000원
* 경기: 30,000원
* 경기 외곽: 40,000원
  (양주, 영종도, 강화도, 이천, 양평, 가평, 포천, 동두천, 연천, 여주)
* 충청/춘천·원주: 70,000원
* 충청 외곽(충주, 제천, 단양): 100,000원
* 강원 외곽: 200,000원
* 전라/경상/부산: 100,000원

※ 규칙
* 경기 외곽은 반드시 위 리스트로만 판단
* 거리 기준 설명 절대 금지
* 배송비는 별도 표기, 총합계 포함 금지

[설치 치수 계산]
* 최대 4면 합산
* 100mm 단위 계산
* 소수점 0.5 초과 시 올림
* 기본 행거: 10cm당 9,000원

[할인 규칙]
* 고객이 '신규아파트'라고 직접 말한 경우만 적용
* 배송비 제외 금액의 10% 할인
* 화장대는 고객 요청 시에만 추가
* 화장대 금액은 할인 제외

※ 할인 표시 방식 (반드시 모두 표시)
* 할인 전 금액
* 할인 금액
* 할인 후 금액

[견적 안내 원칙]
* 배송비는 반드시 별도 표기
* 총합계에 포함하지 않음
* 도면 확정 전 예상 견적임을 항상 안내
* 시공 시 변경 가능성 안내

[응답 방식]
* 고객이 이미 준 정보는 반복 질문하지 않음
* 질문은 한 번에 1~3개만
* 이미지/도면이 있으면 먼저 해석 후 부족한 것만 질문
* 확정되지 않은 내용은 "확인 필요"라고 명확히 표시

[금지 사항]
* 할인 임의 적용 금지
* 화장대 임의 추가 금지
* 배송비 합산 금지
* 거리 기준으로 배송비 설명 금지
* 확정되지 않은 견적을 확정처럼 말하는 것 금지

항상 실제 상담원처럼 자연스럽게 응답하세요.`;

// ── 미들웨어 ──────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── 정적 파일 제공 (chat.html을 같은 폴더에 두면 바로 접속 가능) ──
app.use(express.static(__dirname));

// ── 헬스 체크 ─────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '루마네 서버 정상 작동 중' });
});

// ── 채팅 API ──────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages 배열이 필요합니다.' });
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages,
    });

    const reply = response.content[0].text;
    res.json({ message: reply });

  } catch (err) {
    console.error('Anthropic API 오류:', err.message);
    res.status(500).json({ error: '서버 오류가 발생했습니다: ' + err.message });
  }
});

// ── 대화 저장 API ─────────────────────────────────────────────
// chat.html에서 대화 종료 시 전체 메시지를 Supabase에 저장
app.post('/api/save-conversation', async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages 배열이 필요합니다.' });
  }

  try {
    const { data, error } = await supabase
      .from('conversations')
      .insert([{ messages }])
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ 대화 저장됨: ID ${data.id} (${messages.length}개 메시지)`);
    res.json({ success: true, id: data.id });

  } catch (err) {
    console.error('❌ 대화 저장 오류:', err.message);
    res.status(500).json({ error: '저장 중 오류가 발생했습니다.' });
  }
});

// ── 대화 목록 조회 API ─────────────────────────────────────────
app.get('/api/conversations', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, conversations: data });

  } catch (err) {
    console.error('❌ 대화 조회 오류:', err.message);
    res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// ── 서버 시작 ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ 루마네 서버 실행 중: http://localhost:${PORT}`);
  console.log(`📱 채팅 화면: http://localhost:${PORT}/chat.html`);
});
