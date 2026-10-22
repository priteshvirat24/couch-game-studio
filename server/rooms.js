// Rooms pair one TV with any number of phones over WebSocket.
// The TV is the source of truth for what's on screen; phones are controllers
// and idea-makers. Messages are small JSON objects with a `t` (type) field.

import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { cleanName } from './safety.js';

const CODE_RE = /^[A-Z]{4}$/;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O: easy to read off a TV
const MAX_PHONES = 8;
const ACTIONS = new Set(['left', 'right', 'up', 'down', 'action']);
const NAV = new Set(['play', 'pause', 'back', 'again']);
const text = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export class RoomHub {
  constructor() { this.rooms = new Map(); }

  static isCode(code) { return CODE_RE.test(String(code || '').toUpperCase()); }

  newCode() {
    let code;
    do { code = Array.from({ length: 4 }, () => LETTERS[crypto.randomInt(LETTERS.length)]).join(''); } while (this.rooms.has(code));
    this.get(code);
    return code;
  }

  get(code) {
    code = String(code || '').toUpperCase();
    if (!CODE_RE.test(code)) return null;
    if (!this.rooms.has(code)) this.rooms.set(code, { code, tv: null, phones: new Map(), screen: 'arcade', gameId: null, busy: false, touched: Date.now() });
    const room = this.rooms.get(code);
    room.touched = Date.now();
    return room;
  }

  send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
  toTv(room, msg) { this.send(room?.tv, msg); }
  toPhones(room, msg) { if (room) for (const p of room.phones.values()) this.send(p.ws, msg); }
  broadcast(room, msg) { this.toTv(room, msg); this.toPhones(room, msg); }
  players(room) { return [...room.phones.entries()].map(([id, p]) => ({ id, name: p.name })); }

  // Wrap a slow job (making/remixing a game) so a room only runs one at a time.
  async exclusive(room, fn) {
    if (!room) return fn();
    if (room.busy) { const e = new Error('Already making a game, hang on!'); e.status = 409; throw e; }
    room.busy = true;
    try { return await fn(); } finally { room.busy = false; }
  }

  attach(server) {
    const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
    wss.on('connection', (ws, req) => this.onConnection(ws, req));
    // Forget rooms nobody has used for a while.
    this.sweeper = setInterval(() => {
      const cutoff = Date.now() - 30 * 60_000;
      for (const [code, r] of this.rooms) if (!r.tv && !r.phones.size && r.touched < cutoff) this.rooms.delete(code);
    }, 5 * 60_000);
    this.sweeper.unref();
    this.wss = wss;
    return wss;
  }

  close() { clearInterval(this.sweeper); this.wss?.close(); }

  onConnection(ws, req) {
    const url = new URL(req.url, 'http://x');
    const room = this.get(url.searchParams.get('room'));
    if (!room) return ws.close(1008, 'bad room');
    const role = url.searchParams.get('role') === 'tv' ? 'tv' : 'phone';
    if (role === 'phone' && room.phones.size >= MAX_PHONES) return ws.close(1013, 'room full');
    const id = role === 'tv' ? 'tv' : `p_${crypto.randomBytes(4).toString('hex')}`;

    let alive = true;
    ws.on('pong', () => { alive = true; });
    const ping = setInterval(() => { if (!alive) return ws.terminate(); alive = false; ws.ping(); }, 15_000);

    if (role === 'tv') {
      if (room.tv && room.tv !== ws) room.tv.close(4000, 'replaced');
      room.tv = ws;
      this.send(ws, { t: 'players', players: this.players(room) });
    } else {
      room.phones.set(id, { ws, name: 'Player' });
      this.send(ws, { t: 'welcome', id, screen: room.screen, gameId: room.gameId, tvConnected: !!room.tv });
    }

    ws.on('message', (buf) => {
      let msg;
      try { msg = JSON.parse(buf); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      room.touched = Date.now();
      if (role === 'phone') this.fromPhone(room, id, msg);
      else this.fromTv(room, msg);
    });

    ws.on('close', () => {
      clearInterval(ping);
      if (role === 'tv') {
        if (room.tv === ws) {
          // Nothing is on screen any more: phones go back to making games.
          room.tv = null; room.screen = 'arcade'; room.gameId = null;
          this.toPhones(room, { t: 'tv_left' });
          this.toPhones(room, { t: 'screen', screen: 'arcade', gameId: null, title: '', genre: '' });
        }
      } else {
        room.phones.delete(id);
        this.toTv(room, { t: 'leave', id });
      }
    });
  }

  fromPhone(room, id, msg) {
    const phone = room.phones.get(id);
    if (!phone) return;
    if (msg.t === 'hello') {
      phone.name = cleanName(msg.name);
      this.toTv(room, { t: 'join', id, name: phone.name });
    } else if (msg.t === 'input' && ACTIONS.has(msg.action)) {
      this.toTv(room, { t: 'input', id, action: msg.action, down: !!msg.down });
    } else if (msg.t === 'nav' && NAV.has(msg.action)) {
      this.toTv(room, { t: 'nav', id, action: msg.action });
    } else if (msg.t === 'react' && typeof msg.emoji === 'string') {
      // Cheer from the couch: a small emoji burst on the TV.
      const emoji = [...msg.emoji][0];
      if (/\p{Extended_Pictographic}/u.test(emoji || '')) this.toTv(room, { t: 'react', id, emoji, name: phone.name });
    }
  }

  fromTv(room, msg) {
    if (msg.t === 'screen') {
      room.screen = text(msg.screen, 16);
      room.gameId = msg.gameId ? text(msg.gameId, 16) : null;
      this.toPhones(room, { t: 'screen', screen: room.screen, gameId: room.gameId, title: text(msg.title, 40), genre: text(msg.genre, 12) });
    } else if (msg.t === 'reaction') {
      this.toPhones(room, { t: 'reaction', text: text(msg.text, 60) });
    }
  }
}
