/* 本地开发服务器：静态托管项目根目录 + 将 /api/data 挂载到 api/data.js
 * 未配置 BLOB_READ_WRITE_TOKEN 时，API 自动退回 /tmp 临时文件存储（仅调试用）。
 * 用法：npm run dev  →  http://localhost:8787
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../api/data.js';

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
