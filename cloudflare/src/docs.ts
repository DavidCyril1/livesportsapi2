export function renderDocs(origin: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Live Football, Basketball & Cricket API · sportslivetoday-scraper</title>
<style>
  :root {
    --bg: #0b0d10;
    --panel: #14181d;
    --panel-2: #1a2027;
    --border: #2a323d;
    --text: #e6edf3;
    --muted: #8b949e;
    --accent: #2ea043;
    --accent-2: #58a6ff;
    --warn: #d29922;
    --code-bg: #0d1117;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  .container { max-width: 920px; margin: 0 auto; padding: 48px 24px 96px; }
  header { border-bottom: 1px solid var(--border); padding-bottom: 28px; margin-bottom: 36px; }
  .badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(46,160,67,0.15); color: var(--accent);
    border: 1px solid rgba(46,160,67,0.4);
    padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 500;
  }
  .badge::before {
    content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--accent);
    box-shadow: 0 0 8px var(--accent);
  }
  h1 { font-size: 32px; margin: 16px 0 8px; letter-spacing: -0.02em; }
  h2 { font-size: 20px; margin: 40px 0 16px; letter-spacing: -0.01em; }
  h3 { font-size: 15px; margin: 24px 0 8px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
  p, li { color: var(--text); }
  .lead { color: var(--muted); font-size: 16px; max-width: 640px; }
  a { color: var(--accent-2); text-decoration: none; }
  a:hover { text-decoration: underline; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    background: var(--code-bg);
    border: 1px solid var(--border);
    padding: 1px 6px; border-radius: 4px;
    font-size: 13px;
    color: #e6edf3;
  }
  pre {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    overflow-x: auto;
    font-size: 13px;
    line-height: 1.55;
  }
  pre code { background: transparent; border: 0; padding: 0; font-size: inherit; }
  .endpoint {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 20px;
    margin-bottom: 14px;
    transition: border-color 0.15s;
  }
  .endpoint:hover { border-color: #3a4452; }
  .endpoint-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .method {
    background: rgba(88,166,255,0.15); color: var(--accent-2);
    border: 1px solid rgba(88,166,255,0.4);
    font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px;
    letter-spacing: 0.05em;
  }
  .path {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 14px; color: var(--text);
  }
  .endpoint p { margin: 8px 0 0; color: var(--muted); font-size: 14px; }
  .endpoint .try {
    display: inline-block; margin-top: 10px;
    font-size: 12px; color: var(--accent-2);
  }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 14px; }
  @media (max-width: 640px) { .grid-2 { grid-template-columns: 1fr; } }
  .stat {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
  }
  .stat .label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .stat .value { font-size: 18px; font-weight: 600; margin-top: 4px; font-family: ui-monospace, monospace; }
  .callout {
    background: rgba(210,153,34,0.1);
    border-left: 3px solid var(--warn);
    padding: 12px 16px;
    border-radius: 4px;
    margin: 16px 0;
    font-size: 14px;
    color: var(--text);
  }
  .callout strong { color: var(--warn); }
  footer {
    margin-top: 64px; padding-top: 24px;
    border-top: 1px solid var(--border);
    color: var(--muted); font-size: 13px;
    display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px;
  }
</style>
</head>
<body>
<div class="container">
  <header>
    <span class="badge">Live</span>
    <h1>Live Football, Basketball &amp; Cricket API</h1>
    <p class="lead">
      Real-time match data scraped from sportslivetoday.com / sportslivenow.top
      across football, basketball and cricket — with HLS <code>.m3u8</code> stream
      URLs and a built-in proxy that injects the headers browsers can't set
      themselves.
    </p>
  </header>

  <h2>Football</h2>

  <div class="endpoint">
    <div class="endpoint-head">
      <span class="method">GET</span>
      <span class="path">/api/sportslivetoday</span>
    </div>
    <p>All football matches — live, upcoming, and recently finished.</p>
    <a class="try" href="/api/sportslivetoday" target="_blank">Try it →</a>
  </div>

  <div class="endpoint">
    <div class="endpoint-head">
      <span class="method">GET</span>
      <span class="path">/api/sportslivetoday/live</span>
    </div>
    <p>Currently live + halftime football matches only.</p>
    <a class="try" href="/api/sportslivetoday/live" target="_blank">Try it →</a>
  </div>

  <div class="endpoint">
    <div class="endpoint-head">
      <span class="method">GET</span>
      <span class="path">/api/sportslivetoday/streams</span>
    </div>
    <p>Football matches with an active HLS stream URL right now.</p>
    <a class="try" href="/api/sportslivetoday/streams" target="_blank">Try it →</a>
  </div>

  <h2>Basketball</h2>

  <div class="endpoint">
    <div class="endpoint-head">
      <span class="method">GET</span>
      <span class="path">/api/basketball</span>
    </div>
    <p>All basketball games (NBA, EuroLeague, NCAA and more).</p>
    <a class="try" href="/api/basketball" target="_blank">Try it →</a>
  </div>

  <div class="endpoint">
    <div class="endpoint-head">
      <span class="method">GET</span>
      <span class="path">/api/basketball/live</span>
    </div>
    <p>Currently live basketball games.</p>
    <a class="try" href="/api/basketball/live" target="_blank">Try it →</a>
  </div>

  <div class="endpoint">
    <div class="endpoint-head">
      <span class="method">GET</span>
      <span class="path">/api/basketball/streams</span>
    </div>
    <p>Basketball games with an active HLS stream URL.</p>
    <a class="try" href="/api/basketball/streams" target="_blank">Try it →</a>
  </div>

  <h2>Cricket</h2>

  <div class="endpoint">
    <div class="endpoint-head">
      <span class="method">GET</span>
      <span class="path">/api/cricket</span>
    </div>
    <p>
      All cricket matches. Includes <code>homeCricket</code> /
      <code>awayCricket</code> objects with <code>runs</code> /
      <code>wickets</code> / <code>overs</code> for each innings.
    </p>
    <a class="try" href="/api/cricket" target="_blank">Try it →</a>
  </div>

  <div class="endpoint">
    <div class="endpoint-head">
      <span class="method">GET</span>
      <span class="path">/api/cricket/live</span>
    </div>
    <p>Currently in-progress cricket matches.</p>
    <a class="try" href="/api/cricket/live" target="_blank">Try it →</a>
  </div>

  <div class="endpoint">
    <div class="endpoint-head">
      <span class="method">GET</span>
      <span class="path">/api/cricket/streams</span>
    </div>
    <p>Cricket matches with an active HLS stream URL.</p>
    <a class="try" href="/api/cricket/streams" target="_blank">Try it →</a>
  </div>

  <h2>Stream proxy</h2>

  <div class="endpoint">
    <div class="endpoint-head">
      <span class="method">GET</span>
      <span class="path">/api/stream/proxy?url=&lt;m3u8 url&gt;</span>
    </div>
    <p>
      Proxies the HLS playlist (or <code>.ts</code> segment) with the required
      <code>Referer</code> / <code>Origin</code> / <code>User-Agent</code> headers.
      Segment URLs inside the playlist are rewritten so they also flow through this
      proxy. Plays in any browser, VLC, or hls.js client without extra setup.
    </p>
  </div>

  <h2>Match shape</h2>
  <pre><code>{
  "id": "aisports-12345",
  "homeTeam": "Brighton",
  "awayTeam": "Chelsea",
  "homeScore": 1,
  "awayScore": 2,
  "minute": "67'",
  "status": "live",
  "league": "Premier League",
  "startTime": "2026-04-20T14:00:00.000Z",
  "source": "sportslivetoday",
  "streamUrl": "https://live-pull.aisports.mobi/.../playlist.m3u8?sign=...&t=...",
  "proxyStreamUrl": "/api/stream/proxy?url=...",
  "homeTeamLogo": "https://...",
  "awayTeamLogo": "https://..."
}</code></pre>

  <h3>Status values</h3>
  <div class="grid-2">
    <div class="stat"><div class="label">live</div><div class="value">in play</div></div>
    <div class="stat"><div class="label">halftime</div><div class="value">15-min break</div></div>
    <div class="stat"><div class="label">finished</div><div class="value">full time</div></div>
    <div class="stat"><div class="label">upcoming</div><div class="value">not started</div></div>
  </div>

  <h2>Quick start</h2>
  <p>Open a live stream in VLC or any HLS player:</p>
  <pre><code>curl -s ${origin}/api/sportslivetoday/streams \\
  | jq -r '.matches[0] | "\\(.homeTeam) vs \\(.awayTeam)\\n${origin}\\(.proxyStreamUrl)"'</code></pre>

  <p>Or play it in a browser with hls.js:</p>
  <pre><code>&lt;video id="v" controls autoplay&gt;&lt;/video&gt;
&lt;script src="https://cdn.jsdelivr.net/npm/hls.js@latest"&gt;&lt;/script&gt;
&lt;script&gt;
  const r = await fetch("${origin}/api/sportslivetoday/streams").then(r =&gt; r.json());
  const m = r.matches[0];
  const hls = new Hls();
  hls.loadSource("${origin}" + m.proxyStreamUrl);
  hls.attachMedia(document.getElementById("v"));
&lt;/script&gt;</code></pre>

  <div class="callout">
    <strong>Heads up:</strong> stream URLs include time-bound <code>sign=</code> and
    <code>t=</code> tokens that expire after a few minutes. Always re-fetch from the
    API for fresh links — don't cache <code>streamUrl</code> on your client.
  </div>

  <h2>About</h2>
  <p>
    This Worker calls the AISports backend that powers sportslivetoday.com,
    normalises the response, and proxies the resulting HLS streams so they play
    anywhere. Runs on Cloudflare's edge in 300+ cities — no servers, no cold starts.
  </p>

  <footer>
    <span>sportslivetoday-scraper · running on Cloudflare Workers</span>
    <a href="https://github.com/DavidCyril1/sportslivetoday-scraper" target="_blank">View source on GitHub →</a>
  </footer>
</div>
</body>
</html>`;
}
