/**
 * 드레스룸 이미지 → Supabase Storage 업로드 스크립트
 * 실행: node scripts/upload-dressroom.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const BUCKET = 'dressroom';
const LOCAL_DIR = path.join(__dirname, '..', '드레스룸');

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some(b => b.name === BUCKET);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (error) throw new Error('버킷 생성 실패: ' + error.message);
    console.log(`✅ 버킷 '${BUCKET}' 생성 완료`);
  } else {
    console.log(`✅ 버킷 '${BUCKET}' 이미 존재`);
  }
}

function collectFiles(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const e of entries) {
    const fullPath = path.join(dir, e.name);
    const relPath = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) {
      files = files.concat(collectFiles(fullPath, relPath));
    } else if (/\.(jpg|jpeg|png)$/i.test(e.name)) {
      files.push({ fullPath, relPath });
    }
  }
  return files;
}

async function upload() {
  await ensureBucket();

  const files = collectFiles(LOCAL_DIR);
  console.log(`📁 총 ${files.length}개 이미지 업로드 시작...`);

  let success = 0, skip = 0, fail = 0;

  for (let i = 0; i < files.length; i++) {
    const { fullPath, relPath } = files[i];
    const storagePath = relPath.replace(/\\/g, '/');
    const fileBuffer = fs.readFileSync(fullPath);
    const contentType = /\.png$/i.test(relPath) ? 'image/png' : 'image/jpeg';

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, { contentType, upsert: true });

    if (error) {
      console.error(`❌ 실패 [${i + 1}/${files.length}] ${storagePath}: ${error.message}`);
      fail++;
    } else {
      success++;
      if (success % 20 === 0 || i === files.length - 1) {
        console.log(`  ✔ ${i + 1}/${files.length} 완료 (성공:${success} 실패:${fail})`);
      }
    }
  }

  console.log(`\n🎉 업로드 완료 — 성공: ${success}, 실패: ${fail}`);
}

upload().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
