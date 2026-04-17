// ================================================================
//  루마네 AI 상담 서버
//  - Express + Anthropic API + Supabase DB
//  - chat.html 과 함께 사용
// ================================================================

require('dotenv').config(); // .env 파일 로드

const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { Client: NotionClient } = require('@notionhq/client');
const multer = require('multer');
const fs   = require('fs');
const path = require('path');

// ── Supabase 클라이언트 ───────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// ── Notion 클라이언트 ─────────────────────────────────────────
const notion = new NotionClient({ auth: process.env.NOTION_TOKEN });
const NOTION_DB_ID = '221b622e-5115-4d07-b1fa-ed7fa52c6895'; // 상담 기록 DB

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
  '15_예시이미지_트리거규칙.md',
];

const mdContents = MD_FILES.map(file => {
  const filePath = path.join(__dirname, file);
  return fs.readFileSync(filePath, 'utf-8');
}).join('\n\n---\n\n');

const SYSTEM_PROMPT = `당신은 '루마네'라는 이름의 케이트블랑 시스템행거 전문 상담사입니다.
아래 지침을 반드시 따르세요.

자신이 AI·챗봇·인공지능임을 절대 먼저 밝히지 않는다. 고객이 직접 물어볼 경우에만 솔직하게 답한다.
자기소개 시 "저는 케이트블랑 드레스룸 상담을 담당하고 있는 루마네입니다" 형식으로만 소개한다.

${mdContents}`;

// ── 미들웨어 ──────────────────────────────────────────────────
app.use(cors({
  origin: [
    'https://lumane-server.onrender.com',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ],
}));
app.use(express.json());

