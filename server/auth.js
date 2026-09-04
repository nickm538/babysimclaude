import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
if (!process.env.SESSION_SECRET) console.warn('[auth] SESSION_SECRET not set — using a development secret');

export function signToken(userId) {
  const payload = Buffer.from(JSON.stringify({ u: userId, t: Date.now() })).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expect = createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (expect.length !== sig.length || !timingSafeEqual(Buffer.from(expect), Buffer.from(sig))) return null;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).u || null; } catch { return null; }
}

export async function hashPassword(pw) { return bcrypt.hash(pw, 10); }
export async function checkPassword(pw, hash) { return bcrypt.compare(pw, hash); }

export function newId() { return randomUUID(); }

export function validUsername(u) { return typeof u === 'string' && /^[a-zA-Z0-9_]{3,20}$/.test(u); }
export function validPassword(p) { return typeof p === 'string' && p.length >= 4 && p.length <= 128; }

export function authMiddleware(store) {
  return async (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : (req.query.token || null);
    const userId = verifyToken(token);
    if (!userId) return res.status(401).json({ error: 'Not signed in' });
    const user = await store.getUser(userId);
    if (!user) return res.status(401).json({ error: 'Unknown user' });
    req.user = user;
    next();
  };
}
