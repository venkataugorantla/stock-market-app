import React, { useState, useEffect } from 'react';
import { getQuotes } from '../services/api';
import { formatPrice, formatChange } from '../utils/format';
import { majorIndices } from '../data/exchanges';
import './Header.css';

const INDEX_LABELS = {
  '^GSPC': 'S&P 500',
  '^IXIC': 'NASDAQ',
  '^DJI':  'DOW',
  '^FTSE': 'FTSE 100',
  '^N225': 'Nikkei 225',
  '^HSI':  'Hang Seng',
  '^GDAXI':'DAX',
};

export default function Header({ onStockSelect }) {
  const [indices, setIndices] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchIndices = async () => {
    try {
      const quotes = await getQuotes(majorIndices);
      setIndices(quotes.filter(Boolean));
      setLastUpdated(new Date());
    } catch {
      // Silently fail – ticker is non-critical
    }
  };

  useEffect(() => {
    fetchIndices();
    const timer = setInterval(fetchIndices, 60_000);
    return () => clearInterval(timer);
  }, []);

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <header className="header">
      <div className="header__top">
        <div className="header__brand">
          <span className="header__logo-icon">📈</span>
          <div>
            <span className="header__title">GlobalStockTrader</span>
            <span className="header__subtitle">World Markets · Live Data</span>
          </div>
        </div>

        <div className="header__meta">
          <span className="header__badge header__badge--live">● LIVE</span>
          <div className="header__datetime">
            <span className="header__time">{timeStr}</span>
            <span className="header__date">{dateStr}</span>
          </div>
        </div>
      </div>

      {/* ── Indices ticker ─────────────────────────────────────────── */}
      {indices.length > 0 && (
        <div className="ticker-bar">
          <span className="ticker-bar__label">MARKETS</span>
          <div className="ticker-bar__track">
            <div className="ticker-bar__content">
              {[...indices, ...indices].map((idx, i) => {
                const chg = formatChange(
                  idx.regularMarketChange,
                  idx.regularMarketChangePercent
                );
                return (
                  <button
                    key={`${idx.symbol}-${i}`}
                    className="ticker-item"
                    onClick={() => onStockSelect(idx.symbol)}
                    title={`Open ${idx.symbol}`}
                  >
                    <span className="ticker-item__name">
                      {INDEX_LABELS[idx.symbol] || idx.symbol}
                    </span>
                    <span className="ticker-item__price">
                      {formatPrice(idx.regularMarketPrice, idx.currency || 'USD')}
                    </span>
                    <span className={`ticker-item__change ${chg.positive ? 'positive' : 'negative'}`}>
                      {chg.text}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
