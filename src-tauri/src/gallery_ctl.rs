// =============================================================================
// DEX Tauri — Gallery subsystem (port of the data/read channels in
// src/main/core/GalleryViewer.ts).
//
// Pure-data, JSON-backed tier. Electron's GalleryViewer persisted its in-memory
// Maps to <userData>/gallery/gallery-data.json as { images: GalleryImage[],
// folders: GalleryFolder[] }. Per the migration plan this lands as an fs-json
// store named `gallery-state.json` under <appData>, keeping the SAME top-level
// key wrappers ("images" / "folders") so the persisted shape is unchanged. Read
// channels return the exact GalleryImage shape the renderer already consumes.
//
// PORTED (read-only data):
//   - gallery:getImages   (filter?) -> GalleryImage[]   (filtered + sorted)
//   - gallery:getImage    (imageId) -> GalleryImage | null
//   - gallery:getMetadata (imageId) -> ImageMetadata | null  (the `metadata`
//                          object embedded in the matching GalleryImage; Electron
//                          stored EXIF/format metadata inline on each image, so
//                          reading it needs no native runtime)
//
// NOW IMPLEMENTED NATIVELY (the four heavy channel groups):
//   - upload   -> gallery:openFolder / addFolder / loadImage. Real fs walk
//                 (std::fs::read_dir, one level — Electron's loadImagesFromFolder
//                 was non-recursive), header-parse dimension probe (PNG/GIF/BMP/
//                 WEBP/JPEG bytes off disk, no decode dep; replaces nativeImage
//                 .getSize), dedupe-by-path, persist to gallery-state.json, and
//                 emit folderOpened / folderAdded.
//   - delete   -> gallery:removeFolder. Drops the folder and every image under
//                 its path, persists, emits folderRemoved.
//   - edit     -> gallery:updateMetadata / setRating / toggleFavorite / addTags.
//                 Mutates the matching image, persists, emits imageUpdated.
//   - organize -> gallery:setSort / setFilter / clearFilter / select / selectAll
//                 / clearSelection / navigate / goTo / focus / setView (+ the
//                 getSelection / getView reads). The Electron singleton held this
//                 view state in memory; here it is persisted into the SAME state
//                 file under additive keys (sort / filter / selection / view /
//                 focusedIndex) so the stateless dispatch behaves like a living
//                 viewer across calls. Selection / navigation index math resolves
//                 against the filtered+sorted list, matching getImages.
//
// STILL DEGRADED (genuinely need a native raster runtime, not faked): the
//   thumbnail / full-image channels (gallery:getThumbnail / generateThumbnail /
//   getFullImage) require a real JPEG decode+resize+encode the no-dep tier can't
//   do, so they fall through to Value::Null. No implemented channel is faked;
//   any gallery channel this module does not handle returns Value::Null.
//
// DIVERGENCES (documented):
//   - The Electron handler returns images filtered by the request filter OR, when
//     no filter is passed, by the viewer's persisted `this.filter`, then sorted
//     by the persisted `this.sort`. The Tauri dispatch is stateless (no live
//     singleton), so getImages applies ONLY the per-call filter argument and the
//     viewer's DEFAULT sort ({ field: "date", direction: "desc" }), matching a
//     fresh viewer. (The persisted view sort/filter is now applied by the
//     organize channels' own list builder, organize_image_list, not by getImages.)
//   - Sort stability: Electron used Array.prototype.sort (stable). Rust's
//     sort_by is also stable, so equal-key ordering matches insertion order
//     exactly as in Electron.
//   - localeCompare: name/type sorts use a plain byte/str Ord here rather than
//     ICU locale collation. For ASCII filenames (the overwhelming common case)
//     the order is identical; this is the same simplification used elsewhere in
//     the Tauri port and only the default date sort is reachable by default.
// =============================================================================

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::Manager;

const STATE_FILE: &str = "gallery-state.json";

// Image extensions whose dimensions can be probed from the header (parity with
// GalleryViewer's IMAGE_EXTENSIONS that fed nativeImage); design/raw files were
// loaded by Electron WITHOUT dimensions, so they are still accepted on import
// but get no width/height (matching the TS `if (IMAGE_EXTENSIONS.has(ext))` gate).
const IMAGE_EXTS: &[&str] = &[
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".tiff", ".tif",
    ".ico", ".heic", ".heif", ".avif", ".raw", ".cr2", ".nef", ".arw", ".dng",
];
const DESIGN_EXTS: &[&str] = &[".psd", ".ai", ".sketch", ".fig", ".xd"];

fn ext_in(set: &[&str], ext: &str) -> bool {
    set.iter().any(|e| *e == ext)
}

// --- file IO (mirrors analytics.rs store_path/read_file) --------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_state(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app, STATE_FILE)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn read_images(app: &tauri::AppHandle) -> Vec<Value> {
    read_state(app)
        .get("images")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

