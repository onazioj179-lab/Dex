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
}
