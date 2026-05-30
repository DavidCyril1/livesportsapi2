import axios from "axios";

export type SportType = "football" | "basketball" | "cricket";
export type MatchStatus =
  | "live"
  | "halftime"
  | "finished"
  | "upcoming"
  | "postponed";

export interface CricketTeamScore {
  runs: number | null;
  wickets: number | null;
  overs: string | null;
}

export interface LiveMatch {
  id: string;
  sport: SportType | string;
  homeTeam: string;
  awayTeam: string;
  homeTeamAbbr: string | null;
  awayTeamAbbr: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homeCricket?: CricketTeamScore;
  awayCricket?: CricketTeamScore;
  minute: string | null;
  status: MatchStatus;
  rawStatus: string;
  league: string;
  leagueId: string | null;
  matchRound: string | null;
  startTime: string | null;
  endTime: string | null;
  startTimeMs: number | null;
  source: string;
  detailUrl: string;
  streamUrl?: string;
  proxyStreamUrl?: string;
  freshStreamUrl?: string;
  freshPlaylistUrl?: string;
  alternateStreams?: { title: string; url: string }[];
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  matchResult?: string;
  hasReplay?: boolean;
  hasHighlights?: boolean;
}

export interface League {
  leagueId: string;
  leagueName: string;
  localLeagueName: string;
  sport: string;
  area: string;
}

const AISPORTS_BASE = "https://h5-api.aoneroom.com/wefeed-h5api-bff";
const SITE_BASE = "https://sportslivenow.top";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  callerSource: "h5",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://sportslivenow.top/",
  Origin: "https://sportslivenow.top",
};

