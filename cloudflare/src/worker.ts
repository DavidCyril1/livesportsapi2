import { getAiSportsMatches } from "./scraper";
import { handleStreamProxy } from "./stream-proxy";
import { renderDocs } from "./docs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/") {
        const origin = `${url.protocol}//${url.host}`;
        return new Response(renderDocs(origin), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=300",
          },
        });
      }

      if (path === "/health") {
        return json({
          status: "ok",
          service: "sportslivetoday-scraper",
          endpoints: [
            "/api/sportslivetoday",
            "/api/sportslivetoday/live",
            "/api/sportslivetoday/streams",
            "/api/basketball",
            "/api/basketball/live",
            "/api/basketball/streams",
            "/api/cricket",
            "/api/cricket/live",
            "/api/cricket/streams",
            "/api/stream/proxy?url=<m3u8 or .ts url>",
          ],
        });
      }

      if (path === "/api/stream/proxy") {
        return handleStreamProxy(request);
      }

      const SOURCE = "sportslivetoday.com (AISports API)";
      type Sport = "football" | "basketball" | "cricket";

      const sportRoutes: Record<
        string,
        { sport: Sport; mode: "all" | "live" | "streams"; label: string }
      > = {
        "/api/sportslivetoday":         { sport: "football",   mode: "all",     label: "football" },
        "/api/sportslivetoday/live":    { sport: "football",   mode: "live",    label: "football" },
        "/api/sportslivetoday/streams": { sport: "football",   mode: "streams", label: "football" },
        "/api/basketball":              { sport: "basketball", mode: "all",     label: "basketball" },
        "/api/basketball/live":         { sport: "basketball", mode: "live",    label: "basketball" },
        "/api/basketball/streams":      { sport: "basketball", mode: "streams", label: "basketball" },
        "/api/cricket":                 { sport: "cricket",    mode: "all",     label: "cricket" },
        "/api/cricket/live":            { sport: "cricket",    mode: "live",    label: "cricket" },
        "/api/cricket/streams":         { sport: "cricket",    mode: "streams", label: "cricket" },
      };

      const route = sportRoutes[path];
      if (route) {
        const matches = await getAiSportsMatches(route.sport);
        const filtered =
          route.mode === "live"
            ? matches.filter((m) => m.status === "live" || m.status === "halftime")
            : route.mode === "streams"
              ? matches.filter((m) => !!m.streamUrl)
              : matches;
        const note =
          route.mode === "streams"
            ? `${route.label[0].toUpperCase()}${route.label.slice(1)} matches with active HLS m3u8 stream URLs. Use proxyStreamUrl for header-free playback.`
            : route.mode === "all"
              ? "Use proxyStreamUrl (relative path) for header-free playback through this Worker."
              : undefined;
        return json({
          count: filtered.length,
          updatedAt: new Date().toISOString(),
          source: SOURCE,
          sport: route.label,
          ...(note ? { note } : {}),
          matches: filtered,
        });
      }

      return json({ error: "Not found", path }, 404);
    } catch (err) {
      console.error(err);
      return json(
        { error: "Internal server error", message: String(err) },
        500,
      );
    }
  },
} satisfies ExportedHandler;
