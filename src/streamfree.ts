/** StreamFree (strmfree.st) — resolve signed HLS; playlist-only proxy. */

const SF_ORIGIN = "https://streamfree.top";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type StreamFreeStream = {
  id: string;
  name: string;
  category: string;
  stream_key: string;
  team1?: { name: string };
  team2?: { name: string };
  live_sources?: { quality: string; url: string }[];
  sources?: { quality: string; url: string }[];
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function teamHit(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const ta = na.split(" ").filter((w) => w.length > 2);
  const tb = new Set(nb.split(" ").filter((w) => w.length > 2));
  let hits = 0;
  for (const w of ta) if (tb.has(w)) hits++;
  return hits >= 1 && hits >= Math.min(2, ta.length);
}

export async function listSoccerStreams(): Promise<StreamFreeStream[]> {
  const r = await fetch(`${SF_ORIGIN}/api/v1/streams?category=soccer`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) return [];
  const j = (await r.json()) as { streams?: StreamFreeStream[] };
  return Array.isArray(j.streams) ? j.streams : [];
}

export async function findStreamFreeKey(
  homeTeam: string,
  awayTeam: string,
): Promise<StreamFreeStream | null> {
  const streams = await listSoccerStreams();
  for (const s of streams) {
    const t1 = s.team1?.name || s.name.split(/\s+vs\s+/i)[0] || "";
    const t2 = s.team2?.name || s.name.split(/\s+vs\s+/i)[1] || "";
    if (
      (teamHit(homeTeam, t1) && teamHit(awayTeam, t2)) ||
      (teamHit(homeTeam, t2) && teamHit(awayTeam, t1))
    ) {
      return s;
    }
  }
  const nh = norm(homeTeam);
  const na = norm(awayTeam);
  for (const s of streams) {
    const n = norm(s.name);
    if (n.includes(nh.split(" ")[0]) && n.includes(na.split(" ")[0])) return s;
  }
  return null;
}

type Sig = { _t: string; _e: number; _n: string };

function parseEmbed(html: string, key: string, quality: string): { variant: string; sig: Sig } {
  const q = html.match(/\bconst\s+QUALITY\s*=\s*['"](540p|720p|1080p|2160p)['"]/);
  const suf = html.match(/\bconst\s+SOURCE_SUFFIX\s*=\s*['"]([^'"]*)['"]/);
  const vk = html.match(/\bconst\s+VARIANT\s*=\s*['"]([a-z0-9]+(?:-[a-z0-9]+)*)['"]/);
  const qualityFound = q?.[1] || quality;
  const suffix = suf?.[1] ?? "";
  const baseKey = vk?.[1] || key;
  const variant = `${baseKey}${qualityFound}${suffix}`;

  const start = html.search(/\bconst\s+_0x\s*=\s*\{/);
  if (start < 0) throw new Error("no_signature");
  const brace = html.indexOf("{", start);
  let depth = 0;
  let end = -1;
  let quoted = false;
  let escaped = false;
  for (let i = brace; i < Math.min(html.length, brace + 20_000); i++) {
    const c = html[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) throw new Error("bad_signature_json");
  const signatures = JSON.parse(html.slice(brace, end)) as Record<string, Sig>;
  const sig = signatures[qualityFound] || signatures["1080p"] || signatures["720p"];
  if (!sig?._t || !sig?._n || !sig?._e) throw new Error("missing_quality_sig");
  return { variant, sig };
}

export async function resolveStreamFreeM3u8(
  streamKey: string,
  quality: "1080p" | "720p" | "540p" = "1080p",
): Promise<{ m3u8: string; embedUrl: string; referer: string }> {
  const embedUrl = `${SF_ORIGIN}/embed/soccer/${streamKey}${quality}`;
  const playerRef = `${SF_ORIGIN}/player/soccer/${streamKey}`;

  const embRes = await fetch(embedUrl, {
    headers: {
      "User-Agent": UA,
      Referer: playerRef,
      Accept: "text/html",
      "Sec-Fetch-Dest": "iframe",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
  });
  if (!embRes.ok) throw new Error(`embed_${embRes.status}`);
  const html = await embRes.text();
  if (html.length < 500 || html.includes("Violation")) throw new Error("embed_blocked");

  const { variant, sig } = parseEmbed(html, streamKey, quality);

  const metaRes = await fetch(`${SF_ORIGIN}/get-stream-key/${encodeURIComponent(streamKey)}`, {
    headers: { "User-Agent": UA, Accept: "application/json", Referer: embedUrl },
    signal: AbortSignal.timeout(8_000),
  });
  const meta = metaRes.ok
    ? ((await metaRes.json()) as { server_name?: string; is_external?: boolean })
    : { server_name: "externalcdn" };
  if (meta.is_external) throw new Error("external_unsupported");

  const server = meta.server_name || "origin";
  const route =
    server === "externalcdn" ? "live-externalcdn" : server === "origin" ? "live" : "live-cdn";

  const m3u8 = new URL(`/${route}/${variant}/index.m3u8`, SF_ORIGIN);
  m3u8.searchParams.set("_t", sig._t);
  m3u8.searchParams.set("_e", String(sig._e));
  m3u8.searchParams.set("_n", sig._n);

  return { m3u8: m3u8.href, embedUrl, referer: embedUrl };
}

export async function fetchStreamFreePlaylist(
  streamKey: string,
  quality: "1080p" | "720p" | "540p" = "1080p",
): Promise<string> {
  const { m3u8, referer } = await resolveStreamFreeM3u8(streamKey, quality);
  const r = await fetch(m3u8, {
    headers: {
      "User-Agent": UA,
      Referer: referer,
      Accept: "application/vnd.apple.mpegurl,*/*",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) throw new Error(`playlist_${r.status}`);
  const text = await r.text();
  if (!text.startsWith("#EXTM3U")) throw new Error("not_m3u8");
  return text;
}