// ── Rate Limit — IP당 1분 10회 제한 ──────────────────────────
const chatRateLimit = rateLimit({
  windowMs: 60 * 1000,   // 1분
  max: 10,               // 최대 10회
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    console.warn(`🚫 Rate limit 초과: ${req.ip}`);
    res.status(429).json({
      error: '잠시 후 다시 시도해 주세요. (1분에 최대 10회 전송 가능)',
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Admin API 인증 미들웨어 ───────────────────────────────────
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) {
    // 토큰 미설정 시 서버 콘솔에 경고 (운영 중엔 항상 설정할 것)
    console.warn('⚠️  ADMIN_TOKEN이 .env에 설정되지 않았습니다. Admin API가 무방비 상태입니다.');
    return next();
  }
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${ADMIN_TOKEN}`) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }
  next();
}

// 모든 /api/admin/* 라우트에 인증 적용
app.use('/api/admin', requireAdmin);

// ── 라이브 세션 관리 (메모리) ─────────────────────────────────
// 서버 재시작 시 초기화됨. 필요 시 Supabase로 이전 가능.
const sessions = new Map();
// 구조: Map<sessionId, {
//   id, mode: 'ai'|'admin', messages: [],
//   pendingAdminMsgs: [], customerName: null,
//   startedAt: Date, lastActivity: Date
// }>

function getOrCreateSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      id: sessionId,
      mode: 'ai',
      messages: [],
      pendingAdminMsgs: [],
      customerName: null,
      startedAt: new Date(),
      lastActivity: new Date(),
      lastReadAt: null,
      adminTyping: false,     // 상담원이 입력 중 여부
    });
  }
  return sessions.get(sessionId);
}

// 30분 이상 비활성 세션 정리 (메모리 관리)
setInterval(() => {
  const now = Date.now();
  for (const [id, sess] of sessions) {
    if (now - sess.lastActivity > 30 * 60 * 1000) sessions.delete(id);
  }
}, 5 * 60 * 1000);

// ── 정적 파일 제공 — HTML/JS/CSS는 캐시 안 함 (항상 최신 버전) ──
app.use(express.static(__dirname, {
  setHeaders(res, filePath) {
    if (/\.(html|js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// ── 헬스 체크 ─────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '루마네 서버 정상 작동 중' });
});

// ── 이전 상담 이력 조회 API (전화번호로 필터링) ───────────────
app.get('/api/consultation-history', async (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: 'phone 파라미터가 필요합니다' });

  const cleanPhone = phone.replace(/[-\s]/g, '');

  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('id, created_at, messages, summary')
      .not('summary', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;

    // 전화번호 정규화 후 필터링
    const filtered = (data || []).filter(row => {
      const p = (row.summary?.연락처 || '').replace(/[-\s]/g, '');
      return p && p === cleanPhone;
    });

    res.json({ consultations: filtered });
  } catch (err) {
    console.error('이력 조회 오류:', err.message);
    res.status(500).json({ error: '조회 중 오류가 발생했습니다' });
  }
});

// ── 버전 체크 (배포 자동감지용) ───────────────────────────────
// 서버 시작 시각 = 버전. 배포마다 서버가 재시작되므로 값이 달라짐.
const SERVER_VERSION = Date.now().toString();
app.get('/api/version', (req, res) => {
  res.json({ v: SERVER_VERSION });
});

// ── 파일 업로드 (multer) ──────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = Date.now() + '-' + Math.random().toString(36).slice(2, 7) + ext;
    cb(null, name);
  },
});
const uploadMw = multer({
  storage: uploadStorage,
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(jpe?g|png|gif|webp|pdf)$/i.test(path.extname(file.originalname));
    cb(ok ? null : new Error('지원하지 않는 형식'), ok);
  },
});

app.post('/api/upload', uploadMw.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다' });
  const ext     = path.extname(req.file.originalname).toLowerCase();
  const isImage = /\.(jpe?g|png|gif|webp)$/i.test(ext);
  res.json({
    success: true,
    url:     `/uploads/${req.file.filename}`,
    name:    req.file.originalname,
    isImage,
  });
});

// uploads 폴더 정적 제공
app.use('/uploads', express.static(UPLOAD_DIR));

// ── OG 링크 미리보기 API ─────────────────────────────────────
app.get('/api/og', async (req, res) => {
  const { url } = req.query;
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'url 파라미터가 필요합니다' });
  }

  // YouTube: oEmbed API로 제목 + 썸네일 가져오기
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    try {
      const videoId = ytMatch[1];
      const oEmbed  = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (oEmbed.ok) {
        const d = await oEmbed.json();
        return res.json({
          title:       d.title || '',
          description: d.author_name ? `${d.author_name} · YouTube` : 'YouTube',
          image:       `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
          domain:      'youtube.com',
        });
      }
    } catch { /* oEmbed 실패 시 일반 방식으로 폴백 */ }
  }

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LumaneBot/1.0)' },
      signal:  AbortSignal.timeout(5000),
    });
    const html = await resp.text();

    // HTML 엔티티 디코딩 (&amp; → & 등)
    const decodeHtml = s => s
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

    const getMeta = (...names) => {
      for (const n of names) {
        const m = html.match(new RegExp(
          `<meta[^>]+(?:property|name)=["']${n}["'][^>]+content=["']([^"'<>]+)["']`, 'i'
        )) || html.match(new RegExp(
          `<meta[^>]+content=["']([^"'<>]+)["'][^>]+(?:property|name)=["']${n}["']`, 'i'
        ));
        if (m?.[1]) return decodeHtml(m[1].trim());
      }
      return '';
    };

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const rawImage   = getMeta('og:image', 'twitter:image');
    let image = '';
    if (rawImage) {
      try { image = new URL(rawImage, url).href; } catch { image = rawImage; }
    }

    const title = getMeta('og:title', 'twitter:title') || decodeHtml(titleMatch?.[1]?.trim() || '');
    const description = getMeta('og:description', 'description', 'twitter:description');
    const domain = new URL(url).hostname.replace(/^www\./, '');

    // 제목이 URL 자체이거나 없으면 도메인만 표시 (YouTube 등 봇 차단 사이트 대응)
    const cleanTitle = (title && !title.startsWith('http')) ? title : '';

    res.json({ title: cleanTitle, description, image, domain });
  } catch {
    res.status(500).json({ error: '미리보기를 가져오지 못했습니다' });
  }
});

