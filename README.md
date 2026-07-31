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
<meta name="date" content="2026-07-31">
<meta name="tags" content="技术,随笔">
```

规则：

- `title` 和 `date` 必填；缺失时构建失败并指出文章文件和字段。
- `date` 必须是真实存在的 `YYYY-MM-DD` 日期。
- `tags` 可选，多个标签以英文逗号分隔；重复标签会自动去重。
- meta 属性顺序不受限制，属性值支持单双引号。
- 标题和标签会作为纯文本转义，标签文件名会转换为安全的 ASCII 名称。
- 文章必须是完整 HTML，可以继续使用自己的内联 `<style>`；构建时会逐字节复制，不改写内容。

## 构建

```bash
npm run build
```

输出到 `docs/`：

- `index.html`：按日期倒序的文章列表；同日按文件名排序。
- `tags/*.html`：标签归档页。
- `posts/*.html`：文章逐字节副本。
- `assets/site.css`：首页和标签页样式。

构建会先校验所有输入，再在临时目录生成完整站点，最后替换 `docs/`。元数据或必要资源有误时会以非零状态退出，并保留最后一个完整的 `docs/`。

## 测试与检查

```bash
npm test
npm run check
```

测试使用 Node.js 内置 `node:test`，覆盖元数据解析、日期校验、HTML 转义、路径安全、失败保护、复制一致性、排序、内部链接和重复构建幂等性。

## 部署到 GitHub Pages

用户主页站点使用公开仓库 `<username>.github.io`：

1. 将项目推送到仓库的 `main` 分支。
2. 在仓库 Settings → Pages 中选择 `Deploy from a branch`。
3. Branch 选择 `main`，目录选择 `/docs`。
4. 保存并等待部署，访问 `https://<username>.github.io/`。

每次发布前运行 `npm run check && npm run build`，并提交最新的 `docs/`。

## 约束

- 不引入静态站点生成框架。
- `package.json` 保持零依赖。
- 构建脚本不修改 `posts/` 和 `docs-src/`。
- `docs/` 是可重复生成的已提交发布产物。
