// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// DEX Kernel — Media Decoding Module
// FFmpeg-free audio decoding using the pure-Rust `symphonia` crate.
// Supports: MP3, FLAC, OGG/Vorbis, AAC, WAV/PCM
// Used by: Imosion (DAW), Vinx (video editor), Forge (transcoder)
// ═══════════════════════════════════════════════════════════════════════════

use napi_derive::napi;
use std::fs::File;
use std::path::Path;

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

#[napi(object)]
#[derive(Clone)]
pub struct DecodedAudio {
    /// Interleaved f64 samples (all channels)
    pub samples: Vec<f64>,
    /// Sample rate in Hz
    pub sample_rate: u32,
    /// Number of channels
    pub channels: u32,
    /// Total number of frames (samples per channel)
    pub num_frames: u32,
    /// Duration in seconds
    pub duration_secs: f64,
    /// Detected codec name
    pub codec: String,
}

#[napi(object)]
#[derive(Clone)]
pub struct AudioProbeResult {
    /// Codec name (e.g. "mp3", "flac", "vorbis", "aac", "pcm")
    pub codec: String,
    /// Sample rate
    pub sample_rate: u32,
    /// Number of channels
    pub channels: u32,
    /// Duration in seconds (estimated from stream if available)
    pub duration_secs: f64,
    /// Bit rate in kbps (0 if unknown)
    pub bitrate_kbps: u32,
}

// ─────────────────────────────────────────────────────────────────────────
// Probe (fast metadata without full decode)
// ─────────────────────────────────────────────────────────────────────────

/// Quickly probe an audio file for metadata without decoding.
/// Returns codec, sample rate, channels, duration, and bitrate.
#[napi]
pub fn media_probe_audio(file_path: String) -> napi::Result<AudioProbeResult> {
    let path = Path::new(&file_path);
    let file = File::open(path)
        .map_err(|e| napi::Error::from_reason(format!("Cannot open file: {}", e)))?;

    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| napi::Error::from_reason(format!("Probe failed: {}", e)))?;

    let format = probed.format;
    let track = format.default_track()
        .ok_or_else(|| napi::Error::from_reason("No audio track found"))?;

    let codec_params = &track.codec_params;
    let sample_rate = codec_params.sample_rate.unwrap_or(44100);
    let channels = codec_params.channels.map(|c| c.count() as u32).unwrap_or(2);

    let duration_secs = if let Some(n_frames) = codec_params.n_frames {
        n_frames as f64 / sample_rate as f64
    } else if let Some(tb) = track.codec_params.time_base {
        let dur = codec_params.n_frames.unwrap_or(0);
        dur as f64 * tb.numer as f64 / tb.denom as f64
    } else {
        0.0
    };

    let bitrate_kbps = codec_params.bits_per_sample
        .map(|bps| (bps * sample_rate * channels) / 1000)
        .unwrap_or(0);

    let codec_name = match codec_params.codec {
        symphonia::core::codecs::CODEC_TYPE_MP3 => "mp3",
        symphonia::core::codecs::CODEC_TYPE_FLAC => "flac",
        symphonia::core::codecs::CODEC_TYPE_VORBIS => "vorbis",
        symphonia::core::codecs::CODEC_TYPE_AAC => "aac",
        symphonia::core::codecs::CODEC_TYPE_PCM_S16LE
        | symphonia::core::codecs::CODEC_TYPE_PCM_S24LE
        | symphonia::core::codecs::CODEC_TYPE_PCM_S32LE
        | symphonia::core::codecs::CODEC_TYPE_PCM_F32LE => "pcm",
        _ => "unknown",
    };

    Ok(AudioProbeResult {
        codec: codec_name.to_string(),
        sample_rate,
        channels,
        duration_secs,
        bitrate_kbps,
    })
}

// ─────────────────────────────────────────────────────────────────────────
// Full Decode (samples as f64)
// ─────────────────────────────────────────────────────────────────────────

