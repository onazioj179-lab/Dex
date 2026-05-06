// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// DEX Native — Video Metadata
// Provides: video container parsing, codec detection, duration extraction
// Parses MP4/MOV containers natively without ffmpeg dependency
// ═══════════════════════════════════════════════════════════════════════════

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::path::Path;
use std::io::{Read, Seek, SeekFrom};

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

#[napi(object)]
#[derive(Clone)]
pub struct VideoMetadata {
    pub duration_secs: f64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub codec: String,
    pub audio_codec: String,
    pub audio_channels: u32,
    pub audio_sample_rate: u32,
    pub bitrate_kbps: f64,
    pub file_size: f64,
    pub container: String,
    pub has_audio: bool,
    pub has_video: bool,
}

#[napi(object)]
#[derive(Clone)]
pub struct MediaProbeResult {
    pub media_type: String,
    pub playable: bool,
    pub width: u32,
    pub height: u32,
    pub duration_secs: f64,
    pub codec: String,
    pub file_size: f64,
}

// ─────────────────────────────────────────────────────────────────────────
// MP4/MOV Box Parser (minimal, no external crate needed)
// ─────────────────────────────────────────────────────────────────────────

/// Read a big-endian u32 from 4 bytes.
fn read_be_u32(buf: &[u8]) -> u32 {
    ((buf[0] as u32) << 24)
        | ((buf[1] as u32) << 16)
        | ((buf[2] as u32) << 8)
        | (buf[3] as u32)
}

/// Read a big-endian u16 from 2 bytes.
fn read_be_u16(buf: &[u8]) -> u16 {
    ((buf[0] as u16) << 8) | (buf[1] as u16)
}

/// Read a big-endian u64 from 8 bytes.
fn read_be_u64(buf: &[u8]) -> u64 {
    ((buf[0] as u64) << 56)
        | ((buf[1] as u64) << 48)
        | ((buf[2] as u64) << 40)
        | ((buf[3] as u64) << 32)
        | ((buf[4] as u64) << 24)
        | ((buf[5] as u64) << 16)
        | ((buf[6] as u64) << 8)
        | (buf[7] as u64)
}

/// Fixed-point 16.16 to f64.
fn fixed_16_16(val: u32) -> f64 {
    (val >> 16) as f64 + (val & 0xFFFF) as f64 / 65536.0
}

struct Mp4Info {
    duration_secs: f64,
    timescale: u32,
    width: u32,
    height: u32,
    fps: f64,
    video_codec: String,
    audio_codec: String,
    audio_channels: u32,
    audio_sample_rate: u32,
    has_video: bool,
    has_audio: bool,
}

/// Parse MP4/MOV at top-level boxes to extract metadata.
fn parse_mp4(path: &Path) -> std::io::Result<Mp4Info> {
    let mut f = std::fs::File::open(path)?;
    let file_len = f.metadata()?.len();
    let mut info = Mp4Info {
        duration_secs: 0.0,
        timescale: 1,
        width: 0,
        height: 0,
        fps: 0.0,
        video_codec: String::new(),
        audio_codec: String::new(),
        audio_channels: 0,
        audio_sample_rate: 0,
        has_video: false,
        has_audio: false,
    };

    parse_boxes(&mut f, 0, file_len, &mut info, 0)?;
    Ok(info)
}

