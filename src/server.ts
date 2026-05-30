import express, { type Request, type Response } from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import {
  getAllMatches,
  getMatchDetail,
  getLeagues,
  type LiveMatch,
  type SportType,
} from "./scraper";
import streamProxyRouter from "./stream-proxy";
import { buildOpenApiSpec } from "./openapi";

const app = express();
app.use(cors());
app.use(express.json());

const SOURCE_LABEL = "sportslivetoday.com / sportslivenow.top (AISports backend)";
const LEGACY_SOURCE = "sportslivetoday.com (AISports API)";

function publicBase(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  return `${proto}://${req.get("host")}`;
}

function decorate(req: Request, m: LiveMatch): LiveMatch {
  const base = publicBase(req);
  const proxyStreamUrl = m.streamUrl
    ? `${base}/api/stream/proxy?url=${encodeURIComponent(m.streamUrl)}`
    : undefined;
  return {
    ...m,
    proxyStreamUrl,
    freshStreamUrl: `${base}/api/stream/live/${m.id}`,
    freshPlaylistUrl: `${base}/api/stream/live/${m.id}/playlist.m3u8`,
  };
}

function applyFilters(
  matches: LiveMatch[],
  opts: { sport?: string; status?: string; league?: string; withStream?: boolean },
): LiveMatch[] {
  return matches.filter((m) => {
    if (opts.sport && opts.sport !== "all" && m.sport !== opts.sport) return false;
    if (opts.status && opts.status !== "all" && m.status !== opts.status) return false;
    if (
      opts.league &&
      !m.league.toLowerCase().includes(opts.league.toLowerCase())
    )
      return false;
    if (opts.withStream && !m.streamUrl) return false;
    return true;
  });
}

function parseSport(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.toLowerCase() : "";
  if (["all", "football", "basketball", "cricket"].includes(s)) return s;
  return undefined;
}

function parseStatus(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.toLowerCase() : "";
  if (
    ["all", "live", "halftime", "upcoming", "finished", "postponed"].includes(s)
  )
    return s;
  return undefined;
}

// ---------- Health ----------
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "sportslivetoday-scraper" });
});

