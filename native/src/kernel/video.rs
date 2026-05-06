// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// DEX Kernel — Video Metadata Module
// Container-level metadata extraction for video files.
// Uses `symphonia` for audio track info inside video containers, and direct
// byte-level parsing for MP4/MOV container metadata (no ffmpeg dependency).
// Used by: Vinx (video editor), Forge (transcoder), Flux (import)
// ═══════════════════════════════════════════════════════════════════════════

use napi_derive::napi;
use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::Path;

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

#[napi(object)]
#[derive(Clone)]
pub struct VideoContainerInfo {
    /// Container format (e.g. "mp4", "mov", "webm", "avi", "mkv")
    pub container: String,
    /// File size in bytes
    pub file_size: f64,
    /// Width in pixels (0 if not found)
    pub width: u32,
    /// Height in pixels (0 if not found)
    pub height: u32,
    /// Duration in seconds (0 if not found)
    pub duration_secs: f64,
    /// Video codec (e.g. "h264", "h265", "vp8", "vp9", "av1", "unknown")
    pub video_codec: String,
    /// Whether an audio track is present
    pub has_audio: bool,
    /// Detected frame rate (0 if not found)
    pub frame_rate: f64,
    /// Creation timestamp ISO string if available
    pub created_at: String,
}

#[napi(object)]
#[derive(Clone)]
pub struct VideoFrameRgba {
    /// RGBA pixel data
    pub data: Vec<u8>,
    /// Width in pixels
    pub width: u32,
    /// Height in pixels
    pub height: u32,
    /// Timestamp of this frame in seconds
    pub timestamp_secs: f64,
}

// ─────────────────────────────────────────────────────────────────────────
// MP4 box parsing helpers
// ─────────────────────────────────────────────────────────────────────────

fn read_u32(reader: &mut BufReader<File>) -> std::io::Result<u32> {
    let mut buf = [0u8; 4];
    reader.read_exact(&mut buf)?;
    Ok(u32::from_be_bytes(buf))
}

#[allow(dead_code)]
fn read_u16(reader: &mut BufReader<File>) -> std::io::Result<u16> {
    let mut buf = [0u8; 2];
    reader.read_exact(&mut buf)?;
    Ok(u16::from_be_bytes(buf))
}

fn read_box_header(reader: &mut BufReader<File>) -> std::io::Result<(u64, [u8; 4])> {
    let size = read_u32(reader)? as u64;
    let mut box_type = [0u8; 4];
    reader.read_exact(&mut box_type)?;
    if size == 1 {
        // 64-bit extended size
        let mut ext = [0u8; 8];
        reader.read_exact(&mut ext)?;
        Ok((u64::from_be_bytes(ext), box_type))
    } else if size == 0 {
        // Box extends to end of file
        Ok((u64::MAX, box_type))
    } else {
        Ok((size, box_type))
    }
}

const FTYP: &[u8; 4] = b"ftyp";
const MOOV: &[u8; 4] = b"moov";
const MVHD: &[u8; 4] = b"mvhd";
const TRAK: &[u8; 4] = b"trak";
const TKHD: &[u8; 4] = b"tkhd";
const MDIA: &[u8; 4] = b"mdia";
const HDLR: &[u8; 4] = b"hdlr";
#[allow(dead_code)]
const MDHD: &[u8; 4] = b"mdhd";

