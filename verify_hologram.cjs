const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3500);
  const btns = await page.$$eval('button', els => els.map(e => e.textContent));
  const gi = btns.findIndex(t => t && t.toLowerCase().includes('get started'));
  if (gi >= 0) { await page.$$eval('button', (els, i) => els[i].click(), gi); }
  console.log('clicked Get Started');
  await page.waitForTimeout(13000);

  const diag = await page.evaluate(() => {
    const m = (window.__drishtiMaps || []).find(x => x && x.getSource && x.getSource('city-admin-boundary-source'));
    if (!m) return { error: 'no map/source' };
    return {
      srcFeatures: m.querySourceFeatures('city-admin-boundary-source').length,
      lineRendered: m.queryRenderedFeatures({ layers: ['city-boundary-line-layer'] }).length,
      extrRendered: m.queryRenderedFeatures({ layers: ['city-boundary-extrusion-layer'] }).length,
      zoom: +m.getZoom().toFixed(1),
      pitch: Math.round(m.getPitch())
    };
  });
  console.log(JSON.stringify(diag));
  const cyanPixels = await page.evaluate(() => {
    const canvases = document.querySelectorAll('.maplibregl-canvas');
    const c = canvases[canvases.length - 1];
    if (!c) return -1;
    const tmp = document.createElement('canvas');
    tmp.width = c.width; tmp.height = c.height;
    const ctx = tmp.getContext('2d');
    ctx.drawImage(c, 0, 0);
    const d = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
    let count = 0;
    for (let i = 0; i < d.length; i += 16) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (b > 120 && g > 90 && b > r + 40 && g > r + 20) count++;
    }
    return count * 16;
  });
  console.log('cyan-ish pixels:', cyanPixels);
  await page.screenshot({ path: 'C:/Users/bdurk/AppData/Local/Temp/opencode/hologram_final.png' });
  await browser.close();
})();
