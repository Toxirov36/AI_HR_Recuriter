/** A map link HR pastes for an offline interview; coordinates are read from the URL itself (the link is never fetched). */
export type MapLink = { url: string; lat: number | null; lng: number | null };

const ALLOWED_HOSTS = [
  /^(www\.)?google\.(com|uz|ru|kz|by|com\.uz)$/,
  /^maps\.google\.(com|uz|ru|kz|by|com\.uz)$/,
  /^maps\.app\.goo\.gl$/,
  /^goo\.gl$/,
  /^(www\.)?yandex\.(ru|uz|com|kz|by)$/,
  /^yandex\.(ru|uz|com|kz|by)$/,
  /^(www\.)?2gis\.(uz|ru|com|kz)$/,
  /^go\.2gis\.com$/,
  /^(www\.)?openstreetmap\.org$/,
];

const inRange = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
const pair = (a: string | null | undefined, b?: string | null) => {
  const x = Number(a);
  const y = Number(b);
  return { x, y };
};

function fromPair(value: string | null, order: 'latlng' | 'lnglat'): { lat: number; lng: number } | null {
  const match = value?.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const { x, y } = pair(match[1], match[2]);
  const point = order === 'latlng' ? { lat: x, lng: y } : { lat: y, lng: x };
  return inRange(point.lat, point.lng) ? point : null;
}

function coordinates(url: URL): { lat: number; lng: number } | null {
  const host = url.hostname.toLowerCase();
  const params = url.searchParams;
  const decoded = decodeURIComponent(`${url.pathname}${url.hash}`);

  if (/(^|\.)google\./.test(host) || host.endsWith('goo.gl')) {
    // The exact place marker (!3d…!4d…) wins over the map centre (@lat,lng).
    const marker = decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (marker && inRange(Number(marker[1]), Number(marker[2]))) return { lat: Number(marker[1]), lng: Number(marker[2]) };
    const centre = decoded.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (centre && inRange(Number(centre[1]), Number(centre[2]))) return { lat: Number(centre[1]), lng: Number(centre[2]) };
    for (const key of ['q', 'query', 'll', 'destination']) {
      const point = fromPair(params.get(key), 'latlng');
      if (point) return point;
    }
    return null;
  }
  if (host.includes('yandex.')) {
    // Yandex writes longitude first.
    return fromPair(params.get('pt'), 'lnglat') ?? fromPair(params.get('ll'), 'lnglat');
  }
  if (host.includes('2gis.')) {
    const fromParam = fromPair(params.get('m')?.split('/')[0] ?? null, 'lnglat');
    if (fromParam) return fromParam;
    const inPath = decoded.match(/(-?\d{1,3}\.\d+)%2C(-?\d{1,2}\.\d+)|(-?\d{1,3}\.\d+),(-?\d{1,2}\.\d+)/);
    return inPath && inRange(Number(inPath[4] ?? inPath[2]), Number(inPath[3] ?? inPath[1]))
      ? { lat: Number(inPath[4] ?? inPath[2]), lng: Number(inPath[3] ?? inPath[1]) }
      : null;
  }
  if (host.endsWith('openstreetmap.org')) {
    const lat = Number(params.get('mlat'));
    const lng = Number(params.get('mlon'));
    if (inRange(lat, lng)) return { lat, lng };
    const map = url.hash.match(/map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
    return map && inRange(Number(map[1]), Number(map[2])) ? { lat: Number(map[1]), lng: Number(map[2]) } : null;
  }
  return null;
}

/** Returns the cleaned link with coordinates when they can be read, or null when the link is not an accepted map link. */
export function parseMapLink(value: string): MapLink | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.some((pattern) => pattern.test(host))) return null;
  const point = coordinates(url);
  return { url: url.toString(), lat: point?.lat ?? null, lng: point?.lng ?? null };
}
