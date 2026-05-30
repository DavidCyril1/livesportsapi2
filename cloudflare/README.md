# sportslivetoday-scraper — Cloudflare Workers

This is the **Cloudflare Workers** port of the scraper + HLS stream proxy.
Runs at the edge in 300+ cities, no servers to manage.

## Deploy in 3 commands

```bash
cd cloudflare
npm install
npx wrangler deploy
```

The first time, `wrangler` will open a browser to log in to your Cloudflare account.

After deploy you'll get a URL like `https://sportslivetoday-scraper.<your-subdomain>.workers.dev`.

## Local dev

```bash
npm run dev
# → http://localhost:8787
```

## Endpoints

Identical to the Node version:

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Liveness check + endpoint list |
| `GET` | `/api/sportslivetoday` | All football matches |
| `GET` | `/api/sportslivetoday/live` | Live + halftime only |
| `GET` | `/api/sportslivetoday/streams` | Only matches with active HLS streams |
| `GET` | `/api/stream/proxy?url=<m3u8 or .ts url>` | Header-injecting proxy |

`proxyStreamUrl` returned by the API is a relative path that resolves against the Worker's hostname, so it Just Works once deployed.

## Notes

- **No Node runtime needed** — pure Web APIs (`fetch`, `Request`, `Response`, `ReadableStream`).
- Segment streaming uses `new Response(upstream.body)` — true passthrough, no buffering, no CPU burn.
- Cloudflare's edge cache is used for short TTLs on the upstream API and `.ts` segments.
- Allowlisted upstream hosts: `live-pull.aisports.mobi`, `live-push.aisports.mobi`.

## Limits to be aware of

- **Free plan:** 100k requests/day, 10ms CPU/request, 50 subrequests/request — fine for personal use.
- **Paid plan ($5/mo):** 10M requests included, 30s CPU/request, 1000 subrequests/request.

Each client request makes exactly **one** upstream subrequest, so you're nowhere near the limits.