/// Recursively parse MP4 boxes up to a max depth.
fn parse_boxes(
    f: &mut std::fs::File,
    start: u64,
    end: u64,
    info: &mut Mp4Info,
    depth: u32,
) -> std::io::Result<()> {
    if depth > 8 {
        return Ok(());
    }
    let mut pos = start;
    let mut header = [0u8; 8];

    while pos + 8 <= end {
        f.seek(SeekFrom::Start(pos))?;
        if f.read_exact(&mut header).is_err() {
            break;
        }

        let mut box_size = read_be_u32(&header[0..4]) as u64;
        let box_type = std::str::from_utf8(&header[4..8])
            .unwrap_or("????")
            .to_owned();

        if box_size == 1 {
            // 64-bit extended size
            let mut ext = [0u8; 8];
            f.read_exact(&mut ext)?;
            box_size = read_be_u64(&ext);
        } else if box_size == 0 {
            box_size = end - pos;
        }

        if box_size < 8 || pos + box_size > end {
            break;
        }

        let content_start = pos + 8;
        let box_end = pos + box_size;

        match box_type.as_str() {
            // Container boxes — recurse into them
            "moov" | "trak" | "mdia" | "minf" | "stbl" | "edts" | "dinf" => {
                parse_boxes(f, content_start, box_end, info, depth + 1)?;
            }
            // Movie header — global timescale + duration
            "mvhd" => {
                let mut buf = [0u8; 108];
                f.seek(SeekFrom::Start(content_start))?;
                let bytes_read = f.read(&mut buf)?;
                if bytes_read >= 24 {
                    let version = buf[0];
                    if version == 0 {
                        info.timescale = read_be_u32(&buf[12..16]);
                        let dur = read_be_u32(&buf[16..20]);
                        if info.timescale > 0 {
                            info.duration_secs = dur as f64 / info.timescale as f64;
                        }
                    } else if bytes_read >= 32 {
                        info.timescale = read_be_u32(&buf[20..24]);
                        let dur = read_be_u64(&buf[24..32]);
                        if info.timescale > 0 {
                            info.duration_secs = dur as f64 / info.timescale as f64;
                        }
                    }
                }
            }
            // Handler reference — tells us if track is video or audio
            "hdlr" => {
                let mut buf = [0u8; 20];
                f.seek(SeekFrom::Start(content_start))?;
                if f.read(&mut buf)? >= 12 {
                    let handler = std::str::from_utf8(&buf[8..12]).unwrap_or("");
                    match handler {
                        "vide" => info.has_video = true,
                        "soun" => info.has_audio = true,
                        _ => {}
                    }
                }
            }
            // Sample description — codec type + dimensions
            "stsd" => {
                let mut buf = [0u8; 128];
                f.seek(SeekFrom::Start(content_start))?;
                let bytes_read = f.read(&mut buf)?;
                if bytes_read >= 16 {
                    // Skip version(4) + entry_count(4)
                    let entry_type = std::str::from_utf8(&buf[12..16]).unwrap_or("");
                    let et_lower = entry_type.to_lowercase();
                    if ["avc1", "avc3", "hev1", "hvc1", "mp4v", "vp09", "av01"]
                        .contains(&et_lower.as_str())
                    {
                        info.video_codec = et_lower.clone();
                        // Width/height at offset 32+24=+40 from entry start (entry start=8)
                        if bytes_read >= 48 {
                            info.width = read_be_u16(&buf[40..42]) as u32;
                            info.height = read_be_u16(&buf[42..44]) as u32;
                        }
                    } else if ["mp4a", "ac-3", "ec-3", "alac", "fLaC", "Opus"]
                        .iter()
                        .any(|c| c.eq_ignore_ascii_case(entry_type))
                    {
                        info.audio_codec = et_lower;
                        if bytes_read >= 28 {
                            info.audio_channels = read_be_u16(&buf[24..26]) as u32;
                        }
                        if bytes_read >= 36 {
                            info.audio_sample_rate =
                                (read_be_u32(&buf[32..36]) >> 16).max(1);
                        }
                    }
                }
            }
            // Sample-to-chunk and time-to-sample: we can estimate FPS from stts
            "stts" => {
                let mut buf = [0u8; 24];
                f.seek(SeekFrom::Start(content_start))?;
                if f.read(&mut buf)? >= 16 && info.has_video {
                    let entry_count = read_be_u32(&buf[4..8]);
                    if entry_count >= 1 {
                        let _sample_count = read_be_u32(&buf[8..12]);
                        let sample_delta = read_be_u32(&buf[12..16]);
                        if sample_delta > 0 && info.timescale > 0 {
                            info.fps = info.timescale as f64 / sample_delta as f64;
                        }
                    }
                }
            }
            // Track header — width/height (if not found in stsd)
            "tkhd" => {
                let mut buf = [0u8; 92];
                f.seek(SeekFrom::Start(content_start))?;
                let bytes_read = f.read(&mut buf)?;
                if bytes_read >= 84 {
                    let version = buf[0];
                    let offset = if version == 0 { 76 } else { 88 };
                    if bytes_read >= offset + 8 {
                        let w = fixed_16_16(read_be_u32(&buf[offset..offset + 4])) as u32;
                        let h = fixed_16_16(read_be_u32(&buf[offset + 4..offset + 8])) as u32;
                        if w > 0 && h > 0 && info.width == 0 {
                            info.width = w;
                            info.height = h;
                        }
                    }
                }
            }
            _ => {}
        }

        pos += box_size;
    }

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────
// Exported Functions
// ─────────────────────────────────────────────────────────────────────────

/// Get metadata from a video file. Currently supports MP4/MOV containers natively.
/// For other formats, returns basic info from file size estimation.
#[napi]
pub fn get_video_metadata(file_path: String) -> Result<VideoMetadata> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(Error::from_reason(format!("File not found: {}", file_path)));
    }

    let file_size = std::fs::metadata(path)
        .map(|m| m.len() as f64)
        .unwrap_or(0.0);

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let container = match ext.as_str() {
        "mp4" | "m4v" => "mp4",
        "mov" => "mov",
        "mkv" => "mkv",
        "avi" => "avi",
        "webm" => "webm",
        "wmv" => "wmv",
        "flv" => "flv",
        _ => "unknown",
    };

    // MP4/MOV: full native parsing
    if ext == "mp4" || ext == "m4v" || ext == "mov" {
        match parse_mp4(path) {
            Ok(info) => {
                let bitrate_kbps = if info.duration_secs > 0.0 {
                    (file_size * 8.0) / (info.duration_secs * 1000.0)
                } else {
                    0.0
                };

                return Ok(VideoMetadata {
                    duration_secs: info.duration_secs,
                    width: info.width,
                    height: info.height,
                    fps: if info.fps > 0.0 { info.fps } else { 30.0 },
                    codec: if info.video_codec.is_empty() {
                        "h264".into()
                    } else {
                        info.video_codec
                    },
                    audio_codec: if info.audio_codec.is_empty() {
                        "aac".into()
                    } else {
                        info.audio_codec
                    },
                    audio_channels: info.audio_channels.max(2),
                    audio_sample_rate: if info.audio_sample_rate > 0 {
                        info.audio_sample_rate
                    } else {
                        44100
                    },
                    bitrate_kbps,
                    file_size,
                    container: container.into(),
                    has_audio: info.has_audio,
                    has_video: info.has_video,
                });
            }
            Err(_) => {
                // Fall through to estimation
            }
        }
    }

    // Fallback for non-MP4 containers: estimate from file size
    let estimated_bitrate = 5000.0; // kbps
    let duration_secs = (file_size * 8.0) / (estimated_bitrate * 1000.0);

    Ok(VideoMetadata {
        duration_secs,
        width: 1920,
        height: 1080,
        fps: 30.0,
        codec: match ext.as_str() {
            "webm" => "vp9".into(),
            "wmv" => "wmv".into(),
            "flv" => "h264".into(),
            "avi" => "mpeg4".into(),
            "mkv" => "h264".into(),
            _ => "unknown".into(),
        },
        audio_codec: "aac".into(),
        audio_channels: 2,
        audio_sample_rate: 44100,
        bitrate_kbps: estimated_bitrate,
        file_size,
        container: container.into(),
        has_audio: true,
        has_video: true,
    })
}

