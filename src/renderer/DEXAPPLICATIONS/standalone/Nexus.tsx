/**
 * DEX Platform - Nexus
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 *
 * Nexus workspace graph with four morph modes:
 *   Starfield  -- deep-space universe with orbital rings
 *   Grid       -- hierarchical file tree
 *   Cluster    -- contacts grouped by classification
 *   Knowledge  -- UKI memory graph with neural connections
 *
 * Pure Canvas2D with perspective projection math. No external dependencies.
 */
import React, { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import { getPerfTier } from '../../utils/adaptiveCanvas';
import { useAppActive } from '../../utils/perfAware';
import { useUkiStore } from '../../store/ukiStore';
import { getSecuritySummary, getAccessLog, ALL_PERMISSIONS, PERMISSION_LABELS, usePermissionStore } from '../../store/permissionStore';
import { getStoredTier, getTierLabel } from '../../services/TierManager';
import { createNexusGraphSimulation, type NexusGraphSimulation, type NexusGraphNode, type NexusGraphLink } from './nexusGraphSimulation';
import { installNexusIngest } from '../../services/nexus/nexusLiveStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: number;
  extension: string;
  children?: FileNode[];
  depth: number;
  parentIndex: number;
  expanded: boolean;
}

interface Star {
  x: number;
  y: number;
  z: number;
  r: number;
  phase: number;
}

interface NexusNode {
  file: FileNode;
  // current lerped position
  cx: number;
  cy: number;
  cz: number;
  // target position (set per mode)
  tx: number;
  ty: number;
  tz: number;
  // projected screen coords (updated each frame)
  sx: number;
  sy: number;
  scale: number;
  depth: number;
  ringIndex: number;
  angle: number;
  // trail positions for motion streaks
  prevSx: number;
  prevSy: number;
  visibility: number;
  targetVisibility: number;
}

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  maxLife: number;
  r: number;
}

type ViewMode = 'starfield' | 'grid' | 'cluster' | 'knowledge' | 'security';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// -- DEX graph palette -- calm, high-contrast, and readable inside app windows --
const BG = '#070B12';
const WHITE = '#D8E2F0';
const ICE_BLUE = '#64D2FF';
const ELECTRIC = '#30D158';
const GLOW = '#0A84FF';
const AMBER = '#FFB020';
const VIOLET = '#BF5AF2';
const FONT_STACK = 'Inter, "SF Pro Display", "Segoe UI", system-ui, sans-serif';
const CYBER_COLORS = [ICE_BLUE, ELECTRIC, GLOW];

// Enhanced visual palette for better contrast and style
const CYAN_BRIGHT = '#64D2FF';   // Bright cyan for images
const GOLD_ACCENT = '#FFD700';   // Gold for achievements
const NEON_PINK = '#FF66B2';     // Neon pink for highlights
const DEEP_BLUE = '#4A9EFF';     // DEX accent blue
const EMERALD = '#34C759';       // Success green

// Contact classification color - Enhanced with more distinct colors
function fileColor(ext: string, isDir: boolean): string {
  if (isDir) return ELECTRIC;    // Green for directories
  const e = ext.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff)$/.test(e)) return CYAN_BRIGHT;  // Cyan for images
  if (/\.(mp4|mov|avi|mkv|webm|flv|wmv)$/.test(e)) return VIOLET;             // Purple for video
  if (/\.(mp3|wav|flac|aac|ogg|m4a|wma)$/.test(e)) return AMBER;      // Orange for audio
  if (/\.(ts|tsx|js|jsx|py|rs|c|cpp|java|go|rb|php|swift)$/.test(e)) return GOLD_ACCENT;  // Gold for code
  if (/\.(pdf|doc|docx|txt|md|rtf|odt)$/.test(e)) return DEEP_BLUE;           // Blue for docs
  if (/\.(json|yaml|yml|toml|xml|csv)$/.test(e)) return NEON_PINK;            // Pink for config
  if (/\.(zip|rar|7z|tar|gz|bz2)$/.test(e)) return '#8E8E93';                 // Gray for archives
  return ICE_BLUE;               // Red for other
}

// Base radii — scaled at runtime by viewport size
const RING_RADII_BASE = [140, 220, 310];
const RING_TILTS = [
  { rx: 0.35, ry: 0 },
  { rx: -0.2, ry: 0.5 },
  { rx: 0.15, ry: -0.4 },
];
const RING_SPEEDS = [0.0003, -0.00022, 0.00015];

// Compute responsive ring radii for a given viewport
function getResponsiveRadii(w: number, h: number, dpr: number): number[] {
  const minDim = Math.min(w / dpr, h / dpr);
  const scale = Math.max(0.45, Math.min(1.3, minDim / 700));
  return RING_RADII_BASE.map(r => r * scale);
}

const LERP_SPEED = 0.085;
const FOCUS_LERP = 0.03;

const CLUSTER_CATEGORIES: Record<string, { label: string; color: string }> = {
  primary: { label: 'PRI', color: ICE_BLUE },
  secondary: { label: 'SEC', color: ELECTRIC },
  utility: { label: 'UTL', color: WHITE },
  system: { label: 'SYS', color: GLOW },
  other: { label: 'AUX', color: AMBER },
};

// ---------------------------------------------------------------------------
// 3D Projection
// ---------------------------------------------------------------------------

function project3D(
  x: number, y: number, z: number,
  rotX: number, rotY: number,
  fov: number, cx: number, cy: number,
): { sx: number; sy: number; scale: number; depth: number } {
  // Rotate Y
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  let x1 = x * cosY - z * sinY;
  const z1 = x * sinY + z * cosY;
  // Rotate X
  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);
  let y1 = y * cosX - z1 * sinX;
  const z2 = y * sinX + z1 * cosX;

  const perspective = fov / (fov + z2);
  return {
    sx: cx + x1 * perspective,
    sy: cy + y1 * perspective,
    scale: perspective,
    depth: z2,
  };
}

// Rotate a 3D point by ring tilt
function tiltPoint(x: number, y: number, z: number, rx: number, ry: number) {
  const cosA = Math.cos(rx);
  const sinA = Math.sin(rx);
  const y1 = y * cosA - z * sinA;
  const z1 = y * sinA + z * cosA;
  const cosB = Math.cos(ry);
  const sinB = Math.sin(ry);
  const x1 = x * cosB - z1 * sinB;
  const z2 = x * sinB + z1 * cosB;
  return { x: x1, y: y1, z: z2 };
}

// Compute camera rotation to look at a 3D point
function computeLookAt(x: number, y: number, z: number): { rotX: number; rotY: number } {
  const dist = Math.sqrt(x * x + z * z);
  const rotY = -Math.atan2(x, z);
  const rotX = Math.atan2(y, dist);
  return { rotX: Math.max(-1.2, Math.min(1.2, rotX)), rotY };
}

// ---------------------------------------------------------------------------
// Star generation
// ---------------------------------------------------------------------------

function generateStars(count: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 300 + Math.random() * 400;
    stars.push({
      x: r * Math.sin(phi) * Math.cos(theta),
      y: r * Math.sin(phi) * Math.sin(theta),
      z: r * Math.cos(phi),
      r: 0.5 + Math.random() * 1.8,
      phase: Math.random() * Math.PI * 2,
    });
  }
  return stars;
}

function generateParticles(count: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = 40 + Math.random() * 280;
    particles.push({
      x: r * Math.cos(angle),
      y: (Math.random() - 0.5) * 200,
      z: r * Math.sin(angle),
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.15,
      vz: (Math.random() - 0.5) * 0.3,
      life: Math.random() * 200,
      maxLife: 200 + Math.random() * 300,
      r: 0.6 + Math.random() * 1.2,
    });
  }
  return particles;
}

// ---------------------------------------------------------------------------
// Nexus graph core - spatial workspace visualization
// No characters. Clean geometry, rotating rings, scan lines, data readouts.
// ---------------------------------------------------------------------------

function drawNexusAvatar(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, dpr: number,
  time: number, ukiAmp: number, ukiActive: boolean, ukiSpeaking: boolean,
) {
  const s = dpr; // scale shorthand
  const pulse = 0.5 + 0.5 * Math.sin(time * (ukiActive ? 3.5 : 1.2));
  const breathe = 0.5 + 0.5 * Math.sin(time * 0.9);
  const energyColor = ukiActive ? '#00C8FF' : 'var(--color-accent)';
  const ringColor = ukiSpeaking ? 'var(--color-success)' : energyColor;

  ctx.save();
  ctx.translate(cx, cy);

  // ── Deep ambient core glow (wide) ──
  const ambR = 120 * s;
  const ambGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, ambR);
  ambGrad.addColorStop(0, `rgba(10,132,255,${0.18 + pulse * 0.10 + ukiAmp * 0.12})`);
  ambGrad.addColorStop(0.35, `rgba(0,120,255,${0.06 + breathe * 0.04})`);
  ambGrad.addColorStop(0.7, 'rgba(0,40,120,0.02)');
  ambGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(0, 0, ambR, 0, Math.PI * 2);
  ctx.fillStyle = ambGrad;
  ctx.globalAlpha = 1;
  ctx.fill();

  // ── Outer hexagonal frame (6 sides, rotates slowly) ──
  const hexR = 58 * s;
  const hexAngle = time * 0.08;
  ctx.save();
  ctx.rotate(hexAngle);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
    const x = hexR * Math.cos(a);
    const y = hexR * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = energyColor;
  ctx.lineWidth = 1.2 * s;
  ctx.globalAlpha = 0.22 + breathe * 0.08;
  ctx.stroke();
  ctx.restore();

  // ── Inner hexagonal frame (counter-rotates) ──
  ctx.save();
  ctx.rotate(-hexAngle * 1.5);
  const hex2R = 40 * s;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = hex2R * Math.cos(a);
    const y = hex2R * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 0.8 * s;
  ctx.globalAlpha = 0.30 + pulse * 0.12;
  ctx.stroke();
  ctx.restore();

  // ── Three orbital rings at different tilts (classic arc reactor) ──
  const orbits = [
    { r: 72 * s, speed: 0.6, tilt: 0.55, color: energyColor, alpha: 0.25, lw: 1.0 },
    { r: 56 * s, speed: -0.9, tilt: 0.3,  color: '#4DD0E1',   alpha: 0.20, lw: 0.7 },
    { r: 85 * s, speed: 0.4, tilt: 0.7,  color: '#5E5CE6',   alpha: 0.15, lw: 0.8 },
  ];
  for (const orb of orbits) {
    ctx.save();
    ctx.rotate(time * orb.speed);
    ctx.scale(1, Math.cos(orb.tilt));
    ctx.beginPath();
    ctx.arc(0, 0, orb.r, 0, Math.PI * 2);
    ctx.strokeStyle = orb.color;
    ctx.lineWidth = orb.lw * s;
    ctx.globalAlpha = orb.alpha + breathe * 0.05;
    ctx.stroke();
    // Moving dot on ring
    const dotAngle = time * orb.speed * 3;
    const dx = orb.r * Math.cos(dotAngle);
    const dy = orb.r * Math.sin(dotAngle);
    ctx.beginPath();
    ctx.arc(dx, dy, 2.5 * s, 0, Math.PI * 2);
    ctx.fillStyle = orb.color;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.restore();
  }

  // ── Triangular inner lattice (3 equilateral triangles, rotating) ──
  ctx.save();
  ctx.rotate(time * 0.15);
  for (let t = 0; t < 3; t++) {
    const tAngle = (t / 3) * Math.PI * 2 + time * 0.15;
    const triR = 28 * s;
    ctx.beginPath();
    for (let v = 0; v < 3; v++) {
      const va = tAngle + (v / 3) * Math.PI * 2;
      const tx = triR * Math.cos(va);
      const ty = triR * Math.sin(va);
      if (v === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty);
    }
    ctx.closePath();
    ctx.strokeStyle = energyColor;
    ctx.lineWidth = 0.6 * s;
    ctx.globalAlpha = 0.18 + t * 0.05;
    ctx.stroke();
  }
  ctx.restore();

  // ── Scan ring — sweeping arc ──
  const scanSpeed = ukiActive ? 2.8 : 1.0;
  const scanAngle = (time * scanSpeed) % (Math.PI * 2);
  const scanR = 65 * s;
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, scanR, scanAngle - 0.7, scanAngle);
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 2.5 * s;
  ctx.globalAlpha = 0.6 + ukiAmp * 0.3;
  ctx.stroke();
  // Trailing fade
  ctx.beginPath();
  ctx.arc(0, 0, scanR, scanAngle - 1.8, scanAngle - 0.7);
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 1.2 * s;
  ctx.globalAlpha = 0.15;
  ctx.stroke();
  ctx.restore();

  // ── Central core disc (innermost glow) ──
  const coreR = 14 * s + ukiAmp * 6 * s;
  const innerGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
  innerGrad.addColorStop(0, `rgba(200,240,255,${0.9 + pulse * 0.1})`);
  innerGrad.addColorStop(0.3, `rgba(10,132,255,${0.7 + pulse * 0.2})`);
  innerGrad.addColorStop(0.7, `rgba(0,80,200,${0.3})`);
  innerGrad.addColorStop(1, 'rgba(0,0,60,0)');
  ctx.beginPath();
  ctx.arc(0, 0, coreR, 0, Math.PI * 2);
  ctx.fillStyle = innerGrad;
  ctx.globalAlpha = 1;
  ctx.fill();

  // Inner core ring
  ctx.beginPath();
  ctx.arc(0, 0, coreR * 0.7, 0, Math.PI * 2);
  ctx.strokeStyle = '#C8F0FF';
  ctx.lineWidth = 1.2 * s;
  ctx.globalAlpha = 0.55 + pulse * 0.25;
  ctx.stroke();

  // When speaking: energy arcs outward
  if (ukiSpeaking && ukiAmp > 0.1) {
    for (let arc = 0; arc < 6; arc++) {
      const arcA = (arc / 6) * Math.PI * 2 + time * 2.5;
      const arcLen = (0.15 + ukiAmp * 0.35) * Math.PI;
      const arcR = (coreR * 1.5) + ukiAmp * 20 * s;
      ctx.beginPath();
      ctx.arc(0, 0, arcR, arcA, arcA + arcLen);
      ctx.strokeStyle = 'var(--color-success)';
      ctx.lineWidth = 1.5 * s;
      ctx.globalAlpha = 0.4 + ukiAmp * 0.4;
      ctx.stroke();
    }
  }

  // ── Tick marks around outer ring ──
  const tickR = 92 * s;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + time * 0.03;
    const isMajor = i % 6 === 0;
    const tickLen = isMajor ? 8 * s : 4 * s;
    const x1 = tickR * Math.cos(a);
    const y1 = tickR * Math.sin(a);
    const x2 = (tickR - tickLen) * Math.cos(a);
    const y2 = (tickR - tickLen) * Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = energyColor;
    ctx.lineWidth = isMajor ? 1.2 * s : 0.7 * s;
    ctx.globalAlpha = isMajor ? 0.5 : 0.2;
    ctx.stroke();
  }

  // ── Data readout labels (cardinal HUD markers) ──
  const labelR = 108 * s;
  const labels = ['N', 'E', 'S', 'W'];
  ctx.font = `bold ${Math.round(7 * s)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
    const lx = labelR * Math.cos(a);
    const ly = labelR * Math.sin(a);
    ctx.fillStyle = energyColor;
    ctx.globalAlpha = 0.35 + breathe * 0.10;
    ctx.fillText(labels[i], lx, ly);
  }

  // ── Status indicator: UKI label in center ──
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(6 * s)}px ${FONT_STACK}`;
  ctx.fillStyle = ukiActive ? '#C8F0FF' : energyColor;
  ctx.globalAlpha = 0.55 + pulse * 0.25;
  ctx.fillText(ukiActive ? (ukiSpeaking ? 'SPEAKING' : 'ACTIVE') : 'STANDBY', 0, 20 * s);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Position layout helpers
