import React, { useState, useEffect } from 'react';
import { getQuotes } from '../services/api';
import StockCard from './StockCard';
import './ExchangeSection.css';

export default function ExchangeSection({ exchange, onStockSelect }) {
  const [quotes, setQuotes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;

    const fetchQuotes = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getQuotes(exchange.topStocks);
        if (!cancelled) setQuotes(data);
      } catch (err) {
        if (!cancelled) setError('Failed to load quotes');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchQuotes();
    // Refresh every 60 s
    const timer = setInterval(fetchQuotes, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [exchange.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Map symbol → quote for quick lookup
  const quoteMap = Object.fromEntries((quotes || []).map(q => [q.symbol, q]));

  return (
    <div className="exchange-section" style={{ '--exchange-color': exchange.color }}>
      {/* Header */}
      <div className="exchange-section__header">
        <div className="exchange-section__flag-wrap">
          <span className="exchange-section__flag">{exchange.flag}</span>
        </div>
        <div className="exchange-section__info">
          <h3 className="exchange-section__name">{exchange.name}</h3>
          <span className="exchange-section__meta">
            <span className="exchange-section__short">{exchange.shortName}</span>
            <span className="exchange-section__sep">·</span>
            <span className="exchange-section__country">{exchange.country}</span>
          </span>
        </div>
        <span className="exchange-section__badge">Top 5</span>
      </div>

      {/* Stocks row */}
      <div className="exchange-section__stocks">
        {loading && exchange.topStocks.map(sym => (
          <div key={sym} className="stock-card-skeleton">
            <div className="skeleton-line skeleton-line--short" />
            <div className="skeleton-line" />
            <div className="skeleton-line skeleton-line--price" />
          </div>
        ))}

        {!loading && error && (
          <div className="exchange-section__error">
            <span>⚠️</span> {error}
          </div>
        )}

        {!loading && !error && exchange.topStocks.map(symbol => (
          <StockCard
            key={symbol}
            symbol={symbol}
            displayName={exchange.stockNames[symbol]}
            quote={quoteMap[symbol] || null}
            onSelect={onStockSelect}
          />
        ))}
      </div>
    </div>
  );
}
