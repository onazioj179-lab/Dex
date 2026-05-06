// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// DEX Native — Creative App Utilities
// Fast color math, file hashing, and batch operations for creative apps.
// ═══════════════════════════════════════════════════════════════════════════

use napi_derive::napi;
use rayon::prelude::*;

// ─────────────────────────────────────────────────────────────────────────
// Color Conversion (Prism, Flux, AXL)
// ─────────────────────────────────────────────────────────────────────────

#[napi(object)]
#[derive(Clone)]
pub struct HslColor {
    pub h: f64,
    pub s: f64,
    pub l: f64,
}

#[napi(object)]
#[derive(Clone)]
pub struct RgbColor {
    pub r: u32,
    pub g: u32,
    pub b: u32,
}

#[napi(object)]
#[derive(Clone)]
pub struct ColorInfo {
    pub hex: String,
    pub r: u32,
    pub g: u32,
    pub b: u32,
    pub h: f64,
    pub s: f64,
    pub l: f64,
    pub luminance: f64,
    pub is_dark: bool,
}

/// Convert hex color string to full ColorInfo with RGB, HSL, luminance.
#[napi]
pub fn parse_color(hex: String) -> napi::Result<ColorInfo> {
    let hex = hex.trim_start_matches('#');
    if hex.len() != 6 && hex.len() != 3 {
        return Err(napi::Error::from_reason("Invalid hex color: must be 3 or 6 hex digits"));
    }

    let (r, g, b) = if hex.len() == 3 {
        let chars: Vec<char> = hex.chars().collect();
        (
            u32::from_str_radix(&format!("{}{}", chars[0], chars[0]), 16).unwrap_or(0),
            u32::from_str_radix(&format!("{}{}", chars[1], chars[1]), 16).unwrap_or(0),
            u32::from_str_radix(&format!("{}{}", chars[2], chars[2]), 16).unwrap_or(0),
        )
    } else {
        (
            u32::from_str_radix(&hex[0..2], 16).unwrap_or(0),
            u32::from_str_radix(&hex[2..4], 16).unwrap_or(0),
            u32::from_str_radix(&hex[4..6], 16).unwrap_or(0),
        )
    };

    let rf = r as f64 / 255.0;
    let gf = g as f64 / 255.0;
    let bf = b as f64 / 255.0;

    let max = rf.max(gf).max(bf);
    let min = rf.min(gf).min(bf);
    let delta = max - min;

    let l = (max + min) / 2.0;

    let s = if delta < 1e-10 {
        0.0
    } else {
        delta / (1.0 - (2.0 * l - 1.0).abs())
    };

    let h = if delta < 1e-10 {
        0.0
    } else if (max - rf).abs() < 1e-10 {
        60.0 * (((gf - bf) / delta) % 6.0)
    } else if (max - gf).abs() < 1e-10 {
        60.0 * (((bf - rf) / delta) + 2.0)
    } else {
        60.0 * (((rf - gf) / delta) + 4.0)
    };

    let h = if h < 0.0 { h + 360.0 } else { h };

    // Relative luminance per WCAG 2.0
    let lum_r = if rf <= 0.03928 { rf / 12.92 } else { ((rf + 0.055) / 1.055).powf(2.4) };
    let lum_g = if gf <= 0.03928 { gf / 12.92 } else { ((gf + 0.055) / 1.055).powf(2.4) };
    let lum_b = if bf <= 0.03928 { bf / 12.92 } else { ((bf + 0.055) / 1.055).powf(2.4) };
    let luminance = 0.2126 * lum_r + 0.7152 * lum_g + 0.0722 * lum_b;

    Ok(ColorInfo {
        hex: format!("#{:02x}{:02x}{:02x}", r, g, b),
        r,
        g,
        b,
        h: (h * 10.0).round() / 10.0,
        s: (s * 1000.0).round() / 10.0,
        l: (l * 1000.0).round() / 10.0,
        luminance: (luminance * 10000.0).round() / 10000.0,
        is_dark: luminance < 0.179,
    })
}

/// Convert HSL values to hex color string.
#[napi]
pub fn hsl_to_hex(h: f64, s: f64, l: f64) -> String {
    let s = s / 100.0;
    let l = l / 100.0;
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let m = l - c / 2.0;

    let (r, g, b) = if h < 60.0 {
        (c, x, 0.0)
    } else if h < 120.0 {
        (x, c, 0.0)
    } else if h < 180.0 {
        (0.0, c, x)
    } else if h < 240.0 {
        (0.0, x, c)
    } else if h < 300.0 {
        (x, 0.0, c)
    } else {
        (c, 0.0, x)
    };

    let r = ((r + m) * 255.0).round() as u8;
    let g = ((g + m) * 255.0).round() as u8;
    let b = ((b + m) * 255.0).round() as u8;

    format!("#{:02x}{:02x}{:02x}", r, g, b)
}

