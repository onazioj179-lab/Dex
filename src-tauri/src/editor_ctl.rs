// =============================================================================
// DEX Tauri — Gallery Editor surface (port of src/main/core/GalleryEditor.ts).
//
// Non-destructive image editing. The Electron GalleryEditor kept the live edit
// session (`activeEdit: EditState | null`) entirely in memory; this port backs
// that single live session with a plain JSON file `editor-state.json` under
// <appData> (std::fs — the whole file IS the EditState object, or absent == no
// open image). getState/open/close/save all read & write that one file, so the
// renderer sees behaviour identical to Electron's in-memory session.
//
// CHANNELS
//   - editor:getState            -> EditState | null            (DATA, read)
//   - editor:open(imagePath)     -> EditState | null            (HEAVY, native)
//   - editor:close()             -> void/null                   (HEAVY, native)
//   - editor:save(options?)      -> SaveResult | null           (HEAVY, native*)
//   - editor:export(...)         -> degrade (no Electron handler)
//
// NATIVE STRATEGY
//   open  — Electron used `nativeImage.createFromPath(...).getSize()` purely to
//           read the pixel dimensions of the source. We do the SAME thing with
//           no decode library: parse the width/height out of the container
//           header for the common formats (PNG / JPEG / GIF / BMP / WEBP-VP8*).
//           A path that does not exist or whose header we cannot read returns
//           null — exactly Electron's `image.isEmpty()` -> null path. On success
//           we mint the EditState (sourceId via crate::util::pseudo_uuid_v4),
//           persist it, and emit `editor:stateChanged` + an `imageOpened`
//           parity event (Electron emitted both on open).
//   close — clear the live session: emit `editorClosed` with the sourceId (only
//           if one was open), delete the state file. Returns null (Electron's
//           closeEditor() is `void`).
//   save  — Electron's save() applied crop/resize then re-encoded via nativeImage
//           (toJPEG/toPNG). REAL pixel re-encode (crop/resize/rotate/flip/
//           brightness/contrast/saturation) needs an image codec we are not
//           allowed to add, so save is REAL only for the non-destructive fast
//           path: when the session carries NO pending pixel operation AND the
//           requested output format already matches the source bytes, save is a
//           faithful byte-exact write — including the genuine "preserve original"
//           copy under gallery-editor/originals/ — and returns a real SaveResult
//           (real byte size + the source's real dimensions). When destructive
//           pixel ops ARE pending we degrade honestly rather than write a wrong
//           image (see SaveResult.error). markDirty is cleared on a real save.
//
// DEGRADES (honest, not faked)
//   - editor:save with pending pixel ops (crop/resize/rotate/flip/adjustments)
//     -> { success:false, error:"not ported (needs native runtime)" }: a correct
//     write would require decoding & re-encoding pixels (no no-dep codec).
//   - editor:export -> { success:false, error:"not ported (needs native runtime)" }:
//     no `editor:export` handler exists in GalleryEditor.ts (or TextCodeEditor.ts)
//     — there is no Electron behaviour or return shape to mirror.
//
// EditState shape (persisted verbatim):
//   { sourceId, sourcePath, originalWidth, originalHeight, crop, transform:
//     { rotation, flipHorizontal, flipVertical }, adjustments:
//     { brightness, contrast, saturation }, resize, history, historyIndex,
//     isDirty }
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const STATE_FILE: &str = "editor-state.json";
const ORIGINALS_SUFFIX: &str = "_original";
const DEFAULT_FORMAT: &str = "jpeg";

fn app_data(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    app_data(app).join(name)
}

// gallery-editor/originals — mirrors GalleryEditor.originalsPath (used by save's
// preserve-original copy). Created on demand so save never panics on a fresh box.
fn originals_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app_data(app).join("gallery-editor").join("originals");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn read_state(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app, STATE_FILE)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn write_state(app: &tauri::AppHandle, state: &Value) {
    if let Ok(raw) = serde_json::to_string(state) {
        let _ = std::fs::write(store_path(app, STATE_FILE), raw);
    }
}

