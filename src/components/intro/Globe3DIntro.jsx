import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
const globeVideoSrc = '/intro-globe.mp4';

export default function Globe3DIntro({ onGetStarted }) {
  const [isZoomingIn, setIsZoomingIn] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);

  const handleStartClick = () => {
    setIsZoomingIn(true);
    setTimeout(() => {
      if (onGetStarted) onGetStarted();
    }, 750);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: '#09090b',
      zIndex: 100,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
    }}>
      {/* Video Container with Cropping to hide Gemini Logo watermark */}
      <div style={{
        position: 'absolute',
        top: '-4%',
        left: '-4%',
        width: '108%',
        height: '108%',
        overflow: 'hidden'
      }}>
        <video
          src={globeVideoSrc}
          autoPlay
          muted
          loop
          playsInline
          onCanPlay={() => setIsVideoReady(true)}
          onPlaying={() => setIsVideoReady(true)}
          onError={() => setIsVideoReady(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: isVideoReady ? 1 : 0,
            transform: isZoomingIn ? 'scale(1.85)' : 'scale(1.06)',
            transformOrigin: 'center center',
            transition: isZoomingIn
              ? 'transform 800ms cubic-bezier(0.25, 1, 0.5, 1), opacity 700ms ease-out'
              : 'opacity 500ms ease-out, transform 400ms ease-out',
            filter: 'brightness(0.88)'
          }}
        />
      </div>

      {/* Mask overlay for bottom-right corner to ensure Gemini logo is completely hidden */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 300,
        height: 110,
        zIndex: 2,
        pointerEvents: 'none',
        background: 'radial-gradient(ellipse at bottom right, rgba(9,9,11,1) 0%, rgba(9,9,11,0.95) 50%, rgba(9,9,11,0) 100%)'
      }} />

      {/* Charcoal Vignette Overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        zIndex: 3,
        pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, rgba(9,9,11,0) 20%, rgba(9,9,11,0.65) 70%, rgba(9,9,11,0.98) 100%)'
      }} />

      {/* Hero Content Overlay in Charcoal Theme */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        textAlign: 'center',
        maxWidth: 740,
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 22,
        opacity: isZoomingIn ? 0 : 1,
        transform: isZoomingIn ? 'scale(1.12)' : 'scale(1)',
        transition: 'opacity 500ms ease-out, transform 750ms cubic-bezier(0.25, 1, 0.5, 1)',
        pointerEvents: isZoomingIn ? 'none' : 'auto'
      }}>
        <h1 style={{
          margin: 0,
          fontSize: 54,
          fontWeight: 800,
          color: '#f4f4f5',
          letterSpacing: '-1.5px',
          lineHeight: 1.12,
          textShadow: '0 4px 30px rgba(9, 9, 11, 0.95)'
        }}>
          GEO Observation Augmented<br />Transformer (GOAT GPT)
        </h1>

        <p style={{
          margin: 0,
          fontSize: 15,
          color: '#a1a1aa',
          lineHeight: 1.65,
          maxWidth: 560,
          textShadow: '0 2px 14px rgba(9, 9, 11, 0.95)'
        }}>
          Real-time Earth Observation disaster intelligence, spatial analytics, and Sentinel-2 observation cockpit by Team ATLAS.
        </p>

        <button
          onClick={handleStartClick}
          style={{
            fontSize: 15,
            padding: '13px 34px',
            marginTop: 10,
            cursor: 'pointer',
            borderRadius: 8,
            backgroundColor: '#f4f4f5',
            color: '#09090b',
            fontWeight: 800,
            border: 'none',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            transition: 'all 180ms ease'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e4e4e7'; e.currentTarget.style.transform = 'scale(1.03)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f4f4f5'; e.currentTarget.style.transform = 'scale(1)'; }}
        >
          Get Started
          <ArrowRight size={17} />
        </button>
      </div>
    </div>
  );
}