// ---------------------------------------------------------------------------

function layoutStarfield(nodes: NexusNode[], time: number, ringRadii?: number[]) {
  const radii = ringRadii || RING_RADII_BASE;
  const perRing = Math.ceil(nodes.length / radii.length);
  nodes.forEach((n, i) => {
    const ring = Math.min(Math.floor(i / perRing), radii.length - 1);
    const idxInRing = i - ring * perRing;
    const total = Math.min(perRing, nodes.length - ring * perRing);
    const angle = (idxInRing / total) * Math.PI * 2 + time * RING_SPEEDS[ring] * 600;
    const radius = radii[ring];
    const tilt = RING_TILTS[ring];
    const px = radius * Math.cos(angle);
    const py = 0;
    const pz = radius * Math.sin(angle);
    const tilted = tiltPoint(px, py, pz, tilt.rx, tilt.ry);
    n.tx = tilted.x;
    n.ty = tilted.y;
    n.tz = tilted.z;
    n.ringIndex = ring;
    n.angle = angle;
    n.targetVisibility = 1;
  });
}

function layoutFileTree(nodes: NexusNode[], expanded?: Set<string>) {
  // Determine visible nodes based on directory expansion state
  const visible = new Set<number>();
  if (expanded && expanded.size > 0) {
    // Always show root-level nodes (depth 0)
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].file.depth === 0) {
        visible.add(i);
      }
    }
    // Show children of expanded directories
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.file.depth > 0 && n.file.parentIndex >= 0) {
        const parent = nodes[n.file.parentIndex];
        if (parent && expanded.has(parent.file.path) && visible.has(n.file.parentIndex)) {
          visible.add(i);
        }
      }
    }
  } else {
    // No expansion state -- show all nodes
    for (let i = 0; i < nodes.length; i++) visible.add(i);
  }

  // Arrange visible nodes by depth
  const byDepth: NexusNode[][] = [[], [], []];
  for (const idx of visible) {
    const n = nodes[idx];
    const d = Math.min(n.file.depth, 2);
    byDepth[d].push(n);
  }
  byDepth.forEach((group, depth) => {
    const radius = depth === 0 ? 60 : RING_RADII_BASE[depth - 1] * 0.7;
    group.forEach((n, i) => {
      const angle = (i / Math.max(group.length, 1)) * Math.PI * 2;
      n.tx = radius * Math.cos(angle);
      n.ty = (depth - 1) * 30;
      n.tz = radius * Math.sin(angle);
      n.targetVisibility = 1;
    });
  });

  // Keep hidden nodes in place and fade them out instead of snapping through the center.
  for (let i = 0; i < nodes.length; i++) {
    if (!visible.has(i)) {
      nodes[i].tx = nodes[i].cx;
      nodes[i].ty = nodes[i].cy;
      nodes[i].tz = nodes[i].cz;
      nodes[i].targetVisibility = 0;
    }
  }
}

function layoutCluster(nodes: NexusNode[]) {
  const categories = Object.keys(CLUSTER_CATEGORIES);
  const groups: Record<string, NexusNode[]> = {};
  categories.forEach(c => { groups[c] = []; });
  // Distribute contacts evenly across sectors
  nodes.forEach((n, i) => {
    const catIdx = i % categories.length;
    groups[categories[catIdx]].push(n);
  });
  categories.forEach((cat, ci) => {
    const sectorAngle = (ci / categories.length) * Math.PI * 2;
    const baseR = 180;
    const group = groups[cat];
    group.forEach((n, i) => {
      const spread = 60;
      const a = sectorAngle + ((i / Math.max(group.length, 1)) - 0.5) * 0.8;
      const r = baseR + (i % 3) * spread * 0.4;
      n.tx = r * Math.cos(a);
      n.ty = -40 + (i % 4) * 25;
      n.tz = r * Math.sin(a);
      n.targetVisibility = 1;
    });
  });
}

// Knowledge graph layout — concentric rings by weight/recency
// Populated by UKI's KnowledgeGraph data when available
function layoutKnowledge(nodes: NexusNode[], knowledgeNodes?: Array<{id: string; weight: number; color: string}>) {
  if (!knowledgeNodes || knowledgeNodes.length === 0) {
    // Fallback: arrange by size (weight proxy) in a galaxy spiral
    const sorted = [...nodes].sort((a, b) => b.file.size - a.file.size);
    sorted.forEach((n, i) => {
      const t = i / Math.max(sorted.length - 1, 1);
      const angle = t * Math.PI * 6; // 3 full spirals
      const r = 40 + t * 280;
      n.tx = r * Math.cos(angle);
      n.ty = (Math.sin(angle * 0.3) * 30);
      n.tz = r * Math.sin(angle);
      n.targetVisibility = 1;
    });
    return;
  }
  // Map knowledge weights to nodes
  const weightMap = new Map<string, {w: number; c: string}>();
  for (const kn of knowledgeNodes) {
    // kn.id like 'app:files' → match to node name
    const name = kn.id.split(':').pop()?.toLowerCase() || '';
    weightMap.set(name, { w: kn.weight, c: kn.color });
  }
  // Sort nodes by weight (most used at center)
  const withWeight = nodes.map(n => {
    const w = weightMap.get(n.file.name.toLowerCase())?.w || 0;
    return { node: n, weight: w };
  }).sort((a, b) => b.weight - a.weight);
  // Place in concentric shells
  const shellSizes = [1, 6, 12, 18, 24, 30];
  let idx = 0;
  let shell = 0;
  for (const { node } of withWeight) {
    if (idx >= (shellSizes.slice(0, shell + 1).reduce((a, b) => a + b, 0))) shell++;
    const shellR = shell * 70;
    const startIdx = shell === 0 ? 0 : shellSizes.slice(0, shell).reduce((a, b) => a + b, 0);
    const posInShell = idx - startIdx;
    const totalInShell = shellSizes[Math.min(shell, shellSizes.length - 1)] || 30;
    const angle = (posInShell / totalInShell) * Math.PI * 2;
    node.tx = shellR * Math.cos(angle);
    node.ty = (Math.sin(angle * 0.5) * shell * 8);
    node.tz = shellR * Math.sin(angle);
    node.targetVisibility = 1;
    idx++;
  }
}

