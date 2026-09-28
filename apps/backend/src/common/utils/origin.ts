export function isAllowedOrigin(origin: string, configuredOrigin: string, mode: string): boolean {
  if (origin === configuredOrigin) return true;
  if (mode !== 'development') return false;
  try {
    const incoming = new URL(origin);
    const configured = new URL(configuredOrigin);
    const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
    return (
      incoming.origin === origin &&
      configured.origin === configuredOrigin &&
      loopback.has(incoming.hostname) &&
      loopback.has(configured.hostname) &&
      incoming.protocol === configured.protocol &&
      incoming.port === configured.port
    );
  } catch {
    return false;
  }
}
