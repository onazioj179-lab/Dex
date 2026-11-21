// DEX Platform - Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { hexToRgb, rgbToHex, hslToRgb, type HSL, type RGB } from './colorUtils';

export function parseHexList(text: string): string[] {
  const colors = text.trim().split(/[\s,;]+/).map(token => hexToRgb(token))
    .filter((rgb): rgb is RGB => rgb !== null).map(rgbToHex);
  return [...new Set(colors)].slice(0, 24);
}

export function mixSwatches(first: string, second: string, weight: number): string {
  const a = hexToRgb(first)!, b = hexToRgb(second)!;
  const mix = (x: number, y: number) => x + (y - x) * weight;
  return rgbToHex({ r: mix(a.r, b.r), g: mix(a.g, b.g), b: mix(a.b, b.b) });
}

export const harmonyOffsets = {
  Complementary: [0, 180],
  Triadic: [0, 120, 240],
  Analogous: [-30, 0, 30],
} as const;

export function harmonize(hex: string, hsl: HSL, mode: keyof typeof harmonyOffsets): string[] {
  return harmonyOffsets[mode].map(offset => offset === 0 ? hex : rgbToHex(hslToRgb({ ...hsl, h: hsl.h + offset })));
}

export function shadeRamp(hex: string): string[] {
  return [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6].map(step => mixSwatches(hex, step < 0 ? '#000000' : '#ffffff', Math.abs(step)));
}

// Machado, Oliveira and Fernandes (2009), severity 1.0, applied in linear light.
// https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
const vision = {
  Protanopia: [[0.152286,1.052583,-0.204868],[0.114503,0.786281,0.099216],[-0.003882,-0.048116,1.051998]],
  Deuteranopia: [[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.01182,0.04294,0.968881]],
  Tritanopia: [[1.255528,-0.076749,-0.178779],[-0.078411,0.930809,0.147602],[0.004733,0.691367,0.3039]],
} as const;
export const visionModes = Object.keys(vision) as (keyof typeof vision)[];

export function simulateVision(hex: string, mode: keyof typeof vision): string {
  const { r, g, b } = hexToRgb(hex)!;
  const linear = [r, g, b].map(channel => {
    const x = channel / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  const encoded = vision[mode].map(row => {
    const x = Math.max(0, Math.min(1, row.reduce((sum: number, factor, index) => sum + factor * linear[index], 0)));
    return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  });
  return rgbToHex({ r: encoded[0], g: encoded[1], b: encoded[2] });
}

const names = {
  Black: '#000000', White: '#ffffff', Gray: '#808080', Silver: '#c0c0c0', Red: '#ff0000', Maroon: '#800000',
  Orange: '#ffa500', Coral: '#ff7f50', Tomato: '#ff6347', Salmon: '#fa8072', Yellow: '#ffff00', Gold: '#ffd700',
  Olive: '#808000', Khaki: '#f0e68c', Lime: '#00ff00', Green: '#008000', 'Forest Green': '#228b22',
  'Sea Green': '#2e8b57', Turquoise: '#40e0d0', Teal: '#008080', Cyan: '#00ffff', Azure: '#f0ffff',
  'Sky Blue': '#87ceeb', 'Dodger Blue': '#1e90ff', Blue: '#0000ff', Navy: '#000080', Indigo: '#4b0082',
  Purple: '#800080', 'Rebecca Purple': '#663399', Violet: '#ee82ee', Lavender: '#e6e6fa', Magenta: '#ff00ff',
  Pink: '#ffc0cb', 'Deep Pink': '#ff1493', Brown: '#a52a2a', Chocolate: '#d2691e', Tan: '#d2b48c', Beige: '#f5f5dc',
};

export function nearestColorName(hex: string): string {
  const source = hexToRgb(hex)!;
  let nearest = '', best = Infinity;
  for (const [name, candidate] of Object.entries(names)) {
    const rgb = hexToRgb(candidate)!;
    const distance = 2 * (rgb.r - source.r) ** 2 + 4 * (rgb.g - source.g) ** 2 + 3 * (rgb.b - source.b) ** 2;
    if (distance < best) { nearest = name; best = distance; }
  }
  return nearest;
}

export function dominantSwatches(pixels: Uint8ClampedArray): string[] {
  const bins = new Map<number, { r: number; g: number; b: number; count: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5);
    const bin = bins.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    bin.r += r; bin.g += g; bin.b += b; bin.count++;
    bins.set(key, bin);
  }
  return [...bins.values()].sort((a, b) => b.count - a.count).slice(0, 8)
    .map(({ r, g, b, count }) => rgbToHex({ r: r / count, g: g / count, b: b / count }));
}

export type PaletteFormat = 'json' | 'css' | 'svg';
export function paletteDocument(name: string, colors: string[], format: PaletteFormat): string {
  if (format === 'json') return JSON.stringify({ name, colors }, null, 2) + '\n';
  if (format === 'css') return ':root {\n' + colors.map((hex, index) => '  --swatch-' + (index + 1) + ': ' + hex + ';').join('\n') + '\n}\n';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (colors.length * 64) + '" height="64">\n'
    + colors.map((hex, index) => '  <rect x="' + (index * 64) + '" width="64" height="64" fill="' + hex + '"/>').join('\n') + '\n</svg>\n';
}
