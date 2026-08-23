import React from 'react';
import { Send, ChevronDown } from 'lucide-react';
import { STATE_CITIES } from '../../data/cities';

export { STATE_CITIES };

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const YEARS = [2023, 2024, 2025, 2026, 2027];

export default function OverlayPanel({
  selectedState,
  setSelectedState,
  selectedCity,
  setSelectedCity,
  dateTime,
  setDateTime,
  prompt,
  setPrompt,
  onSendQuery
}) {
  const cityName = typeof selectedCity === 'object' ? selectedCity?.name : selectedCity;
  const cityOptions = STATE_CITIES[selectedState] || [cityName || 'Chennai'];

  // Parse current "Month Year" value into the two pickers
  const parts = (dateTime || '').trim().split(/\s+/);
  const initialMonth = MONTHS.find(m => m.toLowerCase() === (parts[0] || '').toLowerCase()) || 'August';
  const initialYear = YEARS.includes(Number(parts[1])) ? Number(parts[1]) : 2026;

  const pushDateTime = (month, year) => setDateTime(`${month} ${year}`);

  const handleStateChange = (e) => {
    const nextState = e.target.value;
    setSelectedState(nextState);
    const cities = STATE_CITIES[nextState];
    if (cities && cities.length > 0) setSelectedCity(cities[0]);
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (onSendQuery) onSendQuery();
  };

  const selectWrap = (value, onChange, children, disabled = false) => ({
    position: 'relative',
    children: (
      <>
        <select
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="input-field"
          style={{
            width: '100%', backgroundColor: 'var(--bg-input, #121215)', borderColor: 'var(--border-subtle, #27272a)',
            color: '#ffffff', fontSize: 13, padding: '8px 30px 8px 12px',
            borderRadius: 6, appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer'
          }}
        >
          {children}
        </select>
        <ChevronDown size={13} style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          color: '#64748b', pointerEvents: 'none'
        }} />
      </>
    )
  });

  return (
    <form onSubmit={handleSubmit} style={{
      width: 440,
      backgroundColor: 'rgba(24, 24, 27, 0.94)',
      backdropFilter: 'blur(20px)',
      border: '1px solid var(--border-subtle, #27272a)',
      borderRadius: 'var(--radius-lg, 12px)',
      padding: '24px 24px 20px 24px',
      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.75)',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      color: '#ffffff'
    }}>
      {/* Title */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#e4e4e7', boxShadow: '0 0 8px rgba(228, 228, 231, 0.6)' }} />
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.2px' }}>
            Dynamic Earth Observation Engine
          </h2>
        </div>
        <p style={{ fontSize: 11.5, color: '#a1a1aa', lineHeight: 1.4 }}>
          Live OSM boundary geocoding &amp; real Sentinel-2 spectral analysis.
        </p>
      </div>

      {/* State & City Dropdowns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>
            State / Region
          </label>
          {selectWrap(
            selectedState,
            handleStateChange,
            Object.keys(STATE_CITIES).map(s => (
              <option key={s} value={s}>{s}</option>
            ))
          ).children}
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>
            District / City
          </label>
          {selectWrap(
            cityName,
            (e) => setSelectedCity(e.target.value),
            cityOptions.map(c => (
              <option key={c} value={c}>{c}</option>
            ))
          ).children}
        </div>
      </div>

      {/* Timeframe — Month & Year pickers */}
      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>
          Timeframe / Period
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
          {selectWrap(
            initialMonth,
            (e) => pushDateTime(e.target.value, initialYear),
            MONTHS.map(m => <option key={m} value={m}>{m}</option>)
          ).children}
          {selectWrap(
            initialYear,
            (e) => pushDateTime(initialMonth, Number(e.target.value)),
            YEARS.map(y => <option key={y} value={y}>{y}</option>)
          ).children}
        </div>
      </div>

      {/* Mission Prompt Textarea */}
      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>
          Query / Mission Objective
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={`Inquire about flood depth, land-cover, or Sentinel water indices in ${cityName}...`}
          className="input-field"
          style={{ width: '100%', height: 75, resize: 'none', backgroundColor: 'var(--bg-input, #121215)', borderColor: 'var(--border-subtle, #27272a)', fontSize: 13, color: '#ffffff', padding: '8px 12px', borderRadius: 6 }}
        />
      </div>

      {/* Submit Action Button */}
      <button
        type="submit"
        className="btn-primary"
        style={{
          width: '100%',
          padding: '12px 18px',
          backgroundColor: 'var(--btn-primary-bg, #f4f4f5)',
          color: 'var(--btn-primary-text, #09090b)',
          fontWeight: 700,
          fontSize: 13.5,
          cursor: 'pointer',
          borderRadius: 'var(--radius-md, 8px)',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.55)',
          transition: 'background-color var(--transition-fast)'
        }}
      >
        <Send size={15} />
        Run Dynamic Earth Observation Analysis
      </button>
    </form>
  );
}
