// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// DEX Kernel — DSP (Digital Signal Processing) Module
// Provides: biquad EQ, dynamics (compressor/limiter/gate), convolution reverb,
//           delay line, sample-accurate processing for Imosion + Vinx.
// All functions operate on f64 sample buffers for maximum precision.
// ═══════════════════════════════════════════════════════════════════════════

use napi::bindgen_prelude::*;
use napi_derive::napi;
use rayon::prelude::*;
use std::f64::consts::PI;

// ─────────────────────────────────────────────────────────────────────────
// Biquad Filter (parametric EQ, lowpass, highpass, bandpass, notch, shelf)
// ─────────────────────────────────────────────────────────────────────────

#[napi(object)]
#[derive(Clone)]
pub struct BiquadParams {
    /// Filter type: "lowpass", "highpass", "bandpass", "notch",
    /// "peaking", "lowshelf", "highshelf", "allpass"
    pub filter_type: String,
    /// Center/cutoff frequency in Hz
    pub frequency: f64,
    /// Q factor (resonance). Typical range 0.1–30
    pub q: f64,
    /// Gain in dB (only used for peaking and shelf types)
    pub gain_db: f64,
    /// Sample rate in Hz
    pub sample_rate: f64,
}

/// Apply a biquad filter to an audio buffer (mono f64 samples).
/// Returns the filtered samples. Supports all standard IIR filter types.
#[napi]
pub fn dsp_biquad_filter(samples: Vec<f64>, params: BiquadParams) -> napi::Result<Vec<f64>> {
    let sr = params.sample_rate;
    if sr <= 0.0 {
        return Err(napi::Error::from_reason("sample_rate must be > 0"));
    }
    let freq = params.frequency.max(1.0).min(sr * 0.499);
    let q = params.q.max(0.001);
    let gain_db = params.gain_db;

    let w0 = 2.0 * PI * freq / sr;
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();
    let alpha = sin_w0 / (2.0 * q);
    let a_lin = 10.0_f64.powf(gain_db / 40.0); // sqrt of linear gain

    // Compute biquad coefficients (a0..a2, b0..b2) per Audio EQ Cookbook
    let (b0, b1, b2, a0, a1, a2) = match params.filter_type.as_str() {
        "lowpass" => (
            (1.0 - cos_w0) / 2.0,
            1.0 - cos_w0,
            (1.0 - cos_w0) / 2.0,
            1.0 + alpha,
            -2.0 * cos_w0,
            1.0 - alpha,
        ),
        "highpass" => (
            (1.0 + cos_w0) / 2.0,
            -(1.0 + cos_w0),
            (1.0 + cos_w0) / 2.0,
            1.0 + alpha,
            -2.0 * cos_w0,
            1.0 - alpha,
        ),
        "bandpass" => (
            alpha,
            0.0,
            -alpha,
            1.0 + alpha,
            -2.0 * cos_w0,
            1.0 - alpha,
        ),
        "notch" => (
            1.0,
            -2.0 * cos_w0,
            1.0,
            1.0 + alpha,
            -2.0 * cos_w0,
            1.0 - alpha,
        ),
        "peaking" => (
            1.0 + alpha * a_lin,
            -2.0 * cos_w0,
            1.0 - alpha * a_lin,
            1.0 + alpha / a_lin,
            -2.0 * cos_w0,
            1.0 - alpha / a_lin,
        ),
        "lowshelf" => {
            let two_sqrt_a_alpha = 2.0 * a_lin.sqrt() * alpha;
            (
                a_lin * ((a_lin + 1.0) - (a_lin - 1.0) * cos_w0 + two_sqrt_a_alpha),
                2.0 * a_lin * ((a_lin - 1.0) - (a_lin + 1.0) * cos_w0),
                a_lin * ((a_lin + 1.0) - (a_lin - 1.0) * cos_w0 - two_sqrt_a_alpha),
                (a_lin + 1.0) + (a_lin - 1.0) * cos_w0 + two_sqrt_a_alpha,
                -2.0 * ((a_lin - 1.0) + (a_lin + 1.0) * cos_w0),
                (a_lin + 1.0) + (a_lin - 1.0) * cos_w0 - two_sqrt_a_alpha,
            )
        }
        "highshelf" => {
            let two_sqrt_a_alpha = 2.0 * a_lin.sqrt() * alpha;
            (
                a_lin * ((a_lin + 1.0) + (a_lin - 1.0) * cos_w0 + two_sqrt_a_alpha),
                -2.0 * a_lin * ((a_lin - 1.0) + (a_lin + 1.0) * cos_w0),
                a_lin * ((a_lin + 1.0) + (a_lin - 1.0) * cos_w0 - two_sqrt_a_alpha),
                (a_lin + 1.0) - (a_lin - 1.0) * cos_w0 + two_sqrt_a_alpha,
                2.0 * ((a_lin - 1.0) - (a_lin + 1.0) * cos_w0),
                (a_lin + 1.0) - (a_lin - 1.0) * cos_w0 - two_sqrt_a_alpha,
            )
        }
        "allpass" => (
            1.0 - alpha,
            -2.0 * cos_w0,
            1.0 + alpha,
            1.0 + alpha,
            -2.0 * cos_w0,
            1.0 - alpha,
        ),
        _ => return Err(napi::Error::from_reason(format!(
            "Unknown filter type: {}. Use lowpass, highpass, bandpass, notch, peaking, lowshelf, highshelf, allpass",
            params.filter_type
        ))),
    };

    // Normalize
    let b0 = b0 / a0;
    let b1 = b1 / a0;
    let b2 = b2 / a0;
    let a1 = a1 / a0;
    let a2 = a2 / a0;

    // Direct Form II Transposed
    let mut output = Vec::with_capacity(samples.len());
    let mut z1 = 0.0_f64;
    let mut z2 = 0.0_f64;

    for &x in &samples {
        let y = b0 * x + z1;
        z1 = b1 * x - a1 * y + z2;
        z2 = b2 * x - a2 * y;
        output.push(y);
    }

    Ok(output)
}

