const express = require('express');
const cors = require('cors');
const { renderSlides } = require('./render');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'productbrain-render' });
});

// 메인 렌더링 API
app.post('/api/render', async (req, res) => {
  try {
    const { json, platform, image_urls, design_style, layout } = req.body;

    if (!json || !platform) {
      return res.status(400).json({ error: 'json과 platform은 필수' });
    }

    console.log(`[RENDER] 시작: ${json.hero?.product_title || 'unknown'} (${platform}), 이미지: ${(image_urls||[]).length}장, 스타일: ${design_style || 'modern_red'}, 레이아웃: ${layout || 'classic'}`);
    const start = Date.now();

    const result = await renderSlides(json, platform, image_urls || [], design_style || 'modern_red', layout || 'classic');

    const render_time_ms = Date.now() - start;
    console.log(`[RENDER] 완료: ${result.slides.length}장, ${render_time_ms}ms`);

    res.json({
      slides: result.slides,
      render_time_ms,
    });
  } catch (err) {
    console.error('[RENDER] 오류:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ProductBrain Render Server running on port ${PORT}`);
});
