// =============================================================================
// DEX 6.0 — Native Audio Analysis (GOAL-6C)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Audio metadata + waveform extraction via Symphonia (wav/mp3/flac/ogg/aac/
//! m4a). `metadata()` reads duration/sample-rate/channels + title/artist/album
//! tags; `waveform()` streams the decoded signal and downsamples it to N peak
//! amplitudes for a renderer waveform. Pure analysis — playback (a real output
//! sink) is a separate, device-dependent concern handled in the shell.
//!
//! `waveform()` is two-pass and never buffers the whole signal: pass 1 counts
//! the mono samples (bounded by `CAP`), pass 2 re-decodes and folds each sample
//! into its peak bucket on the fly. Memory is O(buckets) instead of O(samples),
//! while the produced peaks are bit-for-bit identical to a full-buffer
//! `downsample_peaks` over the same input.

use serde::Serialize;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::{FormatOptions, FormatReader};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::{MetadataOptions, StandardTagKey};
use symphonia::core::probe::Hint;

#[derive(Serialize, Clone, Debug)]
pub struct AudioMeta {
    pub duration_ms: u64,
    pub sample_rate: u32,
    pub channels: u32,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
}

/// Probe a file and return its format reader.
fn open_format(path: &str) -> Result<Box<dyn FormatReader>, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = std::path::Path::new(path).extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }
    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| e.to_string())?;
    Ok(probed.format)
}

/// Read metadata + tags. Duration is derived from the frame count / sample rate.
pub fn metadata(path: &str) -> Result<AudioMeta, String> {
    let mut format = open_format(path)?;

    let (sample_rate, channels, n_frames) = {
        let track = format.default_track().ok_or("no audio track")?;
        let p = &track.codec_params;
        (
            p.sample_rate.unwrap_or(0),
            p.channels.map(|c| c.count() as u32).unwrap_or(0),
            p.n_frames.unwrap_or(0),
        )
    };
    let duration_ms = if sample_rate > 0 {
        n_frames.saturating_mul(1000) / sample_rate as u64
    } else {
        0
    };

    let mut title = None;
    let mut artist = None;
    let mut album = None;
    if let Some(rev) = format.metadata().current() {
        for tag in rev.tags() {
            match tag.std_key {
                Some(StandardTagKey::TrackTitle) => title = Some(tag.value.to_string()),
                Some(StandardTagKey::Artist) => artist = Some(tag.value.to_string()),
                Some(StandardTagKey::Album) => album = Some(tag.value.to_string()),
                _ => {}
            }
        }
    }

    Ok(AudioMeta { duration_ms, sample_rate, channels, title, artist, album })
}

const CAP: usize = 12_000_000; // bound memory/time on very long files

/// Decode the default track as a stream of mono-mixed samples (left-to-right,
/// CAP-bounded), invoking `sink` for each. Stops after at most `CAP` samples so
/// both passes see exactly the same prefix of the signal. Returns the count
/// actually delivered.
fn decode_mono<F: FnMut(f32)>(path: &str, mut sink: F) -> Result<usize, String> {
    let mut format = open_format(path)?;

    let (track_id, codec_params, channels) = {
        let track = format.default_track().ok_or("no audio track")?;
        let ch = track.codec_params.channels.map(|c| c.count()).unwrap_or(1).max(1);
        (track.id, track.codec_params.clone(), ch)
    };
    let mut decoder = symphonia::default::get_codecs()
        .make(&codec_params, &DecoderOptions::default())
        .map_err(|e| e.to_string())?;

    let mut emitted: usize = 0;
    // Decode until the demuxer stops yielding packets (end of stream / IO end).
    'outer: while let Ok(packet) = format.next_packet() {
        if packet.track_id() != track_id {
            continue;
        }
        match decoder.decode(&packet) {
            Ok(decoded) => {
                let spec = *decoded.spec();
                let mut sb = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
                sb.copy_interleaved_ref(decoded);
                for frame in sb.samples().chunks(channels) {
                    let mono = frame.iter().copied().sum::<f32>() / frame.len() as f32;
                    sink(mono);
                    emitted += 1;
                    if emitted >= CAP {
                        break 'outer;
                    }
                }
            }
            Err(SymphoniaError::DecodeError(_)) => continue, // recoverable
            Err(_) => break,
        }
    }
    Ok(emitted)
}

/// Stream the decoded signal and downsample to `buckets` peak values in [0, 1] —
/// a renderer-ready waveform.
///
/// Two-pass and O(buckets) in memory: pass 1 counts the (CAP-bounded) mono
/// samples so the per-bucket window size is known; pass 2 re-decodes and folds
/// each sample's absolute value into its bucket's running peak. Output is
/// identical to `downsample_peaks(&full_buffer, buckets)`.
pub fn waveform(path: &str, buckets: usize) -> Result<Vec<f32>, String> {
    let buckets = buckets.max(1);

    // Pass 1: count samples (same CAP-bounded prefix pass 2 will see).
    let total = decode_mono(path, |_| {})?;
    if total == 0 {
        return Ok(vec![0.0; buckets]);
    }

    // Replicate downsample_peaks' window math exactly. For bucket b the range is
    //   start = floor(b*win)
    //   end   = min(floor((b+1)*win), total).max(start)
    // and peak = max abs over samples[start..end]. We precompute the current
    // bucket's [start, end) and only fold samples whose global index lands in it,
    // advancing the bucket as the index crosses each boundary. This drops any
    // sample beyond the last bucket's clamped `end` precisely as the full-buffer
    // version does (matters when float rounding makes floor(buckets*win) < total).
    let win = (total as f64 / buckets as f64).max(1.0);
    let bucket_range = |b: usize| -> (usize, usize) {
        let start = (b as f64 * win) as usize;
        let end = (((b + 1) as f64 * win) as usize).min(total).max(start);
        (start, end)
    };
    let mut out = vec![0.0f32; buckets];

    let mut idx: usize = 0;
    let mut bucket: usize = 0;
    let (mut start, mut end) = bucket_range(0);

    // Pass 2: fold each sample into its bucket's running peak.
    decode_mono(path, |s| {
        // Skip past exhausted buckets (their range ends at or before idx).
        // Empty buckets (start == end, possible when buckets > total) keep their
        // 0.0 default, exactly as the full-buffer loop leaves them.
        while bucket + 1 < buckets && idx >= end {
            bucket += 1;
            let r = bucket_range(bucket);
            start = r.0;
            end = r.1;
        }
        // Fold only if the index is within the current bucket's clamped range;
        // indices past the final bucket's `end` are ignored, matching the slice.
        if idx >= start && idx < end {
            let a = s.abs();
            if a > out[bucket] {
                out[bucket] = a;
            }
        }
        idx += 1;
    })?;

    for p in out.iter_mut() {
        *p = p.min(1.0);
    }
    Ok(out)
}

