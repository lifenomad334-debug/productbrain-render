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

function getTemplate(platform) {
  const templatePath = path.join(__dirname, '..', 'templates', `template_${platform === 'naver' ? 'naver_860' : 'coupang_780'}.html`);
  if (fs.existsSync(templatePath)) {
    return fs.readFileSync(templatePath, 'utf-8');
  }
  return fs.readFileSync(path.join(__dirname, '..', 'templates', 'template_coupang_780.html'), 'utf-8');
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

async function renderSlides(json, platform, imageUrls, designStyle) {
  const width = platform === 'naver' ? 860 : 780;
  const template = getTemplate(platform);

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
  let html = template.replace('__PRODUCT_DATA__', JSON.stringify(json));
  html = html.replace('__IMAGE_URLS__', JSON.stringify(processedUrls));
  html = html.replace('__DESIGN_STYLE__', JSON.stringify(designStyle || 'modern_red'));

  const tmpFile = path.join('/tmp', `render_${Date.now()}.html`);
  fs.writeFileSync(tmpFile, html);

  const b = await getBrowser();
  const page = await b.newPage();

  try {
    await page.setViewport({ width, height: 800, deviceScaleFactor: 2 });
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
