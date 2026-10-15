// Read-only validation. The RPC is a CLI argument; it is never copied into the export or evidence.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const rpc = process.argv[2];
if (!rpc) throw new Error('Pass an authorized RPC endpoint.');
const root = resolve(import.meta.dirname, '../..'),
  dist = resolve(root, 'dist'),
  out = resolve(root, 'docs/frontend');
const config = JSON.parse(
  await readFile(resolve(dist, 'imd-deployment.json'), 'utf8'),
);
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const server = createServer(async (req, res) => {
  try {
    const name =
      decodeURIComponent(new URL(req.url, 'http://test').pathname).replace(
        /^\/preview\//,
        '',
      ) || 'index.html';
    const file = resolve(dist, name);
    if (!file.startsWith(dist + '/')) throw new Error('bad path');
    res.setHeader(
      'content-type',
      types[extname(file)] ?? 'application/octet-stream',
    );
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ headless: true });
const errors = [],
  missing = [],
  methods = new Set();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.url().includes('/preview/') && r.status() >= 400)
      missing.push(new URL(r.url()).pathname);
  });
  await page.route('https://**/*', async (route) => {
    if (
      !config.network.rpcUrls.some((u) => route.request().url().startsWith(u))
    ) {
      await route.abort();
      return;
    }
    const body = route.request().postDataJSON();
    for (const req of Array.isArray(body) ? body : [body]) {
      assert(
        !/send|sign/i.test(req.method),
        'Read-only audit refuses signing/broadcast',
      );
      methods.add(req.method);
    }
    const r = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    await route.fulfill({
      contentType: 'application/json',
      body: await r.text(),
    });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/preview/`);
  await page.waitForFunction(
    () => document.querySelector('.live-label')?.textContent === 'Live',
    {},
    { timeout: 60000 },
  );
  await page
    .waitForFunction(
      () =>
        document.querySelector('#feed>p')?.textContent?.startsWith('Synced'),
      {},
      { timeout: 60000 },
    )
    .catch(async (e) => {
      console.log('History:', await page.locator('#feed').innerText());
      console.log('Methods:', [...methods]);
      throw e;
    });
  const values = await page.locator('.live-stats').innerText();
  const viewports = [];
  await mkdir(resolve(out, 'screenshots'), { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert(!overflow);
    const bounds = await page.locator('.beg-button').boundingBox();
    viewports.push({
      width,
      height: 844,
      overflow,
      primaryActionBottom: bounds.y + bounds.height,
    });
    if (width === 390) assert(bounds.y + bounds.height <= 844);
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: resolve(out, `screenshots/live-${width}.png`),
      });
  }
  await page.getByLabel('Spend (ETH)').fill('0.00001');
  await page.getByRole('button', { name: 'Get quote', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('#trade .quote') ||
      document.querySelector('#trade .error'),
    {},
    { timeout: 30000 },
  );
  const quote = await page.locator('#trade').innerText();
  assert.equal(
    await page
      .getByRole('button', { name: 'Swap ETH for BEG', exact: true })
      .isEnabled()
      .catch(() => false),
    false,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(missing, []);
  await writeFile(
    resolve(out, 'live-browser.json'),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        publicSources: config.network.rpcUrls,
        chainId: config.chainId,
        values,
        viewports,
        quote,
        rpcMethods: [...methods],
        transactionsBroadcast: 0,
        scriptErrors: errors,
        missingAssets: missing,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'PASS live runtime reads, chunked event sync, static subpath and responsive bounds.',
  );
  console.log(quote);
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