fn clear_state(app: &tauri::AppHandle) {
    let _ = std::fs::remove_file(store_path(app, STATE_FILE));
}

fn epoch_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// editor:getState -> EditState | null. Returns the persisted live session, or
// null when the file is absent/empty/invalid (a fresh session, no open image).
fn get_state(app: &tauri::AppHandle) -> Value {
    match read_state(app) {
        v @ Value::Object(_) => v,
        _ => Value::Null,
    }
}

// ---------------------------------------------------------------------------
// Native image dimensions (no decode library)
//
// Returns (width, height) for the common still formats by reading only the
// container header. Mirrors what Electron needed nativeImage for in open(): the
// pixel size. Unknown/unsupported/corrupt headers -> None == Electron's
// `image.isEmpty()`.
// ---------------------------------------------------------------------------
fn read_u16_be(b: &[u8], i: usize) -> u32 {
    ((b[i] as u32) << 8) | (b[i + 1] as u32)
}
fn read_u32_be(b: &[u8], i: usize) -> u32 {
    ((b[i] as u32) << 24) | ((b[i + 1] as u32) << 16) | ((b[i + 2] as u32) << 8) | (b[i + 3] as u32)
}
fn read_u16_le(b: &[u8], i: usize) -> u32 {
    (b[i] as u32) | ((b[i + 1] as u32) << 8)
}
fn read_u32_le(b: &[u8], i: usize) -> u32 {
    (b[i] as u32) | ((b[i + 1] as u32) << 8) | ((b[i + 2] as u32) << 16) | ((b[i + 3] as u32) << 24)
}