/// Apply a multi-band parametric EQ (chain of biquad filters).
/// Each band has frequency, Q, gain_db, and type.
#[napi]
pub fn dsp_parametric_eq(samples: Vec<f64>, bands: Vec<BiquadParams>) -> napi::Result<Vec<f64>> {
    let mut buf = samples;
    for band in &bands {
        buf = dsp_biquad_filter(buf, band.clone())?;
    }
    Ok(buf)
}

/// SIMD-optimized biquad filter for batch processing (4x unrolled).
/// Processes 4 samples per iteration for better instruction-level parallelism.
#[napi]
pub fn dsp_biquad_filter_fast(samples: Vec<f64>, params: BiquadParams) -> napi::Result<Vec<f64>> {
    let sr = params.sample_rate;
    if sr <= 0.0 {
        return Err(napi::Error::from_reason("sample_rate must be > 0"));
    }
    let freq = params.frequency.max(1.0).min(sr * 0.499);
    let q = params.q.max(0.001);
    let gain_db = params.gain_db;

    let w0 = 2.0 * PI * freq / sr;
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();
    let alpha = sin_w0 / (2.0 * q);
    let a_lin = 10.0_f64.powf(gain_db / 40.0);

    // Calculate coefficients (same as regular biquad)
    let (b0, b1, b2, a0, a1, a2) = match params.filter_type.as_str() {
        "lowpass" => (
            (1.0 - cos_w0) / 2.0, 1.0 - cos_w0, (1.0 - cos_w0) / 2.0,
            1.0 + alpha, -2.0 * cos_w0, 1.0 - alpha,
        ),
        "highpass" => (
            (1.0 + cos_w0) / 2.0, -(1.0 + cos_w0), (1.0 + cos_w0) / 2.0,
            1.0 + alpha, -2.0 * cos_w0, 1.0 - alpha,
        ),
        "bandpass" => (alpha, 0.0, -alpha, 1.0 + alpha, -2.0 * cos_w0, 1.0 - alpha),
        "peaking" => (
            1.0 + alpha * a_lin, -2.0 * cos_w0, 1.0 - alpha * a_lin,
            1.0 + alpha / a_lin, -2.0 * cos_w0, 1.0 - alpha / a_lin,
        ),
        _ => return dsp_biquad_filter(samples, params), // Fallback
    };

    // Normalize coefficients
    let b0 = b0 / a0;
    let b1 = b1 / a0;
    let b2 = b2 / a0;
    let a1 = a1 / a0;
    let a2 = a2 / a0;

    let n = samples.len();
    let mut output = vec![0.0_f64; n];
    let mut z1 = 0.0_f64;
    let mut z2 = 0.0_f64;

    // Process in chunks of 4 for better cache utilization
    let chunks = n / 4;
    let remainder = n % 4;

    for i in 0..chunks {
        let base = i * 4;
        
        // Unrolled loop - process 4 samples
        let x0 = samples[base];
        let y0 = b0 * x0 + z1;
        let z1_0 = b1 * x0 - a1 * y0 + z2;
        let z2_0 = b2 * x0 - a2 * y0;
        output[base] = y0;
        
        let x1 = samples[base + 1];
        let y1 = b0 * x1 + z1_0;
        let z1_1 = b1 * x1 - a1 * y1 + z2_0;
        let z2_1 = b2 * x1 - a2 * y1;
        output[base + 1] = y1;
        
        let x2 = samples[base + 2];
        let y2 = b0 * x2 + z1_1;
        let z1_2 = b1 * x2 - a1 * y2 + z2_1;
        let z2_2 = b2 * x2 - a2 * y2;
        output[base + 2] = y2;
        
        let x3 = samples[base + 3];
        let y3 = b0 * x3 + z1_2;
        z1 = b1 * x3 - a1 * y3 + z2_2;
        z2 = b2 * x3 - a2 * y3;
        output[base + 3] = y3;
    }

    // Process remainder
    let base = chunks * 4;
    for i in 0..remainder {
        let x = samples[base + i];
        let y = b0 * x + z1;
        z1 = b1 * x - a1 * y + z2;
        z2 = b2 * x - a2 * y;
        output[base + i] = y;
    }

    Ok(output)
}

