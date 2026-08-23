import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, User, Copy, Check, Paperclip, Loader2, Globe, MapPin, Droplets, Satellite, BarChart3, X } from 'lucide-react';
import { STATE_CITIES } from '../../data/cities';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const YEARS = [2023, 2024, 2025, 2026, 2027];

// Formatted Markdown Paragraph Renderer Helper
function renderFormattedText(text) {
  if (!text) return null;

  const lines = text.split('\n');
  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={idx} style={{ height: 6 }} />;

    if (trimmed.startsWith('### ')) {
      return (
        <h3 key={idx} style={{ fontSize: 14, fontWeight: 800, color: '#ffffff', margin: '12px 0 8px 0', borderBottom: '1px solid #27272a', paddingBottom: 5, display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ color: '#38bdf8' }}>◈</span>
          {trimmed.replace('### ', '')}
        </h3>
      );
    }

    const isBullet = trimmed.startsWith('• ') || trimmed.startsWith('- ');
    const textToFormat = isBullet ? trimmed.replace(/^[•\-]\s*/, '') : trimmed;

    const parts = textToFormat.split(/(\*\*.*?\*\*)/g);
    const formattedLine = parts.map((part, pIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={pIdx} style={{ color: '#38bdf8', fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });

    if (isBullet) {
      return (
        <div key={idx} style={{ paddingLeft: 8, marginBottom: 6, display: 'flex', gap: 8, lineHeight: 1.55 }}>
          <span style={{ color: '#38bdf8', fontWeight: 'bold', fontSize: 13 }}>▸</span>
          <div style={{ color: '#e2e8f0', fontSize: 12.5 }}>{formattedLine}</div>
        </div>
      );
    }

    return (
      <div key={idx} style={{ marginBottom: 7, lineHeight: 1.6, color: '#e2e8f0', fontSize: 12.5 }}>
        {formattedLine}
      </div>
    );
  });
}

const selectStyle = {
  width: '100%', backgroundColor: '#121215', borderColor: '#27272a',
  color: '#ffffff', fontSize: 11.5, padding: '6px 26px 6px 9px',
  borderRadius: 6, appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer'
};

