# Global Stock Market App

A real-time interactive stock market web application that tracks live prices, historical charts, and company fundamentals across all major world exchanges.

**Live URL:** https://venkataugorantla.github.io/stock-market-app/

---

## Features

- **Real-time stock prices** — live quotes with price change and percentage
- **Historical price charts** — interactive line charts (1D, 1W, 1M, 3M, 1Y)
- **Company fundamentals** — market cap, P/E ratio, volume, 52-week range, dividend yield
- **Global exchange coverage** — top 5 stocks by market cap from 8 major exchanges
- **Stock search** — search any ticker or company name worldwide
- **Watchlist** — pin stocks for quick access
- **Responsive design** — works on desktop, tablet, and mobile

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
  ├── Frontend (GitHub Pages)
  │     React 18 + Vite + Recharts
  │     https://venkataugorantla.github.io/stock-market-app/
  │
  └── Backend API (Vercel Serverless)
        Express.js → Yahoo Finance
        https://stock-market-app-nine-iota.vercel.app/api/
```

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | 18.2 | UI component framework |
| Vite | 5.0 | Build tool and dev server |
| Recharts | 2.10 | Interactive stock price charts |
| CSS Modules | — | Component-scoped styling |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| Node.js | 24.x | JavaScript runtime |
| Express | 4.18 | HTTP API server |
| cors | 2.8 | Cross-origin request handling |
| undici | 8.0 | HTTP/1.1 client for Yahoo Finance |
| nodemon | 3.0 | Dev server auto-restart |

### Data Source

| Service | Usage |
|---|---|
| Yahoo Finance (query2.finance.yahoo.com) | Real-time quotes, historical OHLCV data, company summaries, search |

### Hosting & Deployment

| Service | Role | Cost |
|---|---|---|
| GitHub Pages | Frontend static hosting | Free |
| Vercel (Serverless) | Backend API (Express as serverless function) | Free |
| GitHub Actions | CI/CD — auto-deploy on every push to `main` | Free |
| GitHub | Source code repository | Free |

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/quote/:symbol` | Live quote for a single ticker |
| GET | `/api/quotes?symbols=A,B,C` | Bulk quotes (up to 20 tickers) |
| GET | `/api/history/:symbol?range=1mo` | OHLCV history (1d, 5d, 1mo, 3mo, 1y) |
| GET | `/api/summary/:symbol` | Company fundamentals |
| GET | `/api/search?q=query` | Search tickers and company names |

---

## Local Development

### Prerequisites
- Node.js 18+ (via [nvm](https://github.com/nvm-sh/nvm))

### Setup

```bash
# Clone the repo
git clone https://github.com/venkataugorantla/stock-market-app.git
cd stock-market-app

# Install all dependencies
cd server && npm install
cd ../client && npm install
```

### Run

```bash
# Terminal 1 — start the API server (port 8080)
cd server && node index.js

# Terminal 2 — start the Vite dev server (port 5173)
cd client && npx vite
```

Open http://localhost:5173

---

## Deployment

### Frontend → GitHub Pages
Triggered automatically by GitHub Actions on every push to `main`. The workflow:
1. Builds the React app with `VITE_BASE_PATH=/stock-market-app/` and `VITE_API_URL` pointing to Vercel
2. Deploys the `client/dist/` output to GitHub Pages

### Backend → Vercel
The Express server is exported as a Vercel serverless function via `api/index.js`.

```bash
# Manual deploy
vercel --prod --yes
```

---

## Performance Optimisations

- **In-memory caching** — quotes cached 30s, history 5min, search 2min, company summary 10min
- **Concurrency limit** — max 3 simultaneous Yahoo Finance requests (queue-based)
- **Retry logic** — 2 attempts with 1.2s backoff on transient errors
- **HTTP/1.1** — Yahoo Finance requires HTTP/1.1 (HTTP/2 causes 429 errors)

---

## Repository

https://github.com/venkataugorantla/stock-market-app
