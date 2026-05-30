const STREAM_HEADERS: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Referer: "https://sportslivenow.top/",
    Origin: "https://sportslivenow.top",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "identity",
    Connection: "keep-alive",
  };

  const ALLOWED_HOSTS = new Set([
    "live-pull.aisports.mobi",
    "live-push.aisports.mobi",
  ]);

  function buildProxyUrl(origin: string, targetUrl: string): string {
    return `${origin}/api/stream/proxy?url=${encodeURIComponent(targetUrl)}`;
  }

  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
  };

  export async function handleStreamProxy(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const target = url.searchParams.get("url");
    const debug = url.searchParams.get("debug") === "1";

    if (!target) {
      return jsonResponse({ error: "Missing 'url' query parameter" }, 400);
    }

    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return jsonResponse({ error: "Invalid URL" }, 400);
    }

    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      return jsonResponse(
        { error: `Host not allowed: ${parsed.hostname}` },
        403,
      );
    }

    // Forward Range header from client (critical for HLS .ts segments)
    const upstreamHeaders: Record<string, string> = { ...STREAM_HEADERS };
    const range = request.headers.get("range");
    if (range) upstreamHeaders["Range"] = range;

    const isPlaylist = parsed.pathname.endsWith(".m3u8");

    let upstream: Response;
    try {
      upstream = await fetch(target, {
        method: request.method === "HEAD" ? "HEAD" : "GET",
        headers: upstreamHeaders,
        redirect: "follow",
      });
    } catch (err) {
      return jsonResponse(
        { error: "Upstream fetch failed", message: String(err) },
        502,
      );
    }

    if (debug) {
      return jsonResponse({
        target,
        upstreamStatus: upstream.status,
        upstreamStatusText: upstream.statusText,
        upstreamHeaders: Object.fromEntries(upstream.headers),
        sentHeaders: upstreamHeaders,
      });
    }

    if (upstream.status >= 400) {
      const body = await upstream.text().catch(() => "");
      return jsonResponse(
        {
          error: "Upstream error",
          status: upstream.status,
          statusText: upstream.statusText,
          snippet: body.slice(0, 200),
        },
        upstream.status,
      );
    }

    if (isPlaylist) {
      const text = await upstream.text();
      const baseUrl = target.substring(0, target.lastIndexOf("/") + 1);
      const origin = `${url.protocol}//${url.host}`;

      const rewritten = text
        .split("\n")
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) {
            const uriMatch = trimmed.match(/URI="([^"]+)"/);
            if (uriMatch) {
              const uri = uriMatch[1];
              const absolute = uri.startsWith("http") ? uri : baseUrl + uri;
              return line.replace(uri, buildProxyUrl(origin, absolute));
            }
            return line;
          }
          const absolute = trimmed.startsWith("http")
            ? trimmed
            : baseUrl + trimmed;
          return buildProxyUrl(origin, absolute);
        })
        .join("\n");

      return new Response(rewritten, {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-cache",
          ...CORS,
        },
      });
    }

    // Stream segment passthrough — preserve status (206 for Range), pass headers through
    const headers = new Headers();
    const passthrough = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "last-modified",
      "etag",
    ];
    for (const h of passthrough) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    if (!headers.has("content-type")) headers.set("Content-Type", "video/mp2t");
    if (!headers.has("accept-ranges")) headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "public, max-age=10");
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  }

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
  