/// Quick probe: determine media type and basic playability info.
#[napi]
pub fn probe_media_file(file_path: String) -> Result<MediaProbeResult> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(Error::from_reason(format!("File not found: {}", file_path)));
    }

    let file_size = std::fs::metadata(path)
        .map(|m| m.len() as f64)
        .unwrap_or(0.0);

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let (media_type, playable) = match ext.as_str() {
        // Video
        "mp4" | "m4v" | "mov" | "webm" => ("video", true),
        "mkv" | "avi" | "wmv" | "flv" => ("video", false), // Not natively playable in Chromium
        // Audio
        "mp3" | "wav" | "ogg" | "flac" | "aac" | "m4a" | "opus" => ("audio", true),
        "wma" | "aiff" | "aif" => ("audio", false),
        // Image
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "svg" | "bmp" | "ico" | "avif" => {
            ("image", true)
        }
        "tiff" | "tif" | "raw" | "cr2" | "nef" | "arw" | "dng" => ("image", false),
        _ => ("unknown", false),
    };

    // For video files, try to get real metadata
    if media_type == "video" && (ext == "mp4" || ext == "m4v" || ext == "mov") {
        if let Ok(info) = parse_mp4(path) {
            return Ok(MediaProbeResult {
                media_type: media_type.into(),
                playable,
                width: info.width,
                height: info.height,
                duration_secs: info.duration_secs,
                codec: info.video_codec,
                file_size,
            });
        }
    }

    // For images, try to get dimensions
    if media_type == "image" {
        if let Ok(reader) = image::ImageReader::open(path) {
            if let Ok(reader) = reader.with_guessed_format() {
                if let Ok(dims) = reader.into_dimensions() {
                    return Ok(MediaProbeResult {
                        media_type: media_type.into(),
                        playable,
                        width: dims.0,
                        height: dims.1,
                        duration_secs: 0.0,
                        codec: ext.clone(),
                        file_size,
                    });
                }
            }
        }
    }

    Ok(MediaProbeResult {
        media_type: media_type.into(),
        playable,
        width: 0,
        height: 0,
        duration_secs: 0.0,
        codec: ext,
        file_size,
    })
}
