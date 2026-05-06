// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Constants -- Material DB, Standard Parts, GD&T Symbols
// ═══════════════════════════════════════════════════════════════════════════

import type { Material } from './types';

export const MATERIAL_DB: Material[] = [
  { id: 'steel-1018', name: 'Steel 1018', color: '#8B8B8B', density: 7870, youngsModulus: 205, tensileStrength: 440, thermalConductivity: 51.9 },
  { id: 'steel-304ss', name: 'Stainless 304', color: '#A8A8B0', density: 7930, youngsModulus: 193, tensileStrength: 505, thermalConductivity: 16.2 },
  { id: 'steel-4140', name: 'Steel 4140', color: '#7A7A82', density: 7850, youngsModulus: 210, tensileStrength: 655, thermalConductivity: 42.7 },
  { id: 'aluminum-6061', name: 'Aluminum 6061', color: '#C0C0C8', density: 2710, youngsModulus: 68.9, tensileStrength: 310, thermalConductivity: 167 },
  { id: 'aluminum-7075', name: 'Aluminum 7075', color: '#B8B8C0', density: 2810, youngsModulus: 71.7, tensileStrength: 572, thermalConductivity: 130 },
  { id: 'titanium-6al4v', name: 'Titanium 6Al-4V', color: '#9CA0A8', density: 4430, youngsModulus: 114, tensileStrength: 950, thermalConductivity: 6.7 },
  { id: 'copper-c110', name: 'Copper C110', color: '#B87333', density: 8940, youngsModulus: 117, tensileStrength: 220, thermalConductivity: 388 },
  { id: 'brass-360', name: 'Brass 360', color: '#C5A55A', density: 8500, youngsModulus: 97, tensileStrength: 385, thermalConductivity: 115 },
  { id: 'cast-iron', name: 'Cast Iron', color: '#555560', density: 7200, youngsModulus: 170, tensileStrength: 200, thermalConductivity: 52 },
  { id: 'abs-plastic', name: 'ABS Plastic', color: '#E8E0D0', density: 1050, youngsModulus: 2.3, tensileStrength: 40, thermalConductivity: 0.17 },
  { id: 'nylon-66', name: 'Nylon 6/6', color: '#F0E8D8', density: 1140, youngsModulus: 2.8, tensileStrength: 80, thermalConductivity: 0.25 },
  { id: 'polycarbonate', name: 'Polycarbonate', color: '#E0E0E0', density: 1200, youngsModulus: 2.4, tensileStrength: 65, thermalConductivity: 0.20 },
  { id: 'ptfe', name: 'PTFE (Teflon)', color: '#F5F5F0', density: 2150, youngsModulus: 0.5, tensileStrength: 25, thermalConductivity: 0.25 },
  { id: 'oak-wood', name: 'Oak Wood', color: '#8B6914', density: 650, youngsModulus: 12, tensileStrength: 85, thermalConductivity: 0.17 },
  { id: 'carbon-fiber', name: 'Carbon Fiber', color: '#2A2A2A', density: 1600, youngsModulus: 230, tensileStrength: 3500, thermalConductivity: 7 },
  { id: 'rubber-natural', name: 'Natural Rubber', color: '#3A3A2A', density: 920, youngsModulus: 0.01, tensileStrength: 25, thermalConductivity: 0.13 },
];

export interface StdPartDef {
  id: string;
  name: string;
  category: string;
  sizeRange: string;
  params: Record<string, number>;
}

