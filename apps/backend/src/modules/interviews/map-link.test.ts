import { describe, expect, it } from 'vitest';
import { parseMapLink } from './map-link';

describe('parseMapLink', () => {
  it('reads Google Maps coordinates, preferring the exact place marker', () => {
    expect(parseMapLink('https://www.google.com/maps/place/Ofis/@41.3111,69.2797,17z')).toMatchObject({ lat: 41.3111, lng: 69.2797 });
    expect(parseMapLink('https://www.google.com/maps/place/Ofis/@41.3,69.2,17z/data=!3d41.3111!4d69.2797')).toMatchObject({ lat: 41.3111, lng: 69.2797 });
    expect(parseMapLink('https://maps.google.com/?q=41.3111,69.2797')).toMatchObject({ lat: 41.3111, lng: 69.2797 });
  });

  it('reads Yandex (longitude first), 2GIS and OpenStreetMap links', () => {
    expect(parseMapLink('https://yandex.uz/maps/10335/tashkent/?ll=69.2797%2C41.3111&z=16')).toMatchObject({ lat: 41.3111, lng: 69.2797 });
    expect(parseMapLink('https://yandex.ru/maps/?pt=69.2797,41.3111&z=17')).toMatchObject({ lat: 41.3111, lng: 69.2797 });
    expect(parseMapLink('https://2gis.uz/tashkent?m=69.2797%2C41.3111%2F16')).toMatchObject({ lat: 41.3111, lng: 69.2797 });
    expect(parseMapLink('https://www.openstreetmap.org/?mlat=41.3111&mlon=69.2797')).toMatchObject({ lat: 41.3111, lng: 69.2797 });
    expect(parseMapLink('https://www.openstreetmap.org/#map=17/41.3111/69.2797')).toMatchObject({ lat: 41.3111, lng: 69.2797 });
  });

  it('keeps a short link as a plain link without coordinates', () => {
    expect(parseMapLink('https://maps.app.goo.gl/AbCdEf123')).toEqual({ url: 'https://maps.app.goo.gl/AbCdEf123', lat: null, lng: null });
  });

  it('rejects other hosts, non-https schemes and embedded credentials', () => {
    for (const bad of ['https://evil.example.com/maps?q=41,69', 'http://www.google.com/maps/@41.3,69.2,17z', 'javascript:alert(1)', 'https://user:pw@www.google.com/maps', 'not a url', 'https://google.com.evil.io/maps']) {
      expect(parseMapLink(bad)).toBeNull();
    }
  });

  it('ignores impossible coordinates', () => {
    expect(parseMapLink('https://www.google.com/maps/@141.3,269.2,17z')).toMatchObject({ lat: null, lng: null });
    expect(parseMapLink('https://yandex.uz/maps/?ll=0%2C0')).toMatchObject({ lat: null, lng: null });
  });
});
