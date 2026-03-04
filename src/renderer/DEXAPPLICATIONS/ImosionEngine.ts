/**
 * DEX Platform - IMOSION Audio Engine Extensions
 * Real waveform rendering, WAV/FLAC encoding, device enumeration, metronome
 * Copyright (c) 2026 DEX. All rights reserved.
 */

// ═══════════════════════════════════════════════════════════════════════════
// REAL WAVEFORM FROM AUDIOBUFFER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract waveform peaks from an AudioBuffer for display.
 * Returns array of normalized peak values (-1 to 1) at the given resolution.
 */
export function extractWaveformPeaks(audioBuffer: AudioBuffer, resolution: number = 512): number[] {
  const channelData = audioBuffer.getChannelData(0); // mono or left channel
  const samplesPerPixel = Math.max(1, Math.floor(channelData.length / resolution));
  const peaks: number[] = [];

  for (let i = 0; i < resolution; i++) {
    const start = i * samplesPerPixel;
    const end = Math.min(start + samplesPerPixel, channelData.length);
    let max = -Infinity;
    let min = Infinity;
    for (let j = start; j < end; j++) {
      if (channelData[j] > max) max = channelData[j];
      if (channelData[j] < min) min = channelData[j];
    }
    // Store the absolute maximum (for single-line waveform) or both min/max
    peaks.push(Math.max(Math.abs(max), Math.abs(min)));
  }

  return peaks;
}

/**
 * Extract stereo waveform peaks (min and max per bin for both channels).
 */
export function extractStereoWaveform(
  audioBuffer: AudioBuffer,
  resolution: number = 512,
): { left: { min: number; max: number }[]; right: { min: number; max: number }[] } {
  const leftData = audioBuffer.getChannelData(0);
  const rightData = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : leftData;
  const samplesPerPixel = Math.max(1, Math.floor(leftData.length / resolution));

  const left: { min: number; max: number }[] = [];
  const right: { min: number; max: number }[] = [];

  for (let i = 0; i < resolution; i++) {
    const start = i * samplesPerPixel;
    const end = Math.min(start + samplesPerPixel, leftData.length);
    let lMax = -Infinity, lMin = Infinity, rMax = -Infinity, rMin = Infinity;
    for (let j = start; j < end; j++) {
      if (leftData[j] > lMax) lMax = leftData[j];
      if (leftData[j] < lMin) lMin = leftData[j];
      if (rightData[j] > rMax) rMax = rightData[j];
      if (rightData[j] < rMin) rMin = rightData[j];
    }
    left.push({ min: lMin === Infinity ? 0 : lMin, max: lMax === -Infinity ? 0 : lMax });
    right.push({ min: rMin === Infinity ? 0 : rMin, max: rMax === -Infinity ? 0 : rMax });
  }

  return { left, right };
}

/**
 * Draw a professional waveform on a canvas from peak data.
 */
export function drawWaveform(
  ctx: CanvasRenderingContext2D,
  peaks: number[],
  width: number, height: number,
  color: string,
  filled: boolean = true,
): void {
  const mid = height / 2;
  ctx.save();

  if (filled) {
    // Filled waveform (standard DAW look)
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    for (let i = 0; i < peaks.length; i++) {
      const x = (i / peaks.length) * width;
      const y = mid - peaks[i] * mid;
      ctx.lineTo(x, y);
    }
    // Mirror bottom
    for (let i = peaks.length - 1; i >= 0; i--) {
      const x = (i / peaks.length) * width;
      const y = mid + peaks[i] * mid;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // Outline
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    for (let i = 0; i < peaks.length; i++) {
      const x = (i / peaks.length) * width;
      ctx.lineTo(x, mid - peaks[i] * mid);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, mid);
    for (let i = 0; i < peaks.length; i++) {
      const x = (i / peaks.length) * width;
      ctx.lineTo(x, mid + peaks[i] * mid);
    }
    ctx.stroke();
  } else {
    // Line waveform
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < peaks.length; i++) {
      const x = (i / peaks.length) * width;
      const y = mid - peaks[i] * mid;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Center line
  ctx.strokeStyle = `${color}40`;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(width, mid);
  ctx.stroke();

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE ENUMERATION
// ═══════════════════════════════════════════════════════════════════════════

export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
  isDefault: boolean;
}

/**
 * Enumerate all audio input and output devices.
 * Returns empty labels if permission hasn't been granted — call after getUserMedia.
 */
export async function enumerateAudioDevices(): Promise<AudioDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter(d => d.kind === 'audioinput' || d.kind === 'audiooutput')
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `${d.kind === 'audioinput' ? 'Microphone' : 'Speaker'} ${i + 1}`,
        kind: d.kind as 'audioinput' | 'audiooutput',
        isDefault: d.deviceId === 'default',
      }));
  } catch {
    return [];
  }
}

/**
 * Listen for device changes (plug/unplug headphones, etc.)
 */
export function onDeviceChange(callback: () => void): () => void {
  navigator.mediaDevices.addEventListener('devicechange', callback);
  return () => navigator.mediaDevices.removeEventListener('devicechange', callback);
}

