import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderCards, renderHeader, validateIssues } from '../scripts/build-newsletters.mjs';

const issue = id => ({ id, title: `${id} newsletter`, description: 'Club news', trackingId: `newsletter-${id}` });

test('published issues are sorted newest first without changing the input', () => {
  const input = [issue('2026-05'), issue('2026-10')];
  assert.deepEqual(validateIssues(input).map(issue => issue.id), ['2026-10', '2026-05']);
  assert.equal(input[0].id, '2026-05');
});

test('invalid, duplicate and incomplete issue metadata is rejected', () => {
  for (const input of [[], null, [null], [issue('../draft')], [issue('2026-13')],
    [issue('2026-05'), issue('2026-05')], [{ ...issue('2026-05'), title: '' }],
    [{ ...issue('2026-05'), trackingId: '" onclick="bad' }]]) {
    assert.throws(() => validateIssues(input));
  }
});

test('homepage and archive cards share metadata, explicit index links and tracking IDs', () => {
  const issues = ['2026-05', '2026-06', '2026-07', '2026-08'].map(issue);
  const home = renderCards(issues, { homepage: true });
  const archive = renderCards(issues);
  assert.equal((home.match(/newsletter-simple-card/g) || []).length, 3);
  assert.equal((archive.match(/newsletter-simple-card/g) || []).length, 4);
  assert.equal((archive.match(/Latest issue/g) || []).length, 1);
  assert.match(home, /href="newsletters\/2026-08\/index.html"/);
  assert.match(archive, /href="2026-08\/index.html"/);
  assert.match(home, /data-goatcounter-click="newsletter-2026-08"/);
  assert.doesNotMatch(home, /2026-05/);
});

test('catalogue text is escaped rather than inserted as HTML', () => {
  const html = renderCards([{ ...issue('2026-05'), title: 'News <script> & "tennis"', description: "It's <great>" }]);
  assert.match(html, /News &lt;script&gt; &amp; &quot;tennis&quot;/);
  assert.match(html, /It&#39;s &lt;great&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('shared header generates local homepage anchors and archive navigation', () => {
  const template = readFileSync(new URL('../templates/site-header.html', import.meta.url), 'utf8');
  const home = renderHeader(template, { homepage: true });
  const archive = renderHeader(template);
  assert.match(home, /<header class="site-header">/);
  assert.match(archive, /<header class="site-header concept community iteration iteration-c">/);
  assert.match(home, /href="#newsletters"/);
  assert.match(archive, /href="index.html" aria-current="page">Newsletters/);
  assert.match(archive, /href="\.\.\/index.html#coaching"/);
  assert.match(archive, /src="\.\.\/assets\/logo.png"/);
  assert.doesNotMatch(archive, /\{\{|BOC Construction Services sponsor/);
});

test('checked-in generated HTML is current, independent of the working directory', () => {
  const script = new URL('../scripts/build-newsletters.mjs', import.meta.url);
  assert.match(execFileSync(process.execPath, [fileURLToPath(script), '--check'], { cwd: tmpdir(), encoding: 'utf8' }), /is current/);
});
