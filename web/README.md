# 公众端 React 工程

## 技术栈

- React 19
- TypeScript（strict）
- Vite 7
- React Router 6
- TanStack Query 5
- Zustand 5
- Vitest
- Playwright
- ESLint + Prettier

该工程负责全部公众端页面。现有 Node.js、SQLite、管理端和 AI 服务继续由项目根目录的 `server.js` 提供；管理端仍使用服务端模板。

## 路由

- `/`：首页
- `/projects`：非遗项目列表
- `/projects/:id`：项目详情、AI 讲解与 3D 模型
- `/inheritors`：传承人列表
- `/inheritors/:id`：传承人详情
- `/explore`：非遗探索星图
- `/organizations`：探访线索
- `/organizations/:id`：探访详情

## 开发

先在项目根目录启动后端：

```powershell
node --disable-warning=ExperimentalWarning server.js
```

再启动前端：

```powershell
cd web
npm install
npm run dev
```

Vite 会把 `/api`、`/assets`、`/uploads` 和 `/models3d` 代理到 `http://127.0.0.1:3000`。

## 构建

```powershell
cd web
npm run build
```

构建输出写入 `public/app/`。Node 服务会在根路径和全部公众直达地址返回 React 入口，并对项目、传承人和探访详情注入首屏标题、描述、Open Graph 与 canonical。刷新 `/projects/169` 等地址不需要额外服务器规则。管理端 `/admin/*` 保持原有服务端模板。

## 质量检查

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run test:e2e
```

Playwright 使用本机 Edge，不下载额外浏览器。

## 目录

```text
src/
├── api/          类型化公众 API 客户端
├── components/   导航、卡片、筛选、分页、AI、3D、讲解
├── pages/        各公众路由页面
├── stores/       Zustand 跨组件状态
├── styles/       React 增量样式
├── types/        API 与领域类型
├── App.tsx       路由入口
└── main.tsx      Provider 与挂载入口
```

## 环境变量

复制 `.env.example` 为 `.env.local`：

```text
VITE_API_BASE=/api/public
```

前端只能使用 `VITE_*` 非敏感配置。DeepSeek 和其他模型密钥必须保存在服务端，不能写入 `web/`。
