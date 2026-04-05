// In production (Vercel), VITE_API_URL points to the Render backend.
// In development, Vite proxy forwards /api → localhost:8080.
const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

async function request(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const searchStocks = (query) =>
  request(`${BASE}/search?q=${encodeURIComponent(query)}`);

export const getQuote = (symbol) =>
  request(`${BASE}/quote/${encodeURIComponent(symbol)}`);

export const getQuotes = (symbols) =>
  request(`${BASE}/quotes?symbols=${symbols.map(encodeURIComponent).join(',')}`);

export const getHistory = (symbol, period = '1y') =>
  request(`${BASE}/history/${encodeURIComponent(symbol)}?period=${period}`);

export const getSummary = (symbol) =>
  request(`${BASE}/summary/${encodeURIComponent(symbol)}`);

export const chatWithAgent = (messages) =>
  request(`${BASE}/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
