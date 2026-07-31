'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { build, validatePost } = require('./build');

const DEFAULT_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  let articlePath = '';
  let force = false;
  let help = false;
  let local = false;

  for (const arg of argv) {
    if (arg === '--force') force = true;
    else if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--local') local = true;
    else if (arg.startsWith('--')) throw new Error(`未知参数：${arg}`);
    else if (articlePath) throw new Error('一次只能发布一篇文章。');
    else articlePath = arg;
  }

  if (!help && !articlePath) throw new Error('请提供要发布的 HTML 文件路径。');
  return { articlePath, force, help, local };
}

function runCommand(command, args, cwd, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    windowsHide: true,
  });

  if (result.error) {
    throw new Error(`无法运行 ${command}：${result.error.message}`);
  }
  return result;
}

function commandError(command, result) {
  const detail = (result.stderr || result.stdout || '').trim();
  return new Error(`${command} 执行失败${detail ? `：${detail}` : ''}`);
}

function comparablePath(value) {
  const resolved = fs.realpathSync.native(path.resolve(value));
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function ensureGitReady(root, filename) {
  const repoResult = runCommand('git', ['rev-parse', '--show-toplevel'], root, true);
  if (repoResult.status !== 0) {
    throw new Error('当前博客目录不是 Git 仓库，请先克隆远端仓库。若只想本地构建，请使用 --local。');
  }

  const repoRoot = repoResult.stdout.trim();
  if (comparablePath(repoRoot) !== comparablePath(root)) {
    throw new Error(`博客目录不是当前 Git 仓库根目录：${repoRoot}`);
  }

  const stagedResult = runCommand('git', ['diff', '--cached', '--quiet'], root, true);
  if (stagedResult.status === 1) {
    throw new Error('Git 暂存区已有其他改动，请先提交或取消暂存，避免自动发布误带文件。');
  }
  if (stagedResult.status !== 0) throw commandError('git diff --cached', stagedResult);

  const postsResult = runCommand(
    'git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', 'posts'],
    root,
    true,
  );
  if (postsResult.status !== 0) throw commandError('git status', postsResult);

  const allowedPath = `posts/${filename}`;
  const otherPostChanges = postsResult.stdout
    .split('\0')
    .filter(Boolean)
    .map(record => record.slice(3).replaceAll('\\', '/'))
    .filter(changedPath => changedPath !== allowedPath);

  if (otherPostChanges.length > 0) {
    throw new Error(`posts/ 中还有未发布的改动：${otherPostChanges.join(', ')}`);
  }
}

function runGitOrThrow(root, args) {
  const result = runCommand('git', args, root);
  if (result.status !== 0) throw commandError(`git ${args[0]}`, result);
}

function hasStagedPublication(root, filename) {
  const result = runCommand(
    'git',
    ['diff', '--cached', '--quiet', '--', `posts/${filename}`, 'docs'],
    root,
    true,
  );
  if (result.status === 0) return false;
  if (result.status === 1) return true;
  throw commandError('git diff --cached', result);
}

function restoreArticle(target, previousContent, existedBefore) {
  if (existedBefore) fs.writeFileSync(target, previousContent);
  else if (fs.existsSync(target)) fs.rmSync(target, { force: true });
}

function publish(root, articlePath, options = {}) {
  const absoluteRoot = path.resolve(root);
  const source = path.resolve(articlePath);
  const log = options.log || console.log;
  const local = options.local === true;
  const force = options.force === true;

  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error(`找不到文章文件：${source}`);
  }
  if (!/\.html$/i.test(source)) {
    throw new Error('文章必须是 .html 文件。');
  }

  const filename = path.basename(source);
  const html = fs.readFileSync(source, 'utf8');
  const metadata = validatePost(filename, html);
  const postsDir = path.join(absoluteRoot, 'posts');
  const target = path.join(postsDir, filename);

  if (!local) ensureGitReady(absoluteRoot, filename);
  fs.mkdirSync(postsDir, { recursive: true });

  const sameFile = path.resolve(source) === path.resolve(target);
  const existedBefore = fs.existsSync(target);
  const previousContent = existedBefore ? fs.readFileSync(target) : null;
  const alreadyIdentical = existedBefore && previousContent.equals(Buffer.from(html));

  if (!sameFile && existedBefore && !alreadyIdentical && !force) {
    throw new Error(`${filename} already exists；如需覆盖，请增加 --force。`);
  }

  const articleChanged = !sameFile && !alreadyIdentical;
  if (articleChanged) {
    fs.copyFileSync(source, target);
    log(`已复制文章：posts/${filename}`);
  } else {
    log(`文章已在 posts/ 中：${filename}`);
  }

  let buildResult;
  try {
    buildResult = build(absoluteRoot, { log });
  } catch (error) {
    if (articleChanged) restoreArticle(target, previousContent, existedBefore);
    throw error;
  }

  if (local) {
    log('本地构建完成；未提交或推送 Git。');
    return {
      file: filename,
      title: metadata.title,
      date: metadata.date,
      pushed: false,
      posts: buildResult.posts,
      tagCount: buildResult.tags,
    };
  }

  runGitOrThrow(absoluteRoot, ['add', '--', `posts/${filename}`, 'docs']);
  if (hasStagedPublication(absoluteRoot, filename)) {
    runGitOrThrow(absoluteRoot, ['commit', '-m', `发布文章：${metadata.title}`]);
  } else {
    log('文章和发布目录没有新的改动，跳过提交。');
  }
  runGitOrThrow(absoluteRoot, ['push']);
  log('发布完成：已推送到 GitHub，Pages 稍后会自动更新。');

  return {
    file: filename,
    title: metadata.title,
    date: metadata.date,
    pushed: true,
    posts: buildResult.posts,
    tagCount: buildResult.tags,
  };
}

function usage() {
  return `jogtor的博客：一键发布

用法：
  npm run publish -- "C:\\文章目录\\my-article.html"
  npm run publish -- "C:\\文章目录\\my-article.html" --local
  npm run publish -- "C:\\文章目录\\my-article.html" --force

参数：
  --local   只复制和构建，不提交或推送
  --force   允许覆盖 posts/ 中的同名文章
  --help    显示帮助`;
}

function runCli(argv = process.argv.slice(2)) {
  try {
    const args = parseArgs(argv);
    if (args.help) {
      console.log(usage());
      return;
    }
    publish(DEFAULT_ROOT, args.articlePath, args);
  } catch (error) {
    console.error(`发布失败：${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) runCli();

module.exports = {
  parseArgs,
  publish,
  runCli,
  usage,
};
