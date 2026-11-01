import { Router, type Request, type Response } from "express";
import axios from "axios";
import { getFreshStreamUrl } from "./scraper";
import {
  listSoccerStreams,
  findStreamFreeKey,
  resolveStreamFreeM3u8,
  fetchUpstreamText,
  fetchUpstreamBinary,
  rewritePlaylistThroughProxy,
  isAllowedStreamFreeProxyUrl,
  isValidStreamKey,
  parseQuality,
  SF_ORIGIN,
} from "./streamfree";

const router = Router();

const STREAM_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://sportslivenow.top/",
  Origin: "https://sportslivenow.top",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

const ALLOWED_HOSTS = new Set([
  "live-pull.aisports.mobi",
  "live-push.aisports.mobi",
]);

function publicBase(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  const host = req.get("host");
  return `${proto}://${host}`;
}

function buildProxyUrl(req: Request, targetUrl: string): string {
  return `${publicBase(req)}/api/stream/proxy?url=${encodeURIComponent(targetUrl)}`;
}

function rewritePlaylist(req: Request, text: string, sourceUrl: string): string {
  const baseUrl = sourceUrl.substring(0, sourceUrl.lastIndexOf("/") + 1);
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        const uriMatch = trimmed.match(/URI="([^"]+)"/);
        if (uriMatch) {
          const uri = uriMatch[1];
          const absolute = uri.startsWith("http") ? uri : baseUrl + uri;
          return line.replace(uri, buildProxyUrl(req, absolute));
        }
        return line;
      }
      const absolute = trimmed.startsWith("http") ? trimmed : baseUrl + trimmed;
      return buildProxyUrl(req, absolute);
    })
    .join("\n");
}

async function proxyTarget(req: Request, res: Response, target: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    res.status(403).json({ error: `Host not allowed: ${parsed.hostname}` });
    return;
  }

  const isPlaylist = parsed.pathname.endsWith(".m3u8");

  try {
    const upstream = await axios.get(target, {
      headers: STREAM_HEADERS,
      responseType: isPlaylist ? "text" : "stream",
      timeout: 15000,
      validateStatus: () => true,
    });

    if (upstream.status !== 200) {
      res.status(upstream.status).json({
        error: "Upstream error",
        status: upstream.status,
      });
      return;
    }

    if (isPlaylist) {
      const text = String(upstream.data);
      const rewritten = rewritePlaylist(req, text, target);
      res.set("Content-Type", "application/vnd.apple.mpegurl");
      res.set("Cache-Control", "no-cache");
      res.set("Access-Control-Allow-Origin", "*");
      res.send(rewritten);
      return;
    }

    const contentType = upstream.headers["content-type"] ?? "video/mp2t";
    res.set("Content-Type", String(contentType));
    res.set("Cache-Control", "public, max-age=10");
    res.set("Access-Control-Allow-Origin", "*");

    const stream = upstream.data as NodeJS.ReadableStream;
    stream.pipe(res);
    stream.on("error", (err) => {
      console.error("[stream-proxy] upstream error:", err);
      if (!res.headersSent) res.status(502).end();
    });
  } catch (err) {
    console.error("[stream-proxy] failed:", (err as Error).message);
    if (!res.headersSent) {
      res.status(502).json({ error: "Failed to proxy stream" });
    }
  }
}

// Generic proxy: ?url=<encoded m3u8 or .ts URL>
router.get("/stream/proxy", async (req, res) => {
  const target = String(req.query.url ?? "");
  if (!target) {
    res.status(400).json({ error: "Missing 'url' query parameter" });
    return;
  }
  await proxyTarget(req, res, target);
});

// Self-refreshing playlist URL by match id.
// Stable URL — re-fetches a fresh playPath from the upstream API every request,
// so token expiry is invisible to the player.
router.get("/stream/live/:id/playlist.m3u8", async (req, res) => {
  const id = req.params.id.replace(/^aisports-/, "");
  const fresh = await getFreshStreamUrl(id);
  if (!fresh) {
    res.status(404).json({ error: "No live stream available for this match", id });
    return;
  }
  await proxyTarget(req, res, fresh);
});

// JSON variant: returns the current proxy URL for embedding
router.get("/stream/live/:id", async (req, res) => {
  const id = req.params.id.replace(/^aisports-/, "");
  const fresh = await getFreshStreamUrl(id);
  if (!fresh) {
    res.status(404).json({ error: "No live stream available for this match", id });
    return;
  }
  res.json({
    matchId: id,
    upstreamUrl: fresh,
    proxyStreamUrl: `${publicBase(req)}/api/stream/proxy?url=${encodeURIComponent(fresh)}`,
    freshPlaylistUrl: `${publicBase(req)}/api/stream/live/${id}/playlist.m3u8`,
    note: "freshPlaylistUrl is a stable URL — it auto-refreshes the upstream sign token on every request. Use it directly in <video src> or hls.js.",
  });
});


