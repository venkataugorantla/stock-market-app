# Global Stock Market App

A real-time interactive stock market web application that tracks live prices, historical charts, company fundamentals, and includes **StockSense AI** — an intelligent stock analyst agent powered by Llama 3.3 70B with live market data context.

**Live URL:** https://venkataugorantla.github.io/stock-market-app/

---

## Features

### Market Data
- **Real-time stock prices** — live quotes with price change and percentage
- **Historical price charts** — interactive line charts (1D, 1W, 1M, 3M, 1Y)
- **Company fundamentals** — market cap, P/E ratio, volume, 52-week range, dividend yield
- **Global exchange coverage** — top 5 stocks by market cap from 8 major exchanges
- **Stock search** — search any ticker or company name worldwide
- **Responsive design** — works on desktop, tablet, and mobile

### StockSense AI Agent
- **Natural language queries** — ask in plain English: *"Should I buy AAPL right now?"*
- **Automatic ticker detection** — detects stock symbols from your message (`$TSLA`, `NVDA`, `"Amazon"`)
- **Live data enrichment** — fetches real-time price, P/E, market cap, analyst targets, ROE, revenue growth, and analyst consensus for every mentioned stock before answering
- **Actionable analysis** — entry zones, price targets, stop-loss levels, hold/avoid reasoning
- **Multi-turn conversation** — remembers context across follow-up questions
- **Suggested prompts** — one-click starter questions for new users

---

## Exchanges Covered

| Exchange | Region |
|---|---|
| New York Stock Exchange (NYSE) | USA |
| NASDAQ | USA |
| London Stock Exchange (LSE) | UK |
| Tokyo Stock Exchange (TSE) | Japan |
| Shanghai Stock Exchange (SSE) | China |
| Hong Kong Stock Exchange (HKEX) | Hong Kong |
| Euronext | Europe |
| National Stock Exchange (NSE) | India |

---

## Architecture

```
Browser
  │
  ├── Frontend (GitHub Pages)                      [free, global CDN]
  │     React 18 + Vite + Recharts
  │     https://venkataugorantla.github.io/stock-market-app/
  │
  └── Backend API (Vercel Serverless — US East)    [free, no credit card]
        Express.js
        https://stock-market-app-nine-iota.vercel.app/api/
              │
              ├── Yahoo Finance API  (real-time quotes, history, fundamentals)
              │
              └── Groq API           (LLM inference — Llama 3.3 70B)
```

**StockSense AI flow:**
```
User message
    ↓
Extract ticker symbols from text
    ↓
Fetch live quote + fundamentals from Yahoo Finance (cached)
    ↓
Build enriched system prompt with real market data
    ↓
Send to Llama 3.3 70B via Groq API
    ↓
Stream structured markdown analysis back to user
```

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | 18.2 | UI component framework |
| Vite | 5.0 | Build tool and dev server |
| Recharts | 2.10 | Interactive stock price charts |
| CSS custom properties | — | Dark-theme design system |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| Node.js | 24.x | JavaScript runtime |
| Express | 4.18 | HTTP API server |
| cors | 2.8 | Cross-origin request handling |
| undici | 8.0 | HTTP/1.1 client for Yahoo Finance |
| nodemon | 3.0 | Dev server auto-restart |

### AI Agent

| Technology | Purpose |
|---|---|
| Groq API | Ultra-fast LLM inference (free tier) |
| Llama 3.3 70B Versatile | Large language model for analysis |
| Yahoo Finance (live context) | Real-time data injected into every prompt |

### Data Source

| Service | Usage |
|---|---|
| Yahoo Finance `query1.finance.yahoo.com` | Real-time quotes, historical OHLCV, search |
| Yahoo Finance `query2.finance.yahoo.com` | Auth crumb, company summaries (quoteSummary) |

### Hosting & Deployment

| Service | Role | Cost |
|---|---|---|
| GitHub Pages | Frontend static hosting | Free |
| Vercel (Serverless) | Backend API + AI agent endpoint | Free |
| Groq API | LLM inference for StockSense AI | Free tier |
| GitHub Actions | CI/CD — auto-deploy on push to `main` | Free |
| GitHub | Source code repository | Free |

