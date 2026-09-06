/* 本地开发服务器：静态托管项目根目录 + 将 /api/data 挂载到 api/data.js
 * 未配置 BLOB_READ_WRITE_TOKEN 时，API 自动退回 /tmp 临时文件存储（仅调试用）。
 * 用法：npm run dev  →  http://localhost:8787
 * 如存在 .env.local（vercel env pull 生成），自动加载其中的环境变量。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../api/data.js';

/* ---- 加载 .env.local（不覆盖已有环境变量；跳过本地无用的 OIDC/Store 变量） ---- */
const SKIP_ENV = new Set(['VERCEL_OIDC_TOKEN', 'BLOB_STORE_ID']);
const ENV_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local');
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!SKIP_ENV.has(m[1]) && !(m[1] in process.env)) process.env[m[1]] = v;
  }
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8787;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === '/api/data' || url.pathname.startsWith('/api/')) {
      try {
        await handler(req, res);
      } catch (e) {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
        }
        res.end(JSON.stringify({ error: String((e && e.message) || e) }));
      }
      return;
    }
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }
    try {
      const data = await fs.promises.readFile(file);
      res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
      res.end(data);
    } catch (e) {
      res.statusCode = 404;
      res.end('Not Found');
    }
  })
  .listen(PORT, () => {
    console.log(`本地开发服务器已启动: http://localhost:${PORT}`);
    console.log(
      process.env.BLOB_READ_WRITE_TOKEN
        ? '检测到 BLOB_READ_WRITE_TOKEN，数据将写入 Vercel Blob。'
        : '未配置 BLOB_READ_WRITE_TOKEN，数据写入临时目录（仅本地调试用）。'
    );
  });
