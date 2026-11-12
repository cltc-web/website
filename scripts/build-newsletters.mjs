import { access, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sections = [
  ['about', 'About'], ['play', 'Play'], ['competitive', 'Teams'],
  ['coaching', 'Coaching'], ['programme', 'Programme'], ['gallery', 'Gallery'],
  ['fees', 'Fees'], ['newsletters', 'Newsletters'], ['contacts', 'Contacts'],
];

function escapeHTML(value) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export function validateIssues(issues) {
  if (!Array.isArray(issues) || !issues.length) throw new Error('Publish at least one issue.');
  const ids = new Set();
  for (const issue of issues) {
    if (!issue || !/^\d{4}-(0[1-9]|1[0-2])$/.test(issue.id)) throw new Error('Invalid issue ID; use YYYY-MM.');
    if (ids.has(issue.id)) throw new Error(`Duplicate issue: ${issue.id}`);
    ids.add(issue.id);
    for (const field of ['title', 'description', 'trackingId']) {
      if (typeof issue[field] !== 'string' || !issue[field].trim()) throw new Error(`Missing ${field} for ${issue.id}`);
    }
    if (!/^[a-z0-9-]+$/.test(issue.trackingId)) throw new Error(`Invalid tracking ID for ${issue.id}`);
  }
  return [...issues].sort((a, b) => b.id.localeCompare(a.id));
}

export function renderCards(issues, { homepage = false } = {}) {
  const published = validateIssues(issues);
  return (homepage ? published.slice(0, 3) : published).map((issue, index) => `        <a class="newsletter-simple-card" href="${homepage ? 'newsletters/' : ''}${issue.id}/index.html"
          data-goatcounter-click="${escapeHTML(issue.trackingId)}">
          <span>${index === 0 ? 'Latest issue' : 'Previous issue'}</span>
          <strong>${escapeHTML(issue.title)}</strong>
          <p>${escapeHTML(issue.description)}</p>
        </a>`).join('\n');
}

export function renderHeader(template, { homepage = false } = {}) {
  const links = sections.map(([id, label]) => {
    const current = !homepage && id === 'newsletters';
    const href = homepage ? `#${id}` : current ? 'index.html' : `../index.html#${id}`;
    return `      <a href="${href}"${current ? ' aria-current="page"' : ''}>${label}</a>`;
  }).join('\n');
  const values = {
    headerClasses: homepage ? '' : ' concept community iteration iteration-c',
    brandHref: homepage ? '#top' : '../index.html#top',
    assetRoot: homepage ? 'assets/' : '../assets/',
    desktopLinks: links,
    mobileLinks: links.replace(/^/gm, '  '),
  };
  return template.trimEnd().replace(/\{\{(\w+)\}\}/g, (_, name) => {
    if (!(name in values)) throw new Error(`Unknown header placeholder: ${name}`);
    return values[name];
  });
}

function replaceBlock(html, name, content) {
  const start = `<!-- Generated ${name}: run npm run build:newsletters -->`;
  const end = `<!-- End generated ${name} -->`;
  const startIndex = html.indexOf(start);
  const endIndex = html.indexOf(end);
  if (startIndex < 0 || endIndex < startIndex || html.indexOf(start, startIndex + start.length) !== -1 ||
      html.indexOf(end, endIndex + end.length) !== -1) throw new Error(`Expected one generated ${name} block.`);
  const indent = html.slice(0, endIndex).match(/[ \t]*$/)[0];
  return html.slice(0, startIndex + start.length) + '\n' + content + '\n' + indent + html.slice(endIndex);
}

async function build() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--check')) throw new Error('Usage: node scripts/build-newsletters.mjs [--check]');
  const check = args.includes('--check');
  const issues = validateIssues(JSON.parse(await readFile(resolve(root, 'newsletters/issues.json'), 'utf8')));
  // Explicit catalogue only: never discover or publish draft/private issues automatically.
  for (const issue of issues) await access(resolve(root, 'newsletters', issue.id, 'index.html'));
  const template = await readFile(resolve(root, 'templates/site-header.html'), 'utf8');
  const outputs = [];
  for (const [file, homepage] of [['index.html', true], ['newsletters/index.html', false]]) {
    const path = resolve(root, file);
    const original = await readFile(path, 'utf8');
    let updated = replaceBlock(original, 'site header', renderHeader(template, { homepage }));
    updated = replaceBlock(updated, 'newsletter cards', renderCards(issues, { homepage }));
    if (updated !== original) outputs.push({ path, file, updated });
  }
  if (check && outputs.length) throw new Error(`Generated HTML is stale: ${outputs.map(output => output.file).join(', ')}. Run npm run build:newsletters.`);
  for (const output of outputs) await writeFile(output.path, output.updated);
  console.log(check ? 'Generated newsletter HTML is current.' : `Updated ${outputs.length} page(s).`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  build().catch(error => { console.error(error.message); process.exitCode = 1; });
}
