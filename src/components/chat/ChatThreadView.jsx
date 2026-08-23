import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, User, Copy, Check, Paperclip, Loader2, Satellite, Filter, Activity, Globe, Cpu, ChevronDown, ChevronUp } from 'lucide-react';
import MetricCardGrid from '../metrics/MetricCardGrid';
import LineChartCard from '../metrics/LineChartCard';
import DonutChartCard from '../metrics/DonutChartCard';
import AnnotatedGallery from '../metrics/AnnotatedGallery';
import TimelineScrubber from '../metrics/TimelineScrubber';
import ExportActions from '../metrics/ExportActions';
import { resolveCityImagery } from '../../services/imagery';

// Formatted Markdown Paragraph Renderer Helper
function renderFormattedText(text) {
  if (!text) return null;

  const lines = text.split('\n');
  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={idx} style={{ height: 6 }} />;

    if (trimmed.startsWith('### ')) {
      return (
        <h3 key={idx} style={{ fontSize: 17, fontWeight: 800, color: '#ffffff', margin: '14px 0 10px 0', borderBottom: '1px solid #27272a', paddingBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
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
        <div key={idx} style={{ paddingLeft: 10, marginBottom: 8, display: 'flex', gap: 10, lineHeight: 1.6 }}>
          <span style={{ color: '#38bdf8', fontWeight: 'bold', fontSize: 14 }}>▸</span>
          <div style={{ color: '#e2e8f0', fontSize: 14 }}>{formattedLine}</div>
        </div>
      );
    }

    return (
      <div key={idx} style={{ marginBottom: 8, lineHeight: 1.7, color: '#e2e8f0', fontSize: 14 }}>
        {formattedLine}
      </div>
    );
  });
}

