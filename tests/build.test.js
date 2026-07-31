'use strict';

const { afterEach, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  build,
  escapeHtml,
  extractMeta,
  isValidDate,
  resolveInside,
  safeTagFilename,
} = require('../scripts/build');

let fixtureRoots = [];

afterEach(() => {
  for (const root of fixtureRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  fixtureRoots = [];
});

function postHtml({ title = 'Article', date = '2026-01-01', tags = 'tech', meta = null } = {}) {
  const metadata = meta || [
    `<meta name="title" content="${title}">`,
    `<meta name="date" content="${date}">`,
    `<meta name="tags" content="${tags}">`,
  ].join('\n');
  return `<!doctype html><html><head>${metadata}</head><body><h1>${title}</h1></body></html>`;
}

function createFixture({ posts = { 'article.html': postHtml() }, css = true, docs = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-build-test-'));
  fixtureRoots.push(root);
  fs.mkdirSync(path.join(root, 'posts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs-src'), { recursive: true });

  for (const [file, content] of Object.entries(posts)) {
    fs.writeFileSync(path.join(root, 'posts', file), content, 'utf8');
  }
  if (css) fs.writeFileSync(path.join(root, 'docs-src', 'site.css'), 'body { color: #111; }\n', 'utf8');

  for (const [file, content] of Object.entries(docs)) {
    const target = path.join(root, 'docs', file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
  }

  return root;
}

function quietBuild(root) {
  return build(root, { log() {} });
}

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function listFiles(root) {
  const files = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else files.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  }
  visit(root);
  return files.sort();
}

function manifest(root) {
  return Object.fromEntries(listFiles(root).map(file => [file, hash(path.join(root, file))]));
}

test('extractMeta supports documented metadata syntax', () => {
  assert.equal(extractMeta('<meta name="title" content="Hello">', 'title'), 'Hello');
});

test('extractMeta supports reversed attributes, extra attributes, and single quotes', () => {
  const html = "<meta content='Hello' data-source='test' name='title'>";
  assert.equal(extractMeta(html, 'title'), 'Hello');
});

test('date validation accepts leap days and rejects impossible dates', () => {
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('2023-02-29'), false);
  assert.equal(isValidDate('2026-13-01'), false);
  assert.equal(isValidDate('2026-7-01'), false);
});

test('build rejects a missing required title with the source filename', () => {
  const root = createFixture({
    posts: { 'bad.html': postHtml({ meta: '<meta name="date" content="2026-01-01">' }) },
  });
  assert.throws(() => quietBuild(root), /bad\.html: missing required meta field "title"/);
});

test('build rejects an invalid calendar date with the source filename', () => {
  const root = createFixture({ posts: { 'bad-date.html': postHtml({ date: '2026-02-30' }) } });
  assert.throws(() => quietBuild(root), /bad-date\.html: invalid date/);
});

test('generated metadata is HTML-escaped and article filenames are URL-encoded', () => {
  const metadata = [
    `<meta content='<b>&"quote"' name='title'>`,
    `<meta content='2026-01-01' name='date'>`,
    `<meta content='<tag&' name='tags'>`,
  ].join('\n');
  const root = createFixture({ posts: { 'hello #1.html': postHtml({ meta: metadata }) } });
  quietBuild(root);
  const index = fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8');

  assert.match(index, /&lt;b&gt;&amp;&quot;quote&quot;/);
  assert.match(index, /&lt;tag&amp;/);
  assert.match(index, /href="posts\/hello%20%231\.html"/);
  assert.doesNotMatch(index, /<b>/);
});

test('escapeHtml covers all HTML-significant characters', () => {
  assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});

test('special tag names remain inside tags and use safe ASCII filenames', () => {
  const tags = String.raw`constructor,__proto__,../escape,a/b,a\b,CON`;
  const root = createFixture({ posts: { 'tags.html': postHtml({ tags }) } });
  const result = quietBuild(root);
  const tagFiles = fs.readdirSync(path.join(root, 'docs', 'tags'));

  assert.equal(result.tags, 6);
  assert.equal(tagFiles.length, 6);
  assert.ok(tagFiles.every(file => /^tag-[A-Za-z0-9_-]+\.html$/.test(file)));
  assert.equal(fs.existsSync(path.join(root, 'docs', 'escape.html')), false);
  assert.equal(fs.existsSync(path.join(root, 'escape.html')), false);
});

test('duplicate tags appear only once in an article and archive', () => {
  const root = createFixture({ posts: { 'dupe.html': postHtml({ tags: 'tech, tech,tech' }) } });
  const result = quietBuild(root);
  const index = fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8');

  assert.equal(result.tags, 1);
  assert.equal((index.match(/class="tag"/g) || []).length, 1);
});

test('missing CSS fails before changing the last complete docs directory', () => {
  const root = createFixture({ css: false, docs: { 'sentinel.txt': 'last-good-build' } });
  const before = manifest(path.join(root, 'docs'));

  assert.throws(() => quietBuild(root), /Missing required stylesheet/);
  assert.deepEqual(manifest(path.join(root, 'docs')), before);
});

test('invalid post metadata fails before changing the last complete docs directory', () => {
  const root = createFixture({
    posts: { 'bad.html': postHtml({ date: 'not-a-date' }) },
    docs: { 'sentinel.txt': 'last-good-build' },
  });
  const before = manifest(path.join(root, 'docs'));

  assert.throws(() => quietBuild(root), /bad\.html: invalid date/);
  assert.deepEqual(manifest(path.join(root, 'docs')), before);
});

test('articles and stylesheet are copied byte for byte', () => {
  const source = postHtml({ title: '逐字节', tags: '测试' }) + '\n<!-- exact bytes -->\n';
  const root = createFixture({ posts: { 'exact.html': source } });
  quietBuild(root);

  assert.equal(hash(path.join(root, 'posts', 'exact.html')), hash(path.join(root, 'docs', 'posts', 'exact.html')));
  assert.equal(hash(path.join(root, 'docs-src', 'site.css')), hash(path.join(root, 'docs', 'assets', 'site.css')));
});

test('posts sort by descending date and then ascending filename', () => {
  const root = createFixture({ posts: {
    'b.html': postHtml({ title: 'B', date: '2026-01-01' }),
    'new.html': postHtml({ title: 'New', date: '2026-02-01' }),
    'a.html': postHtml({ title: 'A', date: '2026-01-01' }),
  } });
  quietBuild(root);
  const index = fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8');

  assert.ok(index.indexOf('>New<') < index.indexOf('>A<'));
  assert.ok(index.indexOf('>A<') < index.indexOf('>B<'));
});

test('all generated internal href targets exist', () => {
  const root = createFixture({ posts: {
    'one #.html': postHtml({ title: 'One', tags: 'tech,随笔' }),
    'two.html': postHtml({ title: 'Two', date: '2025-01-01', tags: 'tech' }),
  } });
  quietBuild(root);
  const docs = path.join(root, 'docs');

  for (const file of listFiles(docs).filter(file => file.endsWith('.html'))) {
    const absolute = path.join(docs, file);
    const html = fs.readFileSync(absolute, 'utf8');
    for (const match of html.matchAll(/href="([^"]+)"/g)) {
      const reference = decodeURIComponent(match[1].split(/[?#]/, 1)[0]);
      const target = path.resolve(path.dirname(absolute), reference);
      assert.equal(fs.existsSync(target), true, `${file} -> ${match[1]}`);
    }
  }
});

test('repeated builds are byte-for-byte idempotent', () => {
  const root = createFixture({ posts: {
    'one.html': postHtml({ title: 'One', tags: 'tech,随笔' }),
    'two.html': postHtml({ title: 'Two', date: '2025-01-01' }),
  } });
  quietBuild(root);
  const first = manifest(path.join(root, 'docs'));
  quietBuild(root);

  assert.deepEqual(manifest(path.join(root, 'docs')), first);
});

test('a successful build removes stale output files', () => {
  const root = createFixture({ docs: { 'stale.txt': 'remove me' } });
  quietBuild(root);

  assert.equal(fs.existsSync(path.join(root, 'docs', 'stale.txt')), false);
});

test('uppercase HTML extensions are discovered and linked', () => {
  const root = createFixture({ posts: { 'UPPER.HTML': postHtml({ title: 'Upper' }) } });
  const result = quietBuild(root);
  const index = fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8');

  assert.equal(result.posts, 1);
  assert.match(index, /posts\/UPPER\.HTML/);
  assert.equal(fs.existsSync(path.join(root, 'docs', 'posts', 'UPPER.HTML')), true);
});

test('resolveInside rejects traversal even if called directly', () => {
  const root = createFixture();
  const base = path.join(root, 'docs', 'tags');

  assert.throws(() => resolveInside(base, '..'), /Unsafe output path/);
  assert.throws(() => resolveInside(base, '../escape.html'), /Unsafe output path/);
  assert.equal(resolveInside(base, safeTagFilename('../escape')).startsWith(path.resolve(base)), true);
});
