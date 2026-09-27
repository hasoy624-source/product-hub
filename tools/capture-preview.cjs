const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' });
    await page.goto('http://127.0.0.1:8010/#overview');
    await page.waitForFunction(() => document.querySelector('.metrics') && !document.querySelector('button[aria-label="刷新数据"]').disabled);
    await page.screenshot({ path: path.resolve(__dirname, '../docs/系统预览.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.resolve(__dirname, '../docs/手机预览.png'), animations: 'disabled' });
    console.log('Preview screenshots saved: docs/系统预览.png; docs/手机预览.png');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