// ---------- New v2 matches endpoints ----------
app.get("/api/matches", async (req, res) => {
  try {
    const all = await getAllMatches();
    const filters = {
      sport: parseSport(req.query.sport) ?? "all",
      status: parseStatus(req.query.status) ?? "all",
      league: typeof req.query.league === "string" ? req.query.league : undefined,
      withStream: String(req.query.withStream ?? "") === "true",
    };
    const filtered = applyFilters(all, filters).map((m) => decorate(req, m));
    res.json({
      count: filtered.length,
      updatedAt: new Date().toISOString(),
      source: SOURCE_LABEL,
      filters,
      matches: filtered,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch matches" });
  }
});

app.get("/api/matches/live", async (req, res) => {
  try {
    const all = await getAllMatches();
    const sport = parseSport(req.query.sport) ?? "all";
    const live = applyFilters(all, { sport })
      .filter((m) => m.status === "live" || m.status === "halftime")
      .map((m) => decorate(req, m));
    res.json({
      count: live.length,
      updatedAt: new Date().toISOString(),
      source: SOURCE_LABEL,
      filters: { sport },
      matches: live,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch live matches" });
  }
});

app.get("/api/matches/streaming", async (req, res) => {
  try {
    const all = await getAllMatches();
    const sport = parseSport(req.query.sport) ?? "all";
    const streaming = applyFilters(all, { sport, withStream: true }).map((m) =>
      decorate(req, m),
    );
    res.json({
      count: streaming.length,
      updatedAt: new Date().toISOString(),
      source: SOURCE_LABEL,
      filters: { sport, withStream: true },
      matches: streaming,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch streaming matches" });
  }
});

app.get("/api/matches/:id", async (req, res) => {
  try {
    const id = req.params.id.replace(/^aisports-/, "");
    const detail = await getMatchDetail(id);
    if (!detail) {
      res.status(404).json({ error: "Match not found", id: req.params.id });
      return;
    }
    res.json({
      updatedAt: new Date().toISOString(),
      source: SOURCE_LABEL,
      match: decorate(req, detail),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch match detail" });
  }
});

app.get("/api/leagues", async (_req, res) => {
  try {
    const leagues = await getLeagues();
    res.json({ count: leagues.length, leagues });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch leagues" });
  }
});

// ---------- Legacy v1 endpoints (frozen shape — DO NOT change keys) ----------
// These match the original v1 contract exactly so existing clients keep working:
//   - id is prefixed with "aisports-"
//   - proxyStreamUrl is a RELATIVE path (not absolute)
//   - only the original 13 fields are present
function toLegacyShape(m: LiveMatch) {
  const proxyStreamUrl = m.streamUrl
    ? `/api/stream/proxy?url=${encodeURIComponent(m.streamUrl)}`
    : undefined;
  return {
    id: `aisports-${m.id}`,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    minute: m.minute,
    status: m.status,
    league: m.league,
    startTime: m.startTime,
    source: m.source,
    streamUrl: m.streamUrl,
    proxyStreamUrl,
    homeTeamLogo: m.homeTeamLogo,
    awayTeamLogo: m.awayTeamLogo,
  };
}

function toCricketShape(m: LiveMatch) {
  return {
    ...toLegacyShape(m),
    homeCricket: m.homeCricket,
    awayCricket: m.awayCricket,
    matchResult: m.matchResult,
  };
}

function buildSportEndpoints(
  sport: SportType,
  shaper: (m: LiveMatch) => unknown,
  noteAll: string,
  noteStreams: string,
) {
  const handler = (
    filterFn: (m: LiveMatch) => boolean,
    note?: string,
  ) =>
    async (_req: Request, res: Response) => {
      try {
        const all = await getAllMatches();
        const matches = all
          .filter((m) => m.sport === sport)
          .filter(filterFn)
          .map(shaper);
        const body: Record<string, unknown> = {
          count: matches.length,
          updatedAt: new Date().toISOString(),
          source: LEGACY_SOURCE,
          sport,
          matches,
        };
        if (note) body.note = note;
        res.json(body);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: `Failed to fetch ${sport} matches` });
      }
    };

  return {
    all: handler(() => true, noteAll),
    live: handler((m) => m.status === "live" || m.status === "halftime"),
    streams: handler((m) => !!m.streamUrl, noteStreams),
  };
}

app.get("/api/sportslivetoday", async (_req, res) => {
  try {
    const all = await getAllMatches();
    const matches = all
      .filter((m) => m.sport === "football")
      .map(toLegacyShape);
    res.json({
      count: matches.length,
      updatedAt: new Date().toISOString(),
      source: LEGACY_SOURCE,
      note: "Live football matches scraped from sportslivetoday.com. Matches with streamUrl contain real HLS m3u8 links. Use proxyStreamUrl to play streams without setting headers manually.",
      matches,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch matches" });
  }
});

app.get("/api/sportslivetoday/live", async (_req, res) => {
  try {
    const all = await getAllMatches();
    const matches = all
      .filter(
        (m) =>
          m.sport === "football" &&
          (m.status === "live" || m.status === "halftime"),
      )
      .map(toLegacyShape);
    res.json({
      count: matches.length,
      updatedAt: new Date().toISOString(),
      source: LEGACY_SOURCE,
      matches,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch live matches" });
  }
});

app.get("/api/sportslivetoday/streams", async (_req, res) => {
  try {
    const all = await getAllMatches();
    const matches = all
      .filter((m) => m.sport === "football" && !!m.streamUrl)
      .map(toLegacyShape);
    res.json({
      count: matches.length,
      updatedAt: new Date().toISOString(),
      source: LEGACY_SOURCE,
      note: "Football matches with active HLS m3u8 stream URLs. Use proxyStreamUrl for header-free playback.",
      matches,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch streams" });
  }
});

// ---------- Basketball endpoints ----------
const basketball = buildSportEndpoints(
  "basketball",
  toLegacyShape,
  "Live basketball matches scraped from sportslivetoday.com. Matches with streamUrl contain real HLS m3u8 links. Use proxyStreamUrl to play streams without setting headers manually.",
  "Basketball matches with active HLS m3u8 stream URLs. Use proxyStreamUrl for header-free playback.",
);
app.get("/api/basketball", basketball.all);
app.get("/api/basketball/live", basketball.live);
app.get("/api/basketball/streams", basketball.streams);

// ---------- Cricket endpoints ----------
// Cricket uses an extended shape that includes runs/wickets/overs because
// numeric scores alone don't represent a cricket match correctly.
const cricket = buildSportEndpoints(
  "cricket",
  toCricketShape,
  "Live cricket matches scraped from sportslivetoday.com. Includes innings detail (runs/wickets/overs). Matches with streamUrl contain real HLS m3u8 links.",
  "Cricket matches with active HLS m3u8 stream URLs. Use proxyStreamUrl for header-free playback.",
);
app.get("/api/cricket", cricket.all);
app.get("/api/cricket/live", cricket.live);
app.get("/api/cricket/streams", cricket.streams);

// ---------- Stream proxy router ----------
app.use("/api", streamProxyRouter);

// ---------- OpenAPI + Swagger UI ----------
app.get("/openapi.json", (req, res) => {
  res.json(buildOpenApiSpec(publicBase(req)));
});

const swaggerHtmlMiddleware = swaggerUi.serve;
app.use("/docs", swaggerHtmlMiddleware as unknown as express.RequestHandler[]);
app.get(
  "/docs",
  swaggerUi.setup(undefined, {
    swaggerUrl: "/openapi.json",
    customSiteTitle: "sportslivetoday-scraper API docs",
    customCss: ".topbar { display: none } .swagger-ui .info { margin: 24px 0 }",
  }),
);

// ---------- Landing page ----------
app.get("/", (req, res) => {
  const base = publicBase(req);
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>sportslivetoday-scraper</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
    background: radial-gradient(circle at 20% -10%, #1f2a44 0%, #0b0f1a 60%);
    color: #e6e9ef; min-height: 100vh; padding: 48px 24px;
  }
  .wrap { max-width: 880px; margin: 0 auto; }
  h1 { font-size: 32px; margin: 0 0 4px; letter-spacing: -.5px; }
  .sub { color: #8da0c4; margin-bottom: 28px; font-size: 15px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
  a.card {
    display: block; padding: 18px 20px; background: #131a2c; border: 1px solid #233055;
    border-radius: 12px; text-decoration: none; color: inherit; transition: .15s;
  }
  a.card:hover { border-color: #4a6cff; transform: translateY(-1px); background: #18213a; }
  .card .meth { font-size: 11px; font-weight: 700; color: #4a6cff; letter-spacing: 1px; }
  .card .path { font-family: ui-monospace, SF Mono, Menlo, monospace; font-size: 14px; margin: 4px 0 6px; word-break: break-all; }
  .card .desc { color: #8da0c4; font-size: 13px; }
  .docs-btn {
    display: inline-block; margin: 4px 0 28px; padding: 12px 22px; background: #4a6cff;
    color: white; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;
  }
  .docs-btn:hover { background: #3a5be0; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 1.5px; color: #8da0c4; margin: 32px 0 12px; font-weight: 600; }
  code.inline { background: #1f2a44; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>sportslivetoday-scraper</h1>
  <div class="sub">
    Live football, basketball &amp; cricket matches with real HLS streams &mdash; scraped from
    <strong>sportslivetoday.com / sportslivenow.top</strong>.
  </div>
  <a class="docs-btn" href="/docs">Open Swagger UI &rarr;</a>

  <h2>Matches</h2>
  <div class="grid">
    <a class="card" href="/api/matches">
      <div class="meth">GET</div>
      <div class="path">/api/matches</div>
      <div class="desc">All matches across all sports. Filter by <code class="inline">?sport=</code>, <code class="inline">?status=</code>, <code class="inline">?league=</code>, <code class="inline">?withStream=true</code>.</div>
    </a>
    <a class="card" href="/api/matches/live">
      <div class="meth">GET</div>
      <div class="path">/api/matches/live</div>
      <div class="desc">Currently live + halftime matches only.</div>
    </a>
    <a class="card" href="/api/matches/streaming">
      <div class="meth">GET</div>
      <div class="path">/api/matches/streaming</div>
      <div class="desc">Matches with an active HLS stream URL.</div>
    </a>
    <a class="card" href="/api/matches/4505244821573064144">
      <div class="meth">GET</div>
      <div class="path">/api/matches/{id}</div>
      <div class="desc">Single match with a freshly fetched stream URL.</div>
    </a>
  </div>

  <h2>Basketball</h2>
  <div class="grid">
    <a class="card" href="/api/basketball">
      <div class="meth">GET</div>
      <div class="path">/api/basketball</div>
      <div class="desc">All basketball matches in the legacy-style shape.</div>
    </a>
    <a class="card" href="/api/basketball/live">
      <div class="meth">GET</div>
      <div class="path">/api/basketball/live</div>
      <div class="desc">Currently live basketball games.</div>
    </a>
    <a class="card" href="/api/basketball/streams">
      <div class="meth">GET</div>
      <div class="path">/api/basketball/streams</div>
      <div class="desc">Basketball games with an active HLS stream.</div>
    </a>
  </div>

  <h2>Cricket</h2>
  <div class="grid">
    <a class="card" href="/api/cricket">
      <div class="meth">GET</div>
      <div class="path">/api/cricket</div>
      <div class="desc">All cricket matches with innings detail (runs / wickets / overs).</div>
    </a>
    <a class="card" href="/api/cricket/live">
      <div class="meth">GET</div>
      <div class="path">/api/cricket/live</div>
      <div class="desc">Currently in-progress cricket matches.</div>
    </a>
    <a class="card" href="/api/cricket/streams">
      <div class="meth">GET</div>
      <div class="path">/api/cricket/streams</div>
      <div class="desc">Cricket matches with an active HLS stream.</div>
    </a>
  </div>

  <h2>Streams</h2>
  <div class="grid">
    <a class="card" href="/docs#/Streams/get_api_stream_live__id__playlist_m3u8">
      <div class="meth">GET</div>
      <div class="path">/api/stream/live/{id}/playlist.m3u8</div>
      <div class="desc"><strong>Recommended.</strong> Self-refreshing m3u8 &mdash; never expires, drop straight into &lt;video src&gt;.</div>
    </a>
    <a class="card" href="/docs#/Streams/get_api_stream_live__id_">
      <div class="meth">GET</div>
      <div class="path">/api/stream/live/{id}</div>
      <div class="desc">JSON: fresh upstream URL + ready-to-use proxy URLs.</div>
    </a>
    <a class="card" href="/docs#/Streams/get_api_stream_proxy">
      <div class="meth">GET</div>
      <div class="path">/api/stream/proxy?url=...</div>
      <div class="desc">Raw HLS proxy that injects the required Referer/Origin/User-Agent headers.</div>
    </a>
    <a class="card" href="/api/leagues">
      <div class="meth">GET</div>
      <div class="path">/api/leagues</div>
      <div class="desc">League / competition catalog.</div>
    </a>
  </div>

  <h2>Quick start</h2>
  <div class="card" style="cursor:default">
    <div class="desc" style="color:#cdd6e8; line-height: 1.7;">
      1. Hit <code class="inline">GET ${base}/api/matches/live</code> to find the match id.<br />
      2. Embed <code class="inline">${base}/api/stream/live/{id}/playlist.m3u8</code> in any <code class="inline">&lt;video&gt;</code> tag or hls.js player.<br />
      3. The proxy auto-refreshes the upstream sign token on every request &mdash; no expiry handling needed.
    </div>
  </div>
</div>
</body>
</html>`);
});

const PORT = Number(process.env.PORT ?? 5000);
const HOST = process.env.HOST ?? "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`sportslivetoday-scraper listening on http://${HOST}:${PORT}`);
  console.log(`  Swagger UI:    http://${HOST}:${PORT}/docs`);
  console.log(`  OpenAPI JSON:  http://${HOST}:${PORT}/openapi.json`);
});
