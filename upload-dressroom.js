const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const LOCAL_FOLDER = path.join(__dirname, '드레스룸');
const BUCKET = 'dressroom';

// 파일명에서 옵션 키워드 추출
const OPTION_KEYWORDS = [
  '거울장', '서랍장', '3단서랍', '4단서랍', '2단서랍', '5단서랍', '6단서랍',
  '아일랜드', '스타일러', '화장대', '이불반장', '바지걸이', '악세사리',
  '코너선반', '코너', '긴옷', '행거', '선반'
];

function parseFilename(relativePath) {
  const parts = relativePath.split('/');
  // parts[0] = 형태 폴더 (ㄱ자, ㄷ자, ...)
  // parts[1] = 칸수 폴더 (4칸, 6칸, ...)
  // parts[last] = 파일명

  const shape = parts[0] || '';
  const unitsMatch = (parts[1] || '').match(/(\d+)칸/);
  const units = unitsMatch ? parseInt(unitsMatch[1]) : null;

  const filename = parts[parts.length - 1];
  const options = OPTION_KEYWORDS.filter(kw => filename.includes(kw));

  return { shape, units, options };
}

function getAllFiles(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const localPath = path.join(dir, entry.name);
    const relativePath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...getAllFiles(localPath, relativePath));
    } else {
      files.push({ localPath, relativePath });
    }
  }
  return files;
}

async function upload() {
  const files = getAllFiles(LOCAL_FOLDER);
  console.log(`총 ${files.length}개 파일 업로드 시작...\n`);

  let success = 0;
  let fail = 0;

  for (const { localPath, relativePath } of files) {
    const ext = path.extname(localPath).toLowerCase();
    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    const storageKey = `${randomUUID()}${ext}`;
    const fileBuffer = fs.readFileSync(localPath);

    // 1. Storage 업로드
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storageKey, fileBuffer, { contentType, upsert: true });

    if (uploadError) {
      console.log(`❌ 업로드 실패: ${relativePath} — ${uploadError.message}`);
      fail++;
      continue;
    }

    const url = `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storageKey}`;
    const { shape, units, options } = parseFilename(relativePath);

    // 2. DB 저장
    const { error: dbError } = await supabase
      .from('dressroom_images')
      .insert({ storage_key: storageKey, url, shape, units, options, original_name: relativePath });

    if (dbError) {
      console.log(`❌ DB 저장 실패: ${relativePath} — ${dbError.message}`);
      fail++;
    } else {
      console.log(`✅ ${relativePath} → shape:${shape} units:${units} options:[${options.join(',')}]`);
      success++;
    }
  }

  console.log(`\n완료! 성공: ${success}개, 실패: ${fail}개`);
}

upload();
