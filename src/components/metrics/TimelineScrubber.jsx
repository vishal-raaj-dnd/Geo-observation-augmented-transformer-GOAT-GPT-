import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

export default function TimelineScrubber({ onDayChange }) {
  const days = [
    { label: "T-3 Days", date: "2026-08-17", status: "Pre-event baseline capture", water_pct: "2.1%", ndwi: "-0.214", cloud: "3.2%" },
    { label: "T-2 Days", date: "2026-08-18", status: "Rainfall initiation pass", water_pct: "8.1%", ndwi: "+0.015", cloud: "4.8%" },
    { label: "T-1 Day", date: "2026-08-19", status: "Peak surge onset capture", water_pct: "14.2%", ndwi: "+0.082", cloud: "2.1%" },
    { label: "Today (T0)", date: "2026-08-20", status: "Max inundation multi-spectral pass", water_pct: "18.5%", ndwi: "+0.140", cloud: "1.2%" }
  ];

  const [activeDayIdx, setActiveDayIdx] = useState(3);

  const handleSelectDay = (idx) => {
    setActiveDayIdx(idx);
    if (onDayChange) onDayChange(days[idx]);
  };

  const handlePrev = () => {
    const nextIdx = activeDayIdx === 0 ? days.length - 1 : activeDayIdx - 1;
    handleSelectDay(nextIdx);
  };

  const handleNext = () => {
    const nextIdx = activeDayIdx === days.length - 1 ? 0 : activeDayIdx + 1;
    handleSelectDay(nextIdx);
  };

  const currentDay = days[activeDayIdx];

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
              borderColor: activeDayIdx === idx ? '#3b82f6' : '#27272a',
              backgroundColor: activeDayIdx === idx ? 'rgba(59, 130, 246, 0.2)' : 'rgba(9, 9, 11, 0.6)',
              color: activeDayIdx === idx ? '#60a5fa' : '#a1a1aa',
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