fn read_folders(app: &tauri::AppHandle) -> Vec<Value> {
    read_state(app)
        .get("folders")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

/// Persist the full state object back to disk, preserving every existing
/// top-level key (images / folders / view state) and overwriting only the keys
/// the caller supplies. Mirrors GalleryViewer.saveGalleryData's pretty JSON,
/// extended to also round-trip the live view state the singleton used to hold
/// in memory (sort / filter / selection / view / focusedIndex).
fn write_state(app: &tauri::AppHandle, patch: &[(&str, Value)]) -> bool {
    let mut state = match read_state(app) {
        Value::Object(m) => Value::Object(m),
        _ => json!({}),
    };
    if let Some(obj) = state.as_object_mut() {
        for (k, v) in patch {
            obj.insert((*k).to_string(), v.clone());
        }
    }
    match serde_json::to_string_pretty(&state) {
        Ok(raw) => std::fs::write(store_path(app, STATE_FILE), raw).is_ok(),
        Err(_) => false,
    }
}

// --- timestamps / ids -------------------------------------------------------

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- native image dimension probe (replaces Electron nativeImage.getSize) ---
//
// Electron read width/height through nativeImage (a decode). We avoid a decode
// dependency by parsing the dimensions straight out of the file header for the
// common raster formats — real bytes off disk, no faking. Formats we cannot
// parse header-only (RAW/HEIC/AVIF/SVG/ICO/TIFF) return None, exactly as
// nativeImage returned an empty image (-> no width/height) for unsupported
// inputs, so the persisted record matches Electron's "dimensions stay unset".

fn read_prefix(path: &Path, n: usize) -> Option<Vec<u8>> {
    use std::io::Read;
    let f = std::fs::File::open(path).ok()?;
    let mut buf = Vec::with_capacity(n.min(64 * 1024));
    // read_to_end on a take()-limited reader fills as much as is available up to
    // n bytes, looping over short reads (a single read() may return fewer bytes).
    f.take(n as u64).read_to_end(&mut buf).ok()?;
    Some(buf)
}

fn be16(b: &[u8], i: usize) -> u32 {
    ((b[i] as u32) << 8) | (b[i + 1] as u32)
}
fn be32(b: &[u8], i: usize) -> u32 {
    ((b[i] as u32) << 24) | ((b[i + 1] as u32) << 16) | ((b[i + 2] as u32) << 8) | (b[i + 3] as u32)
}
fn le16(b: &[u8], i: usize) -> u32 {
    ((b[i + 1] as u32) << 8) | (b[i] as u32)
}
fn le32(b: &[u8], i: usize) -> i32 {
    (((b[i + 3] as u32) << 24) | ((b[i + 2] as u32) << 16) | ((b[i + 1] as u32) << 8) | (b[i] as u32)) as i32
}

fn probe_dimensions(path: &Path) -> Option<(i64, i64)> {
    let head = read_prefix(path, 64)?;
    // PNG: 8-byte sig, then IHDR with width@16 height@20 (big-endian).
    if head.len() >= 24 && &head[0..8] == b"\x89PNG\r\n\x1a\n" {
        let w = be32(&head, 16) as i64;
        let h = be32(&head, 20) as i64;
        if w > 0 && h > 0 {
            return Some((w, h));
        }
    }
    // GIF: "GIF87a"/"GIF89a", width@6 height@8 (little-endian u16).
    if head.len() >= 10 && (&head[0..6] == b"GIF87a" || &head[0..6] == b"GIF89a") {
        return Some((le16(&head, 6) as i64, le16(&head, 8) as i64));
    }
    // BMP: "BM", DIB header width@18 height@22 (signed little-endian i32; height
    // is negative for top-down rasters, so take the absolute value).
    if head.len() >= 26 && &head[0..2] == b"BM" {
        let w = le32(&head, 18) as i64;
        let h = (le32(&head, 22) as i64).abs();
        if w > 0 && h > 0 {
            return Some((w, h));
        }
    }
    // WEBP (RIFF....WEBP). VP8 / VP8L / VP8X sub-chunks carry the size.
    if head.len() >= 30 && &head[0..4] == b"RIFF" && &head[8..12] == b"WEBP" {
        let fourcc = &head[12..16];
        if fourcc == b"VP8 " && head.len() >= 30 {
            // lossy: 0x9d012a marker, then 14-bit width/height at offset 26/28.
            let w = (le16(&head, 26) & 0x3fff) as i64;
            let h = (le16(&head, 28) & 0x3fff) as i64;
            if w > 0 && h > 0 {
                return Some((w, h));
            }
        } else if fourcc == b"VP8L" && head.len() >= 25 {
            // lossless: 1 signature byte then 14+14 bits packed (LE bitstream).
            let b = &head[21..25];
            let bits = (b[0] as u32) | ((b[1] as u32) << 8) | ((b[2] as u32) << 16) | ((b[3] as u32) << 24);
            let w = ((bits & 0x3fff) + 1) as i64;
            let h = (((bits >> 14) & 0x3fff) + 1) as i64;
            return Some((w, h));
        } else if fourcc == b"VP8X" && head.len() >= 30 {
            // extended: 24-bit (width-1) @24, (height-1) @27, little-endian.
            let w = ((head[24] as i64) | ((head[25] as i64) << 8) | ((head[26] as i64) << 16)) + 1;
            let h = ((head[27] as i64) | ((head[28] as i64) << 8) | ((head[29] as i64) << 16)) + 1;
            return Some((w, h));
        }
    }
    // JPEG: scan the segment markers for a Start-Of-Frame (SOFn) chunk; height is
    // at +5, width at +7 (big-endian) relative to the marker. Needs the whole
    // file walked up to the SOF, so read a generous window.
    if head.len() >= 3 && head[0] == 0xFF && head[1] == 0xD8 {
        if let Some(buf) = read_prefix(path, 1 << 20) {
            let mut i = 2usize;
            while i + 9 < buf.len() {
                if buf[i] != 0xFF {
                    i += 1;
                    continue;
                }
                let marker = buf[i + 1];
                // Standalone markers (RSTn, SOI, EOI, TEM) carry no length.
                if marker == 0xD8 || marker == 0xD9 || (0xD0..=0xD7).contains(&marker) || marker == 0x01 {
                    i += 2;
                    continue;
                }
                let len = be16(&buf, i + 2) as usize;
                // SOF0..SOF15 except the DHT/DAC/RSTn-coded ones (0xC4/0xC8/0xCC).
                if (0xC0..=0xCF).contains(&marker)
                    && marker != 0xC4
                    && marker != 0xC8
                    && marker != 0xCC
                    && i + 9 < buf.len()
                {
                    let h = be16(&buf, i + 5) as i64;
                    let w = be16(&buf, i + 7) as i64;
                    if w > 0 && h > 0 {
                        return Some((w, h));
                    }
                }
                if len < 2 {
                    break;
                }
                i += 2 + len;
            }
        }
    }
    None
}

// --- GalleryImage field accessors -------------------------------------------

fn id_of(img: &Value) -> &str {
    img.get("id").and_then(|v| v.as_str()).unwrap_or("")
}
fn path_of(img: &Value) -> &str {
    img.get("path").and_then(|v| v.as_str()).unwrap_or("")
}
fn filename_of(img: &Value) -> &str {
    img.get("filename").and_then(|v| v.as_str()).unwrap_or("")
}
fn extension_of(img: &Value) -> &str {
    img.get("extension").and_then(|v| v.as_str()).unwrap_or("")
}
fn size_of(img: &Value) -> i64 {
    img.get("size").and_then(|v| v.as_i64()).unwrap_or(0)
}
fn created_at(img: &Value) -> i64 {
    img.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0)
}
fn favorite_of(img: &Value) -> Option<bool> {
    img.get("favorite").and_then(|v| v.as_bool())
}
fn width_of(img: &Value) -> Option<i64> {
    img.get("width").and_then(|v| v.as_i64())
}
fn height_of(img: &Value) -> Option<i64> {
    img.get("height").and_then(|v| v.as_i64())
}
fn tags_of(img: &Value) -> Vec<String> {
    img.get("tags")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|t| t.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

// --- filtering (mirrors GalleryViewer.applyFilter) --------------------------

fn passes_filter(img: &Value, filter: &Value) -> bool {
    // folder
    if let Some(folder) = filter.get("folder").and_then(|v| v.as_str()) {
        if !path_of(img).starts_with(folder) {
            return false;
        }
    }
    // tags (any-of)
    if let Some(tags) = filter.get("tags").and_then(|v| v.as_array()) {
        if !tags.is_empty() {
            let img_tags = tags_of(img);
            let any = tags
                .iter()
                .filter_map(|t| t.as_str())
                .any(|t| img_tags.iter().any(|it| it == t));
            if !any {
                return false;
            }
        }
    }
    // favorite (only when defined)
    if let Some(fav) = filter.get("favorite").and_then(|v| v.as_bool()) {
        if favorite_of(img).unwrap_or(false) != fav {
            return false;
        }
    }
    // rating (>=)
    if let Some(rating) = filter.get("rating").and_then(|v| v.as_f64()) {
        let r = img.get("rating").and_then(|v| v.as_f64());
        match r {
            Some(rv) if rv >= rating => {}
            _ => return false,
        }
    }
    // date range (against createdAt)
    if let Some(dr) = filter.get("dateRange") {
        let start = dr.get("start").and_then(|v| v.as_i64()).unwrap_or(i64::MIN);
        let end = dr.get("end").and_then(|v| v.as_i64()).unwrap_or(i64::MAX);
        let c = created_at(img);
        if c < start || c > end {
            return false;
        }
    }
    // size range (min/max are optional and truthy-gated, mirroring JS `&&`)
    if let Some(sr) = filter.get("sizeRange") {
        if let Some(min) = sr.get("min").and_then(|v| v.as_i64()).filter(|n| *n != 0) {
            if size_of(img) < min {
                return false;
            }
        }
        if let Some(max) = sr.get("max").and_then(|v| v.as_i64()).filter(|n| *n != 0) {
            if size_of(img) > max {
                return false;
            }
        }
    }
    // dimensions
    if let Some(d) = filter.get("dimensions") {
        let w = width_of(img);
        let h = height_of(img);
        if let Some(min_w) = d.get("minWidth").and_then(|v| v.as_i64()).filter(|n| *n != 0) {
            match w {
                Some(wv) if wv >= min_w => {}
                _ => return false,
            }
        }
        if let Some(min_h) = d.get("minHeight").and_then(|v| v.as_i64()).filter(|n| *n != 0) {
            match h {
                Some(hv) if hv >= min_h => {}
                _ => return false,
            }
        }
        if let Some(max_w) = d.get("maxWidth").and_then(|v| v.as_i64()).filter(|n| *n != 0) {
            if let Some(wv) = w {
                if wv > max_w {
                    return false;
                }
            }
        }
        if let Some(max_h) = d.get("maxHeight").and_then(|v| v.as_i64()).filter(|n| *n != 0) {
            if let Some(hv) = h {
                if hv > max_h {
                    return false;
                }
            }
        }
    }
    // search (filename or tags, case-insensitive)
    if let Some(search) = filter.get("search").and_then(|v| v.as_str()) {
        if !search.is_empty() {
            let needle = search.to_lowercase();
            let in_name = filename_of(img).to_lowercase().contains(&needle);
            let in_tags = tags_of(img).iter().any(|t| t.to_lowercase().contains(&needle));
            if !in_name && !in_tags {
                return false;
            }
        }
    }
    // extensions (exact membership)
    if let Some(exts) = filter.get("extensions").and_then(|v| v.as_array()) {
        if !exts.is_empty() {
            let ext = extension_of(img);
            let member = exts.iter().filter_map(|e| e.as_str()).any(|e| e == ext);
            if !member {
                return false;
            }
        }
    }
    true
}

// A filter object with no recognized keys is treated as "no filter" upstream;
// here an empty/absent object simply passes everything (passes_filter is all-true).
fn filter_is_active(filter: &Value) -> bool {
    filter
        .as_object()
        .map(|o| !o.is_empty())
        .unwrap_or(false)
}

// --- sorting (default viewer sort: date desc) -------------------------------

fn apply_default_sort(images: &mut [Value]) {
    // GalleryViewer default sort = { field: 'date', direction: 'desc' }.
    // multiplier for desc is -1; comparison = a.createdAt - b.createdAt.
    // desc => larger createdAt first. Stable sort preserves Electron ordering.
    images.sort_by(|a, b| created_at(b).cmp(&created_at(a)));
}

// gallery:getImages(filter?)
fn get_images(app: &tauri::AppHandle, filter: &Value) -> Vec<Value> {
    let mut images = read_images(app);
    if filter_is_active(filter) {
        images.retain(|img| passes_filter(img, filter));
    }
    apply_default_sort(&mut images);
    images
}

// gallery:getImage(imageId)
fn get_image(app: &tauri::AppHandle, image_id: &str) -> Value {
    read_images(app)
        .into_iter()
        .find(|img| id_of(img) == image_id)
        .unwrap_or(Value::Null)
}

// gallery:getMetadata(imageId) -> the GalleryImage.metadata object, or null.
fn get_metadata(app: &tauri::AppHandle, image_id: &str) -> Value {
    read_images(app)
        .into_iter()
        .find(|img| id_of(img) == image_id)
        .and_then(|img| img.get("metadata").cloned())
        .unwrap_or(Value::Null)
}

// =============================================================================
// UPLOAD — folder/image import (port of gallery:openFolder/addFolder/loadImage)
// =============================================================================

fn lower_ext_of(name: &str) -> String {
    match name.rfind('.') {
        Some(i) => name[i..].to_lowercase(),
        None => String::new(),
    }
}

fn basename(p: &str) -> String {
    let trimmed = p.trim_end_matches(['/', '\\']);
    trimmed
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(trimmed)
        .to_string()
}

fn file_times(meta: &std::fs::Metadata) -> (i64, i64) {
    let to_ms = |t: std::io::Result<std::time::SystemTime>| -> i64 {
        t.ok()
            .and_then(|st| st.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0)
    };
    // created (birthtime) then modified; birthtime may be unsupported -> 0.
    (to_ms(meta.created()), to_ms(meta.modified()))
}

/// Build a GalleryImage record from a path on disk, matching loadImage's shape
/// exactly (id/path/filename/extension/size/createdAt/modifiedAt/addedAt/
/// metadata/tags/favorite, plus width/height/aspectRatio when probable).
fn build_image_record(path: &Path) -> Option<Value> {
    let meta = std::fs::metadata(path).ok()?;
    if !meta.is_file() {
        return None;
    }
    let abs = path.to_string_lossy().to_string();
    let filename = basename(&abs);
    let ext = lower_ext_of(&filename);
    let (created, modified) = file_times(&meta);
    let mut rec = json!({
        "id": crate::util::pseudo_uuid_v4(),
        "path": abs,
        "filename": filename,
        "extension": ext,
        "size": meta.len() as i64,
        "createdAt": created,
        "modifiedAt": modified,
        "addedAt": now_ms(),
        "metadata": {},
        "tags": [],
        "favorite": false,
    });
    if ext_in(IMAGE_EXTS, &ext) {
        if let Some((w, h)) = probe_dimensions(path) {
            if let Some(o) = rec.as_object_mut() {
                o.insert("width".into(), json!(w));
                o.insert("height".into(), json!(h));
                if h != 0 {
                    o.insert("aspectRatio".into(), json!(w as f64 / h as f64));
                }
            }
        }
    }
    Some(rec)
}

// gallery:loadImage(filePath) -> GalleryImage | null
// Dedupe by path (findImageByPath); a re-load of a known path returns the
// existing record unchanged, exactly like the Electron handler.
fn load_image(app: &tauri::AppHandle, file_path: &str) -> Value {
    if file_path.is_empty() {
        return Value::Null;
    }
    let mut images = read_images(app);
    if let Some(found) = images.iter().find(|i| path_of(i) == file_path).cloned() {
        return found;
    }
    match build_image_record(Path::new(file_path)) {
        Some(rec) => {
            images.push(rec.clone());
            write_state(app, &[("images", json!(images))]);
            rec
        }
        None => Value::Null,
    }
}

// gallery:openFolder(folderPath) -> GalleryImage[]
// Reads one directory level (Electron's loadImagesFromFolder was non-recursive),
// loads every image/design file, persists new records, returns them.
fn open_folder(app: &tauri::AppHandle, folder_path: &str) -> Value {
    let dir = Path::new(folder_path);
    match std::fs::metadata(dir) {
        Ok(m) if m.is_dir() => {}
        _ => return json!([]),
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return json!([]),
    };
    let mut images = read_images(app);
    let mut opened: Vec<Value> = Vec::new();
    let mut dirty = false;
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let ext = lower_ext_of(&name);
        if !ext_in(IMAGE_EXTS, &ext) && !ext_in(DESIGN_EXTS, &ext) {
            continue;
        }
        let abs = p.to_string_lossy().to_string();
        if let Some(existing) = images.iter().find(|i| path_of(i) == abs).cloned() {
            opened.push(existing);
            continue;
        }
        if let Some(rec) = build_image_record(&p) {
            images.push(rec.clone());
            opened.push(rec);
            dirty = true;
        }
    }
    if dirty {
        write_state(app, &[("images", json!(images))]);
    }
    crate::native_ops::emit_event(
        app,
        "gallery:folderOpened",
        &json!({ "path": folder_path, "count": opened.len() }),
    );
    json!(opened)
}