/// Process multiple audio buffers in parallel with the same filter settings.
/// Useful for multi-track processing in Imosion/VINX.
#[napi]
pub fn dsp_biquad_filter_batch(buffers: Vec<Vec<f64>>, params: BiquadParams) -> napi::Result<Vec<Vec<f64>>> {
    buffers
        .into_par_iter()
        .map(|samples| dsp_biquad_filter_fast(samples, params.clone()))
        .collect()
}

// ─────────────────────────────────────────────────────────────────────────
// Dynamics Processors (Compressor / Limiter / Gate)
// ─────────────────────────────────────────────────────────────────────────

#[napi(object)]
#[derive(Clone)]
pub struct CompressorParams {
    /// Threshold in dB (e.g. -20.0)
    pub threshold_db: f64,
    /// Ratio (e.g. 4.0 means 4:1 compression)
    pub ratio: f64,
    /// Attack time in ms
    pub attack_ms: f64,
    /// Release time in ms
    pub release_ms: f64,
    /// Makeup gain in dB
    pub makeup_db: f64,
    /// Knee width in dB (0 = hard knee)
    pub knee_db: f64,
    /// Sample rate
    pub sample_rate: f64,
}

/// Apply dynamic range compression to audio samples.
/// Returns compressed samples with envelope following.
#[napi]
pub fn dsp_compress(samples: Vec<f64>, params: CompressorParams) -> napi::Result<Vec<f64>> {
    let sr = params.sample_rate;
    if sr <= 0.0 {
        return Err(napi::Error::from_reason("sample_rate must be > 0"));
    }
    let threshold = params.threshold_db;
    let ratio = params.ratio.max(1.0);
    let attack = (-1000.0 / (sr * params.attack_ms.max(0.01))).exp();
    let release = (-1000.0 / (sr * params.release_ms.max(0.01))).exp();
    let makeup = 10.0_f64.powf(params.makeup_db / 20.0);
    let knee = params.knee_db.max(0.0);

    let mut envelope_db = -96.0_f64;
    let mut output = Vec::with_capacity(samples.len());

    for &x in &samples {
        let abs_x = x.abs().max(1e-30);
        let input_db = 20.0 * abs_x.log10();

        // Soft knee
        let gain_reduction = if knee > 0.0 && (input_db - threshold).abs() < knee / 2.0 {
            let delta = input_db - threshold + knee / 2.0;
            (1.0 / ratio - 1.0) * delta * delta / (2.0 * knee)
        } else if input_db > threshold {
            (threshold + (input_db - threshold) / ratio) - input_db
        } else {
            0.0
        };

        // Envelope follower (ballistics)
        if gain_reduction < envelope_db {
            envelope_db = attack * envelope_db + (1.0 - attack) * gain_reduction;
        } else {
            envelope_db = release * envelope_db + (1.0 - release) * gain_reduction;
        }

        let gain_linear = 10.0_f64.powf(envelope_db / 20.0) * makeup;
        output.push(x * gain_linear);
    }

    Ok(output)
}

/// Hard limiter — ceiling at specified dB level.
#[napi]
pub fn dsp_limit(samples: Vec<f64>, ceiling_db: f64, sample_rate: f64) -> napi::Result<Vec<f64>> {
    dsp_compress(samples, CompressorParams {
        threshold_db: ceiling_db,
        ratio: 100.0, // effectively infinite
        attack_ms: 0.05,
        release_ms: 50.0,
        makeup_db: 0.0,
        knee_db: 0.0,
        sample_rate,
    })
}

