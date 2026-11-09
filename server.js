// Stretchy Cap multiplayer server
// - Serves the game (public/index.html and friends) over HTTP(S)
// - Runs rooms over WebSocket at /ws: create a room (gets a 5-letter code), join by code, leave
// - Relays each player's pose (head, hands, arms) to everyone else in the room, ~20 times a second
// - Tells everyone who is in the room (names, fur and ball colours) and who the host is
// - Public matchmaking: 'quickplay' puts you in the fullest public server with a free slot (max 10), or opens a new one
// - Relays hand-touch interactions (high-fives / boops) between players in the same room
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
const SERVER_VERSION = '3';
const FEATURES = ['rooms', 'quickplay', 'tap', 'servers', 'version'];

// The game page. Normally public/index.html; if a newer index.html was uploaded next to server.js by mistake,
// serve whichever copy has the newest GAME_VERSION, and say so in the log.
function gameVersionOf(file) {
  try { const head = fs.readFileSync(file, 'utf8'); const m = /GAME_VERSION\s*=\s*'([^']+)'/.exec(head); return m ? m[1] : '0'; } catch (e) { return null; }
}
function gameFile() {
  const cands = [path.join(PUBLIC_DIR, 'index.html'), path.join(__dirname, 'index.html')]
    .map(f => ({ f, v: gameVersionOf(f) })).filter(c => c.v !== null);
  if (!cands.length) return null;
  cands.sort((a, b) => (a.v < b.v ? 1 : a.v > b.v ? -1 : 0));
  return cands[0];
}
{ const g = gameFile(), all = [path.join(PUBLIC_DIR, 'index.html'), path.join(__dirname, 'index.html')].map(f => [f, gameVersionOf(f)]).filter(x => x[1] !== null);
  console.log(`Stretchy Cap server v${SERVER_VERSION}; game file: ${g ? g.f + ' (game ' + g.v + ')' : 'MISSING'}`);
  if (all.length > 1) console.log(`WARNING: two index.html files found: ${all.map(x => x[0] + ' = ' + x[1]).join(' | ')}. Serving the newest. Put the game in public/index.html.`); }

const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.json':'application/json', '.webmanifest':'application/manifest+json',
  '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.txt':'text/plain; charset=utf-8', '.css':'text/css', '.glb':'model/gltf-binary' };

// ---------- HTTP: the game files and a health check ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.writeHead(200, {'content-type':'application/json'}); return res.end(JSON.stringify({ ok:true, rooms:rooms.size, players:clients.size })); }
  if (url.pathname === '/servers') { res.writeHead(200, {'content-type':'application/json', 'access-control-allow-origin':'*'});
    return res.end(JSON.stringify([...rooms.values()].filter(r => r.pub).map(r => ({ label:r.label, players:r.players.size, max:MAX_PLAYERS })))); }
  if (url.pathname === '/version') {
    const g = gameFile(); let st = null; try { st = g && fs.statSync(g.f); } catch (e) {}
    res.writeHead(200, { 'content-type':'application/json', 'cache-control':'no-store', 'access-control-allow-origin':'*' });
    return res.end(JSON.stringify({ app:'stretchy-cap', server: SERVER_VERSION, features: FEATURES,
      game: g ? { version: g.v, file: path.relative(__dirname, g.f), bytes: st && st.size, modified: st && st.mtime } : null,
      started: STARTED, deployCommit: process.env.RENDER_GIT_COMMIT || null }));
  }
  let p = decodeURIComponent(url.pathname); if (p === '/' || p === '') p = '/index.html';
  let file = path.resolve(PUBLIC_DIR, '.' + p);
  if (p === '/index.html') { const g = gameFile(); if (g) file = g.f; }
  if (!file.startsWith(PUBLIC_DIR) && file !== path.join(__dirname, 'index.html')) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, {'content-type':'text/plain'}); return res.end('Not found'); }
    // the page, the offline-cache script and the manifest are never cached, so a deploy shows up on the next load
    const fresh = /\.(html|webmanifest)$/.test(p) || p === '/sw.js';
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': fresh ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600' });
    fs.createReadStream(file).pipe(res);
  });
});

// ---------- rooms ----------
const rooms = new Map();    // code -> { code, players: Map(id -> client), host, pub, label }
let pubCounter = 0;
const STARTED = new Date().toISOString();
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

function joinRoom(c, code, viaMatchmaking) {
  const room = rooms.get(code);
  if (!room || (room.pub && !viaMatchmaking)) return send(c, { t:'error', msg:'No room with code ' + code + '.' });
  if (room.players.size >= MAX_PLAYERS) return send(c, { t:'error', msg:'That room is full.' });
  leaveRoom(c, true);
  room.players.set(c.id, c); c.room = room;
  if (!room.host || !room.players.has(room.host)) room.host = c.id;
  send(c, { t:'joined', code: room.code, host: room.host, players: rosterOf(room), pub: !!room.pub, label: room.label || null, max: MAX_PLAYERS });
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
        send(c, { t:'welcome', id: c.id, server: SERVER_VERSION, features: FEATURES }); break;
      case 'info':
        if (m.name !== undefined) c.name = cleanName(m.name);
        if (m.fur !== undefined) c.fur = cleanColor(m.fur);
        if (m.ball !== undefined) c.ball = cleanColor(m.ball) || c.ball;
        if (c.room) broadcast(c.room, { t:'roster', host: c.room.host, players: rosterOf(c.room) });
        break;
      case 'create': {
        const code = newCode(); rooms.set(code, { code, players: new Map(), host: null, pub: false });
        console.log(`[room ${code}] created by ${c.name}`); joinRoom(c, code); break;
      }
      case 'join': joinRoom(c, String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)); break;
      case 'quickplay': {
        // server-side matchmaking: the fullest public server that still has a free slot; a new one if all are full
        if (c.room && c.room.pub) return send(c, { t:'joined', code: c.room.code, host: c.room.host, players: rosterOf(c.room), pub: true, label: c.room.label, max: MAX_PLAYERS });
        leaveRoom(c, true);
        let best = null;
        for (const r of rooms.values()) if (r.pub && r.players.size < MAX_PLAYERS && (!best || r.players.size > best.players.size)) best = r;
        if (!best) {
          const used = new Set([...rooms.values()].filter(r => r.pub).map(r => r.num)); let num = 1; while (used.has(num)) num++;
          const code = newCode(); best = { code, players: new Map(), host: null, pub: true, num, label: 'Public Server ' + num }; rooms.set(code, best);
          console.log(`[match] opened ${best.label} (${code})`);
        }
        joinRoom(c, best.code, true);
        console.log(`[match] ${c.name} -> ${best.label} (${best.players.size}/${MAX_PLAYERS})`);
        break;
      }
      case 'tap': {
        // a hand touched another player: tell that player (only within the same room)
        if (!c.room || typeof m.to !== 'string') return;
        const target = c.room.players.get(m.to); if (!target || target === c) return;
        const kind = m.kind === 'five' ? 'five' : 'boop';
        send(target, { t:'tap', from: c.id, kind, hand: m.hand === 1 ? 1 : 0, at: Array.isArray(m.at) && m.at.length === 3 ? m.at.map(Number) : null });
        break;
      }
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
