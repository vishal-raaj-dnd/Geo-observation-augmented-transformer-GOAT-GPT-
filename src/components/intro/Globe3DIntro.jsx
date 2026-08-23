import React, { useState } from 'react';
import { ArrowRight, Satellite, Sparkle } from 'lucide-react';
const globeVideoSrc = '/intro-globe.mp4';

export default function Globe3DIntro({ onGetStarted }) {
  const [isZoomingIn, setIsZoomingIn] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);

  const handleStartClick = () => {
    setIsZoomingIn(true);
    setTimeout(() => {
      if (onGetStarted) onGetStarted();
    }, 450);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: '#050506',
      zIndex: 100,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {/* Rotating Dotted-Earth Video Backdrop */}
      <video
        src={globeVideoSrc}
        autoPlay
        muted
        loop
        playsInline
        onCanPlay={() => setIsVideoReady(true)}
        onPlaying={() => setIsVideoReady(true)}
        onError={() => setIsVideoReady(true)} // never trap the user behind a broken video
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          zIndex: 1,
          opacity: isVideoReady ? 1 : 0,
          transform: isZoomingIn ? 'scale(2.2)' : 'scale(1)',
          transitionProperty: 'opacity, transform',
          transitionDuration: isZoomingIn ? '450ms, 500ms' : '700ms, 0ms',
          transitionTimingFunction: 'ease-out, cubic-bezier(0.4, 0, 0.2, 1)',
          filter: 'brightness(0.92)'
        }}
      />

      {/* Cinematic Vignette Overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2,
        pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, rgba(5,5,6,0) 30%, rgba(5,5,6,0.55) 74%, rgba(5,5,6,0.95) 100%)'
      }} />

      {/* Revolving-Dot Pre-Loader (while the Earth video buffers) */}
      {!isVideoReady && (
        <div style={{
          position: 'absolute',
          bottom: 26,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 5,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 18px',
          borderRadius: 30,
          backgroundColor: 'rgba(18, 18, 21, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          backdropFilter: 'blur(8px)',
          animation: 'fade-in 300ms ease-out'
        }}>
          <span className="intro-loader-dot" />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', color: '#a1a1aa' }}>
            CALIBRATING ORBITAL VIEW
          </span>
        </div>
      )}

      {/* Hero Content Overlay */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        textAlign: 'center',
        maxWidth: 700,
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
        opacity: isZoomingIn ? 0 : 1,
        transform: isZoomingIn ? 'scale(1.08)' : 'scale(1)',
        transition: 'opacity 500ms ease-out, transform 900ms cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: isZoomingIn ? 'none' : 'auto'
      }}>
        <div style={{
          backgroundColor: 'rgba(18, 18, 21, 0.82)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: 20,
          padding: '6px 16px',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '1.2px',
          color: '#e4e4e7',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.6)'
        }}>
          <Satellite size={13} style={{ color: '#e4e4e7' }} />
          EARTH OBSERVATION &amp; DISASTER INTELLIGENCE PLATFORM
        </div>

        <h1 style={{
          margin: 0,
          fontSize: 52,
          fontWeight: 800,
          color: '#ffffff',
          letterSpacing: '-1.5px',
          lineHeight: 1.12,
          textShadow: '0 4px 28px rgba(0, 0, 0, 0.95)'
        }}>
          Real-Time Satellite Flood<br />Intelligence
        </h1>

        <p style={{
          margin: 0,
          fontSize: 15,
          color: '#9ca3af',
          lineHeight: 1.6,
          maxWidth: 520,
          textShadow: '0 2px 12px rgba(0, 0, 0, 0.9)'
        }}>
          Grounded AI monitoring powered by Qwen2.5-VL QLoRA, Sentinel-2 SAR
          telemetry, and 3D spatial analytics.
        </p>

        <button
          onClick={handleStartClick}
          className="btn-primary"
          style={{
            fontSize: 15,
            padding: '12px 30px',
            marginTop: 12,
            cursor: 'pointer',
            borderRadius: 8,
            backgroundColor: '#fafafa',
            color: '#09090b',
            fontWeight: 700,
            border: 'none',
            boxShadow: '0 6px 24px rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            transition: 'background-color var(--transition-fast), transform var(--transition-fast)'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e4e4e7'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#fafafa'; }}
        >
          Get Started
          <ArrowRight size={17} />
        </button>
      </div>

      {/* Faint Sparkle Glyph Bottom-Right */}
      <Sparkle
        size={44}
        style={{
          position: 'absolute',
          right: 48,
          bottom: 40,
          zIndex: 3,
          color: 'rgba(255, 255, 255, 0.22)',
          filter: 'drop-shadow(0 2px 12px rgba(255, 255, 255, 0.25))'
        }}
      />
    </div>
  );
}