function parseStatus(raw: string): MatchStatus {
  switch (raw) {
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

function toCricketScore(info: any): CricketTeamScore | undefined {
  if (!info) return undefined;
  const runs = info.crtRunsScored ? Number(info.crtRunsScored) : null;
  const wickets =
    info.crtWicketsLost !== undefined && info.crtWicketsLost !== ""
      ? Number(info.crtWicketsLost)
      : null;
  const overs =
    info.crtOvers && info.crtOvers !== ""
      ? `${info.crtOvers}.${info.crtOversExtraBalls || 0}`
      : null;
  if (runs === null && wickets === null && overs === null) return undefined;
  return { runs, wickets, overs };
}

function normalizeMatch(m: any): LiveMatch | null {
  const team1 = m.team1 ?? {};
  const team2 = m.team2 ?? {};
  if (!team1.name || !team2.name) return null;

  const sport = String(m.type ?? "football");
  const id = String(m.id);
  const rawStatus = String(m.status ?? "");
  const status = parseStatus(rawStatus);
  const playPath =
    m.playType === "PlayTypeVideo" && m.playPath ? String(m.playPath) : undefined;

  const startMs = Number(m.startTime ?? m.arrangedTime ?? 0) || null;
  const endMs = Number(m.endTime ?? 0) || null;

  const altSources = Array.isArray(m.playSource)
    ? m.playSource
        .filter((s: any) => s && s.path)
        .map((s: any) => ({ title: String(s.title ?? "Channel"), url: String(s.path) }))
    : [];

  const cricketHome = sport === "cricket" ? toCricketScore(m.teamMatchInfo1) : undefined;
  const cricketAway = sport === "cricket" ? toCricketScore(m.teamMatchInfo2) : undefined;

  const detailUrl = `${SITE_BASE}/live/detail?id=${id}&sportType=${sport}`;

  return {
    id,
    sport,
    homeTeam: String(team1.name ?? "Unknown"),
    awayTeam: String(team2.name ?? "Unknown"),
    homeTeamAbbr: team1.abbreviation || null,
    awayTeamAbbr: team2.abbreviation || null,
    homeScore: team1.score !== "" && team1.score != null ? Number(team1.score) : null,
    awayScore: team2.score !== "" && team2.score != null ? Number(team2.score) : null,
    homeCricket: cricketHome,
    awayCricket: cricketAway,
    minute: m.timeDesc ? String(m.timeDesc) : null,
    status,
    rawStatus,
    league: String(m.league ?? m.matchRound ?? "Unknown"),
    leagueId: m.leagueId ? String(m.leagueId) : null,
    matchRound: m.matchRound ? String(m.matchRound) : null,
    startTime: startMs ? new Date(startMs).toISOString() : null,
    endTime: endMs ? new Date(endMs).toISOString() : null,
    startTimeMs: startMs,
    source: "sportslivetoday",
    detailUrl,
    streamUrl: playPath,
    homeTeamLogo: team1.avatar || undefined,
    awayTeamLogo: team2.avatar || undefined,
    matchResult: m.matchResult || undefined,
    hasReplay: Array.isArray(m.replay) && m.replay.length > 0,
    hasHighlights: Array.isArray(m.highlights) && m.highlights.length > 0,
    alternateStreams: altSources.length ? altSources : undefined,
  };
}

async function fetchAggregate(sport: SportType): Promise<LiveMatch[]> {
  try {
    const res = await axios.get(`${AISPORTS_BASE}/sport/aggregate-v1`, {
      headers: HEADERS,
      params: { sport },
      timeout: 12000,
    });
    const list: any[] = res.data?.data?.matchList ?? [];
    return list.map(normalizeMatch).filter((m): m is LiveMatch => m !== null);
  } catch (err) {
    console.error(`[scraper] aggregate-v1 ${sport} failed:`, (err as Error).message);
    return [];
  }
}

async function fetchMatchListPage(direction: number): Promise<LiveMatch[]> {
  try {
    const res = await axios.get(`${AISPORTS_BASE}/live/match-list-v5`, {
      headers: HEADERS,
      params: { sport: "football", pageSize: 50, direction },
      timeout: 12000,
    });
    const list: any[] = res.data?.data?.list ?? [];
    return list.map(normalizeMatch).filter((m): m is LiveMatch => m !== null);
  } catch (err) {
    console.error(`[scraper] match-list-v5 d=${direction} failed:`, (err as Error).message);
    return [];
  }
}

let allCache: { data: LiveMatch[]; ts: number } | null = null;
const ALL_CACHE_TTL_MS = 20 * 1000;

export async function getAllMatches(): Promise<LiveMatch[]> {
  if (allCache && Date.now() - allCache.ts < ALL_CACHE_TTL_MS) {
    return allCache.data;
  }
  const results = await Promise.all([
    fetchAggregate("football"),
    fetchAggregate("basketball"),
    fetchAggregate("cricket"),
    fetchMatchListPage(0),
    fetchMatchListPage(1),
    fetchMatchListPage(2),
  ]);
  const merged = new Map<string, LiveMatch>();
  for (const list of results) {
    for (const m of list) {
      const existing = merged.get(m.id);
      if (!existing) {
        merged.set(m.id, m);
      } else {
        merged.set(m.id, mergePreferLive(existing, m));
      }
    }
  }
  const matches = Array.from(merged.values()).sort((a, b) => {
    const order = { live: 0, halftime: 1, upcoming: 2, postponed: 3, finished: 4 };
    const sa = order[a.status];
    const sb = order[b.status];
    if (sa !== sb) return sa - sb;
    return (a.startTimeMs ?? 0) - (b.startTimeMs ?? 0);
  });
  allCache = { data: matches, ts: Date.now() };
  return matches;
}

function mergePreferLive(a: LiveMatch, b: LiveMatch): LiveMatch {
  const aLive = a.status === "live" || a.status === "halftime";
  const bLive = b.status === "live" || b.status === "halftime";
  const primary = bLive && !aLive ? b : a;
  const secondary = primary === a ? b : a;
  return {
    ...primary,
    streamUrl: primary.streamUrl ?? secondary.streamUrl,
    alternateStreams: primary.alternateStreams ?? secondary.alternateStreams,
    matchResult: primary.matchResult ?? secondary.matchResult,
    homeTeamLogo: primary.homeTeamLogo ?? secondary.homeTeamLogo,
    awayTeamLogo: primary.awayTeamLogo ?? secondary.awayTeamLogo,
  };
}

const detailCache = new Map<string, { data: LiveMatch; ts: number }>();
const DETAIL_CACHE_TTL_MS = 10 * 1000;

export async function getMatchDetail(id: string): Promise<LiveMatch | null> {
  const cached = detailCache.get(id);
  if (cached && Date.now() - cached.ts < DETAIL_CACHE_TTL_MS) {
    return cached.data;
  }
  try {
    const res = await axios.get(`${AISPORTS_BASE}/live/match-detail`, {
      headers: HEADERS,
      params: { id },
      timeout: 10000,
      validateStatus: () => true,
    });
    if (res.status !== 200 || res.data?.code !== 0) return null;
    const normalized = normalizeMatch(res.data.data);
    if (!normalized) return null;
    detailCache.set(id, { data: normalized, ts: Date.now() });
    return normalized;
  } catch (err) {
    console.error(`[scraper] match-detail ${id} failed:`, (err as Error).message);
    return null;
  }
}

export async function getFreshStreamUrl(id: string): Promise<string | null> {
  const detail = await getMatchDetail(id);
  return detail?.streamUrl ?? null;
}

let leagueCache: { data: League[]; ts: number } | null = null;
const LEAGUE_TTL_MS = 5 * 60 * 1000;

export async function getLeagues(): Promise<League[]> {
  if (leagueCache && Date.now() - leagueCache.ts < LEAGUE_TTL_MS) {
    return leagueCache.data;
  }
  try {
    const res = await axios.get(`${AISPORTS_BASE}/live/match-board-league`, {
      headers: HEADERS,
      timeout: 10000,
    });
    const list: any[] = res.data?.data?.list ?? [];
    const leagues: League[] = [];
    for (const group of list) {
      const sport = String(group.leagueType ?? "");
      for (const lg of group.leagueList ?? []) {
        leagues.push({
          leagueId: String(lg.leagueId),
          leagueName: String(lg.leagueName),
          localLeagueName: String(lg.localLeagueName ?? lg.leagueName),
          sport,
          area: String(lg.area ?? ""),
        });
      }
    }
    leagueCache = { data: leagues, ts: Date.now() };
    return leagues;
  } catch (err) {
    console.error("[scraper] leagues failed:", (err as Error).message);
    return leagueCache?.data ?? [];
  }
}

// Backwards-compat: same shape as the previous LiveMatch contract
export async function getAiSportsMatches(): Promise<LiveMatch[]> {
  return getAllMatches();
}
