const TOKEN_KEY = 'cradle.token';
export const api = {
  token: localStorage.getItem(TOKEN_KEY) || null,
  setToken(t) { this.token = t; if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); },
  async req(method, path, body) {
    const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let data = null; try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) { const err = new Error((data && data.error) || `HTTP ${res.status}`); err.status = res.status; throw err; }
    return data;
  },
  get(p) { return this.req('GET', p); },
  post(p, b) { return this.req('POST', p, b || {}); },
  register: (username, password) => api.post('/api/auth/register', { username, password }),
  login: (username, password) => api.post('/api/auth/login', { username, password }),
  me: () => api.get('/api/auth/me'),
  catalog: () => api.get('/api/games/catalog'),
  games: () => api.get('/api/games'),
  createGame: (opts) => api.post('/api/games', opts),
  game: (id) => api.get(`/api/games/${id}`),
  action: (id, action, params) => api.post(`/api/games/${id}/actions`, { id: action, params }),
  order: (id, items) => api.post(`/api/games/${id}/orders`, { items }),
  settings: (id, patch) => api.post(`/api/games/${id}/settings`, patch),
  chat: (id, text) => api.post(`/api/games/${id}/chat`, { text }),
  chatHistory: (id) => api.get(`/api/games/${id}/chat`),
  events: (id) => api.get(`/api/games/${id}/events?limit=300`),
  playdateCreate: (gameId) => api.post('/api/playdates', { gameId }),
  playdateJoin: (code, gameId) => api.post(`/api/playdates/${code}/join`, { gameId }),
  playdateGet: (code) => api.get(`/api/playdates/${code}`),
  playdateEnd: (code) => api.post(`/api/playdates/${code}/end`),
};
