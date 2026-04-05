import express from 'express';
import cors from 'cors';
import https from 'https';
import { fileURLToPath } from 'url';
import path from 'path';

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

// Lazy init: refresh crumb once on first API request (works in both Express and Vercel serverless)
let _authInitialized = false;
function ensureAuth() {
  if (!_authInitialized) {
    _authInitialized = true;
    refreshYFAuth().catch(() => {});
    // Only schedule interval in long-lived processes (skipped in serverless)
    if (!process.env.VERCEL) {
      setInterval(() => refreshYFAuth().catch(() => {}), 25 * 60 * 1000);
    }
  }
}
app.use((_req, _res, next) => { ensureAuth(); next(); });

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

// Allow localhost (dev), GitHub Pages, and any Vercel deployment URL (production)
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'https://venkataugorantla.github.io',
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

// ─── Stock Agent helpers ──────────────────────────────────────────────────────
const AGENT_STOP_WORDS = new Set([
  'A','I','IN','IS','IT','OF','ON','OR','TO','UP','US','BE','BY','GO','IF','NO',
  'AS','AT','DO','AN','AM','ME','MY','SO','WE','HE','OK','THE','AND','FOR','ARE',
  'BUT','NOT','YOU','ALL','CAN','HER','WAS','ONE','OUR','OUT','DAY','GET','HAS',
  'HIM','HIS','HOW','ITS','NEW','NOW','OLD','SEE','TWO','WAY','WHO','DID','GOT',
  'LET','PUT','SAY','SHE','TOO','USE','BAD','BIG','WITH','HAVE','FROM','THAT',
  'THIS','WILL','YOUR','THEY','BEEN','GOOD','MUCH','SOME','TIME','VERY','WHEN',
  'WHAT','JUST','INTO','YEAR','ALSO','BACK','COME','GIVE','MOST','OVER','SAME',
  'TAKE','THAN','THEM','THEN','WELL','WENT','WERE','SAID','EACH','LONG','MADE',
  'MAKE','MANY','NEED','NEXT','ONLY','OPEN','PART','TELL','USED','WANT','HIGH',
  'HOLD','KEEP','LAST','LOOK','SHOW','SUCH','TURN','BEST','BOTH','DOWN','EVEN',
  'EVER','FIND','FOUR','FREE','HELP','LIKE','MOVE','PLAY','REAL','SELL','STOP',
  'AREA','BOOK','CASE','CITY','FACE','FACT','GAVE','GOES','GONE','HALF','HAND',
  'HARD','HEAD','HOME','IDEA','LATE','LEAD','LEFT','LESS','LIFE','LIVE','ONCE',
  'PLAN','ROAD','ROOM','RULE','SIDE','SOON','STAY','TALK','THUS','TOLD','TOOK',
  'TREE','TRUE','UNIT','WAIT','WALK','WEEK','WIDE','WIND','WORD','WORK','ABLE',
  'AFTER','AGAIN','ALONG','ASKED','BEGAN','BELOW','BRING','BUILT','CHECK','CLOSE',
  'COULD','DAILY','EARLY','EVERY','FIRST','FOUND','GIVEN','GOING','GREAT','GROUP',
  'HANDS','HEARD','HENCE','HUMAN','LARGE','LATER','LEARN','LEAST','LIGHT','MIGHT',
  'MONEY','NEVER','OFTEN','OTHER','PLACE','POINT','PRICE','QUITE','RANGE','RATIO',
  'RIGHT','ROUND','SHALL','SHORT','SINCE','SMALL','STILL','STOCK','THERE','THING',
  'THINK','THOSE','THREE','TODAY','TOTAL','TRADE','UNDER','UNTIL','USING','VALUE',
  'WATCH','WEEKS','WHILE','WHITE','WHOLE','WHOSE','WORLD','WOULD','WRITE','YEARS',
  'YIELD','ABOUT','ABOVE','AVOID','BASED','BONDS','BROAD','CHART','CLEAR','ENTRY',
  'EQUAL','FOCUS','FORCE','INDEX','ISSUE','LEVEL','LIMIT','LOCAL','LOWER','MAJOR',
  'MAKER','MATCH','MEANS','MIXED','MODEL','MONTH','MOVED','NAMED','NOTED','ORDER',
  'PAPER','PARTY','PRIOR','PROVE','RAPID','READY','REFER','SOLID','SPACE','STAND',
  'START','STATE','SURGE','THEIR','WHERE','WHICH','BUY','RATE','CASH','FUND',
  'BOND','RISK','GAIN','LOSS','BULL','BEAR','CALL','PUTS','CALLS','PIVOT','ETF',
  'NYSE','NASDAQ','AMEX','OTC','ADR','IPO','CEO','CFO','CTO','ROE','EPS','PE',
  'INFO','DATA','MORE','NEXT','LAST','SHOW','GIVE','TELL','WHAT','DOES','WHEN',
  'DOES','THAN','THAT',
]);

