import { Router, type Request, type Response } from "express";
import axios from "axios";
import { getFreshStreamUrl } from "./scraper";

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

export default router;
