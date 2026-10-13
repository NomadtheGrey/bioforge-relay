// BioForge room relay — runs on Cloudflare as a Worker + Durable Object.
// One Durable Object instance per room code. It receives the game's
// multiplayer messages over WebSocket and forwards each one to everyone
// else in the room. No game logic lives here — the game stays in charge.

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

  async webSocketClose(ws) {
    // The hibernation API tracks sockets for us; nothing to clean up.
  }

  async webSocketError(ws, error) {
    // Errors surface as a close right after; nothing to do.
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