export const STD_PARTS_LIBRARY: { category: string; icon: string; parts: StdPartDef[] }[] = [
  {
    category: 'Fasteners', icon: 'wrench',
    parts: [
      { id: 'hex-bolt', name: 'Hex Bolt', category: 'Fasteners', sizeRange: 'M3-M24', params: { diameter: 6, length: 20, thread_pitch: 1.0 } },
      { id: 'socket-cap', name: 'Socket Cap Screw', category: 'Fasteners', sizeRange: 'M3-M20', params: { diameter: 5, length: 16, head_height: 5 } },
      { id: 'hex-nut', name: 'Hex Nut', category: 'Fasteners', sizeRange: 'M3-M24', params: { diameter: 6, thickness: 5, across_flats: 10 } },
      { id: 'flat-washer', name: 'Flat Washer', category: 'Fasteners', sizeRange: 'M3-M24', params: { inner_dia: 6.4, outer_dia: 12, thickness: 1.6 } },
      { id: 'locknut', name: 'Lock Nut (Nylon)', category: 'Fasteners', sizeRange: 'M3-M20', params: { diameter: 6, thickness: 7.5 } },
      { id: 'set-screw', name: 'Set Screw', category: 'Fasteners', sizeRange: 'M3-M16', params: { diameter: 5, length: 8 } },
      { id: 'shoulder-bolt', name: 'Shoulder Bolt', category: 'Fasteners', sizeRange: 'M5-M16', params: { shoulder_dia: 6, shoulder_length: 12, thread_dia: 5 } },
      { id: 'rivet', name: 'Pop Rivet', category: 'Fasteners', sizeRange: '3.2-6.4mm', params: { diameter: 4.8, grip_length: 12 } },
    ],
  },
  {
    category: 'Bearings', icon: 'settings',
    parts: [
      { id: 'ball-bearing', name: 'Ball Bearing', category: 'Bearings', sizeRange: '608-6210', params: { bore: 8, outer_dia: 22, width: 7 } },
      { id: 'roller-bearing', name: 'Roller Bearing', category: 'Bearings', sizeRange: 'N204-N210', params: { bore: 20, outer_dia: 47, width: 14 } },
      { id: 'thrust-bearing', name: 'Thrust Bearing', category: 'Bearings', sizeRange: '51100-51110', params: { bore: 10, outer_dia: 24, height: 9 } },
      { id: 'linear-bearing', name: 'Linear Bearing', category: 'Bearings', sizeRange: 'LM8-LM25', params: { bore: 8, outer_dia: 15, length: 24 } },
      { id: 'pillow-block', name: 'Pillow Block', category: 'Bearings', sizeRange: 'UCP201-210', params: { bore: 12, bolt_spacing: 95 } },
    ],
  },
  {
    category: 'Gears', icon: 'rotate-cw',
    parts: [
      { id: 'spur-gear', name: 'Spur Gear', category: 'Gears', sizeRange: '12-80 teeth', params: { teeth: 20, module: 2, bore: 10, face_width: 10 } },
      { id: 'bevel-gear', name: 'Bevel Gear', category: 'Gears', sizeRange: '15-60 teeth', params: { teeth: 20, module: 2, shaft_angle: 90, bore: 10 } },
      { id: 'worm-gear', name: 'Worm Gear Set', category: 'Gears', sizeRange: '20-60 teeth', params: { wheel_teeth: 30, worm_starts: 1, module: 2 } },
      { id: 'rack', name: 'Gear Rack', category: 'Gears', sizeRange: 'Mod 1-4', params: { module: 2, length: 100, height: 20 } },
    ],
  },
  {
    category: 'Springs', icon: 'activity',
    parts: [
      { id: 'compression-spring', name: 'Compression Spring', category: 'Springs', sizeRange: '5-50mm OD', params: { wire_dia: 1.0, outer_dia: 10, free_length: 30, coils: 8 } },
      { id: 'tension-spring', name: 'Tension Spring', category: 'Springs', sizeRange: '5-40mm OD', params: { wire_dia: 0.8, outer_dia: 8, body_length: 25, coils: 10 } },
      { id: 'torsion-spring', name: 'Torsion Spring', category: 'Springs', sizeRange: '5-30mm OD', params: { wire_dia: 1.2, outer_dia: 12, coils: 6, leg_length: 15 } },
      { id: 'disc-spring', name: 'Disc Spring (Belleville)', category: 'Springs', sizeRange: '8-100mm OD', params: { outer_dia: 20, inner_dia: 10, thickness: 0.8, height: 1.2 } },
    ],
  },
  {
    category: 'Structural', icon: 'building',
    parts: [
      { id: 'i-beam', name: 'I-Beam (W-Shape)', category: 'Structural', sizeRange: 'W4x13 - W24x84', params: { depth: 100, flange_width: 68, web_thick: 5.8, flange_thick: 8.5, length: 200 } },
      { id: 'c-channel', name: 'C-Channel', category: 'Structural', sizeRange: 'C3x5 - C15x40', params: { depth: 76, flange_width: 36, web_thick: 4.3, flange_thick: 6.9, length: 200 } },
      { id: 'angle', name: 'Angle (L-Section)', category: 'Structural', sizeRange: '20x20 - 200x200', params: { leg_a: 50, leg_b: 50, thickness: 5, length: 200 } },
      { id: 'round-tube', name: 'Round Tube', category: 'Structural', sizeRange: 'OD 10-200mm', params: { outer_dia: 50, wall: 3, length: 200 } },
      { id: 'square-tube', name: 'Square Tube', category: 'Structural', sizeRange: '20x20 - 200x200', params: { side: 40, wall: 3, length: 200 } },
      { id: 'flat-bar', name: 'Flat Bar', category: 'Structural', sizeRange: '10x3 - 200x25', params: { width: 40, thickness: 5, length: 200 } },
      { id: 't-section', name: 'T-Section', category: 'Structural', sizeRange: '20x20 - 100x100', params: { width: 50, depth: 50, flange_thick: 5, web_thick: 5, length: 200 } },
    ],
  },
];

export const GDT_SYMBOLS = [
  { symbol: '\u2316', name: 'Position' },
  { symbol: '\u2295', name: 'Concentricity' },
  { symbol: '\u2298', name: 'Symmetry' },
  { symbol: '\u2225', name: 'Parallelism' },
  { symbol: '\u22A5', name: 'Perpendicularity' },
  { symbol: '\u2220', name: 'Angularity' },
  { symbol: '\u25CE', name: 'Circular Runout' },
  { symbol: '\u2300', name: 'Diameter' },
  { symbol: '\u23E4', name: 'Flatness' },
  { symbol: '\u2313', name: 'Cylindricity' },
  { symbol: '\u25CB', name: 'Circularity' },
  { symbol: '\u2312', name: 'Profile of a Line' },
];
