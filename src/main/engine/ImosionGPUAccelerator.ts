/**
 * ═══════════════════════════════════════════════════════════════════════════
 * IMOSION GPU ACCELERATOR - CPU-based Visual Processing
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { EventEmitter } from 'events';

export interface GPUCapabilities {
  available: boolean;
  adapter?: string;
  maxBufferSize: number;
  maxComputeWorkgroupSize: number;
  supportsFloat32: boolean;
  supportsTimestamps: boolean;
}

export interface WaveformRenderOptions {
  width: number;
  height: number;
  color: string;
  backgroundColor?: string;
  style: 'bars' | 'line' | 'filled';
  showRMS?: boolean;
  rmsColor?: string;
  zoom: number;
  offset: number;
}

export interface SpectrumOptions {
  width: number;
  height: number;
  fftSize: 256 | 512 | 1024 | 2048 | 4096 | 8192;
  smoothing: number;
  minDecibels: number;
  maxDecibels: number;
  style: 'bars' | 'line' | 'gradient';
  colorMap: 'default' | 'rainbow' | 'heatmap' | 'grayscale';
}

export interface MeterData {
  peak: number;
  rms: number;
  lufs: number;
  peakHold: number;
}

export class ImosionGPUAccelerator extends EventEmitter {
  private capabilities: GPUCapabilities = {
    available: false,
    maxBufferSize: 0,
    maxComputeWorkgroupSize: 0,
    supportsFloat32: true,
    supportsTimestamps: false
  };
  
  private isInitialized = false;
  
  constructor() {
    super();
  }
  
  async initialize(): Promise<boolean> {
    this.capabilities = {
      available: false,
      adapter: 'CPU Fallback',
      maxBufferSize: 256 * 1024 * 1024,
      maxComputeWorkgroupSize: 256,
      supportsFloat32: true,
      supportsTimestamps: false
    };
    this.isInitialized = true;
    this.emit('initialized', this.capabilities);
    return true;
  }
  
  getCapabilities(): GPUCapabilities {
    return { ...this.capabilities };
  }
  
  isAvailable(): boolean {
    return this.isInitialized;
  }
  
  async computeWaveformPeaks(
    samples: Float32Array,
    width: number
  ): Promise<{ min: Float32Array; max: Float32Array; rms: Float32Array }> {
    const samplesPerPixel = Math.ceil(samples.length / width);
    const min = new Float32Array(width);
    const max = new Float32Array(width);
    const rms = new Float32Array(width);
    
    for (let i = 0; i < width; i++) {
      const start = i * samplesPerPixel;
      const end = Math.min(start + samplesPerPixel, samples.length);
      let minVal = 0, maxVal = 0, sumSquares = 0;
      
      for (let j = start; j < end; j++) {
        const sample = samples[j];
        minVal = Math.min(minVal, sample);
        maxVal = Math.max(maxVal, sample);
        sumSquares += sample * sample;
      }
      
      min[i] = minVal;
      max[i] = maxVal;
      rms[i] = Math.sqrt(sumSquares / (end - start || 1));
    }
    
    return { min, max, rms };
  }
  
  async computeSpectrum(samples: Float32Array, fftSize: number): Promise<Float32Array> {
    const spectrum = new Float32Array(fftSize / 2);
    const windowed = new Float32Array(fftSize);
    
    for (let i = 0; i < fftSize; i++) {
      const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
      windowed[i] = (samples[i] || 0) * window;
    }
    
    const binSize = fftSize / spectrum.length;
    for (let i = 0; i < spectrum.length; i++) {
      let sum = 0;
      for (let j = 0; j < binSize; j++) {
        const idx = Math.floor(i * binSize + j);
        if (idx < windowed.length) sum += Math.abs(windowed[idx]);
      }
      spectrum[i] = sum / binSize;
    }
    
    return spectrum;
  }
  
  async computeMeters(samples: Float32Array, channelCount: number): Promise<MeterData[]> {
    const meters: MeterData[] = [];
    const sampleCount = Math.floor(samples.length / channelCount);
    
    for (let ch = 0; ch < channelCount; ch++) {
      let peak = 0, sumSquares = 0;
      
      for (let i = 0; i < sampleCount; i++) {
        const sample = Math.abs(samples[i * channelCount + ch] || 0);
        peak = Math.max(peak, sample);
        sumSquares += sample * sample;
      }
      
      const rms = Math.sqrt(sumSquares / (sampleCount || 1));
      meters.push({
        peak,
        rms,
        lufs: 20 * Math.log10(rms + 0.0000001) - 0.691,
        peakHold: peak
      });
    }
    
    return meters;
  }
  
  dispose(): void {
    this.isInitialized = false;
    this.removeAllListeners();
  }
}

let gpuAcceleratorInstance: ImosionGPUAccelerator | null = null;

export function getGPUAccelerator(): ImosionGPUAccelerator {
  if (!gpuAcceleratorInstance) {
    gpuAcceleratorInstance = new ImosionGPUAccelerator();
  }
  return gpuAcceleratorInstance;
}

export default ImosionGPUAccelerator;
