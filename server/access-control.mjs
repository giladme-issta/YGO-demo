import { createHash, timingSafeEqual } from 'node:crypto';
import { AppError } from './errors.mjs';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const digest = value => createHash('sha256').update(value).digest();

export function createAccessControl({
  host = '127.0.0.1',
  environment = 'development',
  publicOrigin = '',
  username = '',
  password = '',
} = {}) {
  let origin = null;
  if (publicOrigin) {
    let url;
    try {
      url = new URL(publicOrigin);
    } catch {
      throw new AppError(500, 'PUBLIC_ORIGIN_INVALID', 'PUBLIC_ORIGIN must be an HTTP(S) origin.');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) {
      throw new AppError(500, 'PUBLIC_ORIGIN_INVALID', 'PUBLIC_ORIGIN must contain only the HTTP(S) scheme and host.');
    }
    origin = url.origin;
  }

  // Use server configuration, never request Host/Forwarded headers, to allow local development.
  const required = !['development', 'test'].includes(environment) ||
    !LOOPBACK_HOSTS.has(host) || Boolean(origin && !LOOPBACK_HOSTS.has(new URL(origin).hostname));
  if (!required) return { required, origin, authorize: () => true };

  if (typeof username !== 'string' || !username.trim() || username.length > 128 ||
      /[:\u0000-\u001f\u007f]/.test(username) || typeof password !== 'string' ||
      password.trim().length < 12 || password.length > 1024 || /[\u0000-\u001f\u007f]/.test(password)) {
    throw new AppError(500, 'POC_AUTH_CONFIG',
      'Non-local access requires POC_AUTH_USER (no colon) and POC_AUTH_PASSWORD (at least 12 characters).');
  }
  const expected = digest(Buffer.from(`${username}:${password}`, 'utf8'));
  return {
    required,
    origin,
    authorize(header) {
      if (typeof header !== 'string') return false;
      const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header);
      if (!match) return false;
      const credentials = Buffer.from(match[1], 'base64');
      if (credentials.toString('base64') !== match[1]) return false;
      return timingSafeEqual(expected, digest(credentials));
    },
  };
}
