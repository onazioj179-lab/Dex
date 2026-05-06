// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// DEX Native — Image Processing
// Provides: thumbnail generation, metadata extraction, batch resize
// Uses the `image` crate for fast, native image operations
// ═══════════════════════════════════════════════════════════════════════════

use napi::bindgen_prelude::*;
use napi_derive::napi;
use rayon::prelude::*;
use std::path::Path;

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

#[napi(object)]
#[derive(Clone)]
pub struct ImageMetadata {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub color_type: String,
    pub file_size: f64,
    pub has_alpha: bool,
}

#[napi(object)]
#[derive(Clone)]
pub struct ThumbnailResult {
    pub success: bool,
    pub output_path: String,
    pub width: u32,
    pub height: u32,
    pub duration_ms: f64,
}

#[napi(object)]
#[derive(Clone)]
pub struct BatchResizeResult {
    pub total: u32,
    pub succeeded: u32,
    pub failed: u32,
    pub outputs: Vec<String>,
    pub errors: Vec<String>,
    pub duration_ms: f64,
}

// ─────────────────────────────────────────────────────────────────────────
// Image Metadata
// ─────────────────────────────────────────────────────────────────────────

/// Extract image metadata without decoding the full image (fast).
#[napi]
pub fn get_image_metadata(file_path: String) -> Result<ImageMetadata> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(Error::from_reason(format!("File not found: {}", file_path)));
    }

    let file_size = std::fs::metadata(path)
        .map(|m| m.len() as f64)
        .unwrap_or(0.0);

    // Try to read just the header for dimensions
    let reader = image::ImageReader::open(path)
        .map_err(|e| Error::from_reason(format!("Cannot open image: {}", e)))?
        .with_guessed_format()
        .map_err(|e| Error::from_reason(format!("Cannot detect format: {}", e)))?;

    let format = reader
        .format()
        .map(|f| format!("{:?}", f).to_lowercase())
        .unwrap_or_else(|| "unknown".into());

    // Use into_dimensions() for fast header-only read (10-100x faster than full decode)
    let (width, height) = reader
        .into_dimensions()
        .map_err(|e| Error::from_reason(format!("Cannot read image dimensions: {}", e)))?;

    // Without full decode, we provide best-guess color info from format
    let color_type = "unknown".to_string();
    let has_alpha = format == "png" || format == "webp" || format == "gif" || format == "tiff";

    Ok(ImageMetadata {
        width,
        height,
        format,
        color_type,
        file_size,
        has_alpha,
    })
}

// ─────────────────────────────────────────────────────────────────────────
// Thumbnail Generation
// ─────────────────────────────────────────────────────────────────────────

/// Generate a thumbnail for an image. Preserves aspect ratio.
/// Output is always JPEG for speed (unless PNG requested via extension).
#[napi]
pub fn generate_thumbnail(
    input_path: String,
    output_path: String,
    max_width: u32,
    max_height: u32,
) -> Result<ThumbnailResult> {
    let start = std::time::Instant::now();
    let path = Path::new(&input_path);

    if !path.exists() {
        return Err(Error::from_reason(format!("File not found: {}", input_path)));
    }

    let img = image::open(path)
        .map_err(|e| Error::from_reason(format!("Cannot open image: {}", e)))?;

    let thumb = img.thumbnail(max_width, max_height);
    let out = Path::new(&output_path);

    // Ensure parent directory exists
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| Error::from_reason(format!("Cannot create output dir: {}", e)))?;
    }

    thumb
        .save(out)
        .map_err(|e| Error::from_reason(format!("Cannot save thumbnail: {}", e)))?;

    let duration_ms = start.elapsed().as_secs_f64() * 1000.0;

    Ok(ThumbnailResult {
        success: true,
        output_path,
        width: thumb.width(),
        height: thumb.height(),
        duration_ms,
    })
}

// ─────────────────────────────────────────────────────────────────────────
// Batch Resize
// ─────────────────────────────────────────────────────────────────────────

/// Resize multiple images in parallel (rayon). Returns paths of successful outputs.
#[napi]
pub fn batch_resize_images(
    input_paths: Vec<String>,
    output_dir: String,
    max_width: u32,
    max_height: u32,
    format: Option<String>,
) -> Result<BatchResizeResult> {
    let start = std::time::Instant::now();
    let out_dir = Path::new(&output_dir);

    std::fs::create_dir_all(out_dir)
        .map_err(|e| Error::from_reason(format!("Cannot create output dir: {}", e)))?;

    let total = input_paths.len() as u32;
    let ext = format.as_deref().unwrap_or("jpg").to_string();

    // Process images in parallel using rayon (3-5x speedup on multi-core)
    let results: Vec<std::result::Result<String, String>> = input_paths
        .par_iter()
        .map(|input_path| {
            let src = Path::new(input_path);
            let stem = src
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("output");
            let out_path = out_dir.join(format!("{}_resized.{}", stem, ext));

            match image::open(src) {
                Ok(img) => {
                    let resized = img.resize(max_width, max_height, image::imageops::FilterType::Lanczos3);
                    match resized.save(&out_path) {
                        Ok(_) => Ok(out_path.to_string_lossy().into_owned()),
                        Err(e) => Err(format!("{}: {}", input_path, e)),
                    }
                }
                Err(e) => Err(format!("{}: {}", input_path, e)),
            }
        })
        .collect();

    let mut succeeded = 0u32;
    let mut failed = 0u32;
    let mut outputs = Vec::new();
    let mut errors = Vec::new();

    for result in results {
        match result {
            Ok(path) => {
                succeeded += 1;
                outputs.push(path);
            }
            Err(err) => {
                failed += 1;
                errors.push(err);
            }
        }
    }

    let duration_ms = start.elapsed().as_secs_f64() * 1000.0;

    Ok(BatchResizeResult {
        total,
        succeeded,
        failed,
        outputs,
        errors,
        duration_ms,
    })
}

/// Async batch resize — non-blocking for Electron main thread.
#[napi]
pub async fn batch_resize_images_async(
    input_paths: Vec<String>,
    output_dir: String,
    max_width: u32,
    max_height: u32,
    format: Option<String>,
) -> Result<BatchResizeResult> {
    batch_resize_images(input_paths, output_dir, max_width, max_height, format)
}

/// Async thumbnail generation — non-blocking for Electron main thread.
#[napi]
pub async fn generate_thumbnail_async(
    input_path: String,
    output_path: String,
    max_width: u32,
    max_height: u32,
) -> Result<ThumbnailResult> {
    generate_thumbnail(input_path, output_path, max_width, max_height)
}

/// Get raw pixel data as RGBA buffer for a given image (for canvas rendering).
#[napi]
pub fn get_image_pixels(file_path: String, max_width: Option<u32>, max_height: Option<u32>) -> Result<Buffer> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(Error::from_reason(format!("File not found: {}", file_path)));
    }

    let img = image::open(path)
        .map_err(|e| Error::from_reason(format!("Cannot open image: {}", e)))?;

    let img = if let (Some(mw), Some(mh)) = (max_width, max_height) {
        img.resize(mw, mh, image::imageops::FilterType::Triangle)
    } else {
        img
    };

    let rgba = img.to_rgba8();
    Ok(Buffer::from(rgba.into_raw()))
}
