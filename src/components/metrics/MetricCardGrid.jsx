import React from 'react';
import { ShieldAlert, Droplets, Wheat, Users, Building2, CheckCircle2 } from 'lucide-react';

export default function MetricCardGrid({ metrics }) {
  if (!metrics) return null;

  const rawFlooded = metrics.flooded_area_sqkm || "0.0 km²";
  const floodedSqkm = String(rawFlooded).replace(/[^0-9.]/g, '') || "0.0";
  const isZeroFlooded = parseFloat(floodedSqkm) === 0;

  const rawPop = metrics.affected_population || "0";
  const popCount = typeof rawPop === 'number' ? rawPop.toLocaleString() : String(rawPop).replace(/[^0-9,]/g, '') || "0";

  const rawNdwi = metrics.mean_ndwi_score || "+0.08";
  const ndwiScore = String(rawNdwi).includes('+') ? String(rawNdwi) : `+${rawNdwi}`;

  const sectorType = metrics.sector_classification || "Metropolitan Sector";

  // Build Card List dynamically based on location profile (Cropland vs Urban Metropolitan)
  const cards = [
    {
      id: "severity",
      title: "Remote Sensing Status",
      value: ndwiScore,
      unit: "NDWI Score",
      badge: isZeroFlooded ? "NORMAL BASELINE" : "CRITICAL SUBMERGENCE",
      badgeColor: isZeroFlooded ? "#10b981" : "#ef4444",
      icon: isZeroFlooded ? <CheckCircle2 size={18} style={{ color: '#10b981' }} /> : <ShieldAlert size={18} style={{ color: '#ef4444' }} />,
      glowColor: isZeroFlooded ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
      borderColor: isZeroFlooded ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)",
      subtext: isZeroFlooded ? "Water Index Below Flood Baseline" : "McFeeters Inundation > +0.20"
    },
    {
      id: "flooded_area",
      title: "Surface Water Coverage",
      value: `${floodedSqkm}`,
      unit: "km²",
      badge: isZeroFlooded ? "0 Hectares Inundated" : `${(parseFloat(floodedSqkm) * 100).toLocaleString()} Ha`,
      badgeColor: "#38bdf8",
      icon: <Droplets size={18} style={{ color: '#38bdf8' }} />,
      glowColor: "rgba(56, 189, 248, 0.15)",
      borderColor: "rgba(56, 189, 248, 0.3)",
      subtext: isZeroFlooded ? "Permanent Estuaries / Waterways" : "Calculated Water Surface"
    }
  ];

  // If Cropland data exists (Agricultural District), render Cropland Loss Card; else render Urban Sector Classification Card
  if (metrics.crop_loss_sqkm) {
    const rawCropLoss = metrics.crop_loss_sqkm;
    const cropLossSqkm = String(rawCropLoss).replace(/[^0-9.]/g, '') || "0.0";
    const cropLossHa = (parseFloat(cropLossSqkm) * 100).toLocaleString();
    const estLossCr = (parseFloat(cropLossSqkm) * 0.44).toFixed(1);

    cards.push({
      id: "crop_loss",
      title: "Cropland Damage Valuation",
      value: `₹${estLossCr}`,
      unit: "Crore Est.",
      badge: `${cropLossSqkm} km² (${cropLossHa} Ha)`,
      badgeColor: "#f59e0b",
      icon: <Wheat size={18} style={{ color: '#f59e0b' }} />,
      glowColor: "rgba(245, 158, 11, 0.15)",
      borderColor: "rgba(245, 158, 11, 0.3)",
      subtext: "Paddy & Crop Submergence"
    });
  } else {
    cards.push({
      id: "urban_sector",
      title: "LULC Land-Use Profile",
      value: "Urban Grid",
      unit: "Metropolitan",
      badge: `${sectorType}`,
      badgeColor: "#38bdf8",
      icon: <Building2 size={18} style={{ color: '#38bdf8' }} />,
      glowColor: "rgba(56, 189, 248, 0.15)",
      borderColor: "rgba(56, 189, 248, 0.3)",
      subtext: "0% Commercial Cropland Present"
    });
  }

  // Population / Demographic Risk Card
  cards.push({
    id: "population",
    title: "Demographic Exposure",
    value: `${popCount}`,
    unit: isZeroFlooded ? "Population Safe" : "Residents Exposed",
    badge: isZeroFlooded ? "No Flood Threat" : "High Risk Municipal Wards",
    badgeColor: isZeroFlooded ? "#10b981" : "#a855f7",
    icon: <Users size={18} style={{ color: isZeroFlooded ? '#10b981' : '#c084fc' }} />,
    glowColor: isZeroFlooded ? "rgba(16, 185, 129, 0.15)" : "rgba(168, 85, 247, 0.15)",
    borderColor: isZeroFlooded ? "rgba(16, 185, 129, 0.3)" : "rgba(168, 85, 247, 0.3)",
    subtext: isZeroFlooded ? "Baseline Municipal Monitoring" : "Low-lying Sector Wards"
  });

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
      gap: 12,
      width: '100%'
    }}>
      {cards.map((card) => (
        <div
          key={card.id}
          style={{
            backgroundColor: 'rgba(24, 24, 27, 0.85)',
            backdropFilter: 'blur(12px)',
            border: `1px solid ${card.borderColor}`,
            borderRadius: 'var(--radius-lg)',
            padding: '16px 18px',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: `0 8px 24px ${card.glowColor}`,
            transition: 'transform 200ms ease, box-shadow 200ms ease'
          }}
        >
          <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', backgroundColor: card.glowColor, filter: 'blur(20px)', pointerEvents: 'none' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {card.title}
            </span>
            <div style={{ padding: 6, borderRadius: 8, backgroundColor: 'rgba(9, 9, 11, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              {card.icon}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.8px', lineHeight: 1 }}>
              {card.value}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {card.unit}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              color: card.badgeColor,
              backgroundColor: `rgba(${card.badgeColor === '#ef4444' ? '239, 68, 68' : card.badgeColor === '#10b981' ? '16, 185, 129' : card.badgeColor === '#38bdf8' ? '56, 189, 248' : card.badgeColor === '#f59e0b' ? '245, 158, 11' : '168, 85, 247'}, 0.12)`,
              padding: '3px 8px',
              borderRadius: 6,
              border: `1px solid ${card.badgeColor}40`,
              width: 'fit-content',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: card.badgeColor }} />
              {card.badge}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {card.subtext}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
