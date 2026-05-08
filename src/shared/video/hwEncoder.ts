// =============================================================================
// DEX Platform — Wave 6.1 Forge: hardware encoder probe
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * HardwareEncoder — picks the best video encoder for the host.
 *
 * Detection is based on platform + GPU vendor (passed in by the caller).
 * Encoders, in order of preference per vendor:
 *   NVIDIA  -> NVENC (h264_nvenc / hevc_nvenc / av1_nvenc)
 *   AMD     -> AMF   (h264_amf  / hevc_amf  / av1_amf)
 *   Intel   -> QuickSync (h264_qsv / hevc_qsv / av1_qsv)
 *   Apple   -> VideoToolbox (h264_videotoolbox / hevc_videotoolbox)
 *   Linux   -> VAAPI (h264_vaapi / hevc_vaapi / av1_vaapi)
 *   Fallback-> libx264 / libx265 (CPU)
 */

export type Codec = 'h264' | 'hevc' | 'av1';
export type EncoderName =
  | 'h264_nvenc' | 'hevc_nvenc' | 'av1_nvenc'
  | 'h264_amf'   | 'hevc_amf'   | 'av1_amf'
  | 'h264_qsv'   | 'hevc_qsv'   | 'av1_qsv'
  | 'h264_videotoolbox' | 'hevc_videotoolbox'
  | 'h264_vaapi' | 'hevc_vaapi' | 'av1_vaapi'
  | 'libx264'    | 'libx265'    | 'libsvtav1';

export type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'apple' | 'unknown';

export interface EncoderProbe {
  platform: NodeJS.Platform;
  gpu: GpuVendor;
  /** Bypass HW; force CPU. */
  forceCpu?: boolean;
}

export interface EncoderChoice {
  /** FFmpeg encoder name. */
  encoder: EncoderName;
  /** Whether this is hardware-accelerated. */
  hardware: boolean;
  /** Recommended preset name. */
  preset: string;
  /** Ranked list of fallbacks. */
  fallbacks: EncoderName[];
}

export function pickEncoder(codec: Codec, probe: EncoderProbe): EncoderChoice {
  if (probe.forceCpu) {
    return { encoder: cpuEncoder(codec), hardware: false, preset: 'medium',
             fallbacks: [cpuEncoder(codec)] };
  }
  const order = vendorOrder(codec, probe.gpu, probe.platform);
  const cpu = cpuEncoder(codec);
  if (order.length === 0) {
    return { encoder: cpu, hardware: false, preset: 'medium', fallbacks: [cpu] };
  }
  const first = order[0]!;
  const fallbacks = [...order.slice(1), cpu];
  const preset = first.endsWith('_videotoolbox') ? 'speed'
    : first.endsWith('_vaapi') ? 'medium'
    : first.endsWith('_qsv') ? 'medium'
    : first.includes('nvenc') ? 'p4'
    : first.includes('_amf') ? 'balanced'
    : 'medium';
  return { encoder: first, hardware: true, preset, fallbacks };
}

function vendorOrder(codec: Codec, gpu: GpuVendor, platform: NodeJS.Platform): EncoderName[] {
  const out: EncoderName[] = [];
  if (gpu === 'nvidia') out.push(byCodec(codec, 'h264_nvenc', 'hevc_nvenc', 'av1_nvenc'));
  if (gpu === 'amd') out.push(byCodec(codec, 'h264_amf', 'hevc_amf', 'av1_amf'));
  if (gpu === 'intel') out.push(byCodec(codec, 'h264_qsv', 'hevc_qsv', 'av1_qsv'));
  if (gpu === 'apple' || platform === 'darwin') {
    if (codec !== 'av1') out.push(byCodec(codec, 'h264_videotoolbox', 'hevc_videotoolbox', 'h264_videotoolbox'));
  }
  if (platform === 'linux' && (gpu === 'intel' || gpu === 'amd' || gpu === 'nvidia')) {
    out.push(byCodec(codec, 'h264_vaapi', 'hevc_vaapi', 'av1_vaapi'));
  }
  return out;
}

function byCodec<T>(codec: Codec, h264: T, hevc: T, av1: T): T {
  return codec === 'h264' ? h264 : codec === 'hevc' ? hevc : av1;
}

function cpuEncoder(codec: Codec): EncoderName {
  return codec === 'h264' ? 'libx264' : codec === 'hevc' ? 'libx265' : 'libsvtav1';
}
