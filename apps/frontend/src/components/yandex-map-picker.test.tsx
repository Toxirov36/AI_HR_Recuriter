import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { changeLanguage } from '../i18n';
import { pointFromMapUrl, YandexMapPicker, yandexMapLink } from './yandex-map-picker';

const listeners: Array<{ onClick: (object: unknown, event: { coordinates: [number, number] }) => void }> = [];
const markers: Array<{ props: { coordinates: number[] } }> = [];

function installFakeMaps() {
  class Layer {}
  class YMap {
    children: unknown[] = [];
    addChild(child: unknown) { this.children.push(child); }
    removeChild(child: unknown) { this.children = this.children.filter((item) => item !== child); }
    update() {}
    destroy() {}
  }
  class YMapListener { constructor(props: any) { listeners.push(props); } }
  class YMapMarker {
    props: any;
    constructor(props: any) { this.props = props; markers.push(this as any); }
    update(next: any) { this.props = { ...this.props, ...next }; }
  }
  (window as any).ymaps3 = { ready: Promise.resolve(), YMap, YMapDefaultSchemeLayer: Layer, YMapDefaultFeaturesLayer: Layer, YMapListener, YMapMarker };
}

beforeEach(async () => {
  await changeLanguage('en');
  listeners.length = 0;
  markers.length = 0;
});
afterEach(async () => {
  cleanup();
  vi.unstubAllEnvs();
  delete (window as any).ymaps3;
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

describe('YandexMapPicker', () => {
  it('falls back to a message, without loading anything, when no key is configured', () => {
    vi.stubEnv('VITE_YANDEX_MAPS_KEY', '');
    render(<YandexMapPicker point={null} onChange={vi.fn()} />);
    expect(screen.getByText(/map is not available/i)).toBeInTheDocument();
    expect(document.querySelector('script[src*="api-maps.yandex.ru"]')).toBeNull();
  });

  it('places a pin where the HR clicks and reports the coordinates, and can remove it', async () => {
    vi.stubEnv('VITE_YANDEX_MAPS_KEY', 'test-key');
    installFakeMaps();
    const onChange = vi.fn();
    const { rerender } = render(<YandexMapPicker point={null} onChange={onChange} />);
    await waitFor(() => expect(listeners).toHaveLength(1));
    expect(screen.getByText('Click the map to place a pin')).toBeInTheDocument();

    act(() => listeners[0].onClick({}, { coordinates: [69.279712, 41.311134] }));
    expect(onChange).toHaveBeenCalledWith({ lat: 41.311134, lng: 69.279712 });
    expect(markers).toHaveLength(1);
    expect(markers[0].props.coordinates).toEqual([69.279712, 41.311134]);

    rerender(<YandexMapPicker point={{ lat: 41.311134, lng: 69.279712 }} onChange={onChange} />);
    expect(screen.getByText('41.31113, 69.27971')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Remove pin/ }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('shows the fallback message when the map script cannot load', async () => {
    vi.stubEnv('VITE_YANDEX_MAPS_KEY', 'test-key');
    render(<YandexMapPicker point={null} onChange={vi.fn()} />);
    const script = await waitFor(() => {
      const found = document.querySelector('script[src*="api-maps.yandex.ru"]');
      expect(found).not.toBeNull();
      return found as HTMLScriptElement;
    });
    act(() => script.onerror?.(new Event('error')));
    expect(await screen.findByText(/map is not available/i)).toBeInTheDocument();
  });
});
