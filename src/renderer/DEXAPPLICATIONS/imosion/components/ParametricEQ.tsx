// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import React, { useCallback, useRef } from 'react';

// Pro parametric EQ editor: a live frequency-response curve with draggable band
// nodes (low shelf, mid bell, high shelf). Drag a node horizontally to set its
// frequency and vertically to set its gain. Wired straight to the eq plugin's
// real params (lowGain/midGain/highGain/lowFreq/highFreq), so what you draw is
// what the DSP does. Pure SVG, no deps.
export interface ParametricEQProps {
  lowGain: number; midGain: number; highGain: number; lowFreq: number; highFreq: number;
  onChange: (key: 'lowGain' | 'midGain' | 'highGain' | 'lowFreq' | 'highFreq', value: number) => void;
  width?: number;
  height?: number;
  color?: string;
}

const FMIN = 20, FMAX = 20000, GMIN = -24, GMAX = 24, MID_FREQ = 1000;
const L10MIN = Math.log10(FMIN), L10MAX = Math.log10(FMAX);

const xToFreq = (x: number, w: number) => Math.pow(10, L10MIN + (x / w) * (L10MAX - L10MIN));
const freqToX = (f: number, w: number) => ((Math.log10(Math.max(FMIN, Math.min(FMAX, f))) - L10MIN) / (L10MAX - L10MIN)) * w;
const gainToY = (g: number, h: number) => h / 2 - (g / (GMAX - GMIN)) * h;
const yToGain = (y: number, h: number) => Math.max(GMIN, Math.min(GMAX, ((h / 2 - y) / h) * (GMAX - GMIN)));

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export const ParametricEQ: React.FC<ParametricEQProps> = ({ lowGain, midGain, highGain, lowFreq, highFreq, onChange, width = 300, height = 150, color = 'var(--color-accent)' }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<'low' | 'mid' | 'high' | null>(null);

  // Magnitude (dB) at a frequency: low shelf + mid bell + high shelf.
  const magAt = useCallback((f: number) => {
    const low = lowGain * (1 - sigmoid(Math.log2(f / lowFreq) * 2.2));
    const high = highGain * sigmoid(Math.log2(f / highFreq) * 2.2);
    const mid = midGain * Math.exp(-((Math.log2(f / MID_FREQ)) ** 2) / (2 * 0.6 * 0.6));
    return low + mid + high;
  }, [lowGain, midGain, highGain, lowFreq, highFreq]);

  const curve = (() => {
    const pts: string[] = [];
    for (let x = 0; x <= width; x += 4) {
      const f = xToFreq(x, width);
      pts.push(`${x},${gainToY(magAt(f), height).toFixed(1)}`);
    }
    return pts.join(' ');
  })();

  const onMove = useCallback((e: React.PointerEvent) => {
    const band = dragRef.current;
    if (!band || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(height, e.clientY - rect.top));
    const gain = Math.round(yToGain(y, height) * 10) / 10;
    if (band === 'low') { onChange('lowGain', gain); onChange('lowFreq', Math.round(Math.max(20, Math.min(500, xToFreq(x, width))))); }
    else if (band === 'mid') { onChange('midGain', gain); }
    else { onChange('highGain', gain); onChange('highFreq', Math.round(Math.max(2000, Math.min(20000, xToFreq(x, width))))); }
  }, [onChange, width, height]);

  const startDrag = (band: 'low' | 'mid' | 'high') => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = band;
  };
  const endDrag = (e: React.PointerEvent) => { dragRef.current = null; (e.target as Element).releasePointerCapture?.(e.pointerId); };

  const nodes: { band: 'low' | 'mid' | 'high'; f: number; g: number; c: string }[] = [
    { band: 'low', f: lowFreq, g: lowGain, c: '#4a7896' },
    { band: 'mid', f: MID_FREQ, g: midGain, c: color as string },
    { band: 'high', f: highFreq, g: highGain, c: '#a8744a' },
  ];

  return (
    <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', background: '#060608', borderRadius: 6, border: '1px solid #1a1a1e', touchAction: 'none' }} onPointerMove={onMove} onPointerUp={endDrag}>
      {/* frequency grid */}
      {[100, 1000, 10000].map(f => (
        <g key={f}>
          <line x1={freqToX(f, width)} y1={0} x2={freqToX(f, width)} y2={height} stroke="#1a1a1e" strokeWidth={1} />
          <text x={freqToX(f, width) + 3} y={height - 4} fontSize={7} fill="#3f3f46" fontFamily="var(--font-mono)">{f >= 1000 ? `${f / 1000}k` : f}</text>
        </g>
      ))}
      {/* 0 dB line */}
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="#27272a" strokeWidth={1} strokeDasharray="3 3" />
      {/* filled response */}
      <polygon points={`0,${height / 2} ${curve} ${width},${height / 2}`} fill={`${typeof color === 'string' && color.startsWith('#') ? color : '#4a9eff'}22`} />
      {/* response curve */}
      <polyline points={curve} fill="none" stroke={color} strokeWidth={2} />
      {/* band nodes */}
      {nodes.map(n => {
        const cx = freqToX(n.f, width); const cy = gainToY(n.g, height);
        return (
          <g key={n.band} style={{ cursor: n.band === 'mid' ? 'ns-resize' : 'move' }} onPointerDown={startDrag(n.band)}>
            <circle cx={cx} cy={cy} r={9} fill={`${n.c}22`} stroke={n.c} strokeWidth={1.5} />
            <circle cx={cx} cy={cy} r={3.5} fill={n.c} />
            <text x={cx} y={cy - 12} fontSize={7} fill={n.c} textAnchor="middle" fontWeight={700}>{n.band[0].toUpperCase()}</text>
          </g>
        );
      })}
    </svg>
  );
};

export default ParametricEQ;
