const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// HTML 템플릿 (인라인 — 외부 파일 의존성 제거)
function getTemplate(platform) {
  const width = platform === 'naver' ? 860 : 780;
  
  // 템플릿 파일 읽기
  const templatePath = path.join(__dirname, '..', 'templates', `template_${platform === 'naver' ? 'naver_860' : 'coupang_780'}.html`);
  
  // 파일이 있으면 파일 사용, 없으면 기본 쿠팡 템플릿
  if (fs.existsSync(templatePath)) {
    return fs.readFileSync(templatePath, 'utf-8');
  }
  
  // 기본 템플릿 (coupang 780)
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

async function renderSlides(json, platform) {
  const width = platform === 'naver' ? 860 : 780;
  const template = getTemplate(platform);
  
  // JSON 주입
  const html = template.replace('__PRODUCT_DATA__', JSON.stringify(json));
  
  // 임시 파일로 저장
  const tmpFile = path.join('/tmp', `render_${Date.now()}.html`);
  fs.writeFileSync(tmpFile, html);

  const b = await getBrowser();
  const page = await b.newPage();
  
  try {
    await page.setViewport({ width, height: 800, deviceScaleFactor: 2 });
    await page.goto(`file://${tmpFile}`, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 500));

    // 슬라이드 위치 계산
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

    // 각 슬라이드 캡처
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
    // 임시 파일 삭제
    try { fs.unlinkSync(tmpFile); } catch(e) {}
  }
}

module.exports = { renderSlides };