function buildKnowledgeConnections(nodes: NexusNode[]): Array<[number, number]> {
  const connections: Array<[number, number]> = [];
  for (let i = 0; i < nodes.length; i++) {
    const ni = nodes[i];
    let connected = 0;
    for (let j = i + 1; j < nodes.length && connected < 3; j++) {
      const nj = nodes[j];
      const dx = ni.tx - nj.tx;
      const dy = ni.ty - nj.ty;
      const dz = ni.tz - nj.tz;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < 120 * 120) {
        connections.push([i, j]);
        connected++;
      }
    }
  }
  return connections;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const Nexus: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const starsRef = useRef<Star[]>([]);
  const nodesRef = useRef<NexusNode[]>([]);
  const hoveredRef = useRef<number>(-1);
  const mouseRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, startRotX: 0, startRotY: 0 });
  const cameraRef = useRef({ rotX: 0.3, rotY: 0, zoom: 500, autoRotate: true });
  const modeRef = useRef<ViewMode>('starfield');
  const expandedRef = useRef<Set<string>>(new Set());
  const timeRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const scanlinePatternRef = useRef<{ pattern: CanvasPattern; h: number } | null>(null);
  const focusTargetRef = useRef<{ x: number; y: number; z: number; active: boolean; progress: number; targetRotX: number; targetRotY: number }>({ x: 0, y: 0, z: 0, active: false, progress: 0, targetRotX: 0, targetRotY: 0 });
  const selectedNodeRef = useRef<number>(-1);
  const zoomVelocityRef = useRef(0);
  const hitTestRafRef = useRef(0);
  const perfTimeRef = useRef(0);
  const lastRafTimeRef = useRef(0);
  const fpsRef = useRef(0);
  const fpsCountRef = useRef(0);
  const fpsTimeRef = useRef(0);

  const [mode, setMode] = useState<ViewMode>('starfield');
  const tooltipRef = useRef<{ x: number; y: number; text: string; sub: string } | null>(null);
  const tooltipDomRef = useRef<HTMLDivElement>(null);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchSelectedIdx, setSearchSelectedIdx] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const searchRef = useRef('');

  // UKI web search results
  const [webSearchResults, setWebSearchResults] = useState<Array<{ query: string; url: string; timestamp: number }>>([]);
  const [showWebResults, setShowWebResults] = useState(false);
  const memoryNodesRef = useRef<Array<{id: string; weight: number; color: string}>>([]);
  const layoutDirtyRef = useRef(true);
  const sortedIndicesRef = useRef<number[]>([]);
  const searchIndexRef = useRef<Array<{ file: FileNode; nameLower: string }>>([]);
  const knowledgeConnectionsRef = useRef<Array<[number, number]>>([]);
  const knowledgeSignatureRef = useRef('');
  const knowledgeSimRef = useRef<NexusGraphSimulation | null>(null);

  // Performance: pause RAF when app is backgrounded
  const isAppActive = useAppActive();
  const isActiveRef = useRef(isAppActive);
  useEffect(() => { isActiveRef.current = isAppActive; }, [isAppActive]);

  // ROADMAP-600 #502: subscribe the shared Nexus memory model to ContextBus so
  // the graph fills live from real activity (back-filling from the replay ring).
  useEffect(() => {
    const off = installNexusIngest();
    return off;
  }, []);

  // -- UKI store bridge: sync reactive state into refs for the 60fps render loop --
  const ukiState = useUkiStore(s => s.state);
  const ukiAudioLevel = useUkiStore(s => s.audioLevel);
  const ukiKnowledgeNodes = useUkiStore(s => s.knowledgeNodes);
  const ukiRef = useRef({ state: ukiState, audioLevel: ukiAudioLevel });
  useEffect(() => { ukiRef.current = { state: ukiState, audioLevel: ukiAudioLevel }; }, [ukiState, ukiAudioLevel]);

  // Merge live UKI knowledge nodes into memory nodes for knowledge mode
  useEffect(() => {
    if (ukiKnowledgeNodes.length === 0) return;
    const liveNodes = ukiKnowledgeNodes.map(n => ({
      id: n.id,
      weight: n.weight,
      color: n.color,
    }));
    const signature = liveNodes.map(n => `${n.id}:${n.weight}:${n.color}`).join('|');
    if (signature === knowledgeSignatureRef.current) return;
    knowledgeSignatureRef.current = signature;

    const merged = new Map<string, { id: string; weight: number; color: string }>();
    for (const existing of memoryNodesRef.current) merged.set(existing.id, existing);
    for (const live of liveNodes) merged.set(live.id, live);
    memoryNodesRef.current = Array.from(merged.values()).slice(-50);
    if (modeRef.current === 'knowledge' && liveNodes.length > 0) {
      layoutDirtyRef.current = true;
    }
  }, [ukiKnowledgeNodes]);

  // Load UKI memory records for knowledge mode
  useEffect(() => {
    if (mode !== 'knowledge') return;
    const dex = (window as any).dex;
    if (!dex?.uki?.memoryRecent) return;
    (async () => {
      try {
        const records = await dex.uki.memoryRecent(30);
        if (records && records.length > 0) {
          const typeColors: Record<string, string> = {
            conversation: 'var(--color-accent)', command: 'var(--color-success)',
            activity: 'var(--color-warning)', summary: '#bf5af2',
          };
          memoryNodesRef.current = records.map((r: any, i: number) => ({
            id: `memory:${r.record_type || 'conversation'}:${i}`,
            weight: (r.confidence || 0.5) * (1 + (records.length - i) / records.length),
            color: typeColors[r.record_type] || '#4DD0E1',
          }));
        }
      } catch { /* native unavailable */ }
    })();
  }, [mode]);
  // Keep searchRef in sync
  useEffect(() => { searchRef.current = searchQuery; }, [searchQuery]);

  // Keep modeRef in sync
  useEffect(() => { modeRef.current = mode; layoutDirtyRef.current = true; }, [mode]);

  // -----------------------------------------------------------------------
  // Load files — only on explicit user browse, never auto-scan
  // -----------------------------------------------------------------------
  const populateNodes = useCallback((fileData: FileNode[]) => {
    const flat: FileNode[] = [];
    fileData.forEach((f, i) => {
      flat.push(f);
      if (f.children) {
        f.children.forEach(c => {
          c.parentIndex = i;
          flat.push(c);
        });
      }
    });

    const nexusNodes: NexusNode[] = flat.map(f => ({
      file: f,
      cx: 0, cy: 0, cz: 0,
      tx: 0, ty: 0, tz: 0,
      sx: 0, sy: 0, scale: 1, depth: 0,
      ringIndex: 0, angle: 0,
      prevSx: 0, prevSy: 0,
      visibility: 1,
      targetVisibility: 1,
    }));

    nodesRef.current = nexusNodes;
    searchIndexRef.current = nexusNodes.map(n => ({ file: n.file, nameLower: n.file.name.toLowerCase() }));
    setNodeCount(nexusNodes.length);
    layoutDirtyRef.current = true;
  }, []);

  // Start with an empty graph - avatar only
  useEffect(() => {
    nodesRef.current = [];
    setNodeCount(0);
    setFilesLoaded(true);
  }, []);

  // Auto-scan default location on mount (Desktop or Documents)
  useEffect(() => {
    nodesRef.current = [];
    setNodeCount(0);
    
    // Auto-scan default directory
    const autoScan = async () => {
      if (!window.dex?.platform?.homeDir || !window.dex?.invoke) {
        setFilesLoaded(true);
        return;
      }
      
      try {
        const homeDir = window.dex.platform.homeDir;
        const sep = window.dex.platform.isWindows ? '\\' : '/';
        const defaultPath = `${homeDir}${sep}Desktop`;
        
        const listed = await Promise.race([
          window.dex.invoke('files:list', defaultPath),
          new Promise<null>(r => setTimeout(() => r(null), 3000)),
        ]);
        
        if (listed?.files && Array.isArray(listed.files) && listed.files.length > 0) {
          const fileData: FileNode[] = listed.files.slice(0, 50).map((f: any) => ({
            name: f.name || 'Unknown',
            path: f.path || `/${f.name}`,
            isDirectory: !!f.isDirectory,
            size: f.size || 0,
            modified: f.modified ? new Date(f.modified).getTime() : Date.now(),
            extension: f.extension || '',
            depth: 0,
            parentIndex: -1,
            expanded: false,
          }));
          populateNodes(fileData);
        }
      } catch { /* Scan failed, show empty state */ }
      setFilesLoaded(true);
    };
    
    const t = setTimeout(autoScan, 200);
    return () => clearTimeout(t);
  }, [populateNodes]);

  // Browse a specific folder chosen by the user
  const browseFolder = useCallback(async () => {
    if (!window.dex?.invoke) return;
    try {
      const result = await window.dex.invoke('dialog:showOpenDialog', {
        properties: ['openDirectory'],
        title: 'Select folder to scan',
      });
      if (!result || result.canceled || !result.filePaths?.length) return;
      const dirPath = result.filePaths[0];
      const listed = await Promise.race([
        window.dex.invoke('files:list', dirPath),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
      ]);
      if (listed?.files && Array.isArray(listed.files)) {
        const fileData: FileNode[] = (listed.files as Array<{ name?: string; path?: string; isDirectory?: boolean; size?: number; modified?: string; extension?: string }>) 
          .slice(0, 80)
          .map(f => ({
            name: f.name || 'Unknown',
            path: f.path || `/${f.name}`,
            isDirectory: !!f.isDirectory,
            size: f.size || 0,
            modified: f.modified ? new Date(f.modified).getTime() : Date.now(),
            extension: f.extension || '',
            depth: 0,
            parentIndex: -1,
            expanded: false,
          }));
        populateNodes(fileData);
      }
    } catch { /* user cancelled or IPC unavailable */ }
  }, [populateNodes]);

  // -----------------------------------------------------------------------
  // Generate stars based on perf tier
  // -----------------------------------------------------------------------
  useEffect(() => {
    const tier = getPerfTier();
    const counts: Record<string, number> = { low: 120, mid: 250, high: 320, ultra: 400 };
    starsRef.current = generateStars(counts[tier] || 250);
    const pCounts: Record<string, number> = { low: 15, mid: 35, high: 55, ultra: 70 };
    particlesRef.current = generateParticles(pCounts[tier] || 35);
  }, []);

  // -----------------------------------------------------------------------
  // Canvas resize
  // -----------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const newW = Math.round(rect.width * dpr);
      const newH = Math.round(rect.height * dpr);
      if (canvas.width === newW && canvas.height === newH) return;
      canvas.width = newW;
      canvas.height = newH;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // -----------------------------------------------------------------------
  // Keyboard shortcuts
  // -----------------------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !searchFocused) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape' && !searchFocused) {
        selectedNodeRef.current = -1;
        cameraRef.current.autoRotate = true;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchFocused]);

  // -----------------------------------------------------------------------
  // UKI web search results listener
  // -----------------------------------------------------------------------
  useEffect(() => {
    const electron = (window as any).electron;
    if (!electron?.on) return;
    const handler = (_event: unknown, data: { query: string; url: string; timestamp: number }) => {
      setWebSearchResults(prev => [data, ...prev].slice(0, 10));
      setShowWebResults(true);
    };
    electron.on('uki:web-search-results', handler);
    return () => { electron.removeListener?.('uki:web-search-results', handler); };
  }, []);

  // -----------------------------------------------------------------------
  // Mouse handlers
  // -----------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateTooltip = (closestIdx: number) => {
      hoveredRef.current = closestIdx;
      if (closestIdx >= 0) {
        const nodes = nodesRef.current;
        const n = nodes[closestIdx];
        if (!n) return;
        const tip = {
          x: mouseRef.current.x,
          y: mouseRef.current.y,
          text: n.file.name,
          sub: n.file.isDirectory
            ? 'DIR'
            : `${n.file.extension ? n.file.extension.replace('.', '').toUpperCase() : 'FILE'}${n.file.size > 0 ? ' · ' + (n.file.size < 1024 ? n.file.size + 'B' : n.file.size < 1048576 ? (n.file.size / 1024).toFixed(1) + 'KB' : (n.file.size / 1048576).toFixed(1) + 'MB') : ''}`,
        };
        tooltipRef.current = tip;
        if (tooltipDomRef.current) {
          const el = tooltipDomRef.current;
          el.style.display = 'block';
          el.style.left = `${tip.x + 16}px`;
          el.style.top = `${Math.min(tip.y - 44, window.innerHeight - 80)}px`;
          el.children[0].textContent = tip.text;
          el.children[1].textContent = tip.sub;
        }
      } else {
        tooltipRef.current = null;
        if (tooltipDomRef.current) {
          tooltipDomRef.current.style.display = 'none';
        }
      }
    };

    const runHitTest = () => {
      hitTestRafRef.current = 0;
      const nodes = nodesRef.current;
      const dpr = window.devicePixelRatio || 1;
      let closestIdx = -1;
      let closestDistSq = 22 * 22;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.visibility < 0.2) continue;
        const dx = mouseRef.current.x - n.sx / dpr;
        const dy = mouseRef.current.y - n.sy / dpr;
        const distSq = dx * dx + dy * dy;
        if (distSq < closestDistSq) {
          closestDistSq = distSq;
          closestIdx = i;
        }
      }
      updateTooltip(closestIdx);
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      if (dragRef.current.active) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        cameraRef.current.rotY = dragRef.current.startRotY + dx * 0.005;
        cameraRef.current.rotX = dragRef.current.startRotX + dy * 0.005;
        cameraRef.current.rotX = Math.max(-1.2, Math.min(1.2, cameraRef.current.rotX));
        cameraRef.current.autoRotate = false;
        return;
      }

      if (!hitTestRafRef.current) {
        hitTestRafRef.current = requestAnimationFrame(runHitTest);
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        dragRef.current = {
          active: true,
          startX: e.clientX,
          startY: e.clientY,
          startRotX: cameraRef.current.rotX,
          startRotY: cameraRef.current.rotY,
        };
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      const wasDrag = dragRef.current.active &&
        (Math.abs(e.clientX - dragRef.current.startX) > 4 || Math.abs(e.clientY - dragRef.current.startY) > 4);
      dragRef.current.active = false;
      if (!wasDrag && hoveredRef.current >= 0) {
        const node = nodesRef.current[hoveredRef.current];
        if (node) {
          // Focus zoom + pan on clicked node (use target position for stable aim)
          const look = computeLookAt(node.tx, node.ty, node.tz);
          focusTargetRef.current = { x: node.tx, y: node.ty, z: node.tz, active: true, progress: 0, targetRotX: look.rotX, targetRotY: look.rotY };
          selectedNodeRef.current = hoveredRef.current;
          cameraRef.current.autoRotate = false;
          // Also toggle directory expand in grid mode
          if (modeRef.current === 'grid' && node.file.isDirectory) {
            const path = node.file.path;
            if (expandedRef.current.has(path)) {
              expandedRef.current.delete(path);
            } else {
              expandedRef.current.add(path);
            }
            layoutDirtyRef.current = true;
          }
        }
      }
    };

    const onDblClick = () => {
      // Double-click: reset focus to center
      focusTargetRef.current = { x: 0, y: 0, z: 0, active: true, progress: 0, targetRotX: 0.3, targetRotY: 0 };
      selectedNodeRef.current = -1;
      cameraRef.current.autoRotate = true;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Normalize delta — cap to 40px per event so mouse wheel and trackpad feel equal
      const delta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 20);
      // Exponential zoom velocity: adds momentum each wheel tick
      zoomVelocityRef.current += delta * 0.002 * cameraRef.current.zoom;
    };

    // Touch: pinch-to-zoom + single-finger rotate
    let lastTouchDist = 0;
    let touchActive = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        lastTouchDist = Math.hypot(dx, dy);
        touchActive = true;
      } else if (e.touches.length === 1) {
        dragRef.current = { active: true, startX: e.touches[0].clientX, startY: e.touches[0].clientY, startRotX: cameraRef.current.rotX, startRotY: cameraRef.current.rotY };
        cameraRef.current.autoRotate = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchActive) {
        e.preventDefault();
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const dist = Math.hypot(dx, dy);
        if (lastTouchDist > 0) {
          const pinchDelta = (lastTouchDist - dist) * 1.0;
          zoomVelocityRef.current += pinchDelta * 0.002 * cameraRef.current.zoom;
        }
        lastTouchDist = dist;
      } else if (e.touches.length === 1 && dragRef.current.active) {
        const dx = e.touches[0].clientX - dragRef.current.startX;
        const dy = e.touches[0].clientY - dragRef.current.startY;
        cameraRef.current.rotY = dragRef.current.startRotY + dx * 0.005;
        cameraRef.current.rotX = Math.max(-1.2, Math.min(1.2, dragRef.current.startRotX + dy * 0.005));
      }
    };

    const onTouchEnd = () => {
      touchActive = false;
      lastTouchDist = 0;
      dragRef.current.active = false;
    };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('dblclick', onDblClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    return () => {
      if (hitTestRafRef.current) cancelAnimationFrame(hitTestRafRef.current);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('dblclick', onDblClick);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  // -----------------------------------------------------------------------
  // Animation loop
  // -----------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      // Skip rendering when app is backgrounded to save CPU
      if (!isActiveRef.current) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) { rafRef.current = requestAnimationFrame(draw); return; }

      const dpr = window.devicePixelRatio || 1;
      const cx = w / 2;
      const cy = h / 2;
      const cam = cameraRef.current;
      const now = performance.now() / 1000;
      const dt = lastRafTimeRef.current > 0 ? Math.min(now - lastRafTimeRef.current, 0.1) : 0.016;
      lastRafTimeRef.current = now;
      perfTimeRef.current += dt;
      const time = perfTimeRef.current;

      // FPS tracking
      fpsCountRef.current++;
      if (now - fpsTimeRef.current >= 1) {
        fpsRef.current = fpsCountRef.current;
        fpsCountRef.current = 0;
        fpsTimeRef.current = now;
      }

      // --- Smooth zoom inertia (frame-rate independent) ---
      if (Math.abs(zoomVelocityRef.current) > 0.1) {
        cam.zoom = Math.max(80, Math.min(1500, cam.zoom + zoomVelocityRef.current * dt * 60));
        zoomVelocityRef.current *= Math.pow(0.82, dt * 60);
      } else {
        zoomVelocityRef.current = 0;
      }

      // --- Focus zoom + pan animation ---
      const focus = focusTargetRef.current;
      if (focus.active) {
        focus.progress = Math.min(1, focus.progress + 0.022 * dt * 60);
        const zoomLerp = 1 - Math.pow(1 - 0.06, dt * 60);
        const panLerp = 1 - Math.pow(1 - 0.08, dt * 60);
        cam.zoom = cam.zoom + (280 - cam.zoom) * zoomLerp;
        // Pan camera rotation toward target node
        cam.rotX += (focus.targetRotX - cam.rotX) * panLerp;
        cam.rotY += (focus.targetRotY - cam.rotY) * panLerp;
        cam.rotX = Math.max(-1.2, Math.min(1.2, cam.rotX));
        if (focus.progress >= 1) {
          focus.active = false;
        }
      }

      // Auto-rotate -- UKI processing/thinking = faster spin
      const ukiNow = ukiRef.current;
      const ukiActive = ukiNow.state === 'processing' || ukiNow.state === 'thinking';
      const ukiSpeaking = ukiNow.state === 'speaking' || ukiNow.state === 'listening';
      const ukiAmp = ukiNow.audioLevel; // 0..1
      if (cam.autoRotate) {
        cam.rotY += (ukiActive ? 0.008 : 0.0025) * dt * 60;
      }

      // --- Clear ---
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);

      // --- Spatial graph display ---
      const radarMaxR = Math.min(w, h) * 0.4;

      // Concentric depth guides
      for (let ri = 1; ri <= 5; ri++) {
        const rr = (ri / 5) * radarMaxR;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.strokeStyle = ICE_BLUE;
        ctx.globalAlpha = 0.06 + ri * 0.025;
        ctx.lineWidth = (ri === 5 ? 1.5 : 0.8) * dpr;
        ctx.stroke();
      }

      // Soft sweep (rotating sector with fade trail)
      const sweepAngle = time * 0.7;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radarMaxR, sweepAngle - 0.5, sweepAngle);
      ctx.closePath();
      const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radarMaxR);
      sweepGrad.addColorStop(0, 'rgba(100,210,255,0.12)');
      sweepGrad.addColorStop(0.7, 'rgba(100,210,255,0.035)');
      sweepGrad.addColorStop(1, 'rgba(100,210,255,0)');
      ctx.fillStyle = sweepGrad;
      ctx.globalAlpha = 0.6;
      ctx.fill();

      // Sweep leading edge line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweepAngle) * radarMaxR, cy + Math.sin(sweepAngle) * radarMaxR);
      ctx.strokeStyle = ICE_BLUE;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();

      // Full crosshair lines through center
      ctx.strokeStyle = ICE_BLUE;
      ctx.globalAlpha = 0.12;
      ctx.lineWidth = 0.6 * dpr;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(w, cy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.stroke();

      // Dashed border rectangle
      const borderInset = 25 * dpr;
      ctx.setLineDash([8 * dpr, 6 * dpr]);
      ctx.strokeStyle = ICE_BLUE;
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(borderInset, borderInset, w - borderInset * 2, h - borderInset * 2);
      ctx.setLineDash([]);

      // CRT scanlines (pattern fill for performance)
      ctx.globalAlpha = 0.02;
      if (!scanlinePatternRef.current || scanlinePatternRef.current.h !== h) {
        const patCanvas = document.createElement('canvas');
        patCanvas.width = 4;
        patCanvas.height = Math.max(1, 4 * dpr);
        const pCtx = patCanvas.getContext('2d')!;
        pCtx.fillStyle = 'rgba(0,0,0,1)';
        pCtx.fillRect(0, 0, 4, 1);
        scanlinePatternRef.current = { pattern: ctx.createPattern(patCanvas, 'repeat')!, h };
      }
      if (scanlinePatternRef.current.pattern) {
        ctx.fillStyle = scanlinePatternRef.current.pattern;
        ctx.fillRect(0, 0, w, h);
      }

      // --- UKI glitch intensity ---
      const glitchIntensity = ukiActive ? 0.6 + ukiAmp * 0.4 : ukiSpeaking ? ukiAmp * 0.3 : 0;

      // Moving scan line
      const scanY = (time * 50 * dpr) % h;
      ctx.fillStyle = `rgba(100,210,255,${0.025 + glitchIntensity * 0.025})`;
      ctx.fillRect(0, scanY, w, 2 * dpr);

      // Side range ticks
      ctx.globalAlpha = 0.1;
      ctx.strokeStyle = ICE_BLUE;
      ctx.lineWidth = 1 * dpr;
      for (let ti = 0; ti < 10; ti++) {
        const ty = h * 0.15 + ti * (h * 0.07);
        const tickW = (ti % 3 === 0) ? 18 * dpr : 8 * dpr;
        ctx.beginPath();
        ctx.moveTo(8 * dpr, ty);
        ctx.lineTo(8 * dpr + tickW, ty);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w - 8 * dpr, ty);
        ctx.lineTo(w - 8 * dpr - tickW, ty);
        ctx.stroke();
      }

      // Corner data readouts (AZ, EL, RNG)
      ctx.globalAlpha = 0.35;
      ctx.font = `700 ${Math.round(8 * dpr)}px ${FONT_STACK}`;
      ctx.fillStyle = ICE_BLUE;
      ctx.textAlign = 'left';
      ctx.fillText('AZ: ' + Math.round(cam.rotY * 57.3) + '\u00B0', borderInset + 8 * dpr, borderInset + 14 * dpr);
      ctx.fillText('EL: ' + Math.round(cam.rotX * 57.3) + '\u00B0', borderInset + 8 * dpr, borderInset + 26 * dpr);
      ctx.textAlign = 'right';
      ctx.fillText('RNG: ' + Math.round(cam.zoom), w - borderInset - 8 * dpr, borderInset + 14 * dpr);
      ctx.fillStyle = ELECTRIC;
      ctx.fillText('SCAN: ACTIVE', w - borderInset - 8 * dpr, borderInset + 26 * dpr);

      ctx.globalAlpha = 1;

      // --- Stars (graph nodes) ---
      const starAlpha = modeRef.current === 'starfield' ? 1.0 : 0.25;
      const stars = starsRef.current;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const p = project3D(s.x, s.y, s.z, cam.rotX, cam.rotY, cam.zoom, cx, cy);
        if (p.depth < -cam.zoom * 0.8) continue;
        const twinkle = 0.5 + 0.5 * Math.sin(time * 2.5 + s.phase);
        const alpha = Math.min(1, p.scale * 1.5) * twinkle * starAlpha;
        const radius = s.r * p.scale;
        if (radius < 0.2) continue;

        ctx.beginPath();
        ctx.arc(p.sx, p.sy, radius * dpr, 0, Math.PI * 2);
        const starColor = CYBER_COLORS[i % 3];
        ctx.fillStyle = starColor;
        ctx.globalAlpha = alpha * 0.7;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // --- Ambient floating particles (UKI-reactive velocity) ---
      const ptSpeedMult = (ukiActive ? 2.5 : ukiSpeaking ? 1.0 + ukiAmp * 1.5 : 1.0) * dt * 60;
      const particles = particlesRef.current;
      for (let i = 0; i < particles.length; i++) {
        const pt = particles[i];
        pt.x += pt.vx * ptSpeedMult;
        pt.y += pt.vy * ptSpeedMult;
        pt.z += pt.vz * ptSpeedMult;
        pt.life += dt * 60;
        if (pt.life > pt.maxLife) {
          // Respawn
          const angle = Math.random() * Math.PI * 2;
          const r = 40 + Math.random() * 280;
          pt.x = r * Math.cos(angle);
          pt.y = (Math.random() - 0.5) * 200;
          pt.z = r * Math.sin(angle);
          pt.life = 0;
        }
        const p = project3D(pt.x, pt.y, pt.z, cam.rotX, cam.rotY, cam.zoom, cx, cy);
        if (p.depth < -cam.zoom * 0.7) continue;
        const lifeRatio = pt.life / pt.maxLife;
        const fadeIn = Math.min(1, lifeRatio * 5);
        const fadeOut = Math.max(0, 1 - (lifeRatio - 0.8) * 5);
        const pAlpha = Math.min(fadeIn, fadeOut) * 0.35 * Math.min(1, p.scale);
        if (pAlpha < 0.01) continue;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, pt.r * p.scale * dpr, 0, Math.PI * 2);
        ctx.fillStyle = CYBER_COLORS[i % 3];
        ctx.globalAlpha = pAlpha;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // --- Update node layout ---
      const nodes = nodesRef.current;
      const currentMode = modeRef.current;
      const responsiveRadii = getResponsiveRadii(w, h, dpr);

      if (currentMode === 'starfield') {
        layoutStarfield(nodes, time, responsiveRadii);
      } else if (currentMode === 'security') {
        // Security mode doesn't use file nodes — shield HUD is rendered directly
        layoutDirtyRef.current = false;
      } else if (layoutDirtyRef.current) {
        // Static modes only need re-layout on mode/data change
        if (currentMode === 'grid') {
          layoutFileTree(nodes, expandedRef.current);
          knowledgeConnectionsRef.current = [];
        } else if (currentMode === 'knowledge') {
          layoutKnowledge(nodes, memoryNodesRef.current.length > 0 ? memoryNodesRef.current : undefined);
          knowledgeConnectionsRef.current = buildKnowledgeConnections(nodes);
          // Build / refresh d3-force simulation for the dense knowledge graph.
          knowledgeSimRef.current?.dispose();
          const simNodes: NexusGraphNode[] = nodes.map((nd, i) => ({
            id: String(i),
            weight: Math.min(1, (nd.file.size || 1) / 1024),
            radius: 4 + Math.min(8, (nd.file.size || 1) / 256),
            x: nd.tx,
            y: nd.ty,
          }));
          const simLinks: NexusGraphLink[] = knowledgeConnectionsRef.current.map(([a, b]) => ({
            source: String(a),
            target: String(b),
            weight: 0.4 + Math.random() * 0.4,
          }));
          knowledgeSimRef.current = createNexusGraphSimulation(
            simNodes,
            simLinks,
            { width: w / dpr, height: h / dpr, intensity: getPerfTier() === 'low' ? 0.5 : 1 },
          );
          knowledgeSimRef.current.reheat(0.85);
        } else {
          layoutCluster(nodes);
          knowledgeConnectionsRef.current = [];
          knowledgeSimRef.current?.dispose();
          knowledgeSimRef.current = null;
        }
        layoutDirtyRef.current = false;
      }

      // --- Tick the d3-force simulation while in knowledge mode ---
      if (currentMode === 'knowledge' && knowledgeSimRef.current) {
        const sim = knowledgeSimRef.current;
        // Cap ticks so the renderer never stalls; one tick per frame is fluid.
        sim.tick();
        const sn = sim.nodes;
        for (let i = 0; i < nodes.length && i < sn.length; i++) {
          const node = nodes[i];
          const p = sn[i];
          if (typeof p.x === 'number') node.tx = p.x;
          if (typeof p.y === 'number') node.ty = p.y;
        }
      }

      // --- Lerp positions (dt-scaled for frame-rate independence) ---
      const dtLerp = 1 - Math.pow(1 - LERP_SPEED, dt * 60);
      const dtVisLerp = 1 - Math.pow(1 - 0.18, dt * 60);
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.cx += (n.tx - n.cx) * dtLerp;
        n.cy += (n.ty - n.cy) * dtLerp;
        n.cz += (n.tz - n.cz) * dtLerp;
        n.visibility += (n.targetVisibility - n.visibility) * dtVisLerp;
      }

      // --- Orbital rings (starfield mode) ---
      if (currentMode === 'starfield') {
        for (let ri = 0; ri < responsiveRadii.length; ri++) {
          const radius = responsiveRadii[ri];
          const tilt = RING_TILTS[ri];
          const segments = 180;
          const isWaveform = ri === 1;

          ctx.beginPath();
          for (let j = 0; j <= segments; j++) {
            const a = (j / segments) * Math.PI * 2;
            let r = radius;
            if (isWaveform) {
              r += Math.sin(a * 8 + time * 2) * 15 * (0.7 + 0.3 * Math.sin(time * 0.5));
            }
            const px = r * Math.cos(a);
            const py = 0;
            const pz = r * Math.sin(a);

        // ═══════════════════════════════════════════════════════════════════
        // FUTURISTIC WIRE CONNECTIONS IN STARFIELD MODE
        // ═══════════════════════════════════════════════════════════════════
        // Draw glowing wire connections between nearby nodes
        if (nodes.length > 1) {
          // Build connection list for nodes within range
          const maxConnDist = 120;
          const connections: Array<[number, number, number]> = [];
          for (let i = 0; i < Math.min(nodes.length, 60); i++) {
            let connCount = 0;
            for (let j = i + 1; j < Math.min(nodes.length, 60) && connCount < 3; j++) {
              const ni = nodes[i];
              const nj = nodes[j];
              const dx = ni.cx - nj.cx;
              const dy = ni.cy - nj.cy;
              const dz = ni.cz - nj.cz;
              const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
              if (dist < maxConnDist) {
                connections.push([i, j, dist]);
                connCount++;
              }
            }
          }

          // Draw wire connections with animated data pulses
          for (const [i, j, dist] of connections) {
            const ni = nodes[i];
            const nj = nodes[j];
            if (ni.visibility < 0.3 || nj.visibility < 0.3) continue;
            
            const pi = project3D(ni.cx, ni.cy, ni.cz, cam.rotX, cam.rotY, cam.zoom, cx, cy);
            const pj = project3D(nj.cx, nj.cy, nj.cz, cam.rotX, cam.rotY, cam.zoom, cx, cy);
            if (pi.depth < -cam.zoom * 0.7 || pj.depth < -cam.zoom * 0.7) continue;

            const wireAlpha = (1 - dist / maxConnDist) * 0.35 * Math.min(ni.visibility, nj.visibility);
            
            // Glowing wire line
            ctx.beginPath();
            ctx.moveTo(pi.sx, pi.sy);
            // Curved bezier for organic feel
            const midX = (pi.sx + pj.sx) / 2 + Math.sin(time + i) * 8;
            const midY = (pi.sy + pj.sy) / 2 + Math.cos(time + j) * 8;
            ctx.quadraticCurveTo(midX, midY, pj.sx, pj.sy);
            ctx.strokeStyle = CYBER_COLORS[(i + j) % 3];
            ctx.globalAlpha = wireAlpha;
            ctx.lineWidth = 1.2 * dpr;
            ctx.stroke();

            // Animated data pulse traveling along wire
            const pulseT = ((time * 0.8 + i * 0.5 + j * 0.3) % 2) / 2;
            const pulseProg = pulseT;
            const pulseX = pi.sx + (pj.sx - pi.sx) * pulseProg + Math.sin(time + i) * 4 * (1 - Math.abs(pulseProg - 0.5) * 2);
            const pulseY = pi.sy + (pj.sy - pi.sy) * pulseProg + Math.cos(time + j) * 4 * (1 - Math.abs(pulseProg - 0.5) * 2);
            
            // Pulse glow
            const pulseGlowR = 6 * dpr;
            const pulseGrad = ctx.createRadialGradient(pulseX, pulseY, 0, pulseX, pulseY, pulseGlowR);
            pulseGrad.addColorStop(0, GLOW);
            pulseGrad.addColorStop(1, 'rgba(255,64,64,0)');
            ctx.beginPath();
            ctx.arc(pulseX, pulseY, pulseGlowR, 0, Math.PI * 2);
            ctx.fillStyle = pulseGrad;
            ctx.globalAlpha = wireAlpha * 2 * (1 - Math.abs(pulseProg - 0.5) * 2);
            ctx.fill();

            // Pulse core
            ctx.beginPath();
            ctx.arc(pulseX, pulseY, 2 * dpr, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.globalAlpha = wireAlpha * 3 * (1 - Math.abs(pulseProg - 0.5) * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
            const tilted = tiltPoint(px, py, pz, tilt.rx, tilt.ry);
            const p = project3D(tilted.x, tilted.y, tilted.z, cam.rotX, cam.rotY, cam.zoom, cx, cy);
            if (j === 0) ctx.moveTo(p.sx, p.sy);
            else ctx.lineTo(p.sx, p.sy);
          }
          ctx.closePath();
          ctx.setLineDash(isWaveform ? [] : [6 * dpr, 4 * dpr]);
          const ringAlpha = 0.3 + ri * 0.1;
          ctx.strokeStyle = ri === 0 ? ICE_BLUE : ri === 1 ? ELECTRIC : GLOW;
          ctx.globalAlpha = ringAlpha;
          ctx.lineWidth = (isWaveform ? 2 : 1.2) * dpr;
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.globalAlpha = 1;
      }

      // --- Grid: Manhattan-routed circuit connections + square data packets ---
      if (currentMode === 'grid') {
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          if (n.visibility < 0.2) continue;
          if (n.file.parentIndex >= 0 && n.file.parentIndex < nodes.length) {
            const parent = nodes[n.file.parentIndex];
            if (parent.visibility < 0.2) continue;
            const p1 = project3D(n.cx, n.cy, n.cz, cam.rotX, cam.rotY, cam.zoom, cx, cy);
            const p2 = project3D(parent.cx, parent.cy, parent.cz, cam.rotX, cam.rotY, cam.zoom, cx, cy);
            const vis = Math.min(n.visibility, parent.visibility);
            // Manhattan routing: go horizontal first, then vertical
            const midX = p1.sx;
            const midY = p2.sy;
            ctx.strokeStyle = CYBER_COLORS[i % 3];
            ctx.globalAlpha = 0.25 * vis;
            ctx.lineWidth = 1.4 * dpr;
            ctx.beginPath();
            ctx.moveTo(p1.sx, p1.sy);
            ctx.lineTo(midX, midY);
            ctx.lineTo(p2.sx, p2.sy);
            ctx.stroke();
            // Square data packet traveling along the path
            const pulseT = ((time * 0.8 + i * 0.7) % 3) / 3;
            let px: number, py: number;
            if (pulseT < 0.5) {
              const t2 = pulseT * 2;
              px = p1.sx;
              py = p1.sy + (midY - p1.sy) * t2;
            } else {
              const t2 = (pulseT - 0.5) * 2;
              px = midX + (p2.sx - midX) * t2;
              py = midY + (p2.sy - midY) * t2;
            }
            const pktSize = 3 * dpr;
            ctx.fillStyle = GLOW;
            ctx.globalAlpha = 0.6 * (1 - Math.abs(pulseT - 0.5) * 2) * vis;
            ctx.fillRect(px - pktSize / 2, py - pktSize / 2, pktSize, pktSize);
          }
        }
        ctx.globalAlpha = 1;
      }

      // --- Cluster labels ---
      if (currentMode === 'cluster') {
        const categories = Object.keys(CLUSTER_CATEGORIES);
        categories.forEach((cat, ci) => {
          const sectorAngle = (ci / categories.length) * Math.PI * 2;
          const lx = 180 * Math.cos(sectorAngle);
          const ly = -80;
          const lz = 180 * Math.sin(sectorAngle);
          const p = project3D(lx, ly, lz, cam.rotX, cam.rotY, cam.zoom, cx, cy);
          if (p.depth > -cam.zoom * 0.5) {
            ctx.globalAlpha = Math.min(0.8, p.scale);
            ctx.fillStyle = CLUSTER_CATEGORIES[cat].color;
            ctx.font = `700 ${Math.round(11 * dpr * p.scale)}px ${FONT_STACK}`;
            ctx.textAlign = 'center';
            ctx.fillText('[' + CLUSTER_CATEGORIES[cat].label + ']', p.sx, p.sy);
          }
        });
        ctx.globalAlpha = 1;
      }

      // --- Knowledge mode: neural circuit edges + orbital rings ---
      if (currentMode === 'knowledge') {
        // Draw concentric shell rings
        const shellRadii = [0, 70, 140, 210, 280, 350];
        const shellLabels = ['', 'CORE', 'PRI', 'SEC', 'TER', 'EXT'];
        for (let si = 1; si < shellRadii.length; si++) {
          const r = shellRadii[si];
          const segments = 120;
          ctx.beginPath();
          for (let j = 0; j <= segments; j++) {
            const a = (j / segments) * Math.PI * 2;
            const px = r * Math.cos(a);
            const py = 0;
            const pz = r * Math.sin(a);
            const p = project3D(px, py, pz, cam.rotX, cam.rotY, cam.zoom, cx, cy);
            if (j === 0) ctx.moveTo(p.sx, p.sy);
            else ctx.lineTo(p.sx, p.sy);
          }
          ctx.closePath();
          ctx.setLineDash([3 * dpr, 6 * dpr]);
          ctx.strokeStyle = CYBER_COLORS[si % 3];
          ctx.globalAlpha = 0.12 + si * 0.03;
          ctx.lineWidth = 1.5 * dpr;
          ctx.stroke();
          ctx.setLineDash([]);

          // Shell label
          if (shellLabels[si]) {
            const lp = project3D(r + 10, -12, 0, cam.rotX, cam.rotY, cam.zoom, cx, cy);
            if (lp.depth > -cam.zoom * 0.5) {
              ctx.globalAlpha = 0.4 * Math.min(1, lp.scale);
              ctx.fillStyle = CYBER_COLORS[si % 3];
              ctx.font = `700 ${Math.round(8 * dpr * lp.scale)}px ${FONT_STACK}`;
              ctx.textAlign = 'left';
              ctx.fillText('>' + shellLabels[si], lp.sx, lp.sy);
            }
          }
        }

        // Draw neural connections with Manhattan routing
        for (const [i, j] of knowledgeConnectionsRef.current) {
          const ni = nodes[i];
          const pi = project3D(ni.cx, ni.cy, ni.cz, cam.rotX, cam.rotY, cam.zoom, cx, cy);
          if (pi.depth < -cam.zoom * 0.7) continue;
          const nj = nodes[j];
          const dx = ni.cx - nj.cx;
          const dy = ni.cy - nj.cy;
          const dz = ni.cz - nj.cz;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist >= 120) continue;
          const pj = project3D(nj.cx, nj.cy, nj.cz, cam.rotX, cam.rotY, cam.zoom, cx, cy);
          if (pj.depth < -cam.zoom * 0.7) continue;
          const edgeAlpha = 0.22 * (1 - dist / 120) * Math.min(1, pi.scale, pj.scale);
          ctx.strokeStyle = CYBER_COLORS[(i + j) % 3];
          ctx.globalAlpha = edgeAlpha;
          ctx.lineWidth = 1.6 * dpr;
          ctx.beginPath();
          ctx.moveTo(pi.sx, pi.sy);
          ctx.lineTo(pi.sx, pj.sy);
          ctx.lineTo(pj.sx, pj.sy);
          ctx.stroke();

          const pulseT = ((time * 0.6 + i * 0.5 + j * 0.3) % 4) / 4;
          let ppx: number;
          let ppy: number;
          if (pulseT < 0.5) {
            ppx = pi.sx;
            ppy = pi.sy + (pj.sy - pi.sy) * (pulseT * 2);
          } else {
            ppx = pi.sx + (pj.sx - pi.sx) * ((pulseT - 0.5) * 2);
            ppy = pj.sy;
          }
          const pkS = 2.5 * dpr;
          ctx.fillStyle = GLOW;
          ctx.globalAlpha = 0.6 * (1 - Math.abs(pulseT - 0.5) * 2) * edgeAlpha * 4;
          ctx.fillRect(ppx - pkS / 2, ppy - pkS / 2, pkS, pkS);
        }

        // Center glow -- UKI core (pulsing with audioLevel)
        const coreP2 = project3D(0, 0, 0, cam.rotX, cam.rotY, cam.zoom, cx, cy);
        const coreGlow2R = (56 + ukiAmp * 30) * dpr;
        const coreGlow2 = ctx.createRadialGradient(coreP2.sx, coreP2.sy, 0, coreP2.sx, coreP2.sy, coreGlow2R);
        coreGlow2.addColorStop(0, 'rgba(100,210,255,0.26)');
        coreGlow2.addColorStop(0.4, 'rgba(255,64,64,0.15)');
        coreGlow2.addColorStop(1, 'rgba(100,210,255,0)');
        ctx.fillStyle = coreGlow2;
        ctx.globalAlpha = 0.72 + Math.sin(time * 2) * 0.14 + ukiAmp * 0.2;
        ctx.beginPath();
        ctx.arc(coreP2.sx, coreP2.sy, coreGlow2R, 0, Math.PI * 2);
        ctx.fill();
        // Core label
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = ICE_BLUE;
        ctx.font = `700 ${Math.round(9 * dpr)}px ${FONT_STACK}`;
        ctx.textAlign = 'center';
        ctx.fillText('_UKI_', coreP2.sx, coreP2.sy + 4 * dpr);

        // Memory type legend (bottom-left) with terminal prefixes
        const memNodes = memoryNodesRef.current;
        if (memNodes.length > 0) {
          const legendTypes = [
            { label: '>CONV', color: ICE_BLUE },
            { label: '>CMD', color: GLOW },
            { label: '>ACT', color: AMBER },
            { label: '>SUM', color: VIOLET },
          ];
          const lx = 16 * dpr;
          let ly = h - 16 * dpr;
          ctx.globalAlpha = 0.7;
          ctx.font = `700 ${Math.round(9 * dpr)}px ${FONT_STACK}`;
          ctx.textAlign = 'left';
          for (let li = legendTypes.length - 1; li >= 0; li--) {
            const lt = legendTypes[li];
            ctx.fillStyle = lt.color;
            const pkS2 = 4 * dpr;
            ctx.fillRect(lx, ly - 5 * dpr, pkS2, pkS2);
            ctx.fillText(lt.label, lx + 8 * dpr, ly);
            ly -= 14 * dpr;
          }
          ctx.fillStyle = GLOW;
          ctx.fillText(`[${memNodes.length}] RECORDS LOADED`, lx, ly);
        }

        ctx.globalAlpha = 1;
      }

      // --- Security mode: Shield HUD with real permission & anti-spy data ---
      if (currentMode === 'security') {
        const sec = getSecuritySummary();
        const perms = usePermissionStore.getState().permissions;
        const tier = getStoredTier() || 'mid';
        const logs = getAccessLog();

        // Central shield hexagon
        const shieldR = Math.min(w, h) * 0.15 / dpr;
        const shieldP = project3D(0, 0, 0, cam.rotX, cam.rotY, cam.zoom, cx, cy);
        const shieldCx = shieldP.sx;
        const shieldCy = shieldP.sy;

        // Pulsing shield glow
        const shieldPulse = 0.5 + 0.5 * Math.sin(time * 1.5);
        const shieldColor = sec.shieldScore >= 70 ? ELECTRIC : sec.shieldScore >= 40 ? AMBER : GLOW;

        // Outer rotating arc
        for (let a = 0; a < 3; a++) {
          const arcAngle = time * 0.4 + (a * Math.PI * 2 / 3);
          ctx.beginPath();
          ctx.arc(shieldCx, shieldCy, (shieldR + 30 * dpr), arcAngle, arcAngle + 0.8);
          ctx.strokeStyle = shieldColor;
          ctx.globalAlpha = 0.3 + shieldPulse * 0.2;
          ctx.lineWidth = 2 * dpr;
          ctx.stroke();
        }

        // Shield hexagon
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const px = shieldCx + shieldR * Math.cos(angle);
          const py = shieldCy + shieldR * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = shieldColor;
        ctx.globalAlpha = 0.6 + shieldPulse * 0.2;
        ctx.lineWidth = 2.5 * dpr;
        ctx.stroke();

        // Shield fill gradient
        const sg = ctx.createRadialGradient(shieldCx, shieldCy, 0, shieldCx, shieldCy, shieldR);
        sg.addColorStop(0, shieldColor + '30');
        sg.addColorStop(0.7, shieldColor + '10');
        sg.addColorStop(1, shieldColor + '05');
        ctx.fillStyle = sg;
        ctx.globalAlpha = 0.6;
        ctx.fill();

        // Inner shield label
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = shieldColor;
        ctx.font = `700 ${Math.round(14 * dpr)}px ${FONT_STACK}`;
        ctx.textAlign = 'center';
        ctx.fillText('SEC', shieldCx, shieldCy - 8 * dpr);

        // Shield score
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${Math.round(28 * dpr)}px ${FONT_STACK}`;
        ctx.fillText(String(sec.shieldScore), shieldCx, shieldCy + 22 * dpr);
        ctx.font = `600 ${Math.round(9 * dpr)}px ${FONT_STACK}`;
        ctx.fillStyle = shieldColor;
        ctx.fillText('SHIELD SCORE', shieldCx, shieldCy + 36 * dpr);

        // Anti-spy status ring (around shield)
        const statusR = shieldR + 55 * dpr;
        const permCount = ALL_PERMISSIONS.length;
        for (let i = 0; i < permCount; i++) {
          const permId = ALL_PERMISSIONS[i];
          const perm = perms[permId];
          const angle = (i / permCount) * Math.PI * 2 - Math.PI / 2;
          const arcLen = (1 / permCount) * Math.PI * 2 * 0.8;
          const nodeX = shieldCx + statusR * Math.cos(angle);
          const nodeY = shieldCy + statusR * Math.sin(angle);

          // Arc segment
          ctx.beginPath();
          ctx.arc(shieldCx, shieldCy, statusR - 6 * dpr, angle - arcLen / 2, angle + arcLen / 2);
          ctx.strokeStyle = perm.enabled ? AMBER : ELECTRIC;
          ctx.globalAlpha = perm.enabled ? 0.8 : 0.35;
          ctx.lineWidth = 4 * dpr;
          ctx.stroke();

          // Permission node
          ctx.beginPath();
          ctx.arc(nodeX, nodeY, 6 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = perm.enabled ? AMBER : ELECTRIC;
          ctx.globalAlpha = perm.enabled ? 0.9 : 0.4;
          ctx.fill();

          // Node glow
          if (perm.enabled) {
            ctx.beginPath();
            ctx.arc(nodeX, nodeY, 10 * dpr, 0, Math.PI * 2);
            const ng = ctx.createRadialGradient(nodeX, nodeY, 0, nodeX, nodeY, 10 * dpr);
            ng.addColorStop(0, AMBER + '40');
            ng.addColorStop(1, AMBER + '00');
            ctx.fillStyle = ng;
            ctx.globalAlpha = 0.6;
            ctx.fill();
          }

          // Label
          ctx.globalAlpha = perm.enabled ? 0.9 : 0.5;
          ctx.fillStyle = perm.enabled ? AMBER : WHITE;
          ctx.font = `700 ${Math.round(7 * dpr)}px ${FONT_STACK}`;
          ctx.textAlign = 'center';
          const label = PERMISSION_LABELS[permId].toUpperCase().slice(0, 5);
          ctx.fillText(label, nodeX, nodeY + 16 * dpr);
          ctx.font = `600 ${Math.round(6 * dpr)}px ${FONT_STACK}`;
          ctx.fillStyle = perm.enabled ? AMBER : ELECTRIC;
          ctx.fillText(perm.enabled ? 'ON' : 'OFF', nodeX, nodeY + 24 * dpr);
        }

        // Left panel: Security stats
        const panelX = 20 * dpr;
        let panelY = 60 * dpr;
        const lineH = 16 * dpr;

        ctx.globalAlpha = 0.85;
        ctx.textAlign = 'left';
        ctx.fillStyle = GLOW;
        ctx.font = `700 ${Math.round(10 * dpr)}px ${FONT_STACK}`;
        ctx.fillText('[ANTI-SPY SHIELD]', panelX, panelY);
        panelY += lineH;
        ctx.fillStyle = sec.antiSpyActive ? ELECTRIC : GLOW;
        ctx.font = `600 ${Math.round(9 * dpr)}px ${FONT_STACK}`;
        ctx.fillText(`>STATUS: ${sec.antiSpyActive ? 'ACTIVE' : 'INACTIVE'}`, panelX, panelY);
        panelY += lineH;
        ctx.fillStyle = WHITE;
        ctx.fillText(`>BLOCKED: ${sec.totalBlocked}`, panelX, panelY);
        panelY += lineH;
        ctx.fillText(`>ALLOWED: ${sec.totalAllowed}`, panelX, panelY);
        panelY += lineH;
        ctx.fillStyle = sec.recentBlocksLastHour > 0 ? GLOW : ELECTRIC;
        ctx.fillText(`>THREATS/1H: ${sec.recentBlocksLastHour}`, panelX, panelY);
        panelY += lineH;
        ctx.fillStyle = WHITE;
        ctx.fillText(`>ACCESS/24H: ${sec.accessLast24h}`, panelX, panelY);
        panelY += lineH * 1.5;
        ctx.fillStyle = AMBER;
        ctx.font = `700 ${Math.round(10 * dpr)}px ${FONT_STACK}`;
        ctx.fillText('[DEVICE PROFILE]', panelX, panelY);
        panelY += lineH;
        ctx.fillStyle = WHITE;
        ctx.font = `600 ${Math.round(9 * dpr)}px ${FONT_STACK}`;
        ctx.fillText(`>TIER: ${getTierLabel(tier).toUpperCase()}`, panelX, panelY);
        panelY += lineH;
        ctx.fillText(`>AUTO-DISABLE: ${sec.autoDisableActive ? '15MIN' : 'OFF'}`, panelX, panelY);
        panelY += lineH;
        ctx.fillText(`>PERMS ACTIVE: ${sec.activePermissions}/${sec.totalPermissions}`, panelX, panelY);
        panelY += lineH;
        ctx.fillText(`>PERMS LOCKED: ${sec.inactivePermissions}/${sec.totalPermissions}`, panelX, panelY);

        // Right panel: Recent access log
        const rX = w - 20 * dpr;
        let rY = 60 * dpr;
        ctx.textAlign = 'right';
        ctx.fillStyle = ICE_BLUE;
        ctx.font = `700 ${Math.round(10 * dpr)}px ${FONT_STACK}`;
        ctx.fillText('[ACCESS LOG]', rX, rY);
        rY += lineH;

        const recentLogs = logs.slice(-12).reverse();
        for (const log of recentLogs) {
          const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          ctx.fillStyle = log.allowed ? ELECTRIC : GLOW;
          ctx.globalAlpha = 0.7;
          ctx.font = `600 ${Math.round(8 * dpr)}px ${FONT_STACK}`;
          const permLabel = PERMISSION_LABELS[log.permissionId]?.toUpperCase().slice(0, 6) || log.permissionId.toUpperCase().slice(0, 6);
          const status = log.allowed ? 'PASS' : 'DENY';
          ctx.fillText(`${timeStr} ${permLabel} ${status}`, rX, rY);
          rY += lineH * 0.9;
        }
        if (recentLogs.length === 0) {
          ctx.fillStyle = WHITE;
          ctx.globalAlpha = 0.5;
          ctx.font = `600 ${Math.round(8 * dpr)}px ${FONT_STACK}`;
          ctx.fillText('NO ACCESS EVENTS', rX, rY);
        }

        // Scanning sweep line
        const sweepAngle = time * 0.6;
        ctx.beginPath();
        ctx.moveTo(shieldCx, shieldCy);
        ctx.lineTo(
          shieldCx + (statusR + 20 * dpr) * Math.cos(sweepAngle),
          shieldCy + (statusR + 20 * dpr) * Math.sin(sweepAngle),
        );
        ctx.strokeStyle = shieldColor;
        ctx.globalAlpha = 0.2;
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();

        // Sweep trail
        const sweepGrad = ctx.createConicGradient(sweepAngle - 0.5, shieldCx, shieldCy);
        sweepGrad.addColorStop(0, shieldColor + '00');
        sweepGrad.addColorStop(0.8, shieldColor + '00');
        sweepGrad.addColorStop(1, shieldColor + '20');
        ctx.beginPath();
        ctx.arc(shieldCx, shieldCy, statusR + 10 * dpr, sweepAngle - 0.5, sweepAngle);
        ctx.lineTo(shieldCx, shieldCy);
        ctx.closePath();
        ctx.fillStyle = sweepGrad;
        ctx.globalAlpha = 0.4;
        ctx.fill();

        ctx.globalAlpha = 1;
      }

      // --- Project and sort nodes by depth ---
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.prevSx = n.sx;
        n.prevSy = n.sy;
        const p = project3D(n.cx, n.cy, n.cz, cam.rotX, cam.rotY, cam.zoom, cx, cy);
        n.sx = p.sx;
        n.sy = p.sy;
        n.scale = p.scale;
        n.depth = p.depth;
      }

      // Depth-sorted render indices (reuse array to avoid GC)
      if (sortedIndicesRef.current.length !== nodes.length) {
        sortedIndicesRef.current = nodes.map((_, i) => i);
      }
      const sortedIndices = sortedIndicesRef.current;
      sortedIndices.sort((a, b) => nodes[b].depth - nodes[a].depth);

      // --- Draw nodes ---
      const sq = searchRef.current.toLowerCase();
      const selIdx = selectedNodeRef.current;
      for (const idx of sortedIndices) {
        const n = nodes[idx];
        if (n.depth < -cam.zoom * 0.8) continue;
        const isHovered = idx === hoveredRef.current;
        const isSelected = idx === selIdx;
        const isDir = n.file.isDirectory;
        const nodeColor = fileColor(n.file.extension, isDir);
        const baseR = (isDir ? 7 : 4.5) * n.scale * dpr;
        const r = isHovered ? baseR * 1.8 : isSelected ? baseR * 1.5 : baseR;
        if (r < 0.5) continue;

        const matchesSearch = !sq || n.file.name.toLowerCase().includes(sq);
        const depthFog = Math.max(0.15, Math.min(1, (cam.zoom + n.depth) / (cam.zoom * 1.2)));
        const alpha = Math.min(1, n.scale * 1.5) * (matchesSearch ? 1 : 0.12) * n.visibility * depthFog;
        if (alpha < 0.02) continue;

        // Motion trail
        const trailDx = n.sx - n.prevSx;
        const trailDy = n.sy - n.prevSy;
        const trailLen = Math.sqrt(trailDx * trailDx + trailDy * trailDy);
        if (trailLen > 3 * dpr && alpha > 0.3) {
          ctx.beginPath();
          ctx.moveTo(n.prevSx, n.prevSy);
          ctx.lineTo(n.sx, n.sy);
          ctx.strokeStyle = nodeColor;
          ctx.globalAlpha = alpha * 0.2;
          ctx.lineWidth = r * 0.5;
          ctx.lineCap = 'butt';
          ctx.stroke();
        }

        // Outer neon glow (sharp box shadow effect)
        if (isHovered || isSelected || isDir) {
          const glowR = r * (isHovered ? 3.5 : isSelected ? 3 : 2.5);
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, glowR, 0, Math.PI * 2);
          const glowGrad = ctx.createRadialGradient(n.sx, n.sy, 0, n.sx, n.sy, glowR);
          glowGrad.addColorStop(0, nodeColor);
          glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = glowGrad;
          ctx.globalAlpha = alpha * (isHovered ? 0.55 : isSelected ? 0.45 : 0.2);
          ctx.fill();
        }

        // Selection ring (sharp dashed)
        if (isSelected) {
          const ringR = r * 2.2;
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, ringR, 0, Math.PI * 2);
          ctx.setLineDash([3 * dpr, 3 * dpr]);
          ctx.strokeStyle = nodeColor;
          ctx.globalAlpha = alpha * (0.4 + 0.2 * Math.sin(time * 4));
          ctx.lineWidth = 1.5 * dpr;
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Chromatic aberration: offset ghost shapes on active UKI
        if (glitchIntensity > 0.1 && alpha > 0.3) {
          const gOff = glitchIntensity * 2 * dpr;
          ctx.globalAlpha = alpha * 0.15 * glitchIntensity;
          // Red ghost (Hot Pink offset)
          ctx.fillStyle = ELECTRIC;
          ctx.beginPath();
          if (isDir) {
            // Diamond
            ctx.moveTo(n.sx - gOff, n.sy - r);
            ctx.lineTo(n.sx + r - gOff, n.sy);
            ctx.lineTo(n.sx - gOff, n.sy + r);
            ctx.lineTo(n.sx - r - gOff, n.sy);
          } else {
            ctx.arc(n.sx - gOff, n.sy, r, 0, Math.PI * 2);
          }
          ctx.closePath();
          ctx.fill();
          // Cyan ghost
          ctx.fillStyle = ICE_BLUE;
          ctx.beginPath();
          if (isDir) {
            ctx.moveTo(n.sx + gOff, n.sy - r);
            ctx.lineTo(n.sx + r + gOff, n.sy);
            ctx.lineTo(n.sx + gOff, n.sy + r);
            ctx.lineTo(n.sx - r + gOff, n.sy);
          } else {
            ctx.arc(n.sx + gOff, n.sy, r, 0, Math.PI * 2);
          }
          ctx.closePath();
          ctx.fill();
        }

        // Node body: directories = DIAMOND, files = HEXAGON
        ctx.globalAlpha = alpha;
        if (isDir) {
          // Sharp diamond shape
          ctx.beginPath();
          ctx.moveTo(n.sx, n.sy - r);
          ctx.lineTo(n.sx + r, n.sy);
          ctx.lineTo(n.sx, n.sy + r);
          ctx.lineTo(n.sx - r, n.sy);
          ctx.closePath();
          ctx.fillStyle = nodeColor;
          ctx.fill();
          // Diamond border
          ctx.strokeStyle = WHITE;
          ctx.globalAlpha = alpha * 0.4;
          ctx.lineWidth = 1 * dpr;
          ctx.stroke();
        } else {
          // Hexagon shape
          ctx.beginPath();
          for (let hi = 0; hi < 6; hi++) {
            const hAngle = (hi / 6) * Math.PI * 2 - Math.PI / 6;
            const hx = n.sx + r * Math.cos(hAngle);
            const hy = n.sy + r * Math.sin(hAngle);
            if (hi === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          ctx.fillStyle = nodeColor;
          ctx.fill();
          // Hex border
          ctx.strokeStyle = WHITE;
          ctx.globalAlpha = alpha * 0.3;
          ctx.lineWidth = 0.8 * dpr;
          ctx.stroke();
        }

        // Selection brackets around node
        if (alpha > 0.15 && r > 2) {
          const bS = r * 2.2;
          const bLen = bS * 0.35;
          ctx.strokeStyle = isDir ? ELECTRIC : ICE_BLUE;
          ctx.globalAlpha = alpha * 0.5;
          ctx.lineWidth = 1 * dpr;
          // Top-left
          ctx.beginPath();
          ctx.moveTo(n.sx - bS, n.sy - bS + bLen);
          ctx.lineTo(n.sx - bS, n.sy - bS);
          ctx.lineTo(n.sx - bS + bLen, n.sy - bS);
          ctx.stroke();
          // Top-right
          ctx.beginPath();
          ctx.moveTo(n.sx + bS - bLen, n.sy - bS);
          ctx.lineTo(n.sx + bS, n.sy - bS);
          ctx.lineTo(n.sx + bS, n.sy - bS + bLen);
          ctx.stroke();
          // Bottom-left
          ctx.beginPath();
          ctx.moveTo(n.sx - bS, n.sy + bS - bLen);
          ctx.lineTo(n.sx - bS, n.sy + bS);
          ctx.lineTo(n.sx - bS + bLen, n.sy + bS);
          ctx.stroke();
          // Bottom-right
          ctx.beginPath();
          ctx.moveTo(n.sx + bS - bLen, n.sy + bS);
          ctx.lineTo(n.sx + bS, n.sy + bS);
          ctx.lineTo(n.sx + bS, n.sy + bS - bLen);
          ctx.stroke();
        }

        // File/folder classification label + contact name
        const showLabel = (isHovered || isSelected || (n.scale > 0.7 && isDir) || n.scale > 1.1) && alpha > 0.3;
        if (showLabel) {
          const tagLabel = isDir ? 'FOLDER' : 'FILE';
          const tagColor = isDir ? ELECTRIC : ICE_BLUE;
          const tagSize = Math.round(Math.max(7, 8 * n.scale) * dpr);
          ctx.font = `700 ${tagSize}px ${FONT_STACK}`;
          ctx.textAlign = 'center';
          ctx.fillStyle = tagColor;
          ctx.globalAlpha = alpha * 0.75;
          ctx.fillText(tagLabel, n.sx, n.sy - r * 2.5 - 3 * dpr);

          // Contact name below brackets (only on hover/select)
          if (isHovered || isSelected) {
            const nameSize = Math.round(Math.max(8, 10 * n.scale) * dpr);
            ctx.font = `700 ${nameSize}px ${FONT_STACK}`;
            ctx.textBaseline = 'top';
            ctx.fillStyle = nodeColor;
            ctx.globalAlpha = alpha * 0.95;
            ctx.fillText(n.file.name, n.sx, n.sy + r * 2.5 + 2 * dpr);
          }
        }
      }
      ctx.globalAlpha = 1;

      // --- Tracking lines: lines from nodes to screen edges with labels ---
      // Only draw tracking lines for the top 8 most prominent contacts
      const trackingCandidates: { idx: number; score: number }[] = [];
      for (const idx of sortedIndices) {
        const n = nodes[idx];
        if (n.depth < -cam.zoom * 0.8) continue;
        const depthFog = Math.max(0.15, Math.min(1, (cam.zoom + n.depth) / (cam.zoom * 1.2)));
        const alpha = Math.min(1, n.scale * 1.5) * n.visibility * depthFog;
        if (alpha < 0.15 || n.scale < 0.5) continue;
        trackingCandidates.push({ idx, score: alpha * n.scale });
      }
      trackingCandidates.sort((a, b) => b.score - a.score);
      const topTracked = trackingCandidates.slice(0, 8);
      for (const { idx } of topTracked) {
        const n = nodes[idx];
        const depthFog = Math.max(0.15, Math.min(1, (cam.zoom + n.depth) / (cam.zoom * 1.2)));
        const alpha = Math.min(1, n.scale * 1.5) * n.visibility * depthFog;

        const isDir = n.file.isDirectory;
        const lineColor = isDir ? ELECTRIC : ICE_BLUE;
        const tagLabel = isDir ? 'FOLDER' : 'FILE';

        // Pick edge: left half goes left, right half goes right
        const goLeft = n.sx < cx;
        const edgeX = goLeft ? borderInset + 2 * dpr : w - borderInset - 2 * dpr;
        const edgeY = n.sy;

        ctx.strokeStyle = lineColor;
        ctx.globalAlpha = alpha * 0.18;
        ctx.lineWidth = 0.8 * dpr;
        ctx.beginPath();
        ctx.moveTo(n.sx, n.sy);
        ctx.lineTo(edgeX, edgeY);
        ctx.stroke();

        // Edge label
        const labelSize = Math.round(7 * dpr);
        ctx.font = `700 ${labelSize}px ${FONT_STACK}`;
        ctx.fillStyle = lineColor;
        ctx.globalAlpha = alpha * 0.45;
        ctx.textAlign = goLeft ? 'left' : 'right';
        const labelX = goLeft ? edgeX - 4 * dpr : edgeX + 4 * dpr;
        ctx.fillText(tagLabel, labelX, edgeY + 3 * dpr);

        // Small dot at edge endpoint
        ctx.beginPath();
        ctx.arc(edgeX, edgeY, 2.5 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = lineColor;
        ctx.globalAlpha = alpha * 0.6;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // --- Draw avatar when no nodes are loaded ---
      if (nodesRef.current.length === 0) {
        drawNexusAvatar(ctx, cx, cy, dpr, time, ukiAmp, ukiActive, ukiSpeaking);
      }

      // --- Central Core -- pulsing energy nucleus ---
      const coreP = project3D(0, 0, 0, cam.rotX, cam.rotY, cam.zoom, cx, cy);
      const coreScale = coreP.scale;
      const coreR = (22 + ukiAmp * 12) * coreScale * dpr;
      const pulsePhase = 0.5 + 0.5 * Math.sin(time * (ukiActive ? 4 : 1.5));
      const breathe = 0.5 + 0.5 * Math.sin(time * (ukiSpeaking ? 3 : 0.8));

      // Deep ambient glow
      const glowR = coreR * 4;
      const glowGrad = ctx.createRadialGradient(coreP.sx, coreP.sy, 0, coreP.sx, coreP.sy, glowR);
      glowGrad.addColorStop(0, `rgba(10,132,255,${0.12 + breathe * 0.06})`);
      glowGrad.addColorStop(0.3, 'rgba(94,92,230,0.05)');
      glowGrad.addColorStop(0.6, 'rgba(0,60,180,0.02)');
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.arc(coreP.sx, coreP.sy, glowR, 0, Math.PI * 2);
      ctx.fillStyle = glowGrad;
      ctx.globalAlpha = 1;
      ctx.fill();

      // Orbiting energy rings (3 layers, counter-rotating)
      for (let oi = 0; oi < 3; oi++) {
        const orbitR = coreR * 1.5 + oi * coreR * 0.55;
        const speed = (0.6 + oi * 0.25) * (oi % 2 === 0 ? 1 : -1);
        const arcStart = time * speed + oi * 2.1;
        const arcLen = Math.PI * (0.35 + oi * 0.1);
        ctx.beginPath();
        ctx.arc(coreP.sx, coreP.sy, orbitR, arcStart, arcStart + arcLen);
        ctx.strokeStyle = oi === 0 ? ICE_BLUE : oi === 1 ? ELECTRIC : GLOW;
        ctx.globalAlpha = 0.2 + pulsePhase * 0.1;
        ctx.lineWidth = (1.8 - oi * 0.4) * dpr;
        ctx.stroke();
        // Mirror arc
        ctx.beginPath();
        ctx.arc(coreP.sx, coreP.sy, orbitR, arcStart + Math.PI, arcStart + Math.PI + arcLen * 0.5);
        ctx.globalAlpha = 0.1 + pulsePhase * 0.05;
        ctx.stroke();
      }

      // Outer shell ring (breathing)
      const shellR = coreR * 1.1 + breathe * coreR * 0.08;
      ctx.beginPath();
      ctx.arc(coreP.sx, coreP.sy, shellR, 0, Math.PI * 2);
      ctx.strokeStyle = ICE_BLUE;
      ctx.globalAlpha = 0.3 + pulsePhase * 0.15;
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();

      // Core sphere -- layered gradient for 3D depth
      const coreInner = coreR * 0.85;
      ctx.beginPath();
      ctx.arc(coreP.sx, coreP.sy, coreInner, 0, Math.PI * 2);
      const coreGrad = ctx.createRadialGradient(
        coreP.sx - coreInner * 0.25, coreP.sy - coreInner * 0.3, coreInner * 0.1,
        coreP.sx, coreP.sy, coreInner
      );
      coreGrad.addColorStop(0, 'rgba(160,210,255,0.95)');
      coreGrad.addColorStop(0.35, 'rgba(10,132,255,0.9)');
      coreGrad.addColorStop(0.7, 'rgba(40,60,180,0.8)');
      coreGrad.addColorStop(1, 'rgba(20,20,80,0.7)');
      ctx.fillStyle = coreGrad;
      ctx.globalAlpha = 0.92 + pulsePhase * 0.08;
      ctx.fill();

      // Specular highlight on core (top-left shine)
      const specR = coreInner * 0.5;
      const specGrad = ctx.createRadialGradient(
        coreP.sx - coreInner * 0.3, coreP.sy - coreInner * 0.35, 0,
        coreP.sx - coreInner * 0.3, coreP.sy - coreInner * 0.35, specR
      );
      specGrad.addColorStop(0, 'rgba(255,255,255,0.45)');
      specGrad.addColorStop(0.5, 'rgba(255,255,255,0.1)');
      specGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      ctx.arc(coreP.sx - coreInner * 0.3, coreP.sy - coreInner * 0.35, specR, 0, Math.PI * 2);
      ctx.fillStyle = specGrad;
      ctx.globalAlpha = 0.8;
      ctx.fill();

      // Inner energy pulse (small bright center)
      const pulseR = coreInner * (0.18 + breathe * 0.08);
      ctx.beginPath();
      ctx.arc(coreP.sx, coreP.sy, pulseR, 0, Math.PI * 2);
      const pulseGrad = ctx.createRadialGradient(coreP.sx, coreP.sy, 0, coreP.sx, coreP.sy, pulseR);
      pulseGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
      pulseGrad.addColorStop(0.5, 'rgba(160,220,255,0.5)');
      pulseGrad.addColorStop(1, 'rgba(10,132,255,0)');
      ctx.fillStyle = pulseGrad;
      ctx.globalAlpha = 0.7 + pulsePhase * 0.3;
      ctx.fill();

      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      knowledgeSimRef.current?.dispose();
      knowledgeSimRef.current = null;
    };
  }, [filesLoaded]);

  // -----------------------------------------------------------------------
  // Mode switch handler
  // -----------------------------------------------------------------------
  const switchMode = useCallback((m: ViewMode) => {
    setMode(m);
    cameraRef.current.autoRotate = true;
  }, []);

  // Search results for dropdown
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return searchIndexRef.current
      .filter(n => n.nameLower.includes(q))
      .slice(0, 8)
      .map(n => n.file);
  }, [searchQuery, filesLoaded, nodeCount]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div ref={containerRef} style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: `radial-gradient(circle at 50% 45%, rgba(100,210,255,0.08), transparent 42%), ${BG}`,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ── Top Bar ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px',
        gap: 10,
        minWidth: 0,
        maxWidth: '100%',
        overflowX: 'auto',
        overflowY: 'visible',
        scrollbarWidth: 'thin',
        zIndex: 15,
        background: 'linear-gradient(180deg, rgba(7,11,18,0.96) 0%, rgba(7,11,18,0.74) 72%, transparent 100%)',
        borderBottom: '1px solid rgba(100,210,255,0.14)',
        pointerEvents: 'none',
      }}>
        {/* Title + node count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'auto', minWidth: 0, flexShrink: 0 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 8,
            background: 'rgba(100,210,255,0.08)',
            border: `1.5px solid ${ICE_BLUE}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 8px ${ICE_BLUE}44, inset 0 0 4px ${ICE_BLUE}22`,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={ICE_BLUE} strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9" strokeDasharray="4 3"/>
            </svg>
          </div>
          <div>
            <div style={{ color: ICE_BLUE, fontSize: 12, fontWeight: 700, letterSpacing: 1.2, fontFamily: FONT_STACK, textTransform: 'uppercase' }}>Nexus</div>
            <div style={{ color: ELECTRIC, fontSize: 8, fontWeight: 700, marginTop: 1, fontFamily: FONT_STACK, letterSpacing: 0.8 }}>
              {nodeCount} nodes / {mode.toUpperCase()} / LIVE
            </div>
          </div>
        </div>

        {/* Search Bar (Terminal Style) */}
        <div style={{
          position: 'relative',
          width: 'min(380px, 42vw)',
          minWidth: 170,
          maxWidth: 380,
          pointerEvents: 'auto',
          flex: '1 1 240px',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            height: 28,
            borderRadius: 10,
            padding: '0 10px',
            background: searchFocused ? 'rgba(100,210,255,0.08)' : 'rgba(11,18,28,0.82)',
            border: `1px solid ${searchFocused ? ICE_BLUE : 'rgba(100,210,255,0.16)'}`,
            boxShadow: searchFocused ? `0 0 12px ${ICE_BLUE}33, inset 0 0 6px ${ICE_BLUE}11` : 'none',
            transition: 'all 0.2s ease',
          }}>
            <span style={{ color: GLOW, fontSize: 10, fontFamily: FONT_STACK, fontWeight: 700, flexShrink: 0 }}>{'>'}</span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              aria-label="Search nodes"
              role="combobox"
              aria-expanded={searchFocused && searchResults.length > 0}
              aria-autocomplete="list"
              onChange={e => { setSearchQuery(e.target.value); setSearchSelectedIdx(-1); }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              onKeyDown={e => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSearchSelectedIdx(prev => Math.min(prev + 1, searchResults.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSearchSelectedIdx(prev => Math.max(prev - 1, -1));
                } else if (e.key === 'Enter' && searchSelectedIdx >= 0 && searchSelectedIdx < searchResults.length) {
                  e.preventDefault();
                  const file = searchResults[searchSelectedIdx];
                  const matchIdx = nodesRef.current.findIndex(n => n.file.path === file.path);
                  if (matchIdx >= 0) {
                    const matchNode = nodesRef.current[matchIdx];
                    const look = computeLookAt(matchNode.tx, matchNode.ty, matchNode.tz);
                    focusTargetRef.current = { x: matchNode.tx, y: matchNode.ty, z: matchNode.tz, active: true, progress: 0, targetRotX: look.rotX, targetRotY: look.rotY };
                    selectedNodeRef.current = matchIdx;
                    cameraRef.current.autoRotate = false;
                  }
                  setSearchFocused(false);
                  searchInputRef.current?.blur();
                } else if (e.key === 'Escape') {
                  setSearchFocused(false);
                  searchInputRef.current?.blur();
                }
              }}
              placeholder="Search nodes..."
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: ICE_BLUE, fontSize: 12, fontWeight: 700,
                fontFamily: FONT_STACK,
                letterSpacing: 1,
                caretColor: GLOW,
              }}
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                aria-label="Clear search"
                style={{
                  background: 'rgba(100,210,255,0.12)', border: `1px solid ${ELECTRIC}`,
                  borderRadius: 6,
                  width: 20, height: 20, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(100,210,255,0.22)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(100,210,255,0.12)')}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={ELECTRIC} strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>

          {/* Search Results Dropdown (Terminal List) */}
          {searchFocused && searchQuery && searchResults.length === 0 && (
            <div style={{
              position: 'absolute', top: 40, left: 0, right: 0,
              background: 'rgba(11,18,28,0.97)',
              border: `1px solid rgba(100,210,255,0.18)`,
              borderTop: 'none',
              borderRadius: '0 0 10px 10px',
              padding: '12px',
              zIndex: 30,
            }}>
              <div style={{ color: 'rgba(216,226,240,0.58)', fontSize: 10, fontWeight: 700, letterSpacing: 0.6, fontFamily: FONT_STACK, textAlign: 'center' }}>
                No match for "{searchQuery}"
              </div>
            </div>
          )}
          {searchFocused && searchResults.length > 0 && (
            <div style={{
              position: 'absolute', top: 40, left: 0, right: 0,
              background: 'rgba(11,18,28,0.97)',
              border: `1px solid ${ICE_BLUE}`,
              borderTop: 'none',
              borderRadius: '0 0 10px 10px',
              boxShadow: `0 12px 34px rgba(0,0,0,0.45), 0 0 20px ${ICE_BLUE}18`,
              padding: '4px 0',
              maxHeight: 'min(280px, calc(100vh - 98px))',
              overflowY: 'auto',
              zIndex: 30,
            }}>
              <div style={{ padding: '4px 12px 6px', color: GLOW, fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', fontFamily: FONT_STACK, borderBottom: '1px solid rgba(100,210,255,0.1)', marginBottom: 2 }}>
                {searchResults.length} match{searchResults.length !== 1 ? 'es' : ''}
              </div>
              {searchResults.map((file, i) => (
                <div
                  key={file.path + i}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 12px', cursor: 'pointer',
                    transition: 'background 0.1s',
                    background: i === searchSelectedIdx ? `rgba(100,210,255,0.12)` : 'transparent',
                    borderLeft: i === searchSelectedIdx ? `2px solid ${ICE_BLUE}` : '2px solid transparent',
                  }}
                  onMouseEnter={() => setSearchSelectedIdx(i)}
                  onMouseLeave={() => {}}
                  onMouseDown={() => {
                    const matchIdx = nodesRef.current.findIndex(n => n.file.path === file.path);
                    if (matchIdx >= 0) {
                      const matchNode = nodesRef.current[matchIdx];
                      const look = computeLookAt(matchNode.tx, matchNode.ty, matchNode.tz);
                      focusTargetRef.current = { x: matchNode.tx, y: matchNode.ty, z: matchNode.tz, active: true, progress: 0, targetRotX: look.rotX, targetRotY: look.rotY };
                      selectedNodeRef.current = matchIdx;
                      cameraRef.current.autoRotate = false;
                    }
                  }}
                >
                  <span style={{ color: GLOW, fontSize: 10, fontFamily: FONT_STACK, fontWeight: 700, flexShrink: 0, width: 16, textAlign: 'right' }}>
                    {String(i).padStart(2, '0')}
                  </span>
                  <div style={{
                    width: 6, height: 6, borderRadius: 3, flexShrink: 0,
                    background: file.isDirectory ? ICE_BLUE : fileColor(file.extension, false),
                    boxShadow: `0 0 6px ${file.isDirectory ? ICE_BLUE : fileColor(file.extension, false)}`,
                  }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: WHITE, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: FONT_STACK, letterSpacing: 0.5 }}>
                      {file.name}
                    </div>
                  </div>
                  <span style={{ color: 'rgba(216,226,240,0.45)', fontSize: 9, fontFamily: FONT_STACK, fontWeight: 600, flexShrink: 0 }}>
                    {file.isDirectory ? 'Folder' : 'File'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reset camera */}
        <button
          onClick={() => { cameraRef.current = { rotX: 0.3, rotY: 0, zoom: 500, autoRotate: true }; }}
          aria-label="Reset camera view"
          style={{
            pointerEvents: 'auto',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: 9,
            background: 'rgba(100,210,255,0.06)',
            border: `1px solid rgba(100,210,255,0.18)`,
            color: 'rgba(216,226,240,0.72)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = ICE_BLUE; e.currentTarget.style.color = ICE_BLUE; e.currentTarget.style.boxShadow = `0 0 6px ${ICE_BLUE}44`; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(100,210,255,0.18)'; e.currentTarget.style.color = 'rgba(216,226,240,0.72)'; e.currentTarget.style.boxShadow = 'none'; }}
          title="Reset view"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
        </button>
      </div>

      {/* ── Canvas ── */}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Nexus 3D file visualization"
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab', flex: 1 }}
      />

      {/* ── Bottom Control Bar ── */}
      <div style={{
        position: 'absolute',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '5px 10px',
        maxWidth: 'calc(100% - 24px)',
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollbarWidth: 'thin',
        background: 'rgba(11,18,28,0.92)',
        border: `1px solid rgba(100,210,255,0.2)`,
        borderRadius: 12,
        boxShadow: `0 8px 26px rgba(0,0,0,0.34), 0 0 12px ${ICE_BLUE}10`,
        zIndex: 10,
      }}>
        <ModeButton
          label="Starfield"
          active={mode === 'starfield'}
          onClick={() => switchMode('starfield')}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2.4"/><ellipse cx="12" cy="12" rx="8" ry="4.4"/><path d="M4 12h16"/></svg>}
        />
        <ModeButton
          label="Grid"
          active={mode === 'grid'}
          onClick={() => switchMode('grid')}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v4"/><path d="M12 8l-5 4"/><path d="M12 8l5 4"/><path d="M7 12v6"/><path d="M17 12v6"/></svg>}
        />
        <ModeButton
          label="Cluster"
          active={mode === 'cluster'}
          onClick={() => switchMode('cluster')}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="2.6"/><circle cx="16" cy="8" r="2.6"/><circle cx="12" cy="16" r="2.6"/><path d="M10.2 9.8l1.6 3.6"/><path d="M13.8 9.8l-1.6 3.6"/></svg>}
        />
        <ModeButton
          label="Knowledge"
          active={mode === 'knowledge'}
          onClick={() => switchMode('knowledge')}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="4" r="1.6"/><circle cx="20" cy="12" r="1.6"/><circle cx="12" cy="20" r="1.6"/><circle cx="4" cy="12" r="1.6"/><path d="M12 6.2v3.6"/><path d="M17.8 12h-3.6"/><path d="M12 17.8v-3.6"/><path d="M6.2 12h3.6"/></svg>}
        />
        <ModeButton
          label="Security"
          active={mode === 'security'}
          onClick={() => switchMode('security')}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
        />

        <div style={{ width: 1, height: 18, background: 'var(--color-border)', margin: '0 4px' }} />

        <button
          onClick={browseFolder}
          aria-label="Browse folder"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', height: 24,
            background: 'rgba(100,210,255,0.1)',
            border: `1px solid ${ICE_BLUE}55`,
            color: ICE_BLUE,
            fontSize: 9, fontWeight: 700, fontFamily: FONT_STACK,
            letterSpacing: 1.2, textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `rgba(100,210,255,0.18)`; (e.currentTarget as HTMLButtonElement).style.borderColor = ICE_BLUE; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `rgba(100,210,255,0.1)`; (e.currentTarget as HTMLButtonElement).style.borderColor = `${ICE_BLUE}55`; }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          SCAN
        </button>

        <div style={{ width: 1, height: 18, background: 'var(--color-border)', margin: '0 4px' }} />

        <ZoomButton
          label="Zoom in"
          onClick={() => { zoomVelocityRef.current = -cameraRef.current.zoom * 0.18; }}
          icon="+"
        />
        <ZoomButton
          label="Zoom out"
          onClick={() => { zoomVelocityRef.current = cameraRef.current.zoom * 0.18; }}
          icon="-"
        />
      </div>

      {/* -- HUD Left Panel: System Readouts -- */}
      <div style={{
        position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
        display: 'flex', flexDirection: 'column', gap: 4,
        pointerEvents: 'none', zIndex: 12,
        fontFamily: FONT_STACK,
        maxWidth: 'min(130px, 24vw)',
      }}>
        {[
          { label: 'NODES', value: String(nodeCount), color: ICE_BLUE },
          { label: 'MODE', value: mode.toUpperCase(), color: ELECTRIC },
          { label: 'DEPTH', value: String(Math.round(cameraRef.current.zoom)), color: GLOW },
        ].map((item) => (
          <div key={item.label} style={{
            padding: '4px 8px',
            background: 'rgba(11,18,28,0.72)',
            borderLeft: `2px solid ${item.color}`,
            borderRadius: 8,
            boxShadow: `0 0 10px ${item.color}20`,
          }}>
            <div style={{ fontSize: 8, color: 'rgba(216,226,240,0.45)', letterSpacing: 1, fontWeight: 700 }}>{item.label}</div>
            <div style={{ fontSize: 11, color: item.color, fontWeight: 700, marginTop: 1, letterSpacing: 0.3 }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* -- HUD Right Panel: Status Indicators -- */}
      <div style={{
        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
        display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end',
        pointerEvents: 'none', zIndex: 12,
        fontFamily: FONT_STACK,
        maxWidth: 'min(130px, 24vw)',
      }}>
        {[
          { label: 'SCAN', status: 'ACTIVE', color: ELECTRIC },
          { label: 'LINK', status: 'ONLINE', color: ELECTRIC },
          { label: 'GRID', status: filesLoaded ? 'MAPPED' : 'LOADING', color: filesLoaded ? ELECTRIC : AMBER },
        ].map((item) => (
          <div key={item.label} style={{
            padding: '4px 8px',
            background: 'rgba(11,18,28,0.72)',
            borderRight: `2px solid ${item.color}`,
            borderRadius: 8,
            textAlign: 'right',
            boxShadow: `0 0 10px ${item.color}20`,
          }}>
            <div style={{ fontSize: 8, color: 'rgba(216,226,240,0.45)', letterSpacing: 1, fontWeight: 700 }}>{item.label}</div>
            <div style={{ fontSize: 9, color: item.color, fontWeight: 700, marginTop: 1, letterSpacing: 0.3 }}>{item.status}</div>
          </div>
        ))}
      </div>

      {/* -- Tooltip -- */}
      <div ref={tooltipDomRef} style={{
        position: 'absolute',
        pointerEvents: 'none',
        background: 'rgba(11,18,28,0.95)',
        border: `1px solid ${ICE_BLUE}`,
        borderRadius: 8,
        padding: '6px 10px',
        zIndex: 20,
        maxWidth: 260,
        boxShadow: `0 8px 24px rgba(0,0,0,0.42), 0 0 8px ${ICE_BLUE}18`,
        display: 'none',
      }}>
        <div style={{ color: ICE_BLUE, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: FONT_STACK, letterSpacing: 0.5 }}>
        </div>
        <div style={{ color: 'rgba(216,226,240,0.5)', fontSize: 9, marginTop: 2, fontFamily: FONT_STACK, letterSpacing: 0.3 }}>
        </div>
      </div>

      {/* -- UKI Web Search Results Panel (Right Side) -- */}
      {showWebResults && webSearchResults.length > 0 && (
        <div style={{
          position: 'absolute', right: 12, top: 60, width: 'min(260px, calc(100% - 24px))',
          maxHeight: 'min(320px, calc(100% - 84px))', overflowY: 'auto',
          background: 'rgba(11,18,28,0.94)',
          border: `1px solid ${ICE_BLUE}30`,
          borderRadius: 12,
          boxShadow: `0 4px 20px rgba(0,0,0,0.4), 0 0 12px ${ICE_BLUE}15`,
          zIndex: 20,
          fontFamily: FONT_STACK,
          scrollbarWidth: 'none',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 10px',
            borderBottom: `1px solid rgba(100,210,255,0.12)`,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: ICE_BLUE, letterSpacing: 2, textTransform: 'uppercase' }}>UKI WEB RESULTS</div>
            <button
              onClick={() => setShowWebResults(false)}
              style={{
                background: 'transparent', border: 'none', color: 'rgba(216,226,240,0.52)',
                cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 4,
              }}
            >×</button>
          </div>
          {webSearchResults.map((r, i) => (
            <button
              key={`${r.timestamp}-${i}`}
              onClick={() => {
                window.dispatchEvent(new CustomEvent('dex-spotlight-navigate', { detail: { appId: 'browser', url: r.url } }));
              }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 10px',
                background: 'transparent',
                border: 'none', borderBottom: '1px solid rgba(100,210,255,0.08)',
                cursor: 'pointer',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(100,210,255,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ fontSize: 11, color: ICE_BLUE, fontWeight: 600, letterSpacing: 0.5 }}>{r.query}</div>
              <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* -- Hints Legend (Bottom-Right) -- */}
      <div style={{
        position: 'absolute', bottom: 56, right: 12,
        display: 'flex', flexDirection: 'column', gap: 2,
        pointerEvents: 'none', zIndex: 12,
        fontFamily: FONT_STACK,
        opacity: 0.5,
        maxWidth: 'min(160px, 34vw)',
      }}>
        {[
          { key: 'DRAG', desc: 'ROTATE' },
          { key: 'SCROLL', desc: 'ZOOM' },
          { key: 'CLICK', desc: 'SELECT NODE' },
          { key: 'ESC', desc: 'DESELECT' },
          { key: '/', desc: 'SEARCH' },
        ].map(h => (
          <div key={h.key} style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 8, color: 'var(--color-text-tertiary)', letterSpacing: 1, fontWeight: 600 }}>{h.desc}</span>
            <span style={{
              fontSize: 8, color: ICE_BLUE, fontWeight: 700, letterSpacing: 0.5,
              padding: '1px 4px',
              border: `1px solid rgba(100,210,255,0.18)`,
              borderRadius: 5,
              background: 'rgba(11,18,28,0.7)',
            }}>{h.key}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const modeBtnBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 8px',
  border: `1px solid rgba(100,210,255,0.14)`,
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 9,
  fontWeight: 700,
  fontFamily: FONT_STACK,
  transition: 'all 0.15s ease',
  color: WHITE,
  letterSpacing: 1,
  textTransform: 'uppercase' as const,
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const ModeButton = memo(({ label, active, onClick, icon }: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`Switch to ${label} view`}
      aria-pressed={active}
      style={{
        ...modeBtnBase,
        background: active
          ? 'rgba(100,210,255,0.14)'
          : hovered
          ? 'rgba(100,210,255,0.08)'
          : 'transparent',
        boxShadow: active ? `0 0 12px rgba(100,210,255,0.18), inset 0 0 8px rgba(100,210,255,0.08)` : 'none',
        borderColor: active ? ICE_BLUE : hovered ? 'rgba(100,210,255,0.28)' : 'rgba(100,210,255,0.14)',
        color: active ? ICE_BLUE : hovered ? 'rgba(216,226,240,0.95)' : WHITE,
      }}
    >
      {icon}
      {label}
    </button>
  );
});
ModeButton.displayName = 'ModeButton';

const ZoomButton = memo(({ label, onClick, icon }: {
  label: string;
  onClick: () => void;
  icon: string;
}) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={label}
      aria-label={label}
      style={{
        width: 24,
        height: 24,
        border: `1px solid ${hovered ? ICE_BLUE : 'rgba(100,210,255,0.16)'}`,
        borderRadius: 8,
        background: hovered ? 'rgba(100,210,255,0.08)' : 'transparent',
        color: hovered ? ICE_BLUE : 'rgba(216,226,240,0.72)',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: FONT_STACK,
        transition: 'all 0.15s ease',
        boxShadow: hovered ? `0 0 6px rgba(100,210,255,0.16)` : 'none',
      }}
    >
      {icon}
    </button>
  );
});
ZoomButton.displayName = 'ZoomButton';

export default Nexus;
