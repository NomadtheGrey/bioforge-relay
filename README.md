# BioForge room relay

Cloudflare Worker + Durable Object that relays multiplayer messages
between players in the same room. Deployed as the bioforge-relay
worker via Cloudflare Workers Builds (deployed by Cloudflare Workers Builds,
deploy command: npx wrangler deploy).

- worker.js — the relay. One Durable Object instance per room code;
  forwards each WebSocket message to everyone else in the room.
- wrangler.toml — worker config. The Durable Object binding (ROOMS)
  and migration live here; the Cloudflare dashboard cannot create them,
  which is why this repo is deployed from Git.

Status: relay deployed via Cloudflare Workers Builds; game client wiring is the next step once the build is green.