// gallery:addFolder(folderPath) -> GalleryFolder | null
fn add_folder(app: &tauri::AppHandle, folder_path: &str) -> Value {
    let dir = Path::new(folder_path);
    match std::fs::metadata(dir) {
        Ok(m) if m.is_dir() => {}
        _ => return Value::Null,
    }
    let mut folders = read_folders(app);
    if let Some(existing) = folders
        .iter()
        .find(|f| f.get("path").and_then(|v| v.as_str()) == Some(folder_path))
        .cloned()
    {
        return existing;
    }
    let (mut image_count, mut subfolder_count) = (0i64, 0i64);
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            match entry.file_type() {
                Ok(ft) if ft.is_dir() => subfolder_count += 1,
                Ok(ft) if ft.is_file() => {
                    let ext = lower_ext_of(&entry.file_name().to_string_lossy());
                    if ext_in(IMAGE_EXTS, &ext) {
                        image_count += 1;
                    }
                }
                _ => {}
            }
        }
    }
    let folder = json!({
        "id": crate::util::pseudo_uuid_v4(),
        "path": folder_path,
        "name": basename(folder_path),
        "imageCount": image_count,
        "subfolderCount": subfolder_count,
        "addedAt": now_ms(),
    });
    folders.push(folder.clone());
    write_state(app, &[("folders", json!(folders))]);
    crate::native_ops::emit_event(app, "gallery:folderAdded", &folder);
    folder
}