/// Decode an audio file to raw f64 samples (interleaved).
/// Supports MP3, FLAC, OGG/Vorbis, AAC, WAV/PCM.
/// For large files, consider using `media_decode_audio_range` instead.
#[napi]
pub fn media_decode_audio(file_path: String) -> napi::Result<DecodedAudio> {
    media_decode_audio_range(file_path, 0.0, -1.0)
}

/// Decode a range of an audio file to raw f64 samples.
/// start_secs: Start position in seconds (0 = beginning).
/// end_secs: End position in seconds (-1 = end of file).
#[napi]
pub fn media_decode_audio_range(file_path: String, start_secs: f64, end_secs: f64) -> napi::Result<DecodedAudio> {
    let path = Path::new(&file_path);
    let file = File::open(path)
        .map_err(|e| napi::Error::from_reason(format!("Cannot open file: {}", e)))?;

    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| napi::Error::from_reason(format!("Probe failed: {}", e)))?;

    let mut format = probed.format;
    let track = format.default_track()
        .ok_or_else(|| napi::Error::from_reason("No audio track found"))?;

    let track_id = track.id;
    let codec_params = track.codec_params.clone();
    let sample_rate = codec_params.sample_rate.unwrap_or(44100);
    let channels = codec_params.channels.map(|c| c.count() as u32).unwrap_or(2);

    let codec_name = match codec_params.codec {
        symphonia::core::codecs::CODEC_TYPE_MP3 => "mp3",
        symphonia::core::codecs::CODEC_TYPE_FLAC => "flac",
        symphonia::core::codecs::CODEC_TYPE_VORBIS => "vorbis",
        symphonia::core::codecs::CODEC_TYPE_AAC => "aac",
        _ => "pcm",
    };

    let mut decoder = symphonia::default::get_codecs()
        .make(&codec_params, &DecoderOptions::default())
        .map_err(|e| napi::Error::from_reason(format!("Decoder init failed: {}", e)))?;

    let start_frame = (start_secs * sample_rate as f64) as u64;
    let end_frame = if end_secs < 0.0 { u64::MAX } else { (end_secs * sample_rate as f64) as u64 };

    let mut all_samples: Vec<f64> = Vec::new();
    let mut total_frames = 0u64;

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(ref e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(_) => break,
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(_) => continue,
        };

        let spec = *decoded.spec();
        let num_ch = spec.channels.count();
        let num_frames_in_packet = decoded.frames();

        // Check if this packet is within our range
        let packet_start = total_frames;
        let packet_end = total_frames + num_frames_in_packet as u64;
        total_frames = packet_end;

        if packet_end <= start_frame {
            continue;
        }
        if packet_start >= end_frame {
            break;
        }

        let mut sample_buf = SampleBuffer::<f32>::new(num_frames_in_packet as u64, spec);
        sample_buf.copy_interleaved_ref(decoded);
        let interleaved = sample_buf.samples();

        // Determine which samples from this packet to keep
        let skip_frames = if packet_start < start_frame {
            (start_frame - packet_start) as usize
        } else {
            0
        };
        let take_frames = if packet_end > end_frame {
            (end_frame - packet_start.max(start_frame)) as usize
        } else {
            num_frames_in_packet - skip_frames
        };

        let skip_samples = skip_frames * num_ch;
        let take_samples = take_frames * num_ch;
        let end_idx = (skip_samples + take_samples).min(interleaved.len());

        for &s in &interleaved[skip_samples..end_idx] {
            all_samples.push(s as f64);
        }
    }

    let num_frames = if channels > 0 {
        all_samples.len() as u32 / channels
    } else {
        0
    };
    let duration_secs = num_frames as f64 / sample_rate as f64;

    Ok(DecodedAudio {
        samples: all_samples,
        sample_rate,
        channels,
        num_frames,
        duration_secs,
        codec: codec_name.to_string(),
    })
}

/// Async variant of media_decode_audio for non-blocking usage from Node.js.
#[napi]
pub async fn media_decode_audio_async(file_path: String) -> napi::Result<DecodedAudio> {
    // Run the blocking decode on a thread pool
    tokio::task::spawn_blocking(move || media_decode_audio(file_path))
        .await
        .map_err(|e| napi::Error::from_reason(format!("Task join error: {}", e)))?
}
