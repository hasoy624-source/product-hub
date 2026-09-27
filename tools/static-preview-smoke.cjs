/* Verifies the production-built preview served at /product-hub/ without FastAPI. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = (process.env.PREVIEW_BASE_URL || 'http://127.0.0.1:4173/product-hub/').replace(/\/$/, '/');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
    const errors = []
    const apiNetwork = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => { if (/\/api\//.test(request.url())) apiNetwork.push(request.url()) })
    await page.goto(base)
    await page.getByRole('heading', { name: '工作台总览', level: 1 }).waitFor()
    await page.getByText(/演示模式：初始示例数据为虚构/).waitFor()
    await page.getByRole('link', { name: '产品与销售' }).click()
    await page.getByRole('heading', { name: '品类销售结构' }).waitFor()
    const categoryCount = await page.locator('.category-row').count()
    assert.ok(categoryCount >= 3, `expected seeded category data, got ${categoryCount}`)
    await page.getByRole('link', { name: '报告与任务' }).click()
    await page.getByRole('heading', { name: '报告档案' }).waitFor()
    await page.getByRole('button', { name: /生成所选月报告/ }).click()
    await page.locator('dialog.report-dialog[open]').waitFor()
    assert.match(await page.locator('dialog.report-dialog pre').innerText(), /虚构/)
    await page.locator('dialog.report-dialog').getByRole('button', { name: '关闭报告' }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '展开导航' }).click()
    await page.getByRole('link', { name: '集成席位' }).click()
    await page.getByRole('heading', { name: '集成席位', level: 1 }).waitFor()
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    assert.ok(width <= 391, `mobile page width overflowed: ${width}px`)
    assert.deepEqual(errors, [])
    assert.deepEqual(apiNetwork, [], 'static preview must not contact a backend')
    console.log(JSON.stringify({ status: 'PASS', route: base, categories: categoryCount, mobileWidth: width, externalApiRequests: apiNetwork.length, browserErrors: errors.length }, null, 2))
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