// =============================================================================
// DELETE — gallery:removeFolder(folderId) -> bool
// Removes the folder and every image whose path is under it, then persists.
// =============================================================================

fn remove_folder(app: &tauri::AppHandle, folder_id: &str) -> Value {
    let mut folders = read_folders(app);
    let folder = match folders
        .iter()
        .find(|f| f.get("id").and_then(|v| v.as_str()) == Some(folder_id))
        .cloned()
    {
        Some(f) => f,
        None => return json!(false),
    };
    let folder_path = folder.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let mut images = read_images(app);
    images.retain(|img| !path_of(img).starts_with(&folder_path));
    folders.retain(|f| f.get("id").and_then(|v| v.as_str()) != Some(folder_id));
    write_state(app, &[("images", json!(images)), ("folders", json!(folders))]);
    crate::native_ops::emit_event(app, "gallery:folderRemoved", &json!(folder_id));
    json!(true)
}

// =============================================================================
// EDIT — metadata mutations (updateMetadata/setRating/toggleFavorite/addTags)
// Each mutates the matching image in `images`, persists, emits imageUpdated.
// =============================================================================

/// Find the index of an image by id, returning None if absent.
fn index_of(images: &[Value], id: &str) -> Option<usize> {
    images.iter().position(|i| id_of(i) == id)
}

