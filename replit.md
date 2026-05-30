# sportslivetoday-scraper

Standalone Node.js + TypeScript scraper for sportslivetoday.com / sportslivenow.top. Exposes live football, basketball and cricket match data, HLS m3u8 stream URLs, a self-refreshing per-match playlist, a built-in stream proxy, and Swagger UI docs.

## Stack
- Node.js 20
- TypeScript (ts-node for dev, tsc for build)
- Express + axios + cors
- swagger-ui-express + a hand-written OpenAPI 3 spec

## Layout
- `src/server.ts` — Express server, all routes, swagger UI mount, landing page
- `src/scraper.ts` — AISports backend client (aggregate-v1 + match-list-v5 + match-detail + match-board-league), match normalization, multi-sport support, status mapping, cricket score parsing, in-memory caches
- `src/stream-proxy.ts` — `/api/stream/proxy` HLS proxy router + self-refreshing `/api/stream/live/:id/playlist.m3u8`
- `src/openapi.ts` — OpenAPI 3 spec served at `/openapi.json`
- `cloudflare/` — separate Cloudflare Workers deployment variant (not used in Replit)

## Replit setup
- Single workflow `Start application` runs `npm run dev`
- Server binds to `0.0.0.0:5000`
- `PORT` and `HOST` env vars override defaults

## Key endpoints
- `GET /` — branded landing page
- `GET /docs` — Swagger UI
- `GET /openapi.json` — OpenAPI spec
- `GET /api/matches[?sport=&status=&league=&withStream=]`
- `GET /api/matches/live`
- `GET /api/matches/streaming`
- `GET /api/matches/:id`
- `GET /api/leagues`
- `GET /api/stream/live/:id/playlist.m3u8` — self-refreshing HLS, never expires
- `GET /api/stream/live/:id` — JSON variant
- `GET /api/stream/proxy?url=...` — raw header-injecting proxy
- Legacy: `/api/sportslivetoday`, `/api/sportslivetoday/live`, `/api/sportslivetoday/streams`

## Why the self-refreshing playlist matters
Upstream `playPath` URLs include `sign=` + `t=` tokens that expire in a few minutes. The `/api/stream/live/:id/playlist.m3u8` route fetches a fresh playPath from `/wefeed-h5api-bff/live/match-detail` on every request, so embedding it in a `<video>` tag works indefinitely.

## Deployment
Configured as a Reserved VM (long-running Node server). Build: `npm install --include=dev && npm run build`. Run: `npm start`.
