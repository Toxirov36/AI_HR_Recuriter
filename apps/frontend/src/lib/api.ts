export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFile = options.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(!isFile && options.body ? { 'Content-Type': 'application/json' } : {}),
      'X-Requested-With': 'recruiter-web',
      ...options.headers,
    },
  });
  const body = await response
    .json()
    .catch(() => ({ message: 'Server unavailable. Please try again.' }));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(
      response.status,
      Array.isArray(body.message) ? body.message.join(' · ') : body.message || 'Request failed',
    );
  }
  if ((options.method ?? 'GET').toUpperCase() !== 'GET') {
    window.dispatchEvent(new Event('workspace-data-mutated'));
  }
  return body as T;
}
export const send = <T>(path: string, data: unknown, method = 'POST') =>
  api<T>(path, { method, body: JSON.stringify(data) });