fn persist_and_emit_update(app: &tauri::AppHandle, images: Vec<Value>, idx: usize) -> Value {
    let updated = images[idx].clone();
    write_state(app, &[("images", json!(images))]);
    crate::native_ops::emit_event(app, "gallery:imageUpdated", &updated);
    updated
}

// gallery:updateMetadata(imageId, updates) -> GalleryImage | null
// Only tags / rating / favorite are applied (the allow-list from the TS).
fn update_metadata(app: &tauri::AppHandle, image_id: &str, updates: &Value) -> Value {
    let mut images = read_images(app);
    let idx = match index_of(&images, image_id) {
        Some(i) => i,
        None => return Value::Null,
    };
    if let Some(obj) = images[idx].as_object_mut() {
        if let Some(tags) = updates.get("tags") {
            if tags.is_array() {
                obj.insert("tags".into(), tags.clone());
            }
        }
        if let Some(rating) = updates.get("rating") {
            if !rating.is_null() {
                obj.insert("rating".into(), rating.clone());
            }
        }
        if let Some(fav) = updates.get("favorite") {
            if !fav.is_null() {
                obj.insert("favorite".into(), fav.clone());
            }
        }
    }
    persist_and_emit_update(app, images, idx)
}

// gallery:setRating(imageId, rating) -> bool (clamped 0..5)
fn set_rating(app: &tauri::AppHandle, image_id: &str, rating: f64) -> Value {
    let mut images = read_images(app);
    let idx = match index_of(&images, image_id) {
        Some(i) => i,
        None => return json!(false),
    };
    let clamped = rating.max(0.0).min(5.0);
    if let Some(obj) = images[idx].as_object_mut() {
        // Electron stored the raw (possibly fractional) clamped number.
        obj.insert("rating".into(), json!(clamped));
    }
    persist_and_emit_update(app, images, idx);
    json!(true)
}

