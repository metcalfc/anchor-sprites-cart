import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// "Remember this device" is on for everyone: a session lasts 30 days, like most
// vendor portals. A pending sign-in, between the password and the code, lasts 10
// minutes.
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PENDING_TTL_MS = 10 * 60 * 1000;

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 32).toString('hex') };
}

export function verifyPassword(password, { salt, hash }) {
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

const mac = (secret, payload) => createHmac('sha256', secret).update(payload).digest('base64url');

// A token is signed JSON: what it is for, the user id and an expiry. The same
// shape is used for the session cookie and the pending sign-in cookie.
export function signToken(secret, kind, userId, ttl, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ kind, userId, exp: now + ttl })).toString(
    'base64url',
  );
  return `${payload}.${mac(secret, payload)}`;
}

export function readToken(secret, kind, value, now = Date.now()) {
  const [payload, signature] = String(value ?? '').split('.');
  if (!payload || !signature) return undefined;
  const expected = Buffer.from(mac(secret, payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined;
  try {
    const token = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return token.kind === kind && typeof token.exp === 'number' && token.exp > now
      ? token.userId
      : undefined;
  } catch {
    return undefined;
  }
}
