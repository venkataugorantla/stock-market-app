import React, { useState, useEffect, useRef, useCallback } from 'react';
import { searchStocks } from '../services/api';
import './SearchBar.css';

const DEBOUNCE_MS = 350;

export default function SearchBar({ onStockSelect }) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [focused, setFocused]   = useState(false);
  const [activeIdx, setActive]  = useState(-1);

  const timerRef    = useRef(null);
  const inputRef    = useRef(null);
  const dropdownRef = useRef(null);

  // ── Debounced search ─────────────────────────────────────────────────────
  const doSearch = useCallback(async (q) => {
    if (!q.trim() || q.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await searchStocks(q);
      const quotes = (data.quotes || []).filter(
        r => ['EQUITY', 'ETF', 'INDEX', 'MUTUALFUND'].includes(r.quoteType)
      );
      setResults(quotes.slice(0, 8));
    } catch (err) {
      setError('Search failed. Please try again.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!query.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(() => doSearch(query), DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
  }, [query, doSearch]);

  // ── Click outside to close ───────────────────────────────────────────────
  useEffect(() => {
    const onClickOut = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current    && !inputRef.current.contains(e.target)
      ) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', onClickOut);
    return () => document.removeEventListener('mousedown', onClickOut);
  }, []);

  // ── Keyboard navigation ──────────────────────────────────────────────────
  const onKeyDown = (e) => {
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => Math.max(i - 1, -1)); }
    if (e.key === 'Enter' && activeIdx >= 0) {
      handleSelect(results[activeIdx]);
    }
    if (e.key === 'Escape') { setFocused(false); setActive(-1); }
  };

  const handleSelect = (result) => {
    onStockSelect(result.symbol);
    setQuery('');
    setResults([]);
    setFocused(false);
    setActive(-1);
  };

  const showDropdown = focused && (loading || results.length > 0 || error);

  return (
    <div className="search-wrapper">
      <div className={`search-box ${focused ? 'search-box--focused' : ''}`}>
        <span className="search-box__icon">🔍</span>
        <input
          ref={inputRef}
          type="text"
          className="search-box__input"
          placeholder="Search stocks by name or ticker symbol…"
          value={query}
          onChange={e => { setQuery(e.target.value); setActive(-1); }}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
          aria-label="Search stocks"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
        />
        {loading && <span className="search-box__spinner" aria-hidden="true" />}
        {query && !loading && (
          <button
            className="search-box__clear"
            onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }}
            aria-label="Clear search"
          >✕</button>
        )}
      </div>

      {showDropdown && (
        <div ref={dropdownRef} className="search-dropdown" role="listbox">
          {error && <div className="search-dropdown__error">{error}</div>}
          {!error && loading && (
            <div className="search-dropdown__loading">Searching markets…</div>
          )}
          {!error && !loading && results.map((r, i) => (
            <button
              key={r.symbol}
              role="option"
              aria-selected={i === activeIdx}
              className={`search-result ${i === activeIdx ? 'search-result--active' : ''}`}
              onClick={() => handleSelect(r)}
            >
              <span className="search-result__symbol">{r.symbol}</span>
              <span className="search-result__name">{r.shortname || r.longname || '—'}</span>
              <span className="search-result__meta">
                <span className="search-result__exchange">{r.exchDisp || r.exchange || ''}</span>
                <span className={`search-result__type ${r.quoteType?.toLowerCase()}`}>
                  {r.quoteType}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
