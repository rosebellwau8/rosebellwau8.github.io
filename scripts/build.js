'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.resolve(__dirname, '..');
const SITE_NAME = 'jogtor的博客';
const POST_CONTROLS_STYLESHEET = '../assets/post-controls.css';
const META_TAG_PATTERN = /<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const ATTRIBUTE_PATTERN = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttributes(tag) {
  const body = tag
    .replace(/^<meta\b/i, '')
    .replace(/\/?>\s*$/, '');
  const attributes = new Map();
  let match;

  while ((match = ATTRIBUTE_PATTERN.exec(body)) !== null) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attributes.set(name, value);
  }

  return attributes;
}

function extractMeta(html, name) {
  const tags = html.match(META_TAG_PATTERN) || [];
  const wanted = name.toLowerCase();

  for (const tag of tags) {
    const attributes = parseAttributes(tag);
    if ((attributes.get('name') || '').toLowerCase() === wanted) {
      return attributes.get('content') ?? '';
    }
  }

  return '';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12
    && day >= 1 && day <= days[month - 1]
    && hours >= 0 && hours <= 23
    && minutes >= 0 && minutes <= 59;
}

function compareText(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function safeTagFilename(tag) {
  const encoded = Buffer.from(tag, 'utf8').toString('base64url');
  return `tag-${encoded}.html`;
}

function resolveInside(baseDir, filename) {
  const base = path.resolve(baseDir);
  const target = path.resolve(base, filename);
  const relative = path.relative(base, target);

  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Unsafe output path: ${filename}`);
  }

  return target;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function validatePost(file, html) {
  const title = extractMeta(html, 'title').trim();
  const author = extractMeta(html, 'author').trim();
  const date = extractMeta(html, 'date').trim();
  const rawTags = extractMeta(html, 'tags');

  if (!title) {
    throw new Error(`${file}: missing required meta field "title"`);
  }
  if (!author) {
    throw new Error(`${file}: missing required meta field "author"`);
  }
  if (author !== 'jogtor') {
    throw new Error(`${file}: author must be "jogtor", got "${author}"`);
  }
  if (!date) {
    throw new Error(`${file}: missing required meta field "date"`);
  }
  if (!isValidDate(date)) {
    throw new Error(`${file}: invalid date "${date}"; expected YYYY-MM-DD HH:MM`);
  }

  const tags = [...new Set(rawTags.split(',').map(tag => tag.trim()).filter(Boolean))];
  for (const tag of tags) {
    if (tag.length > 100 || /[\u0000-\u001f\u007f]/.test(tag)) {
      throw new Error(`${file}: invalid tag ${JSON.stringify(tag)}`);
    }
  }

  return { file, title, author, date, tags };
}

function collectSite(root) {
  const postsDir = path.join(root, 'posts');
  const cssSource = path.join(root, 'docs-src', 'site.css');
  const postControlsCssSource = path.join(root, 'docs-src', 'post-controls.css');

  if (!fs.existsSync(postsDir) || !fs.statSync(postsDir).isDirectory()) {
    throw new Error(`Missing posts directory: ${postsDir}`);
  }
  if (!fs.existsSync(cssSource) || !fs.statSync(cssSource).isFile()) {
    throw new Error(`Missing required stylesheet: ${cssSource}`);
  }
  if (!fs.existsSync(postControlsCssSource) || !fs.statSync(postControlsCssSource).isFile()) {
    throw new Error(`Missing required stylesheet: ${postControlsCssSource}`);
  }

  const files = fs.readdirSync(postsDir)
    .filter(file => /\.html$/i.test(file))
    .sort(compareText);
  const posts = files.map(file => {
    const html = fs.readFileSync(path.join(postsDir, file), 'utf8');
    return validatePost(file, html);
  });

  posts.sort((a, b) => {
    const byDate = compareText(b.date, a.date);
    return byDate || compareText(a.file, b.file);
  });

  const tagMap = new Map();
  for (const post of posts) {
    for (const tag of post.tags) {
      if (!tagMap.has(tag)) tagMap.set(tag, []);
      tagMap.get(tag).push(post);
    }
  }

  return { root, postsDir, cssSource, postControlsCssSource, files, posts, tagMap };
}

function enhancePostHtml(html) {
  let output = html;

  if (!output.includes(`href="${POST_CONTROLS_STYLESHEET}"`)) {
    if (!/<\/head\s*>/i.test(output)) {
      throw new Error('Post HTML is missing a closing </head> tag');
    }
    output = output.replace(
      /<\/head\s*>/i,
      `<link rel="stylesheet" href="${POST_CONTROLS_STYLESHEET}">\n</head>`,
    );
  }

  if (!/href\s*=\s*(["'])\.\.\/index\.html(?:[?#][^"']*)?\1/i.test(output)) {
    if (!/<\/body\s*>/i.test(output)) {
      throw new Error('Post HTML is missing a closing </body> tag');
    }
    output = output.replace(
      /<\/body\s*>/i,
      '<a class="site-home-button" href="../index.html" aria-label="返回首页">← 返回首页</a>\n</body>',
    );
  }

  return output;
}

function renderPostList(posts, prefix) {
  return posts.map(post => `    <li>
      <a class="post-link" href="${prefix}${encodeURIComponent(post.file)}">${escapeHtml(post.title)}</a>
      <span class="post-meta">${escapeHtml(post.date)}</span>
    </li>`).join('\n');
}

function renderIndex(posts) {
  const list = posts.map(post => {
    const tagLinks = post.tags.map(tag =>
      `<a class="tag" href="tags/${safeTagFilename(tag)}">${escapeHtml(tag)}</a>`
    ).join(' ');
    return `    <li>
      <a class="post-link" href="posts/${encodeURIComponent(post.file)}">${escapeHtml(post.title)}</a>
      <span class="post-meta">${escapeHtml(post.date)} ${tagLinks}</span>
    </li>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${SITE_NAME}</title>
<link rel="stylesheet" href="assets/site.css">
</head>
<body>
<div class="container">
  <header>
    <h1>${SITE_NAME}</h1>
    <p class="subtitle">纯 HTML，零框架，写完就发。</p>
  </header>
  <main>
    <ul class="post-list">
${list}
    </ul>
  </main>
  <footer>
    <p>Built with Node.js. No framework was harmed.</p>
  </footer>
</div>
</body>
</html>\n`;
}

function renderTagPage(tag, posts) {
  const safeTag = escapeHtml(tag);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>标签：${safeTag}</title>
<link rel="stylesheet" href="../assets/site.css">
</head>
<body>
<div class="container">
  <header>
    <h1>标签：${safeTag}</h1>
    <p class="subtitle"><a href="../index.html">← 返回首页</a></p>
  </header>
  <main>
    <ul class="post-list">
${renderPostList(posts, '../posts/')}
    </ul>
  </main>
  <footer>
    <p>Built with Node.js. No framework was harmed.</p>
  </footer>
</div>
</body>
</html>`;
}

function writeOutput(site, outputDir) {
  const postsOutput = path.join(outputDir, 'posts');
  const tagsOutput = path.join(outputDir, 'tags');
  const assetsOutput = path.join(outputDir, 'assets');
  ensureDir(postsOutput);
  ensureDir(tagsOutput);
  ensureDir(assetsOutput);

  fs.writeFileSync(resolveInside(outputDir, '.nojekyll'), '', 'utf8');
  fs.copyFileSync(site.cssSource, resolveInside(assetsOutput, 'site.css'));
  fs.copyFileSync(site.postControlsCssSource, resolveInside(assetsOutput, 'post-controls.css'));
  for (const file of site.files) {
    const html = fs.readFileSync(path.join(site.postsDir, file), 'utf8');
    fs.writeFileSync(resolveInside(postsOutput, file), enhancePostHtml(html), 'utf8');
  }
  fs.writeFileSync(resolveInside(outputDir, 'index.html'), renderIndex(site.posts), 'utf8');

  for (const [tag, posts] of site.tagMap) {
    const filename = safeTagFilename(tag);
    fs.writeFileSync(resolveInside(tagsOutput, filename), renderTagPage(tag, posts), 'utf8');
  }
}

function replaceOutput(tempDir, docsDir, backupDir) {
  let oldMoved = false;
  try {
    if (fs.existsSync(docsDir)) {
      fs.renameSync(docsDir, backupDir);
      oldMoved = true;
    }
    fs.renameSync(tempDir, docsDir);
    if (oldMoved) fs.rmSync(backupDir, { recursive: true, force: true });
  } catch (error) {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    if (oldMoved && !fs.existsSync(docsDir) && fs.existsSync(backupDir)) {
      fs.renameSync(backupDir, docsDir);
    }
    throw error;
  }
}

function build(root = DEFAULT_ROOT, options = {}) {
  const log = options.log || console.log;
  const absoluteRoot = path.resolve(root);
  const docsDir = path.join(absoluteRoot, 'docs');
  const token = `${process.pid}-${Date.now()}`;
  const tempDir = path.join(absoluteRoot, `.docs-tmp-${token}`);
  const backupDir = path.join(absoluteRoot, `.docs-backup-${token}`);

  const site = collectSite(absoluteRoot);
  try {
    writeOutput(site, tempDir);
    replaceOutput(tempDir, docsDir, backupDir);
  } catch (error) {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }

  const result = { posts: site.posts.length, tags: site.tagMap.size, docsDir };
  log(`Build complete: ${result.posts} posts, ${result.tags} tags.`);
  return result;
}

if (require.main === module) {
  try {
    build();
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  build,
  collectSite,
  enhancePostHtml,
  escapeHtml,
  extractMeta,
  isValidDate,
  renderIndex,
  renderTagPage,
  resolveInside,
  safeTagFilename,
  validatePost,
};