// gallery:toggleFavorite(imageId) -> bool (the new favorite state)
fn toggle_favorite(app: &tauri::AppHandle, image_id: &str) -> Value {
    let mut images = read_images(app);
    let idx = match index_of(&images, image_id) {
        Some(i) => i,
        None => return json!(false),
    };
    let new_fav = !favorite_of(&images[idx]).unwrap_or(false);
    if let Some(obj) = images[idx].as_object_mut() {
        obj.insert("favorite".into(), json!(new_fav));
    }
    persist_and_emit_update(app, images, idx);
    json!(new_fav)
}

// gallery:addTags(imageId, tags) -> string[] (the image's full tag list)
fn add_tags(app: &tauri::AppHandle, image_id: &str, tags: &Value) -> Value {
    let mut images = read_images(app);
    let idx = match index_of(&images, image_id) {
        Some(i) => i,
        None => return json!([]),
    };
    let incoming: Vec<String> = tags
        .as_array()
        .map(|a| a.iter().filter_map(|t| t.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let mut current = tags_of(&images[idx]);
    for t in incoming {
        if !current.contains(&t) {
            current.push(t);
        }
    }
    if let Some(obj) = images[idx].as_object_mut() {
        obj.insert("tags".into(), json!(current.clone()));
    }
    persist_and_emit_update(app, images, idx);
    json!(current)
}

// =============================================================================
// ORGANIZE — view state (setSort/setFilter/clearFilter/select*/navigate/goTo/
// focus/setView). The Electron singleton held this in memory; here it is
// persisted into the SAME state file under additive keys so it survives the
// stateless dispatch. Selection / navigation resolve against the live filtered
// + sorted image list (organize_image_list) so indices and ranges match.
// =============================================================================

fn state_sort(app: &tauri::AppHandle) -> Value {
    read_state(app)
        .get("sort")
        .cloned()
        .filter(|v| v.is_object())
        .unwrap_or_else(|| json!({ "field": "date", "direction": "desc" }))
}

fn state_filter(app: &tauri::AppHandle) -> Value {
    read_state(app).get("filter").cloned().unwrap_or_else(|| json!({}))
}

fn state_selection(app: &tauri::AppHandle) -> Value {
    read_state(app)
        .get("selection")
        .cloned()
        .filter(|v| v.is_object())
        .unwrap_or_else(|| json!({ "images": [] }))
}

fn state_focused_index(app: &tauri::AppHandle) -> i64 {
    read_state(app)
        .get("focusedIndex")
        .and_then(|v| v.as_i64())
        .unwrap_or(-1)
}

fn loop_navigation_default() -> bool {
    // GalleryConfig.loopNavigation default = true (config persistence is the
    // separate gallery:config channel set, out of scope for organize).
    true
}

fn sort_images_by(images: &mut [Value], sort: &Value) {
    let field = sort.get("field").and_then(|v| v.as_str()).unwrap_or("date");
    let asc = sort.get("direction").and_then(|v| v.as_str()) == Some("asc");
    images.sort_by(|a, b| {
        let ord = match field {
            "name" => filename_of(a).cmp(filename_of(b)),
            "size" => size_of(a).cmp(&size_of(b)),
            "type" => extension_of(a).cmp(extension_of(b)),
            "rating" => {
                let ra = a.get("rating").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let rb = b.get("rating").and_then(|v| v.as_f64()).unwrap_or(0.0);
                ra.partial_cmp(&rb).unwrap_or(std::cmp::Ordering::Equal)
            }
            _ => created_at(a).cmp(&created_at(b)), // "date"
        };
        if asc {
            ord
        } else {
            ord.reverse()
        }
    });
}

/// The image list as the live view would present it: persisted filter applied
/// (or none if empty), then persisted sort. Mirrors getImages() with the live
/// singleton state, used by selection/navigation index math.
fn organize_image_list(app: &tauri::AppHandle) -> Vec<Value> {
    let mut images = read_images(app);
    let filter = state_filter(app);
    if filter_is_active(&filter) {
        images.retain(|img| passes_filter(img, &filter));
    }
    sort_images_by(&mut images, &state_sort(app));
    images
}

fn set_sort(app: &tauri::AppHandle, sort: &Value) -> Value {
    write_state(app, &[("sort", sort.clone())]);
    crate::native_ops::emit_event(app, "gallery:sortChanged", sort);
    sort.clone()
}

fn set_filter(app: &tauri::AppHandle, filter: &Value) -> Value {
    write_state(app, &[("filter", filter.clone())]);
    crate::native_ops::emit_event(app, "gallery:filterChanged", filter);
    filter.clone()
}

fn clear_filter(app: &tauri::AppHandle) {
    write_state(app, &[("filter", json!({}))]);
    crate::native_ops::emit_event(app, "gallery:filterChanged", &json!({}));
}

fn save_selection(app: &tauri::AppHandle, selection: &Value) -> Value {
    write_state(app, &[("selection", selection.clone())]);
    crate::native_ops::emit_event(app, "gallery:selectionChanged", selection);
    selection.clone()
}

// gallery:select(imageId, extend?, range?) -> GallerySelection
fn select_image(app: &tauri::AppHandle, image_id: &str, extend: bool, range: bool) -> Value {
    let images = organize_image_list(app);
    let mut selection = state_selection(app);
    let index = match images.iter().position(|i| id_of(i) == image_id) {
        Some(i) => i,
        None => return selection,
    };
    let anchor = selection.get("anchor").and_then(|v| v.as_str()).map(String::from);
    let mut sel_ids: Vec<String> = selection
        .get("images")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|t| t.as_str().map(String::from)).collect())
        .unwrap_or_default();

    if range && anchor.is_some() {
        if let Some(ai) = images.iter().position(|i| Some(id_of(i)) == anchor.as_deref()) {
            let (start, end) = (ai.min(index), ai.max(index));
            sel_ids = images[start..=end].iter().map(|i| id_of(i).to_string()).collect();
        }
    } else if extend {
        if let Some(pos) = sel_ids.iter().position(|s| s == image_id) {
            sel_ids.remove(pos);
        } else {
            sel_ids.push(image_id.to_string());
        }
        if let Some(o) = selection.as_object_mut() {
            o.insert("anchor".into(), json!(image_id));
        }
    } else {
        sel_ids = vec![image_id.to_string()];
        if let Some(o) = selection.as_object_mut() {
            o.insert("anchor".into(), json!(image_id));
        }
    }
    if let Some(o) = selection.as_object_mut() {
        o.insert("images".into(), json!(sel_ids));
        o.insert("lastSelected".into(), json!(image_id));
    }
    save_selection(app, &selection)
}