function extractSymbols(text) {
  const found = new Set();
  // Priority 1: $TICKER patterns (most reliable signal)
  for (const m of text.matchAll(/\$([A-Za-z]{1,5})\b/g)) {
    found.add(m[1].toUpperCase());
  }
  // Priority 2: uppercase 2-5 char words not in the stop list
  for (const m of text.matchAll(/\b([A-Z]{2,5})\b/g)) {
    if (!AGENT_STOP_WORDS.has(m[1])) found.add(m[1]);
  }
  return [...found].slice(0, 5);
}

async function fetchQuoteForAgent(symbol) {
  const cached = fromCache(`quote:${symbol}`);
  if (cached) return cached;
  const yPath = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const data  = await withConcurrency(() => withRetry(() => yfGetJson(yPath)));
  const quote = parseChartQuote(data);
  toCache(`quote:${symbol}`, quote, CACHE_TTL.quote);
  return quote;
}

async function fetchSummaryForAgent(symbol) {
  const cached = fromCache(`summary:${symbol}`);
  if (cached) return cached;
  const crumbPart = _yfCrumb ? `&crumb=${encodeURIComponent(_yfCrumb)}` : '';
  const yPath = `/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail,financialData${crumbPart}`;
  const data  = await withConcurrency(() => withRetry(() => yfGetJson(yPath)));
  const result = data?.quoteSummary?.result?.[0] ?? {};
  function flatten(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if ('raw' in obj) return obj.raw;
    const out = {};
    for (const k of Object.keys(obj)) out[k] = flatten(obj[k]);
    return out;
  }
  const summary = {
    summaryDetail: flatten(result.summaryDetail) || {},
    financialData: flatten(result.financialData) || {},
  };
  toCache(`summary:${symbol}`, summary, CACHE_TTL.summary);
  return summary;
}

function fmtNum(n, decimals = 2) {
  if (n == null || n === '') return 'N/A';
  const num = Number(n);
  if (isNaN(num)) return 'N/A';
  if (Math.abs(num) >= 1e12) return `$${(num / 1e12).toFixed(1)}T`;
  if (Math.abs(num) >= 1e9)  return `$${(num / 1e9).toFixed(1)}B`;
  if (Math.abs(num) >= 1e6)  return `$${(num / 1e6).toFixed(1)}M`;
  return num.toFixed(decimals);
}

