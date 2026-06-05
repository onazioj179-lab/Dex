// =============================================================================
// DEX 6.0 — Native Audio Analysis (GOAL-6C)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Audio metadata + waveform extraction via Symphonia (wav/mp3/flac/ogg/aac/
//! m4a). `metadata()` reads duration/sample-rate/channels + title/artist/album
//! tags; `waveform()` decodes the full stream and downsamples it to N peak
//! amplitudes for a renderer waveform. Pure analysis — playback (a real output
//! sink) is a separate, device-dependent concern handled in the shell.

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

/// Decode the full stream (mono-mixed) and downsample to `buckets` peak values
/// in [0, 1] — a renderer-ready waveform.
pub fn waveform(path: &str, buckets: usize) -> Result<Vec<f32>, String> {
    let mut format = open_format(path)?;

    let (track_id, codec_params, channels) = {
        let track = format.default_track().ok_or("no audio track")?;
        let ch = track.codec_params.channels.map(|c| c.count()).unwrap_or(1).max(1);
        (track.id, track.codec_params.clone(), ch)
    };
    let mut decoder = symphonia::default::get_codecs()
        .make(&codec_params, &DecoderOptions::default())
        .map_err(|e| e.to_string())?;

    let mut samples: Vec<f32> = Vec::new();
    const CAP: usize = 12_000_000; // bound memory/time on very long files
    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(_) => break, // end of stream / IO end
        };
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
                    samples.push(mono);
                }
                if samples.len() >= CAP {
                    break;
                }
            }
            Err(SymphoniaError::DecodeError(_)) => continue, // recoverable
            Err(_) => break,
        }
    }

    Ok(downsample_peaks(&samples, buckets.max(1)))
}

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
}
