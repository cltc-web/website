import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import axe from 'axe-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let browser, server, origin;

before(async () => {
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.pdf': 'application/pdf' };
  server = createServer(async (request, response) => {
    try {
      let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const path = resolve(root, '.' + pathname);
      if (!path.startsWith(root + sep)) throw new Error('Invalid path');
      const body = await readFile(path);
      response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(done => server.close(done));
});

async function newPage(options = {}) {
  const page = await browser.newPage(options);
  // Tests must not send analytics visits or depend on external services.
  await page.route('https://**/*', route => route.abort());
  return page;
}

test('shared headers fit without overlapping at phone, tablet and desktop breakpoints', async () => {
  const page = await newPage();
  try {
    for (const route of ['index.html', 'newsletters/index.html']) {
      await page.goto(`${origin}/${route}`);
      for (const width of [320, 375, 620, 768, 900, 901, 1024, 1150, 1151, 1280, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        const result = await page.evaluate(() => {
          const links = [...document.querySelectorAll('.desktop-nav a')].filter(e => e.getBoundingClientRect().width);
          const credentials = [...document.querySelectorAll('.brand, .header-credentials')];
          const overlap = (a, b) => {
            a = a.getBoundingClientRect(); b = b.getBoundingClientRect();
            return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          };
          return {
            pageWidth: document.documentElement.scrollWidth,
            collisions: links.filter(a => credentials.some(b => overlap(a, b))).map(e => e.textContent),
            obscured: links.filter(e => {
              const r = e.getBoundingClientRect();
              return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('a') !== e;
            }).map(e => e.textContent),
            menuVisible: !!document.querySelector('.mobile-menu').getBoundingClientRect().width,
          };
        });
        assert.ok(result.pageWidth <= width, `${route} overflows at ${width}px`);
        assert.deepEqual(result.collisions, [], `${route} overlaps at ${width}px`);
        assert.deepEqual(result.obscured, [], `${route} links obscured at ${width}px`);
        assert.equal(result.menuVisible, width <= 900);
      }
    }
  } finally { await page.close(); }
});

test('newsletter index supports skip navigation, reduced motion and mobile links', async () => {
  const page = await newPage({ viewport: { width: 375, height: 812 } });
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${origin}/newsletters/index.html`);
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.skip-link').evaluate(e => e === document.activeElement), true);
    assert.ok((await page.locator('.skip-link').boundingBox()).y >= 0);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('main').evaluate(e => e === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.newsletter-simple-card').evaluate(e => e === document.activeElement), true);
    await page.locator('.mobile-menu summary').click();
    assert.equal(await page.locator('.mobile-menu').getAttribute('open'), '');
    await page.locator('.mobile-menu a[href="../index.html#coaching"]').click();
    await page.waitForURL('**/index.html#coaching');
    assert.equal(await page.locator('.mobile-menu').getAttribute('open'), null);
  } finally { await page.close(); }
});

test('newsletter header theme does not restyle the existing archive content', async () => {
  const page = await newPage();
  try {
    await page.goto(`${origin}/newsletters/index.html`);
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const comparisons = await page.evaluate(async () => {
        // Compare against the original archive stylesheet in an isolated viewport.
        const baseline = document.createElement('iframe');
        baseline.style.cssText = `position:absolute;left:-10000px;width:${innerWidth}px;height:900px;border:0`;
        baseline.srcdoc = `<!doctype html><html><head><link rel="stylesheet" href="${location.origin}/styles.css"></head><body>${document.querySelector('main').outerHTML}</body></html>`;
        await new Promise(done => { baseline.onload = done; document.body.append(baseline); });
        const properties = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
          'color', 'backgroundColor', 'padding', 'margin', 'border', 'borderRadius', 'boxShadow', 'width'];
        const selectors = ['body', 'main', '.simple-newsletter-page', '.section-heading', 'h1',
          '.eyebrow', '.intro', '.newsletter-simple-card', '.newsletter-simple-card strong', '.newsletter-simple-card p'];
        const comparisons = selectors.map(selector => {
          const current = getComputedStyle(document.querySelector(selector));
          const original = baseline.contentWindow.getComputedStyle(baseline.contentDocument.querySelector(selector));
          return { selector, current: Object.fromEntries(properties.map(p => [p, current[p]])),
            original: Object.fromEntries(properties.map(p => [p, original[p]])) };
        });
        baseline.remove();
        return comparisons;
      });
      for (const comparison of comparisons) {
        assert.deepEqual(comparison.current, comparison.original, `${comparison.selector} restyled at ${width}px`);
      }
    }
  } finally { await page.close(); }
});

test('newsletter index and May issue pass sampled WCAG accessibility checks', async () => {
  const page = await newPage();
  try {
    for (const route of ['newsletters/index.html', 'newsletters/2026-05/index.html']) {
      for (const width of [320, 375, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${origin}/${route}`);
        if (route === 'newsletters/index.html' && width <= 900) await page.locator('.mobile-menu summary').click();
        await page.addScriptTag({ content: axe.source });
        const failures = await page.evaluate(async () => (await window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
        })).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })));
        assert.deepEqual(failures, [], `${route} at ${width}px`);
      }
    }
  } finally { await page.close(); }
});

test('May tables scroll locally by keyboard without widening the page', async () => {
  const page = await newPage({ viewport: { width: 320, height: 812 } });
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${origin}/newsletters/2026-05/index.html`);
    assert.equal(await page.locator('.table-scroll').count(), 5);
    for (const width of [320, 375, 620, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 812 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `May overflows at ${width}px`);
    }
    await page.setViewportSize({ width: 320, height: 812 });
    const activities = page.getByRole('region', { name: 'Weekly activities', exact: true });
    assert.ok(await activities.evaluate(e => e.scrollWidth > e.clientWidth));
    await activities.focus();
    assert.notEqual(await activities.evaluate(e => getComputedStyle(e).outlineStyle), 'none');
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    assert.ok(await activities.evaluate(e => e.scrollLeft > 0));
    assert.equal(await page.evaluate(() => scrollX), 0);
  } finally { await page.close(); }
});

test('May images declare correct intrinsic dimensions and print retains desktop grids', async () => {
  const page = await newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(`${origin}/newsletters/2026-05/index.html`);
    const badImages = await page.locator('img').evaluateAll(async images => {
      await Promise.all(images.map(image => image.decode()));
      return images.filter(image => Number(image.getAttribute('width')) !== image.naturalWidth ||
        Number(image.getAttribute('height')) !== image.naturalHeight).map(image => image.src);
    });
    assert.deepEqual(badImages, []);
    await page.emulateMedia({ media: 'print' });
    const columns = selector => page.locator(selector).first().evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length);
    assert.equal(await columns('.at-a-glance'), 4);
    assert.equal(await columns('.split'), 2);
    assert.equal(await columns('.results-grid'), 2);
    assert.equal(await columns('.qr-row'), 3);
    assert.ok(await page.locator('.table-scroll').evaluateAll(es => es.every(e => getComputedStyle(e).display === 'contents')));
  } finally { await page.close(); }
});

test('published navigation and newsletter cards work with JavaScript disabled', async () => {
  const page = await newPage({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
  try {
    await page.goto(`${origin}/newsletters/index.html`);
    await page.locator('.mobile-menu summary').click();
    assert.ok(await page.locator('.mobile-menu a[href="../index.html#about"]').isVisible());
    await page.locator('.newsletter-simple-card').click();
    await page.waitForURL('**/newsletters/2026-05/index.html');
    assert.equal(await page.locator('h1').textContent(), 'Newsletter - May 2026');
  } finally { await page.close(); }
});
