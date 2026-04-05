import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import SearchBar from './components/SearchBar';
import ExchangeSection from './components/ExchangeSection';
import StockModal from './components/StockModal';
import StockAgent from './components/StockAgent';
import { exchanges } from './data/exchanges';
import './App.css';

export default function App() {
  const [selectedStock, setSelectedStock] = useState(null);

  const handleStockSelect = useCallback((symbol) => {
    setSelectedStock(symbol);
  }, []);

  const handleModalClose = useCallback(() => {
    setSelectedStock(null);
  }, []);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = selectedStock ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [selectedStock]);

  // Close modal on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') handleModalClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleModalClose]);

  return (
    <div className="app">
      <Header onStockSelect={handleStockSelect} />

      <main className="main-content">
        {/* ── Hero / Search ─────────────────────────────────────────── */}
        <section className="hero">
          <div className="hero__eyebrow">Real-Time · Global · Intelligent</div>
          <h1 className="hero__title">
            World Stock Market<br />
            <span className="hero__title--accent">Analytics Platform</span>
          </h1>
          <p className="hero__sub">
            Search any stock, track live prices, and explore historical trends
            across the world's leading exchanges.
          </p>
          <SearchBar onStockSelect={handleStockSelect} />
        </section>

        {/* ── Exchanges ────────────────────────────────────────────────*/}
        <section className="exchanges-section">
          <div className="section-heading">
            <span className="section-heading__icon">🌍</span>
            <div>
              <h2 className="section-heading__title">Major World Exchanges</h2>
              <p className="section-heading__sub">
                Top 5 stocks by market cap from each leading exchange — click any stock for full details.
              </p>
            </div>
          </div>

          <div className="exchanges-grid">
            {exchanges.map(exchange => (
              <ExchangeSection
                key={exchange.id}
                exchange={exchange}
                onStockSelect={handleStockSelect}
              />
            ))}
          </div>
        </section>
      </main>

      <footer className="app-footer">
        <p>Market data provided by Yahoo Finance · For informational purposes only · Not financial advice</p>
      </footer>

      {selectedStock && (
        <StockModal symbol={selectedStock} onClose={handleModalClose} />
      )}

      <StockAgent />
    </div>
  );
}
