import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { AppError } from './errors.mjs';

const API_URL = 'https://api.ygo.ai/v2/project/content/getEnrichedHotel';
const PROXY_SCRIPT = fileURLToPath(new URL('../scripts/ygo-request.ps1', import.meta.url));
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export function retryDelay(value, now = Date.now()) {
  if (!value) return null;
  const seconds = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
  const milliseconds = seconds === null ? Date.parse(value) - now : seconds * 1000;
  return Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : null;
}

export async function nativeRequest(request, fetchImpl = fetch) {
  const response = await fetchImpl(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal: AbortSignal.timeout(request.timeoutSeconds * 1000),
  });
  const body = await response.text();
  if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) {
    throw new Error('Upstream response exceeds the supported size');
  }
  return {
    status: response.status,
    body,
    retryAfter: response.headers.get('retry-after'),
  };
}

export function windowsProxyRequest(request) {
  if (process.platform !== 'win32') {
    return Promise.reject(new AppError(500, 'TRANSPORT_CONFIGURATION',
      'תעבורת Windows proxy זמינה רק ב-Windows.'));
  }
  return new Promise((resolve, reject) => {
    const child = execFile('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-File', PROXY_SCRIPT,
    ], {
      windowsHide: true,
      timeout: (request.timeoutSeconds + 5) * 1000,
      maxBuffer: MAX_RESPONSE_BYTES,
      encoding: 'utf8',
    }, (error, stdout) => {
      if (error) {
        reject(new Error('Windows proxy request failed'));
        return;
      }
      try {
        const result = JSON.parse(stdout.replace(/^\uFEFF/, ''));
        if (!Number.isInteger(result.status) || typeof result.body !== 'string') {
          throw new Error('Invalid proxy result');
        }
        resolve(result);
      } catch {
        reject(new Error('Windows proxy returned an invalid response'));
      }
    });
    child.stdin.on('error', () => reject(new Error('Windows proxy input failed')));
    child.stdin.end(JSON.stringify(request));
  });
}

export function createYgoClient({
  key = process.env.YGO_PROJECT_KEY,
  projectId = process.env.YGO_PROJECT_ID || '01a1ac5e-3596-7f4c-bf1c-5917f5035f3b',
  transport = process.env.YGO_TRANSPORT || 'native',
  requestImpl,
  wait = sleep,
} = {}) {
  if (!['native', 'windows-proxy'].includes(transport)) {
    throw new AppError(500, 'TRANSPORT_CONFIGURATION', 'הגדרת תעבורת YGO אינה תקינה.');
  }
  const request = requestImpl || (transport === 'windows-proxy' ? windowsProxyRequest : nativeRequest);

  return {
    async getHotel(id) {
      if (!key?.trim()) {
        throw new AppError(503, 'YGO_KEY_MISSING', 'יש להגדיר YGO_PROJECT_KEY בתהליך השרת.');
      }
      let result;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          result = await request({
            url: API_URL,
            headers: {
              Authorization: `Bearer ${key}`,
              'X-Project-ID': projectId,
              'Content-Type': 'application/json',
            },
            body: { ExternalHotelID: { productid: id } },
            timeoutSeconds: 30,
          });
        } catch (error) {
          if (error instanceof AppError) throw error;
          throw new AppError(502, 'YGO_CONNECTION_FAILED',
            'לא ניתן להתחבר ל-YGO. בדקו את החיבור והגדרת ה-proxy בשרת.');
        }
        const delay = retryDelay(result.retryAfter);
        if (result.status !== 429 || attempt !== 0 || delay === null || delay > 3000) break;
        await wait(delay);
      }
      if (result.status === 429) {
        const delay = retryDelay(result.retryAfter);
        throw new AppError(429, 'YGO_RATE_LIMIT',
          'בוצעו יותר מדי פניות ל-YGO. נסו שוב מאוחר יותר.',
          { retryAfter: delay === null ? undefined : String(Math.ceil(delay / 1000)) });
      }
      if (result.status === 401 || result.status === 403) {
        throw new AppError(502, 'YGO_ACCESS_DENIED', 'YGO דחה את ההרשאה. בדקו את מפתח הפרויקט בשרת.');
      }
      if (result.status === 404) {
        throw new AppError(404, 'YGO_HOTEL_NOT_FOUND', 'המלון לא נמצא בפרויקט YGO.');
      }
      if (result.status < 200 || result.status >= 300) {
        throw new AppError(502, 'YGO_UPSTREAM_ERROR', 'שירות YGO החזיר שגיאה. נסו שוב מאוחר יותר.');
      }
      let envelope;
      try {
        envelope = JSON.parse(result.body);
      } catch {
        throw new AppError(502, 'YGO_INVALID_RESPONSE', 'התקבלה תשובה לא תקינה מ-YGO.');
      }
      if (!envelope?.Data || envelope.Error || typeof envelope.Data !== 'object' || Array.isArray(envelope.Data)) {
        throw new AppError(502, 'YGO_INVALID_RESPONSE', 'התקבלה תשובה לא תקינה מ-YGO.');
      }
      return envelope.Data;
    },
  };
}
