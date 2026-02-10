const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Sharp 이미지 전처리 (설치 실패 시 graceful fallback)
let imageProcessor = null;
try {
  imageProcessor = require('./image-processor');
  console.log('[RENDER] Sharp 이미지 처리 모듈 로드 성공');
} catch (e) {
  console.warn('[RENDER] Sharp 미설치 — 원본 이미지 사용:', e.message);
}

function getTemplate(platform, layout) {
  // layout: 'classic' (기본), 'magazine', 'poster', 'natural'
  var layoutSuffix = '';
  if (layout && layout !== 'classic') {
    layoutSuffix = '_' + layout;
  }

  var baseName = platform === 'naver' ? 'naver_860' : 'coupang_780';
  var templatePath = path.join(__dirname, '..', 'templates', `template_${baseName}${layoutSuffix}.html`);

  // 레이아웃 템플릿이 없으면 기본 템플릿으로 fallback
  if (fs.existsSync(templatePath)) {
    console.log(`[RENDER] 템플릿 로드: template_${baseName}${layoutSuffix}.html`);
    return fs.readFileSync(templatePath, 'utf-8');
  }

  console.log(`[RENDER] 레이아웃 "${layout}" 템플릿 없음 → 기본 템플릿 사용`);
  return fs.readFileSync(path.join(__dirname, '..', 'templates', `template_${baseName}.html`), 'utf-8');
}

let browser = null;

async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--font-render-hinting=none',
      ],
    });
  }
  return browser;
}

async function renderSlides(json, platform, imageUrls, designStyle, layout) {
  const width = platform === 'naver' ? 860 : 780;
  const template = getTemplate(platform, layout);

  // Sharp 이미지 전처리 (설치되어 있으면)
  let processedUrls = imageUrls || [];
  if (imageProcessor && processedUrls.length > 0) {
    try {
      console.log(`[SHARP] 이미지 ${processedUrls.length}장 전처리 시작`);
      const start = Date.now();
      processedUrls = await imageProcessor.preprocessImages(processedUrls);
      console.log(`[SHARP] 전처리 완료 (${Date.now() - start}ms)`);
    } catch (e) {
      console.error('[SHARP] 전처리 실패, 원본 사용:', e.message);
      processedUrls = imageUrls || [];
    }
  }

  // JSON + image_urls + design_style 주입
  console.log(`[RENDER] style_overrides:`, JSON.stringify(json.style_overrides || 'none'));
  let html = template.replace('__PRODUCT_DATA__', JSON.stringify(json));
  html = html.replace('__IMAGE_URLS__', JSON.stringify(processedUrls));
  html = html.replace('__DESIGN_STYLE__', JSON.stringify(designStyle || 'modern_red'));

  const tmpFile = path.join('/tmp', `render_${Date.now()}.html`);
  fs.writeFileSync(tmpFile, html);

  const b = await getBrowser();
  const page = await b.newPage();

  try {
    await page.setViewport({ width, height: 800, deviceScaleFactor: 2 });
    // 템플릿 JS 콘솔 로그 캡처 (모든 로그)
    page.on('console', msg => {
      console.log(`[PUPPETEER] ${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', err => {
      console.log(`[PUPPETEER ERROR] ${err.message}`);
    });
    
    await page.goto(`file://${tmpFile}`, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 500));

    const slides = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-slide-id]'))
        .filter(el => el.offsetHeight > 0)
        .map((el, i) => {
          const r = el.getBoundingClientRect();
          return {
            id: el.getAttribute('data-slide-id'),
            x: r.x, y: r.y, w: r.width, h: r.height,
            order: i
          };
        })
    );

    const results = [];
    for (const s of slides) {
      const buffer = await page.screenshot({
        clip: { x: s.x, y: s.y, width: s.w, height: s.h },
        type: 'png',
      });
      results.push({
        slide_id: s.id,
        slide_order: s.order,
        width: Math.round(s.w * 2),
        height: Math.round(s.h * 2),
        file_size_kb: Math.round(buffer.length / 1024),
        base64: buffer.toString('base64'),
      });
    }

    return { slides: results };
  } finally {
    await page.close();
    try { fs.unlinkSync(tmpFile); } catch(e) {}
  }
}

module.exports = { renderSlides };
