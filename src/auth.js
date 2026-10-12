import crypto from 'node:crypto';
import { Router } from 'express';

/**
 * Single-admin auth.
 * The password lives only in the ADMIN_PASSWORD env var. Logging in returns a signed,
 * expiring session token (HMAC of the expiry, keyed by the password), so the browser never
 * stores the password and rotating it invalidates every outstanding session.
 */

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_FAILED_LOGINS = 10;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;

function adminPassword() {
  const pw = process.env.ADMIN_PASSWORD;
  return pw && pw.length >= 12 ? pw : null;
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function issueToken(secret) {
  const exp = String(Date.now() + SESSION_TTL_MS);
  return { token: `${exp}.${sign(exp, secret)}`, expiresAt: Number(exp) };
}

function verifyToken(token, secret) {
  const [exp, mac] = String(token || '').split('.');
  if (!exp || !mac || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now()) return false;
  return safeEqual(mac, sign(exp, secret));
}

function bearer(req) {
  const h = req.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

export function isAdmin(req) {
  const secret = adminPassword();
  return Boolean(secret && verifyToken(bearer(req), secret));
}

/** Reject the request unless it carries a valid admin session. Fails closed if no password is configured. */
export function requireAdmin(req, res, next) {
  if (!adminPassword()) {
    return res.status(503).json({ error: 'Admin access is not configured on the server' });
  }
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// In-memory failed-login counter per client IP.
const failures = new Map();

function tooManyFailures(ip) {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > FAILED_LOGIN_WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILED_LOGINS;
}

function recordFailure(ip) {
  const entry = failures.get(ip);
  if (!entry || Date.now() - entry.first > FAILED_LOGIN_WINDOW_MS) {
    failures.set(ip, { first: Date.now(), count: 1 });
  } else {
    entry.count += 1;
  }
}

export const authRouter = Router();

/** POST /api/auth/login { password } -> { token, expiresAt } */
authRouter.post('/login', (req, res) => {
  const secret = adminPassword();
  if (!secret) return res.status(503).json({ error: 'Admin access is not configured on the server' });
  const ip = req.ip;
  if (tooManyFailures(ip)) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
  }
  const { password } = req.body || {};
  if (!password || !safeEqual(password, secret)) {
    recordFailure(ip);
    return res.status(401).json({ error: 'Invalid password' });
  }
  failures.delete(ip);
  res.json(issueToken(secret));
});

/** GET /api/auth/session -> 200 when the bearer token is still valid */
authRouter.get('/session', requireAdmin, (_req, res) => {
  res.json({ ok: true });
});
