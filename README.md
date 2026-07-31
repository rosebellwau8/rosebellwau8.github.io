# 个人博客

纯 HTML 文章 + 自动索引。零框架，零依赖，写完就发。

## 结构

```
posts/          ← 文章 HTML（自带内联样式，构建时原样复制）
scripts/        ← 构建脚本
docs-src/       ← 首页/标签页样式源文件
docs/           ← 构建输出（GitHub Pages 发布目录）
```

## 写文章

在 `posts/` 下新建一个 `.html` 文件，在 `<head>` 中声明元数据：

```html
<meta name="title" content="文章标题">
<meta name="date" content="2026-07-31">
<meta name="tags" content="技术,随笔">
```

文章自带完整样式（内联 `<style>`），构建脚本不会修改它的任何内容。

## 构建

```bash
npm run build
```

输出到 `docs/`：
- `index.html` — 文章列表（按日期倒序）
- `tags/<标签>.html` — 标签归档页
- `posts/*.html` — 文章原样复制
- `assets/site.css` — 首页/标签页样式

## 部署到 GitHub Pages

1. 在 GitHub 创建仓库 `<username>.github.io`
2. 把本项目 push 到 `main` 分支
3. 进入仓库 Settings → Pages → Source 选 `Deploy from a branch`
4. Branch 选 `main`，目录选 `/docs`
5. 保存，等几分钟，访问 `https://<username>.github.io`

## 规则

- 构建脚本不修改 `posts/` 下的任何文件
- 不引入 SSG 框架
- `package.json` 零依赖
