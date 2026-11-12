// Central API client. JWT values are read from local storage and never logged.
const BASE = '/api/v1';

export function getToken() {
  try { return localStorage.getItem('token'); } catch { return null; }
}
export function setToken(token) {
  try {
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  } catch { /* Storage may be unavailable in restricted browser contexts. */ }
}

function authHeaders(extra = {}) {
  const headers = { ...extra };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = authHeaders({ 'Content-Type': 'application/json' });
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error((data && data.error) || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

export async function downloadFile(path, fallbackFilename = 'download.csv') {
  const res = await fetch(`${BASE}${path}`, { method: 'GET', headers: authHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const error = new Error(data?.error || `Download failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^;"]+)/i);
  const filename = match ? decodeURIComponent(match[1].replace(/^"|"$/g, '')) : fallbackFilename;
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  return { filename, size: blob.size };
}
