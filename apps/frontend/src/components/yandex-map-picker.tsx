import { useEffect, useRef, useState } from 'react';
import { LocateFixed, MapPin, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type MapPoint = { lat: number; lng: number };

const TASHKENT: MapPoint = { lat: 41.3111, lng: 69.2797 };
const PIN_STYLE = 'width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#1a5d4c;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)';

const mapsKey = () => (import.meta.env.VITE_YANDEX_MAPS_KEY as string | undefined)?.trim() ?? '';
const round = (value: number) => Number(value.toFixed(6));

/** The link stored with the interview: opens the exact pin on Yandex Maps and carries the coordinates for the candidate message. */
export const yandexMapLink = ({ lat, lng }: MapPoint) => `https://yandex.uz/maps/?ll=${lng}%2C${lat}&pt=${lng}%2C${lat}&z=17&l=map`;

/** Reads the pin back from a link made by yandexMapLink (or any Yandex link with pt=lng,lat); other links give no pin. */
export function pointFromMapUrl(value: string | null | undefined): MapPoint | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (!url.hostname.includes('yandex.')) return null;
    const match = (url.searchParams.get('pt') ?? '').match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (!match) return null;
    const lng = Number(match[1]);
    const lat = Number(match[2]);
    return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
  } catch {
    return null;
  }
}

/** What both map engines offer: show a pin, clear it, move the view, and clean up. */
type Engine = { place: (point: MapPoint) => void; clear: () => void; center: (point: MapPoint) => void; destroy: () => void };
type Mount = (container: HTMLElement, start: MapPoint | null, onPick: (point: MapPoint) => void, language: string) => Promise<Engine>;

let yandexLoader: Promise<any> | null = null;

