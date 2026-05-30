export interface LiveMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  minute: string | null;
  status: "live" | "finished" | "upcoming" | "halftime" | "postponed";
  league: string;
  startTime: string | null;
  source: string;
  streamUrl?: string;
  proxyStreamUrl?: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
}

const AISPORTS_BASE = "https://h5-api.aoneroom.com/wefeed-h5api-bff";

const AISPORTS_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  callerSource: "h5",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://sportslivenow.top/",
  Origin: "https://sportslivenow.top",
};

function parseAiSportsStatus(status: string): LiveMatch["status"] {
  switch (status) {
    case "MatchIng":
    case "MatchLive":
      return "live";
    case "MatchHalfTime":
      return "halftime";
    case "MatchEnded":
    case "MatchFinish":
    case "MatchEnd":
      return "finished";
    case "MatchPostponed":
    case "MatchCancelled":
    case "MatchSuspended":
      return "postponed";
    default:
      return "upcoming";
  }
}

function normalize(item: unknown): (LiveMatch & { _sport: string }) | null {
  const m = item as Record<string, unknown>;
  const team1 = m.team1 as Record<string, string> | undefined;
  const team2 = m.team2 as Record<string, string> | undefined;
  if (!team1 || !team2) return null;

  const playType = String(m.playType ?? "");
  const playPath = String(m.playPath ?? "");
  const streamUrl =
    playType === "PlayTypeVideo" && playPath ? playPath : undefined;
  const proxyStreamUrl = streamUrl
    ? `/api/stream/proxy?url=${encodeURIComponent(streamUrl)}`
    : undefined;

  const startTimeMs = Number(m.startTime ?? m.arrangedTime ?? 0);
  const startTime = startTimeMs ? new Date(startTimeMs).toISOString() : null;
  const status = parseAiSportsStatus(String(m.status ?? ""));
  const timeDesc = String(m.timeDesc ?? "");

  return {
    id: `aisports-${m.id as string}`,
    homeTeam: team1.name ?? "Unknown",
    awayTeam: team2.name ?? "Unknown",
    homeScore: team1.score !== "" ? Number(team1.score) : null,
    awayScore: team2.score !== "" ? Number(team2.score) : null,
    minute: timeDesc || null,
    status,
    league: String(m.league ?? m.matchRound ?? "Football"),
    startTime,
    source: "sportslivetoday",
    streamUrl,
    proxyStreamUrl,
    homeTeamLogo: team1.avatar || undefined,
    awayTeamLogo: team2.avatar || undefined,
    _sport: String(m.type ?? "football"),
  };
}

async function fetchMatchListPage(direction: number) {
  const url = new URL(`${AISPORTS_BASE}/live/match-list-v5`);
  url.searchParams.set("sport", "football");
  url.searchParams.set("pageSize", "50");
  url.searchParams.set("direction", String(direction));
  const r = await fetch(url.toString(), {
    headers: AISPORTS_HEADERS,
    cf: { cacheTtl: 15, cacheEverything: true },
  });
  if (!r.ok) return [];
  const json = (await r.json()) as { data?: { list?: unknown[] } };
  return (json?.data?.list ?? [])
    .map(normalize)
    .filter((m): m is LiveMatch & { _sport: string } => m !== null);
}

async function fetchAggregate(sport: string) {
  const url = new URL(`${AISPORTS_BASE}/sport/aggregate-v1`);
  url.searchParams.set("sport", sport);
  const r = await fetch(url.toString(), {
    headers: AISPORTS_HEADERS,
    cf: { cacheTtl: 15, cacheEverything: true },
  });
  if (!r.ok) return [];
  const json = (await r.json()) as { data?: { matchList?: unknown[] } };
  return (json?.data?.matchList ?? [])
    .map(normalize)
    .filter((m): m is LiveMatch & { _sport: string } => m !== null);
}

async function getAllNormalizedMatches(): Promise<
  Array<LiveMatch & { _sport: string }>
> {
  const results = await Promise.all([
    fetchAggregate("football"),
    fetchAggregate("basketball"),
    fetchAggregate("cricket"),
    fetchMatchListPage(0),
    fetchMatchListPage(1),
    fetchMatchListPage(2),
  ]);
  const merged = new Map<string, LiveMatch & { _sport: string }>();
  for (const list of results) {
    for (const m of list) {
      const existing = merged.get(m.id);
      if (!existing || (m.streamUrl && !existing.streamUrl)) {
        merged.set(m.id, m);
      }
    }
  }
  return Array.from(merged.values());
}

export async function getAiSportsMatches(
  sport: "football" | "basketball" | "cricket" = "football",
): Promise<LiveMatch[]> {
  const all = await getAllNormalizedMatches();
  return all
    .filter((m) => m._sport === sport)
    .map(({ _sport, ...rest }) => rest);
}
