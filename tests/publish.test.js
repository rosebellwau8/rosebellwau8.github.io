'use strict';

const { afterEach, test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { parseArgs, publish } = require('../scripts/publish');

const fixtureRoots = [];

afterEach(() => {
  for (const root of fixtureRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  fixtureRoots.length = 0;
});

function articleHtml({ title = '自动发布测试', date = '2026-07-31 12:00', tags = '测试' } = {}) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="title" content="${title}">
<meta name="author" content="jogtor">
<meta name="date" content="${date}">
<meta name="tags" content="${tags}">
<title>${title}</title>
</head>
<body><h1>${title}</h1></body>
</html>`;
}

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-publish-test-'));
  fixtureRoots.push(root);
  fs.mkdirSync(path.join(root, 'posts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs-src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'incoming'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs-src', 'site.css'), 'body { color: #111; }\n', 'utf8');
  fs.writeFileSync(path.join(root, 'docs-src', 'post-controls.css'), 'a[href="../index.html"] { position: fixed; }\n', 'utf8');
  return root;
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test('parseArgs supports one-command local publishing and overwrite opt-in', () => {
  assert.deepEqual(parseArgs(['article.html', '--local', '--force']), {
    articlePath: 'article.html',
    force: true,
    help: false,
    local: true,
  });
});

test('Windows launcher remains ASCII-only and forwards all arguments', () => {
  const launcher = fs.readFileSync(path.join(__dirname, '..', '发布博客.cmd'));
  const text = launcher.toString('ascii');

  assert.equal([...launcher].every(byte => byte < 128), true);
  assert.match(text, /^node scripts\\publish\.js %\*$/m);
  assert.doesNotMatch(text, /ARTICLE_PATH/);
});

test('local publish validates, copies, and builds an article', () => {
  const root = createFixture();
  const source = path.join(root, 'incoming', 'new-post.html');
  fs.writeFileSync(source, articleHtml(), 'utf8');

  const result = publish(root, source, { local: true, log() {} });

  assert.equal(result.file, 'new-post.html');
  assert.equal(result.title, '自动发布测试');
  assert.equal(result.pushed, false);
  assert.equal(fs.readFileSync(path.join(root, 'posts', 'new-post.html'), 'utf8'), articleHtml());
  assert.match(fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8'), /自动发布测试/);
});

test('invalid article metadata fails before copying or building', () => {
  const root = createFixture();
  const source = path.join(root, 'incoming', 'bad.html');
  fs.writeFileSync(source, '<!doctype html><html><head></head><body></body></html>', 'utf8');

  assert.throws(() => publish(root, source, { local: true, log() {} }), /missing required meta field "title"/);
  assert.equal(fs.existsSync(path.join(root, 'posts', 'bad.html')), false);
  assert.equal(fs.existsSync(path.join(root, 'docs')), false);
});

test('publish refuses to overwrite a different same-name article without --force', () => {
  const root = createFixture();
  const source = path.join(root, 'incoming', 'same-name.html');
  fs.writeFileSync(source, articleHtml({ title: '新版本' }), 'utf8');
  fs.writeFileSync(path.join(root, 'posts', 'same-name.html'), articleHtml({ title: '旧版本' }), 'utf8');

  assert.throws(() => publish(root, source, { local: true, log() {} }), /already exists.*--force/i);
  assert.match(fs.readFileSync(path.join(root, 'posts', 'same-name.html'), 'utf8'), /旧版本/);
});

test('failed build restores an article overwritten with --force', () => {
  const root = createFixture();
  const source = path.join(root, 'incoming', 'same-name.html');
  const target = path.join(root, 'posts', 'same-name.html');
  fs.writeFileSync(source, articleHtml({ title: '新版本' }), 'utf8');
  fs.writeFileSync(target, articleHtml({ title: '旧版本' }), 'utf8');
  fs.rmSync(path.join(root, 'docs-src', 'site.css'));

  assert.throws(
    () => publish(root, source, { force: true, local: true, log() {} }),
    /Missing required stylesheet/,
  );
  assert.match(fs.readFileSync(target, 'utf8'), /旧版本/);
  assert.doesNotMatch(fs.readFileSync(target, 'utf8'), /新版本/);
});

test('full publish commits the article and pushes it to the configured remote', () => {
  const root = createFixture();
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-publish-remote-'));
  fixtureRoots.push(remote);

  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.name', 'Publish Test']);
  git(root, ['config', 'user.email', 'publish-test@example.com']);
  git(root, ['add', 'docs-src']);
  git(root, ['commit', '-m', 'Initial fixture']);
  git(remote, ['init', '--bare']);
  git(root, ['remote', 'add', 'origin', remote]);
  git(root, ['push', '-u', 'origin', 'main']);

  const source = path.join(root, 'incoming', 'pushed.html');
  fs.writeFileSync(source, articleHtml({ title: '已经推送' }), 'utf8');
  const result = publish(root, source, { log() {} });

  assert.equal(result.pushed, true);
  assert.equal(git(root, ['log', '-1', '--pretty=%s']), '发布文章：已经推送');
  assert.match(git(remote, ['show', 'main:posts/pushed.html']), /已经推送/);
  assert.match(git(remote, ['show', 'main:docs/index.html']), /已经推送/);
});
