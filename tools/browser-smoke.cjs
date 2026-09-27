/* Run against a disposable demo DB, never a production workspace.
 * PLAYWRIGHT_MODULE may point to an installed Playwright module.
 * TEST_BASE_URL defaults to http://127.0.0.1:8011.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8011';
const output = path.resolve(__dirname, '../test-results');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  const errors = [];
  const passed = [];
  page.on('pageerror', error => errors.push(error.message));
  const dialog = () => page.locator('dialog.editor[open]');
  const save = async () => {
    await dialog().getByRole('button', { name: '保存记录', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '刷新数据', exact: true }).waitFor();
  };
  const workspace = async () => {
    const response = await page.request.get(base + '/api/workspace');
    assert.equal(response.status(), 200);
    return response.json();
  };
  const visit = async (route, title) => {
    await page.goto(base + '/#' + route);
    await page.getByRole('heading', { name: title, exact: true, level: 1 }).waitFor();
    await page.getByRole('button', { name: '刷新数据', exact: true }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('button[aria-label="刷新数据"]')?.disabled);
  };
  try {
    await visit('overview', '工作台总览');
    assert.equal((await page.request.get(base + '/api/health')).status(), 200);
    await page.screenshot({ path: path.join(output, 'overview-desktop.png'), fullPage: true, animations: 'disabled' });
    passed.push('Dashboard and persisted API data render');

    const suffix = Date.now().toString().slice(-8);
    const productName = '验收产品-' + suffix;
    await visit('products', '产品与销售');
    await page.getByRole('heading', { name: '产品分类', exact: true }).waitFor();
    await page.getByRole('button', { name: '新建产品', exact: true }).click();
    await dialog().getByLabel(/^产品名称/).fill(productName);
    await dialog().getByLabel(/^SKU/).fill('QA-' + suffix);
    await dialog().getByLabel(/^负责人/).fill('验收负责人');
    await save();
    let data = await workspace();
    const product = data.products.find(p => p.name === productName);
    assert.ok(product);
    await page.getByRole('button', { name: '编辑 ' + productName, exact: true }).click();
    await dialog().getByLabel(/^产品状态/).selectOption('研发中');
    await save();
    assert.equal((await workspace()).products.find(p => p.id === product.id).status, '研发中');
    passed.push('Create and edit product via UI');

    await page.getByRole('button', { name: '录入销售', exact: true }).click();
    await dialog().locator('#field-product_id').selectOption(product.id);
    await dialog().getByLabel(/^销售月份/).fill('2026-09');
    await dialog().getByLabel(/^人民币净销售额/).fill('1234.56');
    await dialog().getByLabel(/^销售数量/).fill('12');
    await save();
    const sale = (await workspace()).sales.find(s => s.product_id === product.id);
    assert.equal(sale.revenue_cents, 123456);
    await page.reload();
    await page.getByRole('button', { name: '编辑 ' + productName, exact: true }).waitFor();
    assert.equal((await workspace()).sales.find(s => s.id === sale.id).revenue_cents, 123456);
    passed.push('Sales exact cents conversion and page-reload persistence');

    await page.getByRole('button', { name: '录入销售', exact: true }).click();
    await dialog().locator('#field-product_id').selectOption(product.id);
    await dialog().getByLabel(/^销售月份/).fill('2026-09');
    await dialog().getByLabel(/^人民币净销售额/).fill('100');
    await dialog().getByRole('button', { name: '保存记录', exact: true }).click();
    await dialog().getByRole('alert').waitFor();
    assert.match(await dialog().getByRole('alert').innerText(), /冲突/);
    await dialog().getByRole('button', { name: '取消', exact: true }).click();
    passed.push('Duplicate sales rejected with visible form error');

    await visit('projects', '研发项目');
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await dialog().getByLabel(/^项目名称/).fill('验收研发-' + suffix);
    await dialog().getByLabel(/^关联产品/).selectOption(product.id);
    await dialog().getByLabel(/^负责人/).fill('测试PM');
    await save();
    await page.getByRole('button').filter({ has: page.getByRole('heading', { name: '验收研发-' + suffix }) }).click();
    await page.getByRole('button', { name: '添加任务', exact: true }).click();
    await dialog().getByLabel(/^任务名称/).fill('验收任务-' + suffix);
    await dialog().getByLabel(/^负责人/).fill('测试研发');
    await save();
    await page.getByRole('button', { name: '完成任务 验收任务-' + suffix, exact: true }).click();
    await page.getByRole('button', { name: '重新打开任务 验收任务-' + suffix, exact: true }).waitFor();
    assert.equal((await workspace()).tasks.find(t => t.title === '验收任务-' + suffix).status, '已完成');
    passed.push('Create project/task and persist task completion');

    await visit('signals', '市场情报');
    await page.getByRole('button', { name: '记录情报', exact: true }).click();
    await dialog().getByLabel(/^情报类型/).selectOption('竞品动态');
    await dialog().getByLabel(/^品牌/).fill('验收虚构品牌');
    await dialog().getByLabel(/^标题/).fill('验收情报-' + suffix);
    await dialog().getByLabel(/^情报内容/).fill('本条为自动化验收数据，不代表真实市场事件。');
    await save();
    assert.ok((await workspace()).signals.find(s => s.title === '验收情报-' + suffix));
    passed.push('Create competitor signal');

    await visit('integrations', '集成席位');
    await page.getByRole('button', { name: '新增席位', exact: true }).click();
    await dialog().getByLabel(/^席位名称/).fill('验收席位-' + suffix);
    await dialog().getByLabel(/^服务提供方/).fill('仅配置占位');
    await save();
    assert.equal((await workspace()).seats.find(s => s.name === '验收席位-' + suffix).status, '待接入');
    passed.push('Create integration placeholder without external call');

    await visit('reports', '报告与任务');
    await page.getByRole('button', { name: '新建任务', exact: true }).click();
    await dialog().getByLabel(/^任务名称/).fill('验收计划-' + suffix);
    await dialog().locator('#field-enabled').uncheck();
    await save();
    const job = (await workspace()).jobs.find(j => j.name === '验收计划-' + suffix);
    assert.equal(job.enabled, false);
    const row = page.getByRole('row').filter({ hasText: '验收计划-' + suffix });
    await row.getByRole('button', { name: '执行当月', exact: true }).click();
    const report = page.locator('dialog.report-dialog[open]');
    await report.waitFor();
    assert.match(await report.locator('pre').innerText(), /规则汇总/);
    const downloadEvent = page.waitForEvent('download');
    await report.getByRole('button', { name: /^下载 / }).click();
    const download = await downloadEvent;
    await download.saveAs(path.join(output, 'downloaded-report.md'));
    assert.ok(fs.readFileSync(path.join(output, 'downloaded-report.md'), 'utf8').includes('规则汇总'));
    await report.getByRole('button', { name: '关闭报告', exact: true }).click();
    const runs = await (await page.request.get(`${base}/api/jobs/${job.id}/runs`)).json();
    assert.equal(runs[0].status, 'succeeded');
    passed.push('Create paused schedule, manual execution, report view/download');

    await page.setViewportSize({ width: 390, height: 844 });
    for (const [route, title] of [['overview','工作台总览'], ['products','产品与销售'], ['projects','研发项目'], ['signals','市场情报'], ['reports','报告与任务'], ['integrations','集成席位']]) {
      await visit(route, title);
      const sizes = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert.ok(sizes.content <= sizes.viewport + 1, `${route} overflow: ${JSON.stringify(sizes)}`);
    }
    await visit('overview', '工作台总览');
    await page.screenshot({ path: path.join(output, 'overview-mobile.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: '展开导航', exact: true }).click();
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '产品与销售', exact: true }).click();
    await page.getByRole('heading', { name: '产品与销售', level: 1 }).waitFor();
    passed.push('All six pages fit 390px mobile viewport without page overflow');
    assert.deepEqual(errors, []);
    passed.push('No unhandled browser JavaScript errors');
    const result = { status: 'PASS', checks: passed, browserErrors: errors };
    fs.writeFileSync(path.join(output, 'browser-smoke.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'browser-failure.png'), fullPage: true }).catch(() => {});
    console.error(JSON.stringify({ status: 'FAIL', passed, browserErrors: errors, error: error.stack }, null, 2));
    process.exitCode = 1;
  } finally { await browser.close(); }
})();
