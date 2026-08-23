import React from 'react';
import { X, Layers, Droplets, BarChart3, Satellite, Plus, Loader2, Download, CloudSun, Calendar, ShieldCheck } from 'lucide-react';
import MetricCardGrid from '../metrics/MetricCardGrid';
import LineChartCard from '../metrics/LineChartCard';
import DonutChartCard from '../metrics/DonutChartCard';
import TimelineScrubber from '../metrics/TimelineScrubber';
import ExportActions from '../metrics/ExportActions';

function FrameCard({ frame, onOverlay }) {
  const isAvailable = frame.url && frame.bbox;
  return (
    <div style={{
      backgroundColor: 'rgba(24, 24, 27, 0.9)',
      border: '1px solid #27272a',
      borderRadius: 10,
      overflow: 'hidden',
      flexShrink: 0
    }}>
      <div style={{ position: 'relative', height: 125, backgroundColor: '#09090b' }}>
        {frame.url ? (
          <img src={frame.url} alt={frame.name || frame.title} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.95 }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: '#38bdf8' }} />
            <span style={{ fontSize: 10, color: '#94a3b8' }}>Fetching Satellite Scene…</span>
          </div>
        )}
        <div style={{
          position: 'absolute', top: 6, left: 6, display: 'flex', gap: 5
        }}>
          <span style={{
            fontSize: 9, fontWeight: 700, color: '#e2e8f0',
            backgroundColor: 'rgba(9, 9, 11, 0.88)', border: '1px solid #3f3f46',
            borderRadius: 4, padding: '1px 6px'
          }}>
            {frame.sensor || 'Sentinel-2 L2A'}
          </span>
          {frame.cloud_cover && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: '#38bdf8',
              backgroundColor: 'rgba(9, 9, 11, 0.88)', border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: 4, padding: '1px 6px'
            }}>
              ☁️ {frame.cloud_cover}
            </span>
          )}
        </div>
      </div>
      <div style={{ padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#f4f4f5', lineHeight: 1.35, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={12} style={{ color: '#38bdf8' }} />
          {frame.name || frame.title || frame.date}
        </div>
        <button
          onClick={() => onOverlay(frame)}
          disabled={!isAvailable}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: 10.5,
            fontWeight: 700,
            color: isAvailable ? '#09090b' : '#52525b',
            backgroundColor: isAvailable ? '#38bdf8' : '#27272a',
            border: 'none',
            borderRadius: 6,
            padding: '6px 10px',
            cursor: isAvailable ? 'pointer' : 'not-allowed',
            transition: 'all 150ms ease'
          }}
        >
          <Plus size={12} />
          Overlay Satellite Scene on Map
        </button>
      </div>
    </div>
  );
}

