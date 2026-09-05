# 系规知识点背记工具 · Vercel 部署版

原单文件 HTML 工具的线上部署版：页面为静态托管，学习数据（掌握进度、抽查记录、考试日期）通过 **Vercel Serverless Functions** 保存到云端，多设备/多浏览器之间用「学习码」同步进度，不再只锁在某台设备的 localStorage 里。

原单文件版本保留在 `系规必背知识点背记工具2026年版.html`，仅作参考，可随时删除。

## 项目结构

```
├── index.html              # 页面（样式 + 视图结构 + 顶栏同步组件）
├── js/
│   ├── data.js             # 题库（第4～17章知识点，与原版一致）
│   ├── sync.js             # 云端同步模块：学习码、拉取合并、防抖推送
│   └── app.js              # 应用逻辑（与原版一致 + 同步钩子）
├── api/
│   └── data.js             # Serverless Function：GET/PUT 学习数据
├── scripts/dev-server.mjs  # 本地开发服务器（无需 Vercel CLI）
├── package.json
└── 系规必背知识点背记工具2026年版.html  # 原单文件版（存档）
```

## 部署到 Vercel（约 5 分钟）

### 方式一：通过 Git 仓库（推荐）

1. 把本项目推到 GitHub / GitLab 仓库。
2. 登录 [vercel.com](https://vercel.com) → **Add New… → Project** → 导入该仓库，框架选择 **Other**，直接 **Deploy**（无需改任何构建配置，`index.html` 与 `api/` 目录会被自动识别）。
3. 部署完成后，还需要启用云端存储：进入项目 **Storage** 标签页 → **Create Database** → 选择 **Blob** → 创建并 **Connect to Project**。Vercel 会自动注入环境变量 `BLOB_READ_WRITE_TOKEN`。
4. 回到 **Deployments**，对最新一次部署点 **Redeploy**（让环境变量生效）。

### 方式二：通过 Vercel CLI

```bash
npm i -g vercel
vercel            # 首次按提示登录并创建项目
# 在 Vercel 控制台按上面第 3 步创建并连接 Blob 存储后：
vercel env pull .env.local   # 拉取 BLOB_READ_WRITE_TOKEN（可选，用于本地 vercel dev）
vercel --prod
```

部署完成后访问分配的 `*.vercel.app` 域名即可。首次打开会自动生成一个学习码（右上角），在其他设备上点学习码组件输入同一码，进度即同步。

## 本地开发

```bash
npm install
npm run dev        # → http://localhost:8787
```

- 未配置 `BLOB_READ_WRITE_TOKEN` 时，API 自动退回 `/tmp` 临时文件存储（重启即清空，仅用于调试）；配置后走 Vercel Blob。
- 也可以用 `vercel dev`（需先 `vercel link` + `vercel env pull`）。

## API 说明

`api/data.js` 提供两个接口（数据文档为一个 JSON，单用户 ≤ 数十 KB）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/data?k=<学习码>` | 读取该学习码的数据，不存在返回 `{ data: null }` |
| PUT | `/api/data`，body `{ k, doc }` | 保存数据文档，`savedAt` 由服务端盖章 |

`doc` 结构（与原版 localStorage 三份数据一一对应）：

```json
{
  "progress": { "4": { "0": 1, "3": 2 } },   // 掌握状态：1=已掌握 2=待巩固（0/缺省=未学习）
  "quizLog":  { "4_0": 1757000000000 },      // 每题最近答对时间戳（抽查冷却用）
  "examDate": "2026-11-07",                  // 考试日期
  "savedAt":  1757000000000                  // 服务端盖章的保存时间
}
```

存储后端：配置了 `BLOB_READ_WRITE_TOKEN` 时写入 **Vercel Blob**（`access: 'private'`，数据 URL 无法被未授权读取）；未配置时退回服务器临时目录（不可用于生产）。

## 同步机制说明

- **离线优先**：localStorage 仍是第一数据源，接口不可用时应用照常使用，恢复后自动重试推送。
- **多端合并**：拉取云端数据后按规则合并——掌握状态取高（已掌握 > 待巩固 > 未学习）、抽查记录取较新时间、考试日期取较新文档。因此旧版单文件页面积累的本地进度，首次打开新版时会自动合并上传。
- **学习码即凭据**：码在 URL/请求中明文传输（HTTPS），请自行保管，不要把学习码告诉不信任的人。
- 已知取舍：在一台设备上「重置进度」后，其他设备已记录的掌握状态会在下次合并时被保留（合并策略偏向不丢学习记录）。