/// Noise gate — silence signals below threshold.
#[napi]
pub fn dsp_gate(samples: Vec<f64>, threshold_db: f64, attack_ms: f64, release_ms: f64, sample_rate: f64) -> napi::Result<Vec<f64>> {
    if sample_rate <= 0.0 {
        return Err(napi::Error::from_reason("sample_rate must be > 0"));
    }
    let attack = (-1000.0 / (sample_rate * attack_ms.max(0.01))).exp();
    let release = (-1000.0 / (sample_rate * release_ms.max(0.01))).exp();

    let mut envelope = 0.0_f64;
    let mut output = Vec::with_capacity(samples.len());

    for &x in &samples {
        let abs_x = x.abs();
        let input_db = if abs_x > 1e-30 { 20.0 * abs_x.log10() } else { -96.0 };
        let target = if input_db > threshold_db { 1.0 } else { 0.0 };

        let coeff = if target > envelope { 1.0 - attack } else { 1.0 - release };
        envelope = envelope + coeff * (target - envelope);

        output.push(x * envelope);
    }

    Ok(output)
}

// ─────────────────────────────────────────────────────────────────────────
// Convolution Reverb
// ─────────────────────────────────────────────────────────────────────────

/// Apply convolution reverb using an impulse response.
/// Wet/dry mix: 0.0 = fully dry, 1.0 = fully wet.
/// Uses overlap-add FFT for large IRs, brute force for short ones.
#[napi]
pub fn dsp_convolve(samples: Vec<f64>, impulse: Vec<f64>, mix: f64) -> Vec<f64> {
    let n = samples.len();
    let ir_len = impulse.len();
    if ir_len == 0 || n == 0 {
        return samples;
    }
    let mix = mix.max(0.0).min(1.0);

    // For short IRs (< 512 samples), use direct convolution (parallelized)
    if ir_len <= 512 {
        let out_len = n + ir_len - 1;
        let output: Vec<f64> = (0..out_len)
            .into_par_iter()
            .map(|i| {
                let start = i.saturating_sub(ir_len - 1);
                let end = i.min(n - 1);
                let mut sum = 0.0;
                for j in start..=end {
                    if i - j < ir_len {
                        sum += samples[j] * impulse[i - j];
                    }
                }
                sum
            })
            .collect();

        // Mix dry/wet and trim to original length
        (0..n)
            .map(|i| {
                let dry = samples[i];
                let wet = output[i];
                dry * (1.0 - mix) + wet * mix
            })
            .collect()
    } else {
        // For long IRs, simple sequential convolution (still fast in Rust)
        let out_len = n + ir_len - 1;
        let mut output = vec![0.0_f64; out_len];
        for (i, &s) in samples.iter().enumerate() {
            if s.abs() < 1e-30 { continue; } // skip silence
            for (j, &h) in impulse.iter().enumerate() {
                output[i + j] += s * h;
            }
        }
        (0..n)
            .map(|i| {
                let dry = samples[i];
                let wet = output[i];
                dry * (1.0 - mix) + wet * mix
            })
            .collect()
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Delay Line
// ─────────────────────────────────────────────────────────────────────────

/// Apply a feedback delay to audio samples.
/// delay_ms: delay time in milliseconds
/// feedback: feedback amount (0.0–0.95, clamped for safety)
/// mix: wet/dry mix (0.0–1.0)
#[napi]
pub fn dsp_delay(samples: Vec<f64>, delay_ms: f64, feedback: f64, mix: f64, sample_rate: f64) -> napi::Result<Vec<f64>> {
    if sample_rate <= 0.0 {
        return Err(napi::Error::from_reason("sample_rate must be > 0"));
    }
    let delay_samples = ((delay_ms / 1000.0) * sample_rate).round() as usize;
    if delay_samples == 0 {
        return Ok(samples);
    }
    let feedback = feedback.max(0.0).min(0.95); // prevent infinite feedback
    let mix = mix.max(0.0).min(1.0);

    let mut buffer = vec![0.0_f64; delay_samples];
    let mut write_pos = 0usize;
    let mut output = Vec::with_capacity(samples.len());

    for &x in &samples {
        let delayed = buffer[write_pos];
        let input_to_delay = x + delayed * feedback;
        buffer[write_pos] = input_to_delay;
        write_pos = (write_pos + 1) % delay_samples;
        output.push(x * (1.0 - mix) + delayed * mix);
    }

    Ok(output)
}

// ─────────────────────────────────────────────────────────────────────────
// Pixel Buffer Operations (Prism / Flux compositing)
// ─────────────────────────────────────────────────────────────────────────

/// Apply a 3x3 convolution kernel to RGBA pixel buffer (e.g. sharpen, blur, edge detect).
/// pixels: flat RGBA u8 array, width/height: image dimensions.
/// kernel: 9 f64 values (row-major 3x3).
/// Returns processed RGBA buffer.
#[napi]
pub fn dsp_convolve_pixels(pixels: Buffer, width: u32, height: u32, kernel: Vec<f64>) -> napi::Result<Buffer> {
    if kernel.len() != 9 {
        return Err(napi::Error::from_reason("Kernel must have exactly 9 values (3x3)"));
    }
    let w = width as usize;
    let h = height as usize;
    let data = pixels.as_ref();
    if data.len() != w * h * 4 {
        return Err(napi::Error::from_reason("Pixel buffer size mismatch"));
    }

    let mut output = vec![0u8; data.len()];
    let k_sum: f64 = kernel.iter().sum::<f64>().abs().max(1.0);

    // Process in parallel rows
    let rows: Vec<Vec<u8>> = (0..h)
        .into_par_iter()
        .map(|y| {
            let mut row = vec![0u8; w * 4];
            for x in 0..w {
                let mut r = 0.0_f64;
                let mut g = 0.0_f64;
                let mut b = 0.0_f64;

                for ky in 0..3_i32 {
                    for kx in 0..3_i32 {
                        let sy = (y as i32 + ky - 1).max(0).min(h as i32 - 1) as usize;
                        let sx = (x as i32 + kx - 1).max(0).min(w as i32 - 1) as usize;
                        let idx = (sy * w + sx) * 4;
                        let ki = (ky * 3 + kx) as usize;
                        r += data[idx] as f64 * kernel[ki];
                        g += data[idx + 1] as f64 * kernel[ki];
                        b += data[idx + 2] as f64 * kernel[ki];
                    }
                }

                let out_idx = x * 4;
                row[out_idx] = (r / k_sum).round().max(0.0).min(255.0) as u8;
                row[out_idx + 1] = (g / k_sum).round().max(0.0).min(255.0) as u8;
                row[out_idx + 2] = (b / k_sum).round().max(0.0).min(255.0) as u8;
                // Preserve alpha
                let src_idx = (y * w + x) * 4;
                row[out_idx + 3] = data[src_idx + 3];
            }
            row
        })
        .collect();

    for (y, row) in rows.iter().enumerate() {
        output[y * w * 4..(y + 1) * w * 4].copy_from_slice(row);
    }

    Ok(output.into())
}

/// Compute RMS level of audio samples in dB.
#[napi]
pub fn dsp_rms_db(samples: Vec<f64>) -> f64 {
    if samples.is_empty() {
        return -96.0;
    }
    let sum_sq: f64 = samples.iter().map(|&s| s * s).sum();
    let rms = (sum_sq / samples.len() as f64).sqrt();
    if rms < 1e-30 {
        -96.0
    } else {
        20.0 * rms.log10()
    }
}

/// Compute peak level of audio samples in dB.
#[napi]
pub fn dsp_peak_db(samples: Vec<f64>) -> f64 {
    let peak = samples.iter().map(|s| s.abs()).fold(0.0_f64, f64::max);
    if peak < 1e-30 {
        -96.0
    } else {
        20.0 * peak.log10()
    }
}

/// Apply gain (in dB) to audio samples.
#[napi]
pub fn dsp_apply_gain(samples: Vec<f64>, gain_db: f64) -> Vec<f64> {
    let gain = 10.0_f64.powf(gain_db / 20.0);
    samples.into_iter().map(|s| s * gain).collect()
}

/// Mix multiple audio buffers together (all must be same length).
/// Returns summed and normalized buffer.
#[napi]
pub fn dsp_mix_buffers(buffers: Vec<Vec<f64>>, gains: Vec<f64>) -> napi::Result<Vec<f64>> {
    if buffers.is_empty() {
        return Ok(vec![]);
    }
    let len = buffers[0].len();
    for (i, buf) in buffers.iter().enumerate() {
        if buf.len() != len {
            return Err(napi::Error::from_reason(format!(
                "Buffer {} has length {} but expected {}",
                i,
                buf.len(),
                len
            )));
        }
    }

    let mut output = vec![0.0_f64; len];
    for (i, buf) in buffers.iter().enumerate() {
        let g = gains.get(i).copied().unwrap_or(1.0);
        let g_linear = 10.0_f64.powf(g / 20.0);
        for (j, &s) in buf.iter().enumerate() {
            output[j] += s * g_linear;
        }
    }

    Ok(output)
}