export default function ChatSidebar({
  open,
  selectedState,
  setSelectedState,
  selectedCity,
  setSelectedCity,
  dateTime,
  setDateTime,
  cityCoords,
  messages,
  onSendMessage,
  attachedImage,
  onRemoveAttachedImage,
  onAttachImageFromGallery,
  isToolLoading,
  toolStepText,
  imagery,
  dispatchMapCommand,
  onToggleMetrics,
  metricsVisible,
  onOpenRailTab
}) {
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [validationError, setValidationError] = useState('');
  const messagesEndRef = useRef(null);

  const cityName = typeof selectedCity === 'string' ? selectedCity : selectedCity?.name || 'Chennai';
  const stateName = selectedState || 'Tamil Nadu';
  const cityOptions = STATE_CITIES[stateName] || [cityName];

  // Parse current "Month Year" value into the two pickers
  const parts = (dateTime || '').trim().split(/\s+/);
  const initialMonth = MONTHS.find(m => m.toLowerCase() === (parts[0] || '').toLowerCase()) || 'August';
  const initialYear = YEARS.includes(Number(parts[1])) ? Number(parts[1]) : 2026;
  const pushDateTime = (month, year) => setDateTime(`${month} ${year}`);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isToolLoading, toolStepText]);

  const handleSend = (textToSend) => {
    let query = '';
    if (typeof textToSend === 'string') {
      query = textToSend;
    } else if (textToSend && typeof textToSend === 'object' && typeof textToSend.query === 'string') {
      query = textToSend.query;
    } else {
      query = inputText;
    }

    if (!query || typeof query !== 'string' || !query.trim()) {
      setValidationError('Please type a query first');
      setTimeout(() => setValidationError(''), 2500);
      return;
    }
    setValidationError('');
    onSendMessage(query.trim());
    setInputText('');
  };

  const handleCopyText = (text, msgId) => {
    navigator.clipboard.writeText(text);
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleStateChange = (e) => {
    const nextState = e.target.value;
    setSelectedState(nextState);
    const cities = STATE_CITIES[nextState];
    if (cities && cities.length > 0) setSelectedCity(cities[0]);
  };

  /* ---- Map action chips for each finalized AI message (manual interaction mode) ---- */
  const ndwiFrame = imagery?.frames?.find(f => f.id.startsWith('ndwi') && f.url);
  const trueColorFrame = imagery?.frames?.find(f => f.id === 'truecolor-viirs' && f.url);

  const buildWardMarkers = () => {
    const seeded = (n) => { const x = Math.sin(n * 127.1 + cityName.length * 311.7) * 43758.5453; return x - Math.floor(x); };
    const [lng0, lat0] = Array.isArray(cityCoords) ? cityCoords : [80.2707, 13.0827];
    return Array.from({ length: 5 }, (_, i) => ({
      lng: +(lng0 + (seeded(i + 1) - 0.5) * 0.11).toFixed(5),
      lat: +(lat0 + (seeded(i + 7) - 0.5) * 0.08).toFixed(5),
      label: `WARD ${String(i + 1).padStart(2, '0')}`,
      color: i % 2 === 0 ? '#ef4444' : '#f59e0b'
    }));
  };

  const actionChips = [
    {
      id: 'metrics',
      icon: <BarChart3 size={11} />,
      label: 'View Analytics Panel',
      onClick: () => onOpenRailTab('ndwi')
    },
    {
      id: 'charts',
      icon: <BarChart3 size={11} />,
      label: 'View Risk Charts',
      onClick: () => onOpenRailTab('charts')
    }
  ].filter(Boolean);

  const presetChips = [
    {
      label: '🌊 Real Scenario: Severe Flood Event in Bhagalpur',
      query: 'Evaluate Verified Severe Flood Submergence in Bhagalpur (August 2026)'
    },
    {
      label: '🛡️ Trustworthiness Test: False Alarm in Dry Region Jodhpur',
      query: 'Verify Claimed Flood Event in Dry Region Jodhpur (Engine Trustworthiness Test)'
    }
  ];

  return (
    <aside style={{
      position: 'absolute',
      top: 62,
      left: 16,
      bottom: 16,
      width: 400,
      zIndex: 30,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'rgba(19, 19, 22, 0.96)',
      backdropFilter: 'blur(20px)',
      border: '1px solid #27272a',
      borderRadius: 14,
      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.75)',
      overflow: 'hidden',
      transform: open ? 'translateX(0)' : 'translateX(-115%)',
      opacity: open ? 1 : 0,
      pointerEvents: open ? 'auto' : 'none',
      transition: 'transform 260ms cubic-bezier(0.4, 0, 0.2, 1), opacity 220ms ease',
      color: '#ffffff'
    }}>
      {/* Location / Timeframe config chips */}
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid #27272a',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8
      }}>
        <select value={stateName} onChange={handleStateChange} className="input-field" style={selectStyle}>
          {Object.keys(STATE_CITIES).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={cityName} onChange={(e) => setSelectedCity(e.target.value)} className="input-field" style={selectStyle}>
          {cityOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={initialMonth}
          onChange={(e) => pushDateTime(e.target.value, initialYear)}
          className="input-field" style={selectStyle}
        >
          {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={initialYear}
          onChange={(e) => pushDateTime(initialMonth, Number(e.target.value))}
          className="input-field" style={selectStyle}
        >
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Messages thread */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 10px 14px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>

          {/* Watermark Empty State */}
          {messages.length === 0 && (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '24px 16px',
              border: '1px dashed #27272a',
              borderRadius: 12,
              backgroundColor: 'rgba(24, 24, 27, 0.4)',
              margin: 'auto 0'
            }}>
              <Sparkles size={24} style={{ color: '#38bdf8', marginBottom: 12, opacity: 0.8 }} />
              <div style={{ fontSize: 14, fontWeight: 800, color: '#f1f5f9', marginBottom: 6 }}>
                You can chat here
              </div>
              <div style={{ fontSize: 11.5, color: '#94a3b8', lineHeight: 1.5, maxWidth: 280 }}>
                Our GOAT GPT chat panel is ready. Type any Earth Observation query about <strong>{cityName}</strong> below.
              </div>
            </div>
          )}

          {messages.map((msg) => {
            const isUser = msg.sender === 'user';

            return (
              <div key={msg.id} style={{
                display: 'flex',
                justifyContent: isUser ? 'flex-end' : 'flex-start',
                width: '100%'
              }}>
                <div style={{
                  display: 'flex',
                  flexDirection: isUser ? 'row-reverse' : 'row',
                  gap: 10,
                  alignItems: 'flex-start',
                  maxWidth: isUser ? '88%' : '100%',
                  width: isUser ? 'auto' : '100%'
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    backgroundColor: isUser ? '#2563eb' : '#090a0f',
                    color: '#ffffff',
                    border: isUser ? '2px solid #3b82f6' : '1px solid rgba(56, 189, 248, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: isUser ? '0 4px 14px rgba(37, 99, 235, 0.45)' : '0 0 16px rgba(56, 189, 248, 0.3)'
                  }}>
                    {isUser ? <User size={14} /> : <Sparkles size={14} style={{ color: '#38bdf8' }} />}
                  </div>

                  {/* Message body */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                    width: isUser ? 'auto' : '100%',
                    minWidth: 0
                  }}>
                    <div style={{
                      fontSize: isUser ? 12.5 : 13,
                      lineHeight: 1.65,
                      color: isUser ? '#ffffff' : '#f1f5f9',
                      backgroundColor: isUser ? '#0284c7' : 'rgba(24, 24, 27, 0.92)',
                      padding: isUser ? '9px 15px' : '14px 17px',
                      borderRadius: isUser ? '16px 16px 4px 16px' : 10,
                      border: isUser ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                      width: isUser ? 'auto' : '100%',
                      boxShadow: isUser ? '0 4px 16px rgba(2, 132, 199, 0.35)' : '0 8px 32px rgba(0,0,0,0.4)',
                      wordBreak: 'break-word'
                    }}>
                      {!isUser && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.6px', color: '#38bdf8', textTransform: 'uppercase' }}>
                            GOAT GPT
                          </span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.12)', padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                            Team ATLAS
                          </span>
                        </div>
                      )}
                      {isUser ? msg.text : renderFormattedText(msg.text)}
                      {msg.streaming && <span className="stream-caret" />}

                      {isUser && msg.attached_image && (
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, padding: 6, backgroundColor: '#0f172a', borderRadius: 6, border: '1px solid #334155' }}>
                          <img src={msg.attached_image.url} alt="attached" style={{ width: 36, height: 36, borderRadius: 5, objectFit: 'cover' }} />
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>{msg.attached_image.title}</span>
                        </div>
                      )}
                    </div>

                    {/* Copy */}
                    {!isUser && msg.text && !msg.streaming && (
                      <button
                        onClick={() => handleCopyText(msg.text, msg.id)}
                        style={{ fontSize: 10.5, padding: '3px 9px', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', backgroundColor: 'rgba(24, 24, 27, 0.6)', border: '1px solid #27272a', color: '#cbd5e1', borderRadius: 6 }}
                      >
                        {copiedId === msg.id ? <Check size={11} style={{ color: '#22c55e' }} /> : <Copy size={11} />}
                        {copiedId === msg.id ? 'Copied' : 'Copy'}
                      </button>
                    )}

                    {/* MAP ACTION CHIPS — chat drives the map (manual mode) */}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Pipeline progress pill */}
          {isToolLoading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', width: '100%', animation: 'fade-in 200ms ease-out' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 9,
                padding: '8px 14px',
                backgroundColor: 'rgba(24, 24, 27, 0.95)',
                backdropFilter: 'blur(12px)',
                borderRadius: 22,
                border: '1px solid rgba(56, 189, 248, 0.4)',
                boxShadow: '0 4px 20px rgba(56, 189, 248, 0.25)',
                color: '#38bdf8',
                fontSize: 11,
                fontWeight: 600
              }}>
                <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                <span>{toolStepText || `Acquiring Sentinel-1 SAR & Sentinel-2 optical scenes for ${cityName}...`}</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input zone */}
      <div style={{
        borderTop: '1px solid #27272a',
        padding: '10px 14px 14px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        backgroundColor: 'rgba(19, 19, 22, 0.98)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {presetChips.map((chip, cIdx) => (
            <button
              key={cIdx}
              onClick={() => handleSend(chip.query)}
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: '#7dd3fc',
                backgroundColor: 'rgba(24, 24, 27, 0.9)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: 16,
                padding: '5px 12px',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                transition: 'all 150ms ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.16)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(24, 24, 27, 0.9)'; }}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {attachedImage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px', backgroundColor: '#1e293b', borderRadius: 6, border: '1px solid #334155', width: 'fit-content' }}>
            <Paperclip size={12} style={{ color: '#38bdf8' }} />
            <span style={{ fontSize: 11, color: '#f8fafc', fontWeight: 500 }}>{attachedImage.title}</span>
            <button onClick={onRemoveAttachedImage} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', marginLeft: 6, fontSize: 15 }}>×</button>
          </div>
        )}

        {validationError && (
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#f87171',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 6,
            padding: '5px 10px'
          }}>
            {validationError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={`Type your query here for ${cityName}...`}
            className="input-field"
            style={{
              flex: 1,
              padding: '11px 14px',
              fontSize: 12.5,
              backgroundColor: '#131316',
              border: validationError ? '1px solid #f87171' : '1px solid rgba(56, 189, 248, 0.25)'
            }}
          />
          <button
            onClick={() => handleSend()}
            style={{
              padding: '11px 16px',
              fontSize: 12.5,
              backgroundColor: '#38bdf8',
              color: '#09090b',
              fontWeight: 700,
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Send size={14} />
            Run
          </button>
        </div>
      </div>
    </aside>
  );
}