/// Generate a color palette from a base color (complementary, triadic, analogous).
#[napi]
pub fn generate_palette(hex: String, mode: String) -> napi::Result<Vec<String>> {
    let info = parse_color(hex)?;
    let h = info.h;
    let s = info.s;
    let l = info.l;

    let hues = match mode.as_str() {
        "complementary" => vec![h, (h + 180.0) % 360.0],
        "triadic" => vec![h, (h + 120.0) % 360.0, (h + 240.0) % 360.0],
        "analogous" => vec![(h + 330.0) % 360.0, h, (h + 30.0) % 360.0, (h + 60.0) % 360.0],
        "split-complementary" => vec![h, (h + 150.0) % 360.0, (h + 210.0) % 360.0],
        "tetradic" => vec![h, (h + 90.0) % 360.0, (h + 180.0) % 360.0, (h + 270.0) % 360.0],
        "monochromatic" => {
            return Ok(vec![
                hsl_to_hex(h, s, (l - 20.0).max(5.0)),
                hsl_to_hex(h, s, (l - 10.0).max(5.0)),
                hsl_to_hex(h, s, l),
                hsl_to_hex(h, s, (l + 10.0).min(95.0)),
                hsl_to_hex(h, s, (l + 20.0).min(95.0)),
            ]);
        }
        _ => vec![h],
    };

    Ok(hues.iter().map(|&hue| hsl_to_hex(hue, s, l)).collect())
}

/// WCAG contrast ratio between two hex colors. Returns ratio >= 1.
#[napi]
pub fn contrast_ratio(hex1: String, hex2: String) -> napi::Result<f64> {
    let c1 = parse_color(hex1)?;
    let c2 = parse_color(hex2)?;
    let l1 = c1.luminance.max(c2.luminance);
    let l2 = c1.luminance.min(c2.luminance);
    let ratio = (l1 + 0.05) / (l2 + 0.05);
    Ok((ratio * 100.0).round() / 100.0)
}

// ─────────────────────────────────────────────────────────────────────────
// File Hashing (Forge dedup, all apps asset verification)
// ─────────────────────────────────────────────────────────────────────────

/// Compute a fast hash (FNV-1a) for a file. Good for dedup, not cryptographic.
#[napi]
pub fn hash_file(file_path: String) -> napi::Result<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(&file_path)
        .map_err(|e| napi::Error::from_reason(format!("Cannot open file: {}", e)))?;

    // FNV-1a 64-bit
    let mut hash: u64 = 0xcbf29ce484222325;
    let mut buf = [0u8; 8192];
    loop {
        let n = file.read(&mut buf)
            .map_err(|e| napi::Error::from_reason(format!("Read error: {}", e)))?;
        if n == 0 { break; }
        for &byte in &buf[..n] {
            hash ^= byte as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
    }

    Ok(format!("{:016x}", hash))
}

#[napi(object)]
#[derive(Clone)]
pub struct BatchHashResult {
    pub path: String,
    pub hash: String,
    pub size: f64,
}

/// Hash multiple files in parallel (rayon). Returns path+hash+size for each.
#[napi]
pub fn batch_hash_files(file_paths: Vec<String>) -> Vec<BatchHashResult> {
    file_paths
        .par_iter()
        .filter_map(|p| {
            let size = std::fs::metadata(p).ok()?.len();
            let hash = hash_file(p.clone()).ok()?;
            Some(BatchHashResult {
                path: p.clone(),
                hash,
                size: size as f64,
            })
        })
        .collect()
}

// ─────────────────────────────────────────────────────────────────────────
// Project Statistics (all apps)
// ─────────────────────────────────────────────────────────────────────────

#[napi(object)]
#[derive(Clone)]
pub struct ProjectStats {
    pub total_files: u32,
    pub total_size_bytes: f64,
    pub audio_files: u32,
    pub video_files: u32,
    pub image_files: u32,
    pub other_files: u32,
    pub largest_file_path: String,
    pub largest_file_size: f64,
}

/// Quickly analyze a project directory for asset stats (parallel via rayon).
#[napi]
pub fn analyze_project_dir(dir_path: String) -> napi::Result<ProjectStats> {
    let walker = jwalk::WalkDir::new(&dir_path)
        .max_depth(10)
        .skip_hidden(false);

    let entries: Vec<_> = walker.into_iter().filter_map(|e| e.ok()).collect();

    let file_data: Vec<(u64, String, String)> = entries
        .par_iter()
        .filter(|e| e.file_type().is_file())
        .filter_map(|entry| {
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            let path = entry.path().to_string_lossy().into_owned();
            let ext = entry.path().extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            Some((size, path, ext))
        })
        .collect();

    let mut stats = ProjectStats {
        total_files: file_data.len() as u32,
        total_size_bytes: 0.0,
        audio_files: 0,
        video_files: 0,
        image_files: 0,
        other_files: 0,
        largest_file_path: String::new(),
        largest_file_size: 0.0,
    };

    for (size, path, ext) in &file_data {
        let s = *size as f64;
        stats.total_size_bytes += s;
        if s > stats.largest_file_size {
            stats.largest_file_size = s;
            stats.largest_file_path = path.clone();
        }
        match ext.as_str() {
            "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" | "aiff" | "wma" | "opus" => stats.audio_files += 1,
            "mp4" | "mov" | "avi" | "mkv" | "webm" | "wmv" | "flv" | "m4v" => stats.video_files += 1,
            "jpg" | "jpeg" | "png" | "gif" | "bmp" | "tiff" | "webp" | "svg" | "ico" | "psd" | "raw" | "cr2" | "nef" | "dng" => stats.image_files += 1,
            _ => stats.other_files += 1,
        }
    }

    Ok(stats)
}
