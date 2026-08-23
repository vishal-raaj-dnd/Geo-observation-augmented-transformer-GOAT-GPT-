import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

export default function TimelineScrubber({ frames = [], onDayChange }) {
  // Construct dynamic timeline passes from real satellite frames
  const days = frames.length > 0
    ? frames.map((f, i) => ({
        label: f.date ? `Pass ${i + 1} (${f.date})` : `Pass ${i + 1}`,
        date: f.date || 'Live Capture',
        status: f.sensor || 'Sentinel-2 L2A STAC',
        water_pct: f.water_pct || (f.cloud_cover ? `Cloud: ${f.cloud_cover}` : 'Active'),
        ndwi: f.ndwi || 'Computed',
        frame: f
      }))
    : [
        { label: "Baseline Capture (T-Pre)", date: "Pre-event", status: "Sentinel-2 L2A 10m", water_pct: "Baseline", ndwi: "Reference" },
        { label: "Peak Flood Pass (T-Post)", date: "Active Event", status: "Sentinel-2 L2A 10m", water_pct: "Inundation", ndwi: "Evaluated" }
      ];

  const [activeDayIdx, setActiveDayIdx] = useState(0);

  const safeIdx = Math.min(activeDayIdx, Math.max(0, days.length - 1));
  const currentDay = days[safeIdx] || {
    label: "Scene Pass",
    date: "Live",
    status: "Sentinel-2 MSI",
    water_pct: "—",
    ndwi: "—"
  };

  const handleSelectDay = (idx) => {
    const clamped = Math.max(0, Math.min(idx, days.length - 1));
    setActiveDayIdx(clamped);
    if (onDayChange && days[clamped]) onDayChange(days[clamped]);
  };

  const handlePrev = () => {
    const nextIdx = safeIdx === 0 ? days.length - 1 : safeIdx - 1;
    handleSelectDay(nextIdx);
  };

  const handleNext = () => {
    const nextIdx = safeIdx === days.length - 1 ? 0 : safeIdx + 1;
    handleSelectDay(nextIdx);
  };

  return (
    <div style={{
      backgroundColor: 'rgba(24, 24, 27, 0.85)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(59, 130, 246, 0.3)',
      borderRadius: 'var(--radius-lg)',
      padding: '12px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={15} style={{ color: '#60a5fa' }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#ffffff' }}>
              Multi-Temporal Satellite Image Timeline
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
              <span>{currentDay.label} ({currentDay.date}) — {currentDay.status}</span>
              <span style={{ backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                Water: {currentDay.water_pct}
              </span>
              <span style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                NDWI: {currentDay.ndwi}
              </span>
            </div>
          </div>
        </div>

        {/* Arrow Scrubbing Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={handlePrev}
            className="btn-secondary"
            style={{ padding: '6px 10px', fontSize: 11 }}
            title="Scrub to Previous Day Satellite Capture"
          >
            <ChevronLeft size={14} />
          </button>

          <button
            onClick={handleNext}
            className="btn-secondary"
            style={{ padding: '6px 10px', fontSize: 11 }}
            title="Scrub to Next Day Satellite Capture"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Interactive Timeline Day Chips */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingTop: 4 }}>
        {days.map((d, idx) => (
          <button
            key={idx}
            onClick={() => handleSelectDay(idx)}
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              border: '1px solid',
              borderColor: safeIdx === idx ? '#3b82f6' : '#27272a',
              backgroundColor: safeIdx === idx ? 'rgba(59, 130, 246, 0.2)' : 'rgba(9, 9, 11, 0.6)',
              color: safeIdx === idx ? '#60a5fa' : '#a1a1aa',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              textAlign: 'center'
            }}
          >
            {d.label}
          </button>
        ))}
      </div>
    </div>
  );
}
