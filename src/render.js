const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Sharp ?´ë?ì§€ ?„ì²˜ë¦?(?¤ì¹˜ ?¤íŒ¨ ??graceful fallback)
let imageProcessor = null;
try {
  imageProcessor = require('./image-processor');
  console.log('[RENDER] Sharp ?´ë?ì§€ ì²˜ë¦¬ ëª¨ë“ˆ ë¡œë“œ ?±ê³µ');
} catch (e) {
  console.warn('[RENDER] Sharp ë¯¸ì„¤ì¹????ë³¸ ?´ë?ì§€ ?¬ìš©:', e.message);
}

function getTemplate(platform, layout) {
  // layout: 'classic' (ê¸°ë³¸), 'magazine', 'poster', 'natural'
  var layoutSuffix = '';
  if (layout && layout !== 'classic') {
    layoutSuffix = '_' + layout;
  }

  var baseName = platform === 'naver' ? 'naver_860' : 'coupang_780';
  var templatePath = path.join(__dirname, '..', 'templates', `template_${baseName}${layoutSuffix}.html`);

  // ?ˆì´?„ì›ƒ ?œí”Œë¦¿ì´ ?†ìœ¼ë©?ê¸°ë³¸ ?œí”Œë¦¿ìœ¼ë¡?fallback
  if (fs.existsSync(templatePath)) {
    console.log(`[RENDER] ?œí”Œë¦?ë¡œë“œ: template_${baseName}${layoutSuffix}.html`);
    return fs.readFileSync(templatePath, 'utf-8');
  }

  console.log(`[RENDER] ?ˆì´?„ì›ƒ "${layout}" ?œí”Œë¦??†ìŒ ??ê¸°ë³¸ ?œí”Œë¦??¬ìš©`);
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

  // Sharp ?´ë?ì§€ ?„ì²˜ë¦?(?¤ì¹˜?˜ì–´ ?ˆìœ¼ë©?
  let processedUrls = imageUrls || [];
  if (imageProcessor && processedUrls.length > 0) {
    try {
      console.log(`[SHARP] ?´ë?ì§€ ${processedUrls.length}???„ì²˜ë¦??œìž‘`);
      const start = Date.now();
      processedUrls = await imageProcessor.preprocessImages(processedUrls);
      console.log(`[SHARP] ?„ì²˜ë¦??„ë£Œ (${Date.now() - start}ms)`);
    } catch (e) {
      console.error('[SHARP] ?„ì²˜ë¦??¤íŒ¨, ?ë³¸ ?¬ìš©:', e.message);
      processedUrls = imageUrls || [];
    }
  }

  // JSON + image_urls + design_style ì£¼ìž…
  console.log(`[RENDER] style_overrides:`, JSON.stringify(json.style_overrides || 'none'));
  let html = template.replace('__PRODUCT_DATA__', JSON.stringify(json));
  html = html.replace('__IMAGE_URLS__', JSON.stringify(processedUrls));
  html = html.replace('__DESIGN_STYLE__', JSON.stringify(designStyle || 'modern_red'));

  const tmpFile = path.join(require('os').tmpdir(), `render_${Date.now()}.html`);
  fs.writeFileSync(tmpFile, html);

  const b = await getBrowser();
  const page = await b.newPage();

  try {
    await page.setViewport({ width, height: 800, deviceScaleFactor: 2 });
    // ?œí”Œë¦?JS ì½˜ì†” ë¡œê·¸ ìº¡ì²˜ (ëª¨ë“  ë¡œê·¸)
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