export default function ChatThreadView({
  selectedState,
  selectedCity,
  cityBbox,
  dateTime,
  messages,
  onSendMessage,
  attachedImage,
  onRemoveAttachedImage,
  onAttachImageFromGallery,
  isToolLoading,
  toolStepText
}) {
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [activeTabPerMsg, setActiveTabPerMsg] = useState({});
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(true);
  const [resolvedGalleries, setResolvedGalleries] = useState({});
  const messagesEndRef = useRef(null);

  // Resolve REAL satellite frames (GIBS + Sentinel-2 NDWI) once per message
  useEffect(() => {
    let cancelled = false;
    if (!cityBbox) return;
    messages.forEach(msg => {
      if (msg.deliverables && !resolvedGalleries[msg.id] && !resolvedGalleries[`err_${msg.id}`]) {
        resolveCityImagery(cityBbox, cityName, stateName, dateTime)
          .then(res => { if (!cancelled) setResolvedGalleries(prev => ({ ...prev, [msg.id]: res })); })
          .catch(() => { if (!cancelled) setResolvedGalleries(prev => ({ ...prev, [`err_${msg.id}`]: true })); });
      }
    });
    return () => { cancelled = true; };
  }, [messages, cityBbox]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isToolLoading, toolStepText]);

  const handleSend = (textToSend) => {
    const query = textToSend || inputText;
    if (!query.trim() && !attachedImage) return;
    onSendMessage(query);
    setInputText('');
  };

  const handleCopyText = (text, msgId) => {
    navigator.clipboard.writeText(text);
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const cityName = typeof selectedCity === 'string' ? selectedCity : selectedCity?.name || 'Region';
  const stateName = selectedState || 'State';

  const setTab = (msgId, tabId) => {
    setActiveTabPerMsg(prev => ({ ...prev, [msgId]: tabId }));
  };

  const presetChips = [
    "Analyze Sentinel-2 NDWI Water Submergence",
    "Quantify Agricultural Crop Loss in Hectares",
    "Evaluate Population Exposure in Floodplain Wards"
  ];

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--bg-base)',
      position: 'relative'
    }}>
      {/* Messages Thread Container */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 160px 28px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const activeTab = activeTabPerMsg[msg.id] || 'ALL';

            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                  width: '100%'
                }}
              >
                <div style={{
                  display: 'flex',
                  flexDirection: isUser ? 'row-reverse' : 'row',
                  gap: 14,
                  alignItems: 'flex-start',
                  maxWidth: isUser ? '75%' : '100%',
                  width: isUser ? 'auto' : '100%'
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    backgroundColor: isUser ? '#2563eb' : '#090a0f',
                    color: '#ffffff',
                    border: isUser ? '2px solid #3b82f6' : '1px solid rgba(56, 189, 248, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontWeight: 800,
                    fontSize: 14,
                    boxShadow: isUser ? '0 4px 14px rgba(37, 99, 235, 0.45)' : '0 0 16px rgba(56, 189, 248, 0.3)'
                  }}>
                    {isUser ? <User size={16} /> : <Sparkles size={16} style={{ color: '#38bdf8' }} />}
                  </div>

                  {/* Message Content Body */}
                  <div style={{
                    flex: '1',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                    width: isUser ? 'auto' : '100%'
                  }}>
                    
                    {/* Sender Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: isUser ? '#93c5fd' : '#38bdf8' }}>
                        {isUser ? 'Field Responder Query' : 'DRISHTI Scientific Earth Observation Engine'}
                      </span>
                      {!isUser && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.12)', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                          Qwen 2.5 7B EO Grounded Adapter Active
                        </span>
                      )}
                    </div>

                    {/* Text Body Card */}
                    <div style={{
                      fontSize: isUser ? 13.5 : 14.5,
                      lineHeight: 1.7,
                      color: isUser ? '#ffffff' : '#f1f5f9',
                      backgroundColor: isUser ? '#0284c7' : 'rgba(24, 24, 27, 0.92)',
                      backdropFilter: isUser ? 'none' : 'blur(12px)',
                      padding: isUser ? '10px 18px' : '20px 24px',
                      borderRadius: isUser ? '18px 18px 4px 18px' : 'var(--radius-lg, 12px)',
                      border: isUser ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                      width: isUser ? 'auto' : '100%',
                      boxShadow: isUser ? '0 4px 16px rgba(2, 132, 199, 0.35)' : '0 8px 32px rgba(0,0,0,0.4)',
                      wordBreak: 'break-word'
                    }}>
                      {isUser ? msg.text : renderFormattedText(msg.text)}
                      {msg.streaming && <span className="stream-caret" />}

                      {isUser && msg.attached_image && (
                        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, padding: 8, backgroundColor: '#0f172a', borderRadius: 8, border: '1px solid #334155' }}>
                          <img src={msg.attached_image.url} alt="attached" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover' }} />
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>Attached Frame: {msg.attached_image.title}</span>
                        </div>
                      )}
                    </div>

                    {/* Copy Button */}
                    {!isUser && msg.text && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2 }}>
                        <button
                          onClick={() => handleCopyText(msg.text, msg.id)}
                          className="btn-secondary"
                          style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', backgroundColor: 'rgba(24, 24, 27, 0.6)', border: '1px solid #27272a', color: '#cbd5e1' }}
                        >
                          {copiedId === msg.id ? <Check size={12} style={{ color: '#22c55e' }} /> : <Copy size={12} />}
                          {copiedId === msg.id ? 'Copied to Clipboard' : 'Copy Report'}
                        </button>
                      </div>
                    )}

                    {/* Dynamic Deliverables Presentation */}
                    {!isUser && msg.deliverables && Object.keys(msg.deliverables).length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 14, width: '100%' }}>
                        
                        {/* High-Tech Telemetry Bar */}
                        {msg.deliverables.telemetry && (
                          <div style={{
                            fontSize: 11,
                            color: '#94a3b8',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: '#09090b',
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: '1px solid rgba(56, 189, 248, 0.2)',
                            flexWrap: 'wrap',
                            gap: 12
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                              <span><strong style={{ color: '#38bdf8' }}>Model:</strong> {msg.deliverables.telemetry.model_name}</span>
                              <span><strong style={{ color: '#38bdf8' }}>Latency:</strong> {msg.deliverables.telemetry.inference_time_sec}s</span>
                              <span><strong style={{ color: '#38bdf8' }}>Confidence:</strong> {msg.deliverables.telemetry.confidence_score_pct}%</span>
                              <span><strong style={{ color: '#38bdf8' }}>Sensor:</strong> {msg.deliverables.telemetry.sensor}</span>
                            </div>
                          </div>
                        )}

                        {/* Filter Tabs */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #27272a', paddingBottom: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginRight: 8 }}>
                            <Filter size={12} /> Data View:
                          </span>
                          {[
                            { id: 'ALL', label: 'All Deliverables' },
                            { id: 'METRICS', label: 'Metric Cards' },
                            { id: 'GALLERY', label: 'Orbital Gallery' },
                            { id: 'CHARTS', label: 'Charts & Hydrograph' }
                          ].map((tab) => (
                            <button
                              key={tab.id}
                              onClick={() => setTab(msg.id, tab.id)}
                              style={{
                                padding: '5px 12px',
                                fontSize: 11,
                                fontWeight: 600,
                                borderRadius: 6,
                                border: '1px solid',
                                borderColor: activeTab === tab.id ? '#38bdf8' : '#27272a',
                                backgroundColor: activeTab === tab.id ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                                color: activeTab === tab.id ? '#38bdf8' : '#a1a1aa',
                                cursor: 'pointer',
                                transition: 'all 150ms ease'
                              }}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>

                        {/* 1. Metric Cards */}
                        {(activeTab === 'ALL' || activeTab === 'METRICS') && msg.deliverables.metrics && (
                          <MetricCardGrid metrics={msg.deliverables.metrics} />
                        )}

                        {/* 2. Charts Grid */}
                        {(activeTab === 'ALL' || activeTab === 'CHARTS') && (msg.deliverables.lineChartData || msg.deliverables.donutChartData) && (
                          <div style={{ display: 'grid', gridTemplateColumns: msg.deliverables.lineChartData && msg.deliverables.donutChartData ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr', gap: 16 }}>
                            {msg.deliverables.lineChartData && <LineChartCard data={msg.deliverables.lineChartData} />}
                            {msg.deliverables.donutChartData && <DonutChartCard data={msg.deliverables.donutChartData} />}
                          </div>
                        )}

                        {/* 3. Annotated Satellite Gallery — REAL imagery (NASA GIBS / Sentinel-2 NDWI band math) */}
                        {(activeTab === 'ALL' || activeTab === 'GALLERY') && (
                          (() => {
                            const resolved = resolvedGalleries[msg.id];
                            const staticFrames = msg.deliverables.gallery || [];
                            const frames = resolved?.frames?.length ? resolved.frames : staticFrames;
                            if (!resolved && staticFrames.length === 0) {
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px', backgroundColor: 'rgba(24, 24, 27, 0.9)', border: '1px solid #27272a', borderRadius: 12 }}>
                                  <Loader2 size={15} style={{ animation: 'spin 1s linear infinite', color: '#38bdf8' }} />
                                  <span style={{ fontSize: 12.5, color: '#94a3b8' }}>Fetching real satellite frames — NASA GIBS &amp; Sentinel-2 COGs…</span>
                                </div>
                              );
                            }
                            if (frames.length === 0) return null;
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <AnnotatedGallery gallery={frames} onAttachImage={onAttachImageFromGallery} />
                                <TimelineScrubber />
                              </div>
                            );
                          })()
                        )}

                        {/* Export Actions */}
                        {(msg.deliverables.metrics || msg.deliverables.gallery) && (
                          <ExportActions
                            selectedCity={cityName}
                            selectedState={stateName}
                            summaryText={msg.text}
                          />
                        )}
                      </div>
                    )}

                  </div>
                </div>
              </div>
            );
          })}

          {/* DYNAMIC PIPELINE PROGRESS STEP PILL (MATCHING VIDEO) */}
          {isToolLoading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', width: '100%', paddingLeft: 48, animation: 'fade-in 200ms ease-out' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 20px',
                backgroundColor: 'rgba(24, 24, 27, 0.95)',
                backdropFilter: 'blur(12px)',
                borderRadius: 30,
                border: '1px solid rgba(56, 189, 248, 0.4)',
                boxShadow: '0 4px 20px rgba(56, 189, 248, 0.25)',
                color: '#38bdf8',
                fontSize: 13,
                fontWeight: 600
              }}>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: '#38bdf8' }} />
                <span>{toolStepText || `Step 1/3: Requesting Sentinel-1 SAR & Sentinel-2 optical imagery for ${cityName}...`}</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Bar & Preset Prompt Chips */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '16px 28px 24px 28px',
        backgroundColor: 'rgba(19, 19, 22, 0.94)',
        backdropFilter: 'blur(16px)',
        borderTop: '1px solid var(--border-subtle)',
        zIndex: 20
      }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Globe size={12} style={{ color: '#38bdf8' }} /> Quick Query:
            </span>
            {presetChips.map((chipText, cIdx) => (
              <button
                key={cIdx}
                onClick={() => handleSend(chipText)}
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: '#7dd3fc',
                  backgroundColor: 'rgba(24, 24, 27, 0.9)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  borderRadius: 20,
                  padding: '6px 14px',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'all 150ms ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.12)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(24, 24, 27, 0.9)'; }}
              >
                {chipText}
              </button>
            ))}
          </div>

          {attachedImage && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', backgroundColor: '#1e293b', borderRadius: 6, border: '1px solid #334155', width: 'fit-content' }}>
              <Paperclip size={14} style={{ color: '#38bdf8' }} />
              <span style={{ fontSize: 12, color: '#f8fafc', fontWeight: 500 }}>Attached Frame: {attachedImage.title}</span>
              <button onClick={onRemoveAttachedImage} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', marginLeft: 8, fontSize: 16 }}>×</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={`Ask follow-up query about flood levels, NDWI metrics, or satellite frames in ${cityName}...`}
              className="input-field"
              style={{ flex: 1, padding: '14px 20px', fontSize: 14, backgroundColor: '#131316', border: '1px solid rgba(56, 189, 248, 0.25)' }}
            />
            <button
              onClick={() => handleSend()}
              className="btn-primary"
              style={{ padding: '14px 24px', fontSize: 14, backgroundColor: '#38bdf8', color: '#09090b', fontWeight: 700 }}
            >
              <Send size={16} />
              Run Query
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
