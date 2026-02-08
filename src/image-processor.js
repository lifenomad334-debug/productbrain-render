const sharp = require('sharp');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

/**
 * URL에서 이미지를 다운로드하고 Sharp 버퍼로 변환
 */
async function fetchImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * 이미지를 지정 폭으로 리사이즈 (비율 유지)
 */
async function resizeImage(buffer, width = 780) {
  return sharp(buffer)
    .resize(width, null, { fit: 'inside', withoutEnlargement: true })
    .toBuffer();
}

/**
 * 이미지 하단에 그라데이션 페이드 오버레이 추가
 * → problem 섹션 상단 이미지에 사용
 */
async function addGradientOverlay(buffer, width = 780, height = 520) {
  const resized = await sharp(buffer)
    .resize(width, height, { fit: 'cover' })
    .toBuffer();

  const gradientSvg = `<svg width="${width}" height="${height}">
    <defs>
      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(0,0,0,0)" />
        <stop offset="60%" stop-color="rgba(0,0,0,0)" />
        <stop offset="100%" stop-color="rgba(0,0,0,0.55)" />
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#grad)" />
  </svg>`;

  return sharp(resized)
    .composite([{ input: Buffer.from(gradientSvg), blend: 'over' }])
    .png()
    .toBuffer();
}

/**
 * 이미지를 약간 어둡게 (텍스트 가독성용)
 * brightness: 0.0~1.0 (1.0 = 원본, 0.7 = 30% 어둡게)
 */
async function darkenImage(buffer, brightness = 0.75) {
  return sharp(buffer)
    .modulate({ brightness })
    .toBuffer();
}

/**
 * detail 좌우 교차용: 이미지를 정사각형에 가깝게 크롭
 */
async function cropForDetail(buffer, width = 390, height = 400) {
  return sharp(buffer)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();
}

/**
 * hero 이미지: 780x780 정사각형 contain (배경색 포함)
 */
async function processHeroImage(buffer, size = 780, bgColor = '#F8F8FA') {
  return sharp(buffer)
    .resize(size, size, { fit: 'contain', background: bgColor })
    .png()
    .toBuffer();
}

/**
 * 전체 이미지 배열을 전처리
 * 각 이미지를 역할에 맞게 가공 후 base64 data URL로 반환
 */
async function preprocessImages(imageUrls) {
  if (!imageUrls || imageUrls.length === 0) return [];
  
  const processed = [];
  
  for (let i = 0; i < imageUrls.length; i++) {
    try {
      const raw = await fetchImage(imageUrls[i]);
      let result;
      
      if (i === 0) {
        // hero: 정사각형 contain
        result = await processHeroImage(raw);
      } else if (i <= 3) {
        // detail 1~3: 좌우 교차용 크롭
        result = await cropForDetail(raw);
      } else if (i === 4) {
        // problem 상단: 그라데이션 오버레이
        result = await addGradientOverlay(raw);
      } else {
        // 나머지: 780px 리사이즈
        result = await resizeImage(raw);
      }
      
      const b64 = result.toString('base64');
      processed.push(`data:image/png;base64,${b64}`);
      console.log(`[SHARP] 이미지 ${i} 처리 완료 (${Math.round(result.length/1024)}KB)`);
    } catch (err) {
      console.error(`[SHARP] 이미지 ${i} 처리 실패:`, err.message);
      // 실패 시 원본 URL 그대로 사용
      processed.push(imageUrls[i]);
    }
  }
  
  return processed;
}

module.exports = {
  fetchImage,
  resizeImage,
  addGradientOverlay,
  darkenImage,
  cropForDetail,
  processHeroImage,
  preprocessImages,
};
