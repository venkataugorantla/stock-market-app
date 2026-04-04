const BASE = '/api';

async function request(url) {
  const res = await fetch(url);
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
