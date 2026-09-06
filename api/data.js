/* 学习数据云存储 API
 * GET /api/data?k=<学习码>   → { data: 文档|null, storage: 'blob'|'tmp' }
 * PUT /api/data  body: { k, doc } → { ok: true, storage, updatedAt }
 *
 * 存储后端：
 * - 生产（Vercel）：检测到 BLOB_READ_WRITE_TOKEN 时使用 Vercel Blob（public store）；
 * - 本地开发：未配置令牌时退回 /tmp 文件存储，仅用于调试，重启即清空。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const KEY_RE = /^[a-z0-9_-]{4,32}$/;
const MAX_BODY = 512 * 1024;
const PREFIX = 'userdata/';
const TMP_DIR = path.join(os.tmpdir(), 'xisu-memorize-data');

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new Error('TOO_LARGE');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/* ---- 存储后端 ---- */
async function blobBackend() {
  const blob = await import('@vercel/blob');
  return {
    kind: 'blob',
    async get(k) {
      try {
        const r = await blob.get(PREFIX + k + '.json', { access: 'public' });
        if (!r || r.statusCode !== 200 || !r.stream) return null;
        const text = await new Response(r.stream).text();
        return JSON.parse(text);
      } catch (e) {
        return null; // 不存在或读取失败均视为无数据
      }
    },
    async put(k, doc) {
      await blob.put(PREFIX + k + '.json', JSON.stringify(doc), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
      });
    },
  };
}

function tmpBackend() {
  const fileFor = (k) => path.join(TMP_DIR, k + '.json');
  return {
    kind: 'tmp',
    async get(k) {
      try {
        return JSON.parse(fs.readFileSync(fileFor(k), 'utf8'));
      } catch (e) {
        return null;
      }
    },
    async put(k, doc) {
      fs.mkdirSync(TMP_DIR, { recursive: true });
      fs.writeFileSync(fileFor(k), JSON.stringify(doc));
    },
  };
}

async function getBackend() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      return await blobBackend();
    } catch (e) {
      // 依赖缺失等情况，退回临时存储
    }
  }
  return tmpBackend();
}

/* ---- 入口 ---- */
export default async function handler(req, res) {
  // 同源部署不需要 CORS；放开以便本地静态调试与第三方客户端访问
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  let backend;
  try {
    backend = await getBackend();
  } catch (e) {
    return json(res, 500, { error: 'storage unavailable' });
  }

  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    const k = (url.searchParams.get('k') || '').trim().toLowerCase();
    if (!KEY_RE.test(k)) return json(res, 400, { error: 'invalid key' });
    const data = await backend.get(k);
    return json(res, 200, { data, storage: backend.kind });
  }

  if (req.method === 'PUT') {
    let bodyStr;
    try {
      bodyStr = await readBody(req);
    } catch (e) {
      return json(res, e.message === 'TOO_LARGE' ? 413 : 400, { error: e.message });
    }
    let body;
    try {
      body = JSON.parse(bodyStr);
    } catch (e) {
      return json(res, 400, { error: 'bad json' });
    }
    const k = String(body.k || '').trim().toLowerCase();
    if (!KEY_RE.test(k)) return json(res, 400, { error: 'invalid key' });
    const doc = body.doc;
    if (!doc || typeof doc !== 'object') return json(res, 400, { error: 'missing doc' });
    // 收敛字段，避免任意内容写入
    doc.progress = doc.progress && typeof doc.progress === 'object' ? doc.progress : {};
    doc.quizLog = doc.quizLog && typeof doc.quizLog === 'object' ? doc.quizLog : {};
    doc.examDate = String(doc.examDate || '');
    doc.savedAt = Date.now();
    try {
      await backend.put(k, doc);
    } catch (e) {
      return json(res, 500, { error: 'save failed' });
    }
    return json(res, 200, { ok: true, storage: backend.kind, updatedAt: doc.savedAt });
  }

  return json(res, 405, { error: 'method not allowed' });
}
