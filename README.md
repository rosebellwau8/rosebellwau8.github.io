# 个人博客

纯 HTML 文章 + 自动索引。零框架、零 npm 依赖，文章写完即可构建为静态站点。

## 环境要求

- Node.js 18 或更高版本
- npm（仅用于运行脚本，不需要执行 `npm install`）

## 项目结构

```text
posts/          完整 HTML 文章源文件
scripts/        零依赖构建脚本
tests/          Node.js 内置测试
docs-src/       首页和标签页的样式源文件
docs/           构建输出及 GitHub Pages 发布目录
```

## 写文章

在 `posts/` 下创建完整的 `.html` 文件，并在 `<head>` 中声明元数据：

```html
<meta name="title" content="文章标题">
<meta name="author" content="jogtor">
<meta name="date" content="2026-07-31 14:30">
<meta name="tags" content="技术,随笔">
```

规则：

- `title`、`author` 和 `date` 必填；缺失时构建失败并指出文章文件和字段。
- `author` 固定为 `jogtor`。
- `date` 必须是真实存在的 `YYYY-MM-DD HH:MM` 日期时间（精确到分钟）。
- `tags` 可选，多个标签以英文逗号分隔；重复标签会自动去重。
- meta 属性顺序不受限制，属性值支持单双引号。
- 标题和标签会作为纯文本转义，标签文件名会转换为安全的 ASCII 名称。
- 文章必须是完整 HTML，可以继续使用自己的内联 `<style>`；构建不会修改 `posts/` 中的源文件。
- 构建产物会自动加载文章导航样式，将 `href="../index.html"` 的首页链接固定在页面右下角；若文章没有该链接，构建时会自动补上。

## 构建

```bash
npm run build
```

输出到 `docs/`：

- `index.html`：按日期倒序的文章列表；同日按文件名排序。
- `tags/*.html`：标签归档页。
- `posts/*.html`：文章内容及构建时添加的通用文章导航。
- `assets/site.css`：首页和标签页样式。
- `assets/post-controls.css`：文章页固定导航样式。

构建会先校验所有输入，再在临时目录生成完整站点，最后替换 `docs/`。元数据或必要资源有误时会以非零状态退出，并保留最后一个完整的 `docs/`。

## 一键发布

最简单的方法是把写好的 HTML 文件拖到项目根目录的 `发布博客.cmd` 上。直接双击启动器不会发布文章；没有使用拖拽时请改用下面的命令行方式。

命令行方式：

```powershell
npm run publish -- "C:\文章目录\my-article.html"
```

发布器会依次完成：

1. 校验文章路径、扩展名和元数据。
2. 将文章复制到 `posts/`。
3. 重新生成 `docs/`。
4. 仅暂存本篇文章和 `docs/`，自动创建 Git 提交。
5. 推送到远端，由 GitHub Pages 自动更新网站。

安全规则：

- 同名文章内容不同时默认拒绝覆盖；确认覆盖时增加 `--force`。
- Git 暂存区已有内容时拒绝发布，避免把其他文件带进自动提交。
- `posts/` 中还有其他未发布改动时拒绝发布。
- 构建失败时会恢复刚复制或覆盖的文章，并保留上一次完整的 `docs/`。
- 只想在本地复制和构建时增加 `--local`，不会执行 Git 提交和推送。

```powershell
npm run publish -- "C:\文章目录\my-article.html" --local
npm run publish -- "C:\文章目录\my-article.html" --force
```

## 测试与检查

```bash
npm test
npm run check
```

测试使用 Node.js 内置 `node:test`，覆盖元数据解析、日期校验、HTML 转义、路径安全、失败保护、文章导航注入、排序、内部链接和重复构建幂等性。

## 部署到 GitHub Pages

用户主页站点使用公开仓库 `<username>.github.io`：

1. 将项目推送到仓库的 `main` 分支。
2. 在仓库 Settings → Pages 中将 Source 选择为 `GitHub Actions`。
3. 推送会先运行测试、语法检查、站点重建和产物一致性检查。
4. 只有检查全部通过，工作流才会上传 `docs/` 并部署到 Pages。
5. 同一分支连续推送时，新运行会取消旧运行，只部署最新提交。
6. 等待工作流完成后，访问 `https://<username>.github.io/`。

每次发布前运行 `npm run check && npm run build`，并提交最新的 `docs/`。

## 约束

- 不引入静态站点生成框架。
- `package.json` 保持零依赖。
- 构建脚本不修改 `posts/` 和 `docs-src/`。
- `docs/` 是可重复生成的已提交发布产物。
