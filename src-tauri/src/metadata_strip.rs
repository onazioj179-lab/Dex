// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Lossless privacy-metadata removal for JPEG and PNG (`fs:stripMetadata`).
//
// Removes what identifies the person or the device: EXIF (camera, serial,
// date, GPS location), XMP (editing history, author), IPTC / Photoshop
// records, comments, PNG text chunks and timestamps. The image data is copied
// byte for byte, never re-encoded.
//
// Kept on purpose:
//   - colour data (ICC profile, Adobe APP14, PNG gAMA/cHRM/sRGB/iCCP), so the
//     copy looks the same;
//   - EXIF orientation, re-written as a 1-entry EXIF block, so photos don't
//     turn sideways;
//   - C2PA content credentials (JPEG APP11 JUMBF, PNG caBX). These are signed
//     provenance records, not personal data, and DEX doesn't remove them.
//
// The original file is never modified: the result is written next to it as
// "<name> (no metadata).<ext>".

use serde_json::{json, Value};
use std::path::{Path, PathBuf};

#[derive(Debug, Default, PartialEq)]
pub struct StripReport {
    pub removed: Vec<String>,
    pub kept_orientation: Option<u16>,
}

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

/// Read the EXIF orientation (tag 0x0112) from an APP1 "Exif\0\0" payload.
fn exif_orientation(payload: &[u8]) -> Option<u16> {
    let tiff = payload.strip_prefix(b"Exif\0\0")?;
    if tiff.len() < 8 { return None; }
    let le = match &tiff[0..2] { b"II" => true, b"MM" => false, _ => return None };
    let u16_at = |o: usize| -> Option<u16> {
        let b = tiff.get(o..o + 2)?;
        Some(if le { u16::from_le_bytes([b[0], b[1]]) } else { u16::from_be_bytes([b[0], b[1]]) })
    };
    let u32_at = |o: usize| -> Option<u32> {
        let b = tiff.get(o..o + 4)?;
        Some(if le { u32::from_le_bytes([b[0], b[1], b[2], b[3]]) } else { u32::from_be_bytes([b[0], b[1], b[2], b[3]]) })
    };
    let ifd0 = u32_at(4)? as usize;
    let count = u16_at(ifd0)? as usize;
    for i in 0..count.min(512) {
        let e = ifd0 + 2 + i * 12;
        if u16_at(e)? == 0x0112 {
            let v = u16_at(e + 8)?;
            return (1..=8).contains(&v).then_some(v);
        }
    }
    None
}

/// A minimal APP1 segment holding only the orientation tag.
fn orientation_app1(orientation: u16) -> Vec<u8> {
    let mut tiff = Vec::with_capacity(26);
    tiff.extend_from_slice(b"II*\0");
    tiff.extend_from_slice(&8u32.to_le_bytes()); // IFD0 offset
    tiff.extend_from_slice(&1u16.to_le_bytes()); // 1 entry
    tiff.extend_from_slice(&0x0112u16.to_le_bytes()); // Orientation
    tiff.extend_from_slice(&3u16.to_le_bytes()); // SHORT
    tiff.extend_from_slice(&1u32.to_le_bytes()); // count
    tiff.extend_from_slice(&orientation.to_le_bytes());
    tiff.extend_from_slice(&[0, 0]); // value padding
    tiff.extend_from_slice(&0u32.to_le_bytes()); // no next IFD
    let payload_len = 6 + tiff.len();
    let mut seg = vec![0xFF, 0xE1];
    seg.extend_from_slice(&((payload_len + 2) as u16).to_be_bytes());
    seg.extend_from_slice(b"Exif\0\0");
    seg.extend_from_slice(&tiff);
    seg
}

