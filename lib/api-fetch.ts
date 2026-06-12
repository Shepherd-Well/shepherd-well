// Client-side fetch helper.
// Automatically injects the x-selected-church-id header when a master admin is
// impersonating a church. Falls through unchanged on the server (no localStorage).

export function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (typeof window === 'undefined') return fetch(url, init);

  const selectedChurchId = localStorage.getItem('selected_church_id');
  if (!selectedChurchId) return fetch(url, init);

  const headers = new Headers(init.headers ?? {});
  headers.set('x-selected-church-id', selectedChurchId);

  return fetch(url, { ...init, headers });
}