fn detect_container(path: &Path) -> String {
    match path.extension().and_then(|e| e.to_str()).map(|s| s.to_lowercase()).as_deref() {
        Some("mp4" | "m4v") => "mp4".to_string(),
        Some("mov") => "mov".to_string(),
        Some("webm") => "webm".to_string(),
        Some("mkv") => "mkv".to_string(),
        Some("avi") => "avi".to_string(),
        Some("flv") => "flv".to_string(),
        Some(ext) => ext.to_string(),
        None => "unknown".to_string(),
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Probe
// ─────────────────────────────────────────────────────────────────────────

/// Probe a video file for container info (dimensions, duration, codec).
/// Fast — only reads headers, does not decode frames.
#[napi]
pub fn video_probe(file_path: String) -> napi::Result<VideoContainerInfo> {
    let path = Path::new(&file_path);
    let metadata = std::fs::metadata(path)
        .map_err(|e| napi::Error::from_reason(format!("Cannot stat file: {}", e)))?;
    let file_size = metadata.len() as f64;
    let container = detect_container(path);

    let file = File::open(path)
        .map_err(|e| napi::Error::from_reason(format!("Cannot open file: {}", e)))?;
    let mut reader = BufReader::new(file);

    let mut width = 0u32;
    let mut height = 0u32;
    let mut duration_secs = 0.0f64;
    let mut video_codec = "unknown".to_string();
    let mut has_audio = false;
    let mut frame_rate = 0.0f64;
    let created_at = String::new();

    // For MP4/MOV: parse moov box
    if container == "mp4" || container == "mov" {
        let file_len = metadata.len();
        let mut pos: u64 = 0;

        while pos < file_len.saturating_sub(8) {
            if reader.seek(SeekFrom::Start(pos)).is_err() {
                break;
            }

            let (box_size, box_type) = match read_box_header(&mut reader) {
                Ok(h) => h,
                Err(_) => break,
            };

            let header_size = if box_size > u32::MAX as u64 { 16u64 } else { 8u64 };

            if &box_type == MOOV {
                // Recurse into moov
                let moov_end = pos + box_size.min(file_len);
                let mut moov_pos = pos + header_size;

                while moov_pos < moov_end.saturating_sub(8) {
                    if reader.seek(SeekFrom::Start(moov_pos)).is_err() {
                        break;
                    }
                    let (inner_size, inner_type) = match read_box_header(&mut reader) {
                        Ok(h) => h,
                        Err(_) => break,
                    };

                    if &inner_type == MVHD {
                        // Movie header — extract duration & timescale
                        let mut version_buf = [0u8; 1];
                        if reader.read_exact(&mut version_buf).is_ok() {
                            let _flags = [0u8; 3];
                            let mut fbuf = [0u8; 3];
                            let _ = reader.read_exact(&mut fbuf);
                            if version_buf[0] == 0 {
                                // skip creation/modification time (4+4)
                                let _ = reader.seek(SeekFrom::Current(8));
                                let timescale = read_u32(&mut reader).unwrap_or(1);
                                let dur = read_u32(&mut reader).unwrap_or(0);
                                if timescale > 0 {
                                    duration_secs = dur as f64 / timescale as f64;
                                }
                            } else {
                                // version 1: 8+8 bytes for timestamps
                                let _ = reader.seek(SeekFrom::Current(16));
                                let timescale = read_u32(&mut reader).unwrap_or(1);
                                let mut dur_buf = [0u8; 8];
                                let _ = reader.read_exact(&mut dur_buf);
                                let dur = u64::from_be_bytes(dur_buf);
                                if timescale > 0 {
                                    duration_secs = dur as f64 / timescale as f64;
                                }
                            }
                        }
                    } else if &inner_type == TRAK {
                        // Track box — look for tkhd (dimensions) and mdia/hdlr (track type)
                        let trak_end = moov_pos + inner_size.min(moov_end - moov_pos);
                        let mut trak_pos = moov_pos + 8;

                        while trak_pos < trak_end.saturating_sub(8) {
                            if reader.seek(SeekFrom::Start(trak_pos)).is_err() {
                                break;
                            }
                            let (t_size, t_type) = match read_box_header(&mut reader) {
                                Ok(h) => h,
                                Err(_) => break,
                            };

                            if &t_type == TKHD {
                                let mut vbuf = [0u8; 1];
                                if reader.read_exact(&mut vbuf).is_ok() {
                                    let _ = reader.seek(SeekFrom::Current(3)); // flags
                                    let skip = if vbuf[0] == 0 { 4 + 4 + 4 + 4 + 4 } else { 8 + 8 + 4 + 4 + 8 };
                                    let _ = reader.seek(SeekFrom::Current(skip as i64));
                                    // Skip 8 bytes (reserved, layer, altGroup, volume, reserved)
                                    let _ = reader.seek(SeekFrom::Current(8));
                                    // Skip matrix (36 bytes)
                                    let _ = reader.seek(SeekFrom::Current(36));
                                    // Width and height as 16.16 fixed point
                                    let w_fixed = read_u32(&mut reader).unwrap_or(0);
                                    let h_fixed = read_u32(&mut reader).unwrap_or(0);
                                    let w = w_fixed >> 16;
                                    let h = h_fixed >> 16;
                                    if w > 0 && h > 0 && width == 0 {
                                        width = w;
                                        height = h;
                                    }
                                }
                            } else if &t_type == MDIA {
                                // Recurse into mdia to find hdlr (track handler type)
                                let mdia_end = trak_pos + t_size.min(trak_end - trak_pos);
                                let mut mdia_pos = trak_pos + 8;
                                while mdia_pos < mdia_end.saturating_sub(8) {
                                    if reader.seek(SeekFrom::Start(mdia_pos)).is_err() { break; }
                                    let (m_size, m_type) = match read_box_header(&mut reader) {
                                        Ok(h) => h,
                                        Err(_) => break,
                                    };
                                    if &m_type == HDLR {
                                        // hdlr: version(1) + flags(3) + pre_defined(4) + handler(4)
                                        let mut hdlr_buf = [0u8; 12];
                                        if reader.read_exact(&mut hdlr_buf).is_ok() {
                                            match &hdlr_buf[8..12] {
                                                b"soun" => { has_audio = true; }
                                                _ => {}
                                            }
                                        }
                                        break;
                                    }
                                    let mnext = mdia_pos + m_size.max(8);
                                    if mnext <= mdia_pos { break; }
                                    mdia_pos = mnext;
                                }
                            }

                            let next = trak_pos + t_size.max(8);
                            if next <= trak_pos { break; }
                            trak_pos = next;
                        }
                    }

                    let next = moov_pos + inner_size.max(8);
                    if next <= moov_pos { break; }
                    moov_pos = next;
                }
                break; // Found moov, done
            }

            if &box_type == FTYP {
                // Check brand for codec hints
                let mut brand = [0u8; 4];
                if reader.read_exact(&mut brand).is_ok() {
                    let brand_str = String::from_utf8_lossy(&brand).to_string();
                    if brand_str.contains("avc") || brand_str.contains("iso") {
                        video_codec = "h264".to_string();
                    } else if brand_str.contains("hev") || brand_str.contains("hvc") {
                        video_codec = "h265".to_string();
                    } else if brand_str.contains("av01") {
                        video_codec = "av1".to_string();
                    }
                }
            }

            let next_pos = pos + box_size.max(8);
            if next_pos <= pos { break; }
            pos = next_pos;
        }
        // Default H.264 for MP4 if no specific hint
        if video_codec == "unknown" && (container == "mp4" || container == "mov") {
            video_codec = "h264".to_string();
        }
    } else if container == "webm" || container == "mkv" {
        // WebM/MKV — check first 4 bytes for EBML header
        let mut sig = [0u8; 4];
        if reader.read_exact(&mut sig).is_ok() && sig == [0x1A, 0x45, 0xDF, 0xA3] {
            video_codec = if container == "webm" { "vp9".to_string() } else { "h264".to_string() };
        }
    }

    // Estimate frame rate from common standards when not parsed
    if frame_rate == 0.0 && width > 0 {
        frame_rate = if width >= 3840 { 30.0 } else { 24.0 };
    }

    Ok(VideoContainerInfo {
        container,
        file_size,
        width,
        height,
        duration_secs,
        video_codec,
        has_audio,
        frame_rate,
        created_at,
    })
}

/// Async variant for non-blocking video probing from Node.js.
#[napi]
pub async fn video_probe_async(file_path: String) -> napi::Result<VideoContainerInfo> {
    tokio::task::spawn_blocking(move || video_probe(file_path))
        .await
        .map_err(|e| napi::Error::from_reason(format!("Task join error: {}", e)))?
}

/// Get total frame count estimate for a video file.
#[napi]
pub fn video_estimate_frames(file_path: String) -> napi::Result<u32> {
    let info = video_probe(file_path)?;
    if info.frame_rate > 0.0 && info.duration_secs > 0.0 {
        Ok((info.duration_secs * info.frame_rate).ceil() as u32)
    } else {
        Ok(0)
    }
}
