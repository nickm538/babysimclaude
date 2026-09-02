import { Router } from 'express';
import { hashPassword, checkPassword, signToken, newId, validUsername, validPassword, authMiddleware } from '../auth.js';

export function authRoutes(store) {
  const r = Router();
  r.post('/register', async (req, res) => {
    const { username, password } = req.body || {};
    if (!validUsername(username)) return res.status(400).json({ error: 'Username: 3-20 letters, numbers or _' });
    if (!validPassword(password)) return res.status(400).json({ error: 'Password must be at least 4 characters' });
    if (await store.getUserByName(username)) return res.status(409).json({ error: 'That name is taken' });
    const user = { id: newId(), username, passwordHash: await hashPassword(password) };
    await store.createUser(user);
    res.json({ token: signToken(user.id), user: { id: user.id, username } });
  });
  r.post('/login', async (req, res) => {
    const { username, password } = req.body || {};
    const user = username ? await store.getUserByName(String(username)) : null;
    if (!user || !(await checkPassword(String(password || ''), user.passwordHash))) return res.status(401).json({ error: 'Wrong name or password' });
    res.json({ token: signToken(user.id), user: { id: user.id, username: user.username } });
  });
  r.get('/me', authMiddleware(store), (req, res) => res.json({ user: req.user }));
  return r;
}