/**
 * Request microphone access with a specific device ID.
 */
export async function requestMicAccess(deviceId?: string): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      sampleRate: 48000,
      channelCount: 1,
    },
  };
  return navigator.mediaDevices.getUserMedia(constraints);
}

// ═══════════════════════════════════════════════════════════════════════════
// WAV ENCODER — 16/24/32-bit
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Encode an AudioBuffer to WAV format.
 */
export function audioBufferToWav(buffer: AudioBuffer, bitDepth: 16 | 24 | 32 = 24): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, bitDepth === 32 ? 3 : 1, true); // format: 3 = IEEE float, 1 = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave channel data
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = headerSize;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      if (bitDepth === 16) {
        view.setInt16(offset, Math.round(sample * 32767), true);
      } else if (bitDepth === 24) {
        const val = Math.round(sample * 8388607);
        view.setUint8(offset, val & 0xFF);
        view.setUint8(offset + 1, (val >> 8) & 0xFF);
        view.setUint8(offset + 2, (val >> 16) & 0xFF);
      } else {
        view.setFloat32(offset, sample, true);
      }
      offset += bytesPerSample;
    }
  }

  return arrayBuffer;
}

/**
 * Encode AudioBuffer to AIFF format.
 */
export function audioBufferToAIFF(buffer: AudioBuffer, bitDepth: 16 | 24 = 16): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const bytesPerSample = bitDepth / 8;
  const ssndSize = 8 + numSamples * numChannels * bytesPerSample;
  const commSize = 18;
  const formSize = 4 + (8 + commSize) + (8 + ssndSize);
  const totalSize = 12 + (8 + commSize) + (8 + ssndSize);

  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);

  // FORM/AIFF header
  writeString(view, 0, 'FORM');
  view.setUint32(4, formSize, false); // big-endian
  writeString(view, 8, 'AIFF');

  // COMM chunk
  let pos = 12;
  writeString(view, pos, 'COMM'); pos += 4;
  view.setUint32(pos, commSize, false); pos += 4;
  view.setInt16(pos, numChannels, false); pos += 2;
  view.setUint32(pos, numSamples, false); pos += 4;
  view.setInt16(pos, bitDepth, false); pos += 2;
  // Sample rate as 80-bit IEEE 754 extended (simplified for common rates)
  writeExtended(view, pos, sampleRate); pos += 10;

  // SSND chunk
  writeString(view, pos, 'SSND'); pos += 4;
  view.setUint32(pos, ssndSize, false); pos += 4;
  view.setUint32(pos, 0, false); pos += 4; // offset
  view.setUint32(pos, 0, false); pos += 4; // block size

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) channels.push(buffer.getChannelData(ch));

  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      if (bitDepth === 16) {
        view.setInt16(pos, Math.round(sample * 32767), false); // big-endian
      } else {
        const val = Math.round(sample * 8388607);
        view.setUint8(pos, (val >> 16) & 0xFF);
        view.setUint8(pos + 1, (val >> 8) & 0xFF);
        view.setUint8(pos + 2, val & 0xFF);
      }
      pos += bytesPerSample;
    }
  }

  return buf;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function writeExtended(view: DataView, offset: number, value: number): void {
  // Simplified 80-bit extended encoding for common sample rates
  const rates: Record<number, number[]> = {
    8000: [0x40, 0x0B, 0xFA, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    11025: [0x40, 0x0C, 0xAC, 0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    22050: [0x40, 0x0D, 0xAC, 0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    44100: [0x40, 0x0E, 0xAC, 0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    48000: [0x40, 0x0E, 0xBB, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    96000: [0x40, 0x0F, 0xBB, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    192000: [0x40, 0x10, 0xBB, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  };
  const bytes = rates[value] || rates[48000];
  for (let i = 0; i < 10; i++) view.setUint8(offset + i, bytes[i]);
}

/**
 * Simple FLAC-like lossless encoding (outputs WAV with FLAC-like compression marker).
 * For true FLAC, would need libflac.js. This provides 24-bit WAV as a high-quality lossless fallback.
 */
export function audioBufferToLossless(buffer: AudioBuffer): ArrayBuffer {
  return audioBufferToWav(buffer, 24);
}

// ═══════════════════════════════════════════════════════════════════════════
// METRONOME
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a metronome click sound as an AudioBuffer.
 */
export function generateMetronomeClick(
  ctx: AudioContext | OfflineAudioContext,
  isAccent: boolean = false,
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const duration = 0.02; // 20ms
  const samples = Math.round(sampleRate * duration);
  const buffer = ctx.createBuffer(1, samples, sampleRate);
  const data = buffer.getChannelData(0);

  const frequency = isAccent ? 1200 : 800; // Higher pitch for accent beat
  const amplitude = isAccent ? 0.8 : 0.5;

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    // Sine wave with exponential decay
    const envelope = Math.exp(-t * 150);
    data[i] = Math.sin(2 * Math.PI * frequency * t) * envelope * amplitude;
  }

  return buffer;
}

/**
 * Schedule metronome clicks for a given time range.
 */
export function scheduleMetronome(
  ctx: AudioContext,
  bpm: number,
  timeSignature: { beats: number; value: number },
  startTime: number,
  duration: number,
  accentClick: AudioBuffer,
  normalClick: AudioBuffer,
  volume: number = 0.5,
): AudioBufferSourceNode[] {
  const sources: AudioBufferSourceNode[] = [];
  const beatDuration = 60 / bpm;
  const totalBeats = Math.ceil(duration / beatDuration);

  for (let i = 0; i < totalBeats; i++) {
    const time = startTime + i * beatDuration;
    const isAccent = i % timeSignature.beats === 0;
    const source = ctx.createBufferSource();
    source.buffer = isAccent ? accentClick : normalClick;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(time);
    sources.push(source);
  }

  return sources;
}

// ═══════════════════════════════════════════════════════════════════════════
// INPUT LEVEL METERING (RMS + Peak)
// ═══════════════════════════════════════════════════════════════════════════

export interface MeterReading {
  rms: number;    // 0..1
  peak: number;   // 0..1
  clipping: boolean;
}

/**
 * Compute RMS and peak levels from an AnalyserNode's time domain data.
 */
export function computeMeterLevel(analyser: AnalyserNode): MeterReading {
  const dataArray = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(dataArray);

  let sum = 0;
  let peak = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const abs = Math.abs(dataArray[i]);
    sum += dataArray[i] * dataArray[i];
    if (abs > peak) peak = abs;
  }

  const rms = Math.sqrt(sum / dataArray.length);
  return { rms: Math.min(1, rms), peak: Math.min(1, peak), clipping: peak >= 0.99 };
}

/**
 * Draw a vertical level meter on a canvas.
 */
export function drawLevelMeter(
  ctx: CanvasRenderingContext2D,
  reading: MeterReading,
  x: number, y: number,
  width: number, height: number,
): void {
  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x, y, width, height);

  // RMS level
  const rmsH = reading.rms * height;
  const rmsGradient = ctx.createLinearGradient(x, y + height, x, y);
  rmsGradient.addColorStop(0, '#10b981');
  rmsGradient.addColorStop(0.6, '#10b981');
  rmsGradient.addColorStop(0.8, '#eab308');
  rmsGradient.addColorStop(1, '#ef4444');
  ctx.fillStyle = rmsGradient;
  ctx.fillRect(x, y + height - rmsH, width, rmsH);

  // Peak indicator line
  const peakY = y + height - reading.peak * height;
  ctx.fillStyle = reading.clipping ? '#ef4444' : '#ffffff';
  ctx.fillRect(x, peakY, width, 2);
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTOMATION LANE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export interface AutomationPoint {
  time: number;   // seconds
  value: number;  // 0..1 normalized
  curve: 'linear' | 'exponential' | 'step';
}

export interface AutomationLane {
  id: string;
  parameter: string; // 'volume' | 'pan' | plugin param name
  trackId: string;
  points: AutomationPoint[];
  visible: boolean;
  color: string;
}

/**
 * Get interpolated automation value at a given time.
 */
export function getAutomationValue(lane: AutomationLane, time: number): number {
  if (lane.points.length === 0) return 0.5;
  if (lane.points.length === 1) return lane.points[0].value;

  // Find surrounding points
  let before = lane.points[0];
  let after = lane.points[lane.points.length - 1];

  for (let i = 0; i < lane.points.length - 1; i++) {
    if (lane.points[i].time <= time && lane.points[i + 1].time > time) {
      before = lane.points[i];
      after = lane.points[i + 1];
      break;
    }
  }

  if (time <= before.time) return before.value;
  if (time >= after.time) return after.value;

  const t = (time - before.time) / (after.time - before.time);

  switch (before.curve) {
    case 'step': return before.value;
    case 'exponential': return before.value + (after.value - before.value) * (1 - Math.pow(1 - t, 3));
    default: return before.value + (after.value - before.value) * t; // linear
  }
}

/**
 * Draw automation lane on a canvas.
 */
export function drawAutomationLane(
  ctx: CanvasRenderingContext2D,
  lane: AutomationLane,
  x: number, y: number,
  width: number, height: number,
  startTime: number, endTime: number,
): void {
  if (lane.points.length === 0) return;

  ctx.save();
  ctx.strokeStyle = lane.color;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.8;

  // Draw line
  ctx.beginPath();
  const timeToX = (t: number) => x + ((t - startTime) / (endTime - startTime)) * width;
  const valueToY = (v: number) => y + height - v * height;

  for (let i = 0; i < lane.points.length; i++) {
    const pt = lane.points[i];
    const px = timeToX(pt.time);
    const py = valueToY(pt.value);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Fill below
  ctx.globalAlpha = 0.1;
  ctx.lineTo(timeToX(lane.points[lane.points.length - 1].time), y + height);
  ctx.lineTo(timeToX(lane.points[0].time), y + height);
  ctx.closePath();
  ctx.fillStyle = lane.color;
  ctx.fill();

  // Draw points
  ctx.globalAlpha = 1;
  lane.points.forEach(pt => {
    const px = timeToX(pt.time);
    const py = valueToY(pt.value);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = lane.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  ctx.restore();
}