export default function ImageryRail({
  open,
  onClose,
  tab,
  setTab,
  imagery,
  latestDeliverables,
  summaryText,
  cityName,
  stateName,
  dispatchMapCommand
}) {
  const handleOverlay = (frame) => {
    dispatchMapCommand('overlayImage', {
      id: frame.id,
      url: frame.url,
      bounds: frame.bbox,
      title: frame.name || frame.title
    });
  };

  // Combine real satellite frames from API deliverables + resolved imagery
  const apiFrames = latestDeliverables?.frames || [];
  const resolvedFrames = imagery?.frames || [];
  const allFrames = apiFrames.length > 0 ? apiFrames : resolvedFrames;

  const showNdwiTab = Boolean(
    imagery?.ndwiStats ||
    latestDeliverables?.metrics?.mean_ndwi_score ||
    allFrames.some(f => f.id && f.id.includes('ndwi'))
  );

  const tabs = [
    { id: 'frames', label: 'Frames', icon: <Layers size={12} /> },
    showNdwiTab && { id: 'ndwi', label: 'NDWI', icon: <Droplets size={12} /> },
    { id: 'charts', label: 'Charts', icon: <BarChart3 size={12} /> }
  ].filter(Boolean);

  return (
    <aside style={{
      position: 'absolute',
      top: 62,
      right: 16,
      bottom: 16,
      width: 372,
      zIndex: 30,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'rgba(19, 19, 22, 0.96)',
      backdropFilter: 'blur(20px)',
      border: '1px solid #27272a',
      borderRadius: 14,
      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.75)',
      overflow: 'hidden',
      transform: open ? 'translateX(0)' : 'translateX(115%)',
      opacity: open ? 1 : 0,
      pointerEvents: open ? 'auto' : 'none',
      transition: 'transform 260ms cubic-bezier(0.4, 0, 0.2, 1), opacity 220ms ease',
      color: '#ffffff'
    }}>
      {/* Header + tabs */}
      <div style={{ padding: '10px 12px 0 12px', borderBottom: '1px solid #27272a' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Satellite size={13} style={{ color: '#38bdf8' }} />
            <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.3px' }}>IMAGERY & ANALYTICS</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: 3, display: 'flex' }}>
            <X size={15} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4, paddingBottom: 8 }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                padding: '6px 8px',
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 7,
                border: '1px solid',
                borderColor: tab === t.id ? 'rgba(56, 189, 248, 0.5)' : '#27272a',
                backgroundColor: tab === t.id ? 'rgba(56, 189, 248, 0.14)' : 'transparent',
                color: tab === t.id ? '#38bdf8' : '#a1a1aa',
                cursor: 'pointer'
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* SATELLITE FRAMES STREAM TAB */}
        {tab === 'frames' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 800,
              color: '#38bdf8',
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 4,
              borderBottom: '1px solid #27272a'
            }}>
              <span>Satellite Imagery Stream ({cityName})</span>
              <span style={{ fontSize: 9.5, color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '1px 6px', borderRadius: 4 }}>
                {allFrames.length} Passes
              </span>
            </div>

            {allFrames.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '16px', color: '#94a3b8', fontSize: 12 }}>
                <Loader2 size={15} style={{ animation: 'spin 1s linear infinite', color: '#38bdf8' }} />
                Fetching Sentinel-2 satellite passes for {cityName}...
              </div>
            ) : (
              allFrames.map((frame, idx) => (
                <FrameCard key={frame.id || idx} frame={frame} onOverlay={handleOverlay} />
              ))
            )}
            <TimelineScrubber />
          </div>
        )}

        {/* NDWI TAB (Conditioned on NDWI presence) */}
        {tab === 'ndwi' && (
          <>
            {imagery?.ndwiStats ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8
              }}>
                {[
                  { label: 'Water Coverage', value: `${imagery.ndwiStats.water_pct}%` },
                  { label: 'Mean NDWI', value: `${imagery.ndwiStats.mean_ndwi > 0 ? '+' : ''}${imagery.ndwiStats.mean_ndwi}` },
                  { label: 'Scene Date', value: imagery.ndwiStats.scene_date || '—' },
                  { label: 'Cloud Cover', value: `${Math.round(imagery.ndwiStats.cloud_pct ?? 0)}%` }
                ].map(s => (
                  <div key={s.label} style={{
                    backgroundColor: 'rgba(24, 24, 27, 0.9)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    borderRadius: 9,
                    padding: '9px 11px'
                  }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>{s.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#38bdf8' }}>{s.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px', color: '#94a3b8', fontSize: 12 }}>
                <CloudSun size={15} />
                NDWI spectral indices available when water analysis is active.
              </div>
            )}
          </>
        )}

        {/* CHARTS TAB */}
        {tab === 'charts' && (
          latestDeliverables ? (
            <>
              {latestDeliverables.verification && (
                <div style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: '#10b981',
                  backgroundColor: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '9px 12px',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <ShieldCheck size={13} />
                    Ground-Truth Engine: {latestDeliverables.verification.truthfulness_score}
                  </span>
                  <span style={{ color: '#38bdf8' }}>{latestDeliverables.verification.copernicus_ground_truth_match}</span>
                </div>
              )}
              {latestDeliverables.telemetry && (
                <div style={{
                  fontSize: 10,
                  color: '#94a3b8',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  backgroundColor: '#09090b',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(56, 189, 248, 0.2)'
                }}>
                  <span><strong style={{ color: '#38bdf8' }}>Model:</strong> {latestDeliverables.telemetry.model_name}</span>
                  <span><strong style={{ color: '#38bdf8' }}>Confidence:</strong> {latestDeliverables.telemetry.confidence_score_pct}%</span>
                </div>
              )}
              {latestDeliverables.metrics && <MetricCardGrid metrics={latestDeliverables.metrics} />}
              {(latestDeliverables.lineChartData || latestDeliverables.donutChartData) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {latestDeliverables.lineChartData && <LineChartCard data={latestDeliverables.lineChartData} />}
                  {latestDeliverables.donutChartData && <DonutChartCard data={latestDeliverables.donutChartData} />}
                </div>
              )}
              {(latestDeliverables.metrics || latestDeliverables.gallery) && (
                <ExportActions selectedCity={cityName} selectedState={stateName} summaryText={summaryText} />
              )}
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px', color: '#94a3b8', fontSize: 12 }}>
              <BarChart3 size={15} />
              Run an analysis query — charts and metric cards land here.
            </div>
          )
        )}
      </div>

      {/* Footer download hint */}
      <div style={{
        borderTop: '1px solid #27272a',
        padding: '8px 14px',
        fontSize: 10,
        color: '#71717a',
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }}>
        <Download size={11} />
        Sources: Copernicus Sentinel-2 L2A · NASA GIBS · Esri World Imagery
      </div>
    </aside>
  );
}