fn select_all(app: &tauri::AppHandle) -> Value {
    let ids: Vec<String> = organize_image_list(app)
        .iter()
        .map(|i| id_of(i).to_string())
        .collect();
    let mut selection = state_selection(app);
    if let Some(o) = selection.as_object_mut() {
        o.insert("images".into(), json!(ids));
    }
    save_selection(app, &selection)
}

fn clear_selection(app: &tauri::AppHandle) -> Value {
    save_selection(app, &json!({ "images": [] }))
}

// goToIndex: bounds-check against the live list, persist focusedIndex, return
// the image (or null). Adjacent-thumbnail preloading is a thumbnail/native
// concern handled elsewhere, so it is intentionally omitted here.
fn go_to_index(app: &tauri::AppHandle, index: i64) -> Value {
    let images = organize_image_list(app);
    if index < 0 || index as usize >= images.len() {
        return Value::Null;
    }
    let image = images[index as usize].clone();
    write_state(app, &[("focusedIndex", json!(index))]);
    crate::native_ops::emit_event(
        app,
        "gallery:navigationChanged",
        &json!({ "index": index, "image": image }),
    );
    image
}

// gallery:navigate(direction) -> GalleryImage | null
fn navigate(app: &tauri::AppHandle, direction: &str) -> Value {
    let images = organize_image_list(app);
    if images.is_empty() {
        return Value::Null;
    }
    let len = images.len() as i64;
    let focused = state_focused_index(app);
    let loop_nav = loop_navigation_default();
    let new_index = match direction {
        "next" => {
            let n = focused + 1;
            if n >= len {
                if loop_nav { 0 } else { len - 1 }
            } else {
                n
            }
        }
        "previous" => {
            let n = focused - 1;
            if n < 0 {
                if loop_nav { len - 1 } else { 0 }
            } else {
                n
            }
        }
        "first" => 0,
        "last" => len - 1,
        _ => return Value::Null,
    };
    go_to_index(app, new_index)
}