/** Loads the Yandex Maps JS API v3 once. Rejects without a key, or when the script is blocked or the key is refused. */
function loadYmaps(language: string): Promise<any> {
  const key = mapsKey();
  if (!key) return Promise.reject(new Error('Yandex Maps key is not configured'));
  const existing = (window as any).ymaps3;
  if (existing) return Promise.resolve(existing.ready).then(() => existing);
  yandexLoader ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(key)}&lang=${language.startsWith('en') ? 'en_US' : 'ru_RU'}`;
    script.async = true;
    script.onload = () => {
      const api = (window as any).ymaps3;
      if (!api) return reject(new Error('Yandex Maps did not initialise'));
      Promise.resolve(api.ready).then(() => resolve(api), reject);
    };
    script.onerror = () => {
      yandexLoader = null;
      script.remove();
      reject(new Error('Yandex Maps could not be loaded'));
    };
    document.head.appendChild(script);
  });
  return yandexLoader;
}

const mountYandex: Mount = async (container, start, onPick, language) => {
  const api = await loadYmaps(language);
  const centre = start ?? TASHKENT;
  const map = new api.YMap(container, { location: { center: [centre.lng, centre.lat], zoom: start ? 16 : 12 } });
  map.addChild(new api.YMapDefaultSchemeLayer({}));
  map.addChild(new api.YMapDefaultFeaturesLayer({}));
  let marker: any = null;
  const place = (point: MapPoint) => {
    const coordinates = [point.lng, point.lat];
    if (marker) return marker.update({ coordinates });
    const pin = document.createElement('div');
    pin.setAttribute('aria-hidden', 'true');
    pin.style.cssText = `${PIN_STYLE};margin:-22px 0 0 -11px`;
    marker = new api.YMapMarker({ coordinates }, pin);
    map.addChild(marker);
  };
  map.addChild(
    new api.YMapListener({
      layer: 'any',
      onClick: (_object: unknown, event: { coordinates: [number, number] }) => {
        const [lng, lat] = event.coordinates;
        const point = { lat: round(lat), lng: round(lng) };
        place(point);
        onPick(point);
      },
    }),
  );
  if (start) place(start);
  return {
    place,
    clear: () => {
      if (marker) map.removeChild(marker);
      marker = null;
    },
    center: (point) => map.update?.({ location: { center: [point.lng, point.lat], zoom: 16, duration: 200 } }),
    destroy: () => map.destroy?.(),
  };
};

/** OpenStreetMap through Leaflet: no key, works on any domain. Used when Yandex cannot be used. */
const mountOsm: Mount = async (container, start, onPick) => {
  const leaflet = await import('leaflet');
  const L: any = (leaflet as any).default ?? leaflet;
  await import('leaflet/dist/leaflet.css');
  const centre = start ?? TASHKENT;
  const map = L.map(container, { zoomControl: true }).setView([centre.lat, centre.lng], start ? 16 : 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  // The dialog may still be animating in: make Leaflet measure the container again.
  const resize = window.setTimeout(() => map.invalidateSize(), 150);
  let marker: any = null;
  const place = (point: MapPoint) => {
    if (marker) return marker.setLatLng([point.lat, point.lng]);
    const icon = L.divIcon({ className: '', html: `<div style="${PIN_STYLE}"></div>`, iconSize: [22, 22], iconAnchor: [11, 22] });
    marker = L.marker([point.lat, point.lng], { icon, keyboard: false }).addTo(map);
  };
  map.on('click', (event: { latlng: { lat: number; lng: number } }) => {
    const point = { lat: round(event.latlng.lat), lng: round(event.latlng.lng) };
    place(point);
    onPick(point);
  });
  if (start) place(start);
  return {
    place,
    clear: () => {
      if (marker) marker.remove();
      marker = null;
    },
    center: (point) => map.setView([point.lat, point.lng], Math.max(map.getZoom(), 16)),
    destroy: () => {
      window.clearTimeout(resize);
      map.remove();
    },
  };
};

/**
 * A click-to-place pin on a map. Yandex Maps is used when its key works; otherwise OpenStreetMap, so the HR can always
 * pick the place. It only deals in coordinates (the address text stays what HR types).
 */
export function YandexMapPicker({ point, onChange }: { point: MapPoint | null; onChange: (point: MapPoint | null) => void }) {
  const { t, i18n } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const onChangeRef = useRef(onChange);
  const initial = useRef(point);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(false);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    let mounted: Engine | null = null;
    const host = container.current;
    if (!host) return;
    const pick = (next: MapPoint) => onChangeRef.current(next);
    mountYandex(host, initial.current, pick, i18n.language)
      .catch(() => {
        // Yandex refused (no key, a domain the key does not allow, blocked script): fall back to OpenStreetMap.
        host.replaceChildren();
        return mountOsm(host, initial.current, pick, i18n.language);
      })
      .then((next) => {
        if (cancelled) return next.destroy();
        mounted = next;
        engine.current = next;
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
      mounted?.destroy();
      engine.current = null;
    };
  }, [i18n.language]);

  // A pin set from outside (or cleared) moves with the view.
  useEffect(() => {
    const current = engine.current;
    if (!current) return;
    if (point) {
      current.place(point);
      current.center(point);
    } else {
      current.clear();
    }
  }, [point?.lat, point?.lng, status]);

  /** Puts the pin where the HR is now, using the browser's location (it asks for permission). */
  function locateMe() {
    setLocateError(false);
    if (!navigator.geolocation) {
      setLocateError(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const next = { lat: round(position.coords.latitude), lng: round(position.coords.longitude) };
        engine.current?.place(next);
        engine.current?.center(next);
        onChange(next);
      },
      () => {
        setLocating(false);
        setLocateError(true);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="grid gap-2">
      {status === 'error' && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{t('interviews.mapUnavailable', 'The map is not available right now.')}</p>}
      <div className="relative overflow-hidden rounded-xl border border-slate-200" hidden={status === 'error'}>
        <div ref={container} className="h-[260px] w-full cursor-crosshair bg-slate-100" role="application" aria-label={t('interviews.mapPick', 'Pick the place on the map')} />
        {status === 'loading' && <span className="absolute inset-0 grid place-items-center text-sm text-slate-500">{t('interviews.mapLoading', 'Loading the map…')}</span>}
        {status === 'ready' && (
          <button
            type="button"
            className="absolute right-3 top-3 z-[500] grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-700 shadow-md hover:bg-slate-50 disabled:opacity-60"
            aria-label={t('interviews.mapLocate', 'My location')}
            title={t('interviews.mapLocate', 'My location')}
            disabled={locating}
            onClick={locateMe}
          >
            <LocateFixed size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      {locateError && <p className="text-sm text-red-700">{t('interviews.mapLocateFailed', 'Could not get your location. Allow location access in the browser, or click the map.')}</p>}
      <div className="flex items-center justify-between gap-2 text-sm text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <MapPin size={14} aria-hidden="true" />
          {point ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : t('interviews.mapPickHint', 'Click the map to place a pin')}
        </span>
        {point && (
          <button type="button" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-red-700 hover:bg-red-50" onClick={() => onChange(null)}>
            <X size={14} aria-hidden="true" /> {t('interviews.mapRemovePin', 'Remove pin')}
          </button>
        )}
      </div>
    </div>
  );
}