// ── 예시 이미지 매칭 API ──────────────────────────────────────
// 고객 형태·칸수·옵션 기반으로 드레스룸 폴더에서 가장 유사한 이미지를 반환
app.get('/api/find-example', (req, res) => {
  const { shape = '', units = '', options = '' } = req.query;
  const drPath = path.join(__dirname, '드레스룸');
  const optList = options.split(',').map(s => s.trim()).filter(Boolean);
  const unitsNum = parseInt(units) || 0;

  let best = null;
  let bestScore = -1;

  function scoreFile(relPath) {
    let score = 0;
    // 형태 일치 (최우선)
    if (shape && relPath.includes(shape)) score += 100;
    // 칸수 근접도
    if (unitsNum > 0) {
      const m = relPath.match(/[\/\\](\d+)칸[\/\\]/);
      if (m) {
        const diff = Math.abs(parseInt(m[1]) - unitsNum);
        score += Math.max(0, 50 - diff * 15);
      }
    }
    // 옵션 키워드 매칭
    for (const opt of optList) {
      if (relPath.includes(opt)) score += 20;
    }
    return score;
  }

  function walk(dir, relDir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel  = relDir + '/' + e.name;
      if (e.isDirectory()) {
        walk(full, rel);
      } else if (/\.(jpg|jpeg|png)$/i.test(e.name)) {
        const score = scoreFile(rel);
        if (score > bestScore) { bestScore = score; best = rel; }
      }
    }
  }

  try {
    walk(drPath, '/드레스룸');
    if (best) {
      res.json({ success: true, url: best, score: bestScore });
    } else {
      res.json({ success: false });
    }
  } catch (err) {
    console.error('예시 이미지 매칭 오류:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Haiku 사전 필터 — 관련 없는 메시지 차단 ─────────────────
async function isRelevantMessage(userMessage) {
  try {
    const check = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      system: `당신은 메시지가 드레스룸·시스템행거·인테리어 상담과 관련 있는지 판단합니다.
관련 있으면 "YES", 없으면 "NO"만 반환하세요.
관련 있는 예시: 치수 문의, 색상 선택, 가격 질문, 설치 지역, 옵션 질문, 인사말, 감사 인사, 네/아니오 답변, 숫자만 입력.
관련 없는 예시: 정치, 연예인, 음식, 게임, 욕설, 전혀 무관한 잡담.`,
      messages: [{ role: 'user', content: `메시지: "${userMessage}"` }],
    });
    return check.content[0].text.trim().toUpperCase().startsWith('YES');
  } catch {
    return true; // 필터 오류 시 통과 (서비스 중단 방지)
  }
}

// ── 채팅 API ──────────────────────────────────────────────────
app.post('/api/chat', chatRateLimit, async (req, res) => {
  const { messages, sessionId, syncOnly } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages 배열이 필요합니다.' });
  }

  // 세션이 있으면 메시지 동기화
  if (sessionId) {
    const sess = getOrCreateSession(sessionId);
    sess.messages = messages;
    sess.lastActivity = new Date();

    // 고객 이름 자동 추출 (첫 번째 user 메시지)
    const firstUser = messages.find(m => m.role === 'user');
    if (firstUser && !sess.customerName) {
      sess.customerName = firstUser.content.slice(0, 20);
    }

    // syncOnly: 히스토리만 동기화하고 AI 응답 없이 반환
    if (syncOnly) {
      return res.json({ ok: true, synced: messages.length });
    }

    // admin 모드면 AI 응답 없이 대기 신호만 반환
    if (sess.mode === 'admin') {
      return res.json({ message: null, adminMode: true });
    }
  }

  // ── Haiku 사전 필터: 마지막 user 메시지만 검사 ──────────────
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (lastUserMsg) {
    const relevant = await isRelevantMessage(lastUserMsg.content);
    if (!relevant) {
      console.warn(`🚫 관련 없는 메시지 차단 (IP: ${req.ip}): "${lastUserMsg.content.slice(0, 40)}"`);
      const canned = '죄송해요, 저는 케이트블랑 드레스룸 상담만 도와드릴 수 있어요 😊\n드레스룸 관련 질문이 있으시면 편하게 말씀해 주세요!';
      if (sessionId && sessions.has(sessionId)) {
        sessions.get(sessionId).messages.push({ role: 'assistant', content: canned });
        sessions.get(sessionId).lastActivity = new Date();
      }
      return res.json({ message: canned });
    }
  }

  // Anthropic API는 messages가 비어있으면 에러 — 첫 인사 요청 시 트리거 메시지 삽입
  const apiMessages = messages.length === 0
    ? [{ role: 'user', content: '상담 시작' }]
    : messages;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },  // 시스템 프롬프트 캐싱 (5분간 유지, 재사용 시 90% 절감)
        },
      ],
      messages: apiMessages,
    });

    const reply = response.content[0].text;

    // 세션에 AI 응답도 저장
    if (sessionId && sessions.has(sessionId)) {
      const sess = sessions.get(sessionId);
      sess.messages.push({ role: 'assistant', content: reply });
      sess.lastActivity = new Date();
    }

    res.json({ message: reply });

  } catch (err) {
    console.error('Anthropic API 오류:', err.message);

    // 고객에게는 담당자 연결 안내 메시지 표시 (API 크레딧 부족 등 오류 숨김)
    const fallback = '잠시만요! 😊\n담당자를 연결해 드리겠습니다.\n곧 직접 안내해 드릴게요, 조금만 기다려 주세요 🙏';
    if (sessionId && sessions.has(sessionId)) {
      sessions.get(sessionId).messages.push({ role: 'assistant', content: fallback });
      sessions.get(sessionId).lastActivity = new Date();
    }
    res.json({ message: fallback });
  }
});