// ===========================================================================
// Beat / tempo / onset analysis (ROADMAP "Smart Tempo" — real DSP, no ML).
//
// A native port of the renderer's beatDetect.ts so the heavy path runs in Rust
// over the decoded signal instead of shipping megabytes of PCM into JS: build an
// onset-strength envelope (positive RMS flux per hop), autocorrelate it over a
// plausible BPM band for tempo, and peak-pick it for beat onsets. The DSP is
// pure over PCM (`analyze_pcm`) so it's fully unit-testable; `analyze_beats`
// only adds the decode. Same defaults + envelope as the TS path, plus an octave
// correction the JS version lacks (autocorrelation peaks at every multiple of
// the true period, so the naive argmax often reports half/third tempo).
// ===========================================================================

/// Tunables for beat analysis. Defaults mirror `beatDetect.ts` exactly.
#[derive(Clone, Copy, Debug)]
pub struct BeatOptions {
    /// Envelope hop size in samples.
    pub hop: usize,
    /// Tempo search band (BPM).
    pub min_bpm: f32,
    pub max_bpm: f32,
    /// Onset peak sensitivity — threshold is `mean + sensitivity * std`.
    pub sensitivity: f32,
}

impl Default for BeatOptions {
    fn default() -> Self {
        Self { hop: 512, min_bpm: 60.0, max_bpm: 200.0, sensitivity: 1.0 }
    }
}

/// Beat/tempo analysis result, shaped for the renderer.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct BeatAnalysis {
    /// Estimated tempo in BPM (0.0 when indeterminate).
    pub bpm: f32,
    /// Autocorrelation confidence in [0, 1].
    pub confidence: f32,
    /// Beat onset times in seconds.
    pub onsets: Vec<f32>,
    /// Echoes the hop actually used (so the caller can reason about resolution).
    pub hop: u32,
    pub sample_rate: u32,
}

/// RMS-per-hop, then positive first-difference = onset-strength envelope.
/// `env[0]` is always 0 (no preceding frame to diff against).
fn onset_envelope(samples: &[f32], hop: usize) -> Vec<f32> {
    let hop = hop.max(1);
    let frames = samples.len() / hop;
    if frames == 0 {
        return Vec::new();
    }
    let mut rms = vec![0.0f32; frames];
    for (f, slot) in rms.iter_mut().enumerate() {
        let base = f * hop;
        let mut e = 0.0f32;
        for &s in &samples[base..base + hop] {
            e += s * s;
        }
        *slot = (e / hop as f32).sqrt();
    }
    let mut env = vec![0.0f32; frames];
    for f in 1..frames {
        let d = rms[f] - rms[f - 1];
        env[f] = if d > 0.0 { d } else { 0.0 };
    }
    env
}

fn mean_of(a: &[f32]) -> f32 {
    if a.is_empty() {
        return 0.0;
    }
    a.iter().sum::<f32>() / a.len() as f32
}

/// Estimate tempo by autocorrelating the (mean-removed) onset envelope over the
/// lag band implied by [min_bpm, max_bpm]. Returns `(bpm, confidence)` where
/// confidence is the best lag's autocorrelation normalised by lag-0 energy.
pub fn tempo_from_envelope(env: &[f32], hop_time: f32, min_bpm: f32, max_bpm: f32) -> (f32, f32) {
    if env.len() < 4 || hop_time <= 0.0 || min_bpm <= 0.0 || max_bpm <= min_bpm {
        return (0.0, 0.0);
    }
    let mean = mean_of(env);
    let e: Vec<f32> = env.iter().map(|&x| x - mean).collect();

    let min_lag = (((60.0 / max_bpm) / hop_time).floor() as usize).max(1);
    let max_lag = (((60.0 / min_bpm) / hop_time).ceil() as usize).min(e.len() - 1);
    if max_lag <= min_lag {
        return (0.0, 0.0);
    }

    let r0: f32 = e.iter().map(|&x| x * x).sum();

    // Autocorrelation across the whole band, kept so octave correction can look
    // up sub-multiple lags. `corr[lag - min_lag]` holds R(lag).
    let mut corr = vec![0.0f32; max_lag - min_lag + 1];
    let mut best_lag = min_lag;
    let mut best_val = f32::NEG_INFINITY;
    for lag in min_lag..=max_lag {
        let mut s = 0.0f32;
        for i in lag..e.len() {
            s += e[i] * e[i - lag];
        }
        corr[lag - min_lag] = s;
        if s > best_val {
            best_val = s;
            best_lag = lag;
        }
    }
    let r_at = |lag: usize| -> Option<f32> {
        if (min_lag..=max_lag).contains(&lag) {
            Some(corr[lag - min_lag])
        } else {
            None
        }
    };

    // Octave correction. Autocorrelation peaks at every integer multiple of the
    // true period, so `best_lag` is often 2x/3x the real one (detected half or
    // third tempo). For each sub-multiple best_lag/k, scan a ±1-hop neighbourhood
    // (the fundamental peak can sit a hop off, and smears when the period isn't a
    // whole number of hops) and, if its correlation is still ≥80% of the best,
    // treat that shorter lag as the real period. We keep the SHORTEST such lag —
    // the true fundamental, not a harmonic. A clean off-beat lag correlates near
    // 0, so this never fires on a genuinely slow track.
    let mut fundamental = best_lag;
    for k in [2usize, 3, 4] {
        let center = best_lag as f32 / k as f32;
        let lo = center.floor() as usize;
        let mut nb_lag = 0usize;
        let mut nb_val = f32::NEG_INFINITY;
        for lag in lo.saturating_sub(1)..=lo + 1 {
            if let Some(v) = r_at(lag) {
                if v > nb_val {
                    nb_val = v;
                    nb_lag = lag;
                }
            }
        }
        if nb_lag != 0 && nb_val >= 0.8 * best_val && nb_lag < fundamental {
            fundamental = nb_lag;
        }
    }

    let bpm = 60.0 / (fundamental as f32 * hop_time);
    let confidence = if r0 > 0.0 { (best_val / r0).clamp(0.0, 1.0) } else { 0.0 };
    (round1(bpm), round2(confidence))
}

