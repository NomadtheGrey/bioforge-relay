// BioForge room relay — runs on Cloudflare as a Worker + Durable Object.
// One Durable Object instance per room code. It receives the game's
// multiplayer messages over WebSocket and forwards each one to everyone
// else in the room. It also watches for dropped connections: if a player
// vanishes without a goodbye (reload, crash, lost signal), the relay
// announces their departure itself so no ghost player lingers in the room.
// No other game logic lives here — the game stays in charge.

export class BioForgeRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
  }

  async fetch(request) {
    const upgrade = request.headers.get('Upgrade');
    if (upgrade !== 'websocket') {
      return new Response('Expected a WebSocket connection.', { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    this.trackPresence(ws, message);

    // Forward to everyone else in the room. The sender already applied
    // the message locally, so it never gets its own message back.
    for (const peer of this.ctx.getWebSockets()) {
      if (peer === ws) continue;
      try {
        peer.send(message);
      } catch (e) {
        // Socket is closing — nothing to do.
      }
    }
  }

  // Remember who each connection belongs to, from its join announcement.
  // Stored as a socket attachment so it survives hibernation.
  trackPresence(ws, message) {
    if (typeof message !== 'string') return;
    let msg;
    try {
      msg = JSON.parse(message);
    } catch (e) {
      return;
    }
    if (msg.type === 'peer_join' && msg.senderId) {
      if (ws.deserializeAttachment()) return;
      ws.serializeAttachment({
        senderId: msg.senderId,
        senderName: msg.senderName || 'Explorer',
        roomCode: msg.roomCode || '',
        departed: false,
      });
      return;
    }
    if (msg.type === 'peer_leave') {
      // The player said goodbye properly — no need to announce it again
      // when their socket closes a moment later.
      const identity = ws.deserializeAttachment();
      if (!identity) return;
      identity.departed = true;
      ws.serializeAttachment(identity);
    }
  }

  announceDeparture(ws) {
    const identity = ws.deserializeAttachment();
    if (!identity || !identity.senderId || identity.departed) return;
    identity.departed = true;
    ws.serializeAttachment(identity);

    const leave = JSON.stringify({
      type: 'peer_leave',
      id: 'relay_' + Math.random().toString(36).substring(2, 10),
      senderId: identity.senderId,
      senderName: identity.senderName,
      senderColor: '#38bdf8',
      roomCode: identity.roomCode,
      payload: { peerId: identity.senderId },
      timestamp: Date.now(),
    });
    for (const peer of this.ctx.getWebSockets()) {
      if (peer === ws) continue;
      try {
        peer.send(leave);
      } catch (e) {
        // Socket is closing — nothing to do.
      }
    }
  }

  async webSocketClose(ws) {
    this.announceDeparture(ws);
  }

  async webSocketError(ws, error) {
    this.announceDeparture(ws);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts[0] === 'room' && parts[1]) {
      const roomCode = parts[1].toUpperCase();
      const id = env.ROOMS.idFromName(roomCode);
      const stub = env.ROOMS.get(id);
      return stub.fetch(request);
    }

    if (url.pathname === '/') {
      return new Response('BioForge room relay is running.', { status: 200 });
    }

    return new Response('Not found. Connect a WebSocket to /room/<CODE>.', { status: 404 });
  },
};