fn image_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    let n = bytes.len();
    if n < 12 {
        return None;
    }

    // PNG: 8-byte signature, then IHDR chunk (length+"IHDR"+width(4 BE)+height(4 BE))
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        if n >= 24 && &bytes[12..16] == b"IHDR" {
            let w = read_u32_be(bytes, 16);
            let h = read_u32_be(bytes, 20);
            if w > 0 && h > 0 {
                return Some((w, h));
            }
        }
        return None;
    }

    // GIF: "GIF87a"/"GIF89a" then logical screen width/height (2 LE each)
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        let w = read_u16_le(bytes, 6);
        let h = read_u16_le(bytes, 8);
        if w > 0 && h > 0 {
            return Some((w, h));
        }
        return None;
    }

    // BMP: "BM", DIB header at offset 14. BITMAPINFOHEADER -> 4-byte LE w/h at 18/22.
    if bytes.starts_with(b"BM") && n >= 26 {
        let header_size = read_u32_le(bytes, 14);
        if header_size >= 40 {
            let w = read_u32_le(bytes, 18);
            let h = read_u32_le(bytes, 22);
            if w > 0 && h > 0 {
                return Some((w, h));
            }
        } else if header_size == 12 && n >= 22 {
            // BITMAPCOREHEADER -> 2-byte LE w/h at 18/20
            let w = read_u16_le(bytes, 18);
            let h = read_u16_le(bytes, 20);
            if w > 0 && h > 0 {
                return Some((w, h));
            }
        }
        return None;
    }

    // WEBP: RIFF....WEBP then a chunk: VP8 (lossy) / VP8L (lossless) / VP8X (ext)
    if bytes.starts_with(b"RIFF") && n >= 16 && &bytes[8..12] == b"WEBP" {
        let chunk = &bytes[12..16];
        if chunk == b"VP8 " && n >= 30 {
            // bitstream start code 0x9d 0x01 0x2a, then 14-bit width/height (LE)
            if bytes[23] == 0x9d && bytes[24] == 0x01 && bytes[25] == 0x2a {
                let w = read_u16_le(bytes, 26) & 0x3fff;
                let h = read_u16_le(bytes, 28) & 0x3fff;
                if w > 0 && h > 0 {
                    return Some((w, h));
                }
            }
            return None;
        }
        if chunk == b"VP8L" && n >= 25 && bytes[20] == 0x2f {
            // 14-bit width-1 / height-1 packed LE starting at byte 21
            let b0 = bytes[21] as u32;
            let b1 = bytes[22] as u32;
            let b2 = bytes[23] as u32;
            let b3 = bytes[24] as u32;
            let w = ((b1 & 0x3f) << 8 | b0) + 1;
            let h = ((b3 & 0x0f) << 10 | b2 << 2 | (b1 >> 6)) + 1;
            if w > 0 && h > 0 {
                return Some((w, h));
            }
            return None;
        }
        if chunk == b"VP8X" && n >= 30 {
            // canvas width-1 / height-1: 24-bit LE at 24 and 27
            let w = ((bytes[24] as u32) | ((bytes[25] as u32) << 8) | ((bytes[26] as u32) << 16)) + 1;
            let h = ((bytes[27] as u32) | ((bytes[28] as u32) << 8) | ((bytes[29] as u32) << 16)) + 1;
            if w > 0 && h > 0 {
                return Some((w, h));
            }
            return None;
        }
        return None;
    }

    // JPEG: SOI (FFD8), then walk markers to a Start-Of-Frame (SOFn) which holds
    // height(2 BE)/width(2 BE). Skip non-SOF segments by their length field.
    if bytes[0] == 0xFF && bytes[1] == 0xD8 {
        let mut i = 2usize;
        while i + 9 < n {
            if bytes[i] != 0xFF {
                i += 1;
                continue;
            }
            let marker = bytes[i + 1];
            // Standalone markers (no length): padding 0xFF, RSTn, SOI/EOI/TEM
            if marker == 0xFF || marker == 0xD8 || marker == 0xD9 || marker == 0x01
                || (0xD0..=0xD7).contains(&marker)
            {
                i += 2;
                continue;
            }
            if i + 3 >= n {
                break;
            }
            let seg_len = read_u16_be(bytes, i + 2) as usize;
            if seg_len < 2 {
                break;
            }
            // SOF markers carrying frame dimensions (exclude DHT/JPG/DAC: C4/C8/CC)
            let is_sof = (0xC0..=0xCF).contains(&marker)
                && marker != 0xC4
                && marker != 0xC8
                && marker != 0xCC;
            if is_sof {
                if i + 9 < n {
                    let h = read_u16_be(bytes, i + 5);
                    let w = read_u16_be(bytes, i + 7);
                    if w > 0 && h > 0 {
                        return Some((w, h));
                    }
                }
                return None;
            }
            i += 2 + seg_len;
        }
        return None;
    }

    None
}

fn fresh_edit_state(source_id: String, abs_path: &str, w: u32, h: u32) -> Value {
    json!({
        "sourceId": source_id,
        "sourcePath": abs_path,
        "originalWidth": w,
        "originalHeight": h,
        "crop": Value::Null,
        "transform": { "rotation": 0, "flipHorizontal": false, "flipVertical": false },
        "adjustments": { "brightness": 0, "contrast": 0, "saturation": 0 },
        "resize": Value::Null,
        "history": [],
        "historyIndex": -1,
        "isDirty": false
    })
}

