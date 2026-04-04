import React, { useState, useEffect, useRef } from 'react';
import { getQuote, getHistory, getSummary } from '../services/api';
import { formatPrice, formatChange, formatMarketCap, formatVolume, formatPercent } from '../utils/format';
import PriceChart from './PriceChart';
import './StockModal.css';

const PERIOD_MAP = { '1W': '1w', '1M': '1m', '3M': '3m', '6M': '6m', '1Y': '1y', '5Y': '5y' };

function MetricItem({ label, value, highlight }) {
  return (
    <div className="metric-item">
      <span className="metric-item__label">{label}</span>
      <span className={`metric-item__value ${highlight || ''}`}>{value ?? 'N/A'}</span>
    </div>
  );
}

export default function StockModal({ symbol, onClose }) {
  const [quote,   setQuote]   = useState(null);
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState(null);
  const [period,  setPeriod]  = useState('1Y');
  const [loading, setLoading] = useState(true);
  const [histLoading, setHistLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const overlayRef = useRef(null);

  // ── Load quote + summary on mount ─────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      getQuote(symbol),
      getSummary(symbol),
    ])
      .then(([q, s]) => {
        setQuote(q);
        setSummary(s);
      })
      .catch(() => setError('Failed to load stock data.'))
      .finally(() => setLoading(false));
  }, [symbol]);

  // ── Load history when period changes ──────────────────────────────────────
  useEffect(() => {
    setHistLoading(true);
    getHistory(symbol, PERIOD_MAP[period])
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setHistLoading(false));
  }, [symbol, period]);

  // ── Click outside overlay to close ────────────────────────────────────────
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const chg      = quote ? formatChange(quote.regularMarketChange, quote.regularMarketChangePercent) : null;
  const currency = quote?.currency || 'USD';
  const sd       = summary?.summaryDetail;
  const ap       = summary?.assetProfile;
  const fd       = summary?.financialData;

  const prevClose  = sd?.previousClose  ?? quote?.regularMarketPreviousClose;
  const openPrice  = quote?.regularMarketOpen;
  const high52     = sd?.fiftyTwoWeekHigh  ?? quote?.fiftyTwoWeekHigh;
  const low52      = sd?.fiftyTwoWeekLow   ?? quote?.fiftyTwoWeekLow;
  const mktCap     = sd?.marketCap         ?? quote?.marketCap;
  const volume     = quote?.regularMarketVolume;
  const avgVol     = sd?.averageVolume;
  const pe         = sd?.trailingPE        ?? quote?.trailingPE;
  const eps        = sd?.trailingEps       ?? fd?.earningsPerShare;
  const beta       = sd?.beta;
  const divYield   = sd?.dividendYield;
  const fwdPe      = sd?.forwardPE;
  const sector     = ap?.sector;
  const industry   = ap?.industry;
  const description= ap?.longBusinessSummary;
  const website    = ap?.website;
  const employees  = ap?.fullTimeEmployees;

  return (
    <div
      ref={overlayRef}
      className="modal-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Stock details for ${symbol}`}
    >
      <div className="modal">
        {/* ── Close button ─────────────────────────────────────────── */}
        <button className="modal__close" onClick={onClose} aria-label="Close modal">✕</button>

        {/* ── Loading state ─────────────────────────────────────────── */}
        {loading && (
          <div className="modal__loading">
            <div className="modal__spinner" />
            <p>Loading {symbol}…</p>
          </div>
        )}

        {/* ── Error state ───────────────────────────────────────────── */}
        {!loading && error && (
          <div className="modal__error">
            <span>⚠️</span>
            <p>{error}</p>
            <button className="btn-outline" onClick={onClose}>Close</button>
          </div>
        )}

        {/* ── Content ───────────────────────────────────────────────── */}
        {!loading && !error && quote && (
          <>
            {/* ── Stock identity ──────────────────────────────────── */}
            <div className="modal__hero">
              <div className="modal__symbol-wrap">
                <span className="modal__symbol">{symbol.split('.')[0]}</span>
                {sector && <span className="modal__sector">{sector}</span>}
              </div>
              <div className="modal__name-wrap">
                <h2 className="modal__company">
                  {quote.longName || quote.shortName || symbol}
                </h2>
                <div className="modal__exchange-line">
                  {quote.fullExchangeName && (
                    <span className="modal__exchange">{quote.fullExchangeName}</span>
                  )}
                  {industry && <span className="modal__industry">{industry}</span>}
                  {website && (
                    <a
                      className="modal__website"
                      href={website}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {website.replace(/^https?:\/\//, '')} ↗
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* ── Price ────────────────────────────────────────────── */}
            <div className="modal__price-block">
              <span className="modal__price">
                {formatPrice(quote.regularMarketPrice, currency)}
              </span>
              {chg && (
                <span className={`modal__change ${chg.positive ? 'positive' : 'negative'}`}>
                  {chg.positive ? '▲' : '▼'} {chg.text}
                </span>
              )}
              <span className="modal__market-time">
                {quote.marketState === 'REGULAR' ? (
                  <span className="badge badge--open">Market Open</span>
                ) : (
                  <span className="badge badge--closed">Market Closed</span>
                )}
              </span>
            </div>

            {/* ── Key metrics ──────────────────────────────────────── */}
            <div className="modal__metrics">
              <MetricItem label="Prev. Close"    value={formatPrice(prevClose, currency)} />
              <MetricItem label="Open"           value={formatPrice(openPrice, currency)} />
              <MetricItem label="Market Cap"     value={formatMarketCap(mktCap)} />
              <MetricItem label="Volume"         value={formatVolume(volume)} />
              <MetricItem label="Avg. Volume"    value={formatVolume(avgVol)} />
              <MetricItem label="P/E Ratio"      value={pe != null ? pe.toFixed(2) : 'N/A'} />
              <MetricItem label="Fwd P/E"        value={fwdPe != null ? fwdPe.toFixed(2) : 'N/A'} />
              <MetricItem label="EPS (TTM)"      value={eps != null ? formatPrice(eps, currency) : 'N/A'} />
              <MetricItem label="Beta"           value={beta != null ? beta.toFixed(2) : 'N/A'} />
              <MetricItem label="Dividend Yield" value={divYield != null ? (divYield * 100).toFixed(2) + '%' : 'N/A'} />
              <MetricItem label="52W High"       value={formatPrice(high52, currency)} highlight="positive-text" />
              <MetricItem label="52W Low"        value={formatPrice(low52, currency)}  highlight="negative-text" />
              {employees && (
                <MetricItem label="Employees" value={employees.toLocaleString()} />
              )}
            </div>

            {/* ── Historical chart ─────────────────────────────────── */}
            <div className="modal__chart-section">
              <h3 className="modal__section-title">
                Price History
                {histLoading && <span className="modal__hist-spinner" />}
              </h3>
              <PriceChart
                history={history}
                period={period}
                onPeriodChange={setPeriod}
                currency={currency}
              />
            </div>

            {/* ── Company description ───────────────────────────────── */}
            {description && (
              <div className="modal__about">
                <h3 className="modal__section-title">About</h3>
                <p className="modal__description">
                  {description.length > 600
                    ? description.slice(0, 600) + '…'
                    : description}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