// ── 세션 등록 API ─────────────────────────────────────────────
app.post('/api/session/register', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId || !SESSION_ID_RE.test(sessionId)) {
    return res.status(400).json({ error: '유효하지 않은 sessionId' });
  }
  getOrCreateSession(sessionId);
  res.json({ ok: true });
});

// ── 세션 상태 폴링 API (고객 → 서버, 2초마다) ─────────────────
// 고객이 admin 난입 여부와 pending 메시지를 확인
const SESSION_ID_RE = /^S-\d{13}-[a-z0-9]{5}$/;

app.get('/api/session/status', (req, res) => {
  const { id } = req.query;
  if (!id || !SESSION_ID_RE.test(id) || !sessions.has(id)) {
    return res.json({ mode: 'ai', pendingMsgs: [] });
  }

  const sess = sessions.get(id);
  sess.lastActivity = new Date();

  // pending 메시지를 한 번에 전달하고 비움
  const pending = [...sess.pendingAdminMsgs];
  sess.pendingAdminMsgs = [];

  res.json({ mode: sess.mode, pendingMsgs: pending, adminLastRead: sess.lastReadAt || null, adminTyping: sess.adminTyping || false });
});

// ── 어드민: 활성 세션 목록 ────────────────────────────────────
app.get('/api/admin/sessions', (req, res) => {
  const list = [];
  for (const [id, sess] of sessions) {
    list.push({
      id,
      mode: sess.mode,
      customerName: sess.customerName || '(이름 미수집)',
      messageCount: sess.messages.length,
      startedAt: sess.startedAt,
      lastActivity: sess.lastActivity,
    });
  }
  // 최근 활동 순 정렬
  list.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
  res.json({ sessions: list });
});

// ── 어드민: 특정 세션 전체 메시지 조회 ───────────────────────
app.get('/api/admin/session/:id', (req, res) => {
  const sess = sessions.get(req.params.id);
  if (!sess) return res.status(404).json({ error: '세션 없음' });
  sess.lastReadAt = new Date().toISOString(); // 상담원이 세션을 봤으므로 읽음 처리
  res.json({ session: sess });
});

// ── 어드민: 타이핑 상태 업데이트 ────────────────────────────
app.post('/api/admin/typing', (req, res) => {
  const { sessionId, typing } = req.body;
  const sess = sessions.get(sessionId);
  if (!sess) return res.status(404).json({ error: '세션 없음' });
  sess.adminTyping = !!typing;
  res.json({ ok: true });
});

// ── 어드민: 난입 (AI → admin 모드 전환) ──────────────────────
app.post('/api/admin/takeover', (req, res) => {
  const { sessionId } = req.body;
  const sess = sessions.get(sessionId);
  if (!sess) return res.status(404).json({ error: '세션 없음' });

  sess.mode = 'admin';
  sess.lastActivity = new Date();
  console.log(`🎯 Admin 난입: 세션 ${sessionId}`);
  res.json({ ok: true });
});

// ── 어드민: 돌려주기 (admin → AI 모드 복귀) ─────────────────
app.post('/api/admin/release', (req, res) => {
  const { sessionId } = req.body;
  const sess = sessions.get(sessionId);
  if (!sess) return res.status(404).json({ error: '세션 없음' });

  sess.mode = 'ai';
  sess.lastActivity = new Date();
  console.log(`🤖 AI 복귀: 세션 ${sessionId}`);
  res.json({ ok: true });
});

