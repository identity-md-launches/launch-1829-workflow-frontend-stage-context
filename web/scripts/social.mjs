import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const font = (
  await readFile(
    new URL(
      '../node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2',
      import.meta.url,
    ),
  )
).toString('base64');
const dots = [];
for (let x = -270; x <= 270; x += 12)
  for (let y = -130; y <= 130; y += 12) {
    const edge = 105 * Math.pow(Math.max(0, 1 - (x / 270) ** 2), 0.75),
      d = Math.hypot(x, y);
    if (Math.abs(Math.abs(y) - edge) < 10 || (d < 77 && d > 29) || d < 17)
      dots.push(
        `<circle cx="${x + 300}" cy="${y + 150}" r="2.2" opacity="${0.5 + (0.5 * (Math.cos((x - y) / 30) + 1)) / 2}"/>`,
      );
  }
const html = `<html><head><style>@font-face{font-family:Space;src:url(data:font/woff2;base64,${font})}*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#0c0b10;color:#f4f1fa;font-family:Space;display:flex;align-items:center;padding:80px}h1{font-size:96px;line-height:1.02;letter-spacing:-5px;margin:0;font-weight:700}h1 span{color:#ffc83d}p{color:#b3aebf;font-size:24px;line-height:1.5;max-width:500px}svg{position:absolute;width:540px;right:20px;top:130px;color:#8b7bff;filter:drop-shadow(0 0 10px #8b7bff66)}footer{position:absolute;bottom:50px;left:80px;right:80px;border-top:1px solid #35313f;padding-top:20px;font-size:20px;color:#b3aebf}</style></head><body><div><h1>Beg the<br><span>Swarm.</span></h1><p>Convince the IMD swarm<br>to give you tokens.<br>It reads everything.</p></div><svg viewBox="0 0 600 300" fill="currentColor">${dots.join('')}</svg><footer>BEG · Ethereum · At the mercy of the swarm.</footer></body></html>`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: new URL('../public/social.png', import.meta.url).pathname,
  });
} finally {
  await browser.close();
}
console.log('Created locally rendered 1200 × 630 share card.');
