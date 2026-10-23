import { useEffect, useRef, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type MapPoint = { lat: number; lng: number };

const TASHKENT: [number, number] = [69.2797, 41.3111];

const mapsKey = () => (import.meta.env.VITE_YANDEX_MAPS_KEY as string | undefined)?.trim() ?? '';

/** The link the picker writes: opens the exact pin on Yandex Maps and carries the coordinates for the candidate message. */
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

let loader: Promise<any> | null = null;

/** Loads the Yandex Maps JS API v3 once. Rejects without a key, or when the script is blocked or rejected. */
function loadYmaps(language: string): Promise<any> {
  const key = mapsKey();
  if (!key) return Promise.reject(new Error('Yandex Maps key is not configured'));
  const existing = (window as any).ymaps3;
  if (existing) return Promise.resolve(existing.ready).then(() => existing);
  loader ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(key)}&lang=${language.startsWith('en') ? 'en_US' : 'ru_RU'}`;
    script.async = true;
    script.onload = () => {
      const api = (window as any).ymaps3;
      if (!api) return reject(new Error('Yandex Maps did not initialise'));
      Promise.resolve(api.ready).then(() => resolve(api), reject);
    };
    script.onerror = () => {
      loader = null;
      script.remove();
      reject(new Error('Yandex Maps could not be loaded'));
    };
    document.head.appendChild(script);
  });
  return loader;
}

/**
 * A click-to-place pin on a Yandex map. It only deals in coordinates (the address text stays what HR types);
 * when the map cannot load, the parent keeps working with the plain link field.
 */
export function YandexMapPicker({ point, onChange }: { point: MapPoint | null; onChange: (point: MapPoint | null) => void }) {
  const { t, i18n } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const state = useRef<{ api: any; map: any; marker: any } | null>(null);
  const onChangeRef = useRef(onChange);
  const initial = useRef(point);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(mapsKey() ? 'loading' : 'error');
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!mapsKey()) return;
    let cancelled = false;
    loadYmaps(i18n.language)
      .then((api) => {
        if (cancelled || !container.current) return;
        const start = initial.current;
        const map = new api.YMap(container.current, { location: { center: start ? [start.lng, start.lat] : TASHKENT, zoom: start ? 16 : 12 } });
        map.addChild(new api.YMapDefaultSchemeLayer({}));
        map.addChild(new api.YMapDefaultFeaturesLayer({}));
        const entry = { api, map, marker: null as any };
        const place = (next: MapPoint) => {
          const coordinates = [next.lng, next.lat];
          if (entry.marker) {
            entry.marker.update({ coordinates });
            return;
          }
          const pin = document.createElement('div');
          pin.className = 'yandex-map-pin';
          pin.setAttribute('aria-hidden', 'true');
          pin.style.cssText = 'width:22px;height:22px;margin:-22px 0 0 -11px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#1a5d4c;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)';
          entry.marker = new api.YMapMarker({ coordinates }, pin);
          map.addChild(entry.marker);
        };
        (entry as any).place = place;
        map.addChild(
          new api.YMapListener({
            layer: 'any',
            onClick: (_object: unknown, event: { coordinates: [number, number] }) => {
              const [lng, lat] = event.coordinates;
              const next = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
              place(next);
              onChangeRef.current(next);
            },
          }),
        );
        if (start) place(start);
        state.current = entry;
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
      state.current?.map?.destroy?.();
      state.current = null;
    };
  }, [i18n.language]);

  // A link pasted into the field moves (or clears) the pin.
  useEffect(() => {
    const entry = state.current as any;
    if (!entry) return;
    if (point) {
      entry.place?.(point);
      entry.map.update?.({ location: { center: [point.lng, point.lat], duration: 200 } });
    } else if (entry.marker) {
      entry.map.removeChild(entry.marker);
      entry.marker = null;
    }
  }, [point?.lat, point?.lng, status]);

  if (status === 'error') {
    return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{t('interviews.mapUnavailable', 'The map is not available right now. Paste a map link below instead.')}</p>;
  }
  return (
    <div className="grid gap-2">
      <div className="relative overflow-hidden rounded-xl border border-slate-200">
        <div ref={container} className="h-[240px] w-full cursor-crosshair bg-slate-100" role="application" aria-label={t('interviews.mapPick', 'Pick the place on the map')} />
        {status === 'loading' && <span className="absolute inset-0 grid place-items-center text-sm text-slate-500">{t('interviews.mapLoading', 'Loading the map…')}</span>}
      </div>
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
