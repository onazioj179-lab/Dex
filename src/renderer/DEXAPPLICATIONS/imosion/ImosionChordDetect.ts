// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// Imosion chord detection (FFT chroma + template matching)
// ===========================================================================

export type ChordQuality =
  | 'maj'
  | 'min'
  | 'dim'
  | 'aug'
  | 'maj7'
  | 'min7'
  | '7'
  | 'm7b5'
  | 'dim7'
  | 'sus2'
  | 'sus4'
  | 'add9';

export interface DetectedChord {
  root: string;
  quality: ChordQuality;
  name: string;
  confidence: number;
  chroma: number[];
}

export interface ChordSegment extends DetectedChord {
  startSample: number;
  endSample: number;
  startSec: number;
  endSec: number;
}

export interface ChordDetectorOptions {
  sampleRate?: number;
  frameSize?: number;
  hopSize?: number;
  minConfidence?: number;
  minSegmentSec?: number;
  a4Hz?: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

const TEMPLATES: Record<ChordQuality, number[]> = {
  maj: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
  min: [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
  dim: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],
  aug: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  maj7: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1],
  min7: [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0],
  '7': [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  m7b5: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0],
  dim7: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0],
  sus2: [1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0],
  sus4: [1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0],
  add9: [1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0],
};

const TEMPLATE_NORMS: Record<ChordQuality, number> = (() => {
  const result = {} as Record<ChordQuality, number>;
  (Object.keys(TEMPLATES) as ChordQuality[]).forEach((quality) => {
    result[quality] = Math.sqrt(TEMPLATES[quality].reduce((sum, value) => sum + value * value, 0));
  });
  return result;
})();

function fftRadix2(real: Float64Array, imag: Float64Array): void {
  const length = real.length;
  if ((length & (length - 1)) !== 0) {
    throw new Error('FFT input length must be a power of 2');
  }

  let j = 0;
  for (let i = 0; i < length - 1; i++) {
    if (i < j) {
      const tempReal = real[i];
      const tempImag = imag[i];
      real[i] = real[j];
      imag[i] = imag[j];
      real[j] = tempReal;
      imag[j] = tempImag;
    }

    let bit = length >> 1;
    while (bit > 0 && j >= bit) {
      j -= bit;
      bit >>= 1;
    }
    j += bit;
  }

  for (let size = 2; size <= length; size <<= 1) {
    const half = size >> 1;
    const angleStep = (-2 * Math.PI) / size;

    for (let start = 0; start < length; start += size) {
      for (let k = 0; k < half; k++) {
        const angle = k * angleStep;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);

        const even = start + k;
        const odd = even + half;

        const oddReal = wr * real[odd] - wi * imag[odd];
        const oddImag = wr * imag[odd] + wi * real[odd];

        real[odd] = real[even] - oddReal;
        imag[odd] = imag[even] - oddImag;
        real[even] += oddReal;
        imag[even] += oddImag;
      }
    }
  }
}

function applyHannWindow(buffer: Float64Array): void {
  const length = buffer.length;
  const denominator = length - 1;
  for (let i = 0; i < length; i++) {
    const windowValue = 0.5 * (1 - Math.cos((2 * Math.PI * i) / denominator));
    buffer[i] *= windowValue;
  }
}

export function computeChromaFrame(
  frame: Float32Array | Float64Array,
  sampleRate: number,
  a4Hz = 440,
): number[] {
  const length = frame.length;
  if ((length & (length - 1)) !== 0) {
    throw new Error('Frame length must be a power of 2');
  }

  const real = new Float64Array(length);
  const imag = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    real[i] = frame[i];
  }

  applyHannWindow(real);
  fftRadix2(real, imag);

  const chroma = new Array<number>(12).fill(0);
  const binHz = sampleRate / length;
  const minHz = 55;
  const maxHz = 5000;
  const startBin = Math.max(1, Math.floor(minHz / binHz));
  const endBin = Math.min(Math.floor(length / 2), Math.ceil(maxHz / binHz));

  for (let bin = startBin; bin < endBin; bin++) {
    const frequency = bin * binHz;
    if (frequency <= 0) {
      continue;
    }

    const midi = 69 + 12 * Math.log2(frequency / a4Hz);
    const pitchClass = ((Math.round(midi) % 12) + 12) % 12;
    const magnitude = Math.sqrt(real[bin] * real[bin] + imag[bin] * imag[bin]);
    chroma[pitchClass] += magnitude;
  }

  let sumSquares = 0;
  for (let i = 0; i < 12; i++) {
    sumSquares += chroma[i] * chroma[i];
  }

  const norm = Math.sqrt(sumSquares);
  if (norm > 0) {
    for (let i = 0; i < 12; i++) {
      chroma[i] /= norm;
    }
  }

  return chroma;
}

function formatChordName(root: string, quality: ChordQuality): string {
  if (quality === 'maj') {
    return root;
  }
  if (quality === 'min') {
    return `${root}m`;
  }
  return `${root}${quality}`;
}

