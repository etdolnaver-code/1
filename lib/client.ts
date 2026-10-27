export async function api<T = Record<string, unknown>>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/' + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      cache: 'no-store',
    });
  } catch {
    throw new Error('서버에 연결하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.');
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : response.status >= 500
          ? '서버가 요청을 처리하지 못했습니다. 관리자에게 문의해 주세요.'
          : '요청을 처리하지 못했습니다. 다시 시도해 주세요.';
    throw new Error(message);
  }
  if (data === null) throw new Error('서버 응답을 확인하지 못했습니다. 다시 시도해 주세요.');
  return data as T;
}
export const send = (data: unknown, method = 'POST') => ({ method, body: JSON.stringify(data) });