---

## API Endpoints

### Market Data

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/quote/:symbol` | Live quote for a single ticker |
| GET | `/api/quotes?symbols=A,B,C` | Bulk quotes (up to 25 tickers) |
| GET | `/api/history/:symbol?period=1y` | OHLCV history (`1w`, `1m`, `3m`, `6m`, `1y`, `5y`) |
| GET | `/api/summary/:symbol` | Company fundamentals (P/E, market cap, ROE, margins, analyst data) |
| GET | `/api/search?q=query` | Search tickers and company names |

### AI Agent

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/agent` | Send conversation messages; returns LLM analysis enriched with live stock data |

**Request body:**
```json
{
  "messages": [
    { "role": "user", "content": "Should I buy NVDA right now?" }
  ]
}
```

**Response:**
```json
{
  "content": "## NVDA Analysis\n\nNVIDIA is currently trading at **$177.39** ..."
}
```

---

## Local Development

### Prerequisites
- Node.js 18+ (via [nvm](https://github.com/nvm-sh/nvm))
- A free [Groq API key](https://console.groq.com/keys) for the AI agent

### Setup

```bash
# Clone the repo
git clone https://github.com/venkataugorantla/stock-market-app.git
cd stock-market-app

# Install dependencies
cd server && npm install
cd ../client && npm install
```

### Environment

Create `server/.env`:
```
PORT=8080
GROQ_API_KEY=gsk_your_key_here
```

### Run

```bash
# Terminal 1 — API server (port 8080)
cd server && node index.js

# Terminal 2 — Vite dev server (port 5173)
cd client && npx vite
```

Open http://localhost:5173

---

## Deployment

### Frontend → GitHub Pages
Automatically triggered by GitHub Actions on every push to `main`:
1. Builds the React app with `VITE_BASE_PATH=/stock-market-app/` and `VITE_API_URL` pointing to the Vercel backend
2. Deploys `client/dist/` to GitHub Pages

### Backend + AI Agent → Vercel
The Express server runs as a Vercel serverless function (`api/index.js`). Environment variable `GROQ_API_KEY` is stored in the Vercel project settings.

```bash
# Add Groq API key to Vercel
vercel env add GROQ_API_KEY production

# Deploy
vercel --prod --yes
```

---

## Performance & Reliability

- **In-memory caching** — quotes 30s, history 5min, search 2min, company summary 10min
- **Concurrency limiter** — max 3 simultaneous Yahoo Finance requests (queue-based, prevents rate limiting)
- **Retry logic** — 2 attempts with 1.2s backoff on transient 5xx errors
- **HTTP/1.1 enforcement** — Yahoo Finance requires HTTP/1.1 (HTTP/2 causes 429 rate-limit errors)
- **Lazy auth** — Yahoo Finance crumb is fetched on first request, not at startup (required for Vercel serverless cold start)
- **Agent symbol extraction** — stop-word filtered regex extracts tickers from natural language; max 5 symbols per message to stay within Vercel 30s timeout

---

## Example AI Agent Queries

| Query | What the agent does |
|---|---|
| *"Should I buy AAPL right now?"* | Fetches live AAPL quote + fundamentals, analyses valuation vs. analyst target, gives entry/stop guidance |
| *"Compare $TSLA and $MSFT"* | Fetches both stocks, compares P/E, growth, margins, analyst consensus side-by-side |
| *"What is the outlook for NVDA?"* | Analyses momentum (52W range position), fundamentals, and analyst sentiment |
| *"Is META overvalued?"* | Compares trailing vs. forward P/E against growth rate (PEG ratio assessment) |
| *"Explain what beta means for AMZN"* | General financial education with live AMZN beta value as the example |

---

## Repository

https://github.com/venkataugorantla/stock-market-app

> **Disclaimer:** This application is for informational and educational purposes only. It does not constitute financial advice. Always consult a licensed financial advisor before making investment decisions.

