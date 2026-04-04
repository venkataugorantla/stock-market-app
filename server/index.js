import express from 'express';
import cors from 'cors';
import https from 'https';

const app  = express();
const PORT = process.env.PORT || 8080;

// ─── Yahoo Finance HTTP/1.1 client ────────────────────────────────────────────
// Uses Node.js native https (HTTP/1.1) — avoids Yahoo Finance's HTTP/2 rate-limiting
const YF_UA   = 'Mozilla/5.0';
const YF_HOST = 'query1.finance.yahoo.com';

let _yfCookies = '';
let _yfCrumb   = '';

function httpsGet(hostname, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      { hostname, path, headers },
      (res) => {
        // Capture Set-Cookie if present
        const sc = res.headers['set-cookie'];
        if (sc) resolve._cookies = sc;
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, body, headers: res.headers });
          } else {
            reject(new Error(`YF HTTP ${res.statusCode}: ${hostname}${path}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(20_000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

async function yfGetJson(path, extraHeaders = {}) {
  const headers = {
    'User-Agent':      YF_UA,
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer':         'https://finance.yahoo.com/',
    ...extraHeaders,
  };
  if (_yfCookies) headers['Cookie'] = _yfCookies;
  const { body } = await httpsGet(YF_HOST, path, headers);
  return JSON.parse(body);
}

async function refreshYFAuth() {
  try {
    // Use the lightweight getcrumb endpoint (no heavy HTML page load that triggers 429)
    const crumbRes = await httpsGet('query2.finance.yahoo.com', '/v1/test/getcrumb', {
      'User-Agent':      YF_UA,
      'Accept':          'text/plain,application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer':         'https://finance.yahoo.com/',
    });
    const crumb = crumbRes.body.trim();
    if (crumb && crumb.length > 2 && !crumb.startsWith('<')) {
      // Only keep cookies if we got a valid crumb
      const sc = crumbRes.headers['set-cookie'];
      if (sc) _yfCookies = sc.map(c => c.split(';')[0]).join('; ');
      _yfCrumb = crumb;
      console.log('YF auth refreshed, crumb:', _yfCrumb);
    } else {
      console.warn('YF: getcrumb returned unexpected response (summary endpoint unavailable)');
    }
  } catch (e) {
    console.warn('YF auth refresh failed:', e.message);
  }
}

// Crumb is optional — only needed by /api/summary. Attempt lazily after a delay.
setTimeout(() => refreshYFAuth().catch(() => {}), 10_000);
setInterval(() => refreshYFAuth().catch(() => {}), 25 * 60 * 1000);

// ─── Parse v8/finance/chart response into a quote-like object ─────────────────
function parseChartQuote(data) {
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('No chart result');
  const meta = result.meta;
  const prev = meta.chartPreviousClose ?? meta.previousClose;
  const price = meta.regularMarketPrice;
  return {
    symbol:                       meta.symbol,
    longName:                     meta.longName  || meta.shortName || meta.symbol,
    shortName:                    meta.shortName || meta.longName  || meta.symbol,
    currency:                     meta.currency  || 'USD',
    fullExchangeName:             meta.fullExchangeName,
    exchangeName:                 meta.exchangeName,
    instrumentType:               meta.instrumentType,
    regularMarketPrice:           price,
    regularMarketOpen:            meta.regularMarketOpen,
    regularMarketDayHigh:         meta.regularMarketDayHigh,
    regularMarketDayLow:          meta.regularMarketDayLow,
    regularMarketVolume:          meta.regularMarketVolume,
    regularMarketPreviousClose:   prev,
    regularMarketChange:          price != null && prev != null ? price - prev : null,
    regularMarketChangePercent:   price != null && prev != null ? ((price - prev) / prev) * 100 : null,
    fiftyTwoWeekHigh:             meta.fiftyTwoWeekHigh,
    fiftyTwoWeekLow:              meta.fiftyTwoWeekLow,
    marketState:                  meta.marketState || 'CLOSED',
  };
}

// ─── Parse v8 chart historical rows ──────────────────────────────────────────
function parseChartHistory(data) {
  const result = data?.chart?.result?.[0];
  if (!result) return [];
  const ts    = result.timestamp ?? [];
  const ohlcv = result.indicators?.quote?.[0] ?? {};
  return ts.map((t, i) => ({
    date:   new Date(t * 1000).toISOString().split('T')[0],
    open:   ohlcv.open?.[i]   ?? null,
    high:   ohlcv.high?.[i]   ?? null,
    low:    ohlcv.low?.[i]    ?? null,
    close:  ohlcv.close?.[i]  ?? null,
    volume: ohlcv.volume?.[i] ?? null,
  })).filter(r => r.close != null);
}

// Allow localhost (dev) and any Vercel deployment URL (production)
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  /^https:\/\/.*\.vercel\.app$/,
];
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// ─── In-memory cache ────────────────────────────────────────────────────────
const cache = new Map();

const CACHE_TTL = {
  quote:   30 * 1000,
  history: 5  * 60 * 1000,
  search:  2  * 60 * 1000,
  summary: 10 * 60 * 1000,
};

function fromCache(key) {
  const item = cache.get(key);
  if (item && Date.now() < item.expiry) return item.data;
  cache.delete(key);
  return null;
}

function toCache(key, data, ttlMs) {
  cache.set(key, { data, expiry: Date.now() + ttlMs });
}

async function withRetry(fn, attempts = 2) {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise(r => setTimeout(r, 1200 * (i + 1)));
    }
  }
}

// ─── Simple concurrency limiter for Yahoo Finance (max 3 concurrent) ─────────
let _inflight = 0;
const _waitQueue = [];

function withConcurrency(fn) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      _inflight++;
      try { resolve(await fn()); }
      catch (e) { reject(e); }
      finally {
        _inflight--;
        if (_waitQueue.length) _waitQueue.shift()();
      }
    };
    if (_inflight < 3) run();
    else _waitQueue.push(run);
  });
}

// ─── GET /api/health ──────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// ─── GET /api/search?q=<query> ────────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Query parameter "q" is required.' });

  const key = `search:${q.toLowerCase()}`;
  const cached = fromCache(key);
  if (cached) return res.json(cached);

  try {
    const path = `/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&enableFuzzyQuery=true`;
    const data = await withConcurrency(() => withRetry(() => yfGetJson(path)));
    toCache(key, data, CACHE_TTL.search);
    res.json(data);
  } catch (err) {
    console.error('[search]', err.message);
    res.status(502).json({ error: 'Failed to fetch search results.' });
  }
});

// ─── GET /api/quote/:symbol ───────────────────────────────────────────────────
app.get('/api/quote/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const key    = `quote:${symbol}`;
  const cached = fromCache(key);
  if (cached) return res.json(cached);

  try {
    const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const data = await withConcurrency(() => withRetry(() => yfGetJson(path)));
    const quote = parseChartQuote(data);
    toCache(key, quote, CACHE_TTL.quote);
    res.json(quote);
  } catch (err) {
    console.error('[quote]', symbol, err.message);
    res.status(502).json({ error: `Failed to fetch quote for ${symbol}.` });
  }
});

// ─── GET /api/quotes?symbols=AAPL,MSFT,… ─────────────────────────────────────
app.get('/api/quotes', async (req, res) => {
  const raw = (req.query.symbols || '').trim();
  if (!raw) return res.status(400).json({ error: 'Parameter "symbols" is required.' });

  const symbols = [...new Set(raw.split(',').map(s => s.trim().toUpperCase()))].slice(0, 25);

  const results = await Promise.allSettled(
    symbols.map(sym => {
      const cached = fromCache(`quote:${sym}`);
      if (cached) return Promise.resolve(cached);
      const path = `/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
      return withConcurrency(() => withRetry(() => yfGetJson(path)))
        .then(data => {
          const quote = parseChartQuote(data);
          toCache(`quote:${sym}`, quote, CACHE_TTL.quote);
          return quote;
        });
    })
  );

  const quotes = results
    .map((r, i) => (r.status === 'fulfilled' ? r.value : { symbol: symbols[i], fetchError: true }))
    .filter(q => q && !q.fetchError);

  res.json(quotes);
});

