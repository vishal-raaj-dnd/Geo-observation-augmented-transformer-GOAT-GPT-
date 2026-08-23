import React, { useState, useRef } from 'react';
import { Move, Layers, Maximize2 } from 'lucide-react';
import Map3DCanvas from './Map3DCanvas';

export default function MovableMapWidget({ selectedCity, selectedState, selectedCityCoords, isSatellite, setIsSatellite, onExpandMap }) {
  const [position, setPosition] = useState({ x: window.innerWidth - 310, y: window.innerHeight - 260 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0 });

  const handleMouseDown = (e) => {
    // Only trigger drag on header handle
    if (e.target.closest('.map-drag-handle')) {
      setIsDragging(true);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        posX: position.x,
        posY: position.y
      };
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPosition({
      x: Math.max(10, Math.min(window.innerWidth - 290, dragRef.current.posX + dx)),
      y: Math.max(10, Math.min(window.innerHeight - 240, dragRef.current.posY + dy))
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  React.useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Keep the widget reachable when the browser window shrinks
  React.useEffect(() => {
    const clampPosition = () => {
      setPosition(prev => ({
        x: Math.max(10, Math.min(window.innerWidth - 290, prev.x)),
        y: Math.max(10, Math.min(window.innerHeight - 240, prev.y))
      }));
    };
    window.addEventListener('resize', clampPosition);
    return () => window.removeEventListener('resize', clampPosition);
  }, []);

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: 280,
        height: 230,
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        border: '2px solid var(--border-focus)',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.7)',
        zIndex: 90,
        backgroundColor: '#09090b',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none'
      }}
    >
      {/* Draggable Header Handle */}
      <div
        className="map-drag-handle"
        style={{
          height: 32,
          backgroundColor: '#18181b',
          borderBottom: '1px solid #27272a',
          padding: '0 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
          <Move size={13} />
          Movable 3D Map
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {onExpandMap && (
            <button
              onClick={onExpandMap}
              title="Expand to Full Map View"
              style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: 2 }}
            >
              <Maximize2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Map View */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Map3DCanvas
          selectedCity={selectedCity}
          selectedState={selectedState}
          selectedCityCoords={selectedCityCoords}
          isSatellite={isSatellite}
          setIsSatellite={setIsSatellite}
          isMinimized={true}
          isIntro={false}
        />
      </div>
    </div>
  );
}
