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
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };
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

test('newsletter and table tennis pages pass sampled WCAG accessibility checks', async () => {
  const page = await newPage();
  try {
    for (const route of ['newsletters/index.html', 'newsletters/2026-05/index.html', 'table-tennis.html']) {
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

test('coaching stays on the homepage, with assessment-led groups and timetable enquiries to the head coach', async () => {
  const page = await newPage({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${origin}/index.html`);
    assert.equal(await page.locator('a[href="coaching.html"]').count(), 0);
    assert.equal(await page.locator('a[href="juniors.html"]').count(), 0);
    assert.deepEqual(await page.locator('.service-list a[href="#coaching"] span').allTextContents(),
      ['Adult coaching', 'Junior tennis']);
    assert.match(await page.locator('#coaching .section-heading').textContent(),
      /Coaching fees are additional to club membership/);
    const panels = page.locator('#coaching > .junior-panel');
    for (const panel of await panels.all()) {
      assert.match(await panel.textContent(), /after an assessment/);
      assert.match(await panel.textContent(), /ask Chris about timetables and availability/);
    }
    assert.equal(await page.locator('#coaching .coaching-availability').count(), 0);
    const contacts = page.locator('#coaching .coach-card a');
    assert.deepEqual(await contacts.evaluateAll(es => es.map(e => e.href)),
      ['https://wa.me/447720941494', 'https://wa.me/447928091993']);
    assert.ok(await contacts.evaluateAll(es => es.every(e => e.hasAttribute('data-goatcounter-click'))));
    for (const width of [320, 375, 620, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Coaching overflows at ${width}px`);
    }
    await page.locator('.service-list a[href="#coaching"] span', { hasText: 'Junior tennis' }).click();
    await page.waitForURL('**/index.html#coaching');
  } finally { await page.close(); }
});

test('table tennis page is clearly provisional and works without JavaScript', async () => {
  const page = await newPage({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
  try {
    await page.goto(`${origin}/index.html`);
    assert.equal(await page.locator('.service-list a[href="table-tennis.html"]').count(), 1);
    await page.locator('.service-list a[href="table-tennis.html"]').click();
    await page.waitForURL('**/table-tennis.html');
    assert.equal(await page.locator('h1').textContent(), 'Table tennis at the clubhouse.');
    const hero = page.locator('.table-tennis-welcome img');
    assert.equal(await hero.getAttribute('src'), 'assets/gallery/table-tennis-match.jpg');
    assert.equal(await hero.getAttribute('alt'), 'Two players competing in a table tennis match in the clubhouse');
    assert.match(await page.locator('.draft-notice').textContent(), /Draft information for committee review/);
    assert.equal(await page.locator('.table-tennis-grid .provisional').count(), 3);
    assert.ok(await page.locator('.table-tennis-grid .provisional').allTextContents()
      .then(messages => messages.every(message => /to be confirmed/.test(message))));
    const contact = page.locator('#contact a[data-goatcounter-click="table-tennis-lewis-whatsapp"]');
    assert.equal(await contact.getAttribute('href'), 'https://wa.me/447985304405');
    const membershipEmail = page.locator('#contact a[data-goatcounter-click="table-tennis-membership-email"]');
    assert.equal(await membershipEmail.getAttribute('href'), 'mailto:cltcmembership@gmail.com?subject=Table%20tennis%20enquiry');
    assert.equal(await page.locator('#contact a[href="index.html#fees"]').count(), 0);
    assert.match(await page.locator('#contact .membership-help').textContent(), /separately from LTA tennis membership/);
    for (const width of [320, 375, 620, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Table tennis page overflows at ${width}px`);
    }
    await page.locator('.table-tennis-header a[href="index.html#play"]').click();
    await page.waitForURL('**/index.html#play');
  } finally { await page.close(); }
});

test('gallery includes all primary page hero photographs', async () => {
  const page = await newPage();
  try {
    await page.goto(`${origin}/gallery.html`);
    const galleryPhotos = await page.locator('#gallery-photos a[data-gallery-item]').evaluateAll(links =>
      links.map(link => link.getAttribute('href')));
    assert.deepEqual(
      ['assets/gallery/club-aerial-overview.jpg', 'assets/gallery/IMG_2266.jpeg',
        'assets/gallery/junior-tennis-cropped.jpg', 'assets/gallery/table-tennis-match.jpg'].map(photo =>
        galleryPhotos.includes(photo)),
      [true, true, true, true]);
  } finally { await page.close(); }
});

test('homepage aerial remains a complete landscape image at desktop and tablet widths', async () => {
  const page = await newPage();
  try {
    for (const width of [1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${origin}/index.html`);
      const aerial = page.locator('.hero-media img');
      assert.equal(await aerial.getAttribute('src'), 'assets/gallery/club-aerial-overview.jpg');
      const imageSizing = await aerial.evaluate(async image => {
        await image.decode();
        const box = image.getBoundingClientRect();
        return {
          objectFit: getComputedStyle(image).objectFit,
          displayedRatio: box.width / box.height,
          naturalRatio: image.naturalWidth / image.naturalHeight
        };
      });
      assert.equal(imageSizing.objectFit, 'contain');
      assert.ok(Math.abs(imageSizing.displayedRatio - imageSizing.naturalRatio) < 0.001);
    }
  } finally { await page.close(); }
});

test('approved junior photo appears in the gallery and coach silhouettes on the homepage', async () => {
  const page = await newPage();
  try {
    for (const route of ['index.html']) {
      await page.goto(`${origin}/${route}`);
      const portraits = page.locator('.coach-card .coach-photo');
      assert.equal(await portraits.count(), 2);
      assert.deepEqual(await page.locator('.coach-photo-note').allTextContents(), ['Photo to follow', 'Photo to follow']);
      assert.ok(await portraits.evaluateAll(async images => {
        await Promise.all(images.map(image => image.decode()));
        return images.every(image => image.getAttribute('src') === 'assets/coach-photo-placeholder.svg' &&
          image.alt.includes('Placeholder portrait') && image.naturalWidth === 140 && image.naturalHeight === 180);
      }));
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflows at ${width}px`);
      }
      if (route === 'index.html') assert.equal(await page.locator('#contacts .coach-photo').count(), 0);
    }
    await page.goto(`${origin}/gallery.html`);
    const juniorPhoto = page.locator('#gallery-photos a[href="assets/gallery/junior-tennis-cropped.jpg"] img');
    assert.equal(await juniorPhoto.getAttribute('alt'), 'Children playing Red Ball tennis at the club');
    assert.ok(await juniorPhoto.evaluate(async image => {
      await image.decode();
      return image.naturalWidth === 1200 && image.naturalHeight === 800;
    }));
  } finally { await page.close(); }
});

test('homepage gives adult and junior coaching matching panels below the coaches', async () => {
  const page = await newPage({ javaScriptEnabled: false });
  try {
    await page.goto(`${origin}/index.html`);
    const panels = page.locator('#coaching > .junior-panel');
    assert.deepEqual(await panels.locator('h3').allTextContents(), ['Adult coaching', 'Junior tennis']);
    assert.equal(await page.locator('#coaching .section-heading a').count(), 0);
    assert.equal(await page.locator('#coaching .coach-card').count(), 2);
    assert.equal(await page.locator('#coaching .coach-photo').count(), 2);
    for (const panel of await panels.all()) {
      assert.equal(await panel.locator('.button').count(), 1);
      assert.equal(await panel.locator('.button').getAttribute('href'), 'https://wa.me/447720941494');
    }
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const adult = await panels.nth(0).locator('.button').boundingBox();
      const junior = await panels.nth(1).locator('.button').boundingBox();
      assert.ok(Math.abs(adult.width - junior.width) < 1, `Coaching buttons have different widths at ${width}px`);
      assert.ok(Math.abs(adult.x - junior.x) < 1, `Coaching buttons are not aligned at ${width}px`);
      assert.ok(adult.x >= 0 && adult.x + adult.width <= width, `Coaching panel overflows at ${width}px`);
    }
  } finally { await page.close(); }
});

test('membership highlights three main options and expands other rates without JavaScript', async () => {
  const page = await newPage({ javaScriptEnabled: false });
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${origin}/index.html#fees`);
      assert.deepEqual(await page.locator('#fees .fee-card:visible h3').allTextContents(),
        ['Full adult', 'Midweek adult', 'Family membership']);
      assert.deepEqual(await page.locator('.membership-core .price').allTextContents(), ['£266', '£196', '£545']);
      const summary = page.locator('.membership-options summary');
      await summary.focus();
      assert.notEqual(await summary.evaluate(e => getComputedStyle(e).outlineStyle), 'none');
      await summary.press('Enter');
      assert.equal(await page.locator('.membership-options').getAttribute('open'), '');
      assert.equal(await page.locator('#fees .fee-card:visible').count(), 9);
      assert.deepEqual(await page.locator('.membership-options .price').allTextContents(),
        ['£125', '£92', '£75', '£17', '£50', '£35']);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Membership overflows at ${width}px`);
      await summary.press('Enter');
      assert.equal(await page.locator('#fees .fee-card:visible').count(), 3);
    }
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
