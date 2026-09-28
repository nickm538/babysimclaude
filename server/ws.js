// WebSocket hub: per-game live state streams + playdate rooms.
import { WebSocketServer } from 'ws';
import { verifyToken } from './auth.js';

export function createHub(server, store, gm) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const hub = { rooms: new Map(), sockets: new Set(), roomBroadcast };
  function roomBroadcast(code, msg) {
    const s = JSON.stringify(msg);
    for (const ws of hub.sockets) if (ws.room === code && ws.readyState === 1) ws.send(s);
  }
  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url, 'http://x');
    const userId = verifyToken(url.searchParams.get('token'));
    const gameId = url.searchParams.get('game');
    if (!userId || !gameId) { ws.close(4001, 'unauthorized'); return; }
    const game = await gm.load(gameId);
    if (!game || game.userId !== userId) { ws.close(4004, 'no game'); return; }
    ws.gameId = gameId; ws.userId = userId; ws.isAlive = true;
    hub.sockets.add(ws);
    gm.subscribe(gameId, ws);
    ws.send(JSON.stringify({ type: 'state', view: gm.view(gameId), events: [], hello: true }));
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', async (raw) => {
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      if (msg.type === 'ping') { ws.send(JSON.stringify({ type: 'pong', t: Date.now() })); return; }
      if (msg.type === 'action' && typeof msg.id === 'string') {
        const result = await gm.act(gameId, msg.id, msg.params && typeof msg.params === 'object' ? msg.params : {});
        ws.send(JSON.stringify({ type: 'action_result', reqId: msg.reqId, ...result }));
        return;
      }
      if (msg.type === 'join_room' && typeof msg.code === 'string') { ws.room = msg.code.toUpperCase(); return; }
      if (msg.type === 'leave_room') { ws.room = null; return; }
      if (msg.type === 'room_chat' && ws.room && typeof msg.text === 'string') {
        roomBroadcast(ws.room, { type: 'playdate', event: 'chat', from: game.parent.name || 'Parent', baby: game.baby.name, text: msg.text.slice(0, 300), at: Date.now() });
        return;
      }
      if (msg.type === 'room_pose' && ws.room) { roomBroadcast(ws.room, { type: 'playdate', event: 'pose', gameId, pose: msg.pose }); }
    });
    ws.on('close', () => { hub.sockets.delete(ws); gm.unsubscribe(gameId, ws); });
  });
  const iv = setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 30000);
  wss.on('close', () => clearInterval(iv));
  return hub;
}