// gallery:focus(imageId) -> GalleryImage | null
fn focus_image(app: &tauri::AppHandle, image_id: &str) -> Value {
    let images = organize_image_list(app);
    match images.iter().position(|i| id_of(i) == image_id) {
        Some(i) => go_to_index(app, i as i64),
        None => Value::Null,
    }
}

// gallery:setView(view) -> GalleryViewMode
fn set_view(app: &tauri::AppHandle, view: &str) -> Value {
    let previous = read_state(app)
        .get("view")
        .and_then(|v| v.as_str())
        .unwrap_or("grid")
        .to_string();
    write_state(app, &[("view", json!(view))]);
    crate::native_ops::emit_event(
        app,
        "gallery:viewChanged",
        &json!({ "previous": previous, "current": view }),
    );
    json!(view)
}

/// Route a `gallery:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The read/data channels and the heavy
/// upload/delete/edit/organize channels are all handled natively; any remaining
/// gallery channel falls through to Value::Null so the renderer degrades
/// honestly rather than receiving faked data.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "gallery:getImages" => {
            let filter = args.get(0).cloned().unwrap_or(Value::Null);
            json!(get_images(app, &filter))
        }
        "gallery:getImage" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_image(app, id)
        }
        "gallery:getMetadata" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_metadata(app, id)
        }

        // --- UPLOAD -----------------------------------------------------------
        "gallery:openFolder" => {
            let p = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            open_folder(app, p)
        }
        "gallery:addFolder" => {
            let p = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            add_folder(app, p)
        }
        "gallery:loadImage" => {
            let p = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            load_image(app, p)
        }

        // --- DELETE -----------------------------------------------------------
        "gallery:removeFolder" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            remove_folder(app, id)
        }

        // --- EDIT -------------------------------------------------------------
        "gallery:updateMetadata" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let updates = args.get(1).cloned().unwrap_or(Value::Null);
            update_metadata(app, id, &updates)
        }
        "gallery:setRating" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let rating = args.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0);
            set_rating(app, id, rating)
        }
        "gallery:toggleFavorite" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            toggle_favorite(app, id)
        }
        "gallery:addTags" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let tags = args.get(1).cloned().unwrap_or(Value::Null);
            add_tags(app, id, &tags)
        }

        // --- ORGANIZE ---------------------------------------------------------
        "gallery:setSort" => {
            let sort = args.get(0).cloned().unwrap_or(Value::Null);
            set_sort(app, &sort)
        }
        "gallery:setFilter" => {
            let filter = args.get(0).cloned().unwrap_or_else(|| json!({}));
            set_filter(app, &filter)
        }
        "gallery:clearFilter" => {
            clear_filter(app);
            Value::Null
        }
        "gallery:select" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let extend = args.get(1).and_then(|v| v.as_bool()).unwrap_or(false);
            let range = args.get(2).and_then(|v| v.as_bool()).unwrap_or(false);
            select_image(app, id, extend, range)
        }
        "gallery:selectAll" => select_all(app),
        "gallery:clearSelection" => clear_selection(app),
        "gallery:getSelection" => state_selection(app),
        "gallery:navigate" => {
            let dir = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            navigate(app, dir)
        }
        "gallery:goTo" => {
            let idx = args.get(0).and_then(|v| v.as_i64()).unwrap_or(-1);
            go_to_index(app, idx)
        }
        "gallery:focus" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            focus_image(app, id)
        }
        "gallery:setView" => {
            let view = args.get(0).and_then(|v| v.as_str()).unwrap_or("grid");
            set_view(app, view)
        }
        "gallery:getView" => json!(read_state(app)
            .get("view")
            .and_then(|v| v.as_str())
            .unwrap_or("grid")),

        _ => Value::Null,
    }
}
