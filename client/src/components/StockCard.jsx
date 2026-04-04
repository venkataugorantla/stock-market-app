import React from 'react';
import { formatPrice, formatChange, shortSymbol } from '../utils/format';
import './StockCard.css';

export default function StockCard({ symbol, displayName, quote, onSelect }) {
  if (!quote) {
    return (
      <button className="stock-card stock-card--empty" onClick={() => onSelect(symbol)}>
        <span className="stock-card__symbol">{shortSymbol(symbol)}</span>
        <span className="stock-card__nodata">No data</span>
      </button>
    );
  }

  const price   = quote.regularMarketPrice;
  const change  = quote.regularMarketChange;
  const pct     = quote.regularMarketChangePercent;
  const { text: changeText, positive } = formatChange(change, pct);
  const currency = quote.currency || 'USD';
  const name     = displayName || quote.shortName || quote.longName || symbol;

  return (
    <button
      className={`stock-card ${positive === true ? 'stock-card--up' : positive === false ? 'stock-card--down' : ''}`}
      onClick={() => onSelect(symbol)}
      title={`${name} — click for details`}
    >
      <div className="stock-card__header">
        <span className="stock-card__symbol">{shortSymbol(symbol)}</span>
        <span className={`stock-card__arrow ${positive ? 'up' : 'down'}`}>
          {positive ? '▲' : '▼'}
        </span>
      </div>

      <span className="stock-card__name" title={name}>
        {name.length > 18 ? name.slice(0, 17) + '…' : name}
      </span>

      <span className="stock-card__price">
        {formatPrice(price, currency)}
      </span>

      <span className={`stock-card__change ${positive ? 'positive' : 'negative'}`}>
        {changeText}
      </span>

      <span className="stock-card__view">View Details</span>
    </button>
  );
}
