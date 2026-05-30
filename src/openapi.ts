export function buildOpenApiSpec(serverUrl: string) {
  return {
    openapi: "3.0.3",
    info: {
      title: "sportslivetoday-scraper API",
      version: "2.0.0",
      description:
        "Live football, basketball and cricket match data scraped from " +
        "**sportslivetoday.com / sportslivenow.top** (AISports backend), " +
        "with real HLS m3u8 stream URLs and a built-in stream proxy that injects " +
        "the required `Referer`, `Origin` and `User-Agent` headers so streams play " +
        "in any browser, hls.js client, VLC, ffplay or native `<video>` tag.\n\n" +
        "### Self-refreshing live stream URL\n" +
        "Stream `sign=` tokens expire after a few minutes. Use " +
        "`/api/stream/live/{id}/playlist.m3u8` — it transparently fetches a fresh " +
        "playPath from the upstream API on every request, so your `<video>` tag " +
        "never sees an expired token.",
      contact: { name: "GitHub", url: "https://github.com/" },
      license: { name: "MIT" },
    },
    servers: [{ url: serverUrl, description: "This server" }],
    tags: [
      { name: "Matches", description: "Live, upcoming and finished matches" },
      { name: "Streams", description: "HLS streams with header-injecting proxy" },
      { name: "Leagues", description: "League / competition catalog" },
      { name: "Health", description: "Service liveness" },
      { name: "Basketball", description: "Basketball-only convenience endpoints (legacy-style shape)" },
      { name: "Cricket", description: "Cricket-only convenience endpoints with innings detail" },
      { name: "Legacy", description: "v1 endpoints kept for backwards compatibility" },
    ],
    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Liveness check",
          responses: {
            "200": {
              description: "Service is up",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HealthResponse" },
                  example: { status: "ok", service: "sportslivetoday-scraper" },
                },
              },
            },
          },
        },
      },
      "/api/matches": {
        get: {
          tags: ["Matches"],
          summary: "List all matches across all sports",
          description:
            "Merges multiple upstream feeds (per-sport `aggregate-v1` + `match-list-v5`) " +
            "into a single deduped list. Sorted with live matches first.",
          parameters: [
            {
              name: "sport",
              in: "query",
              schema: {
                type: "string",
                enum: ["all", "football", "basketball", "cricket"],
                default: "all",
              },
              description: "Filter by sport.",
            },
            {
              name: "status",
              in: "query",
              schema: {
                type: "string",
                enum: ["all", "live", "halftime", "upcoming", "finished", "postponed"],
                default: "all",
              },
              description: "Filter by status.",
            },
            {
              name: "league",
              in: "query",
              schema: { type: "string" },
              description: "Case-insensitive league name substring filter, e.g. 'Champions'.",
            },
            {
              name: "withStream",
              in: "query",
              schema: { type: "boolean", default: false },
              description: "If true, only return matches with a streamUrl.",
            },
          ],
          responses: {
            "200": {
              description: "Matches list",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MatchesResponse" },
                },
              },
            },
          },
        },
      },
      "/api/matches/live": {
        get: {
          tags: ["Matches"],
          summary: "Currently live + halftime matches only",
          parameters: [
            {
              name: "sport",
              in: "query",
              schema: {
                type: "string",
                enum: ["all", "football", "basketball", "cricket"],
                default: "all",
              },
            },
          ],
          responses: {
            "200": {
              description: "Live matches",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MatchesResponse" },
                },
              },
            },
          },
        },
      },
      "/api/matches/streaming": {
        get: {
          tags: ["Matches"],
          summary: "Matches that currently have a working HLS stream URL",
          parameters: [
            {
              name: "sport",
              in: "query",
              schema: {
                type: "string",
                enum: ["all", "football", "basketball", "cricket"],
                default: "all",
              },
            },
          ],
          responses: {
            "200": {
              description: "Streamable matches",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MatchesResponse" },
                },
              },
            },
          },
        },
      },
      "/api/matches/{id}": {
        get: {
          tags: ["Matches"],
          summary: "Get a single match with a freshly fetched stream URL",
          description:
            "Hits the upstream `/live/match-detail` endpoint directly so the " +
            "`streamUrl` and `freshPlaylistUrl` reflect the very latest sign token.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Match id (the raw AISports id, e.g. 4505244821573064144).",
              example: "4505244821573064144",
            },
          ],
          responses: {
            "200": {
              description: "Match found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MatchResponse" },
                },
              },
            },
            "404": {
              description: "Match not found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/leagues": {
        get: {
          tags: ["Leagues"],
          summary: "List all known leagues / competitions",
          responses: {
            "200": {
              description: "Leagues",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/LeaguesResponse" },
                },
              },
            },
          },
        },
      },
      "/api/stream/live/{id}/playlist.m3u8": {
        get: {
          tags: ["Streams"],
          summary: "Self-refreshing HLS playlist for a match (recommended)",
          description:
            "Stable URL that re-fetches a fresh upstream `playPath` (with a valid " +
            "`sign=` token) on every request, then streams the rewritten m3u8. " +
            "Use this directly in `<video src=...>` or hls.js — it never expires.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              example: "4505244821573064144",
            },
          ],
          responses: {
            "200": {
              description: "HLS playlist (with proxied .ts segment URLs)",
              content: {
                "application/vnd.apple.mpegurl": {
                  schema: { type: "string" },
                },
              },
            },
            "404": { description: "No live stream available for this match" },
            "502": { description: "Upstream stream fetch failed" },
          },
        },
      },
      "/api/stream/live/{id}": {
        get: {
          tags: ["Streams"],
          summary: "Get fresh stream URLs for a match (JSON)",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              example: "4505244821573064144",
            },
          ],
          responses: {
            "200": {
              description: "Fresh stream URLs",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/FreshStreamResponse" },
                },
              },
            },
            "404": { description: "No live stream available for this match" },
          },
        },
      },
      "/api/stream/proxy": {
        get: {
          tags: ["Streams"],
          summary: "Raw HLS proxy",
          description:
            "Low-level proxy that injects the required headers and rewrites .m3u8 " +
            "playlists so each .ts segment also flows through this proxy. Only " +
            "`live-pull.aisports.mobi` and `live-push.aisports.mobi` are allowed.",
          parameters: [
            {
              name: "url",
              in: "query",
              required: true,
              schema: { type: "string", format: "uri" },
              description: "URL-encoded upstream m3u8 or .ts URL.",
              example:
                "https://live-pull.aisports.mobi/moviebox/device01/playlist.m3u8?sign=...&t=...",
            },
          ],
          responses: {
            "200": {
              description: "Stream content (m3u8 or ts segment)",
              content: {
                "application/vnd.apple.mpegurl": { schema: { type: "string" } },
                "video/mp2t": { schema: { type: "string", format: "binary" } },
              },
            },
            "400": { description: "Missing or invalid URL" },
            "403": { description: "Host not in allowlist" },
            "502": { description: "Upstream error" },
          },
        },
      },
      "/api/basketball": {
        get: {
          tags: ["Basketball"],
          summary: "All basketball matches",
          description:
            "Returns basketball matches in the same compact shape as the legacy " +
            "`/api/sportslivetoday` endpoint, so existing clients can swap sport " +
            "with a one-line change.",
          responses: {
            "200": {
              description: "Basketball matches",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/basketball/live": {
        get: {
          tags: ["Basketball"],
          summary: "Currently live basketball games",
          responses: {
            "200": {
              description: "Live basketball matches",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/basketball/streams": {
        get: {
          tags: ["Basketball"],
          summary: "Basketball games with an active HLS stream URL",
          responses: {
            "200": {
              description: "Streamable basketball matches",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/cricket": {
        get: {
          tags: ["Cricket"],
          summary: "All cricket matches",
          description:
            "Cricket matches with the legacy compact shape **plus** extra cricket " +
            "fields: `homeCricket` / `awayCricket` (runs / wickets / overs) and " +
            "`matchResult`. `homeScore` / `awayScore` mirror the runs total for " +
            "convenience.",
          responses: {
            "200": {
              description: "Cricket matches",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/cricket/live": {
        get: {
          tags: ["Cricket"],
          summary: "Currently in-progress cricket matches",
          responses: {
            "200": {
              description: "Live cricket matches",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/cricket/streams": {
        get: {
          tags: ["Cricket"],
          summary: "Cricket matches with an active HLS stream URL",
          responses: {
            "200": {
              description: "Streamable cricket matches",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/sportslivetoday": {
        get: {
          tags: ["Legacy"],
          summary: "(v1) All football matches",
          deprecated: true,
          responses: {
            "200": {
              description: "Matches",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/sportslivetoday/live": {
        get: {
          tags: ["Legacy"],
          summary: "(v1) Live football matches",
          deprecated: true,
          responses: {
            "200": {
              description: "Matches",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/sportslivetoday/streams": {
        get: {
          tags: ["Legacy"],
          summary: "(v1) Football matches with stream URLs",
          deprecated: true,
          responses: {
            "200": {
              description: "Matches",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        HealthResponse: {
          type: "object",
          properties: {
            status: { type: "string", example: "ok" },
            service: { type: "string", example: "sportslivetoday-scraper" },
          },
        },
        Error: {
          type: "object",
          properties: { error: { type: "string" } },
        },
        CricketTeamScore: {
          type: "object",
          properties: {
            runs: { type: "integer", nullable: true, example: 243 },
            wickets: { type: "integer", nullable: true, example: 5 },
            overs: { type: "string", nullable: true, example: "20.0" },
          },
        },
        Match: {
          type: "object",
          properties: {
            id: { type: "string", example: "4505244821573064144" },
            sport: { type: "string", example: "football" },
            homeTeam: { type: "string", example: "Atletico Madrid" },
            awayTeam: { type: "string", example: "Arsenal" },
            homeTeamAbbr: { type: "string", nullable: true, example: "ATM" },
            awayTeamAbbr: { type: "string", nullable: true, example: "ARS" },
            homeScore: { type: "integer", nullable: true, example: 0 },
            awayScore: { type: "integer", nullable: true, example: 0 },
            homeCricket: {
              allOf: [{ $ref: "#/components/schemas/CricketTeamScore" }],
              nullable: true,
            },
            awayCricket: {
              allOf: [{ $ref: "#/components/schemas/CricketTeamScore" }],
              nullable: true,
            },
            minute: { type: "string", nullable: true, example: "67'" },
            status: {
              type: "string",
              enum: ["live", "halftime", "upcoming", "finished", "postponed"],
              example: "live",
            },
            rawStatus: { type: "string", example: "MatchIng" },
            league: { type: "string", example: "Champions League" },
            leagueId: { type: "string", nullable: true },
            matchRound: { type: "string", nullable: true },
            startTime: {
              type: "string",
              format: "date-time",
              nullable: true,
              example: "2026-04-29T19:00:00.000Z",
            },
            endTime: { type: "string", format: "date-time", nullable: true },
            startTimeMs: { type: "integer", nullable: true },
            source: { type: "string", example: "sportslivetoday" },
            detailUrl: {
              type: "string",
              format: "uri",
              example:
                "https://sportslivenow.top/live/detail?id=4505244821573064144&sportType=football",
            },
            streamUrl: {
              type: "string",
              format: "uri",
              nullable: true,
              description:
                "Raw upstream HLS URL with a short-lived sign token. May expire — prefer `freshPlaylistUrl`.",
            },
            proxyStreamUrl: {
              type: "string",
              format: "uri",
              nullable: true,
              description: "URL through this server's header-injecting proxy.",
            },
            freshStreamUrl: {
              type: "string",
              format: "uri",
              nullable: true,
              description:
                "Stable JSON endpoint that returns a fresh proxyStreamUrl every call.",
            },
            freshPlaylistUrl: {
              type: "string",
              format: "uri",
              nullable: true,
              description:
                "**Recommended for `<video>` tags.** Stable m3u8 URL that auto-refreshes the upstream sign token on every request.",
            },
            alternateStreams: {
              type: "array",
              nullable: true,
              items: {
                type: "object",
                properties: {
                  title: { type: "string", example: "Channel 1" },
                  url: { type: "string", format: "uri" },
                },
              },
            },
            homeTeamLogo: { type: "string", format: "uri", nullable: true },
            awayTeamLogo: { type: "string", format: "uri", nullable: true },
            matchResult: { type: "string", nullable: true },
            hasReplay: { type: "boolean" },
            hasHighlights: { type: "boolean" },
          },
        },
        MatchesResponse: {
          type: "object",
          properties: {
            count: { type: "integer", example: 21 },
            updatedAt: { type: "string", format: "date-time" },
            source: { type: "string" },
            filters: { type: "object", additionalProperties: true },
            matches: {
              type: "array",
              items: { $ref: "#/components/schemas/Match" },
            },
          },
        },
        MatchResponse: {
          type: "object",
          properties: {
            updatedAt: { type: "string", format: "date-time" },
            source: { type: "string" },
            match: { $ref: "#/components/schemas/Match" },
          },
        },
        League: {
          type: "object",
          properties: {
            leagueId: { type: "string" },
            leagueName: { type: "string" },
            localLeagueName: { type: "string" },
            sport: { type: "string" },
            area: { type: "string" },
          },
        },
        LeaguesResponse: {
          type: "object",
          properties: {
            count: { type: "integer" },
            leagues: {
              type: "array",
              items: { $ref: "#/components/schemas/League" },
            },
          },
        },
        FreshStreamResponse: {
          type: "object",
          properties: {
            matchId: { type: "string" },
            upstreamUrl: { type: "string", format: "uri" },
            proxyStreamUrl: { type: "string", format: "uri" },
            freshPlaylistUrl: { type: "string", format: "uri" },
            note: { type: "string" },
          },
        },
      },
    },
  };
}