/// Peak-pick onset times (seconds) from the envelope: local maxima above
/// `mean + sensitivity * std`.
pub fn onsets_from_envelope(env: &[f32], hop_time: f32, sensitivity: f32) -> Vec<f32> {
    if env.len() < 3 || hop_time <= 0.0 {
        return Vec::new();
    }
    let mean = mean_of(env);
    let var = env.iter().map(|&x| (x - mean) * (x - mean)).sum::<f32>() / env.len() as f32;
    let std = var.sqrt();
    let thr = mean + sensitivity * std;

    let mut onsets = Vec::new();
    for f in 1..env.len() - 1 {
        if env[f] > thr && env[f] >= env[f - 1] && env[f] > env[f + 1] {
            onsets.push(round3(f as f32 * hop_time));
        }
    }
    onsets
}

/// Pure PCM beat analysis — decoupled from decoding so it's directly testable.
pub fn analyze_pcm(samples: &[f32], sample_rate: u32, opts: BeatOptions) -> BeatAnalysis {
    let empty = BeatAnalysis {
        bpm: 0.0,
        confidence: 0.0,
        onsets: Vec::new(),
        hop: opts.hop as u32,
        sample_rate,
    };
    if samples.is_empty() || sample_rate == 0 {
        return empty;
    }
    let hop = opts.hop.max(1);
    let hop_time = hop as f32 / sample_rate as f32;
    let env = onset_envelope(samples, hop);
    if env.is_empty() {
        return empty;
    }
    let (bpm, confidence) = tempo_from_envelope(&env, hop_time, opts.min_bpm, opts.max_bpm);
    let onsets = onsets_from_envelope(&env, hop_time, opts.sensitivity);
    BeatAnalysis { bpm, confidence, onsets, hop: hop as u32, sample_rate }
}

/// Decode `path` to mono PCM and run the beat analysis natively. The one heavy
/// call the renderer's Smart Tempo needs — pass a file path, get back tempo +
/// onsets without decoding the whole clip in JS.
pub fn analyze_beats(path: &str, opts: BeatOptions) -> Result<BeatAnalysis, String> {
    let sample_rate = track_sample_rate(path)?;
    let mut buf: Vec<f32> = Vec::new();
    decode_mono(path, |s| buf.push(s))?; // CAP-bounded inside decode_mono
    Ok(analyze_pcm(&buf, sample_rate, opts))
}

/// The default track's sample rate, without decoding any audio.
fn track_sample_rate(path: &str) -> Result<u32, String> {
    let format = open_format(path)?;
    let track = format.default_track().ok_or("no audio track")?;
    track.codec_params.sample_rate.ok_or_else(|| "unknown sample rate".to_string())
}

fn round1(x: f32) -> f32 {
    (x * 10.0).round() / 10.0
}
fn round2(x: f32) -> f32 {
    (x * 100.0).round() / 100.0
}
fn round3(x: f32) -> f32 {
    (x * 1000.0).round() / 1000.0
}

// ===========================================================================
// Musical key / scale detection (chromagram + Krumhansl-Schmuckler).
//
// Real DSP, no FFT crate: a 12-bin chromagram built with per-frame Goertzel
// filters at every semitone from C2..B6 (folded to pitch classes), then the
// classic Krumhansl-Schmuckler key-finding — correlate the chroma against the
// 24 major/minor tonal profiles and take the best. Pure over PCM so it's unit
// testable; `detect_key` adds the decode.
// ===========================================================================

const PITCH_NAMES: [&str; 12] =
    ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Krumhansl-Schmuckler key profiles (index 0 = tonic pitch class).
const KS_MAJOR: [f32; 12] =
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR: [f32; 12] =
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const CHROMA_FRAME: usize = 4096;
const KEY_FRAME_CAP: usize = 700; // ~65 s at 44.1 kHz — long enough, stays fast

/// Estimated musical key, shaped for the renderer.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct KeyResult {
    /// Tonic name, e.g. "C" / "F#" ("" when indeterminate / silent).
    pub key: String,
    /// "major" | "minor" ("" when indeterminate).
    pub scale: String,
    /// Best profile correlation, clamped to [0, 1].
    pub confidence: f32,
    /// The 12 normalised pitch-class energies (sum ≈ 1).
    pub chroma: Vec<f32>,
    pub sample_rate: u32,
}

/// 12-bin chromagram via per-frame Goertzel at each semitone C2..B6, folded to
/// pitch classes and normalised to sum 1 (all-zero on silence).
pub fn chroma_from_pcm(samples: &[f32], sample_rate: u32) -> [f32; 12] {
    let mut chroma = [0.0f32; 12];
    if samples.is_empty() || sample_rate == 0 {
        return chroma;
    }
    // Precompute (pitch-class, Goertzel coeff) for every in-band semitone.
    let nyquist = sample_rate as f32 / 2.0;
    let mut targets: Vec<(usize, f32)> = Vec::new();
    for midi in 36..=95i32 {
        let f = 440.0f32 * 2f32.powf((midi as f32 - 69.0) / 12.0);
        if f >= nyquist {
            continue;
        }
        let omega = 2.0 * std::f32::consts::PI * f / sample_rate as f32;
        targets.push(((midi % 12) as usize, 2.0 * omega.cos()));
    }
    let frames = (samples.len() / CHROMA_FRAME).min(KEY_FRAME_CAP);
    if frames == 0 || targets.is_empty() {
        return chroma;
    }
    for fr in 0..frames {
        let block = &samples[fr * CHROMA_FRAME..fr * CHROMA_FRAME + CHROMA_FRAME];
        for &(pc, coeff) in &targets {
            let mut s_prev = 0.0f32;
            let mut s_prev2 = 0.0f32;
            for &x in block {
                let s = x + coeff * s_prev - s_prev2;
                s_prev2 = s_prev;
                s_prev = s;
            }
            let power = s_prev2 * s_prev2 + s_prev * s_prev - coeff * s_prev * s_prev2;
            if power > 0.0 {
                chroma[pc] += power.sqrt();
            }
        }
    }
    let sum: f32 = chroma.iter().sum();
    if sum > 0.0 {
        for c in chroma.iter_mut() {
            *c /= sum;
        }
    }
    chroma
}