// ─── GET /api/history/:symbol?period=1y ──────────────────────────────────────
app.get('/api/history/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const period = req.query.period || '1y';

  const key    = `history:${symbol}:${period}`;
  const cached = fromCache(key);
  if (cached) return res.json(cached);

  const rangeMap = {
    '1w': { range: '5d',  interval: '1d'  },
    '1m': { range: '1mo', interval: '1d'  },
    '3m': { range: '3mo', interval: '1d'  },
    '6m': { range: '6mo', interval: '1d'  },
    '1y': { range: '1y',  interval: '1d'  },
    '5y': { range: '5y',  interval: '1wk' },
  };

  const { range, interval } = rangeMap[period] || rangeMap['1y'];

  try {
    const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    const data = await withConcurrency(() => withRetry(() => yfGetJson(path)));
    const history = parseChartHistory(data);
    toCache(key, history, CACHE_TTL.history);
    res.json(history);
  } catch (err) {
    console.error('[history]', symbol, err.message);
    res.status(502).json({ error: `Failed to fetch history for ${symbol}.` });
  }
});

// ─── GET /api/summary/:symbol ─────────────────────────────────────────────────
app.get('/api/summary/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const key    = `summary:${symbol}`;
  const cached = fromCache(key);
  if (cached) return res.json(cached);

  try {
    const crumbPart = _yfCrumb ? `&crumb=${encodeURIComponent(_yfCrumb)}` : '';
    const path = `/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail,assetProfile,financialData${crumbPart}`;
    const data = await withConcurrency(() => withRetry(() => yfGetJson(path)));
    const result = data?.quoteSummary?.result?.[0] ?? {};

    // Flatten nested {raw, fmt} value objects from Yahoo Finance
    function flatten(obj) {
      if (!obj || typeof obj !== 'object') return obj;
      if ('raw' in obj) return obj.raw;
      const out = {};
      for (const k of Object.keys(obj)) out[k] = flatten(obj[k]);
      return out;
    }

    const summary = {
      summaryDetail: flatten(result.summaryDetail) || {},
      assetProfile:  flatten(result.assetProfile)  || {},
      financialData: flatten(result.financialData) || {},
    };

    toCache(key, summary, CACHE_TTL.summary);
    res.json(summary);
  } catch (err) {
    console.error('[summary]', symbol, err.message);
    res.json({});   // Return empty so client still renders quote data
  }
});

app.listen(PORT, () => {
  console.log(`\n✅  Stock Market API   →  http://localhost:${PORT}\n`);
});
