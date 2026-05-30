# sportslivetoday-scraper

Standalone Node.js + TypeScript scraper for **sportslivetoday.com** / **sportslivenow.top** that exposes:

- Live **football, basketball and cricket** match data (teams, scores, league, status, logos, cricket runs/wickets/overs)
- Real HLS `.m3u8` stream URLs
- A built-in **stream proxy** that injects the required `Referer` / `Origin` / `User-Agent` headers so streams play in any HLS player or `<video>` tag without browser CORS / 403 issues
- A **self-refreshing playlist URL** per match — drop it into a `<video>` tag and forget about expiring sign tokens
- **Swagger UI** at `/docs` and an OpenAPI 3 spec at `/openapi.json`

It hits the AISports backend API powering both sites:
- `https://h5-api.aoneroom.com/wefeed-h5api-bff/sport/aggregate-v1`
- `https://h5-api.aoneroom.com/wefeed-h5api-bff/live/match-list-v5`
- `https://h5-api.aoneroom.com/wefeed-h5api-bff/live/match-detail`
- `https://h5-api.aoneroom.com/wefeed-h5api-bff/live/match-board-league`

…much faster and more reliable than scraping HTML.

## Install & run

```bash
npm install
npm run dev          # ts-node, hot dev
# or
npm run build && npm start
```

Server defaults to `http://localhost:5000` (override with `PORT`).

Open [`http://localhost:5000/docs`](http://localhost:5000/docs) for the full Swagger UI.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Liveness check |
| `GET` | `/api/matches` | All matches (football + basketball + cricket). Filters: `?sport=`, `?status=`, `?league=`, `?withStream=true` |
| `GET` | `/api/matches/live` | Currently live + halftime matches only |
| `GET` | `/api/matches/streaming` | Matches with an active HLS stream URL |
| `GET` | `/api/matches/:id` | Single match with a freshly fetched stream URL |
| `GET` | `/api/leagues` | League / competition catalog |
| `GET` | `/api/stream/live/:id/playlist.m3u8` | **Self-refreshing HLS playlist** — never expires |
| `GET` | `/api/stream/live/:id` | JSON: fresh upstream + proxy URLs for a match |
| `GET` | `/api/stream/proxy?url=...` | Raw HLS proxy with header injection |
| `GET` | `/docs` | Swagger UI |
| `GET` | `/openapi.json` | OpenAPI 3 spec |
| `GET` | `/api/sportslivetoday[/live\|/streams]` | (Legacy v1) football-only endpoints, kept for compatibility |

## Match shape

```jsonc
{
  "id": "4505244821573064144",
  "sport": "football",
  "homeTeam": "Atletico Madrid",
  "awayTeam": "Arsenal",
  "homeTeamAbbr": "ATM",
  "awayTeamAbbr": "ARS",
  "homeScore": 0,
  "awayScore": 1,
  "minute": "67'",
  "status": "live",                // live | halftime | finished | upcoming | postponed
  "rawStatus": "MatchIng",
  "league": "Champions League",
  "leagueId": "1391412307422509408",
  "matchRound": "Champions League",
  "startTime": "2026-04-29T19:00:00.000Z",
  "endTime": null,
  "source": "sportslivetoday",
  "detailUrl": "https://sportslivenow.top/live/detail?id=4505244821573064144&sportType=football",
  "streamUrl": "https://live-pull.aisports.mobi/.../playlist.m3u8?sign=...&t=...",
  "proxyStreamUrl": "https://your-host/api/stream/proxy?url=https%3A%2F%2F...",
  "freshStreamUrl": "https://your-host/api/stream/live/4505244821573064144",
  "freshPlaylistUrl": "https://your-host/api/stream/live/4505244821573064144/playlist.m3u8",
  "alternateStreams": [
    { "title": "Channel 1", "url": "http://play.sportsteam368.com/play/wlive.php?id=..." }
  ],
  "homeTeamLogo": "https://...",
  "awayTeamLogo": "https://..."
}
```

For cricket matches you also get `homeCricket` / `awayCricket`:

```jsonc
{
  "homeCricket": { "runs": 243, "wickets": 5, "overs": "20.0" },
  "awayCricket": { "runs": 249, "wickets": null, "overs": "18.4" },
  "matchResult": "Sunrisers Hyderabad win by 6 wickets"
}
```

## Why the proxy?

The raw `streamUrl` returns **HTTP 403** unless the request includes:

- `Referer: https://sportslivenow.top/`
- `Origin: https://sportslivenow.top`
- A desktop Chrome `User-Agent`

Browsers cannot set `Referer` / `Origin` for cross-origin media requests, so the stream cannot play directly in a `<video>` tag or hls.js client.

The `/api/stream/proxy` endpoint solves this:

1. Adds the headers when fetching upstream
2. Rewrites every `.ts` segment URL inside the playlist so segments also flow through the proxy
3. Adds `Access-Control-Allow-Origin: *` so it plays in any browser

## Why the self-refreshing playlist?

Stream URLs include time-bound `sign=` and `t=` tokens that **expire after a few minutes**. The standard `proxyStreamUrl` will go dead once the token expires.

`/api/stream/live/:id/playlist.m3u8` solves this: it transparently re-fetches a fresh `playPath` from the upstream API on **every request**, so your `<video>` tag never sees an expired token.

```html
<video controls autoplay
       src="https://your-host/api/stream/live/4505244821573064144/playlist.m3u8">
</video>
```

Or with hls.js:

```js
const hls = new Hls();
hls.loadSource('https://your-host/api/stream/live/4505244821573064144/playlist.m3u8');
hls.attachMedia(videoEl);
```

## Notes

- 20s in-memory cache on the matches list, 10s on per-match detail (so token refreshes are cheap).
- Only `live-pull.aisports.mobi` and `live-push.aisports.mobi` hosts are allowed through the proxy (allowlist enforced).
- All API responses are CORS-enabled (`*`).

## License

MIT