// editor:open(imagePath) -> EditState | null.
// Resolves the path, reads real pixel dimensions from the file header, builds &
// persists the EditState, and emits the open events. A missing file or an
// undecodable/unsupported header degrades to null — exactly Electron's
// `image.isEmpty()` path.
fn open_image(app: &tauri::AppHandle, args: &Value) -> Value {
    let raw_path = match args.get(0).and_then(|v| v.as_str()) {
        Some(p) if !p.is_empty() => p,
        _ => return Value::Null,
    };

    // Resolve to absolute (Electron: path.isAbsolute ? path : path.resolve(path)).
    let p = Path::new(raw_path);
    let abs = if p.is_absolute() {
        p.to_path_buf()
    } else {
        std::env::current_dir()
            .map(|c| c.join(p))
            .unwrap_or_else(|_| p.to_path_buf())
    };
    let abs_str = abs.to_string_lossy().to_string();

    let bytes = match std::fs::read(&abs) {
        Ok(b) => b,
        Err(_) => return Value::Null,
    };
    let (w, h) = match image_dimensions(&bytes) {
        Some(dim) => dim,
        None => return Value::Null,
    };

    // Close any existing session first (Electron: if (activeEdit) closeEditor()).
    if let Value::Object(prev) = read_state(app) {
        if let Some(sid) = prev.get("sourceId") {
            crate::native_ops::emit_event(app, "editorClosed", sid);
        }
    }

    let state = fresh_edit_state(crate::util::pseudo_uuid_v4(), &abs_str, w, h);
    write_state(app, &state);

    // Electron emitted 'imageOpened' and (via emitStateChange paths) pushed
    // 'editor:stateChanged' to the renderer; mirror both.
    crate::native_ops::emit_event(app, "imageOpened", &state);
    crate::native_ops::emit_event(app, "editor:stateChanged", &state);

    state
}

// editor:close() -> void/null. Emits editorClosed with the sourceId (only when a
// session was open) and deletes the persisted state. Returns null (Electron's
// closeEditor is void).
fn close_editor(app: &tauri::AppHandle) -> Value {
    if let Value::Object(state) = read_state(app) {
        if let Some(sid) = state.get("sourceId") {
            crate::native_ops::emit_event(app, "editorClosed", sid);
        }
    }
    clear_state(app);
    Value::Null
}

// True when the session has NO pending pixel-altering operation. Only then can a
// save be a faithful byte-copy; otherwise a correct write needs a real codec.
fn has_pending_pixel_ops(state: &Value) -> bool {
    if state.get("crop").map(|c| !c.is_null()).unwrap_or(false) {
        return true;
    }
    if state.get("resize").map(|r| !r.is_null()).unwrap_or(false) {
        return true;
    }
    if let Some(t) = state.get("transform") {
        let rot = t.get("rotation").and_then(|v| v.as_i64()).unwrap_or(0);
        let fh = t.get("flipHorizontal").and_then(|v| v.as_bool()).unwrap_or(false);
        let fv = t.get("flipVertical").and_then(|v| v.as_bool()).unwrap_or(false);
        if rot != 0 || fh || fv {
            return true;
        }
    }
    if let Some(a) = state.get("adjustments") {
        let b = a.get("brightness").and_then(|v| v.as_i64()).unwrap_or(0);
        let c = a.get("contrast").and_then(|v| v.as_i64()).unwrap_or(0);
        let s = a.get("saturation").and_then(|v| v.as_i64()).unwrap_or(0);
        if b != 0 || c != 0 || s != 0 {
            return true;
        }
    }
    false
}

fn ext_lower(path: &str) -> String {
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default()
}

// Does the source file's existing extension already satisfy the requested output
// format? (jpeg accepts .jpg/.jpeg; png accepts .png). When true, and with no
// pending pixel ops, the source bytes are already a correct encoding of the
// output and we can write them verbatim.
fn format_matches_source(format: &str, src_path: &str) -> bool {
    let e = ext_lower(src_path);
    match format {
        "jpeg" | "jpg" => e == "jpg" || e == "jpeg",
        "png" => e == "png",
        // webp: Electron itself fell back to jpeg on export, so a webp request is
        // never a faithful byte-copy of a real source here.
        _ => false,
    }
}

