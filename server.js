// Stretchy Cap multiplayer server
// - Serves the game (public/index.html and friends) over HTTP(S)
// - Runs rooms over WebSocket at /ws: create a room (gets a 5-letter code), join by code, leave
// - Relays each player's pose (head, hands, arms) to everyone else in the room, ~20 times a second
// - Tells everyone who is in the room (names, fur and ball colours) and who the host is
// Deploy anywhere that runs Node 18+ with WebSockets (Render, Railway, Fly.io, a VPS). See README.md.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR || path.join(__dirname, 'public'));
const MAX_PLAYERS = 10;              // per room
const MAX_MSG_BYTES = 4096;
const MAX_MSGS_PER_SEC = 60;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.json':'application/json', '.webmanifest':'application/manifest+json',
  '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.txt':'text/plain; charset=utf-8', '.css':'text/css', '.glb':'model/gltf-binary' };

// ---------- HTTP: the game files and a health check ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.writeHead(200, {'content-type':'application/json'}); return res.end(JSON.stringify({ ok:true, rooms:rooms.size, players:clients.size })); }
  let p = decodeURIComponent(url.pathname); if (p === '/' || p === '') p = '/index.html';
  const file = path.resolve(PUBLIC_DIR, '.' + p);
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, {'content-type':'text/plain'}); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': p.endsWith('.html') ? 'no-cache' : 'public, max-age=3600' });
    fs.createReadStream(file).pipe(res);
  });
});

// ---------- rooms ----------
const rooms = new Map();    // code -> { code, players: Map(id -> client), host }
const clients = new Map();  // id -> client
let nextId = 1;

function newCode() {
  for (let tries = 0; tries < 1000; tries++) {
    let c = ''; for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  throw new Error('no free codes');
}
const cleanName = n => String(n || 'Monke').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Monke';
const cleanColor = c => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) ? c : '';
const info = c => ({ id: c.id, name: c.name, fur: c.fur, ball: c.ball });
const send = (c, m) => { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(m)); };
function broadcast(room, m, except) { const s = JSON.stringify(m); for (const c of room.players.values()) if (c !== except && c.ws.readyState === 1) c.ws.send(s); }
function rosterOf(room) { return [...room.players.values()].map(info); }

function joinRoom(c, code) {
  const room = rooms.get(code);
  if (!room) return send(c, { t:'error', msg:'No room with code ' + code + '.' });
  if (room.players.size >= MAX_PLAYERS) return send(c, { t:'error', msg:'That room is full.' });
  leaveRoom(c, true);
  room.players.set(c.id, c); c.room = room;
  if (!room.host || !room.players.has(room.host)) room.host = c.id;
  send(c, { t:'joined', code: room.code, host: room.host, players: rosterOf(room) });
  broadcast(room, { t:'roster', host: room.host, players: rosterOf(room) }, c);
  console.log(`[room ${room.code}] ${c.name} joined (${room.players.size} players)`);
}
function leaveRoom(c, quiet) {
  const room = c.room; if (!room) return;
  room.players.delete(c.id); c.room = null;
  if (room.players.size === 0) { rooms.delete(room.code); console.log(`[room ${room.code}] closed`); }
  else {
    if (room.host === c.id) room.host = room.players.keys().next().value;  // the longest-staying player takes over
    broadcast(room, { t:'roster', host: room.host, players: rosterOf(room) });
  }
  if (!quiet) send(c, { t:'left' });
}

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MSG_BYTES });
wss.on('connection', (ws, req) => {
  const c = { id: 'p' + (nextId++), ws, name: 'Monke', fur: '', ball: '#0000ff', room: null, alive: true, bucket: MAX_MSGS_PER_SEC, last: Date.now() };
  clients.set(c.id, c);
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', raw => {
    // simple rate limit: refill a bucket of messages per second
    const now = Date.now(); c.bucket = Math.min(MAX_MSGS_PER_SEC, c.bucket + (now - c.last) * MAX_MSGS_PER_SEC / 1000); c.last = now;
    if (c.bucket < 1) return; c.bucket -= 1;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    switch (m.t) {
      case 'hello':
        c.name = cleanName(m.name); c.fur = cleanColor(m.fur); c.ball = cleanColor(m.ball) || '#0000ff';
        send(c, { t:'welcome', id: c.id }); break;
      case 'info':
        if (m.name !== undefined) c.name = cleanName(m.name);
        if (m.fur !== undefined) c.fur = cleanColor(m.fur);
        if (m.ball !== undefined) c.ball = cleanColor(m.ball) || c.ball;
        if (c.room) broadcast(c.room, { t:'roster', host: c.room.host, players: rosterOf(c.room) });
        break;
      case 'create': {
        const code = newCode(); rooms.set(code, { code, players: new Map(), host: null });
        console.log(`[room ${code}] created by ${c.name}`); joinRoom(c, code); break;
      }
      case 'join': joinRoom(c, String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)); break;
      case 'leave': leaveRoom(c); break;
      case 's': {
        // a pose: 26 numbers. Pass it on to everyone else in the room with the sender's id.
        if (!c.room || !Array.isArray(m.s) || m.s.length !== 26 || !m.s.every(n => typeof n === 'number' && isFinite(n))) return;
        const out = { t:'s', id: c.id, s: m.s };
        if (m.x && Array.isArray(m.x.bear) && m.x.bear.length === 3 && c.room.host === c.id) out.x = { bear: m.x.bear.map(Number) };
        broadcast(c.room, out, c); break;
      }
    }
  });
  ws.on('close', () => { leaveRoom(c, true); clients.delete(c.id); });
  ws.on('error', () => {});
});
// drop connections that stopped answering
setInterval(() => { for (const c of clients.values()) { if (!c.alive) { c.ws.terminate(); continue; } c.alive = false; try { c.ws.ping(); } catch (e) {} } }, 15000);

server.listen(PORT, () => console.log(`Stretchy Cap server on port ${PORT} (game files from ${PUBLIC_DIR})`));