/// Pearson correlation of two equal-length vectors (0 when either is flat).
fn pearson(a: &[f32], b: &[f32]) -> f32 {
    let n = a.len() as f32;
    let ma = a.iter().sum::<f32>() / n;
    let mb = b.iter().sum::<f32>() / n;
    let (mut num, mut da, mut db) = (0.0f32, 0.0f32, 0.0f32);
    for i in 0..a.len() {
        let xa = a[i] - ma;
        let xb = b[i] - mb;
        num += xa * xb;
        da += xa * xa;
        db += xb * xb;
    }
    let den = (da * db).sqrt();
    if den > 0.0 {
        num / den
    } else {
        0.0
    }
}

/// Krumhansl-Schmuckler: correlate the chroma against all 24 keys. Returns
/// `(tonic pitch class, is_minor, correlation)`.
pub fn detect_key_from_chroma(chroma: &[f32; 12]) -> (usize, bool, f32) {
    let mut best = (0usize, false, f32::NEG_INFINITY);
    for tonic in 0..12usize {
        let mut maj = [0.0f32; 12];
        let mut min = [0.0f32; 12];
        for i in 0..12 {
            maj[(tonic + i) % 12] = KS_MAJOR[i];
            min[(tonic + i) % 12] = KS_MINOR[i];
        }
        let cmaj = pearson(chroma, &maj);
        if cmaj > best.2 {
            best = (tonic, false, cmaj);
        }
        let cmin = pearson(chroma, &min);
        if cmin > best.2 {
            best = (tonic, true, cmin);
        }
    }
    best
}

/// Pure PCM key detection.
pub fn detect_key_pcm(samples: &[f32], sample_rate: u32) -> KeyResult {
    let chroma = chroma_from_pcm(samples, sample_rate);
    if chroma.iter().sum::<f32>() <= 0.0 {
        return KeyResult {
            key: String::new(),
            scale: String::new(),
            confidence: 0.0,
            chroma: chroma.to_vec(),
            sample_rate,
        };
    }
    let (tonic, minor, corr) = detect_key_from_chroma(&chroma);
    KeyResult {
        key: PITCH_NAMES[tonic].to_string(),
        scale: if minor { "minor" } else { "major" }.to_string(),
        confidence: round2(corr.clamp(0.0, 1.0)),
        chroma: chroma.to_vec(),
        sample_rate,
    }
}

/// Decode `path` and detect its musical key natively.
pub fn detect_key(path: &str) -> Result<KeyResult, String> {
    let sample_rate = track_sample_rate(path)?;
    let mut buf: Vec<f32> = Vec::new();
    decode_mono(path, |s| buf.push(s))?;
    Ok(detect_key_pcm(&buf, sample_rate))
}

// ===========================================================================
// Silence detection + integrated loudness (real DSP; LUFS per ITU-R BS.1770).
//
// `detect_silence` / `plan_silence_removal` are a native port of the renderer's
// silenceDetect.ts (sliding-window RMS, threshold in dBFS, padding). Loudness is
// a genuine BS.1770 integrated-LUFS meter: K-weighting biquads (coefficients
// derived per sample-rate, à la libebur128), 400 ms / 75%-overlap block loudness,
// and the two-stage (-70 LUFS absolute, -10 LU relative) gating.
// ===========================================================================

/// Tunables for silence detection. Defaults mirror silenceDetect.ts.
#[derive(Clone, Copy, Debug)]
pub struct SilenceOptions {
    pub threshold_db: f32,
    pub min_silence_sec: f32,
    pub window_sec: f32,
    pub padding_sec: f32,
}