// editor:save(options?) -> SaveResult | null.
// Real save for the non-destructive fast path (no pending pixel ops AND output
// format matches source bytes): copies the source to gallery-editor/originals/
// when preserveOriginal is set, writes the bytes to the output path, clears
// isDirty, and returns a real SaveResult. Degrades honestly when pixel ops are
// pending (a correct re-encode needs a codec we cannot add). No active edit ->
// null (Electron returned null).
fn save(app: &tauri::AppHandle, args: &Value) -> Value {
    let mut state = match read_state(app) {
        Value::Object(m) => m,
        _ => return Value::Null,
    };

    let opts = args.get(0).cloned().unwrap_or(Value::Null);
    let format = opts
        .get("format")
        .and_then(|v| v.as_str())
        .unwrap_or(DEFAULT_FORMAT)
        .to_string();
    // GalleryEditor default: preserveOriginalByDefault = true.
    let preserve_original = opts
        .get("preserveOriginal")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let source_path = state
        .get("sourcePath")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if source_path.is_empty() {
        return Value::Null;
    }

    let state_val = Value::Object(state.clone());
    if has_pending_pixel_ops(&state_val) || !format_matches_source(&format, &source_path) {
        // Honest degrade: a correct output here requires decoding/re-encoding
        // pixels (crop/resize/rotate/flip/adjustments) or a format conversion,
        // which needs a native image codec that is not available no-dep.
        return json!({ "success": false, "error": "not ported (needs native runtime)" });
    }

    // Fast path: bytes already encode the desired output. Read once, reuse for
    // both the preserve-original copy and the output write.
    let bytes = match std::fs::read(&source_path) {
        Ok(b) => b,
        Err(_) => return Value::Null,
    };

    // save() saves back to sourcePath; preserve-original only when writing over
    // the source (mirrors `outputPath === sourcePath`).
    let output_path = source_path.clone();
    let mut original_path: Option<String> = None;
    if preserve_original {
        let src = Path::new(&source_path);
        let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("image");
        let ext = src.extension().and_then(|s| s.to_str()).unwrap_or("");
        let fname = if ext.is_empty() {
            format!("{}{}_{}", stem, ORIGINALS_SUFFIX, epoch_ms())
        } else {
            format!("{}{}_{}.{}", stem, ORIGINALS_SUFFIX, epoch_ms(), ext)
        };
        let dest = originals_dir(app).join(fname);
        if std::fs::write(&dest, &bytes).is_ok() {
            original_path = Some(dest.to_string_lossy().to_string());
        }
    }

    if std::fs::write(&output_path, &bytes).is_err() {
        return Value::Null;
    }

    // Dimensions are unchanged on this path (no crop/resize) -> source size.
    let width = state
        .get("originalWidth")
        .and_then(|v| v.as_u64())
        .or_else(|| image_dimensions(&bytes).map(|(w, _)| w as u64))
        .unwrap_or(0);
    let height = state
        .get("originalHeight")
        .and_then(|v| v.as_u64())
        .or_else(|| image_dimensions(&bytes).map(|(_, h)| h as u64))
        .unwrap_or(0);

    // Clear dirty flag and persist (Electron: activeEdit.isDirty = false).
    state.insert("isDirty".to_string(), Value::Bool(false));
    write_state(app, &Value::Object(state));

    let result = json!({
        "success": true,
        "outputPath": output_path,
        "originalPath": original_path,
        "size": bytes.len(),
        "width": width,
        "height": height
    });

    // Electron emitted 'imageSaved' with the SaveResult.
    crate::native_ops::emit_event(app, "imageSaved", &result);

    result
}

/// Route an `editor:*` channel. Args are the positional JSON array the renderer
/// sent (args.get(0) is the first argument). Unknown channels return Value::Null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "editor:getState" => get_state(app),
        "editor:open" => open_image(app, args),
        "editor:close" => close_editor(app),
        "editor:save" => save(app, args),
        // No `editor:export` handler exists in GalleryEditor.ts (or
        // TextCodeEditor.ts) — nothing to mirror; degrade honestly.
        "editor:export" => json!({ "success": false, "error": "not ported (needs native runtime)" }),
        _ => Value::Null,
    }
}