pub fn strip_jpeg(data: &[u8]) -> Result<(Vec<u8>, StripReport), String> {
    if data.len() < 4 || data[0] != 0xFF || data[1] != 0xD8 {
        return Err("Not a JPEG file.".into());
    }
    let mut out = Vec::with_capacity(data.len());
    out.extend_from_slice(&data[..2]);
    let mut report = StripReport::default();
    let mut orientation_written = false;
    let mut i = 2;
    loop {
        // Skip fill bytes before a marker.
        while i < data.len() && data[i] == 0xFF && data.get(i + 1) == Some(&0xFF) { i += 1; }
        if i + 1 >= data.len() || data[i] != 0xFF {
            return Err("The JPEG is damaged (bad marker).".into());
        }
        let marker = data[i + 1];
        // Start of scan / end of image: everything after is image data, copy verbatim.
        if marker == 0xDA || marker == 0xD9 {
            out.extend_from_slice(&data[i..]);
            break;
        }
        // Standalone markers carry no length.
        if (0xD0..=0xD7).contains(&marker) || marker == 0x01 {
            out.extend_from_slice(&data[i..i + 2]);
            i += 2;
            continue;
        }
        if i + 4 > data.len() { return Err("The JPEG is damaged (truncated).".into()); }
        let len = u16::from_be_bytes([data[i + 2], data[i + 3]]) as usize;
        if len < 2 || i + 2 + len > data.len() { return Err("The JPEG is damaged (bad segment length).".into()); }
        let seg = &data[i..i + 2 + len];
        let payload = &data[i + 4..i + 2 + len];
        let drop_as: Option<&str> = match marker {
            0xE1 if payload.starts_with(b"Exif\0\0") => {
                if let Some(o) = exif_orientation(payload) {
                    if o != 1 && !orientation_written {
                        out.extend_from_slice(&orientation_app1(o));
                        orientation_written = true;
                        report.kept_orientation = Some(o);
                    }
                }
                Some("EXIF (camera, date, location)")
            }
            0xE1 => Some("XMP"),
            0xED => Some("IPTC / Photoshop"),
            0xFE => Some("Comment"),
            // APP3-APP10, APP12, APP15: vendor/maker blocks (e.g. Meta, Ducky,
            // FLIR, MPF previews). APP0 JFIF, APP2 ICC, APP11 C2PA and APP14
            // Adobe stay.
            0xE3..=0xEA | 0xEC | 0xEF => Some("Maker data"),
            _ => None,
        };
        match drop_as {
            Some(what) => { if !report.removed.iter().any(|r| r == what) { report.removed.push(what.to_string()); } }
            None => out.extend_from_slice(seg),
        }
        i += 2 + len;
    }
    Ok((out, report))
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const PNG_SIG: &[u8; 8] = b"\x89PNG\r\n\x1a\n";

pub fn strip_png(data: &[u8]) -> Result<(Vec<u8>, StripReport), String> {
    if data.len() < 8 || &data[..8] != PNG_SIG { return Err("Not a PNG file.".into()); }
    let mut out = Vec::with_capacity(data.len());
    out.extend_from_slice(PNG_SIG);
    let mut report = StripReport::default();
    let mut i = 8;
    while i + 12 <= data.len() {
        let len = u32::from_be_bytes([data[i], data[i + 1], data[i + 2], data[i + 3]]) as usize;
        let end = i + 12 + len;
        if end > data.len() { return Err("The PNG is damaged (truncated chunk).".into()); }
        let kind = &data[i + 4..i + 8];
        let drop_as = match kind {
            b"tEXt" | b"zTXt" | b"iTXt" => Some("Text (author, software, description)"),
            b"eXIf" => Some("EXIF (camera, date, location)"),
            b"tIME" => Some("Timestamp"),
            _ => None,
        };
        match drop_as {
            Some(what) => { if !report.removed.iter().any(|r| r == what) { report.removed.push(what.to_string()); } }
            None => out.extend_from_slice(&data[i..end]),
        }
        i = end;
        if kind == b"IEND" { break; }
    }
    Ok((out, report))
}

// ---------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------

fn output_path(src: &Path) -> PathBuf {
    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("image");
    let ext = src.extension().and_then(|s| s.to_str()).unwrap_or("");
    let dir = src.parent().unwrap_or_else(|| Path::new("."));
    let mut n = 1;
    loop {
        let name = if n == 1 { format!("{stem} (no metadata)") } else { format!("{stem} (no metadata {n})") };
        let candidate = if ext.is_empty() { dir.join(&name) } else { dir.join(format!("{name}.{ext}")) };
        if !candidate.exists() { return candidate; }
        n += 1;
    }
}

/// `fs:stripMetadata(path)` -> `{ ok, outPath, removed: [..], keptOrientation }`
/// or `{ ok: false, error }`.
pub fn strip_file(args: &Value) -> Value {
    let path = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    if path.is_empty() { return json!({ "ok": false, "error": "No file path." }); }
    let src = Path::new(path);
    match std::fs::metadata(src) {
        Ok(m) if m.is_dir() => return json!({ "ok": false, "error": "That path is a folder." }),
        Ok(m) if m.len() > 512 * 1024 * 1024 => return json!({ "ok": false, "error": "File is larger than 512 MB." }),
        Err(e) => return json!({ "ok": false, "error": e.to_string() }),
        _ => {}
    }
    let data = match std::fs::read(src) { Ok(d) => d, Err(e) => return json!({ "ok": false, "error": e.to_string() }) };
    let result = if data.starts_with(&[0xFF, 0xD8]) { strip_jpeg(&data) }
        else if data.starts_with(PNG_SIG) { strip_png(&data) }
        else { Err("Only JPEG and PNG images are supported.".into()) };
    let (bytes, report) = match result { Ok(r) => r, Err(e) => return json!({ "ok": false, "error": e }) };
    if report.removed.is_empty() {
        return json!({ "ok": true, "outPath": null, "removed": [], "message": "This image has no personal metadata to remove." });
    }
    let out = output_path(src);
    let tmp = out.with_extension("dex-tmp");
    if let Err(e) = std::fs::write(&tmp, &bytes) { return json!({ "ok": false, "error": e.to_string() }); }
    if let Err(e) = std::fs::rename(&tmp, &out) {
        let _ = std::fs::remove_file(&tmp);
        return json!({ "ok": false, "error": e.to_string() });
    }
    json!({
        "ok": true,
        "outPath": out.to_string_lossy(),
        "removed": report.removed,
        "keptOrientation": report.kept_orientation,
        "bytesBefore": data.len(),
        "bytesAfter": bytes.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seg(marker: u8, payload: &[u8]) -> Vec<u8> {
        let mut v = vec![0xFF, marker];
        v.extend_from_slice(&((payload.len() + 2) as u16).to_be_bytes());
        v.extend_from_slice(payload);
        v
    }

    fn exif_with_orientation(o: u16, big_endian: bool) -> Vec<u8> {
        let mut p = b"Exif\0\0".to_vec();
        if big_endian {
            p.extend_from_slice(b"MM\0*\0\0\0\x08\0\x02");
            p.extend_from_slice(&[0x01, 0x10, 0, 2, 0, 0, 0, 6, 0, 0, 0, 0]); // Model (ignored)
            p.extend_from_slice(&[0x01, 0x12, 0, 3, 0, 0, 0, 1]);
            p.extend_from_slice(&o.to_be_bytes());
            p.extend_from_slice(&[0, 0, 0, 0, 0, 0]);
        } else {
            p.extend_from_slice(b"II*\0\x08\0\0\0\x01\0");
            p.extend_from_slice(&[0x12, 0x01, 3, 0, 1, 0, 0, 0]);
            p.extend_from_slice(&o.to_le_bytes());
            p.extend_from_slice(&[0, 0, 0, 0, 0, 0]);
        }
        p
    }

    fn jpeg(parts: &[Vec<u8>]) -> Vec<u8> {
        let mut v = vec![0xFF, 0xD8];
        for p in parts { v.extend_from_slice(p); }
        v.extend_from_slice(&[0xFF, 0xDA, 0x00, 0x04, 0xAA, 0xBB, 0x12, 0x34, 0xFF, 0xD9]);
        v
    }

    #[test]
    fn jpeg_drops_exif_xmp_comment_keeps_icc_c2pa_and_scan() {
        let jfif = seg(0xE0, b"JFIF\0\x01\x02");
        let icc = seg(0xE2, b"ICC_PROFILE\0data");
        let c2pa = seg(0xEB, b"JP\0\0jumbf");
        let input = jpeg(&[
            jfif.clone(),
            seg(0xE1, &exif_with_orientation(1, false)),
            seg(0xE1, b"http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>"),
            seg(0xFE, b"shot on my phone"),
            icc.clone(),
            c2pa.clone(),
        ]);
        let (out, report) = strip_jpeg(&input).unwrap();
        assert_eq!(out, jpeg(&[jfif, icc, c2pa]));
        assert_eq!(report.removed, vec!["EXIF (camera, date, location)", "XMP", "Comment"]);
        assert_eq!(report.kept_orientation, None);
    }

    #[test]
    fn jpeg_keeps_rotation_as_minimal_exif() {
        for be in [false, true] {
            let input = jpeg(&[seg(0xE1, &exif_with_orientation(6, be))]);
            let (out, report) = strip_jpeg(&input).unwrap();
            assert_eq!(report.kept_orientation, Some(6));
            // The rewritten block parses back to the same orientation.
            let app1 = &out[2..];
            assert_eq!(&app1[..2], &[0xFF, 0xE1]);
            let len = u16::from_be_bytes([app1[2], app1[3]]) as usize;
            assert_eq!(exif_orientation(&app1[4..2 + len]), Some(6));
        }
    }

    #[test]
    fn jpeg_rejects_damage() {
        assert!(strip_jpeg(b"nope").is_err());
        assert!(strip_jpeg(&[0xFF, 0xD8, 0xFF, 0xE1, 0xFF, 0xFF]).is_err());
    }

    fn chunk(kind: &[u8; 4], data: &[u8]) -> Vec<u8> {
        let mut v = (data.len() as u32).to_be_bytes().to_vec();
        v.extend_from_slice(kind);
        v.extend_from_slice(data);
        v.extend_from_slice(&[0, 0, 0, 0]); // CRC is copied, not checked
        v
    }

    #[test]
    fn png_drops_text_exif_time_keeps_rest() {
        let ihdr = chunk(b"IHDR", &[0; 13]);
        let srgb = chunk(b"sRGB", &[0]);
        let cabx = chunk(b"caBX", b"c2pa");
        let idat = chunk(b"IDAT", &[1, 2, 3]);
        let iend = chunk(b"IEND", &[]);
        let mut input = PNG_SIG.to_vec();
        for c in [&ihdr, &chunk(b"tEXt", b"Author\0me"), &srgb, &chunk(b"eXIf", b"MM"), &chunk(b"tIME", &[0; 7]), &cabx, &idat, &iend] {
            input.extend_from_slice(c);
        }
        let (out, report) = strip_png(&input).unwrap();
        let mut expected = PNG_SIG.to_vec();
        for c in [&ihdr, &srgb, &cabx, &idat, &iend] { expected.extend_from_slice(c); }
        assert_eq!(out, expected);
        assert_eq!(report.removed.len(), 3);
    }

    #[test]
    fn strip_file_writes_a_copy_and_leaves_the_original() {
        let dir = std::env::temp_dir().join(format!("dex-strip-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("photo.jpg");
        let input = jpeg(&[seg(0xE1, &exif_with_orientation(1, false))]);
        std::fs::write(&src, &input).unwrap();
        let r = strip_file(&json!([src.to_string_lossy()]));
        assert_eq!(r["ok"], true, "{r}");
        let out = PathBuf::from(r["outPath"].as_str().unwrap());
        assert_eq!(out.file_name().unwrap(), "photo (no metadata).jpg");
        assert_eq!(std::fs::read(&src).unwrap(), input);
        assert_eq!(std::fs::read(&out).unwrap(), jpeg(&[]));
        // A second run picks a fresh name instead of overwriting.
        let r2 = strip_file(&json!([src.to_string_lossy()]));
        assert!(r2["outPath"].as_str().unwrap().ends_with("photo (no metadata 2).jpg"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
