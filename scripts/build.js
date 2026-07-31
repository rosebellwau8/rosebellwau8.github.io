const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'posts');
const DOCS_DIR = path.join(ROOT, 'docs');

function extractMeta(html, name) {
  const m = html.match(new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, 'i'));
  return m ? m[1] : '';
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function build() {
  // 1. Scan posts
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.html'));
  const posts = files.map(f => {
    const html = fs.readFileSync(path.join(POSTS_DIR, f), 'utf-8');
    return {
      file: f,
      title: extractMeta(html, 'title') || f.replace('.html', ''),
      date: extractMeta(html, 'date') || '1970-01-01',
      tags: extractMeta(html, 'tags').split(',').map(t => t.trim()).filter(Boolean),
    };
  });

  // Sort by date descending
  posts.sort((a, b) => b.date.localeCompare(a.date));

  // 2. Clean and prepare docs/
  cleanDir(DOCS_DIR);
  ensureDir(path.join(DOCS_DIR, 'posts'));
  ensureDir(path.join(DOCS_DIR, 'tags'));
  ensureDir(path.join(DOCS_DIR, 'assets'));

  // 3. Copy site.css
  const cssSource = path.join(ROOT, 'docs-src', 'site.css');
  if (fs.existsSync(cssSource)) {
    fs.copyFileSync(cssSource, path.join(DOCS_DIR, 'assets', 'site.css'));
  }

  // 4. Copy posts as-is
  for (const f of files) {
    fs.copyFileSync(path.join(POSTS_DIR, f), path.join(DOCS_DIR, 'posts', f));
  }

  // 5. Generate index.html
  const postListHtml = posts.map(p => {
    const tagLinks = p.tags.map(t =>
      `<a class="tag" href="tags/${encodeURIComponent(t)}.html">${t}</a>`
    ).join(' ');
    return `    <li>
      <a class="post-link" href="posts/${p.file}">${p.title}</a>
      <span class="post-meta">${p.date} ${tagLinks}</span>
    </li>`;
  }).join('\n');

  const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>博客</title>
<link rel="stylesheet" href="assets/site.css">
</head>
<body>
<div class="container">
  <header>
    <h1>博客</h1>
    <p class="subtitle">纯 HTML，零框架，写完就发。</p>
  </header>
  <main>
    <ul class="post-list">
${postListHtml}
    </ul>
  </main>
  <footer>
    <p>Built with a 50-line Node.js script. No framework was harmed.</p>
  </footer>
</div>
</body>
</html>`;

  fs.writeFileSync(path.join(DOCS_DIR, 'index.html'), indexHtml, 'utf-8');

  // 6. Generate tag pages
  const tagMap = {};
  for (const p of posts) {
    for (const t of p.tags) {
      if (!tagMap[t]) tagMap[t] = [];
      tagMap[t].push(p);
    }
  }

  for (const [tag, tagPosts] of Object.entries(tagMap)) {
    const listHtml = tagPosts.map(p =>
      `    <li>
      <a class="post-link" href="../posts/${p.file}">${p.title}</a>
      <span class="post-meta">${p.date}</span>
    </li>`
    ).join('\n');

    const tagHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>标签：${tag}</title>
<link rel="stylesheet" href="../assets/site.css">
</head>
<body>
<div class="container">
  <header>
    <h1>标签：${tag}</h1>
    <p class="subtitle"><a href="../index.html">← 返回首页</a></p>
  </header>
  <main>
    <ul class="post-list">
${listHtml}
    </ul>
  </main>
  <footer>
    <p>Built with a 50-line Node.js script. No framework was harmed.</p>
  </footer>
</div>
</body>
</html>`;

    fs.writeFileSync(
      path.join(DOCS_DIR, 'tags', `${tag}.html`),
      tagHtml,
      'utf-8'
    );
  }

  console.log(`Build complete: ${posts.length} posts, ${Object.keys(tagMap).length} tags.`);
}

build();