export function matchChord(chroma: number[]): DetectedChord {
  if (chroma.length !== 12) {
    throw new Error('Chroma vector must have 12 bins');
  }

  const chromaNorm = Math.sqrt(chroma.reduce((sum, value) => sum + value * value, 0));
  if (chromaNorm === 0) {
    return {
      root: 'N',
      quality: 'maj',
      name: 'N.C.',
      confidence: 0,
      chroma,
    };
  }

  let bestScore = Number.NEGATIVE_INFINITY;
  let bestRootIndex = 0;
  let bestQuality: ChordQuality = 'maj';

  // Tiny tie-breaker: when scores are within ~1% of each other prefer the
  // simpler triad/sus over a 7th-extension which is a strict superset.
  const QUALITY_BIAS: Partial<Record<ChordQuality, number>> = {
    maj: 0.012,
    min: 0.012,
    sus2: 0.005,
    sus4: 0.005,
  };

  (Object.keys(TEMPLATES) as ChordQuality[]).forEach((quality) => {
    const template = TEMPLATES[quality];
    const templateNorm = TEMPLATE_NORMS[quality];

    for (let root = 0; root < 12; root++) {
      let dot = 0;
      for (let i = 0; i < 12; i++) {
        const chromaIndex = (i + root) % 12;
        dot += chroma[chromaIndex] * template[i];
      }
      const score = dot / (chromaNorm * templateNorm) + (QUALITY_BIAS[quality] ?? 0);
      if (score > bestScore) {
        bestScore = score;
        bestRootIndex = root;
        bestQuality = quality;
      }
    }
  });

  const root = NOTE_NAMES[bestRootIndex];
  return {
    root,
    quality: bestQuality,
    name: formatChordName(root, bestQuality),
    confidence: Math.max(0, Math.min(1, bestScore)),
    chroma,
  };
}

function mergeShortSegments(segments: ChordSegment[], minSegmentSec: number): ChordSegment[] {
  if (segments.length < 2) {
    return segments;
  }

  const merged: ChordSegment[] = [];

  for (const segment of segments) {
    const duration = segment.endSec - segment.startSec;
    if (duration < minSegmentSec && merged.length > 0) {
      const previous = merged[merged.length - 1];
      previous.endSample = segment.endSample;
      previous.endSec = segment.endSec;
      previous.confidence = (previous.confidence + segment.confidence) / 2;
      continue;
    }

    merged.push({ ...segment });
  }

  return merged;
}

export function detectChords(
  audio: Float32Array | Float64Array,
  options: ChordDetectorOptions = {},
): ChordSegment[] {
  const sampleRate = options.sampleRate ?? 44100;
  const frameSize = options.frameSize ?? 4096;
  const hopSize = options.hopSize ?? Math.floor(frameSize / 2);
  const minConfidence = options.minConfidence ?? 0.55;
  const minSegmentSec = options.minSegmentSec ?? 0.25;
  const a4Hz = options.a4Hz ?? 440;

  if ((frameSize & (frameSize - 1)) !== 0) {
    throw new Error('frameSize must be a power of 2');
  }
  if (hopSize <= 0) {
    throw new Error('hopSize must be greater than 0');
  }
  if (audio.length < frameSize) {
    return [];
  }

  const frame = new Float64Array(frameSize);
  const segments: ChordSegment[] = [];
  let activeSegment: ChordSegment | null = null;

  for (let position = 0; position + frameSize <= audio.length; position += hopSize) {
    for (let i = 0; i < frameSize; i++) {
      frame[i] = audio[position + i];
    }

    const chroma = computeChromaFrame(frame, sampleRate, a4Hz);
    const chord = matchChord(chroma);

    if (chord.confidence < minConfidence) {
      if (activeSegment) {
        segments.push(activeSegment);
        activeSegment = null;
      }
      continue;
    }

    if (
      activeSegment &&
      activeSegment.root === chord.root &&
      activeSegment.quality === chord.quality
    ) {
      activeSegment.endSample = position + frameSize;
      activeSegment.endSec = activeSegment.endSample / sampleRate;
      activeSegment.confidence = (activeSegment.confidence + chord.confidence) / 2;
      continue;
    }

    if (activeSegment) {
      segments.push(activeSegment);
    }

    activeSegment = {
      ...chord,
      startSample: position,
      endSample: position + frameSize,
      startSec: position / sampleRate,
      endSec: (position + frameSize) / sampleRate,
    };
  }

  if (activeSegment) {
    segments.push(activeSegment);
  }

  return mergeShortSegments(segments, minSegmentSec);
}

export function detectChordsFromAudioBuffer(
  buffer: AudioBuffer,
  options: Omit<ChordDetectorOptions, 'sampleRate'> = {},
): ChordSegment[] {
  const channels = buffer.numberOfChannels;
  const mono = new Float32Array(buffer.length);

  for (let channel = 0; channel < channels; channel++) {
    const source = buffer.getChannelData(channel);
    for (let i = 0; i < source.length; i++) {
      mono[i] += source[i];
    }
  }

  if (channels > 1) {
    for (let i = 0; i < mono.length; i++) {
      mono[i] /= channels;
    }
  }

  return detectChords(mono, {
    ...options,
    sampleRate: buffer.sampleRate,
  });
}
