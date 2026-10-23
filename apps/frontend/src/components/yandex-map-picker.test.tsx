import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { changeLanguage } from '../i18n';
import { pointFromMapUrl, YandexMapPicker, yandexMapLink } from './yandex-map-picker';

const osm = vi.hoisted(() => ({ created: 0, fail: false, onClick: null as null | ((event: { latlng: { lat: number; lng: number } }) => void), markers: [] as any[] }));
vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet', () => {
  const L = {
    map: () => {
      if (osm.fail) throw new Error('osm down');
      osm.created += 1;
      const map: any = {};
      map.setView = () => map;
      map.on = (_event: string, handler: any) => { osm.onClick = handler; };
      map.invalidateSize = () => {};
      map.getZoom = () => 12;
      map.remove = () => {};
      return map;
    },
    tileLayer: () => ({ addTo: () => undefined }),
    divIcon: (options: unknown) => options,
    marker: (latlng: [number, number]) => {
      const marker: any = { latlng, addTo: () => { osm.markers.push(marker); return marker; }, setLatLng: (next: [number, number]) => { marker.latlng = next; }, remove: () => {} };
      return marker;
    },
  };
  return { default: L };
});

const yandexClicks: Array<{ onClick: (object: unknown, event: { coordinates: [number, number] }) => void }> = [];
function installFakeYandex() {
  class Layer {}
  class YMap { addChild() {} removeChild() {} update() {} destroy() {} }
  class YMapListener { constructor(props: any) { yandexClicks.push(props); } }
  class YMapMarker { constructor(public props: any) {} update() {} }
  (window as any).ymaps3 = { ready: Promise.resolve(), YMap, YMapDefaultSchemeLayer: Layer, YMapDefaultFeaturesLayer: Layer, YMapListener, YMapMarker };
}

beforeEach(async () => {
  await changeLanguage('en');
  yandexClicks.length = 0;
  osm.created = 0;
  osm.fail = false;
  osm.onClick = null;
  osm.markers.length = 0;
});
afterEach(async () => {
  cleanup();
  vi.unstubAllEnvs();
  delete (window as any).ymaps3;
  document.querySelectorAll('script[src*="api-maps.yandex.ru"]').forEach((script) => script.remove());
  await changeLanguage('uz');
});

describe('map link helpers', () => {
  it('round-trips a pin through the link it writes', () => {
    const link = yandexMapLink({ lat: 41.3111, lng: 69.2797 });
    expect(link).toContain('yandex.uz/maps');
    expect(pointFromMapUrl(link)).toEqual({ lat: 41.3111, lng: 69.2797 });
  });

  it('gives no pin for other sites, broken links or impossible coordinates', () => {
    expect(pointFromMapUrl('https://www.google.com/maps/@41.3,69.2,17z')).toBeNull();
    expect(pointFromMapUrl('not a url')).toBeNull();
    expect(pointFromMapUrl('https://yandex.uz/maps/?pt=500,500')).toBeNull();
    expect(pointFromMapUrl('')).toBeNull();
  });
});

describe('map picker', () => {
  it('uses OpenStreetMap, without touching Yandex, when no Yandex key is configured', async () => {
    vi.stubEnv('VITE_YANDEX_MAPS_KEY', '');
    const onChange = vi.fn();
    render(<YandexMapPicker point={null} onChange={onChange} />);
    await waitFor(() => expect(osm.onClick).not.toBeNull());
    expect(document.querySelector('script[src*="api-maps.yandex.ru"]')).toBeNull();
    act(() => osm.onClick!({ latlng: { lat: 41.311134, lng: 69.279712 } }));
    expect(onChange).toHaveBeenCalledWith({ lat: 41.311134, lng: 69.279712 });
    expect(osm.markers).toHaveLength(1);
  });

  it('uses Yandex when it works: a click places a pin and reports the coordinates, which can be removed', async () => {
    vi.stubEnv('VITE_YANDEX_MAPS_KEY', 'test-key');
    installFakeYandex();
    const onChange = vi.fn();
    const { rerender } = render(<YandexMapPicker point={null} onChange={onChange} />);
    await waitFor(() => expect(yandexClicks).toHaveLength(1));
    expect(osm.created).toBe(0);
    expect(screen.getByText('Click the map to place a pin')).toBeInTheDocument();

    act(() => yandexClicks[0].onClick({}, { coordinates: [69.279712, 41.311134] }));
    expect(onChange).toHaveBeenCalledWith({ lat: 41.311134, lng: 69.279712 });

    rerender(<YandexMapPicker point={{ lat: 41.311134, lng: 69.279712 }} onChange={onChange} />);
    expect(screen.getByText('41.31113, 69.27971')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Remove pin/ }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('falls back to OpenStreetMap when the Yandex script is refused (wrong domain or key)', async () => {
    vi.stubEnv('VITE_YANDEX_MAPS_KEY', 'test-key');
    render(<YandexMapPicker point={null} onChange={vi.fn()} />);
    const script = await waitFor(() => {
      const found = document.querySelector('script[src*="api-maps.yandex.ru"]');
      expect(found).not.toBeNull();
      return found as HTMLScriptElement;
    });
    act(() => script.onerror?.(new Event('error')));
    await waitFor(() => expect(osm.created).toBe(1));
  });

  it('says so only when no map can be shown at all', async () => {
    vi.stubEnv('VITE_YANDEX_MAPS_KEY', '');
    osm.fail = true;
    render(<YandexMapPicker point={null} onChange={vi.fn()} />);
    expect(await screen.findByText(/map is not available/i)).toBeInTheDocument();
  });
});

describe('my location button', () => {
  const stubGeolocation = (impl: (ok: (position: unknown) => void, fail: () => void) => void) =>
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: vi.fn(impl) } });
  afterEach(() => Reflect.deleteProperty(navigator, 'geolocation'));

  it('puts the pin where the HR is and reports the coordinates', async () => {
    vi.stubEnv('VITE_YANDEX_MAPS_KEY', '');
    stubGeolocation((ok) => ok({ coords: { latitude: 41.2666371, longitude: 69.2607512 } }));
    const onChange = vi.fn();
    render(<YandexMapPicker point={null} onChange={onChange} />);
    fireEvent.click(await screen.findByRole('button', { name: 'My location' }));
    expect(onChange).toHaveBeenCalledWith({ lat: 41.266637, lng: 69.260751 });
    expect(osm.markers).toHaveLength(1);
  });

  it('explains what to do when the location is refused, and leaves the map usable', async () => {
    vi.stubEnv('VITE_YANDEX_MAPS_KEY', '');
    stubGeolocation((_ok, fail) => fail());
    const onChange = vi.fn();
    render(<YandexMapPicker point={null} onChange={onChange} />);
    fireEvent.click(await screen.findByRole('button', { name: 'My location' }));
    expect(await screen.findByText(/Could not get your location/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    act(() => osm.onClick!({ latlng: { lat: 41.3, lng: 69.2 } }));
    expect(onChange).toHaveBeenCalledWith({ lat: 41.3, lng: 69.2 });
  });
});