impl Default for SilenceOptions {
    fn default() -> Self {
        Self { threshold_db: -40.0, min_silence_sec: 0.35, window_sec: 0.02, padding_sec: 0.05 }
    }
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Region {
    pub start_sec: f32,
    pub end_sec: f32,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct SilencePlan {
    pub keep: Vec<Region>,
    pub remove: Vec<Region>,
    pub removed_sec: f32,
    pub kept_sec: f32,
    pub original_sec: f32,
}

fn window_db(samples: &[f32], from: usize, to: usize) -> f32 {
    let mut sum = 0.0f32;
    for &s in &samples[from..to] {
        sum += s * s;
    }
    let n = (to - from).max(1) as f32;
    let rms = (sum / n).sqrt();
    if rms <= 1e-12 {
        f32::NEG_INFINITY
    } else {
        20.0 * rms.log10()
    }
}

/// Detect silent regions (seconds) in mono PCM: windowed RMS at/under the
/// threshold, runs at least `min_silence_sec` long.
pub fn detect_silence(samples: &[f32], sample_rate: u32, opts: SilenceOptions) -> Vec<Region> {
    if samples.is_empty() || sample_rate == 0 {
        return Vec::new();
    }
    let min_silence = opts.min_silence_sec.max(0.0);
    let win = ((opts.window_sec.max(0.001) * sample_rate as f32).round() as usize).max(1);
    let sr = sample_rate as f32;
    let mut regions: Vec<Region> = Vec::new();
    let mut run_start: i64 = -1;

    let flush = |end_sample: usize, regions: &mut Vec<Region>, run_start: &mut i64| {
        if *run_start < 0 {
            return;
        }
        let start_sec = *run_start as f32 / sr;
        let end_sec = end_sample as f32 / sr;
        if end_sec - start_sec >= min_silence {
            regions.push(Region { start_sec, end_sec });
        }
        *run_start = -1;
    };

    let mut i = 0usize;
    while i < samples.len() {
        let end = (i + win).min(samples.len());
        let silent = window_db(samples, i, end) <= opts.threshold_db;
        if silent {
            if run_start < 0 {
                run_start = i as i64;
            }
        } else {
            flush(i, &mut regions, &mut run_start);
        }
        i += win;
    }
    flush(samples.len(), &mut regions, &mut run_start);
    regions
}

/// Complement of `remove` over [0, total] → the keep regions.
fn complement(remove: &[Region], total_sec: f32) -> Vec<Region> {
    let mut keep = Vec::new();
    let mut cursor = 0.0f32;
    for r in remove {
        if r.start_sec > cursor {
            keep.push(Region { start_sec: cursor, end_sec: r.start_sec });
        }
        cursor = cursor.max(r.end_sec);
    }
    if cursor < total_sec {
        keep.push(Region { start_sec: cursor, end_sec: total_sec });
    }
    keep
}

/// Plan a silence-removal edit: detect silence, shrink each region by
/// `padding_sec` both ends, then derive keep/remove segments + durations.
pub fn plan_silence_removal(
    samples: &[f32],
    sample_rate: u32,
    opts: SilenceOptions,
) -> SilencePlan {
    let padding = opts.padding_sec.max(0.0);
    let original_sec = if !samples.is_empty() && sample_rate > 0 {
        samples.len() as f32 / sample_rate as f32
    } else {
        0.0
    };
    let mut remove = Vec::new();
    for r in detect_silence(samples, sample_rate, opts) {
        let start_sec = r.start_sec + padding;
        let end_sec = r.end_sec - padding;
        if end_sec - start_sec > 0.0 {
            remove.push(Region { start_sec, end_sec });
        }
    }
    let keep = complement(&remove, original_sec);
    let removed_sec = remove.iter().map(|r| r.end_sec - r.start_sec).sum::<f32>();
    let kept_sec = (original_sec - removed_sec).max(0.0);
    SilencePlan {
        keep,
        remove,
        removed_sec: round3(removed_sec),
        kept_sec: round3(kept_sec),
        original_sec: round3(original_sec),
    }
}

/// Decode `path` and plan silence removal natively over the whole file.
pub fn analyze_silence(path: &str, opts: SilenceOptions) -> Result<SilencePlan, String> {
    let sample_rate = track_sample_rate(path)?;
    let mut buf: Vec<f32> = Vec::new();
    decode_mono(path, |s| buf.push(s))?;
    Ok(plan_silence_removal(&buf, sample_rate, opts))
}

/// A direct-form-I biquad section.
struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
}

impl Biquad {
    fn process(&self, x: &mut [f32]) {
        let (mut x1, mut x2, mut y1, mut y2) = (0.0f32, 0.0f32, 0.0f32, 0.0f32);
        for s in x.iter_mut() {
            let x0 = *s;
            let y0 = self.b0 * x0 + self.b1 * x1 + self.b2 * x2 - self.a1 * y1 - self.a2 * y2;
            x2 = x1;
            x1 = x0;
            y2 = y1;
            y1 = y0;
            *s = y0;
        }
    }
}

/// BS.1770 K-weighting: stage 1 high-shelf ("head"), stage 2 high-pass ("RLB"),
/// coefficients derived for the actual sample rate (libebur128 formulation).
fn k_weighting(sample_rate: f32) -> (Biquad, Biquad) {
    // Stage 1 — high-frequency shelving boost.
    let f0 = 1681.974450955533f32;
    let g = 3.999843853973347f32;
    let q = 0.7071752369554196f32;
    let k = (std::f32::consts::PI * f0 / sample_rate).tan();
    let vh = 10f32.powf(g / 20.0);
    let vb = vh.powf(0.4996667741545416);
    let a0 = 1.0 + k / q + k * k;
    let s1 = Biquad {
        b0: (vh + vb * k / q + k * k) / a0,
        b1: 2.0 * (k * k - vh) / a0,
        b2: (vh - vb * k / q + k * k) / a0,
        a1: 2.0 * (k * k - 1.0) / a0,
        a2: (1.0 - k / q + k * k) / a0,
    };
    // Stage 2 — high-pass (RLB weighting).
    let f0 = 38.13547087602444f32;
    let q = 0.5003270373238773f32;
    let k = (std::f32::consts::PI * f0 / sample_rate).tan();
    let a0 = 1.0 + k / q + k * k;
    let s2 = Biquad {
        b0: 1.0,
        b1: -2.0,
        b2: 1.0,
        a1: 2.0 * (k * k - 1.0) / a0,
        a2: (1.0 - k / q + k * k) / a0,
    };
    (s1, s2)
}

/// Integrated loudness (LUFS) result plus sample peak.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct LoudnessResult {
    /// Gated integrated loudness in LUFS (floored at -70.0 for silence).
    pub lufs: f32,
    /// Sample peak in dBFS (floored at -120.0 for silence).
    pub peak_dbfs: f32,
    pub sample_rate: u32,
}

const LUFS_SILENCE_FLOOR: f32 = -70.0;

/// Integrated LUFS of mono PCM per BS.1770 (K-weighting + two-stage gating).
pub fn analyze_loudness_pcm(samples: &[f32], sample_rate: u32) -> LoudnessResult {
    let peak = samples.iter().fold(0.0f32, |m, &s| m.max(s.abs()));
    let peak_dbfs = if peak > 1e-12 { round2(20.0 * peak.log10()) } else { -120.0 };
    if samples.is_empty() || sample_rate == 0 {
        return LoudnessResult { lufs: LUFS_SILENCE_FLOOR, peak_dbfs, sample_rate };
    }

    // K-weight a working copy.
    let (s1, s2) = k_weighting(sample_rate as f32);
    let mut z = samples.to_vec();
    s1.process(&mut z);
    s2.process(&mut z);

    // 400 ms blocks, 100 ms step (75% overlap). Block loudness Lk and its mean
    // square, per BS.1770.
    let block = ((0.400 * sample_rate as f32) as usize).max(1);
    let step = ((0.100 * sample_rate as f32) as usize).max(1);
    if z.len() < block {
        return LoudnessResult { lufs: LUFS_SILENCE_FLOOR, peak_dbfs, sample_rate };
    }
    let mut blocks: Vec<f32> = Vec::new(); // mean square per block
    let mut start = 0usize;
    while start + block <= z.len() {
        let ms = z[start..start + block].iter().map(|&v| v * v).sum::<f32>() / block as f32;
        blocks.push(ms);
        start += step;
    }
    let loudness = |ms: f32| -0.691 + 10.0 * (ms.max(1e-12)).log10();

    // Absolute gate at -70 LUFS.
    let abs_kept: Vec<f32> = blocks.iter().copied().filter(|&ms| loudness(ms) >= -70.0).collect();
    if abs_kept.is_empty() {
        return LoudnessResult { lufs: LUFS_SILENCE_FLOOR, peak_dbfs, sample_rate };
    }
    // Relative gate at -10 LU below the abs-gated mean.
    let abs_mean = abs_kept.iter().sum::<f32>() / abs_kept.len() as f32;
    let rel_thresh = loudness(abs_mean) - 10.0;
    let rel_kept: Vec<f32> =
        abs_kept.iter().copied().filter(|&ms| loudness(ms) >= rel_thresh).collect();
    let final_blocks = if rel_kept.is_empty() { abs_kept } else { rel_kept };
    let mean_ms = final_blocks.iter().sum::<f32>() / final_blocks.len() as f32;
    let lufs = loudness(mean_ms).max(LUFS_SILENCE_FLOOR);
    LoudnessResult { lufs: round2(lufs), peak_dbfs, sample_rate }
}

