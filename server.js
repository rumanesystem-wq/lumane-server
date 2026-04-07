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
const fs = require('fs');
const path = require('path');

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

// ── 루마네 시스템 프롬프트 (.md 파일들 합산) ─────────────────
const MD_FILES = [
  '01_브랜드역할과상담톤.md',
  '02_배송비정책_최신.md',
  '03_설치치수계산규칙.md',
  '04_할인규칙.md',
  '05_견적표원칙.md',
  '06_상담흐름.md',
  '07_필수확인항목.md',
  '08_자주쓰는응답예시.md',
  '09_견적출력템플릿.md',
  '10_예외처리규칙.md',
  '11_이미지해석가이드.md',
  '12_실제상담예시_초기응대.md',
  '13_실제상담예시_견적안내.md',
  '14_실제상담예시_이미지응대.md',
];

const mdContents = MD_FILES.map(file => {
  const filePath = path.join(__dirname, file);
  return fs.readFileSync(filePath, 'utf-8');
}).join('\n\n---\n\n');

const SYSTEM_PROMPT = `당신은 '루마네'라는 이름의 케이트블랑 시스템행거 전문 AI 상담사입니다.
아래 지침을 반드시 따르세요.

${mdContents}`;

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

// ── 상담 요약 저장 API ─────────────────────────────────────────
// chat.html에서 "상담 저장" 버튼 클릭 시 호출
// Claude가 대화 내용을 분석해서 기획서 항목대로 자동 추출 후 Supabase 저장
app.post('/api/summarize', async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages 배열이 필요합니다.' });
  }

  try {
    // Claude에게 대화 내용 분석 요청
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `당신은 시스템행거 상담 대화를 분석해서 고객 정보를 JSON으로 추출하는 역할입니다.
아래 형식의 JSON만 반환하세요. 대화에서 확인되지 않은 항목은 null로 표시하세요.
{
  "이름": null,
  "연락처": null,
  "설치지역": null,
  "공간가로mm": null,
  "공간세로mm": null,
  "공간높이mm": null,
  "공간형태": null,
  "추가옵션": null,
  "프레임색상": null,
  "선반색상": null,
  "요청사항": null,
  "개인정보동의": null,
  "상담요약": "한 문장으로 요약"
}`,
      messages: [
        {
          role: 'user',
          content: `다음 상담 대화를 분석해서 JSON으로 추출해주세요:\n\n${messages.map(m => `${m.role === 'user' ? '고객' : '루마네'}: ${m.content}`).join('\n')}`,
        },
      ],
    });

    const raw = response.content[0].text;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const summary = jsonMatch ? JSON.parse(jsonMatch[0]) : { 상담요약: raw };

    // Supabase에 대화 전체 + 요약 저장
    const { data, error } = await supabase
      .from('conversations')
      .insert([{ messages, summary }])
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ 상담 저장됨: ID ${data.id} / 고객: ${summary.이름 || '미확인'}`);
    res.json({ success: true, id: data.id, summary });

  } catch (err) {
    console.error('❌ 상담 요약 오류:', err.message);
    res.status(500).json({ error: '저장 중 오류가 발생했습니다.' });
  }
});

// ── 서버 시작 ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ 루마네 서버 실행 중: http://localhost:${PORT}`);
  console.log(`📱 채팅 화면: http://localhost:${PORT}/chat.html`);
});
