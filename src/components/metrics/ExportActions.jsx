import React from 'react';
import { FileText, Download, Check } from 'lucide-react';

export default function ExportActions({ onExportPdf, onExportGeoJson, selectedCity = "Bhagalpur", selectedState = "Bihar", summaryText = "" }) {
  const [downloadedPdf, setDownloadedPdf] = React.useState(false);
  const [downloadedGeoJson, setDownloadedGeoJson] = React.useState(false);

  const handlePdfClick = () => {
    setDownloadedPdf(true);
    if (onExportPdf) {
      onExportPdf();
    } else {
      // Generate Printable Executive PDF Window
      const printWin = window.open('', '_blank');
      if (printWin) {
        printWin.document.write(`
          <html>
            <head>
              <title>DRISHTI EO Executive Report - ${selectedCity}</title>
              <style>
                body { font-family: system-ui, sans-serif; padding: 40px; color: #111; line-height: 1.6; }
                h1 { border-bottom: 2px solid #2563eb; padding-bottom: 8px; color: #1e3a8a; }
                .badge { background: #ef4444; color: #fff; padding: 4px 10px; border-radius: 4px; font-weight: bold; font-size: 14px; }
                .meta { color: #555; font-size: 14px; margin-bottom: 20px; }
                .card { background: #f8fafc; border: 1px solid #cbd5e1; padding: 16px; border-radius: 8px; margin-top: 16px; }
                table { width: 100%; border-collapse: collapse; margin-top: 16px; }
                th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
                th { background: #f1f5f9; }
              </style>
            </head>
            <body>
              <h1>DRISHTI Earth Observation Assessment Report</h1>
              <div class="meta">Location: <strong>${selectedCity}, ${selectedState}</strong> | Timestamp: ${new Date().toLocaleString()}</div>
              <div><span class="badge">SEVERITY: CRITICAL</span></div>
              <div class="card">
                <h3>Executive Summary</h3>
                <p>${summaryText || `High-resolution Sentinel-2 SAR imagery reveals extensive flood inundation across ${selectedCity}. Priority evacuation recommended for low-lying sectors.`}</p>
              </div>
              <table>
                <thead>
                  <tr><th>Metric</th><th>Observed Value</th><th>Status</th></tr>
                </thead>
                <tbody>
                  <tr><td>Flooded Area</td><td>142.5 km² (38% of region)</td><td>Critical Breach</td></tr>
                  <tr><td>Peak Water Depth</td><td>3.4 meters</td><td>High Risk</td></tr>
                  <tr><td>Affected Population</td><td>48,500 residents</td><td>Evacuation Mandated</td></tr>
                </tbody>
              </table>
              <script>window.onload = function() { window.print(); }</script>
            </body>
          </html>
        `);
        printWin.document.close();
      }
    }
    setTimeout(() => setDownloadedPdf(false), 3000);
  };

  const handleGeoJsonClick = () => {
    setDownloadedGeoJson(true);
    if (onExportGeoJson) {
      onExportGeoJson();
    } else {
      // Generate GeoJSON Download Blob
      const geojsonPayload = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              region: selectedCity,
              state: selectedState,
              severity: "CRITICAL",
              inundated_area_sqkm: 142.5,
              sensor: "Sentinel-2 MSI / SAR",
              timestamp: new Date().toISOString()
            },
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [86.95, 25.20],
                  [87.05, 25.20],
                  [87.08, 25.30],
                  [86.92, 25.28],
                  [86.95, 25.20]
                ]
              ]
            }
          }
        ]
      };
      const blob = new Blob([JSON.stringify(geojsonPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `DRISHTI_Spatial_Flood_${selectedCity}_${Date.now()}.geojson`;
      link.click();
      URL.revokeObjectURL(url);
    }
    setTimeout(() => setDownloadedGeoJson(false), 3000);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
      <button
        onClick={handlePdfClick}
        className="btn-secondary"
        style={{ flex: 1, padding: '8px 12px', fontSize: 12, cursor: 'pointer' }}
      >
        {downloadedPdf ? <Check size={14} style={{ color: '#22c55e' }} /> : <FileText size={14} />}
        {downloadedPdf ? 'PDF Generated' : 'Export Executive PDF'}
      </button>

      <button
        onClick={handleGeoJsonClick}
        className="btn-secondary"
        style={{ flex: 1, padding: '8px 12px', fontSize: 12, cursor: 'pointer' }}
      >
        {downloadedGeoJson ? <Check size={14} style={{ color: '#22c55e' }} /> : <Download size={14} />}
        {downloadedGeoJson ? 'GeoJSON Downloaded' : 'Export Spatial GeoJSON'}
      </button>
    </div>
  );
}