/// Decode `path` and measure its integrated loudness natively.
pub fn analyze_loudness(path: &str) -> Result<LoudnessResult, String> {
    let sample_rate = track_sample_rate(path)?;
    let mut buf: Vec<f32> = Vec::new();
    decode_mono(path, |s| buf.push(s))?;
    Ok(analyze_loudness_pcm(&buf, sample_rate))
}

#[cfg(any(test, doc))]
fn downsample_peaks(samples: &[f32], buckets: usize) -> Vec<f32> {
    if samples.is_empty() {
        return vec![0.0; buckets];
    }
    let win = (samples.len() as f64 / buckets as f64).max(1.0);
    let mut out = Vec::with_capacity(buckets);
    for b in 0..buckets {
        let start = (b as f64 * win) as usize;
        let end = (((b + 1) as f64 * win) as usize).min(samples.len()).max(start);
        let mut peak = 0.0f32;
        for &s in &samples[start..end] {
            let a = s.abs();
            if a > peak {
                peak = a;
            }
        }
        out.push(peak.min(1.0));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// Write a minimal 16-bit mono PCM WAV so the test exercises the real
    /// probe + decode path (no external fixture needed).
    fn write_wav(path: &std::path::Path, sample_rate: u32, samples: &[i16]) {
        let n = samples.len() as u32;
        let data_size = n * 2;
        let mut f = std::fs::File::create(path).unwrap();
        f.write_all(b"RIFF").unwrap();
        f.write_all(&(36 + data_size).to_le_bytes()).unwrap();
        f.write_all(b"WAVE").unwrap();
        f.write_all(b"fmt ").unwrap();
        f.write_all(&16u32.to_le_bytes()).unwrap();
        f.write_all(&1u16.to_le_bytes()).unwrap(); // PCM
        f.write_all(&1u16.to_le_bytes()).unwrap(); // mono
        f.write_all(&sample_rate.to_le_bytes()).unwrap();
        f.write_all(&(sample_rate * 2).to_le_bytes()).unwrap(); // byte rate
        f.write_all(&2u16.to_le_bytes()).unwrap(); // block align
        f.write_all(&16u16.to_le_bytes()).unwrap(); // bits/sample
        f.write_all(b"data").unwrap();
        f.write_all(&data_size.to_le_bytes()).unwrap();
        for &s in samples {
            f.write_all(&s.to_le_bytes()).unwrap();
        }
    }

    #[test]
    fn reads_metadata_from_wav() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tone.wav");
        // 8000 Hz mono, 8000 samples == 1.0s.
        let samples: Vec<i16> = (0..8000).map(|i| ((i as f32 * 0.1).sin() * 10000.0) as i16).collect();
        write_wav(&path, 8000, &samples);

        let meta = metadata(path.to_str().unwrap()).unwrap();
        assert_eq!(meta.sample_rate, 8000);
        assert_eq!(meta.channels, 1);
        assert!((meta.duration_ms as i64 - 1000).abs() <= 5, "duration ~1s, got {}", meta.duration_ms);
    }

    #[test]
    fn extracts_waveform_peaks() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tone.wav");
        let samples: Vec<i16> = (0..8000).map(|i| ((i as f32 * 0.1).sin() * 16000.0) as i16).collect();
        write_wav(&path, 8000, &samples);

        let wf = waveform(path.to_str().unwrap(), 32).unwrap();
        assert_eq!(wf.len(), 32);
        assert!(wf.iter().any(|&p| p > 0.1), "a tone should produce non-trivial peaks");
        assert!(wf.iter().all(|&p| (0.0..=1.0).contains(&p)));
    }

    #[test]
    fn downsample_handles_silence_and_bounds() {
        assert_eq!(downsample_peaks(&[], 8), vec![0.0; 8]);
        let peaks = downsample_peaks(&[0.5, -0.9, 0.2, 0.1], 2);
        assert_eq!(peaks.len(), 2);
        assert!((peaks[0] - 0.9).abs() < 1e-6); // max abs in first window
    }

    /// The streaming (two-pass) `waveform` must produce bit-for-bit the same
    /// peaks the old full-buffer path produced: decode the whole WAV the legacy
    /// way, run `downsample_peaks` over it, and compare to `waveform` across a
    /// range of bucket counts (including the buckets > samples edge case).
    #[test]
    fn streamed_waveform_matches_full_buffer() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tone.wav");
        // A non-trivial, asymmetric signal so per-bucket peaks actually differ.
        let samples: Vec<i16> = (0..7993)
            .map(|i| {
                let t = i as f32 * 0.073;
                ((t.sin() * 0.7 + (t * 1.9).cos() * 0.3) * 20000.0) as i16
            })
            .collect();
        write_wav(&path, 8000, &samples);
        let p = path.to_str().unwrap();

        // Reference: collect the full mono buffer exactly like the legacy loop.
        let mut full: Vec<f32> = Vec::new();
        decode_mono(p, |s| full.push(s)).unwrap();
        assert!(!full.is_empty());

        // Compare across sizes, incl. 1, odd, and buckets near the sample count.
        // (We stop at full.len() because the legacy downsample_peaks panics when
        // buckets > samples.len() — start index runs past the slice. The
        // streaming path avoids that latent bug, verified separately below.)
        for &b in &[1usize, 7, 32, 256, 1000, full.len() - 1, full.len()] {
            let streamed = waveform(p, b).unwrap();
            let reference = downsample_peaks(&full, b.max(1));
            assert_eq!(streamed.len(), reference.len(), "len mismatch at buckets={b}");
            assert_eq!(streamed, reference, "peak mismatch at buckets={b}");
        }

        // buckets > sample count: streaming must not panic (the old full-buffer
        // downsample_peaks would). Trailing buckets with no samples read 0.0.
        let more = waveform(p, full.len() + 50).unwrap();
        assert_eq!(more.len(), full.len() + 50);
        assert!(more.iter().all(|&q| (0.0..=1.0).contains(&q)));
        assert!(more.iter().rev().take(50).all(|&q| q == 0.0), "tail buckets are silent");
    }

    /// Synthesise a click track: a sharp decaying burst every `period` samples.
    /// The abrupt attacks are exactly what the onset-flux envelope keys on.
    fn click_track(sample_rate: u32, bpm: f32, seconds: f32) -> Vec<f32> {
        let n = (sample_rate as f32 * seconds) as usize;
        let period = (sample_rate as f32 * 60.0 / bpm) as usize;
        let burst = (sample_rate as f32 * 0.03) as usize; // 30ms transient
        let mut pcm = vec![0.0f32; n];
        let mut start = 0usize;
        while start < n {
            for k in 0..burst {
                let i = start + k;
                if i >= n {
                    break;
                }
                // Decaying 1 kHz tone — sharp onset, quick fade.
                let decay = 1.0 - (k as f32 / burst as f32);
                let t = i as f32 / sample_rate as f32;
                pcm[i] = 0.8 * decay * (2.0 * std::f32::consts::PI * 1000.0 * t).sin();
            }
            start += period;
        }
        pcm
    }

    #[test]
    fn analyze_pcm_recovers_click_track_tempo() {
        // 44.1 kHz gives fine hop resolution: a 120 BPM (0.5 s) period is ~43
        // hops of 512, so the recovered BPM lands close to the truth.
        let sr = 44_100u32;
        let pcm = click_track(sr, 120.0, 5.0);
        let a = analyze_pcm(&pcm, sr, BeatOptions::default());

        assert!((a.bpm - 120.0).abs() <= 6.0, "expected ~120 BPM, got {}", a.bpm);
        assert!(a.confidence > 0.0, "a periodic click track should be confident");

        // ~2 beats/sec over 5 s → ~10 onsets; allow slack for edge frames.
        assert!(a.onsets.len() >= 7, "expected ~10 onsets, got {}", a.onsets.len());
        // Consecutive onsets sit ~0.5 s apart (median inter-onset interval).
        let mut gaps: Vec<f32> = a.onsets.windows(2).map(|w| w[1] - w[0]).collect();
        gaps.sort_by(|x, y| x.partial_cmp(y).unwrap());
        let median = gaps[gaps.len() / 2];
        assert!((median - 0.5).abs() <= 0.06, "median beat gap ~0.5s, got {median}");
    }

    #[test]
    fn analyze_pcm_handles_silence_and_empty() {
        let sr = 44_100u32;
        let silent = vec![0.0f32; sr as usize]; // 1 s of digital silence
        let a = analyze_pcm(&silent, sr, BeatOptions::default());
        assert_eq!(a.onsets.len(), 0, "silence has no onsets");
        assert_eq!(a.confidence, 0.0, "silence gives zero confidence");

        let empty = analyze_pcm(&[], sr, BeatOptions::default());
        assert_eq!(empty.bpm, 0.0);
        assert!(empty.onsets.is_empty());

        // A zero sample-rate is rejected without panicking.
        let bad = analyze_pcm(&silent, 0, BeatOptions::default());
        assert_eq!(bad.bpm, 0.0);
    }

    #[test]
    fn half_and_double_tempo_stay_in_band() {
        // 90 and 160 BPM both sit inside the default 60..200 band and should be
        // recovered near-truth (guards against octave/lag-off-by-one errors).
        let sr = 44_100u32;
        for &truth in &[90.0f32, 160.0f32] {
            let pcm = click_track(sr, truth, 5.0);
            let a = analyze_pcm(&pcm, sr, BeatOptions::default());
            assert!((a.bpm - truth).abs() <= 8.0, "expected ~{truth} BPM, got {}", a.bpm);
        }
    }

    #[test]
    fn analyze_beats_decodes_and_analyses_a_wav() {
        // End-to-end over the real probe+decode path: a 128 BPM click track WAV.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("beat.wav");
        let sr = 44_100u32;
        let pcm = click_track(sr, 128.0, 5.0);
        let samples: Vec<i16> = pcm.iter().map(|&s| (s * 30_000.0) as i16).collect();
        write_wav(&path, sr, &samples);

        let a = analyze_beats(path.to_str().unwrap(), BeatOptions::default()).unwrap();
        assert_eq!(a.sample_rate, sr);
        assert!((a.bpm - 128.0).abs() <= 8.0, "expected ~128 BPM, got {}", a.bpm);
        assert!(!a.onsets.is_empty(), "click track should yield onsets");
    }

    /// A pure sine at frequency `hz` for `seconds`, amplitude 0.7.
    fn sine(sample_rate: u32, hz: f32, seconds: f32) -> Vec<f32> {
        let n = (sample_rate as f32 * seconds) as usize;
        (0..n)
            .map(|i| 0.7 * (2.0 * std::f32::consts::PI * hz * i as f32 / sample_rate as f32).sin())
            .collect()
    }

    #[test]
    fn chroma_peaks_at_the_played_pitch() {
        // A4 = 440 Hz → pitch class 9 (A) should dominate the chromagram.
        let sr = 44_100u32;
        let pcm = sine(sr, 440.0, 3.0);
        let chroma = chroma_from_pcm(&pcm, sr);
        let (max_pc, _) = chroma
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
            .unwrap();
        assert_eq!(max_pc, 9, "A4 should peak pitch class A; chroma = {chroma:?}");

        // C4 = ~261.63 Hz → pitch class 0 (C).
        let c = chroma_from_pcm(&sine(sr, 261.63, 3.0), sr);
        let (c_pc, _) = c.iter().enumerate().max_by(|a, b| a.1.partial_cmp(b.1).unwrap()).unwrap();
        assert_eq!(c_pc, 0, "C4 should peak pitch class C; chroma = {c:?}");
    }

    #[test]
    fn ks_identifies_major_and_minor_profiles() {
        // Feeding the KS profile rotated to a tonic must recover that exact key.
        let mut g_major = [0.0f32; 12];
        for i in 0..12 {
            g_major[(7 + i) % 12] = KS_MAJOR[i]; // tonic G = pc 7
        }
        let (tonic, minor, corr) = detect_key_from_chroma(&g_major);
        assert_eq!((tonic, minor), (7, false), "expected G major");
        assert!(corr > 0.99, "self-correlation should be ~1, got {corr}");

        let mut d_minor = [0.0f32; 12];
        for i in 0..12 {
            d_minor[(2 + i) % 12] = KS_MINOR[i]; // tonic D = pc 2
        }
        let (tonic, minor, _) = detect_key_from_chroma(&d_minor);
        assert_eq!((tonic, minor), (2, true), "expected D minor");
    }

    #[test]
    fn detect_key_pcm_on_silence_is_indeterminate() {
        let sr = 44_100u32;
        let k = detect_key_pcm(&vec![0.0f32; sr as usize], sr);
        assert_eq!(k.key, "", "silence has no key");
        assert_eq!(k.confidence, 0.0);
    }

    #[test]
    fn detect_key_pcm_finds_a_tonal_centre() {
        // A C-major triad (C4+E4+G4) is tonally unambiguous enough to name.
        let sr = 44_100u32;
        let n = (sr as f32 * 3.0) as usize;
        let mut pcm = vec![0.0f32; n];
        for (i, s) in pcm.iter_mut().enumerate() {
            let t = i as f32 / sr as f32;
            let tau = 2.0 * std::f32::consts::PI * t;
            *s = 0.3 * ((tau * 261.63).sin() + (tau * 329.63).sin() + (tau * 392.0).sin());
        }
        let k = detect_key_pcm(&pcm, sr);
        assert!(!k.key.is_empty(), "a triad should resolve to some key");
        assert!(k.confidence > 0.0, "confidence should be positive");
        // The strongest pitch classes must be the chord tones C/E/G.
        let chroma = chroma_from_pcm(&pcm, sr);
        let mut idx: Vec<usize> = (0..12).collect();
        idx.sort_by(|&a, &b| chroma[b].partial_cmp(&chroma[a]).unwrap());
        let top3: std::collections::HashSet<usize> = idx.into_iter().take(3).collect();
        for pc in [0usize, 4, 7] {
            assert!(top3.contains(&pc), "chord tone {pc} should be in the top-3 chroma");
        }
    }

    #[test]
    fn detects_a_silent_gap_between_tones() {
        // 0.5 s tone, 1.0 s silence, 0.5 s tone at 8 kHz.
        let sr = 8_000u32;
        let mut pcm = sine(sr, 440.0, 0.5);
        pcm.extend(std::iter::repeat(0.0f32).take(sr as usize)); // 1.0 s silence
        pcm.extend(sine(sr, 440.0, 0.5));

        let plan = plan_silence_removal(&pcm, sr, SilenceOptions::default());
        assert_eq!(plan.remove.len(), 1, "exactly one silent gap");
        let gap = &plan.remove[0];
        // The gap sits around [0.5, 1.5] s, shrunk by 0.05 s padding each side.
        assert!((gap.start_sec - 0.55).abs() < 0.06, "gap start ~0.55s, got {}", gap.start_sec);
        assert!((gap.end_sec - 1.45).abs() < 0.06, "gap end ~1.45s, got {}", gap.end_sec);
        assert!(plan.removed_sec > 0.8 && plan.removed_sec < 1.0, "removed ~0.9s, got {}", plan.removed_sec);
        assert!(plan.keep.len() >= 2, "audio either side of the gap is kept");
    }

    #[test]
    fn no_silence_in_a_continuous_tone() {
        let sr = 8_000u32;
        let plan = plan_silence_removal(&sine(sr, 440.0, 2.0), sr, SilenceOptions::default());
        assert!(plan.remove.is_empty(), "a continuous tone has no silence to cut");
        assert_eq!(plan.removed_sec, 0.0);
    }

    #[test]
    fn loudness_ranks_tone_above_silence() {
        let sr = 44_100u32;
        // A near-full-scale tone is far louder than digital silence.
        let mut loud = sine(sr, 1000.0, 3.0);
        for s in loud.iter_mut() {
            *s *= 1.0 / 0.7; // normalise the 0.7-amplitude sine to ~full scale
        }
        let tone = analyze_loudness_pcm(&loud, sr);
        let quiet = analyze_loudness_pcm(&vec![0.0f32; (sr * 3) as usize], sr);

        assert!(tone.lufs > quiet.lufs + 30.0, "tone {} ≫ silence {}", tone.lufs, quiet.lufs);
        assert_eq!(quiet.lufs, LUFS_SILENCE_FLOOR, "silence floors at -70 LUFS");
        assert_eq!(quiet.peak_dbfs, -120.0, "silence peak floors at -120 dBFS");
        // A ~0 dBFS sine measures near 0 dBFS peak and in a sane LUFS range.
        assert!(tone.peak_dbfs > -1.0, "full-scale peak ~0 dBFS, got {}", tone.peak_dbfs);
        assert!(tone.lufs > -10.0 && tone.lufs < 3.0, "1kHz full-scale ~-3 LUFS, got {}", tone.lufs);
    }

    #[test]
    fn analyze_loudness_over_wav_decodes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tone.wav");
        let sr = 44_100u32;
        let pcm = sine(sr, 1000.0, 2.0);
        let samples: Vec<i16> = pcm.iter().map(|&s| (s * 30_000.0) as i16).collect();
        write_wav(&path, sr, &samples);
        let r = analyze_loudness(path.to_str().unwrap()).unwrap();
        assert_eq!(r.sample_rate, sr);
        assert!(r.lufs > -30.0, "a 1kHz tone should not read as near-silent, got {}", r.lufs);
    }
}