function buildStockContext(symbol, quote, summary) {
  const lines = [`### ${symbol} — ${quote.longName || symbol}`];
  lines.push(`Exchange: ${quote.fullExchangeName || 'N/A'} | Currency: ${quote.currency}`);
  lines.push(`Price: ${fmtNum(quote.regularMarketPrice)} | Change: ${fmtNum(quote.regularMarketChange)} (${fmtNum(quote.regularMarketChangePercent)}%)`);
  lines.push(`Open: ${fmtNum(quote.regularMarketOpen)} | High: ${fmtNum(quote.regularMarketDayHigh)} | Low: ${fmtNum(quote.regularMarketDayLow)}`);
  lines.push(`Volume: ${fmtNum(quote.regularMarketVolume, 0)} | 52W High: ${fmtNum(quote.fiftyTwoWeekHigh)} | 52W Low: ${fmtNum(quote.fiftyTwoWeekLow)}`);
  const sd = summary?.summaryDetail || {};
  const fd = summary?.financialData  || {};
  if (sd.marketCap)      lines.push(`Market Cap: ${fmtNum(sd.marketCap)}`);
  if (sd.trailingPE)     lines.push(`P/E (trailing): ${fmtNum(sd.trailingPE, 1)}`);
  if (sd.forwardPE)      lines.push(`P/E (forward): ${fmtNum(sd.forwardPE, 1)}`);
  if (sd.dividendYield)  lines.push(`Dividend Yield: ${(sd.dividendYield * 100).toFixed(2)}%`);
  if (sd.beta)           lines.push(`Beta: ${fmtNum(sd.beta, 2)}`);
  if (fd.revenueGrowth)  lines.push(`Revenue Growth YoY: ${(fd.revenueGrowth * 100).toFixed(1)}%`);
  if (fd.grossMargins)   lines.push(`Gross Margin: ${(fd.grossMargins * 100).toFixed(1)}%`);
  if (fd.returnOnEquity) lines.push(`ROE: ${(fd.returnOnEquity * 100).toFixed(1)}%`);
  if (fd.totalDebt && fd.totalCash) lines.push(`Debt: ${fmtNum(fd.totalDebt)} | Cash: ${fmtNum(fd.totalCash)}`);
  if (fd.recommendationKey)  lines.push(`Analyst Consensus: ${fd.recommendationKey.toUpperCase()}`);
  if (fd.targetMeanPrice)    lines.push(`Analyst Target Price: ${fmtNum(fd.targetMeanPrice)}`);
  if (fd.numberOfAnalystOpinions) lines.push(`Analyst Count: ${fd.numberOfAnalystOpinions}`);
  return lines.join('\n');
}

async function callGroqAPI(messages) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured. Add it at https://vercel.com/dashboard → Project → Settings → Environment Variables.');
  }
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model:      'llama-3.3-70b-versatile',
      messages,
      max_tokens: 1024,
      temperature: 0.3,
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Groq API error ${resp.status}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? 'No response generated.';
}

// ─── POST /api/agent ──────────────────────────────────────────────────────────
app.post('/api/agent', async (req, res) => {
  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // Extract stock symbols from recent context
  const recentText = messages.slice(-4).map(m => m.content).join(' ');
  const symbols    = extractSymbols(recentText);

  // Fetch live data for detected symbols (parallel, fail silently per symbol)
  let stockContext = '';
  if (symbols.length > 0) {
    const results = await Promise.allSettled(
      symbols.map(async (sym) => {
        const [quoteRes, summaryRes] = await Promise.allSettled([
          fetchQuoteForAgent(sym),
          fetchSummaryForAgent(sym),
        ]);
        if (quoteRes.status !== 'fulfilled') return null;
        return buildStockContext(sym, quoteRes.value, summaryRes.value ?? {});
      })
    );
    stockContext = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value)
      .join('\n\n');
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const systemPrompt = [
    `You are StockSense AI, an expert stock market analyst with deep knowledge of global financial markets, technical analysis, and fundamental analysis. You help investors make clear, data-driven decisions.`,
    `Today is ${today}.`,
    stockContext
      ? `## Real-Time Market Data (fetched live)\n\n${stockContext}`
      : 'No specific ticker was detected. Provide general, helpful financial guidance.',
    `## Your Instructions`,
    `- Base your analysis on the live data provided above`,
    `- Cite specific numbers: prices, ratios, percentage changes`,
    `- Identify key signals: trend direction, momentum, valuation vs. peers`,
    `- Give concrete next steps: entry zone, price target, stop-loss, or hold/avoid reasoning`,
    `- Use **bold** for key figures and action items`,
    `- Use markdown: ## headers, bullet lists, **bold**`,
    `- Keep responses focused (under 400 words unless deep analysis is requested)`,
    `- End every response with a one-line risk disclaimer in italics`,
    `⚠ This is for educational purposes. Always consult a licensed financial advisor before investing.`,
  ].join('\n\n');

  try {
    const content = await callGroqAPI([
      { role: 'system', content: systemPrompt },
      ...messages,
    ]);
    res.json({ content });
  } catch (err) {
    console.error('[agent]', err.message);
    const isConfig = err.message.includes('GROQ_API_KEY');
    res.status(isConfig ? 503 : 502).json({ error: err.message });
  }
});

// In local dev (not Vercel), serve the React build and start listening
if (!process.env.VERCEL) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath  = path.join(__dirname, '../client/dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  app.listen(PORT, () => console.log(`\n✅  Stock Market App   →  http://localhost:${PORT}\n`));
}

export default app;
