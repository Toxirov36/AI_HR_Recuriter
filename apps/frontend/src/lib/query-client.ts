import { useEffect, useState } from 'react';
import { api } from './api';

const CACHE_TTL = 30_000;
const cache = new Map<string, { data: unknown; fetchedAt: number }>();
const pending = new Map<string, Promise<unknown>>();

export function clearDataCache(path?: string) {
  if (path) cache.delete(path);
  else cache.clear();
}

export async function prefetchData<T>(path: string): Promise<T> {
  const cached = cache.get(path);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.data as T;

  const activeRequest = pending.get(path);
  if (activeRequest) return activeRequest as Promise<T>;

  const request = api<T>(path)
    .then((data) => {
      cache.set(path, { data, fetchedAt: Date.now() });
      return data;
    })
    .finally(() => pending.delete(path));
  pending.set(path, request);
  return request;
}

if (typeof window !== 'undefined') {
  window.addEventListener('workspace-data-mutated', () => clearDataCache());
}

export function useData<T>(path: string) {
  const [data, setData] = useState<T | undefined>(() => cache.get(path)?.data as T | undefined);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    const cached = cache.get(path);
    setData(cached?.data as T | undefined);
    prefetchData<T>(path)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [path, version]);
  return {
    data,
    error,
    reload: () => {
      clearDataCache(path);
      setVersion((v) => v + 1);
    },
  };
}
