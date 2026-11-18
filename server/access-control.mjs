import { createHash, timingSafeEqual } from 'node:crypto';
import { AppError } from './errors.mjs';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const MIN_POC_PASSWORD_LENGTH = 7;
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

  const problems = [];
  if (username === '') {
    problems.push('POC_AUTH_USER is missing or empty');
  } else if (typeof username !== 'string' || !username.trim() || username.length > 128 ||
      /[:\u0000-\u001f\u007f]/.test(username)) {
    problems.push('POC_AUTH_USER must be a non-blank username of at most 128 characters with no colon or control characters');
  }
  if (password === '') {
    problems.push('POC_AUTH_PASSWORD is missing or empty');
  } else if (typeof password !== 'string' || password.trim().length < MIN_POC_PASSWORD_LENGTH ||
      password.length > 1024 || /[\u0000-\u001f\u007f]/.test(password)) {
    problems.push(`POC_AUTH_PASSWORD must have at least ${MIN_POC_PASSWORD_LENGTH} characters after trimming, at most 1024 total, and no control characters`);
  }
  if (problems.length) {
    throw new AppError(500, 'POC_AUTH_CONFIG', `${problems.join('; ')}.`);
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