// ── StreamFree (same shape as /stream/live/:id/playlist.m3u8) ────────────────
function streamfreePublicBase(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  return `${proto}://${req.get("host")}`;
}

function streamfreeProxyPath(req: Request): string {
  return `${streamfreePublicBase(req)}/api/streamfree/proxy`;
}

/** List live soccer keys */
router.get("/streamfree/streams", async (_req, res) => {
  try {
    const streams = await listSoccerStreams();
    const live = streams.filter((s) => (s.live_sources && s.live_sources.length) || (s.sources && s.sources.length));
    res.json({
      count: live.length,
      streams: live.map((s) => ({
        name: s.name,
        stream_key: s.stream_key,
        playlistUrl: `/api/streamfree/live/${encodeURIComponent(s.stream_key)}/playlist.m3u8`,
      })),
    });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : "list_failed" });
  }
});

/** Match home/away teams → streamfree key + playlist URL */
router.get("/streamfree/match", async (req, res) => {
  try {
    const home = String(req.query.home || "");
    const away = String(req.query.away || "");
    if (!home || !away) {
      res.status(400).json({ error: "home and away required" });
      return;
    }
    const hit = await findStreamFreeKey(home, away);
    if (!hit) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const key = hit.stream_key;
    res.json({
      stream_key: key,
      name: hit.name,
      playlistUrl: `${streamfreePublicBase(req)}/api/streamfree/live/${encodeURIComponent(key)}/playlist.m3u8`,
      jsonUrl: `${streamfreePublicBase(req)}/api/streamfree/live/${encodeURIComponent(key)}`,
    });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : "match_failed" });
  }
});

/** JSON: resolved upstream + stable panel playlist */
router.get("/streamfree/live/:key", async (req, res) => {
  try {
    const key = String(req.params.key || "").toLowerCase();
    const quality = parseQuality(req.query.quality);
    if (!isValidStreamKey(key)) {
      res.status(400).json({ error: "bad_key" });
      return;
    }
    const resolved = await resolveStreamFreeM3u8(key, quality);
    res.json({
      ok: true,
      stream_key: key,
      quality,
      upstreamM3u8: resolved.m3u8,
      playlistUrl: `${streamfreePublicBase(req)}/api/streamfree/live/${encodeURIComponent(key)}/playlist.m3u8?quality=${quality}`,
      proxyBase: streamfreeProxyPath(req),
    });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : "resolve_failed" });
  }
});

/**
 * Self-refreshing playlist for players (m3u8player / hls.js).
 * Same idea as /api/stream/live/:id/playlist.m3u8 — never hand the signed upstream URL to the client long-term.
 * Segment lines are rewritten through /api/streamfree/proxy so Referer is injected server-side.
 */
router.get("/streamfree/live/:key/playlist.m3u8", async (req, res) => {
  try {
    const key = String(req.params.key || "").toLowerCase();
    const quality = parseQuality(req.query.quality);
    if (!isValidStreamKey(key)) {
      res.status(400).json({ error: "bad_key" });
      return;
    }
    const resolved = await resolveStreamFreeM3u8(key, quality);
    const up = await fetchUpstreamText(resolved.m3u8, resolved.referer);
    if (up.status >= 400 || !up.text.startsWith("#EXTM3U")) {
      res.status(502).json({ error: `upstream_playlist_${up.status}` });
      return;
    }
    const rewritten = rewritePlaylistThroughProxy(
      up.text,
      resolved.m3u8,
      streamfreeProxyPath(req),
    );
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(rewritten);
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : "playlist_failed" });
  }
});

/** Proxy playlist segments / nested playlists (Referer injected). Host allow-list. */
router.get("/streamfree/proxy", async (req, res) => {
  try {
    const target = String(req.query.url || "");
    if (!target || !isAllowedStreamFreeProxyUrl(target)) {
      res.status(403).json({ error: "host_not_allowed" });
      return;
    }
    const referer = `${SF_ORIGIN}/`;
    const isPlaylist = target.includes(".m3u8");
    if (isPlaylist) {
      const up = await fetchUpstreamText(target, referer);
      if (up.status >= 400) {
        res.status(up.status).json({ error: "upstream_error" });
        return;
      }
      const body = up.text.startsWith("#EXTM3U")
        ? rewritePlaylistThroughProxy(up.text, target, streamfreeProxyPath(req))
        : up.text;
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.send(body);
      return;
    }
    const up = await fetchUpstreamBinary(target, referer);
    if (up.status >= 400) {
      res.status(up.status).json({ error: "upstream_error" });
      return;
    }
    res.setHeader("Content-Type", up.contentType || "application/octet-stream");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(Buffer.from(up.buf));
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : "proxy_failed" });
  }
});


export default router;