// ── 어드민: 메시지 전송 ───────────────────────────────────────
app.post('/api/admin/message', (req, res) => {
  const { sessionId, message } = req.body;
  if (!sessionId || !message) return res.status(400).json({ error: 'sessionId, message 필요' });

  const sess = sessions.get(sessionId);
  if (!sess) return res.status(404).json({ error: '세션 없음' });

  const msg = { role: 'assistant', content: message, fromAdmin: true, time: new Date().toISOString() };
  sess.pendingAdminMsgs.push(msg);
  sess.messages.push(msg);
  sess.lastActivity = new Date();

  res.json({ ok: true });
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
      system: `당신은 시스템행거 상담 대화를 분석해서 견적서 항목을 JSON으로 추출하는 역할입니다.
아래 형식의 JSON만 반환하세요. 대화에서 확인되지 않은 항목은 null로 표시하세요.
추가옵션 항목은 대화에서 언급된 것만 true, 언급 없으면 false로 표시하세요.
드레스룸형태는 ㄱ자/ㄴ자/ㄷ자/ㅡ자/11자/기타 중 하나로만 표시하세요.
치수는 가로/세로/높이를 숫자(mm)로 분리해서 표시하세요.
{
  "이름": null,
  "연락처": null,
  "주소": null,
  "드레스룸형태": null,
  "가로": null,
  "세로": null,
  "높이": null,
  "결제방식": null,
  "프레임색상": null,
  "선반색상": null,
  "천장커튼박스": false,
  "내용": null,
  "아일랜드장": false,
  "거울장": false,
  "2단서랍": false,
  "3단서랍": false,
  "악세사리장": false,
  "기둥추가": false,
  "배송비": null,
  "참고사항": null,
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

    // ── Notion 저장 ───────────────────────────────────────────
    if (process.env.NOTION_TOKEN) {
      try {
        // 선택된 옵션 목록 수집
        const optionMap = {
          '아일랜드장': summary.아일랜드장,
          '거울장':     summary.거울장,
          '2단 서랍장': summary['2단서랍'],
          '3단 서랍장': summary['3단서랍'],
          '악세사리장': summary.악세사리장,
          '추가 기둥':  summary.기둥추가,
        };
        const selectedOptions = Object.entries(optionMap)
          .filter(([, v]) => v)
          .map(([k]) => ({ name: k }));

        await notion.pages.create({
          parent: { database_id: NOTION_DB_ID },
          properties: {
            '고객명':       { title: [{ text: { content: summary.이름 || '미확인' } }] },
            '연락처':       { phone_number: summary.연락처 || null },
            '지역':         { rich_text: [{ text: { content: summary.주소 || '' } }] },
            '드레스룸형태': summary.드레스룸형태
              ? { select: { name: summary.드레스룸형태 } } : undefined,
            '가로(mm)':     summary.가로  ? { number: Number(summary.가로) }  : undefined,
            '세로(mm)':     summary.세로  ? { number: Number(summary.세로) }  : undefined,
            '높이(mm)':     summary.높이  ? { number: Number(summary.높이) }  : undefined,
            '프레임색상':   { rich_text: [{ text: { content: summary.프레임색상 || '' } }] },
            '선반색상':     { rich_text: [{ text: { content: summary.선반색상 || '' } }] },
            '요청사항':     { rich_text: [{ text: { content: summary.참고사항 || '' } }] },
            '대화요약':     { rich_text: [{ text: { content: summary.상담요약 || '' } }] },
            '옵션':         selectedOptions.length ? { multi_select: selectedOptions } : undefined,
            '상담날짜':     { date: { start: new Date().toISOString().split('T')[0] } },
            '상담상태':     { select: { name: '견적완료' } },
          },
        });
        console.log(`📋 Notion 저장됨: ${summary.이름 || '미확인'}`);
      } catch (notionErr) {
        // Notion 저장 실패해도 상담 저장은 성공으로 처리
        console.error('⚠️ Notion 저장 실패 (Supabase는 정상):', notionErr.message);
      }
    }

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
