// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * CreativeAppSkeleton - Loading state for creative applications
 * Shows a professional loading state while heavy apps initialize
 */

import React from 'react';

interface CreativeAppSkeletonProps {
  type: 'image-editor' | 'audio-editor' | 'video-editor' | 'motion-graphics' | 'encoder' | 'cad' | 'code-editor';
  message?: string;
}

const shimmer = `
  @keyframes shimmer {
    from { background-position: -200% 0; }
    to { background-position: 200% 0; }
  }
`;

const ShimmerBlock: React.FC<{ width?: string; height?: string; rounded?: boolean; className?: string }> = ({ 
  width = '100%', 
  height = '20px', 
  rounded = true,
  className = '' 
}) => (
  <div
    className={className}
    style={{
      width,
      height,
      borderRadius: rounded ? '6px' : '0',
      background: 'linear-gradient(90deg, var(--color-bg-tertiary) 25%, var(--color-bg-secondary) 50%, var(--color-bg-tertiary) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s ease-in-out infinite',
    }}
  />
);

const ImageEditorSkeleton: React.FC = () => (
  <div style={{ display: 'flex', height: '100%', gap: 1 }}>
    {/* Left toolbar */}
    <div style={{ width: 48, background: 'var(--color-bg-secondary)', padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array(8).fill(0).map((_, i) => <ShimmerBlock key={i} width="32px" height="32px" />)}
    </div>
    {/* Canvas area */}
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 40, background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)' }} />
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--color-bg-primary)' }}>
        <ShimmerBlock width="60%" height="70%" />
      </div>
    </div>
    {/* Right panel */}
    <div style={{ width: 240, background: 'var(--color-bg-secondary)', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ShimmerBlock height="24px" />
      <ShimmerBlock height="120px" />
      <ShimmerBlock height="24px" />
      <ShimmerBlock height="80px" />
    </div>
  </div>
);

const AudioEditorSkeleton: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    {/* Transport bar */}
    <div style={{ height: 56, background: 'var(--color-bg-secondary)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
      <ShimmerBlock width="120px" height="32px" />
      <ShimmerBlock width="200px" height="32px" />
      <div style={{ flex: 1 }} />
      <ShimmerBlock width="80px" height="32px" />
    </div>
    {/* Timeline area */}
    <div style={{ flex: 1, display: 'flex' }}>
      {/* Track headers */}
      <div style={{ width: 180, background: 'var(--color-bg-secondary)', padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array(6).fill(0).map((_, i) => (
          <div key={i} style={{ height: 60, display: 'flex', flexDirection: 'column', gap: 4, padding: 8, background: 'var(--color-bg-tertiary)', borderRadius: 4 }}>
            <ShimmerBlock height="16px" width="80%" />
            <ShimmerBlock height="24px" width="60%" />
          </div>
        ))}
      </div>
      {/* Waveform area */}
      <div style={{ flex: 1, background: 'var(--color-bg-primary)', padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array(6).fill(0).map((_, i) => (
          <ShimmerBlock key={i} height="60px" rounded={false} />
        ))}
      </div>
    </div>
    {/* Mixer */}
    <div style={{ height: 120, background: 'var(--color-bg-secondary)', borderTop: '1px solid var(--color-border)', padding: 12, display: 'flex', gap: 8 }}>
      {Array(8).fill(0).map((_, i) => (
        <div key={i} style={{ width: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <ShimmerBlock width="40px" height="80px" />
          <ShimmerBlock width="48px" height="12px" />
        </div>
      ))}
    </div>
  </div>
);

const VideoEditorSkeleton: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <div style={{ flex: 1, display: 'flex' }}>
      {/* Media bin */}
      <div style={{ width: 220, background: 'var(--color-bg-secondary)', padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ShimmerBlock height="24px" width="60%" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {Array(6).fill(0).map((_, i) => <ShimmerBlock key={i} height="80px" />)}
        </div>
      </div>
      {/* Preview */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'var(--color-bg-base)', padding: 16 }}>
        <ShimmerBlock width="70%" height="60%" />
      </div>
      {/* Inspector */}
      <div style={{ width: 260, background: 'var(--color-bg-secondary)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ShimmerBlock height="24px" />
        <ShimmerBlock height="100px" />
        <ShimmerBlock height="24px" />
        <ShimmerBlock height="60px" />
      </div>
    </div>
    {/* Timeline */}
    <div style={{ height: 180, background: 'var(--color-bg-tertiary)', borderTop: '1px solid var(--color-border)', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <ShimmerBlock height="24px" />
      {Array(3).fill(0).map((_, i) => <ShimmerBlock key={i} height="40px" rounded={false} />)}
    </div>
  </div>
);

const GenericSkeleton: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 16, gap: 16 }}>
    <div style={{ display: 'flex', gap: 8 }}>
      <ShimmerBlock width="120px" height="32px" />
      <ShimmerBlock width="80px" height="32px" />
      <div style={{ flex: 1 }} />
      <ShimmerBlock width="100px" height="32px" />
    </div>
    <div style={{ flex: 1, display: 'flex', gap: 16 }}>
      <div style={{ width: 200, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array(5).fill(0).map((_, i) => <ShimmerBlock key={i} height="36px" />)}
      </div>
      <div style={{ flex: 1 }}>
        <ShimmerBlock height="100%" />
      </div>
    </div>
  </div>
);

export const CreativeAppSkeleton: React.FC<CreativeAppSkeletonProps> = ({ type, message }) => {
  const renderSkeleton = () => {
    switch (type) {
      case 'image-editor': return <ImageEditorSkeleton />;
      case 'audio-editor': return <AudioEditorSkeleton />;
      case 'video-editor': return <VideoEditorSkeleton />;
      default: return <GenericSkeleton />;
    }
  };

  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      position: 'relative',
      overflow: 'hidden',
      background: 'var(--color-bg-primary)'
    }}>
      <style>{shimmer}</style>
      {renderSkeleton()}
      {message && (
        <div style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--color-bg-elevated)',
          padding: '8px 16px',
          borderRadius: 6,
          fontSize: 13,
          color: 'var(--color-text-secondary)',
          boxShadow: 'var(--pg-shadow-chip)',
        }}>
          {message}
        </div>
      )}
    </div>
  );
};

export default CreativeAppSkeleton;
