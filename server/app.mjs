import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { AppError, AI_STATUS } from './errors.mjs';
import { answerQuestion } from './qa.mjs';
import { requireHotelId } from './repository.mjs';
import { createAccessControl } from './access-control.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.json': 'application/json; charset=utf-8',
};

function sendJson(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(data));
}

async function readQuestion(request) {
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    throw new AppError(415, 'JSON_REQUIRED', 'יש לשלוח את השאלה בפורמט JSON.');
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length <= 32 * 1024) chunks.push(chunk);
  }
  if (length > 32 * 1024) {
    throw new AppError(413, 'BODY_TOO_LARGE', 'הבקשה ארוכה מדי.');
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AppError(400, 'INVALID_JSON', 'מבנה הבקשה אינו תקין.');
  }
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  if (!question || question.length > 2000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(question)) {
    throw new AppError(400, 'INVALID_QUESTION', 'יש להזין שאלה באורך של עד 2,000 תווים.');
  }
  const messages = body.messages ?? [];
  if (!Array.isArray(messages) || messages.length > 6 || messages.some(message =>
    !message || !['user', 'assistant'].includes(message.role) ||
    typeof message.content !== 'string' || !message.content.trim() || message.content.length > 2000
  )) {
    throw new AppError(400, 'INVALID_HISTORY', 'היסטוריית השיחה אינה תקינה.');
  }
  return { question, messages: messages.map(({ role, content }) => ({ role, content })) };
}

export function createApp({
  repository, publicDir, qaClient, mapboxPublicToken = '',
  access = createAccessControl(), logger = console,
}) {
  const root = path.resolve(publicDir);
  const ai = qaClient ? { available: qaClient.available, reason: qaClient.reason } : AI_STATUS;
  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Content-Security-Policy', [
      "default-src 'self'", "script-src 'self' 'unsafe-inline' https://api.mapbox.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.mapbox.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' https: http: data: blob:", "worker-src 'self' blob:",
      "connect-src 'self' https://api.mapbox.com https://events.mapbox.com",
      "base-uri 'none'", "object-src 'none'", "form-action 'self'",
      "frame-ancestors 'self'",
    ].join('; '));
    try {
      const url = new URL(request.url, 'http://localhost');
      let pathname;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        throw new AppError(400, 'INVALID_PATH', 'כתובת הבקשה אינה תקינה.');
      }
      if (pathname === '/api/health' && request.method === 'GET') {
        return sendJson(response, 200, access.required ? { status: 'ok' } : { status: 'ok', mode: repository.mode });
      }
      if (!access.authorize(request.headers.authorization)) {
        response.setHeader('WWW-Authenticate', 'Basic realm="YGO POC", charset="UTF-8"');
        throw new AppError(401, 'POC_AUTH_REQUIRED', 'נדרשים שם משתמש וסיסמה לצפייה בהדגמה.');
      }
      if (access.required) response.setHeader('Cache-Control', 'private, no-store');
      if (pathname === '/api/map-config' && request.method === 'GET') {
        if (!mapboxPublicToken.startsWith('pk.')) {
          throw new AppError(503, 'MAPBOX_NOT_CONFIGURED', 'המפה אינה זמינה. יש להגדיר מפתח Mapbox ציבורי בשרת.');
        }
        return sendJson(response, 200, { accessToken: mapboxPublicToken });
      }
      if (pathname === '/api/hotels' && request.method === 'GET') {
        return sendJson(response, 200, {
          hotels: await repository.list(), source: { mode: repository.mode }, ai,
        });
      }
      const hotelRoute = /^\/api\/hotels\/([^/]+)(\/ask)?$/.exec(pathname);
      if (hotelRoute) {
        const [, id, ask] = hotelRoute;
        requireHotelId(id);
        const method = ask ? 'POST' : 'GET';
        if (request.method !== method) {
          response.setHeader('Allow', method);
          throw new AppError(405, 'METHOD_NOT_ALLOWED', 'סוג הבקשה אינו נתמך.');
        }
        if (ask) {
          const origin = request.headers.origin;
          if (origin && origin !== (access.origin || `http://${request.headers.host}`)) {
            throw new AppError(403, 'ORIGIN_NOT_ALLOWED', 'ניתן לשלוח שאלות רק מתוך עמוד המלון.');
          }
          const { question, messages } = await readQuestion(request);
          const { raw, hotel } = await repository.get(id);
          let answer = answerQuestion(raw, hotel, question);
          if (!answer && qaClient?.available) {
            answer = await qaClient.ask(raw, hotel, question, messages);
          }
          if (!answer) throw new AppError(503, 'AI_UNAVAILABLE', ai.reason);
          return sendJson(response, 200, answer);
        }
        const { hotel, source } = await repository.get(id);
        return sendJson(response, 200, { hotel, source, ai });
      }
      if (pathname.startsWith('/api/')) {
        throw new AppError(404, 'NOT_FOUND', 'הפעולה לא נמצאה.');
      }
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.setHeader('Allow', 'GET, HEAD');
        throw new AppError(405, 'METHOD_NOT_ALLOWED', 'סוג הבקשה אינו נתמך.');
      }
      if (pathname === '/') {
        response.writeHead(302, { Location: `/hotel-page/index.html${url.search}` });
        return response.end();
      }
      if (pathname.includes('\\') || pathname.includes('\0') ||
          pathname.split('/').some(part => part.startsWith('.'))) {
        throw new AppError(404, 'NOT_FOUND', 'העמוד לא נמצא.');
      }
      if (pathname.endsWith('/')) pathname += 'index.html';
      const candidate = path.resolve(root, `.${pathname}`);
      if (!candidate.startsWith(`${root}${path.sep}`)) {
        throw new AppError(404, 'NOT_FOUND', 'העמוד לא נמצא.');
      }
      let file;
      try {
        file = await realpath(candidate);
        if (!file.startsWith(`${root}${path.sep}`) || !(await stat(file)).isFile()) {
          throw new AppError(404, 'NOT_FOUND', 'העמוד לא נמצא.');
        }
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
          throw new AppError(404, 'NOT_FOUND', 'העמוד לא נמצא.');
        }
        throw error;
      }
      const mime = TYPES[path.extname(file).toLowerCase()];
      if (!mime) throw new AppError(404, 'NOT_FOUND', 'העמוד לא נמצא.');
      const content = await readFile(file);
      response.writeHead(200, {
        'Content-Type': mime, 'Content-Length': content.length,
        'Cache-Control': access.required ? 'private, no-store' : 'no-cache',
      });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      const known = error instanceof AppError;
      const status = known ? error.status : 500;
      const code = known ? error.code : 'INTERNAL_ERROR';
      logger.warn(`[http] ${status} ${code}`);
      if (response.headersSent || response.destroyed) {
        response.destroy();
        return;
      }
      if (known && error.retryAfter) response.setHeader('Retry-After', error.retryAfter);
      sendJson(response, status, {
        error: { code, message: known ? error.message : 'אירעה שגיאה בשרת. נסו שוב מאוחר יותר.' },
      });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}
