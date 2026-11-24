import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_AGE_S = 120;

// Checks an Anchor webhook delivery: HMAC-SHA256 over `v0:{t}:{raw body}`, in
// the header `Anchor-Signature: t=<unix seconds>,v1=<hex>`. Rejects anything
// older than two minutes. Accepts any of `secrets`, for rotation.
export function verifyAnchorSignature({ header, rawBody, secrets, now = Date.now() }) {
  const parts = Object.fromEntries(
    String(header ?? '')
      .split(',')
      .map((part) => part.trim().split('=')),
  );
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t)) return false;
  if (Math.abs(now / 1000 - t) > MAX_AGE_S) return false;
  const given = Buffer.from(parts.v1, 'hex');
  return secrets.filter(Boolean).some((secret) => {
    const expected = createHmac('sha256', secret).update(`v0:${parts.t}:`).update(rawBody).digest();
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}
