// ── Number / currency formatters ───────────────────────────────────────────

export function formatPrice(price, currency = 'USD') {
  if (price == null || isNaN(price)) return 'N/A';
  const noDecimals = ['JPY', 'KRW', 'IDR', 'VND', 'CLP', 'HUF'];
  const opts = {
    style: 'currency',
    currency,
    minimumFractionDigits: noDecimals.includes(currency) ? 0 : 2,
    maximumFractionDigits: noDecimals.includes(currency) ? 0 : 2,
  };
  try {
    return new Intl.NumberFormat('en-US', opts).format(price);
  } catch {
    return `${price.toFixed(2)}`;
  }
}

export function formatChange(change, changePercent) {
  if (change == null) return { text: 'N/A', positive: null };
  const sign = change >= 0 ? '+' : '';
  const pct  = changePercent != null ? ` (${sign}${changePercent.toFixed(2)}%)` : '';
  return {
    text:     `${sign}${change.toFixed(2)}${pct}`,
    positive: change >= 0,
  };
}

export function formatMarketCap(val) {
  if (!val) return 'N/A';
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9)  return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6)  return `$${(val / 1e6).toFixed(2)}M`;
  return `$${val.toLocaleString()}`;
}

export function formatVolume(val) {
  if (!val) return 'N/A';
  if (val >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(1)}K`;
  return val.toString();
}

export function formatPercent(val) {
  if (val == null) return 'N/A';
  const sign = val >= 0 ? '+' : '';
  return `${sign}${(val * 100).toFixed(2)}%`;
}

export function formatDate(dateInput, period = '1y') {
  const d = new Date(dateInput);
  if (period === '5y') {
    return d.toLocaleDateString('en-US', { year: '2-digit', month: 'short' });
  }
  if (['1w', '1m'].includes(period)) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function shortSymbol(symbol = '') {
  // Strip exchange suffix for display (e.g. "SHEL.L" → "SHEL")
  return symbol.split('.')[0];
}
