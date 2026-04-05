import React, { useState, useRef, useEffect, useCallback } from 'react';
import { chatWithAgent } from '../services/api';
import './StockAgent.css';

const SUGGESTED_QUESTIONS = [
  'Should I buy AAPL right now?',
  'Compare TSLA vs MSFT fundamentals',
  'What is the outlook for NVDA?',
  'Analyze AMZN as a long-term investment',
  'Is META overvalued at current price?',
];

// ─── Inline markdown renderer ─────────────────────────────────────────────────
function parseInline(text) {
  const parts = [];
  let remaining = String(text);
  let key = 0;
  while (remaining.length > 0) {
    const boldM  = remaining.match(/\*\*(.+?)\*\*/);
    const italicM = remaining.match(/\*([^*]+)\*/);
    const codeM  = remaining.match(/`([^`]+)`/);
    const boldI  = boldM  ? remaining.indexOf(boldM[0])  : Infinity;
    const italicI = italicM ? remaining.indexOf(italicM[0]) : Infinity;
    const codeI  = codeM  ? remaining.indexOf(codeM[0])  : Infinity;
    const minI   = Math.min(boldI, italicI, codeI);
    if (minI === Infinity) { parts.push(remaining); break; }
    if (minI === boldI) {
      if (boldI > 0) parts.push(remaining.slice(0, boldI));
      parts.push(<strong key={key++}>{boldM[1]}</strong>);
      remaining = remaining.slice(boldI + boldM[0].length);
    } else if (minI === italicI) {
      if (italicI > 0) parts.push(remaining.slice(0, italicI));
      parts.push(<em key={key++}>{italicM[1]}</em>);
      remaining = remaining.slice(italicI + italicM[0].length);
    } else {
      if (codeI > 0) parts.push(remaining.slice(0, codeI));
      parts.push(<code key={key++}>{codeM[1]}</code>);
      remaining = remaining.slice(codeI + codeM[0].length);
    }
  }
  return parts;
}

function MarkdownMessage({ content }) {
  const lines    = content.split('\n');
  const elements = [];
  let listItems  = [];
  let listType   = null;

  const flushList = () => {
    if (listItems.length === 0) return;
    const Tag = listType === 'ol' ? 'ol' : 'ul';
    elements.push(<Tag key={`list-${elements.length}`} className="sa-list">{listItems}</Tag>);
    listItems = [];
    listType  = null;
  };

  lines.forEach((line, i) => {
    if (/^###\s/.test(line)) {
      flushList();
      elements.push(<h4 key={i} className="sa-h4">{parseInline(line.slice(4))}</h4>);
    } else if (/^##\s/.test(line)) {
      flushList();
      elements.push(<h3 key={i} className="sa-h3">{parseInline(line.slice(3))}</h3>);
    } else if (/^#\s/.test(line)) {
      flushList();
      elements.push(<h2 key={i} className="sa-h2">{parseInline(line.slice(2))}</h2>);
    } else if (/^[-*]\s/.test(line)) {
      listType = 'ul';
      listItems.push(<li key={i}>{parseInline(line.slice(2))}</li>);
    } else if (/^\d+\.\s/.test(line)) {
      listType = 'ol';
      listItems.push(<li key={i}>{parseInline(line.replace(/^\d+\.\s/, ''))}</li>);
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      elements.push(<p key={i} className="sa-p">{parseInline(line)}</p>);
    }
  });
  flushList();
  return <div className="sa-md">{elements}</div>;
}

function TypingDots() {
  return (
    <div className="sa-typing" aria-label="Thinking…">
      <span /><span /><span />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function StockAgent() {
  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  // Keyboard: close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && open) setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const sendMessage = useCallback(async (text) => {
    const content = text.trim();
    if (!content || loading) return;

    const userMsg     = { role: 'user', content };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setError('');
    setLoading(true);

    try {
      const { content: reply } = await chatWithAgent(nextHistory);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [messages, loading]);

  const handleSubmit = (e) => { e.preventDefault(); sendMessage(input); };
  const handleSuggest = (q) => sendMessage(q);

  return (
    <>
      {/* ── Floating trigger button ─────────────────────────────────────── */}
      <button
        className={`sa-fab${open ? ' sa-fab--open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close AI analyst' : 'Open StockSense AI analyst'}
        title="StockSense AI"
      >
        {open ? '✕' : '✦'}
        {!open && <span className="sa-fab-label">AI Analyst</span>}
      </button>

      {/* ── Chat panel ──────────────────────────────────────────────────── */}
      {open && (
        <div className="sa-panel" role="dialog" aria-modal="true" aria-label="StockSense AI Analyst">

          {/* Header */}
          <div className="sa-header">
            <div className="sa-header-left">
              <span className="sa-header-icon">✦</span>
              <div>
                <div className="sa-header-title">StockSense AI</div>
                <div className="sa-header-sub">Llama 3.3 · Live market data</div>
              </div>
            </div>
            <button className="sa-close-btn" onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </div>

          {/* Messages */}
          <div className="sa-messages" role="log" aria-live="polite">

            {/* Welcome screen */}
            {messages.length === 0 && (
              <div className="sa-welcome">
                <div className="sa-welcome-icon">✦</div>
                <h3 className="sa-welcome-title">Your AI Stock Analyst</h3>
                <p className="sa-welcome-sub">
                  Ask me anything about stocks. I'll pull live market data and
                  give you actionable analysis.
                </p>
                <div className="sa-suggestions">
                  {SUGGESTED_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      className="sa-suggestion"
                      onClick={() => handleSuggest(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation */}
            {messages.map((msg, i) => (
              <div key={i} className={`sa-msg sa-msg--${msg.role}`}>
                <div className="sa-avatar" aria-hidden="true">
                  {msg.role === 'user' ? '👤' : '✦'}
                </div>
                <div className="sa-bubble">
                  {msg.role === 'assistant'
                    ? <MarkdownMessage content={msg.content} />
                    : <p className="sa-p">{msg.content}</p>
                  }
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="sa-msg sa-msg--assistant">
                <div className="sa-avatar" aria-hidden="true">✦</div>
                <div className="sa-bubble"><TypingDots /></div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="sa-error" role="alert">
                <span>⚠ </span>{error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input row */}
          <form className="sa-input-row" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              className="sa-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about any stock, e.g. Should I buy TSLA?"
              disabled={loading}
              aria-label="Chat input"
              maxLength={500}
            />
            <button
              type="submit"
              className="sa-send"
              disabled={loading || !input.trim()}
              aria-label="Send message"
            >
              ↑
            </button>
          </form>
        </div>
      )}
    </>
  );
}
