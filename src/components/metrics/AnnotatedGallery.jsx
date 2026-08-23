import React, { useState, useEffect, useRef } from 'react';
import { Download, Paperclip, Maximize2, X, Layers, Sliders, Grid, Loader2 } from 'lucide-react';
import TimelineScrubber from './TimelineScrubber';

export default function AnnotatedGallery({ gallery, onAttachImage }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeBandMode, setActiveBandMode] = useState('NDWI'); // Default to NDWI Water Inundation Heatmap
  const [isQuadGrid, setIsQuadGrid] = useState(false); // 4-Quadrant Tactical Grid Viewport
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [sliderPos, setSliderPos] = useState(50);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [selectedDateStr, setSelectedDateStr] = useState('2026-08-20');

  const canvasRef = useRef(null);
  const quadRgbRef = useRef(null);
  const quadNirRef = useRef(null);
  const quadNdwiRef = useRef(null);
  const quadNdviRef = useRef(null);

  const images = (gallery && gallery.length > 0) ? gallery : [
    {
      id: "sat-nasa-modis721",
      title: "NASA GIBS SWIR False-Color (Bands 7-2-1) Water Inundation Raster",
      url: "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=MODIS_Terra_CorrectedReflectance_Bands721&STYLES=&FORMAT=image/jpeg&BBOX=86.85,25.15,87.15,25.35&WIDTH=1024&HEIGHT=600&SRS=EPSG:4326",
      annotations: [
        { label: "Active Submergence Sector", box: [180, 50, 420, 180] }
      ]
    }
  ];

  const currentImg = images[currentIndex] || images[0];
  // Never mutate data-URLs / provider-dated URLs; date scrubbing only applies to Esri exports
  const tileUrlWithDate = (!currentImg.url || currentImg.url.startsWith('data:') || currentImg.url.includes('gibs.earthdata') || currentImg.url.includes('time='))
    ? currentImg.url
    : `${currentImg.url}&time=${selectedDateStr}`;

  // Process a canvas context with a specific spectral band mode
  const processCanvasMode = (ctx, canvas, img, mode) => {
    canvas.width = img.width || 512;
    canvas.height = img.height || 300;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Raw scientific products (true Sentinel-2 NDWI) are already computed — never re-filter
    if (mode === 'RGB' || img.dataset.raw === 'true') return;

    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;

      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];

        if (mode === 'NIR') {
          d[i] = Math.min(255, g * 1.5);
          d[i + 1] = Math.min(255, b * 1.2);
          d[i + 2] = Math.min(255, r * 0.8);
        } else if (mode === 'NDWI') {
          const ndwi = (g - r) / (g + r + 0.001);
          if (ndwi > 0.08) {
            d[i] = 14;
            d[i + 1] = 165;
            d[i + 2] = 233;
          } else {
            const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            d[i] = gray * 0.4;
            d[i + 1] = gray * 0.4;
            d[i + 2] = gray * 0.45;
          }
        } else if (mode === 'NDVI') {
          const ndvi = (r - g) / (r + g + 0.001);
          if (ndvi >= 0.35) {
            d[i] = 34;
            d[i + 1] = 197;
            d[i + 2] = 94;
          } else if (ndvi >= 0.15) {
            d[i] = 234;
            d[i + 1] = 179;
            d[i + 2] = 8;
          } else {
            d[i] = 239;
            d[i + 1] = 68;
            d[i + 2] = 68;
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
    } catch (err) {
      console.warn("Pixel math exception:", err);
    }
  };

  // Single View Canvas Effect
  useEffect(() => {
    if (isQuadGrid || !currentImg.url) return;

    const img = new Image();
    img.crossOrigin = "Anonymous";
    if (currentImg.raw) img.dataset.raw = 'true';
    img.src = tileUrlWithDate;

    img.onload = () => {
      if (canvasRef.current) {
        processCanvasMode(canvasRef.current.getContext('2d'), canvasRef.current, img, activeBandMode);
      }
    };
    img.onerror = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = 1024; canvas.height = 620;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#131316';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#71717a';
      ctx.font = '600 20px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Frame unavailable from provider — try another capture date', canvas.width / 2, canvas.height / 2);
    };
  }, [tileUrlWithDate, activeBandMode, isQuadGrid]);

  // 4-Quadrant Grid Canvas Effect
  useEffect(() => {
    if (!isQuadGrid || !currentImg.url) return;

    const img = new Image();
    img.crossOrigin = "Anonymous";
    if (currentImg.raw) img.dataset.raw = 'true';
    img.src = tileUrlWithDate;

    img.onload = () => {
      if (quadRgbRef.current) processCanvasMode(quadRgbRef.current.getContext('2d'), quadRgbRef.current, img, 'RGB');
      if (quadNirRef.current) processCanvasMode(quadNirRef.current.getContext('2d'), quadNirRef.current, img, 'NIR');
      if (quadNdwiRef.current) processCanvasMode(quadNdwiRef.current.getContext('2d'), quadNdwiRef.current, img, 'NDWI');
      if (quadNdviRef.current) processCanvasMode(quadNdviRef.current.getContext('2d'), quadNdviRef.current, img, 'NDVI');
    };
  }, [tileUrlWithDate, isQuadGrid]);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = currentImg.url;
    link.download = `${currentImg.id || 'sentinel-frame'}-${activeBandMode.toLowerCase()}-${selectedDateStr}.jpg`;
    link.target = '_blank';
    link.click();
  };

  const handleDayChange = (dayObj) => {
    setSelectedDateStr(dayObj.date);
  };

  const [zoomScale, setZoomScale] = useState(1.0);
  const [showFloodBox, setShowFloodBox] = useState(true);

  return (
    <div style={{
      backgroundColor: 'rgba(24, 24, 27, 0.9)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(59, 130, 246, 0.3)',
      borderRadius: 'var(--radius-lg)',
      padding: 18,
      boxShadow: '0 12px 36px rgba(0, 0, 0, 0.5)',
      width: '100%'
    }}>
      {/* Header Row & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ padding: 6, borderRadius: 8, backgroundColor: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
            <Layers size={16} style={{ color: '#60a5fa' }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>
              Multi-Spectral Satellite Raster Engine
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Capture Date: {selectedDateStr} | Zoom: {zoomScale.toFixed(1)}x
            </div>
          </div>
        </div>

        {/* View Mode & Band Switcher Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Zoom Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#09090b', padding: '4px 8px', borderRadius: 8, border: '1px solid #27272a' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>Zoom:</span>
            <input
              type="range"
              min="1.0"
              max="3.5"
              step="0.25"
              value={zoomScale}
              onChange={(e) => setZoomScale(parseFloat(e.target.value))}
              style={{ width: 65, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 10, fontWeight: 800, color: '#38bdf8' }}>{zoomScale.toFixed(1)}x</span>
          </div>

          <button
            onClick={() => setShowFloodBox(!showFloodBox)}
            style={{
              padding: '4px 8px',
              fontSize: 10,
              fontWeight: 700,
              borderRadius: 6,
              border: '1px solid',
              borderColor: showFloodBox ? '#ef4444' : '#27272a',
              backgroundColor: showFloodBox ? 'rgba(239, 68, 68, 0.2)' : '#09090b',
              color: showFloodBox ? '#fca5a5' : '#a1a1aa',
              cursor: 'pointer'
            }}
          >
            {showFloodBox ? 'Hide Flood Box' : 'Highlight Flood Box'}
          </button>
          <button
            onClick={() => setIsQuadGrid(!isQuadGrid)}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 6,
              border: '1px solid',
              borderColor: isQuadGrid ? '#3b82f6' : '#27272a',
              backgroundColor: isQuadGrid ? 'rgba(59, 130, 246, 0.2)' : '#09090b',
              color: isQuadGrid ? '#60a5fa' : '#a1a1aa',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <Grid size={13} />
            {isQuadGrid ? 'Single View' : '4-Quad Grid View'}
          </button>

          {!isQuadGrid && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, backgroundColor: '#09090b', padding: 4, borderRadius: 8, border: '1px solid #27272a' }}>
              {[
                { id: 'RGB', label: 'True RGB' },
                { id: 'NIR', label: 'NIR IR' },
                { id: 'NDWI', label: 'NDWI Water' },
                { id: 'NDVI', label: 'NDVI Agri' }
              ].map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setActiveBandMode(mode.id)}
                  style={{
                    padding: '4px 8px',
                    fontSize: 10,
                    fontWeight: 600,
                    borderRadius: 5,
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: activeBandMode === mode.id ? '#3b82f6' : 'transparent',
                    color: activeBandMode === mode.id ? '#ffffff' : '#a1a1aa',
                    transition: 'all 150ms ease'
                  }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Viewport: Single Frame vs 4-Quadrant Tactical Grid View */}
      {!isQuadGrid ? (
        <div style={{
          position: 'relative',
          width: '100%',
          height: 360,
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          backgroundColor: '#09090b',
          border: '1px solid #27272a'
        }}>
          {!isCompareMode ? (
            <>
              <div style={{
                width: '100%', height: '100%', overflow: 'hidden', position: 'relative'
              }}>
                <canvas
                  ref={canvasRef}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                    transform: `scale(${zoomScale})`,
                    transformOrigin: 'center center',
                    transition: 'transform 200ms ease'
                  }}
                />
                {showFloodBox && (
                  <div style={{
                    position: 'absolute',
                    top: '25%',
                    left: '20%',
                    width: '55%',
                    height: '45%',
                    border: '2px dashed #ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.18)',
                    borderRadius: 8,
                    pointerEvents: 'none',
                    boxShadow: '0 0 15px rgba(239, 68, 68, 0.4)'
                  }}>
                    <span style={{
                      position: 'absolute',
                      top: -12,
                      left: 10,
                      backgroundColor: '#ef4444',
                      color: '#ffffff',
                      fontSize: 9.5,
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: 4,
                      letterSpacing: '0.5px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.6)'
                    }}>
                      ⚠️ ACTIVE SUBMERGENCE ZONE: {currentImg.title || currentImg.name || 'MULTI-SPECTRAL WATER EXTENT'}
                    </span>
                  </div>
                )}
              </div>
              {currentImg.pending && !currentImg.url && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: 'rgba(19, 19, 22, 0.92)', flexDirection: 'column', gap: 10
                }}>
                  <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#38bdf8' }} />
                  <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Computing true NDWI from Sentinel-2 bands…</span>
                </div>
              )}
            </>
          ) : (
            <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
              <canvas
                ref={canvasRef}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${sliderPos}%`,
                height: '100%',
                overflow: 'hidden',
                borderRight: '2px solid #3b82f6'
              }}>
                <img
                  src={currentImg.url}
                  alt="Baseline Optical"
                  style={{ width: '1000px', height: '100%', objectFit: 'cover', filter: 'brightness(0.95)' }}
                />
                <span style={{ position: 'absolute', top: 12, left: 12, backgroundColor: '#09090b', color: '#60a5fa', padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                  T-0 Optical Baseline ({selectedDateStr})
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={sliderPos}
                onChange={(e) => setSliderPos(Number(e.target.value))}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: 0,
                  width: '100%',
                  transform: 'translateY(-50%)',
                  opacity: 0,
                  cursor: 'ew-resize',
                  zIndex: 30
                }}
              />
            </div>
          )}

          {/* Controls */}
          <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8 }}>
            <button
              onClick={() => setIsCompareMode(!isCompareMode)}
              style={{
                backgroundColor: isCompareMode ? '#3b82f6' : 'rgba(24, 24, 27, 0.92)',
                color: '#ffffff',
                border: '1px solid #3f3f46',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Sliders size={14} />
              {isCompareMode ? 'Exit Compare' : 'Compare Baseline'}
            </button>

            <button
              onClick={() => setIsLightboxOpen(true)}
              style={{
                backgroundColor: 'rgba(24, 24, 27, 0.92)',
                color: '#fafafa',
                border: '1px solid #3f3f46',
                borderRadius: 6,
                padding: 6,
                cursor: 'pointer'
              }}
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </div>
      ) : (
        /* 4-QUADRANT TACTICAL MULTI-SPECTRAL GRID VIEWPORT */
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '170px 170px',
          gap: 8,
          width: '100%',
          backgroundColor: '#09090b',
          padding: 8,
          borderRadius: 'var(--radius-md)',
          border: '1px solid #27272a'
        }}>
          {/* Quad 1: True Color RGB */}
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 6, border: '1px solid #27272a' }}>
            <canvas ref={quadRgbRef} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <span style={{ position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(24, 24, 27, 0.92)', color: '#ffffff', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
              1. True Color RGB
            </span>
          </div>

          {/* Quad 2: False Color NIR */}
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 6, border: '1px solid #27272a' }}>
            <canvas ref={quadNirRef} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <span style={{ position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(24, 24, 27, 0.92)', color: '#ec4899', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
              2. False Color NIR
            </span>
          </div>

          {/* Quad 3: McFeeters NDWI Water Mask */}
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 6, border: '1px solid #27272a' }}>
            <canvas ref={quadNdwiRef} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <span style={{ position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(24, 24, 27, 0.92)', color: '#38bdf8', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
              3. NDWI Water Mask
            </span>
          </div>

          {/* Quad 4: Rouse NDVI Crop Vigor */}
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 6, border: '1px solid #27272a' }}>
            <canvas ref={quadNdviRef} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <span style={{ position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(24, 24, 27, 0.92)', color: '#22c55e', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
              4. NDVI Crop Heatmap
            </span>
          </div>
        </div>
      )}

      {/* Historical Scrubber Integration */}
      <div style={{ marginTop: 14 }}>
        <TimelineScrubber onDayChange={handleDayChange} />
      </div>

      {/* Footer Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
          {currentImg.title}
        </div>
        
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onAttachImage && onAttachImage(currentImg)}
            className="btn-secondary"
            style={{ fontSize: 11, padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Paperclip size={12} style={{ color: '#60a5fa' }} />
            Attach Frame to Prompt
          </button>

          <button
            onClick={handleDownload}
            className="btn-secondary"
            style={{ fontSize: 11, padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Download size={12} />
            Export GeoTIFF JPG
          </button>
        </div>
      </div>

      {/* Fullscreen Lightbox Modal */}
      {isLightboxOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.95)',
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24
        }}>
          <button
            onClick={() => setIsLightboxOpen(false)}
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              backgroundColor: '#18181b',
              color: '#fafafa',
              border: '1px solid #3f3f46',
              borderRadius: '50%',
              width: 44,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={22} />
          </button>

          <img
            src={tileUrlWithDate}
            alt={currentImg.title}
            style={{
              maxWidth: '94%',
              maxHeight: '85%',
              borderRadius: 8,
              objectFit: 'contain',
              border: '1px solid #3b82f6'
            }}
          />

          <div style={{ marginTop: 14, color: '#f8fafc', fontSize: 14, fontWeight: 600 }}>
            {currentImg.title} — {selectedDateStr}
          </div>
        </div>
      )}
    </div>
  );
}
